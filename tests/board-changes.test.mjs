import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';

const source = readFileSync(new URL('../acas.user.js', import.meta.url), 'utf8');
const component = readFileSync(new URL('../userscript-components/BoardChangeParser.js', import.meta.url), 'utf8');
function declaration(name) {
    const start = new RegExp(`^function ${name}\\(`, 'm').exec(source)?.index;
    assert.notEqual(start, undefined, `Missing production helper ${name}`);
    const end = source.indexOf('\n}', start);
    assert.ok(end > start);
    return source.slice(start, end + 2);
}
const shared = ['getBoardChangesObjTemplate', 'getFenPieceColor'].map(declaration).join('\n');
const helpers = new Function(`${shared}; return { getBoardChangesObjTemplate, getFenPieceColor };`)();
const BoardChangeParser = new Function(`${component}; return BoardChangeParser;`)();
const parser = new BoardChangeParser(helpers);
const basic = fen => fen.split(' ')[0];
const pieceFen = (piece, color) => color === 'w' ? piece.toUpperCase() : piece;

function assertDiffShape(before, after, actual) {
    const oldBoard = new Chess(`${before} w - - 0 1`).board();
    const newBoard = new Chess(`${after} w - - 0 1`).board();
    const removed = [], added = [];
    let squares = 0;
    for(let row = 0; row < 8; row++) {
        for(let col = 0; col < 8; col++) {
            const oldPiece = oldBoard[row][col], newPiece = newBoard[row][col];
            const oldToken = oldPiece && pieceFen(oldPiece.type, oldPiece.color);
            const newToken = newPiece && pieceFen(newPiece.type, newPiece.color);
            if(oldToken === newToken) continue;
            squares++;
            const square = String.fromCharCode(97 + col) + (8 - row);
            if(oldToken) removed.push({ square, piece: oldToken, row, col });
            if(newToken) added.push({ square, piece: newToken, row, col });
        }
    }
    assert.deepEqual(actual.removed, removed);
    assert.deepEqual(actual.added, added);
    assert.deepEqual(actual.movedPieces, removed.map(change => change.piece));
    assert.equal(actual.changedSquaresAmount, squares);
    assert.equal(actual.pieceAmountChange, added.length - removed.length);
}

function assertMove(before, after, move, actual = parser.getBoardChanges(before, after, move.color)) {
    const context = `${before} -> ${after}: ${move.san}`;
    assert.equal(actual.from, move.from, context);
    assert.equal(actual.to, move.to, context);
    assert.equal(actual.movedPiece, pieceFen(move.piece, move.color), context);
    assert.equal(actual.movedPieceColor, move.color, context);
    assert.equal(actual.capturedPiece, move.captured ? pieceFen(move.captured, move.color === 'w' ? 'b' : 'w') : null, context);
    assert.equal(actual.isPromotion, Boolean(move.promotion), context);
    assert.equal(actual.promotionPiece, move.promotion ? pieceFen(move.promotion, move.color) : null, context);
    assert.equal(actual.isEnPassant, move.flags.includes('e'), context);
    assert.equal(actual.capturedSquare, move.captured
        ? move.flags.includes('e') ? move.to[0] + move.from[1] : move.to
        : null, context);
    assert.equal(actual.pieceAmountChange, move.captured ? -1 : 0, context);
    assert.equal(actual.changedSquaresAmount, /[kq]/.test(move.flags) ? 4 : move.flags.includes('e') ? 3 : 2, context);
    assert.equal(actual.missedFen, null, context);
    assert.equal(actual.removed.length, actual.movedPieces.length, context);
    assert.equal(actual.added.length - actual.removed.length, actual.pieceAmountChange, context);
    for(const entry of [...actual.removed, ...actual.added]) {
        assert.equal(entry.square, String.fromCharCode(97 + entry.col) + (8 - entry.row), context);
    }
    assertDiffShape(before, after, actual);
    return actual;
}

test('component has no page/global side effects, logging, timers, storage or network access', () => {
    const context = vm.createContext({});
    for(const name of ['window', 'unsafeWindow', 'document', 'console', 'fetch', 'GM',
        'setTimeout', 'setInterval', 'MutationObserver', 'localStorage']) {
        Object.defineProperty(context, name, { get() { assert.fail(`Component accessed ${name}`); } });
    }
    const keys = Object.keys(context);
    vm.runInContext(component, context);
    assert.deepEqual(Object.keys(context), keys);
    const IsolatedParser = vm.runInContext('BoardChangeParser', context);
    const isolated = new IsolatedParser(helpers);
    assert.equal(isolated.getBoardChanges('8/8/8/8/8/8/P7/8', '8/8/8/8/8/P7/8/8').from, 'a2');
    assert.doesNotMatch(component, /function (?:getFenPieceColor|getBoardChangesObjTemplate)\(/);
    assert.equal(Object.hasOwn(context, 'BoardChangeParser'), false);
});

test('injected helpers are used, calls are independent and inputs are not mutated', () => {
    let templates = 0, colors = 0;
    const injected = new BoardChangeParser({
        getBoardChangesObjTemplate() { templates++; return helpers.getBoardChangesObjTemplate(); },
        getFenPieceColor(piece) { colors++; return helpers.getFenPieceColor(piece); }
    });
    const empty = injected.getBoardChanges(null, null);
    empty.added.push({});
    assert.deepEqual(injected.getBoardChanges('', ''), helpers.getBoardChangesObjTemplate());
    assert.equal(templates, 2);
    const before = '8/p7/8/8/8/8/P7/8', after = '8/8/p7/8/8/P7/8/8';
    const actual = injected.getBoardChanges(before, after, 'w');
    assert.equal(actual.missedFen, '8/p7/8/8/8/P7/8/8');
    assert.ok(colors > 0);
    assert.equal(before, '8/p7/8/8/8/8/P7/8');
    assert.deepEqual(injected.getBoardChanges(before, after, 'w'), actual);
});

test('both colors, both castling sides, all promotion types, captures and en passant', () => {
    for(const [fen, moves] of [
        [undefined, ['e4', 'a6', 'e5', 'd5', 'exd6']],
        [undefined, ['a3', 'e5', 'a4', 'e4', 'd4', 'exd3']],
        ...['w', 'b'].flatMap(color => ['O-O', 'O-O-O'].map(move =>
            [`r3k2r/8/8/8/8/8/8/R3K2R ${color} KQkq - 0 1`, [move]])),
        ...['q', 'r', 'b', 'n'].flatMap(role => [
            ['7k/P7/8/8/8/8/8/7K w - - 0 1', [`a8=${role.toUpperCase()}`]],
            ['1r5k/P7/8/8/8/8/8/7K w - - 0 1', [`axb8=${role.toUpperCase()}`]],
            ['7k/8/8/8/8/8/p7/7K b - - 0 1', [`a1=${role.toUpperCase()}`]],
            ['7k/8/8/8/8/8/p7/1R5K b - - 0 1', [`axb1=${role.toUpperCase()}`]]
        ])
    ]) {
        const chess = new Chess(fen);
        for(const san of moves) {
            const before = basic(chess.fen());
            const move = chess.move(san);
            assert.ok(move, san);
            assertMove(before, basic(chess.fen()), move);
        }
    }
});

test('snapshot-only changes, variant tokens, pockets and rectangular boards retain their shape', () => {
    for(const fen of [null, '', '8/8/8/8/8/8/8/8', '10/10/10/10', '+P8p~/10/10/10[PNq]',
        '8/8/8/8/8/8/8/8 w - - 0 1']) {
        assert.deepEqual(parser.getBoardChanges(fen, fen), helpers.getBoardChangesObjTemplate());
    }
    const removal = parser.getBoardChanges('8/8/8/8/8/8/P7/8', '8/8/8/8/8/8/8/8', 'w');
    assert.equal(removal.changedSquaresAmount, 1);
    assert.equal(removal.pieceAmountChange, -1);
    assert.equal(removal.from, null);
    assert.equal(removal.missedFen, null);
    const drop = parser.getBoardChanges('8/8/8/8/8/8/8/8[N]', '8/8/8/8/3N4/8/8/8[]', 'w');
    assert.equal(drop.from, 'N@');
    assert.equal(drop.to, 'd4');
    assert.equal(drop.missedFen, null);
    const promoted = parser.getBoardChanges('8/8/8/8/3Q~4/8/8/8[]', '8/8/8/3Q~4/8/8/8/8[]');
    assert.equal(promoted.from, 'd4');
    assert.equal(promoted.to, 'd5');
    assert.equal(promoted.movedPiece, 'Q~');
    const shogi = parser.getBoardChanges('+P8p~/10/10/10', '9p~/+P9/10/10');
    assert.equal(shogi.from, 'a4');
    assert.equal(shogi.to, 'a3');
    const rectangular = parser.getBoardChanges('12/12/12/11P/12/12', '12/12/11P/12/12/12');
    assert.equal(rectangular.from, 'l3');
    assert.equal(rectangular.to, 'l4');
    const pocket = parser.getBoardChanges('8/8/8/8/8/8/8/8[Q]', '8/8/8/8/8/8/8/8[P]', 'w');
    assert.deepEqual(pocket, helpers.getBoardChangesObjTemplate());
});

test('Chess960 overlap and stationary pieces are not mistaken for friendly captures', () => {
    for(const color of ['w', 'b']) {
        const rank = color === 'w' ? '1' : '8';
        for(const [kingFrom, rookFrom] of [['e', 'h'], ['g', 'h'], ['e', 'f'], ['f', 'g'], ['e', 'g'], ['f', 'h']]) {
            const kings = color === 'w' ? { a8: 'k' } : { a1: 'K' };
            const before = position({ ...kings, [kingFrom + rank]: pieceFen('k', color),
                [rookFrom + rank]: pieceFen('r', color) }, color);
            const after = position({ ...kings, ['g' + rank]: pieceFen('k', color),
                ['f' + rank]: pieceFen('r', color) }, color);
            const actual = parser.getBoardChanges(basic(before), basic(after), color);
            assert.equal(actual.pieceAmountChange, 0);
            assert.equal(actual.capturedPiece, null, `${kingFrom}/${rookFrom}, ${color}`);
            assert.equal(actual.capturedSquare, null);
            assert.equal(actual.missedFen, null);
            // A stationary king is indistinguishable from an ordinary rook move.
            assert.equal(actual.from, (kingFrom === 'g' ? rookFrom : kingFrom) + rank);
            assert.equal(actual.to, (kingFrom === 'g' ? 'f' : 'g') + rank);
        }
    }
});

test('missed quiet moves, recaptures, promotions, castling and en passant replies', () => {
    for(const [fen, moves] of [
        [undefined, ['e4', 'e5']],
        [undefined, ['Nf3', 'd5']],
        ['4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1', ['exd5', 'cxd5']],
        ['4k3/8/8/4p3/3P4/2P5/8/4K3 b - - 0 1', ['exd4', 'cxd4']],
        ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', ['a8=Q', 'Ke7']],
        ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', ['a1=N', 'Ke2']],
        ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['O-O', 'O-O-O']],
        ['r3k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', ['O-O', 'Rxa1']],
        ['r3k2r/8/8/8/8/8/8/R3K3 b kq - 0 1', ['O-O', 'Rxa8']],
        ['4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', ['e4', 'dxe3']],
        ['4k3/4p3/8/3P4/8/8/8/4K3 b - - 0 1', ['e5', 'dxe6']]
    ]) {
        const chess = new Chess(fen), before = basic(chess.fen()), turn = chess.turn();
        assert.ok(chess.move(moves[0]));
        const middle = basic(chess.fen());
        assert.ok(chess.move(moves[1]));
        const after = basic(chess.fen());
        assert.equal(parser.getBoardChanges(before, after, turn).missedFen, middle, moves.join(' '));
        assertLegalRecovery(`${before} ${turn} ${fen?.split(' ')[2] || 'KQkq'} ${fen?.split(' ')[3] || '-'} 0 1`, middle, after);
    }
});

function position(pieces, turn, rights = '-', ep = '-') {
    const board = Array.from({ length: 8 }, () => Array(8).fill(''));
    for(const [square, piece] of Object.entries(pieces)) {
        board[8 - Number(square[1])][square.charCodeAt(0) - 97] = piece;
    }
    return board.map(row => {
        let result = '', empty = 0;
        for(const piece of row) {
            if(!piece) { empty++; continue; }
            if(empty) result += empty;
            result += piece;
            empty = 0;
        }
        return result + (empty || '');
    }).join('/') + ` ${turn} ${rights} ${ep} 0 1`;
}

test('every pawn file, promotion choice, capture direction and en-passant direction', () => {
    for(const color of ['w', 'b']) {
        for(let file = 0; file < 8; file++) {
            const letter = String.fromCharCode(97 + file);
            for(const role of ['q', 'r', 'b', 'n']) {
                for(const delta of [-1, 0, 1]) {
                    if(file + delta < 0 || file + delta > 7) continue;
                    const from = letter + (color === 'w' ? 7 : 2);
                    const to = String.fromCharCode(97 + file + delta) + (color === 'w' ? 8 : 1);
                    const pieces = color === 'w'
                        ? { e1: 'K', [file < 4 ? 'h6' : 'a6']: 'k', [from]: 'P' }
                        : { e8: 'k', [file < 4 ? 'h3' : 'a3']: 'K', [from]: 'p' };
                    if(delta) pieces[to] = color === 'w' ? 'r' : 'R';
                    const chess = new Chess(position(pieces, color)), before = basic(chess.fen());
                    const move = chess.move({ from, to, promotion: role });
                    assert.ok(move, `${from}${to}${role}`);
                    assertMove(before, basic(chess.fen()), move);
                }
            }
            for(const delta of [-1, 1]) {
                if(file + delta < 0 || file + delta > 7) continue;
                const adjacent = String.fromCharCode(97 + file + delta);
                const from = letter + (color === 'w' ? 5 : 4);
                const captured = adjacent + from[1];
                const to = adjacent + (color === 'w' ? 6 : 3);
                const fen = position({ a1: 'K', h8: 'k', [from]: color === 'w' ? 'P' : 'p',
                    [captured]: color === 'w' ? 'p' : 'P' }, color, '-', to);
                const chess = new Chess(fen), before = basic(chess.fen());
                const move = chess.move({ from, to });
                assert.ok(move);
                assert.ok(move.flags.includes('e'));
                assertMove(before, basic(chess.fen()), move);
                const middle = basic(chess.fen());
                const reply = chess.moves()[0];
                assert.ok(reply);
                assert.ok(chess.move(reply));
                assert.equal(parser.getBoardChanges(before, basic(chess.fen()), color).missedFen, middle);
            }
        }
    }
});

test('historical heuristic preference is retained only when it leaves the king safe', () => {
    const ambiguous = '4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1';
    const chess = new Chess(ambiguous);
    chess.move('e3'); chess.move('dxe3');
    const after = basic(chess.fen());
    const inferred = parser.getBoardChanges(basic(ambiguous), after, 'w').missedFen;
    assert.equal(inferred, '4k3/8/8/8/3pP3/8/8/4K3');
    assertLegalRecovery(ambiguous, inferred, after);

    const checked = 'r1bk2nr/ppp2ppp/1qn5/3p2PP/1b1p1P2/PP6/2P1P1B1/RNBQK1NR w KQ - 1 11';
    const game = new Chess(checked);
    assert.ok(game.in_check());
    assert.ok(game.move('c3'));
    const middle = basic(game.fen());
    assert.ok(game.move('dxc3'));
    assert.equal(parser.getBoardChanges(basic(checked), basic(game.fen()), 'w').missedFen, middle);
});

test('known history metadata constrains reconstruction without requiring page functions', () => {
    const chess = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const before = basic(chess.fen());
    chess.move('exd6'); const middle = basic(chess.fen()); chess.move('Kd7');
    const after = basic(chess.fen());
    assert.equal(parser.getBoardChanges(before, after, 'w', { enPassantTarget: 'd6' }).missedFen, middle);
    assert.equal(parser.getBoardChanges(before, after, 'w', { enPassantTarget: '-' }).missedFen, null);
    const castles = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const from = basic(castles.fen());
    castles.move('O-O'); const intermediate = basic(castles.fen()); castles.move('O-O-O');
    const to = basic(castles.fen());
    assert.equal(parser.getBoardChanges(from, to, 'w', { castlingRights: 'Kq' }).missedFen, intermediate);
    for(const rights of ['-', 'K', 'q'])
        assert.equal(parser.getBoardChanges(from, to, 'w', { castlingRights: rights }).missedFen, null);
});

test('observed last-move squares break a genuine tie while stale highlights retain the fallback', () => {
    const chess = new Chess('7k/8/1p6/p1p5/1B6/8/8/7K w - - 0 1');
    const full = chess.fen(), before = basic(full);
    assert.ok(chess.move('Bxc5')); const middle = basic(chess.fen());
    assert.ok(chess.move('bxc5')); const after = basic(chess.fen());
    const baseline = parser.getBoardChanges(before, after, 'w').missedFen;
    assert.notEqual(baseline, middle);
    assertLegalRecovery(full, baseline, after);
    for(const squares of [['b6', 'c5'], ['c5', 'b6']]) {
        assert.equal(parser.getBoardChanges(before, after, 'w', { lastMoveSquares: squares }).missedFen, middle);
    }
    for(const squares of [null, [], ['e2', 'e4'], ['b6', 'b6'], ['bad', 'c5']]) {
        assert.equal(parser.getBoardChanges(before, after, 'w', { lastMoveSquares: squares }).missedFen, baseline);
    }
});

test('a promotion captured before observation does not fabricate an unobservable promotion choice', () => {
    for(const role of ['Q', 'R', 'B', 'N']) {
        const chess = new Chess('r1b1k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
        const before = basic(chess.fen());
        assert.ok(chess.move(`b8=${role}`));
        assert.ok(chess.move('Rxb8'));
        assert.equal(parser.getBoardChanges(before, basic(chess.fen()), 'w').missedFen, null);
    }
});

test('conservative mode reports ambiguity instead of ranking histories using possibly stale highlights', () => {
    const fen = '7k/8/1p6/p1p5/1B6/8/8/7K w - - 0 1';
    const chess = new Chess(fen), before = basic(chess.fen());
    chess.move('Bxc5'); chess.move('bxc5');
    for(const hint of [undefined, ['b6', 'c5'], ['e2', 'e4']]) {
        const diff = parser.getBoardChanges(before, basic(chess.fen()), 'w', {
            conservative: true, currentTurn: 'w', lastMoveSquares: hint
        });
        assert.equal(diff.missedFen, null);
        assert.equal(diff.recovery.status, 'ambiguous');
        assert.ok(diff.recovery.candidates >= 2);
    }
});

test('conservative uniqueness includes every role of a promotion captured before observation', () => {
    const fen = 'r1b1k3/1P6/8/8/8/8/8/4K3 w - - 0 1';
    const chess = new Chess(fen);
    chess.move('b8=Q'); chess.move('Rxb8');
    const diff = parser.getBoardChanges(basic(fen), basic(chess.fen()), 'w', {
        conservative: true, currentTurn: 'w'
    });
    assert.equal(diff.missedFen, null);
    assert.equal(diff.recovery.status, 'ambiguous');
    assert.equal(diff.recovery.candidates, 4);
});

test('conservative turn parity blocks a real three-ply burst from masquerading as two moves', () => {
    const fen = '6r1/p3b2p/1p1p4/5k2/PP6/2PP4/5KPP/4R3 b - - 1 24';
    const chess = new Chess(fen);
    for(const san of ['Bh4+', 'g3', 'Bg5']) assert.ok(chess.move(san));
    const diff = parser.getBoardChanges(basic(fen), basic(chess.fen()), 'b', {
        conservative: true, currentTurn: chess.turn()
    });
    assert.equal(diff.missedFen, null);
    assert.equal(diff.recovery.status, 'unresolved');
});

test('a legal single move takes precedence over stale DOM turn metadata in conservative mode', () => {
    const chess = new Chess(), before = basic(chess.fen());
    chess.move('e4');
    const diff = parser.getBoardChanges(before, basic(chess.fen()), 'w', {
        conservative: true, currentTurn: 'w'
    });
    assert.equal(diff.recovery.status, 'single');
    assert.equal(diff.missedFen, null);
    assert.equal(diff.from, 'e2');
    assert.equal(diff.to, 'e4');
});

test('conservative two-ply uniqueness agrees with exhaustive legal special-position trees', t => {
    let pairs = 0, accepted = 0, ambiguous = 0;
    for(const fen of [
        new Chess().fen(),
        'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
        '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1',
        'r1b1k3/1P6/8/8/8/8/8/4K3 w - - 0 1',
        '4k3/8/8/8/8/8/1p6/R1B1K3 b - - 0 1',
        '7k/8/1p6/p1p5/1B6/8/8/7K w - - 0 1'
    ]) {
        const chess = new Chess(fen), histories = new Map(), turn = chess.turn();
        for(const first of chess.moves({ verbose: true })) {
            chess.move(first);
            const middle = basic(chess.fen());
            for(const reply of chess.moves({ verbose: true })) {
                chess.move(reply);
                const after = basic(chess.fen());
                if(!histories.has(after)) histories.set(after, new Set());
                histories.get(after).add(middle);
                chess.undo();
                pairs++;
            }
            chess.undo();
        }
        for(const [after, candidates] of histories) {
            const diff = parser.getBoardChanges(basic(fen), after, turn, {
                conservative: true, currentTurn: turn,
                castlingRights: fen.split(' ')[2], enPassantTarget: fen.split(' ')[3]
            });
            if(diff.missedFen) {
                assert.equal(candidates.size, 1, `${fen} -> ${after} has multiple legal histories`);
                assert.ok(candidates.has(diff.missedFen));
                assert.equal(diff.recovery.status, 'unique-within-two-plies');
                accepted++;
            } else if(candidates.size > 1) ambiguous++;
        }
    }
    t.diagnostic(`${pairs} legal two-ply paths; ${accepted} unique endpoints accepted; ${ambiguous} ambiguous endpoints not guessed`);
});

test('en passant followed by recapture is recovered on every file and for both colors', () => {
    for(const color of ['w', 'b']) {
        for(let file = 0; file < 8; file++) {
            for(const delta of [-1, 1]) {
                if(file + delta < 0 || file + delta > 7) continue;
                const fromFile = String.fromCharCode(97 + file);
                const toFile = String.fromCharCode(97 + file + delta);
                const rank = color === 'w' ? '5' : '4', targetRank = color === 'w' ? '6' : '3';
                const kingFile = toFile === 'a' ? 'h' : 'a';
                const fen = position({
                    [kingFile + '1']: 'K', [kingFile + '8']: 'k',
                    [fromFile + rank]: color === 'w' ? 'P' : 'p',
                    [toFile + rank]: color === 'w' ? 'p' : 'P',
                    [toFile + (color === 'w' ? '8' : '1')]: color === 'w' ? 'r' : 'R'
                }, color, '-', toFile + targetRank);
                const chess = new Chess(fen), before = basic(chess.fen());
                assert.ok(chess.move({ from: fromFile + rank, to: toFile + targetRank }));
                const middle = basic(chess.fen());
                assert.ok(chess.move({ from: toFile + (color === 'w' ? '8' : '1'), to: toFile + targetRank }));
                const after = basic(chess.fen()), context = { enPassantTarget: toFile + targetRank };
                assert.equal(parser.getBoardChanges(before, after, color, context).missedFen, middle, fen);
                assert.equal(parser.getBoardChanges(before, after, color, { enPassantTarget: '-' }).missedFen, null);
                assertLegalRecovery(fen, middle, after);
            }
        }
    }
});

test('a same-token promotion recapture does not hide a uniquely recoverable first move', () => {
    for(const replyColor of ['w', 'b']) {
        for(const role of ['q', 'r', 'b', 'n']) {
            const fen = position(replyColor === 'w'
                ? { a8: role.toUpperCase(), b7: 'P', a6: 'r', h1: 'K', h5: 'k' }
                : { a1: role, b2: 'p', a3: 'R', h8: 'k', h4: 'K' },
                replyColor === 'w' ? 'b' : 'w');
            const chess = new Chess(fen), before = basic(chess.fen());
            const first = chess.move({ from: replyColor === 'w' ? 'a6' : 'a3',
                to: replyColor === 'w' ? 'a8' : 'a1' });
            assert.ok(first);
            const middle = basic(chess.fen());
            assert.ok(chess.move({ from: replyColor === 'w' ? 'b7' : 'b2',
                to: replyColor === 'w' ? 'a8' : 'a1', promotion: role }));
            const after = basic(chess.fen());
            assert.equal(parser.getBoardChanges(before, after, first.color).missedFen, middle, fen);
            assertLegalRecovery(fen, middle, after);
        }
    }
    for(const [fen, moves] of [
        ['3Q4/2P5/4kb2/1p4pp/1P3p2/5PB1/6PP/3R1K2 b - - 0 44', ['Bxd8', 'cxd8=Q']],
        ['3r3r/ppQ1P3/6pp/3p1pk1/8/3B4/P4PPP/4RRK1 w - - 1 30', ['exd8=Q+', 'Rxd8']]
    ]) {
        const chess = new Chess(fen), before = basic(chess.fen());
        assert.ok(chess.move(moves[0])); const middle = basic(chess.fen());
        assert.ok(chess.move(moves[1])); const after = basic(chess.fen());
        // The first case has an observed promotion on the reply; the second
        // hides the promoted piece entirely and must remain unresolved.
        assert.equal(parser.getBoardChanges(before, after, fen.split(' ')[1]).missedFen,
            moves[0].includes('=') ? null : middle);
    }
});

test('transient removals/additions, board replacements and multi-ply jumps never mutate prior results', () => {
    const start = basic(new Chess().fen());
    const chess = new Chess();
    const first = parser.getBoardChanges(start, start, 'w');
    const saved = structuredClone(first);
    for(const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6']) chess.move(san);
    const later = basic(chess.fen());
    for(const before of ['', start, later, '8/8/8/8/8/8/8/8']) {
        for(const after of ['', start, later, '8/8/8/8/8/8/8/8']) {
            for(const turn of [undefined, 'w', 'b']) {
                const actual = parser.getBoardChanges(before, after, turn);
                assert.ok(Array.isArray(actual.removed));
                assert.ok(Array.isArray(actual.added));
                assert.ok(Number.isInteger(actual.changedSquaresAmount));
                assert.ok(Number.isInteger(actual.pieceAmountChange));
                assert.equal(actual.added.length - actual.removed.length, actual.pieceAmountChange);
            }
        }
    }
    assert.deepEqual(first, saved);
});

test('exhaustive two-ply trees from special-move and endgame positions', t => {
    let pairs = 0, recovered = 0, different = 0;
    const missing = [];
    for(const fen of [
        undefined,
        'r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
        'r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R b KQkq - 0 1',
        'r3k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
        'r3k2r/8/8/8/8/8/8/R3K3 b kq - 0 1',
        '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1',
        'r1b1k3/1P6/8/8/8/8/8/4K3 w - - 0 1',
        '4k3/8/8/8/8/8/1p6/R1B1K3 b - - 0 1',
        '4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1',
        '4k3/8/8/4p3/3P4/2P5/8/4K3 b - - 0 1'
    ]) {
        const chess = new Chess(fen), full = chess.fen(), before = basic(full), turn = chess.turn();
        for(const first of chess.moves()) {
            const firstMove = chess.move(first);
            assert.ok(firstMove);
            const middle = basic(chess.fen());
            assertMove(before, middle, firstMove);
            for(const reply of chess.moves()) {
                const secondMove = chess.move(reply);
                assert.ok(secondMove);
                const after = basic(chess.fen());
                assertMove(middle, after, secondMove);
                const inferred = parser.getBoardChanges(before, after, turn).missedFen;
                pairs++;
                if(inferred) {
                    recovered++;
                    if(inferred !== middle) different++;
                    assertLegalRecovery(full, inferred, after);
                } else if(missing.length < 5) missing.push({ before, moves: [first, reply] });
                chess.undo();
            }
            chess.undo();
        }
    }
    t.diagnostic(JSON.stringify({ pairs, recovered, different, missing }));
    assert.ok(pairs > 2000);
    assert.ok(recovered / pairs > 0.98);
});

function randomSource(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
}

function assertLegalRecovery(beforeFull, inferred, after) {
    const chess = new Chess(beforeFull);
    for(const target of [inferred, after]) {
        const diff = parser.getBoardChanges(basic(chess.fen()), target);
        const move = diff.from && diff.to && chess.move({
            from: diff.from, to: diff.to, promotion: diff.promotionPiece?.toLowerCase()
        });
        assert.ok(move, `Illegal recovery ${beforeFull} -> ${inferred} -> ${after}`);
        assert.equal(basic(chess.fen()), target, `Wrong recovery ${beforeFull} -> ${inferred} -> ${after}`);
    }
}

test('deterministic legal-match corpus: every single ply and adjacent missed-ply pair', t => {
    const games = Number(process.env.BOARD_CHANGE_GAMES || 1000);
    const plies = Number(process.env.BOARD_CHANGE_PLIES || 100);
    assert.ok(Number.isInteger(games) && games > 0);
    assert.ok(Number.isInteger(plies) && plies > 1);
    let positions = 0, pairs = 0, recovered = 0, different = 0, parserMs = 0;
    const events = { captures: 0, castles: 0, promotions: 0, enPassant: 0 };
    const examples = [], unrecoveredExamples = [];
    let contextualExact = 0, hintedExact = 0, contextUnresolved = 0;
    for(let game = 0; game < games; game++) {
        const random = randomSource(game + 1), chess = new Chess();
        let previous = null;
        for(let ply = 0; ply < plies; ply++) {
            const legal = chess.moves();
            if(!legal.length) break;
            const full = chess.fen(), before = basic(full), turn = chess.turn();
            const move = chess.move(legal[Math.floor(random() * legal.length)]);
            assert.ok(move);
            if(move.captured) events.captures++;
            if(/[kq]/.test(move.flags)) events.castles++;
            if(move.promotion) events.promotions++;
            if(move.flags.includes('e')) events.enPassant++;
            const after = basic(chess.fen());
            const start = performance.now();
            const actual = parser.getBoardChanges(before, after, turn);
            parserMs += performance.now() - start;
            assertMove(before, after, move, actual);
            positions++;
            if(previous) {
                const start = performance.now();
                const pair = parser.getBoardChanges(previous.before, after, previous.turn);
                parserMs += performance.now() - start;
                assertDiffShape(previous.before, after, pair);
                const context = {
                    castlingRights: previous.full.split(' ')[2],
                    enPassantTarget: previous.full.split(' ')[3]
                };
                const contextual = parser.getBoardChanges(previous.before, after, previous.turn, context).missedFen;
                const hinted = parser.getBoardChanges(previous.before, after, previous.turn, {
                    ...context, lastMoveSquares: [move.from, move.to]
                }).missedFen;
                if(contextual === before) contextualExact++;
                if(hinted === before) hintedExact++;
                if(!contextual) contextUnresolved++;
                for(const inferred of new Set([contextual, hinted]))
                    if(inferred && inferred !== before) assertLegalRecovery(previous.full, inferred, after);
                pairs++;
                if(pair.missedFen) {
                    recovered++;
                    if(pair.missedFen !== before) assertLegalRecovery(previous.full, pair.missedFen, after);
                    if(pair.missedFen !== before) {
                        different++;
                        if(examples.length < 3) examples.push({ before: previous.before, middle: before,
                            after, inferred: pair.missedFen, moves: [previous.san, move.san] });
                    }
                } else if(unrecoveredExamples.length < 3) unrecoveredExamples.push({
                    before: previous.before, after, moves: [previous.san, move.san] });
            }
            previous = { before, full, turn, san: move.san };
        }
    }
    t.diagnostic(JSON.stringify({ games, positions, pairs, recovered, different,
        parserMs: Math.round(parserMs), microsecondsPerDiff: Math.round(parserMs * 1000 / (positions + pairs)),
        contextualExact, hintedExact, contextUnresolved, events, examples, unrecoveredExamples }));
    assert.ok(positions >= games * 2, 'The corpus must exercise full matches, not just initialization');
    assert.ok(recovered / pairs >= 0.99, 'At least 99% of adjacent missed-ply pairs must be recoverable');
    assert.ok(contextualExact / pairs >= 0.99, 'History-aware exact recovery must exceed 99% on the corpus');
    assert.ok(hintedExact >= contextualExact, 'Fresh last-move hints must not reduce exact recovery');
    assert.ok(parserMs / (positions + pairs) < 1, 'Mean parser time must remain below 1 ms per diff');
});
