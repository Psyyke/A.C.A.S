# EPD opening books

Choose a UTF-8 `.epd` file in the existing Opening Book control. Books are
saved locally in the same browser storage as Polyglot books.

Each nonempty line contains a FEN position's first four fields followed by
move annotations. Optional halfmove/fullmove clocks are ignored for lookup.
The reader uses all `bm` (best move) operands, or the first `pm` operand,
or the first `pv` operand, in that order. Moves have equal weight and retain
their file order. Repeated positions merge their move lists.

Standard chess accepts SAN or coordinate moves:

```text
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - bm e4 d4;
```

Variants require Fairy-Stockfish UCI coordinates (not shogi USI):

```text
lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - - bm c3c4 g3g4;
```

Non-8x8 boards, multi-digit ranks, fairy/promoted piece symbols, holdings,
coordinate promotions such as `a7a8q` or `c7c8+`, and drops such as `P@e5`
are supported. A drop requires the piece in the moving side's holdings and
an empty destination. Ordinary coordinate moves are checked for valid
squares and a moving-side source piece, but not full variant legality;
use a book generated for the selected variant. Variant SAN and compound
moves (such as an Amazons move plus shot) are not supported.

Position matching keeps the side to move, castling rights, en-passant field,
holdings and any check counters. Holdings order and empty brackets are
normalized. Other position fields must match the live FEN; clocks do not.
EPD does not identify the variant, so choose the appropriate book per profile.

Files containing only starting positions, without `bm`, `pm` or `pv` moves,
are rejected with an explanation: there are no book suggestions to display.
Compressed EPD files are not supported; use plain `.epd` files.