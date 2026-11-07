import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../acas.user.js', import.meta.url), 'utf8');
const component = readFileSync(new URL('../userscript-components/BoardChangeParser.js', import.meta.url), 'utf8');
const shared = ['getBoardChangesObjTemplate', 'getFenPieceColor'].map(name => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');
const context = vm.createContext({});
for(const name of ['console', 'window', 'unsafeWindow', 'document', 'fetch', 'GM',
    'localStorage', 'setTimeout', 'setInterval', 'MutationObserver']) {
    Object.defineProperty(context, name, { get() { assert.fail(`Parser accessed forbidden global ${name}`); } });
}
const parser = vm.runInContext(`${component}\n${shared}
    new BoardChangeParser({ getBoardChangesObjTemplate, getFenPieceColor });`, context);

test('known nonstandard variants quietly retain diffs but never invoke orthodox recovery', () => {
    const before = '4k3/8/8/8/8/8/P7/4K3';
    const after = '8/4k3/8/8/8/P7/8/4K3';
    let checks = 0;
    for(const variant of ['atomic', 'antichess', 'horde', 'racing-kings', 'king-of-the-hill',
        '3check', 'crazyhouse', 'chess960', 'capablanca', 'shogi', 'unknown-variant']) {
        for(const conservative of [false, true]) {
            for(const turn of ['w', 'b', undefined]) {
                for(const [oldFen, newFen] of [
                    [before, after],
                    ['4k3/8/8/2brn3/2RPp3/8/8/4K3', '4k3/8/8/8/4p3/8/8/4K3'],
                    ['8/8/8/8/8/8/P7/4K3', '8/8/8/8/8/P7/8/4K3'],
                    [before, before]
                ]) {
                    const diff = parser.getBoardChanges(oldFen, newFen, turn, {
                        variant, conservative, currentTurn: turn
                    });
                    assert.equal(diff.missedFen, null);
                    assert.equal(diff.recovery, undefined);
                    assert.equal(diff.pieceAmountChange, diff.added.length - diff.removed.length);
                    checks++;
                }
            }
        }
    }
    assert.equal(checks, 264);
});

test('rectangular boards, pockets and variant tokens remain quiet across moves, removals and replacements', t => {
    let checks = 0;
    for(const width of [3, 5, 8, 9, 10, 12, 16]) {
        for(const height of [3, 5, 8, 9, 10, 12, 16]) {
            const empty = Array(height).fill(String(width));
            const placed = (row, token) => empty.map((rank, index) =>
                index === row ? token + (width - 1) : rank).join('/');
            for(const token of ['P', 'k', 'Q~', '+P', 'a', '*']) {
                for(const pockets of ['', '[PNq]']) {
                    const first = placed(0, token) + pockets;
                    const second = placed(height - 1, token) + pockets;
                    for(const [before, after] of [
                        [first, second], [first, empty.join('/') + pockets],
                        [empty.join('/') + pockets, second], [first, first]
                    ]) {
                        const diff = parser.getBoardChanges(before, after, 'w', {
                            conservative: true, variant: 'unsupported'
                        });
                        assert.equal(diff.missedFen, null);
                        assert.equal(diff.recovery, undefined);
                        assert.equal(diff.added.length - diff.removed.length, diff.pieceAmountChange);
                        checks++;
                    }
                }
            }
        }
    }
    // Board-size switches during replacement also cannot enter reconstruction.
    for(const [before, after] of [['8/8/8/8/8/8/P7/8', '10/10/10/10/10'],
        ['10/10/10/10/P9', '8/8/8/8/8/8/8/8']]) {
        assert.equal(parser.getBoardChanges(before, after, 'w', { conservative: true }).missedFen, null);
    }
    for(const [before, after] of [
        ['10/10/10/10/P9', '10/10/10/P9/10'],
        ['8/8/8/8/8/8/P7/8[N]', '8/8/8/8/8/P7/8/8[N]'],
        ['+P8p~/10/10/10', '9p~/+P9/10/10']
    ]) {
        const diff = parser.getBoardChanges(before, after, 'w', { conservative: true });
        assert.equal(diff.missedFen, null);
        assert.equal(diff.recovery, undefined);
    }
    t.diagnostic(`${checks} variant snapshot pairs completed with all page/logging/network/timer globals forbidden`);
});

test('variant history reconciliation is placement-agnostic and does not invent orthodox moves', () => {
    for(const fen of ['10/10/10/10/P9', '+P8p~/10/10/10[PNq]',
        '4k3/8/8/8/4p3/8/8/4K3']) {
        const history = [
            { observedPly: 2, turn: 'w', fen: { basic: 'other', full: 'other w - - 0 2' } },
            { observedPly: 0, turn: 'w', fen: { basic: fen, full: `${fen} w - - 0 1` } }
        ];
        assert.equal(parser.reconcileHistory(history, { basicFen: fen, turn: 'w' }).history, history);
        const result = parser.reconcileHistory(history, { basicFen: fen, turn: 'w', ply: 0 });
        assert.equal(result.status, 'takeback');
        assert.equal(result.history[0].fen.full, `${fen} w - - 0 1`);
        assert.equal(result.history.length, 1);
    }
});
