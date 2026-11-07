import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { enginePosition } from '../app/assets/js/instance/enginePosition.js';
import { readFileSync } from 'node:fs';

function game(moves, fen) {
    const chess = new Chess(fen);
    const history = [{ fen: { full: chess.fen() } }];
    for(const san of moves) {
        const move = chess.move(san);
        assert.ok(move, `legal fixture move ${san}`);
        history.push({ fen: { full: chess.fen() }, boardChanges: {
            from: move.from, to: move.to, promotionPiece: move.promotion
        } });
    }
    return { chess, history };
}

function replay(command) {
    const [fen, moves = ''] = command.slice('position fen '.length).split(' moves ');
    const chess = new Chess(fen);
    for(const move of moves.split(' ').filter(Boolean)) {
        assert.ok(chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }));
    }
    return chess;
}

test('engine position preserves repetition that a standalone FEN loses', () => {
    const { chess, history } = game(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    assert.equal(chess.in_threefold_repetition(), true);
    assert.equal(new Chess(chess.fen()).in_threefold_repetition(), false);
    const command = enginePosition(chess.fen(), history);
    assert.match(command, / moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8$/);
    assert.equal(replay(command).in_threefold_repetition(), true);
    assert.equal(replay(command).fen(), chess.fen());
});

test('history preserves castling, en passant and promotion', () => {
    for(const fixture of [
        game(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']),
        game(['e4', 'a6', 'e5', 'd5', 'exd6']),
        game(['a8=N'], '7k/P7/8/8/8/8/8/7K w - - 0 1')
    ]) assert.equal(replay(enginePosition(fixture.chess.fen(), fixture.history)).fen(), fixture.chess.fen());
});

test('duplicate snapshots do not manufacture moves or repetitions', () => {
    const { chess, history } = game(['Nf3', 'Nf6']);
    const duplicate = [history[0], history[0], history[1], history[1], history[2]];
    const command = enginePosition(chess.fen(), duplicate);
    assert.match(command, / moves g1f3 g8f6$/);
    assert.equal(replay(command).in_threefold_repetition(), false);
});

test('bounded engine history retains the longest recent legal suffix', () => {
    const { chess, history } = game(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    const full = enginePosition(chess.fen(), history);
    const limit = full.length - 8;
    const command = enginePosition(chess.fen(), history, limit);
    assert.ok(command.length <= limit);
    assert.ok(command.includes(' moves '));
    assert.equal(replay(command).fen(), chess.fen());
    const kept = command.split(' moves ')[1].split(' ').length;
    assert.ok(kept < 8);
    assert.ok(enginePosition(chess.fen(), history.slice(8 - kept - 1)).length > limit);
});

test('external-engine budget retains a full legal history longer than the old limit', () => {
    const moves = Array.from({ length: 1800 }, (_, index) => ['Nf3', 'Nf6', 'Ng1', 'Ng8'][index % 4]);
    const { chess, history } = game(moves);
    const command = enginePosition(chess.fen(), history, 262144);
    assert.ok(command.length > 8192);
    assert.equal(command.split(' moves ')[1].split(' ').length, moves.length);
    assert.equal(replay(command).fen(), chess.fen());
});

test('missing history uses the current FEN; invalid or stale history is explicitly rejected', () => {
    const { chess, history } = game(['e4', 'e5']);
    assert.equal(enginePosition(chess.fen()), `position fen ${chess.fen()}`);
    assert.throws(() => enginePosition(chess.fen(), [history[0], history[2]]), /legally replayed/);
    assert.throws(() => enginePosition(history[0].fen.full, history), /analyzed position/);
    assert.throws(() => enginePosition(chess.fen(), [{}, history[1]]), /initial/);
    assert.throws(() => enginePosition(chess.fen(), [history[0], {}]), /Missing/);
});

test('an explicitly incomplete history is rejected even when its shorter alias legally replays', () => {
    const { chess, history } = game(['Nf3', 'Nf6']);
    history[1].historyIncomplete = true;
    assert.throws(() => enginePosition(chess.fen(), history), /unresolved observation gap/);
    assert.throws(() => enginePosition(chess.fen(), [{ fen: { full: chess.fen() }, historyIncomplete: true }]),
        /unresolved observation gap/);
});

test('incomplete-history markers survive real compact transport and suppress fictional PGN exports', () => {
    const user = readFileSync(new URL('../acas.user.js', import.meta.url), 'utf8');
    const gui = readFileSync(new URL('../app/assets/js/globals.js', import.meta.url), 'utf8');
    const declaration = (source, name) => {
        const start = source.indexOf(`function ${name}(`);
        assert.ok(start >= 0);
        return source.slice(start, source.indexOf('\n}', start) + 2);
    };
    const constants = source => ['BOARD_STATE_FIELDS', 'BOARD_STATE_HISTORY_FIELDS']
        .map(name => source.match(new RegExp(`^const ${name} = .*;$`, 'm'))[0]).join('\n');
    const encode = new Function('storedStateHistory', 'boardState', `
        const BOARD_STATE_FORMAT_VERSION = 1, boardStateRevision = 1;
        ${constants(user)}
        ${declaration(user, 'encodeBoardStateFields')}
        ${declaration(user, 'getBoardState')}
        return getBoardState();`);
    const decode = new Function('values', `${constants(gui)}
        ${declaration(gui, 'DECODE_BOARD_STATE_FIELDS')}
        ${declaration(gui, 'DECODE_BOARD_STATE')}
        return DECODE_BOARD_STATE(values);`);
    const exportPgn = new Function('Chess', 'gameStateHistory',
        `${declaration(gui, 'GET_PGN_FROM_STATE_HISTORY')}; return GET_PGN_FROM_STATE_HISTORY(gameStateHistory);`);
    const { chess, history } = game(['Nf3', 'Nf6']);
    const board = { fen: chess.fen(), turn: chess.turn() };
    const clean = encode([...history].reverse(), board);
    assert.ok(clean[6].every(entry => entry.length <= 6), 'unmarked packets retain the original compact shape');
    assert.equal(decode(clean).history.some(state => state.historyIncomplete), false);
    assert.match(exportPgn(Chess, decode(clean).history), /Nf3/);
    history[1].historyIncomplete = true;
    const packet = encode([...history].reverse(), board);
    assert.equal(packet[6][1][6], true);
    const decoded = decode(packet);
    assert.equal(decoded.history[1].historyIncomplete, true);
    assert.throws(() => enginePosition(chess.fen(), decoded.history), /unresolved observation gap/);
    assert.equal(exportPgn(Chess, decoded.history), null);
});

test('the GUI explicitly reports unavailable PGN rather than presenting an incomplete game as complete', async () => {
    const source = readFileSync(new URL('../app/assets/js/instance/Interface.js', import.meta.url), 'utf8');
    const start = source.indexOf('    async updatePgn() {');
    const end = source.indexOf('    async updateBoardFen(', start);
    assert.ok(start >= 0 && end > start);
    let updated = false;
    const method = new Function('updatePipOpening', `return ({ ${source.slice(start, end)} }).updatePgn;`)(
        () => { updated = true; });
    const pgn = {}, opening = { innerText: 'An obsolete opening' };
    await method.call({
        AcasInstance: {
            gameStateHistory: [{ historyIncomplete: true }],
            instanceElem: { querySelector: selector => selector === '.instance-pgn' ? pgn : opening }
        },
        getPgnConfig() { assert.fail('Incomplete history must not be sent to a PGN generator'); }
    });
    assert.match(pgn.innerText, /PGN unavailable: moves were missed/);
    assert.equal(opening.innerText, '');
    assert.equal(updated, true);
});
