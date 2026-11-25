import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import { Facts } from './concepts.js';
import { checkedLine, moveMechanism } from './coaching.js';
import { parseQuestionMoves } from './questions.js';

// Everything Pena's chat may claim about a position comes from this sheet. Each fact is
// computed from the board or from a real engine search, gets a short id like F3, and carries
// the exact board visual for it. The model cites ids and the app draws them, so the chat can
// talk freely without inventing geometry.
const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const sides = { w: 'White', b: 'Black' };
const red = '#ff6b6b', green = '#69db7c', blue = '#74c0fc', purple = '#b197fc', orange = '#ffa94d';
const other = color => color === 'w' ? 'b' : 'w';
const file = square => square.charCodeAt(0) - 97;
const rank = square => Number(square[1]);
const at = (f, r) => f >= 0 && f < 8 && r >= 1 && r <= 8 ? 'abcdefgh'[f] + r : null;
const dark = square => (file(square) + rank(square)) % 2 === 1;
const forward = color => color === 'w' ? 1 : -1;
const piece = item => `${sides[item.color]} ${names[item.type]} ${item.square}`;
const arrow = (from, to, color) => Object.assign([from, to], { color });
const region = (label, squares, color) => ({ label, squares, anchor: squares[0], color });

function references({ squares = [], regions = [], relations = [], moves = [] } = {}) {
    return { squares, regions, relations, moves, frames: [] };
}

export function withTurn(fen, color) {
    const parts = fen.split(' ');
    if(parts[1] === color) return fen;
    parts[1] = color;
    parts[3] = '-';
    return parts.join(' ');
}

function legal(fen) {
    if(typeof fen !== 'string') return null;
    const board = new Chess();
    return board.validate_fen(fen).valid && board.load(fen) ? board : null;
}

// This chess.js build has no move.before or move.after, so play moves on a copy.
function play(board, move) {
    const before = board.fen();
    let result;
    try { result = board.move(move); } catch { result = null; }
    return result ? { ...result, before, after: board.fen() } : null;
}

export function sanLine(fen, uciMoves, limit = 6) {
    const board = legal(fen);
    const line = [];
    if(!board) return line;
    for(const uci of uciMoves.slice(0, limit)) {
        const move = play(board, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        if(!move) break;
        line.push({ san: move.san, from: move.from, to: move.to, color: move.color, beforeFen: move.before, fen: move.after });
    }
    return line;
}

// Numbered like a book, so "1...Nf6 2.Bc4" stays readable for both the model and the player.
export function numberedLine(fen, line) {
    let [number] = fen.split(' ').slice(5).map(Number);
    number ||= 1;
    return line.map((move, index) => {
        const prefix = move.color === 'w' ? `${number}.` : index === 0 ? `${number}...` : '';
        if(move.color === 'b') number++;
        return prefix + move.san;
    }).join(' ');
}

export function scoreText(score, color) {
    if(!score) return '';
    if(score.mate !== null && score.mate !== undefined) {
        const winner = score.mate > 0 ? color : other(color);
        return `${sides[winner]} mates in ${Math.abs(score.mate)}`;
    }
    const cp = color === 'w' ? score.cp : -score.cp;
    const pawns = (cp / 100).toFixed(1);
    const size = Math.abs(cp);
    const leader = cp > 0 ? 'White' : 'Black';
    const verdict = size < 40 ? 'about equal' : size < 120 ? `${leader} slightly better`
        : size < 300 ? `${leader} better` : `${leader} winning`;
    return `${cp > 0 ? '+' : ''}${pawns}, ${verdict}`;
}

function kingZone(square) {
    return SQUARES.filter(target => Math.abs(file(target) - file(square)) <= 1 && Math.abs(rank(target) - rank(square)) <= 1);
}

function material(facts) {
    const count = color => facts.find(null, color).reduce((sum, item) => sum + values[item.type], 0);
    const white = count('w'), black = count('b');
    const list = color => ['q', 'r', 'b', 'n', 'p'].map(type => {
        const n = facts.find([type], color).length;
        return n ? `${n}${type === 'p' ? 'P' : type.toUpperCase()}` : '';
    }).filter(Boolean).join(' ');
    const diff = white - black;
    const text = diff === 0 ? 'material is level' : `${diff > 0 ? 'White' : 'Black'} is up ${Math.abs(diff)} point${Math.abs(diff) === 1 ? '' : 's'}`;
    return { text: `${text} (White ${list('w')}, Black ${list('b')})`, diff };
}

function kingSafety(facts, color, fen, phase) {
    const king = facts.find(['k'], color)[0];
    if(!king) return null;
    const zone = kingZone(king.square);
    if(phase === 'endgame' && facts.pieces.filter(item => !['p', 'k'].includes(item.type)).length <= 3) {
        const central = Math.abs(file(king.square) - 3.5) + Math.abs(rank(king.square) - 4.5);
        return { kind: 'king activity', side: color, weight: 2,
            text: `${sides[color]} king ${king.square} is ${central <= 3 ? 'active in the center, where kings belong in endgames' : 'still on the edge, in endgames the king wants to walk toward the center'}`,
            references: references({ regions: [region(`${sides[color]} king`, zone, central <= 3 ? green : orange)] }) };
    }
    const castled = rank(king.square) === (color === 'w' ? 1 : 8) && ['g', 'h', 'b', 'c', 'a'].includes(king.square[0]);
    const rights = fen.split(' ')[2];
    const canCastle = color === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights);
    const shield = facts.find(['p'], color).filter(pawn => Math.abs(file(pawn.square) - file(king.square)) <= 1
        && (rank(pawn.square) - rank(king.square)) * forward(color) >= 1 && (rank(pawn.square) - rank(king.square)) * forward(color) <= 2);
    const attackers = new Set();
    for(const square of zone) for(const source of facts.attackers(square, other(color))) {
        if(facts.board.get(source)?.type !== 'k') attackers.add(source);
    }
    const central = ['d', 'e'].includes(king.square[0]);
    const state = castled ? 'castled' : canCastle ? 'not castled yet' : central ? 'stuck in the middle, castling is gone' : 'no longer able to castle';
    const risk = attackers.size >= 3 || shield.length <= 1 && attackers.size >= 1 || !castled && !canCastle && attackers.size >= 2
        ? 'under pressure' : shield.length >= 2 && attackers.size <= 1 ? 'safe' : 'a little airy';
    const text = `${sides[color]} king ${king.square} is ${state} and looks ${risk}, ${shield.length} pawn${shield.length === 1 ? '' : 's'} in front, `
        + `${attackers.size || 'no'} enemy piece${attackers.size === 1 ? '' : 's'} aiming at the squares around it`;
    const relations = [...attackers].slice(0, 4).map(source => arrow(source, king.square, red));
    return { kind: 'king safety', side: color, weight: risk === 'safe' ? 1 : risk === 'under pressure' ? 8 : 4, text,
        references: references({ regions: [region(`${sides[color]} king zone`, zone, risk === 'safe' ? blue : red)],
            relations, squares: shield.map(pawn => pawn.square) }) };
}

function pinsAndSkewers(facts) {
    return facts.lines().map(line => {
        const slider = { square: line.slider, ...facts.board.get(line.slider) };
        const front = { square: line.front, ...facts.board.get(line.front) };
        const back = { square: line.back, ...facts.board.get(line.back) };
        const text = line.kind === 'pin'
            ? `${piece(slider)} pins ${piece(front)} to the ${names[back.type]} on ${back.square}${back.type === 'k' ? ', so it cannot legally move off the line' : ''}`
            : `${piece(slider)} skewers ${piece(front)}, when it moves the ${names[back.type]} on ${back.square} is exposed`;
        return { kind: line.kind, side: line.color, weight: back.type === 'k' ? 8 : 6, text,
            references: references({ relations: [arrow(line.slider, line.front, red), arrow(line.front, line.back, red)],
                regions: [region(line.kind === 'pin' ? 'Pinned' : 'Skewer', [line.front], red)], squares: [line.back] }) };
    });
}

function loosePieces(facts) {
    const found = [];
    for(const item of facts.pieces) {
        if(item.type === 'k') continue;
        const attackers = facts.hanging(item);
        if(!attackers.length) continue;
        const defended = facts.attackers(item.square, item.color).length > 0;
        found.push({ kind: defended ? 'attacked by a cheaper piece' : 'hanging', side: item.color, weight: 9 + values[item.type],
            text: `${piece(item)} is ${defended ? `attacked by a cheaper piece (${attackers.join(', ')})` : `undefended and attacked by ${attackers.join(', ')}`}`,
            references: references({ relations: attackers.slice(0, 3).map(source => arrow(source, item.square, red)),
                regions: [region(defended ? 'Under attack' : 'Hanging', [item.square], red)] }) });
    }
    return found.sort((a, b) => b.weight - a.weight);
}

function forks(facts) {
    const found = [];
    for(const source of facts.pieces) {
        if(source.type === 'k') continue;
        const victims = facts.find(null, other(source.color)).filter(target => target.type !== 'p'
            && (values[target.type] > values[source.type] || target.type === 'k' || !facts.attackers(target.square, target.color).length)
            && facts.attackers(target.square, source.color).includes(source.square));
        if(victims.length < 2) continue;
        found.push({ kind: 'double attack', side: source.color, weight: 9,
            text: `${piece(source)} attacks ${victims.map(piece).join(' and ')} at once`,
            references: references({ relations: victims.slice(0, 3).map(target => arrow(source.square, target.square, red)),
                regions: [region('Double attack', victims.slice(0, 3).map(target => target.square), red)] }) });
    }
    return found;
}

function pawnFeatures(facts) {
    const found = [];
    for(const color of ['w', 'b']) {
        const pawns = facts.find(['p'], color);
        const passed = pawns.filter(pawn => facts.passed(pawn));
        for(const pawn of passed.sort((a, b) => (rank(b.square) - rank(a.square)) * forward(color))) {
            const queening = pawn.square[0] + (color === 'w' ? 8 : 1);
            const distance = Math.abs(rank(queening) - rank(pawn.square));
            found.push({ kind: 'passed pawn', side: color, weight: 4 + (7 - distance),
                text: `${sides[color]} has a passed pawn on ${pawn.square}, no enemy pawn is ahead on its file or neighboring files; it is ${distance} rank${distance === 1 ? '' : 's'} from promotion on ${queening}`,
                references: references({ relations: [arrow(pawn.square, queening, green)],
                    regions: [region('Passed pawn', [pawn.square], green)] }) });
        }
        const isolated = pawns.filter(pawn => facts.isolated(pawn));
        if(isolated.length) found.push({ kind: 'isolated pawn', side: color, weight: 3,
            text: `${sides[color]} has isolated pawn${isolated.length > 1 ? 's' : ''} on ${isolated.map(pawn => pawn.square).join(', ')}, with no friendly pawns on neighboring files to support ${isolated.length > 1 ? 'them' : 'it'}`,
            references: references({ regions: [region('Isolated', isolated.map(pawn => pawn.square), red)],
                squares: isolated.map(pawn => pawn.square[0] + (rank(pawn.square) + forward(color))).filter(square => /^[a-h][1-8]$/.test(square)) }) });
        const doubled = pawns.filter(pawn => facts.doubled(pawn));
        const doubledFiles = [...new Set(doubled.map(pawn => pawn.square[0]))].sort()
            .map(letter => `the ${letter}-file (${doubled.filter(pawn => pawn.square[0] === letter).map(pawn => pawn.square).sort().join(' and ')})`);
        if(doubled.length) found.push({ kind: 'doubled pawns', side: color, weight: 2,
            text: `${sides[color]} has doubled pawns on ${doubledFiles.join(' and on ')}`,
            references: references({ regions: [region('Doubled', doubled.map(pawn => pawn.square), red)] }) });
        const backward = pawns.filter(pawn => facts.backward(pawn));
        for(const pawn of backward) {
            const stop = pawn.square[0] + (rank(pawn.square) + forward(color));
            found.push({ kind: 'backward pawn', side: color, weight: 3,
                text: `${sides[color]} pawn ${pawn.square} is backward, its neighbors have moved ahead and ${stop} in front of it is covered by enemy pawns`,
                references: references({ regions: [region('Backward pawn', [pawn.square], red), region('Weak square', [stop], orange)] }) });
        }
        const files = [...new Set(pawns.map(pawn => file(pawn.square)))].sort((a, b) => a - b);
        let islands = files.length ? 1 : 0;
        for(let i = 1; i < files.length; i++) if(files[i] - files[i - 1] > 1) islands++;
        if(islands >= 3) found.push({ kind: 'pawn islands', side: color, weight: 1,
            text: `${sides[color]} pawns are split into ${islands} islands, more islands means more weaknesses to defend`,
            references: references({ regions: [region(`${islands} pawn islands`, pawns.map(pawn => pawn.square), blue)] }) });
        const chain = [];
        for(const pawn of pawns) for(const source of facts.attackers(pawn.square, color))
            if(facts.board.get(source)?.type === 'p') chain.push(arrow(source, pawn.square, green));
        // Separate groups of linked pawns are separate chains, so only the biggest one is described.
        const groups = [];
        for(const link of chain) {
            const touching = groups.filter(group => group.squares.has(link[0]) || group.squares.has(link[1]));
            const merged = { squares: new Set(link), links: [link] };
            for(const group of touching) { group.squares.forEach(square => merged.squares.add(square)); merged.links.push(...group.links); groups.splice(groups.indexOf(group), 1); }
            groups.push(merged);
        }
        const biggest = groups.sort((a, b) => b.squares.size - a.squares.size)[0];
        if(biggest && biggest.squares.size >= 3) {
            const members = [...biggest.squares];
            const links = biggest.links;
            const base = members.filter(square => !links.some(link => link[1] === square))
                .sort((a, b) => (rank(a) - rank(b)) * forward(color))[0];
            found.push({ kind: 'pawn chain', side: color, weight: 2,
                text: `${sides[color]} pawns ${members.sort().join(', ')} protect each other diagonally, the base on ${base} has no pawn guarding it and is the natural target`,
                references: references({ relations: links.slice(0, 5), regions: [region('Pawn chain', members, green), region('Base', [base], orange)] }) });
        }
    }
    for(const [wing, letters] of [['queenside', 'abc'], ['kingside', 'fgh']]) {
        const count = color => facts.find(['p'], color).filter(pawn => letters.includes(pawn.square[0]));
        const white = count('w'), black = count('b');
        if(white.length === black.length || !white.length && !black.length) continue;
        const color = white.length > black.length ? 'w' : 'b';
        const ours = color === 'w' ? white : black;
        found.push({ kind: 'pawn majority', side: color, weight: 2,
            text: `${sides[color]} has a ${wing} pawn majority, ${Math.max(white.length, black.length)} against ${Math.min(white.length, black.length)}, which can create a passed pawn`,
            references: references({ regions: [region(`${wing[0].toUpperCase()}${wing.slice(1)} majority`, ours.map(pawn => pawn.square), green)] }) });
    }
    return found;
}

// A break is a pawn move that hits an enemy pawn to open lines. Both sides are listed
// because plans matter even when it is not your move.
function pawnBreaks(fen) {
    const found = [];
    for(const color of ['w', 'b']) {
        const board = legal(withTurn(fen, color));
        if(!board) continue;
        const facts = new Facts(board.fen());
        for(const candidate of board.moves({ verbose: true })) {
            if(candidate.piece !== 'p' || candidate.promotion) continue;
            const move = play(legal(board.fen()), { from: candidate.from, to: candidate.to });
            if(!move) continue;
            const after = new Facts(move.after);
            const hits = [-1, 1].map(dx => at(file(move.to) + dx, rank(move.to) + forward(color)))
                .filter(square => square && after.board.get(square)?.type === 'p' && after.board.get(square).color !== color);
            const captures = move.captured === 'p';
            if(!hits.length && !captures) continue;
            if(captures && hits.length === 0 && rank(move.to) === (color === 'w' ? 7 : 2)) continue;
            const centre = 'cdef'.includes(move.to[0]) ? 2 : 0;
            const safe = !facts.attackers(move.to, other(color)).length || facts.attackers(move.to, color).length > 0 ? 1 : 0;
            const label = `${color === 'b' ? '...' : ''}${move.san}`;
            found.push({ kind: 'pawn break', side: color, weight: 2 + centre + safe,
                text: `${sides[color]} pawn break ${label}${hits.length ? ` hits the pawn${hits.length > 1 ? 's' : ''} on ${hits.join(' and ')}` : ''}${captures ? ` capturing on ${move.to}` : ''}, which may help open lines after pawn exchanges`,
                references: references({ moves: [[move.from, move.to]], relations: hits.map(square => arrow(move.to, square, red)),
                    regions: [region('Pawn break', [move.to], orange)] }) });
        }
    }
    return found.sort((a, b) => b.weight - a.weight);
}

function outposts(facts) {
    const found = [];
    for(const color of ['w', 'b']) {
        const enemy = facts.find(['p'], other(color));
        for(const square of SQUARES) {
            const relative = color === 'w' ? rank(square) : 9 - rank(square);
            if(relative < 4 || relative > 6 || !'bcdefg'.includes(square[0])) continue;
            const supported = facts.attackers(square, color).some(source => facts.board.get(source)?.type === 'p'
                && facts.board.get(source).color === color);
            if(!supported) continue;
            const attackable = enemy.some(pawn => Math.abs(file(pawn.square) - file(square)) === 1
                && (rank(pawn.square) - rank(square)) * forward(color) > 0);
            if(attackable) continue;
            const occupant = facts.board.get(square);
            if(occupant && !(occupant.color === color && ['n', 'b'].includes(occupant.type))) continue;
            const knights = facts.find(['n', 'b'], color).filter(item => item.square === square
                || item.type === 'n' && Math.abs(file(item.square) - file(square)) * Math.abs(rank(item.square) - rank(square)) === 2);
            if(!knights.length) continue;
            const sitting = knights.find(item => item.square === square);
            found.push({ kind: 'outpost', side: color, weight: 4 + ('de'.includes(square[0]) ? 1 : 0),
                text: sitting ? `${piece(sitting)} sits on an outpost, supported by a pawn and no enemy pawn on a neighboring file can advance to challenge it in the current structure`
                    : `${square} is a potential outpost for ${sides[color]}, supported by a pawn and not challengeable by an advancing enemy pawn in the current structure; the knight on ${knights[0].square} is a knight's jump away, subject to move legality`,
                references: references({ regions: [region('Outpost', [square], blue)],
                    relations: sitting ? [] : [arrow(knights[0].square, square, blue)] }) });
        }
    }
    return found.sort((a, b) => b.weight - a.weight);
}

function files(facts) {
    const found = [];
    if(!facts.find(['r', 'q']).length) return found;
    for(let f = 0; f < 8; f++) {
        const letter = 'abcdefgh'[f];
        const pawns = color => facts.find(['p'], color).some(pawn => pawn.square[0] === letter);
        const heavy = facts.find(['r', 'q']).filter(item => item.square[0] === letter);
        const squares = SQUARES.filter(square => square[0] === letter);
        if(!pawns('w') && !pawns('b')) {
            const owners = heavy.map(piece).join(' and ');
            found.push({ kind: 'open file', side: heavy[0]?.color || null, weight: heavy.length ? 4 : 1,
                text: `the ${letter}-file is open${owners ? `, ${owners} ${heavy.length > 1 ? 'are' : 'is'} on it` : ', no rook or queen stands on it'}`,
                references: references({ regions: [region(`Open ${letter}-file`, squares, blue)], squares: heavy.map(item => item.square) }) });
        } else for(const color of ['w', 'b']) {
            if(pawns(color) || !pawns(other(color))) continue;
            const own = heavy.filter(item => item.color === color);
            if(!own.length) continue;
            found.push({ kind: 'half-open file', side: color, weight: 3,
                text: `${sides[color]} has a half-open ${letter}-file with ${own.map(piece).join(' and ')} on it; the enemy pawn limits access farther along the file`,
                references: references({ regions: [region(`Half-open ${letter}-file`, squares, blue)], squares: own.map(item => item.square) }) });
        }
    }
    return found.sort((a, b) => b.weight - a.weight);
}

function pieceQuality(facts, fen) {
    const found = [];
    const fullmove = Number(fen.split(' ')[5]) || 1;
    for(const color of ['w', 'b']) {
        const pawns = facts.find(['p'], color);
        for(const bishop of facts.find(['b'], color)) {
            // Only pawns that are stuck count, a bishop outside its own pawn chain is still fine.
            const blocked = pawns.filter(pawn => dark(pawn.square) === dark(bishop.square)
                && facts.board.get(pawn.square[0] + (rank(pawn.square) + forward(color)))?.type === 'p');
            const behind = blocked.some(pawn => (rank(pawn.square) - rank(bishop.square)) * forward(color) > 0);
            if(blocked.length >= 2 && behind)
                found.push({ kind: 'bad bishop', side: color, weight: 3,
                    text: `${piece(bishop)} is a bad bishop, its own blocked pawns on ${blocked.map(pawn => pawn.square).join(', ')} sit on its ${dark(bishop.square) ? 'dark' : 'light'} squares and wall it in`,
                    references: references({ regions: [region('Bad bishop', [bishop.square], orange), region('Blocked pawns', blocked.map(pawn => pawn.square), red)] }) });
        }
        const pairs = facts.find(['b'], color);
        if(pairs.length === 2 && facts.find(['b'], other(color)).length < 2)
            found.push({ kind: 'bishop pair', side: color, weight: 2,
                text: `${sides[color]} has the bishop pair, strong in open positions`,
                references: references({ regions: [region('Bishop pair', pairs.map(item => item.square), blue)] }) });
        if(fullmove <= 15) {
            const home = color === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
            const sleeping = home.filter(square => {
                const item = facts.board.get(square);
                return item && item.color === color && ['n', 'b'].includes(item.type);
            });
            if(sleeping.length >= 2) found.push({ kind: 'development', side: color, weight: sleeping.length,
                text: `${sides[color]} still has ${sleeping.length} minor pieces at home (${sleeping.map(square => names[facts.board.get(square).type] + ' ' + square).join(', ')}), developing them is a priority`,
                references: references({ regions: [region('Undeveloped', sleeping, orange)] }) });
        }
        // Rooks side by side on the back rank are not a battery anyone cares about.
        const batteries = facts.batteries(color).filter(([first, second]) => rank(first) !== rank(second));
        for(const [first, second] of batteries) found.push({ kind: 'battery', side: color, weight: 3,
            text: `${sides[color]} has a battery, ${names[facts.board.get(first).type]} ${first} and ${names[facts.board.get(second).type]} ${second} line up, which can help coordinate pressure along their line`,
            references: references({ relations: [arrow(first, second, blue)], regions: [region('Battery', [first, second], blue)] }) });
        const centre = ['d4', 'e4', 'd5', 'e5'].filter(square => {
            const item = facts.board.get(square);
            return item?.type === 'p' && item.color === color;
        });
        if(centre.length >= 2) found.push({ kind: 'center', side: color, weight: 2,
            text: `${sides[color]} has a strong pawn center on ${centre.join(' and ')}`,
            references: references({ regions: [region('Pawn center', centre, green)] }) });
    }
    return found;
}

function questionFocus(question, playerColor, turn) {
    const text = String(question || '').replace(/’/g, "'").toLowerCase();
    const colors = new Set();
    if(/\bwhite(?:'s)?\b/.test(text)) colors.add('w');
    if(/\bblack(?:'s)?\b/.test(text)) colors.add('b');
    if(!colors.size) {
        const player = playerColor || turn;
        const ownership = text.replace(/\b(?:my|our|your|the) opponent(?:'s)?\b/g, 'opponent');
        if(/\b(?:my|mine|our|ours|your|own|i|we)\b/.test(ownership)) colors.add(player);
        if(/\b(?:opponent|enemy|opposing|their|they|his|her)\b/.test(ownership)) colors.add(other(player));
    }
    const kinds = new Set();
    for(const [pattern, matches] of [
        [/\b(?:passed|promot\w*|queening)\b/, ['passed pawn']],
        [/\bisolated\b/, ['isolated pawn']], [/\bdoubled\b/, ['doubled pawns']],
        [/\bbackward\b/, ['backward pawn']], [/\bchain\b/, ['pawn chain']],
        [/\bislands?\b/, ['pawn islands']], [/\bmajority\b/, ['pawn majority']],
        [/\bbreaks?\b/, ['pawn break']], [/\boutposts?\b/, ['outpost']],
        [/\b(?:hanging|loose|undefended|unprotected|attacked)\b/, ['hanging', 'attacked by a cheaper piece']],
        [/\b(?:fork\w*|double attack)\b/, ['double attack']],
        [/\bpin(?:s|ned|ning)?\b/, ['pin']], [/\bskewer\w*\b/, ['skewer']],
        [/\bbatter(?:y|ies)\b/, ['battery']], [/\b(?:file|files)\b/, ['file plan', 'open file', 'half-open file']],
        [/\b(?:king|castl\w*)\b/, ['king safety', 'king activity']],
        [/\bdevelop\w*\b/, ['development']], [/\bbishop pair\b/, ['bishop pair']],
        [/\b(?:center|centre|central)\b/, ['center']]
    ]) if(pattern.test(text)) matches.forEach(kind => kinds.add(kind));
    if(!kinds.size && /\bpawns?\b/.test(text))
        ['passed pawn', 'isolated pawn', 'doubled pawns', 'backward pawn', 'pawn chain', 'pawn islands', 'pawn majority', 'pawn break'].forEach(kind => kinds.add(kind));
    return { text, colors, kinds,
        squares: new Set(text.match(/[a-h][1-8](?!\d)/g) || []),
        files: new Set([...text.matchAll(/\b(?:([a-h])[- ]+file|file\s+([a-h]))\b/g)].map(match => match[1] || match[2])),
        types: Object.keys(names).filter(type => new RegExp(`\\b${names[type]}s?\\b`).test(text)) };
}

function questionRelevance(item, focus) {
    let score = focus.kinds.has(item.kind) ? 25 : 0;
    if(item.kind === 'move effect') score += 55;
    if(item.kind === 'file plan') score += 35;
    for(const square of focus.squares) if(item.text.includes(square)) score += 30;
    for(const letter of focus.files) if(item.text.includes(`${letter}-file`)) score += 35;
    for(const type of focus.types) if(new RegExp(`\\b${names[type]}s?\\b`, 'i').test(item.text)) score += 8;
    if(focus.colors.size) {
        // A pin belongs to the attacking side, but a question may name its victim instead.
        const namedSubject = [...focus.colors].some(color => focus.types.some(type => item.text.includes(`${sides[color]} ${names[type]} `)));
        if(namedSubject || focus.colors.has(item.side)) score += 20;
        else if(item.side) score -= 25;
    }
    return score;
}

function filePlans(facts, focus) {
    return [...focus.files].map(letter => {
        const occupants = facts.pieces.filter(item => item.square[0] === letter);
        const pawns = occupants.filter(item => item.type === 'p');
        const heavy = occupants.filter(item => ['r', 'q'].includes(item.type));
        const others = occupants.filter(item => !['p', 'r', 'q'].includes(item.type));
        const state = !pawns.length ? 'is already open, with no pawns on it'
            : pawns.some(item => item.color === 'w') && pawns.some(item => item.color === 'b')
                ? `is not open: ${pawns.map(piece).join(' and ')} obstruct it`
                : `is half-open for ${sides[other(pawns[0].color)]}: ${pawns.map(piece).join(' and ')} still obstruct it`;
        const route = pawns.length ? 'If the pawns leave or are exchanged and other blockers clear'
            : 'If other blockers clear';
        return { kind: 'file plan', side: null, weight: 4,
            text: `the ${letter}-file ${state}; ${heavy.length ? heavy.map(piece).join(' and ') + (heavy.length === 1 ? ' stands on it' : ' stand on it') : 'no rook or queen stands on it'}`
                + `${others.length ? `; ${others.map(piece).join(' and ')} also ${others.length === 1 ? 'occupies' : 'occupy'} it` : ''}. `
                + `${route}, ${heavy.length ? heavy.map(piece).join(' and ') : 'a rook or queen that can legally reach it'} could gain pressure or entry squares along this file, not a guaranteed gain`,
            references: references({ squares: occupants.map(item => item.square),
                regions: [region(`${letter}-file`, SQUARES.filter(square => square[0] === letter), blue)] }) };
    });
}

function moveEffect(fen, uci, focus, currentFen) {
    const [frame] = checkedLine(fen, [uci], 1);
    if(!frame) return null;
    const before = new Facts(frame.beforeFen), after = new Facts(frame.fen);
    const moved = { square: frame.to, ...after.board.get(frame.to) };
    const changes = [];
    const add = (text, squares, weight) => changes.push({ text, squares, weight });
    const reached = square => after.attackers(square, frame.color).includes(frame.to)
        && !before.attackers(square, frame.color).includes(frame.from);
    const targets = after.find(null, other(frame.color)).filter(target => target.type !== 'k' && reached(target.square));
    if(targets.length) add(`${piece(moved)} now attacks ${targets.slice(0, 3).map(piece).join(' and ')}`, targets.map(item => item.square), 5);
    const covered = [...new Set([...focus.squares, 'd4', 'e4', 'd5', 'e5'])].filter(reached);
    if(covered.length) add(`${piece(moved)} now covers ${covered.slice(0, 3).join(' and ')}, which it did not cover from ${frame.from}`, covered, 4);
    const uncovered = [...focus.squares].filter(square => square !== frame.from && square !== frame.to && before.attackers(square, frame.color).includes(frame.from)
        && !after.attackers(square, frame.color).includes(frame.to));
    if(uncovered.length) add(`${piece(moved)} no longer covers ${uncovered.join(' and ')}, which it covered from ${frame.from}`, uncovered, 4);
    const defended = after.find(null, frame.color).filter(target => target.square !== frame.to && target.type !== 'k' && reached(target.square));
    if(defended.length) add(`${piece(moved)} adds support to ${defended.slice(0, 2).map(piece).join(' and ')}`, defended.map(item => item.square), 3);
    for(const slider of before.find(['b', 'r', 'q'], frame.color).filter(item => item.square !== frame.from)) {
        const opened = SQUARES.filter(square => after.attackers(square, frame.color).includes(slider.square)
            && !before.attackers(square, frame.color).includes(slider.square));
        opened.sort((a, b) => Number(focus.squares.has(b)) - Number(focus.squares.has(a)));
        if(opened.length) add(`${piece(slider)} gains a line covering ${opened.slice(0, 3).join(', ')}`, [slider.square, ...opened], 4);
    }
    for(const letter of new Set([...focus.files, frame.from[0], frame.to[0]])) {
        const state = facts => ['w', 'b'].map(color => facts.find(['p'], color).some(pawn => pawn.square[0] === letter));
        const old = state(before), now = state(after);
        if(old.join() === now.join()) continue;
        if(!now[0] && !now[1]) add(`the ${letter}-file becomes open, with no pawns left on it`, [frame.from, frame.to], 6);
        else if(!now[0] || !now[1]) add(`the ${letter}-file becomes half-open for ${sides[now[0] ? 'b' : 'w']}`, [frame.from, frame.to], 6);
    }
    const oldAttacks = before.attackers(frame.from, other(frame.color));
    const newAttacks = after.attackers(frame.to, other(frame.color));
    if(oldAttacks.length || newAttacks.length)
        add(`enemy attacks on the moving piece change from ${oldAttacks.join(', ') || 'none'} at ${frame.from} to ${newAttacks.join(', ') || 'none'} at ${frame.to}`, [frame.from, frame.to], 3);
    const relevance = change => change.weight + change.squares.filter(square => focus.squares.has(square)).length * 10;
    changes.sort((a, b) => relevance(b) - relevance(a));
    const hypothetical = frame.color !== legal(currentFen).turn();
    return { kind: 'move effect', side: frame.color, weight: 6, line: sanLine(fen, [uci], 1),
        text: `${hypothetical ? `if ${sides[frame.color]} had the move, ` : ''}${frame.san} moves the ${sides[frame.color]} ${names[frame.piece]} from ${frame.from} to ${frame.to}, ${moveMechanism(frame)}`
            + `${changes.length ? `; before/after evidence: ${changes.slice(0, 2).map(change => change.text).join('; ')}` : ''}; these are board effects, not proof that the move is best`,
        references: references({ moves: [[frame.from, frame.to]] }) };
}

function questionMoveFacts(fen, question, focus, last) {
    if(!focus.text) return [];
    const discussingLast = last?.fen && last?.uci && last?.san && /\b(?:played|did|was|last move)\b/i.test(question)
        && focus.text.includes(last.san.replace(/[+#]/g, '').toLowerCase());
    const color = focus.colors.size === 1 ? [...focus.colors][0] : null;
    const board = legal(fen);
    if(!discussingLast && color && color !== board.turn() && board.in_check()) return [];
    const source = discussingLast ? last.fen : color ? withTurn(fen, color) : fen;
    const moves = parseQuestionMoves(question, source);
    return moves.filter(item => (!color || item.move.color === color)
        && !(item.spec.bare && /\b(?:control\w*|cover\w*|attack\w*|defend\w*|square)\s+$/i.test(question.slice(0, item.spec.index))))
        .map(item => {
            const fact = moveEffect(item.fen, item.move.from + item.move.to + (item.move.promotion || ''), focus, discussingLast ? source : fen);
            if(fact && discussingLast) fact.text = `on the board before the last move, ${fact.text}`;
            return fact;
        }).filter(Boolean);
}

// What a move concretely does on the board, never a guess about intentions.
function mechanism(fen, uci) {
    try {
        const [frame] = checkedLine(fen, [uci], 1);
        return frame ? moveMechanism(frame) : '';
    } catch { return ''; }
}

function lineOutcome(fen, uciMoves, color) {
    try {
        const line = checkedLine(fen, uciMoves, 8);
        if(line.at(-1)?.mate) return `, ending in checkmate by ${sides[line.at(-1).color]}`;
        const count = board => board.board().flat().filter(Boolean)
            .reduce((sum, item) => sum + values[item.type] * (item.color === color ? 1 : -1), 0);
        const change = line.length ? count(new Chess(line.at(-1).fen)) - count(new Chess(fen)) : 0;
        return change >= 2 ? `, ${sides[color]} wins ${change} points of material in this line`
            : change <= -2 ? `, ${sides[color]} gives up ${-change} points of material in this line` : '';
    } catch { return ''; }
}

function engineFacts(fen, engine, turn) {
    const found = [];
    for(const [index, line] of (engine?.lines || []).slice(0, 3).entries()) {
        const pv = line.pv?.length ? line.pv : [line.move];
        const moves = sanLine(fen, pv, 6);
        if(!moves.length) continue;
        const does = mechanism(fen, pv[0]);
        found.push({ id: `L${index + 1}`, kind: index ? 'engine alternative' : 'engine best', side: turn, weight: 20 - index,
            text: `${moves[0].san}${line.score ? ` (${scoreText(line.score, turn)})` : ''}${does ? `, ${does}` : ''}, line ${numberedLine(fen, moves)}${lineOutcome(fen, pv, turn)}`,
            line: moves, score: line.score,
            references: references({ moves: [[moves[0].from, moves[0].to]] }) });
    }
    return found;
}

function threatFact(fen, threat, turn) {
    if(!threat?.pv?.length) return null;
    const opponentFen = withTurn(fen, other(turn));
    const moves = sanLine(opponentFen, threat.pv, 3);
    if(!moves.length) return null;
    const label = (threat.gain ?? 0) >= 150 || threat.score?.mate > 0 ? 'threat' : 'idea';
    const does = mechanism(opponentFen, threat.pv[0]);
    return { id: 'T', kind: `opponent ${label}`, side: other(turn), weight: label === 'threat' ? 15 : 3, line: moves,
        text: `if ${sides[other(turn)]} could move now they would play ${moves[0].san}${does ? `, ${does}` : ''}`
            + `${label === 'threat' ? ', a real threat to deal with' : ', not a big threat'}`,
        references: references({ relations: [arrow(moves[0].from, moves[0].to, red)], regions: [region('Threat', [moves[0].to], red)] }) };
}

// Tested answers to a real threat, from defence.js. Holds keeps the balance, fails loses material or worse.
function defenceFacts(fen, threat, turn) {
    return (threat?.defences || []).slice(0, 3).map((item, index) => {
        const line = sanLine(fen, item.pv, 4);
        if(!line.length) return null;
        const does = item.how || mechanism(fen, item.uci);
        const reply = line[1];
        const still = item.verdict === 'fails' && reply ? `, but ${reply.san} still comes` : '';
        // The engine's own move already has its line in the notes, so only say that it handles the threat.
        const engine = item.engineRank ? `, engine ${item.engineRank === 1 ? 'best' : 'second choice'}` : '';
        const verdict = item.verdict !== 'holds' ? '' : item.stops ? ', the threat move is no longer possible' : ', the threat is no longer dangerous after it';
        return { id: `R${index + 1}`, kind: item.verdict === 'holds' ? 'defence that holds' : 'defence that fails', side: turn, weight: 14 - index, line,
            text: `${line[0].san}${does ? `, ${does}` : ''}${engine}${verdict}${still}`
                + `${engine ? '' : `${item.score ? ` (${scoreText(item.score, turn)})` : ''}${line.length > 1 ? `, line ${numberedLine(fen, line)}` : ''}`}`
                + `${item.verdict === 'fails' ? lineOutcome(fen, item.pv, turn) : ''}`,
            references: references({ moves: [[line[0].from, line[0].to]] }) };
    }).filter(Boolean);
}

function askedFact(fen, asked, turn, id = 'A1') {
    if(!asked?.uci && !asked?.san) return null;
    const [move] = asked.uci ? sanLine(fen, [asked.uci], 1) : [];
    if(!move) return { id, kind: 'asked move', side: turn, weight: 30, line: [],
        text: `${asked.san || asked.uci} is not a legal move here${asked.why ? `, ${asked.why}` : ''}`, references: references() };
    const pv = asked.pv?.length ? asked.pv : [asked.uci];
    const line = sanLine(fen, pv, 6);
    const best = asked.bestUci && asked.bestUci !== asked.uci ? sanLine(fen, [asked.bestUci], 1)[0] : null;
    const verdict = asked.label || 'checked';
    const does = mechanism(fen, asked.uci);
    const preference = !best ? asked.bestUci === asked.uci ? ', it is the engine choice' : ''
        : verdict === 'Best Move' ? `, as good as the engine's ${best.san}` : `, engine prefers ${best.san}`;
    return { id, kind: 'asked move', side: turn, weight: 30, line,
        text: `${move.san} is rated ${verdict}${asked.reason ? ` (${asked.reason.replace(/\.$/, '').replace(/’/g, "'")})` : ''}`
            + `${asked.score ? `, ${scoreText(asked.score, turn)}` : ''}${does ? `, ${does}` : ''}${preference}`
            + `${line.length > 1 ? `, likely line ${numberedLine(fen, line)}${lineOutcome(fen, pv, turn)}` : ''}`,
        references: references({ moves: [[move.from, move.to]] }) };
}

function lastFact(last) {
    if(!last?.uci || !last.fen) return null;
    const [move] = sanLine(last.fen, [last.uci], 1);
    if(!move) return null;
    const best = last.bestUci && last.bestUci !== last.uci ? sanLine(last.fen, [last.bestUci], 1)[0] : null;
    const bestLine = best && last.pv?.[0] === last.bestUci ? sanLine(last.fen, last.pv, 5) : [];
    const label = numberedLine(last.fen, [move]);
    return { id: 'M', kind: 'last move', side: move.color, weight: 25, line: [move],
        alternative: best ? { fen: last.fen, line: bestLine.length ? bestLine : [best] } : null,
        text: `${sides[move.color]} just played ${label}, rated ${last.label}${last.reason ? ` (${last.reason.replace(/\.$/, '').replace(/’/g, "'")})` : ''}`
            + `${best ? `, ${best.san} was the engine choice${bestLine.length > 1 ? ` with the line ${numberedLine(last.fen, bestLine)}` : ''}` : ''}`,
        references: references({ moves: [[move.from, move.to]] }) };
}

/**
 * Builds Pena's fact sheet.
 * @param {string} fen
 * @param {{ playerColor?: 'w'|'b', engine?: { lines: { move: string, pv: string[], score: { cp: number|null, mate: number|null } }[] },
 *   threat?: { pv: string[], gain?: number, score?: object }, asked?: object, penaMove?: string, question?: string, limit?: number }} options
 * The complete local pool is kept in facts/byId; only promptFacts is serialized into sheet, up to limit (14 by default).
 */
export function formatFactLine(item, playerColor = null) {
    const owner = !playerColor || !item.side || item.kind === 'asked move' ? ''
        : item.kind.startsWith('engine') ? item.side === playerColor ? '' : ' (opponent to move)'
        : item.kind.startsWith('opponent ') && item.side === playerColor ? ' (you, what you threaten next)'
        : item.side === playerColor ? ' (you)' : ' (opponent)';
    return `[${item.id}] ${item.kind}${owner}: ${item.text}.`;
}

export function factSheet(fen, { playerColor = null, engine = null, threat = null, asked = [], last = null, recent = [], penaMove = null, question = '', limit = 14 } = {}) {
    const board = legal(fen);
    if(!board) throw new Error('Pena needs a legal position for chat.');
    const facts = new Facts(fen);
    const turn = board.turn();
    const fullmove = Number(fen.split(' ')[5]) || 1;
    const count = facts.pieces.filter(item => item.type !== 'p' && item.type !== 'k').length;
    const phase = count <= 6 ? 'endgame' : fullmove <= 10 && count >= 12 ? 'opening' : 'middlegame';
    const balance = material(facts);
    const focus = questionFocus(question, playerColor, turn);
    const askedList = (Array.isArray(asked) ? asked : [asked]).filter(Boolean).slice(-3);
    const special = [...askedList.map((item, index) => askedFact(fen, item, turn, item.inputAlias || `A${index + 1}`)), lastFact(last),
        ...engineFacts(fen, engine, turn), threatFact(fen, threat, turn), ...defenceFacts(fen, threat, turn)].filter(Boolean);
    const board_ = [
        ...loosePieces(facts), ...forks(facts), ...pinsAndSkewers(facts),
        kingSafety(facts, 'w', fen, phase), kingSafety(facts, 'b', fen, phase),
        ...pawnFeatures(facts), ...pawnBreaks(fen), ...outposts(facts), ...files(facts), ...pieceQuality(facts, fen),
        ...filePlans(facts, focus), ...questionMoveFacts(fen, question, focus, last)
    ].filter(Boolean);
    // Keep each kind represented before repeating one, so a tour shows variety.
    const ordered = [];
    const pool = board_.sort((a, b) => b.weight - a.weight);
    const seen = new Set();
    for(const item of pool) if(!seen.has(item.kind)) { seen.add(item.kind); ordered.push(item); }
    for(const item of pool) if(!ordered.includes(item)) ordered.push(item);
    ordered.sort((a, b) => questionRelevance(b, focus) - questionRelevance(a, focus));
    ordered.forEach((item, index) => { item.id = `F${index + 1}`; });
    if(penaMove) {
        const [move] = sanLine(fen, [penaMove], 1);
        if(move) special.push({ id: 'Q', kind: 'pena pick', side: turn, weight: 10, line: [move],
            text: `Pena's own instinct, from the LC0 network, is ${move.san}`, references: references({ moves: [[move.from, move.to]] }) });
    }
    const all = [...special, ...ordered];
    const budget = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 14;
    // Keep the actual move checks and immediate threat before optional alternatives or general context.
    const essential = special.filter(item => item.kind === 'asked move' || ['M', 'L1'].includes(item.id) || item.kind === 'opponent threat');
    const focused = item => {
        if(focus.files.size) return [...focus.files].some(letter => item.text.includes(`${letter}-file`));
        if(ordered.some(fact => fact.kind === 'move effect')) return item.kind === 'move effect';
        if(focus.kinds.size) return focus.kinds.has(item.kind) && questionRelevance(item, focus) > 0;
        if(focus.types.length) return focus.types.some(type => new RegExp(`\\b${names[type]}s?\\b`, 'i').test(item.text));
        return true;
    };
    const rest = [...special.filter(item => !essential.includes(item)), ...ordered.filter(focused)]
        .sort((a, b) => questionRelevance(b, focus) - questionRelevance(a, focus));
    const promptFacts = [...essential, ...rest].slice(0, budget);
    const you = playerColor ? `You play ${sides[playerColor]}. ` : '';
    const moves = recent.length ? ` Recent moves ${recent.join(' ')}.` : '';
    const waiting = playerColor && playerColor !== turn ? ' It is the opponent\'s move, so the engine lines are what they will likely play, not moves for you.' : '';
    const header = `${you}${sides[turn]} to move, move ${fullmove}, ${phase}.${waiting} ${balance.text[0].toUpperCase()}${balance.text.slice(1)}.${moves}`;
    // Off turn, the engine lines are the opponent's and the threat is the player's own next idea, so say so plainly.
    const sheet = [header, ...promptFacts.map(item => formatFactLine(item, playerColor))].join('\n');
    return { fen, turn, phase, header, sheet, facts: all, promptFacts, byId: Object.fromEntries(all.map(item => [item.id, item])) };
}

// Pulls fact citations like [F3] or [L1] out of a reply, keeping where each one appeared so
// the visual lands with the words it belongs to.
// App note tags ([S1], [G1], [U1]) and player memory tags ([P1]) have nothing to draw, they are only removed from the text.
const citationPattern = /\s*\[(F\d{1,2}|L[1-3]|A[1-3]|R[1-3]|T|M|Q|H\d|D:[a-z-]+|[SGUP]\d)\]/g;

export function citations(text, sheet) {
    const found = [];
    let clean = '', last = 0;
    for(const match of text.matchAll(citationPattern)) {
        clean += text.slice(last, match.index);
        last = match.index + match[0].length;
        const fact = sheet.byId[match[1]] || (match[1].startsWith('D:') && sheet.demos?.[match[1].slice(2)]);
        if(fact) found.push({ id: match[1], fact, index: clean.length });
    }
    clean += text.slice(last);
    return { text: clean, citations: found };
}
