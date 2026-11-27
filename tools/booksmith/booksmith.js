import { Chessground } from '../../assets/libraries/chessgroundx/chessground.js';
import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';
import { moveArrowConfig } from '../../app/assets/js/misc/arrowStyle.js';
import {
    addGames, addLine, addOpeningsFrom, bookMove, findMove, finishBook, gamePlayers, guessPlayer, indexOpenings, layerShares,
    lineMoves, maxWeight, mergeBooks, mergePosition, positionKey, readBook, readGames, removeMove, rescalePosition, setWeight,
    startFen, writeBin
} from './book.js';
import { bookPresets, buildPreset } from './presets.js';
import { readWorkspace, validateWorkspace, writeWorkspace } from './workspace.js';

const palette = ['#60aaa5', '#de8a82', '#cbb8ee', '#97c79b', '#fcb2c7', '#68b4dc', '#7890c8', '#be84ae'];
const legacyColors = new Map([
    ['#527783', '#c9822b', '#7b5ea7', '#3f8f5a', '#b5483f', '#2f6fa8', '#9a8a2b', '#8a4f76'],
    ['#87adaf', '#d3ad8a', '#afa0c2', '#9eb79f', '#cc9fa0', '#98afc8', '#c3b48f', '#baa1b5'],
    ['#87adaf', '#d39bab', '#afa0c2', '#91b9a5', '#cc9fa0', '#98afc8', '#a3a9ce', '#baa1b5']
].flatMap(colors => colors.map((color, index) => [color, palette[index]])));
const bookColor = color => legacyColors.get(color.toLowerCase()) || color;
const $ = id => document.getElementById(id);
const number = value => value.toLocaleString('en-US');
const percent = share => share >= 1 ? '100%' : share >= 0.995 ? '>99%' : share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;
const editable = target => target.closest?.('input, textarea, select, [contenteditable="true"]');

const state = {
    layers: [], mode: 'priority', active: null, orientation: 'white',
    path: [{ fen: startFen, key: positionKey(startFen) }], future: []
};
const mergeHelpText = {
    priority: 'The top visible book with moves at this position decides. Lower books only fill gaps.',
    blend: 'Combine visible books. Books higher in the stack have more influence.',
    equal: 'Combine visible books with equal influence, regardless of their order.'
};
let openings = { names: new Map(), lines: [], records: [] };
let rows = new Map();
let dragging = false;
let restoringWorkspace = false;
let addBookSession = 0;

const board = Chessground($('board').querySelector('.cg-wrap'), {
    coordinates: true, animation: { enabled: true, duration: 120 }, premovable: { enabled: false },
    drawable: { enabled: false, visible: false },
    movable: { free: false, showDests: true, events: { after: (from, to) => play(from, to) } }
});

const here = () => state.path.at(-1);
const activeLayer = () => state.layers.find(layer => layer.id === state.active);
const enabledLayers = () => state.layers.filter(layer => layer.enabled && layer.book.size);

function newLayer(name, book = new Map()) {
    const used = new Set(state.layers.map(layer => bookColor(layer.color)));
    const color = palette.find(item => !used.has(item)) || palette[state.layers.length % palette.length];
    return { id: crypto.randomUUID(), name, color, enabled: true, book };
}

function freeName(base) {
    const names = new Set(state.layers.map(layer => layer.name));
    if(!names.has(base)) return base;
    let index = 2;
    while(names.has(`${base} ${index}`)) index++;
    return `${base} ${index}`;
}

function status(text) {
    $('status').textContent = text;
    clearTimeout(status.timer);
    if(text) status.timer = setTimeout(() => { $('status').textContent = ''; }, 4000);
}

// History. A step keeps the stack order and layer settings, plus copies of only the positions it touched.
const history = { undo: [], redo: [], open: null };

function snapshot() {
    return {
        layers: state.layers.map(layer => ({ layer, name: layer.name, color: layer.color, enabled: layer.enabled })),
        mode: state.mode, active: state.active, positions: new Map()
    };
}

// Calls sharing a group, like one slider drag, stay one step until endStep().
function remember(group = null) {
    if(group && history.open?.group === group) return history.open;
    const step = Object.assign(snapshot(), { group });
    history.undo.push(step);
    if(history.undo.length > 100) history.undo.shift();
    history.redo = [];
    history.open = group ? step : null;
    return step;
}

function endStep() {
    history.open = null;
}

function tracked(layer, step = remember()) {
    const { book } = layer;
    if(!step.positions.has(layer)) step.positions.set(layer, new Map());
    const saved = step.positions.get(layer);
    const note = key => {
        if(!saved.has(key)) saved.set(key, book.has(key) ? new Map(book.get(key)) : null);
    };
    return {
        get size() { return book.size; },
        has: key => book.has(key),
        get(key) { note(key); return book.get(key); },
        set(key, value) { note(key); book.set(key, value); return this; },
        delete(key) { note(key); return book.delete(key); },
        keys: () => book.keys(), values: () => book.values(), entries: () => book.entries(),
        [Symbol.iterator]: () => book[Symbol.iterator]()
    };
}

function restore(from, to) {
    const step = from.pop();
    if(!step) return;
    endStep();
    const inverse = snapshot();
    if(step.orientation) {
        inverse.orientation = state.orientation;
        state.orientation = step.orientation;
    }
    for(const [layer, saved] of step.positions) {
        const current = new Map();
        for(const [key, moves] of saved) {
            current.set(key, layer.book.has(key) ? new Map(layer.book.get(key)) : null);
            if(moves) layer.book.set(key, new Map(moves));
            else layer.book.delete(key);
        }
        inverse.positions.set(layer, current);
    }
    to.push(inverse);
    state.layers = step.layers.map(({ layer, name, color, enabled }) => Object.assign(layer, { name, color, enabled }));
    state.mode = step.mode;
    state.active = state.layers.some(layer => layer.id === step.active) ? step.active : state.layers[0]?.id;
    document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
    refresh();
    save();
}

const undo = () => restore(history.undo, history.redo);
const redo = () => restore(history.redo, history.undo);

// Saving
let db = null;
let storageBlocked = true;
function storageError(message, error) {
    console.error('BookSmith browser storage:', error);
    $('storage-warning').textContent = message;
    $('storage-warning').hidden = false;
    $('saved-status').textContent = 'Not saved in this browser';
}
const database = new Promise((resolve, reject) => {
    try {
        const request = indexedDB.open('A.C.A.S-BookSmith', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => {
            db = request.result;
            db.onversionchange = () => {
                db.close();
                db = null;
                storageBlocked = true;
                storageError('Browser storage changed in another tab. Back up your workspace, then reload.', new Error('Storage version changed'));
            };
            resolve(db);
        };
        request.onerror = () => reject(request.error);
    } catch(error) { reject(error); }
});

async function load() {
    await database;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('state');
        const request = transaction.objectStore('state').get('stack');
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

function save() {
    clearTimeout(save.timer);
    if(storageBlocked || !db) {
        save.timer = null;
        $('saved-status').textContent = 'Not saved in this browser';
        return;
    }
    $('saved-status').textContent = 'Saving...';
    save.timer = setTimeout(write, 400);
}

function write() {
    save.timer = null;
    if(storageBlocked || !db) return void ($('saved-status').textContent = 'Not saved in this browser');
    const failed = error => storageError('Could not save your workspace. Download a backup before leaving this page.', error);
    try {
        const transaction = db.transaction('state', 'readwrite');
        transaction.objectStore('state').put({
            mode: state.mode, active: state.active, orientation: state.orientation,
            layers: state.layers.map(({ id, name, color, enabled, book }) => ({ id, name, color, enabled, book }))
        }, 'stack');
        transaction.oncomplete = () => {
            if(storageBlocked) return;
            $('storage-warning').hidden = true;
            if(!save.timer) $('saved-status').textContent = 'Saved in this browser';
        };
        transaction.onabort = () => failed(transaction.error);
        transaction.onerror = () => failed(transaction.error);
        transaction.commit?.();
    } catch(error) { failed(error); }
}

window.addEventListener('pagehide', () => {
    if(!save.timer) return;
    clearTimeout(save.timer);
    write();
});

// Board and moves
function positionMoves() {
    const { key } = here();
    const merged = mergePosition(enabledLayers(), key, state.mode);
    const layer = activeLayer();
    const own = layer?.enabled ? layer.book.get(key) : null;
    for(const code of own?.keys() || []) {
        if(!merged.some(move => move.code === code)) merged.push({ code, share: 0, parts: [] });
    }
    return merged;
}

function openingName() {
    for(let index = state.path.length - 1; index >= 0; index--) {
        const name = openings.names.get(state.path[index].key);
        if(name) return name;
    }
    return state.path.length > 1 ? '' : 'Starting position';
}

// Chessground snaps its board to whole pixels per square, so the arrow layer follows it rather than the wrapper.
function fitArrows() {
    const arrows = $('board').querySelector('.book-arrows');
    const container = $('board').querySelector('cg-container');
    if(!container) return;
    const outer = $('board').getBoundingClientRect();
    const inner = container.getBoundingClientRect();
    if(!inner.width) return;
    Object.assign(arrows.style, {
        left: `${inner.left - outer.left - $('board').clientLeft}px`, top: `${inner.top - outer.top - $('board').clientTop}px`,
        width: `${inner.width}px`, height: `${inner.height}px`
    });
}

function drawArrows(moves, chess) {
    fitArrows();
    const arrows = $('board').querySelector('.book-arrows');
    const squareCenter = square => {
        const file = square.charCodeAt(0) - 97;
        const rank = Number(square[1]) - 1;
        return state.orientation === 'white'
            ? [(file + 0.5) * 100, (7.5 - rank) * 100]
            : [(7.5 - file) * 100, (rank + 0.5) * 100];
    };
    const polygons = moves.flatMap(item => {
        if(item.share <= 0) return [];
        const legal = findMove(chess, item.code);
        if(!legal) return [];
        const lead = item.parts.slice().sort((a, b) => b.share - a.share)[0];
        const share = item.share > 0 && lead ? item.share : 0;
        const scale = 0.26 + 0.74 * Math.sqrt(share);
        const config = moveArrowConfig('book', share > 0 ? bookColor(lead.layer.color) : '#8a9aa0',
            0.3 + 0.45 * Math.sqrt(share), scale);
        const [x, y] = squareCenter(legal.from);
        const [tx, ty] = squareCenter(legal.to);
        const distance = Math.hypot(tx - x, ty - y);
        const dx = (tx - x) / distance, dy = (ty - y) / distance;
        const point = (along, across) => `${x + dx * along - dy * across},${y + dy * along + dx * across}`;
        const halfLine = config.lineWidth / 2, halfHead = config.arrowheadWidth / 2;
        const base = distance - config.arrowheadHeight;
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', [
            point(config.startOffset, -halfLine), point(base, -halfLine), point(base, -halfHead),
            point(distance, 0), point(base, halfHead), point(base, halfLine), point(config.startOffset, halfLine)
        ].join(' '));
        polygon.setAttribute('style', `${config.style}\nstroke-width: ${0.5 * scale}%;`);
        return [polygon];
    });
    arrows.replaceChildren(...polygons);
}

function drawBoard(moves) {
    const { fen, move } = here();
    const chess = new Chess(fen);
    const dests = new Map();
    for(const legal of chess.moves({ verbose: true })) dests.set(legal.from, [...(dests.get(legal.from) || []), legal.to]);
    const color = chess.turn() === 'w' ? 'white' : 'black';
    board.set({
        fen, orientation: state.orientation, turnColor: color, check: chess.in_check() ? color : undefined,
        lastMove: move ? [move.from, move.to] : undefined, movable: { color, dests }
    });
    drawArrows(moves, chess);
}

function moveRow(item, chess) {
    const legal = findMove(chess, item.code);
    const row = document.createElement('li');
    row.className = 'book-move';
    row.dataset.code = item.code;
    const follow = document.createElement('button');
    follow.type = 'button';
    follow.className = 'book-move-san';
    follow.textContent = legal?.san || item.code;
    follow.title = 'Follow';
    follow.addEventListener('click', () => legal && go(legal));
    const bar = document.createElement('span');
    bar.className = 'book-move-bar';
    const share = document.createElement('span');
    share.className = 'book-move-share';
    const weight = document.createElement('input');
    weight.type = 'range';
    weight.min = 0;
    weight.max = maxWeight;
    weight.className = 'book-move-weight';
    weight.setAttribute('aria-label', `${follow.textContent} weight`);
    weight.addEventListener('pointerdown', () => { dragging = true; });
    weight.addEventListener('input', () => {
        const layer = activeLayer();
        if(weight.disabled || !layer?.enabled) return;
        setWeight(tracked(layer, remember(`weight ${layer.id} ${here().key} ${item.code}`)), here().key, item.code, Number(weight.value));
        refresh({ keepOrder: true });
    });
    weight.addEventListener('change', () => {
        dragging = false;
        const layer = activeLayer();
        const moves = layer?.book.get(here().key);
        // A lone move always gets the whole share, so its slider settles at full.
        if(moves?.size === 1 && history.open?.group?.startsWith('weight ')) rescalePosition(moves);
        endStep();
        refresh();
        save();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'book-move-remove';
    remove.setAttribute('aria-label', `Remove ${follow.textContent}`);
    remove.title = 'Remove';
    remove.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
    remove.addEventListener('click', () => {
        const layer = activeLayer();
        const { key } = here();
        // Moves from other books are removed from the books they come from.
        const owners = layer?.book.get(key)?.has(item.code) ? [layer] : row.item.parts.map(part => part.layer);
        if(!owners.length) return;
        const step = remember();
        for(const owner of owners) {
            const book = tracked(owner, step);
            removeMove(book, key, item.code);
            rescalePosition(book.get(key));
        }
        refresh();
        save();
    });
    row.append(follow, bar, share, weight, remove);
    return row;
}

function drawMoves(moves, keepOrder) {
    const list = $('moves');
    const scroll = $('moves-scroll');
    const scrollTop = rows.key === here().key ? scroll.scrollTop : 0;
    const chess = new Chess(here().fen);
    if(rows.key !== here().key) {
        rows = new Map();
        rows.key = here().key;
    }
    const codes = moves.map(item => item.code);
    const same = codes.length === rows.size && codes.every(code => rows.has(code));
    if(!same || !keepOrder) {
        const next = new Map();
        next.key = rows.key;
        for(const code of codes) next.set(code, rows.get(code) || moveRow(moves.find(item => item.code === code), chess));
        list.replaceChildren(...next.values());
        rows = next;
    }
    const layer = activeLayer();
    const own = layer?.book.get(here().key);
    const controller = state.mode === 'priority' ? moves.find(item => item.parts.length)?.parts[0].layer : null;
    const overridden = Boolean(layer && controller && controller !== layer);
    const priorityNote = $('priority-note');
    priorityNote.hidden = !overridden;
    if(overridden) {
        const edit = $('priority-edit');
        edit.textContent = controller.name;
        edit.dataset.layer = controller.id;
        edit.title = `Select ${controller.name} to edit its weights`;
        edit.style.setProperty('--tone', bookColor(controller.color));
        $('priority-selection').textContent = ` here, not "${layer.name}". Select it to edit its weights.`;
    }
    for(const item of moves) {
        const row = rows.get(item.code);
        row.item = item;
        row.querySelector('.book-move-bar').replaceChildren(...item.parts.filter(part => part.share > 0).map(part => {
            const segment = document.createElement('span');
            segment.style.width = `${part.share * 100}%`;
            segment.style.background = bookColor(part.layer.color);
            segment.title = part.layer.name;
            return segment;
        }));
        row.querySelector('.book-move-share').textContent = percent(item.share);
        const weight = row.querySelector('.book-move-weight');
        const value = own?.get(item.code);
        // Hidden or overridden books must not look like they control the merged result.
        const lead = (value === undefined || !layer.enabled || overridden) && (item.parts.filter(part => part.share > 0)
            .sort((a, b) => b.share - a.share)[0]?.layer || item.parts[0]?.layer);
        const shown = lead ? lead.book.get(here().key)?.get(item.code) ?? 0 : layer?.enabled ? value ?? 0 : 0;
        if(!layer?.enabled || document.activeElement !== weight || !dragging) weight.value = shown;
        weight.style.setProperty('--fill', `${shown / maxWeight * 100}%`);
        weight.style.setProperty('--tone', lead || layer ? bookColor((lead || layer).color) : palette[0]);
        weight.disabled = !layer?.enabled || overridden;
        weight.title = overridden ? `Priority uses ${controller.name} here. Select it to edit its weights`
            : layer && !layer.enabled ? 'Show this book to edit its weights'
            : 'Relative weight in the selected book, not the merged percentage';
        row.classList.toggle('book-move-own', !overridden && layer?.enabled && value !== undefined);
        row.querySelector('.book-move-remove').hidden = value === undefined && !item.parts.length;
    }
    $('moves-empty').hidden = moves.length > 0;
    updateMovesOverflow();
    if(!same || !keepOrder) scroll.scrollTop = scroll.classList.contains('book-moves-overflow') ? scrollTop : 0;
    updateMovesScrollHint();
}

function updateMovesOverflow() {
    const scroll = $('moves-scroll');
    const button = $('add-lines');
    const contentHeight = $('moves').getBoundingClientRect().height + button.getBoundingClientRect().height
        + parseFloat(getComputedStyle(button).marginTop);
    const overflowing = $('moves-empty').hidden && contentHeight > scroll.clientHeight + 1;
    scroll.classList.toggle('book-moves-overflow', overflowing);
    if(!overflowing) scroll.scrollTop = 0;
    updateMovesScrollHint();
}

function updateMovesScrollHint() {
    const scroll = $('moves-scroll');
    scroll.classList.toggle('book-moves-more-below', scroll.classList.contains('book-moves-overflow')
        && $('add-lines').getBoundingClientRect().bottom > scroll.getBoundingClientRect().bottom + 1);
}

$('moves-scroll').addEventListener('scroll', updateMovesScrollHint, { passive: true });
const movesResizeObserver = new ResizeObserver(updateMovesOverflow);
for(const id of ['moves-scroll', 'moves', 'add-lines']) movesResizeObserver.observe($(id));

function drawPath() {
    const list = $('path');
    list.replaceChildren(...state.path.slice(1).map((step, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        const white = step.fen.split(' ')[1] === 'b';
        const moveNumber = Number(state.path[index].fen.split(' ')[5]);
        if(white || index === 0) {
            const label = document.createElement('span');
            label.className = 'book-path-number';
            label.textContent = white ? `${moveNumber}.` : `${moveNumber}...`;
            item.append(label);
        }
        button.textContent = step.move.san;
        if(index === state.path.length - 2) button.setAttribute('aria-current', 'step');
        button.addEventListener('click', () => jump(index + 1));
        item.append(button);
        return item;
    }));
    if(state.path.length === 1) {
        const intro = document.createElement('li');
        intro.className = 'book-path-intro';
        intro.textContent = 'Play a move on the board, or add an opening below to start your line.';
        list.append(intro);
        list.scrollTop = 0;
    }
    const current = list.querySelector('[aria-current]')?.parentElement;
    if(current && (current.offsetTop < list.scrollTop || current.offsetTop + current.offsetHeight > list.scrollTop + list.clientHeight)) {
        list.scrollTop = current.offsetTop + current.offsetHeight - list.clientHeight;
    }
}

function refresh({ keepOrder = false } = {}) {
    const description = $('book-mode-description');
    if(description.textContent !== mergeHelpText[state.mode]) description.textContent = mergeHelpText[state.mode];
    closePromotion();
    const moves = positionMoves();
    drawBoard(moves);
    drawMoves(moves, keepOrder);
    if(!keepOrder) {
        drawPath();
        $('opening-name').textContent = openingName() || '\u00a0';
        $('nav-start').disabled = $('nav-back').disabled = state.path.length < 2;
        $('nav-forward').disabled = !state.future.length && !moves.some(move => move.share > 0);
        $('add-lines').disabled = !activeLayer() || !openings.lines.some(line => line.keys.includes(here().key));
    }
    drawStack();
    workspaceActions();
}

function workspaceActions() {
    $('backup-workspace').disabled = !state.layers.length;
    $('restore-workspace').disabled = restoringWorkspace || $('import').disabled || $('presets').getAttribute('aria-busy') === 'true';
}

function go(move) {
    const chess = new Chess(here().fen);
    const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    if(!played) return;
    const fen = chess.fen();
    if(state.future[0]?.fen === fen) state.future.shift();
    else state.future = [];
    state.path.push({ fen, key: positionKey(fen), move: played });
    refresh();
}

function closePromotion() {
    $('promotion')?.remove();
}

function choosePromotion(options, to) {
    closePromotion();
    const color = options[0].color;
    const white = state.orientation === 'white';
    const column = white ? to.charCodeAt(0) - 97 : 104 - to.charCodeAt(0);
    const row = white ? 8 - Number(to[1]) : Number(to[1]) - 1;
    const overlay = document.createElement('div');
    overlay.id = 'promotion';
    overlay.className = 'book-promotion';
    overlay.addEventListener('pointerdown', event => {
        if(event.target !== overlay) return;
        closePromotion();
        refresh();
    });
    overlay.addEventListener('keydown', event => {
        if(event.key !== 'Escape') return;
        event.stopPropagation();
        closePromotion();
        refresh();
    });
    ['q', 'n', 'r', 'b'].forEach((piece, index) => {
        const legal = options.find(move => move.promotion === piece);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `book-promotion-piece ${color}${piece}`;
        button.style.left = `${column * 12.5}%`;
        button.style.top = `${(row === 0 ? index : 7 - index) * 12.5}%`;
        button.setAttribute('aria-label', { q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[piece]);
        button.addEventListener('click', () => {
            closePromotion();
            commit(legal);
        });
        overlay.append(button);
    });
    $('board').append(overlay);
    overlay.querySelector('button').focus();
}

function play(from, to) {
    const options = new Chess(here().fen).moves({ verbose: true })
        .filter(move => move.from === from && move.to === to);
    if(!options.length) return refresh();
    if(options.length > 1) return choosePromotion(options, to);
    commit(options[0]);
}

function commit(legal) {
    const layer = activeLayer();
    if(layer && !positionMoves().some(move => move.code === bookMove(legal))) {
        addLine(tracked(layer), [legal.san], { fen: here().fen });
        save();
    }
    go(legal);
}

function jump(length) {
    if(length < 1 || length >= state.path.length) return;
    state.future = [...state.path.splice(length), ...state.future];
    refresh();
}

function back() {
    jump(state.path.length - 1);
}

function forward() {
    if(state.future.length) {
        state.path.push(state.future.shift());
        return refresh();
    }
    const top = positionMoves().find(move => move.share > 0);
    const legal = top && findMove(new Chess(here().fen), top.code);
    if(legal) go(legal);
}

function toStart() {
    jump(1);
}

function toEnd() {
    if(!state.future.length) return;
    state.path.push(...state.future.splice(0));
    refresh();
}

// Stack
const layerLabel = layer => `${layer.name || 'Unnamed book'}. Drag or use up and down arrow keys to reorder`;

function drawStack() {
    const list = $('stack');
    const enabled = enabledLayers();
    const shares = layerShares(enabled, state.mode);
    const items = state.layers.map(layer => {
        let item = list.querySelector(`[data-id="${layer.id}"]`);
        if(!item) item = layerRow(layer);
        const rank = enabled.indexOf(layer);
        item.style.setProperty('--tone', bookColor(layer.color));
        item.classList.toggle('book-layer-active', layer.id === state.active);
        item.classList.toggle('book-layer-off', !layer.enabled);
        item.classList.toggle('book-layer-priority', state.mode === 'priority' && rank >= 0);
        item.setAttribute('aria-current', layer.id === state.active ? 'true' : 'false');
        item.setAttribute('aria-label', layerLabel(layer));
        item.querySelector('.book-layer-size').textContent = `(${number(layer.book.size)} ${layer.book.size === 1 ? 'position' : 'positions'})`;
        const share = rank < 0 ? '0%' : shares[rank] === null ? `#${rank + 1}` : percent(shares[rank]);
        const shareLabel = item.querySelector('.book-layer-share');
        shareLabel.textContent = share;
        shareLabel.hidden = state.mode === 'priority' && rank < 0;
        item.querySelector('.book-layer-meter').style.width = rank < 0 ? '0%' : `${(shares[rank] ?? (rank === 0 ? 1 : 0)) * 100}%`;
        const toggle = item.querySelector('.book-layer-toggle');
        toggle.innerHTML = `<i class="bi ${layer.enabled ? 'bi-eye' : 'bi-eye-slash'}" aria-hidden="true"></i>`;
        toggle.setAttribute('aria-pressed', String(layer.enabled));
        const name = item.querySelector('.book-layer-name');
        if(document.activeElement !== name) {
            name.value = layer.name;
            name.size = Math.max(1, layer.name.length);
        }
        return item;
    });
    const search = $('opening-search').closest('.book-search');
    items.splice(items.findIndex(item => item.dataset.id === state.active) + 1, 0, search);
    if(items.some((item, index) => list.children[index] !== item) || list.children.length !== items.length) list.replaceChildren(...items);
    const positions = mergedSize();
    $('export-summary').textContent = `${number(positions)} ${positions === 1 ? 'position' : 'positions'}`;
    $('export').disabled = positions === 0;
}

function mergedSize() {
    const enabled = enabledLayers();
    if(enabled.length === 1) return enabled[0].book.size;
    return new Set(enabled.flatMap(layer => [...layer.book.keys()])).size;
}

function iconButton(className, label, icon, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `book-layer-button ${className}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
    button.addEventListener('click', event => {
        event.stopPropagation();
        action();
    });
    return button;
}

function layerRow(layer) {
    const item = document.createElement('li');
    item.className = 'book-layer';
    item.dataset.id = layer.id;
    item.tabIndex = 0;
    item.addEventListener('pointerdown', event => {
        if(event.pointerType === 'touch' || !event.isPrimary || event.button !== 0
            || event.target.matches('.book-layer-name') && document.activeElement === event.target) return;
        startDrag(event, item);
    });
    item.addEventListener('touchstart', event => {
        if(event.touches.length !== 1 || event.target.matches('.book-layer-name')
            && document.activeElement === event.target) return;
        if(event.target.closest('.book-layer-color, .book-layer-share')) event.preventDefault();
        startDrag(event, item);
    }, { passive: false });
    item.addEventListener('keydown', event => {
        if(event.target !== item) return;
        if(event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select(layer);
            return;
        }
        const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if(!step) return;
        event.preventDefault();
        event.stopPropagation();
        const from = state.layers.findIndex(entry => entry.id === layer.id);
        const to = from + step;
        if(to < 0 || to >= state.layers.length) return;
        remember();
        state.layers.splice(to, 0, ...state.layers.splice(from, 1));
        refresh();
        save();
        item.focus();
        status(`Moved ${layer.name || 'book'} to position ${to + 1}`);
    });
    const body = document.createElement('span');
    body.className = 'book-layer-body';
    const name = document.createElement('input');
    name.className = 'book-layer-name';
    name.setAttribute('aria-label', 'Book name');
    name.spellcheck = false;
    name.addEventListener('input', () => {
        remember(`name ${layer.id}`);
        layer.name = name.value;
        item.setAttribute('aria-label', layerLabel(layer));
        name.size = Math.max(1, name.value.length);
        save();
    });
    name.addEventListener('focus', () => select(layer));
    name.addEventListener('blur', endStep);
    name.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === 'Escape') name.blur();
    });
    const meta = document.createElement('span');
    meta.className = 'book-layer-meta';
    meta.innerHTML = '<span class="book-layer-track"><span class="book-layer-meter"></span></span>';
    const heading = document.createElement('span');
    heading.className = 'book-layer-heading';
    const size = document.createElement('span');
    size.className = 'book-layer-size';
    heading.append(name, size);
    body.append(heading, meta);
    const color = document.createElement('span');
    color.className = 'book-layer-color';
    color.title = 'Drag to reorder';
    const share = document.createElement('span');
    share.className = 'book-layer-share';
    share.title = 'Drag to reorder';
    const actions = document.createElement('span');
    actions.className = 'book-layer-actions';
    actions.append(
        iconButton('book-layer-toggle', 'Show or hide', 'bi-eye', () => {
            remember();
            layer.enabled = !layer.enabled;
            refresh();
            save();
        }),
        iconButton('', 'Download', 'bi-download', () => download(writeBin(layer.book), layer.name)),
        iconButton('', 'Remove', 'bi-trash3', () => removeLayer(layer))
    );
    item.append(color, share, body, actions);
    item.addEventListener('click', () => select(layer));
    return item;
}

function select(layer) {
    if(state.active === layer.id) return;
    state.active = layer.id;
    refresh();
    save();
}

$('priority-edit').addEventListener('click', () => {
    const layer = state.layers.find(layer => layer.id === $('priority-edit').dataset.layer);
    if(layer) select(layer);
});

function removeLayer(layer) {
    if(layer.book.size && !confirm(`Remove ${layer.name || 'this book'}?`)) return;
    remember();
    state.layers = state.layers.filter(entry => entry !== layer);
    if(!state.layers.length) state.layers.push(newLayer('My book'));
    if(state.active === layer.id) state.active = state.layers[0].id;
    refresh();
    save();
}

function startDrag(event, item) {
    const list = $('stack');
    const touch = event.type === 'touchstart';
    const direct = touch && Boolean(event.target.closest('.book-layer-color, .book-layer-share'));
    const point = touch ? event.changedTouches[0] : event;
    const id = touch ? point.identifier : point.pointerId;
    const startedAt = performance.now();
    let active = false;
    let lastY = point.clientY;
    let direction = 0;
    const getPoint = moveEvent => touch
        ? [...moveEvent.changedTouches].find(entry => entry.identifier === id)
        : moveEvent.pointerId === id ? moveEvent : null;
    const move = moveEvent => {
        const current = getPoint(moveEvent);
        if(!current) return;
        if(!active) {
            if(Math.hypot(current.clientX - point.clientX, current.clientY - point.clientY) < 4) return;
            if(touch && !direct && performance.now() - startedAt < 180) return finish(moveEvent, true);
            active = true;
            item.classList.add('book-layer-dragging');
        }
        if(touch) moveEvent.preventDefault();
        direction = Math.sign(current.clientY - lastY) || direction;
        lastY = current.clientY;
        const rows = [...list.querySelectorAll('.book-layer')];
        const others = rows.filter(child => child !== item);
        const after = others.find(child => {
            const box = child.getBoundingClientRect();
            // Earlier swaps with separate reverse thresholds prevent jitter near a row.
            return current.clientY < box.top + box.height * (direction > 0 ? 0.25 : direction < 0 ? 0.75 : 0.5);
        });
        if(after) {
            if(item.nextElementSibling !== after) list.insertBefore(item, after);
        } else if(rows[rows.length - 1] !== item) list.append(item);
        const selected = list.querySelector('.book-layer-active');
        const search = $('opening-search').closest('.book-search');
        if(selected.nextElementSibling !== search) selected.after(search);
    };
    const finish = (endEvent, cancelled = false) => {
        if(!getPoint(endEvent)) return;
        window.removeEventListener(touch ? 'touchmove' : 'pointermove', move);
        window.removeEventListener(touch ? 'touchend' : 'pointerup', end);
        window.removeEventListener(touch ? 'touchcancel' : 'pointercancel', cancel);
        if(!active) {
            if(direct && !cancelled) item.click();
            return;
        }
        item.classList.remove('book-layer-dragging');
        if(!touch) {
            const suppressClick = click => {
                click.preventDefault();
                click.stopImmediatePropagation();
                window.removeEventListener('click', suppressClick, true);
            };
            window.addEventListener('click', suppressClick, true);
            setTimeout(() => window.removeEventListener('click', suppressClick, true), 0);
        }
        if(cancelled) return refresh();
        const order = [...list.querySelectorAll('.book-layer')].map(child => child.dataset.id);
        const changed = order.some((id, index) => state.layers[index].id !== id);
        if(changed) remember();
        state.layers.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        if(changed) save();
        refresh();
    };
    const end = endEvent => finish(endEvent);
    const cancel = endEvent => finish(endEvent, true);
    // Reordering detaches the row, so keep tracking the gesture on the window.
    window.addEventListener(touch ? 'touchmove' : 'pointermove', move, { passive: false });
    window.addEventListener(touch ? 'touchend' : 'pointerup', end);
    window.addEventListener(touch ? 'touchcancel' : 'pointercancel', cancel);
}

function download(bytes, name, extension = 'bin') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bytes], { type: extension === 'json' ? 'application/json' : 'application/octet-stream' }));
    link.download = `${(name || 'book').trim().replace(/[\\/:*?"<>|]+/g, '-') || 'book'}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Opening search
function searchOpenings() {
    const input = $('opening-search');
    const words = input.value.toLowerCase().split(/[\s,:]+/).filter(Boolean);
    const list = $('opening-results');
    if(!words.length || !openings.records.length) {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        return;
    }
    const found = [];
    for(const record of openings.records) {
        const text = `${record.eco} ${record.name} ${record.pgn}`.toLowerCase();
        if(words.every(word => text.includes(word))) found.push(record);
        if(found.length >= 40) break;
    }
    found.sort((a, b) => a.pgn.length - b.pgn.length);
    list.replaceChildren(...found.slice(0, 8).map((record, index) => {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.id = `opening-${index}`;
        item.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        item.innerHTML = '<strong></strong><small></small>';
        item.querySelector('strong').textContent = record.name;
        item.querySelector('small').textContent = record.pgn;
        item.addEventListener('pointerdown', event => event.preventDefault());
        item.addEventListener('click', () => pickOpening(record));
        item.record = record;
        return item;
    }));
    list.hidden = !found.length;
    input.setAttribute('aria-expanded', String(Boolean(found.length)));
    input.setAttribute('aria-activedescendant', found.length ? 'opening-0' : '');
}

function pickOpening(record) {
    const layer = activeLayer();
    const moves = lineMoves(record.pgn);
    if(layer) addLine(tracked(layer), moves);
    const chess = new Chess();
    state.path = [{ fen: startFen, key: positionKey(startFen) }];
    state.future = [];
    for(const san of moves) {
        const move = chess.move(san);
        if(!move) break;
        state.path.push({ fen: chess.fen(), key: positionKey(chess.fen()), move });
    }
    $('opening-search').value = '';
    searchOpenings();
    refresh();
    save();
}

$('opening-search').addEventListener('input', searchOpenings);
$('opening-search').addEventListener('blur', () => {
    $('opening-results').hidden = true;
    $('opening-search').setAttribute('aria-expanded', 'false');
});
$('opening-search').addEventListener('focus', searchOpenings);
$('opening-search').addEventListener('keydown', event => {
    const items = [...$('opening-results').children];
    if(!items.length || $('opening-results').hidden) return;
    const current = items.findIndex(item => item.getAttribute('aria-selected') === 'true');
    if(event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((item, index) => item.setAttribute('aria-selected', String(index === next)));
        $('opening-search').setAttribute('aria-activedescendant', items[next].id);
        items[next].scrollIntoView({ block: 'nearest' });
    } else if(event.key === 'Enter') {
        event.preventDefault();
        pickOpening(items[Math.max(0, current)].record);
    } else if(event.key === 'Escape') {
        $('opening-results').hidden = true;
    }
});

async function loadOpenings() {
    try {
        const response = await fetch('../../app/assets/openings/pgn.json');
        if(!response.ok) throw new Error(`Opening catalogue HTTP ${response.status}`);
        const records = await response.json();
        openings.records = records;
        for(let index = 0; index < records.length; index += 250) {
            const chunk = indexOpenings(records.slice(index, index + 250));
            for(const [key, name] of chunk.names) if(!openings.names.has(key)) openings.names.set(key, name);
            openings.lines.push(...chunk.lines);
            await new Promise(resolve => setTimeout(resolve));
        }
        if(document.activeElement === $('opening-search')) searchOpenings();
        $('preset').disabled = restoringWorkspace;
        $('preset-add').disabled = restoringWorkspace || !$('preset').value;
        refresh();
    } catch(error) {
        console.error('BookSmith could not load openings', error);
        status('Could not load the opening catalogue');
    }
}

// Controls
$('nav-start').addEventListener('click', toStart);
$('nav-back').addEventListener('click', back);
$('nav-forward').addEventListener('click', forward);
$('nav-flip').addEventListener('click', () => {
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    refresh();
    save();
});
const typing = target => target.closest?.('textarea, [contenteditable="true"], input:not([type="range"], [type="radio"], [type="checkbox"], [type="file"])');

document.addEventListener('keydown', event => {
    if($('add-book-dialog').open) return;
    if((event.ctrlKey || event.metaKey) && !event.altKey && !typing(event.target) && !$('promotion')) {
        const key = event.key.toLowerCase();
        if(key === 'z' || key === 'y') {
            event.preventDefault();
            return key === 'y' || event.shiftKey ? redo() : undo();
        }
    }
    if(editable(event.target) || event.altKey || event.ctrlKey || event.metaKey || $('promotion')) return;
    const actions = { ArrowLeft: back, ArrowRight: forward, Home: toStart, End: toEnd };
    if(!actions[event.key]) return;
    event.preventDefault();
    actions[event.key]();
});

$('add-lines').addEventListener('click', () => {
    const layer = activeLayer();
    if(!layer) return;
    const added = addOpeningsFrom(tracked(layer), openings.lines, here().key);
    if(!added) history.undo.pop();
    status(added ? `Added ${number(added)} ${added === 1 ? 'move' : 'moves'}` : 'Already in the book');
    refresh();
    if(added) save();
});

const descriptions = document.querySelector('.book-mode-descriptions');
// Reserve the tallest description at the current width and font size.
for(const text of Object.values(mergeHelpText)) {
    const spacer = document.createElement('span');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.textContent = text;
    descriptions.append(spacer);
}

for(const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => {
        remember();
        state.mode = radio.value;
        refresh();
        save();
    });
}

$('add-book').addEventListener('click', () => {
    addBookSession++;
    $('add-book-error').hidden = true;
    $('add-book-dialog').showModal();
});
$('add-book-close').addEventListener('click', () => $('add-book-dialog').close());

$('new-book').addEventListener('click', () => {
    remember();
    const layer = newLayer(freeName('My book'));
    state.layers.push(layer);
    state.active = layer.id;
    refresh();
    save();
    $('add-book-dialog').close();
});

// Games become a book of how often each move was played, optionally only one player's moves.
let gamesChoice = null;
let gamesJob = null;

function askGames(name, games) {
    const players = gamePlayers(games);
    $('games-name').textContent = name;
    $('games-count').textContent = `${number(games.length)} ${games.length === 1 ? 'game' : 'games'}`;
    $('games-player').replaceChildren(new Option('All players', ''),
        ...players.slice(0, 100).map(player => new Option(`${player.name} (${number(player.games)})`, player.name)));
    $('games-player').value = guessPlayer(name, players, games.length);
    $('games').hidden = false;
    $('games').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const gamesAnswer = () => new Promise(resolve => { gamesChoice = resolve; });

function settingHelp(heading, input, text) {
    const help = document.createElement('span');
    help.className = 'maia-field-help';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'bi bi-info-circle';
    trigger.setAttribute('aria-label', `Help for ${heading.textContent.trim()}`);
    const tip = document.createElement('span');
    tip.id = `${input.id}-help`;
    tip.className = 'maia-field-tip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    trigger.setAttribute('aria-describedby', tip.id);
    input.setAttribute('aria-describedby', tip.id);
    help.append(trigger, tip);
    heading.append(help);
    const show = () => {
        tip.style.visibility = '';
        const rect = trigger.getBoundingClientRect();
        const width = Math.min(300, innerWidth - 24);
        tip.style.width = `${width}px`;
        tip.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
        tip.style.top = `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - tip.offsetHeight - 12))}px`;
    };
    help.addEventListener('mouseenter', show);
    help.addEventListener('focusin', show);
    trigger.addEventListener('keydown', event => {
        if(event.key === 'Escape') {
            tip.style.visibility = 'hidden';
            trigger.blur();
        }
    });
}

for(const [id, text] of Object.entries({
    'games-player': "Only count this player's moves. All players counts both players in every game.",
    'games-side': "Count moves played as White, Black, or both. The other side's moves still lead to the next position.",
    'games-depth': 'How far into each game to build the book. 15 includes the first 15 moves by each side.',
    'games-min': 'Keep a move only if it was played from the same position in at least this many games. 1 keeps every move. Higher values make smaller books and can leave nothing.'
})) {
    const input = $(id);
    const field = input.parentElement;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = field.firstChild.textContent.trim();
    const heading = document.createElement('span');
    heading.className = 'maia-field-label';
    heading.append(label);
    const wrapper = document.createElement('div');
    wrapper.className = field.className;
    field.replaceWith(wrapper);
    wrapper.append(heading, input);
    settingHelp(heading, input, text);
}

for(const group of ['Starters', 'Repertoires', 'Personalities']) {
    const options = document.createElement('optgroup');
    options.label = group;
    for(const preset of bookPresets.filter(preset => preset.group === group)) options.append(new Option(preset.name, preset.id));
    $('preset').append(options);
}
const presetHelp = 'Add an editable book from a starter, opening repertoire or personality. Your other books stay unchanged.';
settingHelp($('preset-heading'), $('preset'), presetHelp);
$('preset-control').append($('preset-heading').querySelector('.maia-field-help'));
$('preset').addEventListener('change', () => {
    $('preset-help').textContent = bookPresets.find(preset => preset.id === $('preset').value)?.description || presetHelp;
    $('preset-add').disabled = !$('preset').value;
});
$('presets').addEventListener('submit', async event => {
    event.preventDefault();
    if($('preset-add').disabled) return;
    const preset = bookPresets.find(preset => preset.id === $('preset').value);
    const session = addBookSession;
    $('preset').disabled = $('preset-add').disabled = true;
    $('presets').setAttribute('aria-busy', 'true');
    $('add-book-error').hidden = true;
    workspaceActions();
    try {
        const book = await buildPreset(preset.id, openings.lines, progress => {
            $('preset-add').querySelector('span').textContent = `${progress}%`;
        });
        addImported(preset.name, book, true);
        status(`Added ${preset.name}`);
        if($('add-book-dialog').open && session === addBookSession) $('add-book-dialog').close();
    } catch(error) {
        console.error('BookSmith could not build preset', error);
        status('Could not build this preset');
        if($('add-book-dialog').open && session === addBookSession) {
            $('add-book-error').textContent = 'Could not build this preset. Please try again.';
            $('add-book-error').hidden = false;
        }
    } finally {
        $('preset').disabled = $('preset-add').disabled = false;
        $('preset-add').querySelector('span').textContent = 'Add';
        $('presets').setAttribute('aria-busy', 'false');
        workspaceActions();
    }
});

function gamesBusy(busy) {
    for(const field of $('games').querySelectorAll('select, input')) field.disabled = busy;
    $('games-build').disabled = busy;
    $('games-build').querySelector('span').textContent = 'Build';
}

async function buildFromGames(file, games) {
    $('games-note').textContent = '';
    askGames(file.name, games);
    while(await gamesAnswer()) {
        const result = await countGames(file, games);
        if(!result) return null;
        if(result.book.size) return result;
        $('games-note').textContent = result.used ? 'No move was played that often' : 'No games for this player and color';
        $('games-min').focus();
    }
    return null;
}

async function countGames(file, games) {
    $('games-note').textContent = '';
    const options = {
        player: $('games-player').value, side: $('games-side').value,
        plies: Math.max(1, Math.round(Number($('games-depth').value) || 15)) * 2
    };
    const min = Math.max(1, Math.round(Number($('games-min').value) || 1));
    const job = gamesJob = { cancelled: false };
    const book = new Map();
    const issues = [];
    let used = 0;
    gamesBusy(true);
    try {
        for(let index = 0; index < games.length && !job.cancelled; index += 40) {
            used += addGames(book, games.slice(index, index + 40), { ...options, onIssue: issue => issues.push(issue) });
            $('games-build').querySelector('span').textContent = `${Math.floor(Math.min(index + 40, games.length) / games.length * 100)}%`;
            await new Promise(resolve => setTimeout(resolve));
        }
    } finally {
        gamesJob = null;
        gamesBusy(false);
    }
    if(job.cancelled) return null;
    finishBook(book, min);
    importIssues(file.name, issues);
    return { book, name: options.player || file.name.replace(/\.[^.]+$/, ''), used };
}

$('games').addEventListener('input', () => { $('games-note').textContent = ''; });
$('games').addEventListener('submit', event => {
    event.preventDefault();
    gamesChoice?.(true);
});
$('games-cancel').addEventListener('click', () => {
    if(gamesJob) gamesJob.cancelled = true;
    else gamesChoice?.(false);
});

function addImported(name, book, activate = false) {
    remember();
    const layer = newLayer(freeName(name), book);
    const empty = state.layers.length === 1 && !state.layers[0].book.size;
    if(empty) state.layers = [];
    state.layers.push(layer);
    if(activate || empty || !activeLayer()) state.active = layer.id;
    refresh();
    save();
}

const importWarnings = new Map();
function importIssues(name, issues) {
    if(issues.length) {
        const token = issues.find(issue => issue.token)?.token;
        importWarnings.set(name, `${name}: ${number(issues.length)} ${issues.length === 1 ? 'game was' : 'games were'} incomplete or unreadable${token ? ` (stopped at ${token})` : ''}. Only valid moves were kept.`);
    } else importWarnings.delete(name);
    $('import-warning').textContent = [...importWarnings.values()].join('\n');
    $('import-warning').hidden = !importWarnings.size;
}

$('import').addEventListener('change', async () => {
    const files = [...$('import').files];
    $('import').value = '';
    if(!files.length) return;
    if($('add-book-dialog').open) $('add-book-dialog').close();
    $('import').disabled = true;
    workspaceActions();
    importWarnings.clear();
    $('import-warning').hidden = true;
    const failed = [];
    let built = 0;
    for(const file of files) {
        try {
            if(/\.(pgn|txt)$/i.test(file.name)) {
                const games = readGames(await file.text());
                if(gamePlayers(games).length) {
                    const result = await buildFromGames(file, games);
                    if(result) {
                        addImported(result.name, result.book);
                        built += result.used;
                    } else importIssues(file.name, []);
                    continue;
                }
            }
            const issues = [];
            try {
                addImported(file.name.replace(/\.[^.]+$/, ''), await readBook(file.name, await file.arrayBuffer(), {
                    onIssue: issue => issues.push(issue)
                }));
            } finally { importIssues(file.name, issues); }
        } catch(error) {
            console.error(`BookSmith could not read ${file.name}`, error);
            failed.push(file.name);
        }
    }
    $('games').hidden = true;
    gamesChoice = null;
    $('import').disabled = false;
    status(failed.length ? `Could not read ${failed.join(', ')}` : built ? `Built from ${number(built)} ${built === 1 ? 'game' : 'games'}` : '');
    refresh();
});

$('export').addEventListener('click', () => {
    const enabled = enabledLayers();
    const book = enabled.length === 1 ? enabled[0].book : mergeBooks(enabled, state.mode);
    download(writeBin(book), enabled.length === 1 ? enabled[0].name : 'merged');
});

$('backup-workspace').addEventListener('click', () => {
    try {
        download(writeWorkspace(state), 'booksmith-workspace', 'json');
    } catch(error) {
        console.error('BookSmith could not back up workspace:', error);
        status('Could not back up this workspace');
    }
});

$('restore-workspace').addEventListener('change', async () => {
    const file = $('restore-workspace').files[0];
    $('restore-workspace').value = '';
    if(!file) return;
    if(restoringWorkspace || $('import').disabled || $('presets').getAttribute('aria-busy') === 'true') {
        status('Wait for the current import or preset to finish');
        return;
    }
    restoringWorkspace = true;
    $('import').disabled = $('preset').disabled = $('preset-add').disabled = true;
    workspaceActions();
    try {
        const restored = readWorkspace(await file.text());
        if(!confirm('Replace the current workspace with this backup? You can undo this.')) return;
        const step = remember();
        step.orientation = state.orientation;
        Object.assign(state, restored);
        state.path = [{ fen: startFen, key: positionKey(startFen) }];
        state.future = [];
        document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
        refresh();
        save();
        status('Workspace restored');
    } catch(error) {
        console.error('BookSmith could not restore workspace:', error);
        status(`Could not restore workspace: ${error.message}`);
    } finally {
        restoringWorkspace = false;
        $('import').disabled = false;
        $('preset').disabled = !openings.lines.length;
        $('preset-add').disabled = !openings.lines.length || !$('preset').value;
        workspaceActions();
    }
});

$('clear-all').addEventListener('click', () => {
    if(state.layers.some(layer => layer.book.size) && !confirm('Remove all books?')) return;
    remember();
    state.layers = [newLayer('My book')];
    state.active = state.layers[0].id;
    state.path = [state.path[0]];
    state.future = [];
    refresh();
    save();
});

new ResizeObserver(() => {
    board.redrawAll();
    fitArrows();
}).observe($('board'));

try {
    const saved = await load();
    if(saved !== null) {
        const { layers, mode, orientation, active } = validateWorkspace(saved);
        Object.assign(state, { layers, mode, orientation, active });
    }
    storageBlocked = false;
    $('saved-status').textContent = saved ? 'Saved in this browser' : 'Saves in this browser';
} catch(error) {
    storageError(db
        ? 'Could not load saved books. Saving is paused to protect them. Back up any new work, then reload to retry.'
        : 'Browser storage is unavailable. Download a workspace backup before leaving this page.', error);
}
if(!state.layers.length) {
    state.layers.push(newLayer('My book'));
    state.active = state.layers[0].id;
}
document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
$('clear-all').disabled = false;
document.querySelector('.book-workbench').inert = false;
refresh();
loadOpenings();
