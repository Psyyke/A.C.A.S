# Capture indicators

`renderPiecePlayerCapture` and `renderPieceEnemyCapture` use the same app-side
material exchange calculation in `app/assets/js/misc/captureExchange.js`.
No engine or userscript change is involved.

- Values are pawn 1, knight/bishop 3, rook 5, queen 9. Kings are never traded.
- `captureLoss` is the opponent's best positive material gain from an initial
  capture of the piece, followed only by captures on the landing square.
- Both sides choose their best capture or stop exchanging. Equal trades and
  losing capture attempts do not produce capture-danger indicators.
- Each capture updates occupancy and rejects moves that leave the capturer's
  king attacked. This handles absolute pins, newly opened lines, and illegal
  king recaptures without treating a geometrically pinned piece as safe for a king.
- Capture promotions include the increase in material and all four promotion
  choices. En passant uses the original FEN's side-to-move and target square,
  removes the correct pawn, and checks newly opened king attacks.
- Captures reduce the number of pieces, so there is no arbitrary depth cutoff.
  Cheapest attackers are tried first, with memoization and material-bound pruning.
  Cutoff bounds are not cached as exact results.
- Ordinary capture threats are assessed for either side, regardless of whose
  turn it is. An own-piece warning is not a prediction of unavoidable loss:
  the player may be able to move or defend the piece before the capture.
- Stopping an exchange is always allowed in this material model, even after
  a checking capture. Checkmate, forced replies elsewhere, forks, overloaded
  defenders of different squares, intermediate moves, and positional compensation
  require broader analysis and are deliberately outside its scope.
- The renderer still restricts these orthodox rules to standard chess without
  Chess960. Invalid, unsupported, or kingless positions have no exchange score.
- Square-only overlays skip exchange calculations entirely. Sliding vision stops
  at the first occupied square; x-ray recaptures are discovered during exchanges.
- When no metric markings remain, the app sends a shape-less, profile-qualified
  `metric` entry to clear the external board. An empty array is ignored by the
  userscript and would leave an old capture warning visible after a defender moves in.

## Review examples

These are hand-reviewed material-accounting examples, not executed tests.

| FEN | Target | Expected loss | Reason |
| --- | --- | --- | --- |
| `7k/8/8/2p2n2/3P4/8/3R4/3Q3K w - - 0 1` | d4 | 1 | Pawn/knight attack versus rook/queen support: after ...cxd4, Rxd4 Nxd4 Qxd4 would lose 2, so declining the recapture loses only 1 |
| `3r3k/8/8/8/3Pr3/2P5/8/7K w - - 0 1` | d4 | 0 | Two rooks do not win a pawn defended by a pawn: 1 - 5 + 1 is a losing capture sequence |
| `4r2k/8/8/1n6/8/2P5/4N3/4K3 w - - 0 1` | c3 | 1 | After ...Nxc3, the e2 knight cannot recapture because it is pinned to the king |
| `r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3` | e5 | 0 | Nxe5 Nxe5 loses White a knight for a pawn; the old e5 marker must clear after ...Nc6 |

Validation in this change was limited to source inspection and hand tracing.
JavaScript execution, timing, and browser rendering were not performed.