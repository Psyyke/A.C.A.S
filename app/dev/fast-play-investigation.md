# Fast-play suggestion reliability

This is a handoff for the v2.5.7 fast-play investigation. If suggestions stop
again, start here rather than adding another guessed DOM exception.

## What we were testing

The dev live mode runs A.C.A.S against Stockfish 18 single lite, automatically
records games and restarts them. The goal is continuous suggestion delivery
through fast moves and repeated match lifecycles.

- Chess.com mode reuses the board and userscript instance.
- Lichess mode navigates to a fresh document and creates a fresh instance.
- These are lifecycle simulations, not integration tests on the actual sites.
- A.C.A.S waiting for two active minutes without an accepted move counts as a
  failure. Paused time does not count.
- Manual refresh clears run statistics. Export before refreshing.
- Statistics retain all games and moves. Fresh-document restart checkpoints use
  IndexedDB rather than sessionStorage to support larger runs, and are consumed
  on resume. Browser disk quota limits still apply. Export before refreshing.

The failures were especially frequent with a 5 ms opponent, and later stress
runs used a 1 ms opponent. Actual move time includes scheduling and messaging,
so it is longer than the configured engine thinking time.

## What went wrong

The board DOM is not an atomic snapshot. A notification can arrive while a
piece has disappeared but not arrived, a captured piece is still present, or
the next move has already started.

Accepting an incomplete position can corrupt move metadata and the inferred
turn. The GUI may eventually display the correct pieces with the wrong turn.
With "Only calculate own turn" enabled, skipping analysis is then the expected
result of incorrect input, not necessarily an engine failure.

There were also separate asynchronous races in the observer and GUI pipeline.
The first race fixes helped, but did not solve the observed turn corruption.

### Failure trail

| Case | Finding and coverage |
|---|---|
| Ne5 followed by Bxg2 | A real integration test captured Ne5 while the replying bishop was absent. It was accepted as a capture, and the completed position was misread as a promotion. Turn tracking was wrong. |
| First move before initialization | A real run caught e4 finishing before a reused match initialized. Initialization guessed White to move instead of Black. |
| En passant | Tests reproduced accepting the capturing pawn before the captured pawn disappeared, and accepting both pawns temporarily absent. Coverage includes both colors. The original screenshot alone did not establish the exact DOM order. |
| Game 308, Rc1 followed by Bxc1 | Export ended at 17...Bxc1. Tests reproduced accepting a frame with both the rook and replying bishop missing. This is a demonstrated vulnerability at the failure position, not a captured trace of the original incident. |
| Game 162, Rxd1+ followed by Kxd1 | Export ended at 23.Kxd1. Tests found frames where the rook appeared on d1 while still on d8, with the king present or absent. Full real-pipeline replay and a subsequent reused-board restart pass. |
| Game 66, castling before Kb1 and bxa2+ | The screenshot showed the GUI two plies behind. Parsing that final two-ply transition alone succeeded. Testing the preceding castling-plus-partial-pawn-reply exposed a gap in the four-square validation limit. Full real-pipeline replay now passes. |

A manual instance restart restoring suggestions does not by itself identify
the cause. It clears several layers of state at once.

## What the current implementation does

### Shared userscript detection

See [the main userscript](../../acas.user.js),
[the test userscript](../../acas.user.test.js), and
[BoardChangeParser](../../userscript-components/BoardChangeParser.js).

1. Observer notifications arriving during processing are coalesced and drained
   immediately, rather than dropped until the next poll. Old or detached boards
   cannot continue publishing through that observer.
2. When the initial diff has not already reconstructed a missed move, a
   conservative parser check validates the endpoint. This applies regardless of
   changed-square count, including castling plus a reply.
3. An unresolved endpoint waits without overwriting the accepted state or
   caching that endpoint as rejected. The existing poll and new notifications
   can retry it. Larger unresolved diffs affecting more than four squares recover
   immediately when counts of every piece type and color are unchanged. Other
   unresolved placements use the timed fallback. After the same placement has been observed unchanged
   for two seconds, shared recovery can resume with a guessed turn and explicitly
   incomplete history. Every observed placement change restarts that wait.
4. Larger unresolved gaps with site-provided turn metadata and existing
   board-repopulation reset heuristics are allowed through. Variant and reserve
   boards retain their existing handling. This is not blanket orthodox
   validation for every supported site or variant.
5. Initialization can recognize a verified single move from the standard
   starting position and seed the start plus that move with the correct turn.
   It does not reconstruct arbitrary midgame history.

The live stress board does not publish authoritative placement or turn metadata.
A captured stall after `1. d4 Nf6 2. e3 e6 3. Nf3` left the accepted position at
`1...Nf6`, beyond the parser's two-ply reconstruction limit. The regression
replays that gap without turn metadata and requires a legal Black reply through
the real GUI and engine after shared recovery.

The fallback guesses the last mover from which color has more destination
additions in the board diff. Ties retain the previous accepted turn. Neither
heuristic proves the turn or reconstructs missing plies. A static invalid frame
can also preserve material or outlast the wait, so this is a deliberate best-effort recovery tradeoff,
not stronger validation. Promotion-chooser and single-piece disappearance
rejections do not use this timed fallback.

Earlier flags such as `unsettledPawnCapture` and `missingCapturePieces` were
replaced by endpoint validation. Do not bring back a growing list of frame
shapes without first checking why the shared rule missed the case.

### GUI calculation path

- [Interface](../assets/js/instance/Interface.js) does not let duplicate no-op
  updates invalidate a valid in-flight board update.
- [calculateBestMoves](../assets/js/instance/calculateBestMoves.js) filters own
  turns using the requested FEN, not a newer incoming board-state packet.
- [engineMessageProcessor](../assets/js/instance/engineMessageProcessor.js)
  rechecks search position, completion and profile identity after asynchronous
  reads before publishing streaming suggestions.

No per-site configuration was changed for these fixes. BoardChangeParser was
reused, not modified.

## If it stalls again

Export JSON before refreshing or restarting anything manually. Note whether
the GUI board is behind, whether the pieces match, and whether an instance
restart restores play. Record the userscript version, engine configuration,
match mode and opponent thinking time.

Failed games now include `failure.diagnostics`:

- `userscript.observedFen`, `lastAllowedFen`, `lastRejectedFen` and `turn`
- Recent userscript history and a freshly computed parser `validation` result
- Responding GUI tabs with instance FEN, turn, player color and recent history
- Per-profile readiness, pending calculations, queued request and hint state
- Explicit response status and collection errors
- Recent dev-page and GUI runtime errors, plus userscript task errors on the dev page

These errors are included in the exported failure snapshot before a fresh-document
restart, so there is no need to preserve the console manually. Reload the GUI and
update the installed userscript to enable the additional capture. A userscript
snapshot error is reported alongside the available state rather than preventing
the diagnostic reply entirely.

Collection waits one second and starts at failure time, before the automatic
restart. Export waits for pending collection and uses compact JSON.
Reload the GUI and dev page after updating the userscript or diagnostic code.

| Evidence | Next investigation |
|---|---|
| Observed FEN is ahead of accepted FEN, validation is unresolved | Replay using the recorded accepted state and turn. Check false rejection, earlier poisoned history, or an unsupported reconstruction. |
| Accepted FEN is correct but GUI FEN is behind | Follow publication, transport, board-state application and GUI update cancellation. |
| Pieces match but turn differs | Find the first incorrect turn in history. Do not assume the final move caused it. |
| GUI FEN and turn match, but an old calculation remains unfinished | Inspect position/go/stop ordering, pending request handoff and engine output. |
| GUI FEN matches, search finishes, but no accepted move follows | Check suggestion delivery, legality, promotion encoding and stale suggestion filtering. |
| A responder says no-reply | Check whether it crashed, closed, was blocked or is running older code. No reply alone does not prove a crash. |

Replay the full game, not only the final move. In game 66 the endpoint parsed
correctly in isolation, while an earlier frame could poison the live state.
Capture a failing test before changing the production logic. Require the test
to fail before the fix and pass afterward.

## Coverage and evidence

See [the regression test guide](../../tests/README.md) for commands.

- Shared detector tests retain the discovered failure positions.
- A matrix covers 72 staged arrival/removal frames across ordinary moves,
  captures, en passant, promotions and castling.
- Whole-game traces check 2,104 observations and 267 reconstructed hidden plies,
  including FEN fields and legally replayable engine history.
- Real Chromium tests use the production userscript, GUI and Stockfish workers.
  They require at least 500 plies each against 1 ms and 5 ms opponents.
- The 1 ms test also replays games 162 and 66, injects partial frames, requires
  legal replies, checks diagnostics and verifies a board-reuse restart.
- The latest verification passed 80 related regression checks plus both real
  fast-pipeline tests.

The latest user-reported run reached **97,360 plies across 748 completed games
in 121.9 minutes**, with no reported stalls or failures. This was the reused-board
run after the castling validation fix. It was still running at the time of this
write-up. Do not present 100,000 plies or 1,000 completed games as verified yet.

This is strong evidence for the tested setup, not proof that all edge cases are
gone. Premoves can create similar rapid bursts in real games. Real-site DOM,
turn metadata and fresh-instance lifecycles still need coverage.

## Memory and the separate browser crash

An earlier run had a GUI out-of-memory crash at 26,290 plies. Browser Task
Manager later showed roughly 6.4 GB attributed to the GUI's DevTools process,
while the GUI and dev processes were each around 1.2 GB. That made DevTools a
major suspect, but did not prove the crash's cause. No memory-crash fix was made.

Run unattended checks with both DevTools windows closed. The built-in heap
display measures JS heap, not total renderer, worker, WebAssembly or GPU memory.
Use browser process memory and Windows committed memory when investigating OOM.
Keep crash records distinct from suggestion failures rather than deleting them.
