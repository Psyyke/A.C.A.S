import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { channelName, heartbeatMs, sessionExpiryMs, revealedHints, TimeoutError } from '../tools/eloeye/sessionProtocol.js';

const startFen = new Chess().fen();
const state = (revision = 1) => [1, revision, 'w', 'w', 'w', startFen, [[startFen]]];
const flush = async () => { for(let i = 0; i < 5; i++) await Promise.resolve(); };

function harness(server = false, create) {
    let uid = 0, now = 100000;
    const sent = [], channels = [], intervals = new Map(), timeouts = new Map(), listeners = new Set();
    const element = () => ({ dataset: {}, append() {}, remove() {}, setAttribute() {} });
    const boards = [];
    class Channel {
        constructor() { channels.push(this); }
        postMessage(message) { sent.push(structuredClone(message)); }
        close() { this.closed = true; }
    }
    const context = {
        Chess, channelName, heartbeatMs, sessionExpiryMs, revealedHints, TimeoutError, DOMException, console,
        USERSCRIPT: { getInfo: async () => ({ scriptHandler: 'Violentmonkey' }) },
        Date: { now: () => now },
        crypto: { randomUUID: () => `id-${++uid}` },
        BroadcastChannel: Channel,
        document: { createElement: element },
        window: { AcasInstances: [],
            addEventListener: (_, listener) => listeners.add(listener),
            removeEventListener: (_, listener) => listeners.delete(listener) },
        setInterval: callback => { const id = ++uid; intervals.set(id, callback); return id; },
        clearInterval: id => intervals.delete(id),
        setTimeout: callback => { const id = ++uid; timeouts.set(id, callback); return id; },
        clearTimeout: id => timeouts.delete(id),
        Chessground: () => {
            const board = { set() {}, setAutoShapes(value) { this.shapes = value; }, destroy() { this.destroyed = true; } };
            boards.push(board);
            return board;
        },
        createInstance: create || (async () => { throw new Error('Unexpected creation'); })
    };
    const source = readFileSync(new URL(server ? '../app/assets/js/eloeyeSessions.js'
        : '../tools/eloeye/boardSession.js', import.meta.url), 'utf8');
    let result;
    if(server) {
        const code = source.slice(source.indexOf('class SessionTransport'))
            .replace('export function startEloEyeSessions', 'function startEloEyeSessions');
        result = vm.runInNewContext(`${code}; startEloEyeSessions()`, context);
    } else {
        const code = source.slice(source.indexOf('export class BoardSession')).replace('export class', 'class');
        const Board = vm.runInNewContext(`${code}; BoardSession`, context);
        result = new Board(element());
    }
    return { result, context, sent, channels, intervals, timeouts, listeners, boards,
        advance(ms) { now += ms; for(const callback of [...intervals.values()]) callback(); },
        receive(message) { channels[0].onmessage({ data: message }); }
    };
}

test('GUI status reports its manager without creating a game session', async () => {
    const h = harness(true);
    h.receive({ type: 'gui-status-request', client: 'status-client' });
    await flush();
    assert.deepEqual(h.sent.at(-1), {
        type: 'gui-status', client: 'status-client', gui: 'id-1', manager: 'Violentmonkey'
    });
    h.result();
});

test('direct board retains exact legal history, rejects invalid continuations and ignores stale/foreign replies', async () => {
    const h = harness(), board = h.result;
    board.setPosition({ fen: startFen, turn: 'w' });
    const sync = h.sent.at(-1);
    const reply = (type, extra = {}) => ({ ...sync, gui: 'gui-1', type, ...extra });
    h.receive(reply('available'));
    h.receive(reply('available', { gui: 'gui-2' }));
    assert.equal(board.gui, 'gui-1', 'A second open GUI must not create another session');
    h.receive(reply('connected'));
    const entry = { category: 'move', profileID: 'main', shapeType: 'arrow', from: 'e2', to: 'e4',
        selection: { profile: 'main', rank: 0, best: true, safe: true } };
    h.receive(reply('markings', { entries: [entry], revision: 1, fen: startFen }));
    assert.equal(board.hints.moves.length, 1);
    assert.equal(board.profilesReady, false);
    h.receive(reply('analysis', { revision: 1, fen: startFen, profiles: ['main', 'slow'], completed: ['main'] }));
    assert.equal(board.profilesReady, false);
    h.receive(reply('analysis', { revision: 1, fen: startFen, profiles: ['main', 'slow'], completed: ['main', 'slow'] }));
    assert.equal(board.profilesReady, true);
    const original = board.hints;
    board.setPosition({ fen: startFen, turn: 'w' });
    assert.equal(board.hints, original);
    assert.equal(board.history.length, 1);
    const chess = new Chess(); chess.move('e4');
    board.setPosition({ fen: chess.fen(), turn: 'b', lastMove: ['e2', 'e4'] });
    assert.equal(board.profilesReady, false);
    h.receive(reply('analysis', { revision: 1, fen: startFen, profiles: ['main'], completed: ['main'] }));
    assert.equal(board.profilesReady, false);
    assert.equal(board.hints, null);
    assert.equal(board.state[6].length, 2);
    assert.deepEqual(Array.from(board.history[1].slice(1, 4)), ['e2', 'e4', null]);
    for(const override of [{ revision: 1 }, { fen: startFen }, { gui: 'another-gui' }, { client: 'another-client' }]) {
        h.receive(reply('markings', { entries: [entry], revision: 2, fen: chess.fen(), ...override }));
        assert.equal(board.hints, null);
    }
    assert.throws(() => board.setPosition({ fen: startFen, turn: 'w' }), /legal continuation/);
    assert.throws(() => board.setPosition({ fen: chess.fen(), turn: 'w' }), /Invalid/);
    const closing = board.destroy();
    h.receive(reply('closed'));
    await closing;
    assert.equal(h.channels[0].closed, true);
    assert.equal(h.intervals.size + h.timeouts.size + h.listeners.size, 0);
    assert.equal(h.boards[0].destroyed, true);
});

test('GUI completion tracks every expected profile and ignores superseded searches and positions', async () => {
    let transport;
    const h = harness(true, async (_, id, variant, adapter) => {
        transport = adapter;
        return { close() { adapter.kill(); } };
    });
    const message = { type: 'sync', session: 'session', client: 'client', state: state(), gui: 'id-1' };
    h.receive(message);
    await flush();
    transport.expectProfiles(startFen, [{ name: 'fast' }, { name: 'slow' }]);
    const fast = { fen: startFen }, slow = { fen: startFen }, replacement = { fen: startFen };
    transport.analysisStarted('fast', fast);
    transport.analysisStarted('slow', slow);
    transport.analysisFinished('fast', fast);
    assert.deepEqual(h.sent.at(-1).completed, ['fast']);
    transport.analysisStarted('slow', replacement);
    transport.analysisFinished('slow', slow);
    assert.deepEqual(h.sent.at(-1).completed, ['fast']);
    transport.analysisFinished('slow', replacement);
    assert.deepEqual(h.sent.at(-1).completed, ['fast', 'slow']);
    const chess = new Chess(); chess.move('e4');
    const next = [1, 2, 'w', 'w', 'b', chess.fen(), [[chess.fen()]]];
    h.receive({ ...message, state: next });
    const amount = h.sent.length;
    transport.analysisFinished('slow', replacement);
    assert.equal(h.sent.length, amount);
    transport.expectProfiles(chess.fen(), [{ name: 'fast' }]);
    assert.deepEqual(h.sent.at(-1).completed, []);
    assert.deepEqual(h.sent.at(-1).profiles, ['fast']);
    h.result();
});

test('GUI loss clears stale hints, rediscovers a restarted GUI, and close rejects waiters without leaks', async () => {
    const h = harness(), board = h.result;
    board.setPosition({ fen: startFen, turn: 'w' });
    const sync = h.sent.at(-1);
    h.receive({ ...sync, type: 'available', gui: 'old-gui' });
    h.receive({ ...sync, type: 'connected', gui: 'old-gui' });
    h.advance(4000);
    assert.equal(board.gui, null);
    assert.equal(board.statuses.has('connected'), false);
    assert.equal(h.sent.at(-1).gui, null);
    h.receive({ ...sync, type: 'available', gui: 'new-gui' });
    h.receive({ ...sync, type: 'connected', gui: 'new-gui' });
    assert.equal(board.gui, 'new-gui');
    const controller = new AbortController();
    const waiting = board.waitFor(() => false, { signal: controller.signal });
    controller.abort(new Error('Stopped'));
    await assert.rejects(waiting, /Stopped/);
    assert.equal(board.watchers.size, 0);
    const pending = board.waitFor(() => false);
    const rejected = assert.rejects(pending, error => error.name === 'AbortError');
    const closing = board.destroy();
    assert.equal(board.destroy(), closing);
    h.receive({ ...sync, type: 'closed', gui: 'new-gui' });
    await closing; await rejected;
    assert.equal(h.timeouts.size + h.intervals.size + h.listeners.size, 0);
});

test('direct board retains castling, en passant and both colors of promotion with exact history', async () => {
    const cases = [
        [startFen, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']],
        ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', ['exd6']],
        ['7k/P7/8/8/8/8/8/4K3 w - - 0 1', ['a8=N']],
        ['1r5k/P7/8/8/8/8/8/4K3 w - - 0 1', ['axb8=Q+']],
        ['4k3/8/8/8/8/8/p7/7K b - - 0 1', ['a1=Q+']]
    ];
    for(const [fen, moves] of cases) {
        const h = harness(), board = h.result, chess = new Chess(fen);
        board.setPosition({ fen: chess.fen(), turn: chess.turn() });
        for(const san of moves) {
            h.advance(25);
            const move = chess.move(san);
            assert.ok(move, san);
            board.setPosition({ fen: chess.fen(), turn: chess.turn(), lastMove: [move.from, move.to] });
            const recorded = board.history.at(-1);
            assert.equal(recorded[0], chess.fen());
            assert.deepEqual(Array.from(recorded.slice(1, 4)), [move.from, move.to, move.promotion || null]);
            assert.equal(recorded[4], move.color === board.orientation ? null : 25);
        }
        assert.equal(board.history.length, moves.length + 1);
        const closing = board.destroy();
        for(const callback of [...h.timeouts.values()]) callback();
        await closing;
        assert.equal(h.timeouts.size + h.intervals.size + h.listeners.size, 0);
        assert.equal(h.channels[0].closed, true, 'An unavailable GUI cannot retain the board channel');
    }
});

test('GUI creates each session once, orders state revisions, fences ownership and closes before pending creation resolves', async () => {
    let resolveCreation, calls = 0, transport;
    const h = harness(true, async (domain, id, variant, adapter) => {
        calls++; transport = adapter;
        return new Promise(resolve => { resolveCreation = resolve; });
    });
    const message = { type: 'sync', session: 'session', client: 'client', state: state(), gui: 'id-1' };
    h.receive({ ...message, type: 'discover', gui: null });
    h.receive({ ...message, gui: null });
    h.receive({ ...message, gui: 'unselected-gui' });
    assert.equal(calls, 0, 'Discovery alone and messages for another GUI must not create instances');
    h.receive(message); h.receive(message);
    assert.equal(calls, 1);
    h.receive({ ...message, client: 'foreign-client', state: state(5) });
    assert.equal(transport.session.state[1], 1);
    h.receive({ ...message, state: state(3) });
    h.receive({ ...message, state: state(2) });
    assert.equal(transport.session.state[1], 3);
    h.receive({ ...message, type: 'close' });
    assert.equal(h.sent.at(-1).type, 'closed');
    let closed = 0;
    resolveCreation({ close() { closed++; } });
    await flush();
    assert.equal(closed, 1);
    assert.equal(transport.closed, true);
    h.receive(message);
    assert.equal(calls, 1, 'An already closed id cannot resurrect from delayed sync');
    h.result();
    assert.equal(h.channels[0].closed, true);
    assert.equal(h.intervals.size + h.listeners.size, 0);
});

test('GUI rejects malformed states, expires abandoned sessions and scopes hints to the exact current FEN', async () => {
    let closes = 0, transport, calls = 0;
    const h = harness(true, async (domain, id, variant, adapter) => {
        calls++; transport = adapter;
        adapter.registerSendCommand('renderVisualsToSite');
        return { close() { closes++; adapter.kill(); } };
    });
    const message = { type: 'sync', session: 'session', client: 'client', state: state(), gui: 'id-1' };
    h.receive({ ...message, state: [1] });
    assert.equal(h.sent.at(-1).type, 'error');
    assert.equal(calls, 0);
    h.receive(message);
    await flush();
    const amount = h.sent.length;
    await transport.commands.renderVisualsToSite([{ category: 'move', positionFen: 'stale' }]);
    assert.equal(h.sent.length, amount);
    await transport.commands.renderVisualsToSite([{ category: 'move', positionFen: startFen }]);
    assert.equal(h.sent.at(-1).type, 'markings');
    assert.equal(h.sent.at(-1).revision, 1);
    h.advance(sessionExpiryMs + 1);
    assert.equal(closes, 1);
    assert.equal(transport.closed, true);
    h.result();
});
