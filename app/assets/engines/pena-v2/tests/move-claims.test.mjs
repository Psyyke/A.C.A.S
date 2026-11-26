import test from 'node:test';
import assert from 'node:assert/strict';
import { moveClaim, wrongMoveClaim } from '../move-claims.js';
import { englishStrategy } from '../english-strategy.js';
import { dropFalseGeometry } from '../coaching-policy.js';

// Positions from real Inkling runs.
const R37 = 'r2qr1k1/ppp2p1p/6p1/1N1B4/1P6/P3b2P/1BP4P/1K1R4 b - - 1 19';
const R29 = 'R1b5/3p2k1/2p3p1/1p4p1/4Pn2/1Q1B4/5PP1/3R2K1 b - - 1 35';
const R134 = '5rk1/pNr3p1/4p2p/1p6/8/3P4/PP3bPP/1R3R1K w - - 2 25';
const R56 = 'r1b1kb1r/ppq3pp/n2p1p1n/1N1Bp3/1P2P3/P4N1P/2PB1PP1/R2Q1RK1 b kq - 2 13';
const R41 = 'r2qr1k1/ppp2ppp/3b1n2/1N1p4/8/PP2P2P/1BP2P1P/R3KB1R b KQ - 2 12';
const R246 = 'r3k1r1/1pp1qp1p/p3P3/4R3/8/8/PPP2PPP/R2Q2K1 b - - 0 17';
const R176 = '3rr1k1/2p1b1p1/p1b1p3/2P2p2/1P6/P4N2/1B2QPPP/5RK1 w - - 0 24';
const RUY = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';

test('wrong claims about what a move does are caught', () => {
    assert.match(wrongMoveClaim('...Re5 and ...Re4 can be taken by the bishop on d5.', { rootFen: R37 }).text,
        /^Board after \.\.\.Re5: the bishop on d5 cannot take the rook on e5\. White can take it with Bxe5\./);
    assert.ok(wrongMoveClaim('Bb7 can be taken by Qxb7.', { rootFen: R29 }));
    assert.ok(wrongMoveClaim('...Bb7 allows Rg8+, and ...Ba6 can be taken by Qxa6.', { rootFen: R29 }));
    assert.ok(wrongMoveClaim('Nd6+ hits the queen on c7 and the rook on a8.', { rootFen: R56 }));
    assert.match(wrongMoveClaim('Ba4 gives up the pressure on c6.', { rootFen: RUY }).text, /still attacks the knight on c6/);
    assert.ok(wrongMoveClaim('So Ng4 would be attacked by e3 pawn.', { rootFen: R41 }));
    assert.ok(wrongMoveClaim('So Qa3 would attack b2 and a1.', { rootFen: R246 }));
});

test('true claims and look-alikes stay silent', () => {
    for(const [fen, text] of [[R37, '...Re4 can be taken by the bishop on d5.'], [R37, 'After ...Re7, Bf6 hits the rook on e7.'],
        [R29, 'Ba6 can be taken by Rxa6.'], [R29, '...Bb7 allows Rg8+, and ...Ba6 can be taken by Rxa6.'], [R134, 'Nc5 can be taken by Rxc5 or Bxc5.'],
        [R56, 'Nxc7+ also hits the rook on a8 and the knight on a6.'], [RUY, 'Bc4 no longer attacks c6.'], [RUY, 'Ng5 hits f7 from g5, which is weak.'],
        [RUY, 'Bxc6 dxc6 opens the d-file, so Nxe5 attacks e5.'], [RUY, 'd4 attacks e5.'],
        [R41, 'So Ng4 would be attacked by h3 pawn.'], [R246, 'So Qa3 would attack b2 and a2 (defended by rook a1).'], [R176, 'So Nd2 attacks own rook f1.']])
        assert.equal(wrongMoveClaim(text, { rootFen: fen }), null, text);
});

test('a claim is wrong only if it is wrong on every board the move fits', () => {
    // Without the earlier ...Re7, Bf6 does not hit e7, so the line board in the context is what keeps it silent.
    assert.ok(wrongMoveClaim('Bf6 hits the rook on e7.', { rootFen: R37 }));
    assert.equal(wrongMoveClaim('Bf6 hits the rook on e7.', { rootFen: R37, context: 'What about ...Re7?' }), null);
});

test('the live check reads finished sentences once', () => {
    const thought = 'Let me look. ...Re5 can be taken by the bishop on d5. Hmm';
    const checked = new Set();
    const hit = moveClaim(thought, 0, R37, { checked });
    assert.equal(hit.trigger, '...Re5 can be taken by the bishop on d5');
    assert.equal(thought.slice(0, hit.end), 'Let me look. ...Re5 can be taken by the bishop on d5.');
    assert.equal(moveClaim(thought, 0, R37, { checked }), null);
});

test('a wrong move claim in the answer is dropped', () => {
    const { text, removed } = dropFalseGeometry('Your rook wants an open file. Careful, ...Re5 can be taken by the bishop on d5, so keep it on e8.', { fen: R37 });
    assert.equal(text, 'Your rook wants an open file.');
    assert.equal(removed.length, 1);
});

test('a piece "tied to" a square it does not reach is dropped', () => {
    assert.equal(dropFalseGeometry('The knight on f4 is tied to the pawn on g5.', { fen: R29 }).removed.length, 1);
    assert.equal(dropFalseGeometry('The knight on f4 is tied to the pawn on g6.', { fen: R29 }).removed.length, 0);
});

test('bigger picture notes only show what fits the game stage', () => {
    const ruy = englishStrategy(RUY);
    assert.match(ruy, /Development, leaning White: Black's knight g8, bishop c8 and bishop f8 are still on their starting squares\./);
    assert.match(ruy, /Black's knight c6 is the only guard of the attacked pawn e5/);
    assert.equal(englishStrategy('8/5k2/8/3p4/3P4/4K3/8/8 w - - 0 50'), '');
    assert.doesNotMatch(englishStrategy('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 23'), /Development/);
});
