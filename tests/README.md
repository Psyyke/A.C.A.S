# Regression tests

## Fast shared move updates

For the investigation history, current safeguards and future failure triage,
see [Fast-play suggestion reliability](../app/dev/fast-play-investigation.md).

`node --test tests/board-observer.test.mjs tests/board-update-race.test.mjs tests/engine-suggestions.test.mjs tests/search-modes.test.mjs`
checks the shared userscript observer and GUI calculation path. Move notifications
during a publish drain immediately, while duplicates do not create extra history
or cancel a valid GUI update. Own-turn filtering uses the requested FEN, and late
engine info cannot overwrite newer suggestions. A 20 ms Max Movetime setting
also retains delivery when the engine sends only a final `bestmove`.
Fast DOM updates can briefly show incomplete moves. Accepting that partial
position can leave the correct pieces paired with the wrong turn, so own-turn
filtering skips analysis.
The shared detector validates orthodox endpoints regardless of changed-square
count, rather than listing individual disappearance or duplication patterns.
This includes castling followed by a reply, which can change five or six squares.
Unresolved endpoints wait for another observation. Already reconstructed two-ply
moves, larger gaps with site-provided turn metadata, board-repopulation resets
and variant positions keep their existing handling.
Tests cover the failed Ne5/Bxg2, Rc1/Bxc1 and Rxd1/Kxd1 sequences, en passant,
and 72 staged arrival/removal frames across moves, captures, promotions and castling.
A legal-looking intermediate frame can still be indistinguishable from a real
move, so this is not a guarantee against every possible DOM timing issue.
A verified opening move
also restores the turn when it finishes before match initialization.
These deterministic race checks do not replace an unattended run with the real
userscript, site DOM and engines.

`node --test tests/app-dev-fast-pipeline.test.mjs` runs the production userscript
and GUI in two Chromium tabs with a userscript-storage shim and real Stockfish
workers. It requires the userscript libraries, which the existing harness caches
after downloading them. It plays at least 500 plies each against 1 ms and 5 ms opponents with
A.C.A.S Max Movetime at 20 ms, across board-reuse matches and both colors.
It fails if moves stop for 8 seconds. The shared detector also checks a captured
piece vanishing during another move and initialization after the opening move.
The 1 ms run also replays the failed Rxd1/Kxd1 and castling/Kb1/bxa2 games through the real board,
injects partial capture frames, requires a legal black suggestion at its endpoint,
and verifies play continues after a board-reuse restart. It checks that live
diagnostics report the rejected partial position, accepted position and GUI state.
The harness routes an existing dev-page opening-data path to the app's data file
so an unrelated missing-resource error does not affect the check.

## Dev live matches

`node --test tests/app-dev-live.test.mjs` uses Chromium to check turn ownership,
engine readiness and timeouts, pause timing, single automatic restarts, result
counting, promotions, repetition history, refresh-scoped stats and JSON export.
It also exercises rapid test switching and plays real moves with the bundled
Stockfish 18 single lite, including manual board moves from both orientations.
Watchdog checks cover the exact 2-minute A.C.A.S timeout, pause exclusion,
automatic failure recovery and capped opponent retry delays. A simulated hour
checks repeated unattended stalls, diagnostics and worker cleanup. It is a
deterministic lifecycle test, not a real hour-long A.C.A.S memory benchmark.
Failed games capture a bounded diagnostic snapshot before automatic restart.
It contains the userscript's observed, accepted and rejected FENs, turn, recent
history and parser validation result, plus responding GUI tabs' current FEN,
turn and pending engine searches. Missing responders are explicitly marked
`no-reply`, so a crashed GUI is distinguishable from a reported search state.
Exports wait for in-flight diagnostic capture and use compact JSON to save space.
These snapshots do not include total browser memory or a full event trace.
Speed controls cover saved settings, validation, in-flight searches, requested
per-move timing and longer search deadlines. Button checks cover shared app
styling, keyboard focus and independent Loop controls without nested buttons.
GUI heap checks use real same-origin browser tabs and the production reporter.
They cover multiple tab IDs, unavailable counters, JSON export, closed-tab
timeouts and cleanup. Counter values are mocked, not used to diagnose memory leaks.

`node --test tests/app-dev-memory.test.mjs` checks actual Chromium heap and DOM
counters after forced garbage collection. It warms up with 200 cycles, then
creates and destroys 500 more boards and cancellable edge scenarios, including
4,200 board flips and interrupted drawing, dragging and animations in total.
Observers must disconnect, registered listener balances must stay unchanged,
DOM counters must stay bounded and the final heap samples must plateau.
Another check reloads 12 failed live matches to verify capped backoff, constant
browser history length and consumed checkpoints. These checks do not run the
userscript or prove that the entire browser can run forever.

`node --test tests/server-platform.test.mjs` verifies Calculation Server platform
branches and runs native Electron startup, WebSocket, engine launch/kill, and
pin/unpin checks with temporary isolated settings. It requires the dependencies
in `appServer` and the existing root Playwright installation. Run it separately
on Windows, macOS, and desktop Linux for native coverage; simulated platform
branches do not replace testing on those operating systems.

For a quick EloEye result-state check, open `tools/eloeye/?dev` and start a
fresh run. It plays twice the selected board count with the real opponent and shows the normal
result with its wide uncertainty. Existing saved runs retain their own limit.
For example, three boards play six matches. The checkpoint can resume without the flag. This is a development
smoke test, not a meaningful rating measurement.
Finished runs play a short completion ding. Restoring a saved result stays silent.
EloEye supports 1-10 boards. The development browser regression completes twenty
matches with ten boards and checks saved results and Reset. Scheduling, opening
assignments and checkpoints cover the ten-board limit. Shared Maia inference
still batches up to six ready requests at a time; remaining boards queue normally.

Worker protocol, lifecycle, and server helper tests run with Node.js 24 without
additional dependencies:

```sh
node --test --test-isolation=none tests/*.test.mjs
```

The engine startup integration tests use Chromium and the production loader, with
UI logging, engine workers, storage, and analysis mocked. They cover readiness,
current-FEN refresh, Lc0 weight ordering, profile replacement, external engines,
and worker errors. After installing Playwright and Chromium as described below:

```sh
node --test tests/load-engine.test.cjs
```

These checks do not execute the engine binaries or download neural weights.

Advanced search commands and recorded-position replay can be checked with:

```sh
node --test tests/search-modes.test.mjs tests/engine-position.test.mjs tests/search-modes-gui.test.mjs
```

The GUI check requires Playwright and Chromium. The tests cover the opt-in UCI
movetime and infinite modes, the separate stop timer, Calculation Server command
limits, and legal recorded history, including positions longer than 8192 characters;
they do not execute AggroChess itself.

`node --test tests/search-mode-translations.test.mjs` checks the regular Advanced
Elo labels and search-mode choices in all supported languages using Chromium.

Repeated single-PV updates, distinct MultiPV suggestions and final bestmove
reconciliation are covered by `node --test tests/engine-suggestions.test.mjs`.

`node --test tests/move-speech.test.mjs` checks that continuous analysis only
announces changed suggestions, with independent profile/slot tracking and resets
when the board changes.

The disconnection warning lifetime is checked against the real toast renderer:

```sh
node --test tests/instance-disconnect-toast.test.mjs
```

## App suggestion mix

The app-wide mix reuses EloEye's percentage balancing and pooled move selection.
Full suggestions wait for completed engine searches and become one primary arrow.
Partial hints remain separate. Redraws retain the pick and suppress repeated speech
and Auto Move. Turning the mix off restores the original profile suggestions.

```sh
node --test tests/suggestion-mix.test.mjs tests/elo-hints.test.mjs
node --test tests/suggestion-mix-gui.test.mjs
```

The second command uses Playwright and Chromium. It checks the real settings
dialog, saved non-profile weights, multiple engines, primary-arrow rendering,
partial hints and disabling the feature.
Book preference uses the same book lookup as ordinary book markings, pools full
book suggestions across profiles, and falls back to the engine mix when no full
book move is available. Tests cover preference toggling and partial book hints.
Compatibility checks also cover concealment without losing the original
suggestions, live book-only filter changes, piece and capture filters, and opacity.
Chromium also checks PiP text in both notation modes, board captures with the
selected arrow, and engine and preferred-book TTS through the real speech
formatter with a mocked speech output. Settings redraws and concealment must not
repeat the announcement. Popup ordering and language hover styling are covered too.
The composed PiP stream shows one translated Suggestion mix section while mixing
is enabled and restores separate profile sections when mixing is disabled.
It reserves enabled sections across mixed profiles, including blank Elo/accuracy
rows before results arrive, so profile switches and waiting states keep the same
canvas dimensions while unavailable content stays blank.
Mixed feedback, counts and Elo/accuracy each use the first PiP-enabled suggestion profile
with that feature enabled, independently of the chosen move's profile. Late
review results update the footer without changing the move or canvas dimensions.
Learning profiles have separate sections below the mix, with their own board,
counts, played/best-move feedback and stats. Their board settings do not reserve
space in the suggestion section or merge its board with the learning board.
Their waiting prompt preserves the layout and the selected suggestion.
PiP also renders while profile runtime state is pending, displays feedback after
initialization, and clears it after removal, with suggestion mixing on or off.

## Help page

With Playwright and Chromium installed, check the combined Help content,
navigation, mobile layout, and legacy FAQ redirects (including question anchors):

```sh
node --test tests/help-page.test.mjs
```

## Userscript board coordinates

`acas.user.js` groups orientation math in the frozen `BoardCoordinates` object:

- Logical squares are `[file, rank]`, with `a1 = [0, 0]`, regardless of orientation.
- Matrices use `board[row][column]` in FEN order, starting at White's top-left.
- DOM indices are `[column, row]` starting at the displayed top-left.
- Dimensions are `[width, height]`. The legacy variables `lastBoardRanks` and
  `lastBoardFiles` mean width and height, respectively.

Site adapters still return logical squares. Matrix storage, FEN and moves-on-demand
remain independent of orientation; only DOM conversions depend on it. Existing
helper names are retained as wrappers. World Chess's white-relative transforms
and the rank-ten `:` alias are preserved. Invalid conversions produce `[NaN, NaN]`
(or `null` when converting to a square name), with diagnostics only in debug mode.
Automatic moves are not started without two finite click positions.

Run the coordinate suite alongside the existing orientation tests (using the
Playwright/Chromium setup below):

```sh
node --test tests/userscript-coordinates.test.cjs tests/lichess-state.test.cjs
```

The coordinate tests execute production declarations, not copied implementations.
They cover every square on standard and rectangular boards in both orientations,
round trips through the maximum supported dimensions, all site adapter coordinate
routes, matrix/FEN/lookup/promotion/move-path integration, flips, malformed inputs,
missing elements and automatic-move guards. A Chromium fixture also checks real
CSS geometry and click centers. These are offline regressions, not live-site
compatibility tests.

## Lichess state tests

These tests execute the actual userscript adapter and state-management declarations against Chromium DOM fixtures. Storage, engine transport, and unrelated UI are stubbed. The GUI orientation-initialization block and message bridge are tested separately from engine loading.

The obsolete EloEye iframe bridge and its integration fixtures have been removed.
Chess-site adapter/state coverage remains in `tests/lichess-state.test.cjs`;
production EloEye uses the direct-session tests below.

Presentation-only GUI redraws use a separate `suppressAutoMove` flag, not
`isFuture`. They remain revealed current moves for EloEye while still preventing
repeated userscript Auto Move actions. Actual future and opponent suggestions
remain excluded. Both the GUI and userscript must be updated for this flag.

EloEye waits for completed profiles and legal, fully revealed suggestions until
the existing move deadline, including when profiles withdraw markings during the
collection window. Warning-only candidates can participate in the alternative
pool or explicitly warned fallback described below. Missing classification
metadata still fails explicitly. The hint suite covers these timing cases,
cancellation, fallback notifications and illegal-move rejection.

### Direct EloEye GUI sessions

Production EloEye now uses `BoardSession`: ordinary Chessground DOM boards and
explicit same-origin `BroadcastChannel` sessions. No game iframes or per-match
userscript contexts are created. The GUI still uses the installed userscript
for settings/storage, but game state and hints do not travel through manager
storage or userscript DOM observers. This measures the configured GUI profile
and its visible suggestions, **not** end-to-end parsing/Auto Move on chess sites.
The EloEye page itself does not require the userscript or its page globals.
Readiness and the GUI's manager name use request/reply messages on the same-origin
session channel; no GM-storage heartbeat is written. The GUI still needs the
userscript for its normal configuration/storage access. W/D/L is shown compactly
beside the match count, without a separate technical-details panel.
Keep EloEye and the updated GUI on the same origin (scheme, hostname and port).

Discovery selects one GUI before creating a session; subsequent messages are
bound to its GUI ID, client ID and unique session ID. Position revisions are
monotonic; hints must match the exact current FEN and revision. The authoritative
legal game history, including custom starts and promotions, is supplied directly
to the existing GUI board-state/engine path. Per-profile outgoing move shapes
still determine which full/partial suggestions are available. Opponent/future
shapes, concealed suggestions and hidden/disabled external moves are not
silently exposed. Selection uses the pooled personality policy described below.

Duplicate position delivery preserves current hints. Sessions heartbeat while
alive, re-discover the GUI after a reload and restore their full current history.
Explicit close releases the board, waiters, abort handlers, timer and channel;
the GUI acknowledges removal and ignores delayed sync for retired IDs.
Abandoned sessions expire after 10 seconds, with a bounded 1.5-second client
close fallback when no GUI answers. Pending creation is closed if cancellation
wins the race. There is no legacy game-frame transport or userscript message bridge.

```sh
node --test tests/eloeye-session-protocol.test.mjs tests/eloeye-sessions.test.mjs tests/elo-hints.test.mjs
```

Protocol tests verify stale/foreign replies, legal-history retention, duplicate
updates, cancellation, pending-create/close races, expiry and resource cleanup.
The real GUI/Stockfish test plays the reported king escape, completes repeated
four-board games with fast and slow profiles, stops unfinished boards, reconnects after GUI reload and
asserts zero game iframes and zero remaining GUI instances after cleanup.

## Board-change component

`userscript-components/BoardChangeParser.js` is the app-specific extraction of the
userscript's snapshot diff and heuristic missed-ply reconstruction. Its only public
method is `getBoardChanges(previousBasicFen, currentBasicFen, previousTurn, context?)`.
The shared helpers are injected rather than reimplemented:

```js
const boardChangeParser = new BoardChangeParser({
    getBoardChangesObjTemplate,
    getFenPieceColor
});
```

The class and its implementation stay in the userscript's scope. It does not
export to `window`/`unsafeWindow`, call page functions, log, access storage or the
network, or create timers/observers. The injected helpers must be the userscript's
own functions. As with other components, isolation relies on the userscript
manager's granted sandbox, not on injecting this script into the page.

`DynamicSettingsCore` is loaded by production `@require` from
`https://update.greasyfork.org/scripts/604137/1988721/DynamicSettingsjs.js`;
there is no inline userscript copy. The GUI uses the same implementation in
`userscript-components/DynamicSettings.js`.

**Board parser is extracted and published.** `acas.user.js` now
instantiates `BoardChangeParser` and contains no inline parser implementation.
Its `@require` loads
`https://update.greasyfork.org/scripts/604162/1988934/BoardChangeParserjs.js`.
For subsequent publication URL updates:

```sh
node userscript-components\dev\wire-components.mjs --board-url <Greasy-Fork-library-URL>
node userscript-components\dev\build-test-userscript.mjs
```

The wiring script validates URLs and source anchors before writing. For an
already extracted userscript it only replaces the library URL. It retains the injected helpers and passes
known history metadata and Lichess last-move highlights to the component. It does
not modify observer scheduling. The debug builder **preserves production
`@require` lines verbatim** and no longer substitutes local libraries or a
different parser. Both scripts use the same dependencies after publication.
The real GUI/engine test harness loads the published dependencies from the
production URLs, cached in the OS temp directory, without modifying metadata.

The optional context is `{ castlingRights, enPassantTarget, lastMoveSquares }`.
The first two fields describe the **previous** position, not the current DOM.
`lastMoveSquares` is an unordered pair of logical square names for the latest
observed move. Valid matching hints are preferred when multiple intermediate
positions fit; stale/missing hints retain the heuristic fallback. The adapter
reads DOM attributes/transforms with userscript-owned helpers, never page JS
functions. Delayed clock/turn DOM is deliberately not treated as an authoritative
constraint.

Run the independent chess.js-oracle corpus and production state/observer checks
without additional dependencies:

```sh
node --test tests/board-changes.test.mjs tests/board-observer.test.mjs
```

The default corpus generates 1,000 deterministic games (up to 100 plies each).
Every single-ply result and every adjacent two-ply diff is checked, including the
complete changed-square arrays. Every recovered intermediate board is replayed
legally with the bundled chess.js, independently of the parser. Exhaustive
two-ply trees and all-file fixtures exercise castling, captures/recaptures,
en passant, every promotion/underpromotion, checks, transient states, pockets,
variant tokens, rectangular boards, and Chess960 overlaps. The observer tests
execute production state/observer code with controlled scheduling and the new
component, including mutations during a pending publish. Diagnostics report
recovery coverage, legal alternatives and parser-only timing. The corpus enforces
99% recovery and mean diff time below 1 ms; these are regression bounds, not a
real-time guarantee. Set `BOARD_CHANGE_GAMES` / `BOARD_CHANGE_PLIES` to adjust size.

Whole-game state integration also runs 30 deterministic 80-ply game traces through production
observation, state updates and publishing, mixing duplicate notifications,
undersized mutation batches recovered by polling, stale page turns and 267 hidden
plies. All 2,104 delivered observations are compared against every intermediate
full FEN and actual move; the resulting engine position command and complete
history are legally replayed independently. Refreshes must preserve ply counters
and en-passant state, and FEN assembly must use the same snapshot as the diff.
Two finished checkmate games additionally verify exact terminal publication and
PGN export from reconstructed history, including a missed opening ply.

This verifies the tested complete-snapshot path, not all browser states. Current
userscript validation only filters selected transient shapes (one disappearance,
promotion pawns, empty boards); it is **not** a full legality/stability barrier.
A destination appearing before its source disappears can still be accepted.
Mid-game initialization cannot infer prior castling-right loss, clocks or move
number from placement, and takeback reconciliation requires an independently
observed ply source (currently supplied by the Lichess round adapter). These are
observation/history-layer limitations, not evidence that the parser was trained
on partial boards. Production now uses the component through `@require`;
the published library URL is shared by the normal and debug userscripts.

With the existing Playwright/Chromium setup, also run the real Lichess DOM fixture:

```sh
node --test tests/lichess-board-changes.test.mjs tests/userscript-coordinates.test.cjs tests/lichess-state.test.cjs
```

It exercises actual mutations, CSS transforms and `cgKey` coordinates, both board
orientations, ghost pieces, and a competing preview board, with no console output
or page errors. These are offline generated/curated fixtures, not downloaded
Lichess matches or live-site compatibility certification.

Reconstruction intentionally remains heuristic: two snapshots can hide multiple
legal histories, and a promoted piece captured before observation has no
identifiable promotion choice. A legal alternative is not proof of the actual
move sequence. Reconstruction is restricted to orthodox 8x8 piece tokens without
pockets; variant snapshots are still diffed, not reconstructed as orthodox chess.
Chess960 stationary kings cannot be distinguished from ordinary rook moves using
piece placement alone. The component is not a replacement for a full rules engine.

## Streaming Lichess PGN.zst corpus

Put **completed** `.pgn.zst` (or `.pgn`) downloads in `temp\lichess-databases`.
Requires Node.js 24 with native Zstandard support; no Python, CUDA, npm install,
network access or temporary decompressed files are needed.

```sh
# Initial bounded validation, before committing to the full database
node tests\lichess-database\run.mjs --max-games 100000 --workers 4

# All records in all matching files, with exact-recovery failures reflected in exit status
node tests\lichess-database\run.mjs --workers 8 --strict

# Optional deterministic sample and separate report
node tests\lichess-database\run.mjs --sample-every 100 --max-games 10000 --output temp\lichess-board-report-sample.json

# Disjoint held-out range after the first 100,000 development games
node tests\lichess-database\run.mjs --skip-games 100000 --max-games 100000 --output temp\lichess-board-report-heldout.json

# Explicit files also work; quote paths with spaces
node tests\lichess-database\run.mjs "D:\databases\lichess_db_standard_rated.pgn.zst"
```

Default worker count is capped at four to avoid monopolizing a shared machine.
Raise `--workers` after checking reported wall-clock plies/sec; an RTX 4070 Ti
Super is not used for this branch-heavy rules/oracle workload. One producer
streams the archive and sends bounded batches to CPU workers, including when
there is only one large input file. Default batches contain at most 16 games or
about 4,096 plies (a single long game can exceed that). Each PGN record is capped
at 2 MiB of text; memory does not grow with archive size. Zstandard frame boundaries
are handled explicitly because Node 24's decoder only consumes one frame.
Concatenated/skippable frames, checksums and truncation are tested.
Stopping at `--max-games` cancels decoding inside a large frame without treating
that intentional cancellation as corruption; fully read corrupt frames still fail.

Every mainline SAN is replayed with the unmodified bundled chess.js. RAV
variations, brace/semicolon comments, clock/evaluation annotations, move numbers
and NAGs are lexed across arbitrary UTF-8/chunk boundaries. FEN starts are
supported; nonstandard variants are explicitly counted and skipped. A malformed
PGN, invalid SAN/FEN, incomplete compressed frame, changed input file or worker
failure is never treated as a passed match. Mid-download files should not be
included; files are checked for size/mtime changes.

Each adjacent **single-ply** and **two-ply** snapshot pair is tested. For one
missed move, the PGN's intermediate board is the ground truth. Exact recoveries
are already known legal from that replay; nonexact returned boards are separately
replayed through chess.js and classified as legal alternatives or illegal
recoveries. Unresolved pairs remain failures of the zero-error target. Single-ply
checks include move/capture/promotion/en-passant metadata and complete diff array
contents/coordinates. No training labels are generated by the parser itself.

`temp\lichess-board-report.json` records input manifests, parser/engine hashes,
record counts, single-ply accuracy, exact gap accuracy, legal alternatives,
illegal recoveries, unresolved gaps, bounded failure examples, parser-only
microseconds/call and end-to-end plies/sec. Two explicit zero-target metrics:

- `gapRmse = sqrt((nonexact + unresolved) / gapCount)` for exact intermediate
  board recovery. A guessed legal alternative still counts as wrong.
- `gapBoardRmse = sqrt(mismatchedSquares / (64 * gapCount))`. An unresolved board
  counts as 64 mismatches. Piece identities are categorical, not ordinal numbers.

`stats.matches.singleExact` counts legal games with every single-ply detection
exact, out of `stats.matches.withMoves`; `stats.matches.gapsExact` counts games where **every** adjacent hidden-ply
pair is recovered exactly, out of `stats.matches.withGaps`. Per-move percentages
alone do not establish whole-game correctness. All mainline PGN moves are replayed
legally, but the runner does not certify external metadata, timestamps or the
declared winner (resignation/timeouts need not produce checkmate). BoardChangeParser
itself consumes snapshots and does not parse or certify an entire PGN.

By default the CLI fails for input errors, invalid games, single-ply errors,
illegal recoveries, or a run with no eligible pairs. `--strict` also fails for
every legal-but-nonexact or unresolved recovery. `validation.passed` and
`validation.zeroGapError` distinguish baseline correctness from the zero-error
target. Partial stream failures produce a clearly marked failed report. Progress
goes to stderr, the final summary to stdout. Do not run multiple jobs with the
same report output path.

History context is enabled by default; `--no-context` gives the snapshot-only
baseline. `--last-move-hints` supplies ground-truth PGN last-move squares as an
**upper-bound experiment** for the DOM hints, not evidence that real highlights
always arrive in time. Keep these reports separate. Exact recovery can never be
guaranteed when multiple legal histories give the same snapshots and hints.
`--skip-games` skips raw records across all inputs before deterministic sampling,
so `--skip-games 100000 --max-games 100000` evaluates records 100001-200000
without reusing the first development range. The skipped prefix must still be
streamed/decompressed; this is not random seeking inside the archive.
No neural model is shipped or trained yet: real failures and held-out files must
first establish an advantage over deterministic candidate ranking. A model cannot
recover information absent from its inputs.

The first real October 2026 development run replayed 100,000 games / 6,643,000
plies. All single-ply diffs were exact; of 6,543,246 hidden-ply pairs, the
pre-improvement component recovered 6,527,944 exactly (99.7661%), returned 9,486
legal alternatives, left 5,816 unresolved, and returned no illegal recoveries.
Parser-only mean was 18.10 microseconds/call on this machine. These figures are
a bounded prefix, not a full-month certification or trained model.
Counterexamples led to deterministic handling of en passant immediately followed
by recapture, and recapture promotions that restore the same piece token on an
otherwise unchanged square. Regression tests cover both colors, all en-passant
files/directions, all promotion roles, and explicit history constraints. A first
promotion captured before observation still remains unresolved rather than
inventing its unobservable role.

After those fixes, the same development range recovered 6,530,567 hidden boards
exactly (99.8062%), with 9,486 legal alternatives, 3,193 unresolved and no illegal
recoveries. That is 2,623 additional exact recoveries, without changing any
previous legal-alternative count or single-ply result.
The frozen component was then evaluated on the disjoint records 100001-200000:

| Metric | Held-out result |
| --- | --- |
| Games / plies | 100,000 / 6,636,577 |
| Exact single-ply diffs | 6,636,577 / 6,636,577 |
| Exact hidden boards | 6,523,899 / 6,536,751 (99.8034%) |
| Legal alternatives / unresolved / illegal | 9,590 / 3,262 / 0 |
| Exact whole-game hidden-pair recovery | 87,666 / 99,664 games with pairs |
| Gap RMSE / board RMSE | 0.044341 / 0.023342 |
| Parser-only mean | 14.86 microseconds/call |
| End-to-end throughput, four workers | 50,051 plies/second |

These are real corpus-driven deterministic improvements, not neural-network
training. Both ranges pass baseline validation but **fail the zero-gap-error
target**. Legal alternatives are still wrong against the original PGN. The
held-out range is from the same month, not an independent month/site sample.
The full 30,982,323,881-byte archive has not been processed or checksum-certified;
only the prefixes needed for these bounded runs were streamed. Saved local
reports use `temp\lichess-board-report-october-{baseline,revised,heldout}-100000.json`.

### Consecutive missed-update stress testing

```sh
node tests\lichess-database\run.mjs --skip-games 200000 --max-games 100000 --workers 4 --stress --output temp\lichess-board-report-october-burst-100000.json
```

`--stress` adds every overlapping 3-, 4- and 5-ply window: respectively two,
three and four missed intermediate observations. It also checks a repeated
identical snapshot after every ply and every ordinary two-ply gap with stale
highlights from the previous observed board. It does not simulate transient
half-updated DOM pieces. History rights/en-passant context remains enabled by
default; oracle current highlights remain a separate opt-in experiment.

Stress counters/timings are separate from single-ply and one-missed-ply accuracy.
For longer windows, `noRecovery` means no intermediate FEN was returned, not that
the returned aggregate diff is a correct move. `legalShorterHistory` means the
returned FEN explains the endpoint in **two legal plies**, not that it recovers
the actual 3-5-ply PGN history. `apparentSingleMove` is the subset of no-recovery
windows whose endpoints also permit one legal ply. `unchanged` counts identical
endpoint placements, including out-and-back moves. These are ambiguities or
unsupported depth, never zero-error successes. `stressValidation.passedSafetyChecks`
only checks illegal returned paths and duplicate/stale-hint corruption; it does
not certify correct history or turn after a longer burst.

The additional disjoint records 200001-300000 supplied 6,615,733 plies:

| Missed observations | Windows | No intermediate returned | Legal shorter-history aliases | Illegal returned paths |
| --- | ---: | ---: | ---: | ---: |
| 2 (3 plies) | 6,416,129 | 6,309,440 | 106,689 | 0 |
| 3 (4 plies) | 6,316,508 | 6,306,401 | 10,107 | 0 |
| 4 (5 plies) | 6,216,978 | 6,199,774 | 17,204 | 0 |

All 6,615,733 duplicate snapshots passed; stale highlights produced no illegal
paths and the same aggregate exact/alternative/unresolved counts as the unhinted
baseline. All single-ply diffs were exact. Ordinary one-missed-ply recovery was
6,502,754 / 6,515,871 exact (99.7987%), with 9,881 legal alternatives, 3,236
unresolved and no illegal returns. Across stress depths, 17,067 windows had
unchanged endpoint placement and 36,559 looked like one legal move. These
results are from this bounded range, not a guarantee for the full archive.

The production-observer regression separately sends 3-5-ply bursts beginning
on both colors, repeats each observation 20 times, and then delivers the next
ordinary move. All six cases retain the live board/turn and resume publishing
with supplied DOM turn metadata. **Full history is not recovered:** two cases
retain history rejected by legal replay, and four hit the existing
`>6 changed squares` new-match heuristic and discard previous history. The tests
characterize that limitation; they do not claim clocks, castling rights, PGN or
new-match classification are exact after multiple missed moves. No production
observer or parser algorithm was changed for this stress-testing pass.

### Conservative recovery (staged Lichess integration)

The component also accepts `context.conservative = true` and optional
`context.currentTurn` (`w`/`b`). It enumerates distinct candidate intermediate
boards instead of returning the first preferred candidate. Stale last-move
highlights cannot break ties in this mode. Promotions captured before observation
include every legally compatible role when counting candidates.

Orthodox changed snapshots expose `diff.recovery`:

- `single`: the snapshots permit one legal move. Move-derived turn takes
  precedence over delayed clock/highlight metadata, as in the production adapter.
- `unique-within-two-plies`: exactly one generated legal intermediate board;
  `missedFen` contains it.
- `ambiguous`: multiple intermediate boards; `missedFen` is null.
- `unresolved`: no compatible candidate within the supported search;
  `missedFen` is null.

`searchedPlies` states the bound; two-ply results also include a candidate count.
The uniqueness claim is **bounded to two plies**, not proof that additional
unobserved moves did not occur. There is no exhaustive 3-5-ply search or neural
guessing. An unchanged placement still cannot reveal an out-and-back sequence.
When available, current side-to-move rejects two-ply explanations with incompatible
parity. Missing or stale turn metadata is not evidence that every gap is detected.

The publication wiring enables conservative mode **only on Lichess**; legacy
behavior on other sites and the default component API remain unchanged.
Production now delegates to the published component through `@require`.

The userscript and GUI now understand the component's ambiguity markers:

- Recognized gaps with no material increase do not trigger the generic
  `>6 changed squares` new-match reset. A reset to the standard start position,
  or a material increase, still uses existing new-match behavior.
- `historyIncomplete` is retained across subsequent observations, excluded from
  opponent timing, and appended to the compact history wire format only when
  true. Old packets decode with the flag false; existing field positions remain
  unchanged. A genuine match reset clears it.
- The engine history validator rejects explicitly incomplete histories even when
  a shorter alias happens to replay. The existing GUI warning and current-FEN
  analysis path remain available; historical clocks/rights are not certified.
- The GUI explicitly reports unavailable PGN and clears the opening label rather
  than exporting a fictional complete game.

```sh
node tests\lichess-database\run.mjs --skip-games 200000 --max-games 100000 --workers 4 --stress --conservative --output temp\lichess-board-report-october-conservative-100000.json
```

In this corpus mode the current side-to-move is supplied from the PGN as an
**upper bound for available DOM metadata**, not a claim that live metadata always
arrives synchronously. Reports must be compared separately from snapshot-only
runs. Abstaining on ambiguous cases can reduce exact-recovery coverage while
improving the correctness of returned reconstructions; unresolved cases still
count as errors against the zero-gap-error target.

On the same 100,000-game stress range (records 200001-300000), the final
conservative component produced:

| Metric | Legacy heuristic | Conservative |
| --- | ---: | ---: |
| Exact single-ply diffs | 6,615,733 | 6,615,733 |
| Exact one-missed-ply boards | 6,502,754 | 6,499,290 |
| Wrong legal one-missed-ply boards | 9,881 | 0 |
| Unresolved one-missed-ply boards | 3,236 | 16,581 |
| Illegal one-missed-ply boards | 0 | 0 |
| Three-ply bursts returned as two plies | 106,689 | 0 |
| Four-ply bursts returned as two plies | 10,107 | 10,107 |
| Five-ply bursts returned as two plies | 17,204 | 0 |

Thus 100% of returned one-missed-ply boards were exact **on this measured range**,
but coverage fell from 99.7987% to 99.7455% because ambiguous cases were withheld.
This is not 100% recovery: all 16,581 abstentions still fail the zero-error target.
Parity eliminated 123,893 longer-burst guesses; same-parity aliases remain
indistinguishable. Duplicate and stale-hint safety checks remained clean.
The parser-only mean was 17.99 microseconds/call. The saved report records the
component hash, options, limitations and separate stress counts.

### Conservative takeback reconciliation

`BoardChangeParser.reconcileHistory(history, observation)` owns takeback history
reconciliation. History is newest first, as in the userscript. The result is
`{ history, status }`; unconfirmed observations return the **same input array**.
The component never mutates the input states.

An observation must supply `basicFen`, `turn`, and a nonnegative integer absolute
`ply`. History entries must have independently recorded `observedPly` values.
A takeback requires a decreasing observed ply **and** a historical entry with
that exact ply, placement and turn. Placement equality alone, a forward/current
ply, missing metadata, invalid numbers, wrong turn or mismatching placement
never authorizes trimming. An inferred `plyCount` is not corroborating evidence.
When confirmed, reconciliation selects the correct occurrence of a repeated
board and restores its recorded FEN, clocks, rights and metadata; timing fields
are cleared so elapsed browsing time cannot become an opponent-move sample.

The publication wiring replaces `removeTakeback` with a component wrapper and
checks undo **before** the unchanged-placement fast path. This permits confirmed
undo between identical repeated boards. It restores the userscript's mutable
lost-castling-rights list as well as the displayed FEN. Reconstructed intermediate
positions do not receive fabricated observed-ply anchors. Subsequent forward
play or a different branch can itself be undone. Legal continuation in
conservative mode also prevents a repetition of the initial position from
triggering a false new-match reset, with or without ply metadata.

The Lichess round adapter supplies `getSiteData('ply')` from the selected move's
numeric move-number sibling and white/black column, without depending on its
obfuscated tag name or calling page functions. Replay controls identify an
unselected starting position, including nonzero custom starting plies. A fresh
game's all-disabled controls require Lichess's zero-turn starting message before
anchoring ply zero. Other sites and missing or malformed metadata still abstain.
The real observed endpoint of a recovered two-ply burst retains its ply anchor;
the generated intermediate does not. Chromium DOM regressions exercise the actual
adapter, parser and state-management code through backwards/forwards navigation,
captures, initial-position restoration, missed observations and repetitions,
checking that complete history remains legally replayable.

The metadata must describe the
same current observation: an entirely stale earlier board/turn/ply combination
is indistinguishable from actually browsing to that position. Repeated placement
plus stale decreasing ply cannot be certified safe without independent freshness
evidence. The tests explicitly expose this limitation, rather than promising
that snapshots can solve it.

```sh
node --test tests\takebacks.test.mjs tests\board-observer.test.mjs tests\lichess-database.test.mjs
node tests\lichess-database\run.mjs --skip-games 300000 --max-games 100000 --workers 4 --takebacks --output temp\lichess-board-report-october-takebacks-100000.json
```

The real corpus simulation uses recorded PGN ply/turn as authoritative metadata,
not inferred parser output. It tests undo depths 1, 2, 5 and all available plies
at the end of each game, verifies the entire retained FEN sequence, then legally
replays the next PGN move after restoration. Forward observations are checked
both with current ply and without ply; undo observations are also tested with
their corroborating ply withheld. Existing invalid-game and parser checks remain
enabled and the CLI separately reports `takebackValidation`.

Records 300001-400000 (100,000 games, 6,573,202 plies) produced:

| Check | Result |
| --- | ---: |
| Forward/repetition checks | 13,146,404 |
| Of those, actual previously seen placements | 38,942 |
| False takebacks | 0 |
| Confirmed undo / exact history restoration | 398,710 / 398,710 |
| Legal resume checks / exact next FEN | 398,710 / 398,710 |
| Uncorroborated undo observations kept unchanged | 398,710 |

Separate adversarial tests cover 1,000 plies of repeated knight cycles, every
return to the starting board, wrong/missing/stale/invalid ply metadata, exact
occurrence selection, both colors, promotion, en passant, both castling sides,
nonzero initial move numbers, branch replacement and immutable inputs. The staged
production observer tests additionally cover 80 consecutive repetition plies
without any ply metadata, confirmed undo to the same placement, full undo,
duplicate observations and castling on a different branch after undo.

### Quiet variant fallback

The staged wiring supplies the site's variant name as `context.variant`.
Known nonstandard variants (including atomic on an ordinary 8x8 board) only
receive snapshot diffs, not orthodox missed-move reconstruction or conservative
recovery markers. Unknown nonempty variant names are treated the same way.
Absent variant metadata retains existing orthodox behavior; rectangular boards,
pockets and non-orthodox tokens independently exclude orthodox reconstruction.
Takeback reconciliation merely restores recorded history with corroborating
ply/turn/placement, so it does not apply standard-chess rules to a variant.

```sh
node --test tests\board-variants.test.mjs tests\takebacks.test.mjs tests\component-loading.test.mjs
```

Variant tests execute the component in an isolated VM where access to console,
page globals, storage, network and timers throws. They cover 264 named-variant
cases and 2,352 snapshot pairs over board widths/heights 3-16, promoted tokens,
pockets, piece removals/spawns, atomic-like multi-piece disappearance, unchanged
boards and board-size replacement. They also check nonstandard geometry/tokens
without variant metadata. All cases must complete without logging or reporting
to the page. These are component quietness/fallback checks, not certification
of variant move semantics or of unrelated GUI/engine logging.

Local fixture results (not a benchmark of the pending Lichess downloads):
1,000 deterministic generated games / 98,780 plies had no single-ply failures.
Of 97,780 adjacent missed-ply pairs, history-context recovery was exact for
97,734; 14 were legal alternatives and 32 unresolved. Oracle last-move hints
resolved two of those alternatives. Parser-only mean was about 14 microseconds
per call in the corpus. A separate compressed 30-game varied fixture processed
about 18,000 plies/sec with two workers; small synthetic repetitive fixtures are
faster and should not be used to predict throughput for 60 GB of real games.

Run compressed fixtures, parallel limits/failures, loading guards and corpus
scoring tests without external downloads:

```sh
node --test tests\lichess-database.test.mjs tests\component-loading.test.mjs
```

## Maia Elo estimator calibration

`tests/maia-elo/` measures how well the Maia 3 likelihood Elo estimate recovers a known Elo.
Maia 3 plays games at fixed Elos, and the estimator is scored against them (self-consistency,
not human or chess.com ground truth). The app itself needs no new libraries; the rig needs
Node.js and Playwright (`npm install --no-save --package-lock=false playwright`), which uses
a Chromium from `%LOCALAPPDATA%\ms-playwright` (`npx playwright install chromium` if missing).

```sh
node tests/maia-elo/run.mjs --elos 800,1500,2200 --games 6 --plies 80 --engines 4
node tests/maia-elo/analyze.mjs                    # LENGTHS=10,20,30 PRIORS=450,700 SKIP=4
node --test --test-isolation=none tests/maia-elo.test.mjs   # unit + end-to-end checks
```

One headless Chromium page runs a pool of Maia engines (`--engines`). A failed game is retried
with a fresh engine and then dropped (reported as `failed`), so single failures do not matter.
Inference is compute-bound (~33 ms per position). On a 16-core machine 1, 2 and 4 engines give
about 3.1, 4.8 and 7.0 plies/s. Data goes to `tests/maia-elo/data/` (git-ignored).
Without cross-origin isolation (`ISOLATE=0`, e.g. a page that shows ads) Maia 3 falls back to one
wasm thread: ~75 ms per position instead of ~33 ms (2.3x slower), still usable for a match estimator.

Historical findings (48 games at 700-2500 Elo, 70 plies, before the shared likelihood scorer): the plain maximum-likelihood estimate is
unbiased on average, but a move carries only ~1e-6 Elo^-2 of information, so +-50 (1 sigma)
would need 300-900 moves per side. RMSE is ~420 / 270 / 250 Elo at 10 / 20 / 30 moves per
side, and ~340 / 230 / 215 with the sd 700 prior the app uses (extremes are pulled toward
1500). The app shows the posterior spread as "�". A 200-Elo grid is as accurate as 100.

Live detection, EloEye and the simulation now share `app/assets/engines/Maia3/likelihood.js`.
Live detection retains its fixed temperature of 1, 600-2600 grid, opening exclusion and
1500/sd-700 prior. The shared scorer normalizes legal policies, distinguishes rare moves
down to a numerical floor of 1e-12 instead of flattening everything below 1e-4, and requires
the exact promotion move. Invalid/missing policies are reported, not assigned a guessed
probability. The historical accuracy figures above have not been re-established for this
scorer; the end-to-end test checks self-consistency, not human calibration.
## Run

From the repository root, with Node.js and npm installed:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node --test tests/lichess-state.test.cjs
```

An existing Chromium installation can be used instead of downloading a browser:

```sh
CHROMIUM_PATH=/usr/bin/chromium node --test tests/lichess-state.test.cjs
```

## Coverage

- Both orientations with coordinate labels hidden, outside, or inside squares; unrelated preview boards.
- Signed-in White/Black identity independent of board orientation; late identity data; anonymous and nonparticipant fallbacks; analysis-board isolation.
- Side to move on reload, selected replay moves, clock scoping, known-mover/forced-turn precedence, and preservation when the turn is unknown.
- State publication before backend creation, flips without new matches, unchanged positions, and consistent state/history/FEN/turn at match reset.
- GUI orientation independent of player color; compatibility with older userscripts; message and direct-access bridge modes.

The fixtures use Lichess's `body[data-user]`, `.game__meta__players .player.white/.black`, selected-move `.a1t` marker, and `.rclock-white/.rclock-black.running` classes. No localized UI strings or private game endpoints are read.

For baseline comparisons, `ACAS_SOURCE`, `ACAS_SETUP_SOURCE`, and `ACAS_BRIDGE_SOURCE` can point to older copies of the corresponding production files. Tests read production code at runtime; they do not contain a replacement implementation of the detection logic.

These tests do not exercise a live logged-in Lichess session, chess-engine binaries, or the full application stress-test harness in `app/dev`. Anonymous sessions without identifying metadata retain orientation-based player selection. Analysis/study turn detection and full initial FEN metadata reconstruction are outside this change.

## Elo estimator tool (`tools/eloeye/`)

Run `node --test tests/elo-routing.test.mjs` with Playwright and Chromium installed
to verify the tools link, canonical metadata, module paths, and connection-check
layout stability on mobile and desktop. The old `tools/elo/` address is not redirected.

Standard-chess GUI searches now send the legally verified recorded move sequence with the UCI `position` command, rather than only the latest FEN. This lets Stockfish recognize repetition history. Hypothetical side-to-move rewrites, Chess960 and variants retain their existing FEN-only path. Incomplete/invalid recorded histories explicitly warn and fall back to the current position; no moves are invented. Run `node --test tests/engine-position.test.mjs` for repetition preservation, special moves, duplicate snapshots and invalid/stale history. Maia's position-only policy still has no repetition-history input: actual rule-based draws remain draws, without forced alternative moves or material-based wins.

Moves have no presentation pacing or board animation. Each position waits for the final search result and configured display delay of every enabled automatic, non-learning profile. A short 20 ms settling window is not a substitute for that completion barrier. Searches that never finish time out rather than letting fast profiles dominate. Position/revision matching and legal-move validation still gate every move. `?fast` shortens failure timeouts only.

The measurement protocol is `maia-top-policy-paired-openings-pooled-personality-v6`. Runs from earlier selection/scoring policies are rejected rather than mixed with new measurements. Games normally continue until chess.js reports checkmate or a rule-based draw (including automatic threefold/fifty-move claims). There is no arbitrary ply cutoff. Cancellation/connection failures do not become scored draws. Old stored results display a legacy warning.

The sole material shortcut is exactly king and queen versus a bare king. It requires nine qualifying positions spanning eight played plies, rejects an adjacent defending king and queen, resets stability on repeated positions, and refuses positions with a halfmove clock above 60. On the defender's turn every legal reply is checked for an immediate draw or queen capture, with speculative moves undone. Actual terminal results take precedence. Rooks, extra queens, pawns and every other material combination play on. This is a conservative heuristic, not a tablebase proof or verification that the profile can convert. Scored games persist `materialAdjudication: true`, and the inline result discloses how many games used it. Run `node --test tests/elo-material.test.mjs` for symmetry, rejected material/terminal cases, stability duration, repetitions and checkpoint metadata.

For A.C.A.S suggestions, the GUI supplies rank/best/safety/category metadata through visible move shapes. All profiles contribute to one pool; identical moves (including promotion) count once. Each move belongs to one category. Conflicting profile labels use the more cautious category in this order: best, safe secondary, unclassified, mistake, missed opportunity, blunder; engine scores are not compared across profiles.

The collapsed suggestion mix is visible only in Config mode. Its default is 90% best / 10% any alternative, including warned and unclassified moves. Optional detailed controls split alternatives into safe secondary, mistake, blunder, miss and other. Editing one percentage automatically rebalances the others proportionally, preserving zero shares where possible. If all other shares were zero, the first available control receives the remainder. Switching to detailed controls assigns the alternative share to safe secondary. Switching back pools all non-best shares into any alternative.

Selection chooses an available positive-weight category, then a distinct move uniformly within it. Empty categories redistribute their weight. If no enabled category has a legal shown move, selection uses a uniformly chosen fully revealed candidate and explicitly notifies the UI. The run/result warning persists through saved-game checkpoints as `suggestionFallback`. This fallback never invents moves, accepts illegal moves or combines partial hints. Missing metadata still fails explicitly. Target-square-only profiles finish normally but contribute no playable candidates and do not block other profiles' full moves.

Usage explanations live below the tool in "How to use the suggestion mix".
The rounded accuracy table uses the current model-only 95% confidence sequence:
balanced results at a 1600 reference cross half-widths 200/150/100/75/50 at
36/64/152/280/634 games. Displayed counts round these for guidance; the current
adaptive simulations typically need roughly 160-180 games for a 100 target.
The current target is 25 with a 1000-game cap. Balanced results need 2530 games
to cross 25, so runs can hit the cap first and must report the wider interval.
The 25 row is illustrative, not a human-Elo calibration claim. Scoped table-row
styles keep two separated columns on phones despite the site's global mobile
table stacking. The single GUI active indicator sits below the title and includes
the manager name obtained over the GUI channel.

Classification uses the existing mistake/blunder/miss detector independently of warning colors. Safe secondaries also require at most 100 cp loss and a compatible mate score; Maia alternatives without individual scores are unclassified. Labels are engine estimates, not independent tactical guarantees. Percentages must total 100, persist in settings/checkpoints/results, and remain locked throughout a saved run to avoid mixing personalities. Resume restores that exact mix; discard to edit it. Maia's own moves remain deterministic. Run `node --test tests/elo-hints.test.mjs` for category distribution, pooling, conflict, unavailable-category and profile-completion checks.

Each color pair has a saved `opening` index. A deterministic suite of 500 distinct positions after six to twelve plies is built from the bundled opening corpus, interleaving e4/d4/c4/Nf3 families, excluding early captures, king/rook moves, terminal/check positions and immediate en-passant opportunities. Each position is used for one color-swapped pair, never another pair in the same run; the 1000-game automatic budget needs 500 positions. This prevents identical-start duplicate games without randomizing Maia's choices. Openings are not engine-evaluated as equal, and positions may later transpose: color pairing mitigates opening advantage but does not establish human-Elo calibration or statistical independence. The expanded suite uses measurement protocol v6, so older runs must be discarded rather than resumed with different openings. `tests/elo-openings.test.mjs` validates all positions, unique pair assignment for all six board counts, and explicit failure on insufficient data.

Maia always chooses the highest-probability legal move, matching the normal A.C.A.S Maia engine rather than sampling. Ties retain policy order. Highest probability predicts the most likely move, not necessarily the objectively strongest move. Both rating inputs remain the selected reference level: this deliberately defines a stable equal-rating-conditioned opponent, not a claim about the unknown player's strength. Feeding the evolving estimate into opponent conditioning would change that reference and needs independent calibration first. Ready board requests coalesce on the next event-loop turn into batches of up to six on one shared model, without waiting for slow boards. Only one inference runs at a time; stop/failure rejects both active and queued requests. Tests compare real six-position batch policies with individual inference for both colors and test deterministic top-policy selection, terminal scoring, long-game continuation, invalid policies and cancellation.

Results are labeled uncalibrated Maia reference scores, not human Elo. Range exits do not display a bare `2600+` rating. Model-only 95% intervals exclude opponent calibration error and matchup bias. No independent human-anchored calibration dataset has been established; more games or stronger move selection cannot substitute for one.

Concurrency is user-selected from 1-6 boards (default 2), saved with settings and checkpoints; no browser hardware APIs choose it. Manual play uses one board. Group sizes for 1/2/3/4/5/6 boards are 2/2/4/4/6/6: the smallest even group that can use every lane. One/two-board runs therefore adapt after two games rather than four. Odd board counts can have idle lanes while the final color partner finishes; starting an unplanned next group would trade away the complete-group decision guarantee. On resume the saved group is finished unchanged, then new groups use the selected count. The automatic precision/game-budget policy is unchanged.

The optional "Use one Maia worker per board" checkbox defaults off and persists in browser settings. Off shares one batched opponent. On creates one opponent per lane, up to six, with separate model copies and independent move-analysis queues. The first model loads before additional workers so they can reuse its download cache. Workers are reused between games and all are disposed on stop, initialization failure or run completion. Manual and single-board runs still use only one. This is a performance preference that can change between resumes, not a change to the opponent policy or measurement protocol. More workers use substantially more memory and are not guaranteed faster. The browser test checks four real workers, game progress, cleanup and resuming with one shared worker.

Run `node --test tests/elo-automatic.test.mjs tests/elo-adaptive.test.mjs tests/elo-tool.test.mjs` for the Elo tool. Automatic-policy tests cover outcome-dependent delays, concurrency invariance, color balance, stopping coverage, range exits, budget exhaustion and partial-group recovery. The lower-level adaptive selector also has fixed-length simulations. These simulations validate behavior under a synthetic Elo model, not accuracy against human ratings. Browser regressions use real Maia with a mock direct GUI endpoint and shortened run budgets served by a test-only route override. The server is non-isolated (`ISOLATE=0`), like the public tool page.

There is one automatic precision policy, defined in `tools/eloeye/eloPolicy.js`. Statistical batches contain two, four or six preplanned games in color-balanced pairs. Two-game openings use 1500; four-game openings use 1000 and 2200; six-game openings use 1000, 1600 and 2200, each with both colors. Saved opening groups retain their original plan on resume. Subsequent pairs maximize posterior-weighted log-information gain using the lower-level selector. All games in the group must finish before adapting or stopping. Fast wins cannot steer new decisions ahead of slower losses/draws. This deliberately gives up some utilization to avoid completion-order effects. The user controls concurrency; choosing fewer boards reduces memory demand, but cannot guarantee that the real A.C.A.S engines fit in RAM.

### Hybrid move evidence

EloEye samples the measured side's actual legal moves (including manual play) from their
pre-move positions. It compares Maia probabilities at 11 rating inputs, 600-2600 in steps
of 200, and temperatures 0.25, 0.5, 0.75, 1, 1.5 and 2. Both rating inputs use the same
reference level. Temperature is normalized from each policy without additional inference
or random games; it describes sampling resemblance and never changes the actual Maia
opponent's top-policy move. No independent PV/evaluation-loss analysis is added.

Sampling shares the opponent's single loaded model. Ready game moves have priority;
background inference yields after each rating input, so a full grid cannot block a move
as one large batch. There is at most one pending sample per board and 24 completed samples
per game. Book moves through fullmove 4, forced moves, repeated positions within a game,
and positions arriving while that board's sampler is busy are skipped. Sampling ends
after the first complete group reaching 16 games. A finishing game awaits its outstanding
sample before atomically saving result and evidence; voided/restarted games discard their
samples. Inference failures stop the run visibly rather than inventing probabilities.
Fast or short games may produce too few samples for a provisional estimate.

Joint log likelihoods accumulate across moves before marginalizing over temperature,
with a uniform prior over the temperature grid and the shared Elo prior. At least six
samples and non-flat rating evidence are needed to display a provisional resemblance.
The displayed model spread is a posterior standard deviation, **not** a confidence
interval or certified playing strength. Elo/temperature ambiguity, correlated moves,
busy-position selection and non-human engine styles limit its interpretation.

Only completed groups guide opponent selection. A broad (at least 400-point spread),
bounded search adjustment limits move evidence to at most two log-weight units and fades
to zero by 16 completed games. It cannot contribute wins/draws/losses, change the final MLE,
tighten the confidence sequence, or trigger stopping. Live partial evidence is display-only.
Stored per-game version-1 move-evidence totals survive checkpoints and results. Partial
games restart without their evidence; old checkpoints without evidence remain valid
because the opponent, outcome protocol and final inference are unchanged.

Run `node --test tests/elo-likelihood.test.mjs tests/elo-tool.test.mjs` for probability
normalization, exact temperatures/promotions, joint fitting, bounded sampling, failure
handling, persistence, guidance isolation, synthetic coverage, queue priority, live-worker
integration and real-browser lifecycle/UI tests. The tests retain the 1-6-board, crash
recovery and heap-growth checks described below.

Initial synthetic checks found 1.048x early information with helpful resemblance and
30.1-point RMSE with deliberately misleading resemblance (one anytime interval miss in
30 runs). This is a controlled model check, not a hardware speedup or human-Elo result.
A non-isolated browser took about one second to score one position across the full grid.
A seeded four-game comparison with 300 ms mock hints took 19.3 s outcome-only versus
21.4 s hybrid (1.11x). Sampling gives an earlier provisional result and can improve targeting,
but it costs computation and is **not guaranteed to reduce total wall time**.

The all-count regression runs the actual automatic scheduler with real Maia for each dropdown value 1-6, verifies every selected lane starts, checks opponent coverage/color pairs and distinct opening assignments, and finishes a 12-game test-only budget. Synthetic all-count simulations use the production group sizes (not a fixed four-game proxy) and report model-relative error, coverage, information efficiency and outcome-dependent simulated duration. They are not hardware speed benchmarks or proof of a globally fastest policy.

The point estimate remains unregularized MLE. The automatic interval inverts a fixed-mixture likelihood-ratio test at alpha 0.05, rather than repeatedly inspecting a fixed-time Wald interval. For each candidate rating `r`, the test statistic is `sum_q prior(q) L(q) / L(r)`, using a fixed Gaussian-weighted grid of alternatives from 0 to 4000. Each factor is a nonnegative supermartingale under the assumed Elo conditional mean: for scores in [0,1], convexity bounds its conditional expectation by the Bernoulli endpoints (so draws are allowed). Ville's inequality supplies the time-uniform error bound. Evidence is accumulated in preplanned order only at complete-batch boundaries, not in outcome-dependent completion order. The grid approximates the alternative mixture, not the null ratings; continuous interval boundaries are found by bisection. Guarantees depend on the Elo conditional-mean assumption, not on Maia's labels being calibrated to people.

After at least 16 games, stop when the 95% model-relative confidence sequence is no wider than 50 Elo, or wholly outside 600-2600. There is a 1000-game safety budget, and the result explicitly reports when it expires without meeting precision. Maia opponent selection uses 10-point steps, while displayed point estimates round to whole Elo points without shrinking the interval. A point estimate at a boundary is not sufficient for a confident range exit. The run progress bar indicates budget usage, not time remaining. The initial 500 seeded in-range simulations of the previous 100-half-width policy took about 161-178 games and achieved RMSE 24-26 Elo. Those historical measurements are not benchmarks for the new target. More games do not establish human-Elo calibration.

Research informing the design:
- Han (2018), [Components of the item selection algorithm in computerized adaptive testing](https://pmc.ncbi.nlm.nih.gov/articles/PMC5968224/): information-based selection, early uncertainty and precision-based termination.
- Howard et al. (2021), [Time-uniform, nonparametric, nonasymptotic confidence sequences](https://arxiv.org/abs/1810.08240): uncertainty that remains valid under repeated inspection and adaptive stopping. EloEye implements the bounded-score likelihood-mixture construction described above, not the paper's full library of bounds.
- Desautels et al. (2014), [Parallelizing Exploration-Exploitation Tradeoffs in Gaussian Process Bandit Optimization](https://jmlr.org/papers/v15/desautels14a.html): delayed/batched observations require explicit accounting. The GP regret theorem does not directly apply to chess or prove this policy optimal.

EloEye writes a version-2 `acasEloCheckpoint` with the measurement protocol in localStorage before model loading, at group planning, and after each completed game. It contains the committed groups plus the current group's planned opponents/colors and any finished scores. This preserves ordering and avoids dropping or duplicating partial-group results after a crash. Unfinished games replay at their planned settings. Stop preserves the run; reload offers Resume and Discard. Resume requires the same A.C.A.S config. Version-1 fixed-length checkpoints are supported only with the current protocol and retain their approximate interval rather than the automatic stopping guarantee. Storage errors are visible, incompatible checkpoints require explicit discard, and a completed checkpoint is kept until the run is reset.

Memory checks cover three automatic start/stop cycles in one page with real Maia inference and a mock direct GUI endpoint: workers/DOM boards/sessions must be released, cached runs must not re-download the model, and retained main-thread JS heap growth after forced GC must remain below 8 MiB. This is not a bound on total browser or real A.C.A.S engine memory. Each real GUI board can own multiple engine workers, networks and hash tables; hiding the board mainly saves rendering work, not those allocations. Model loading waits for the cache check to avoid duplicate ONNX sessions; inference tensors, abort listeners and board waiters are explicitly released.

How the tool works: it plays the user's configured GUI profiles against Maia 3 through direct same-origin sessions, described above. Games use ordinary DOM boards, not iframes or userscript board parsing. Full visible moves use the configured category mix; partial hints mean the user plays by hand. Maia 2/3 alternatives require unclassified-category opt-in when only root evaluations are available. Missing, late, stale or illegal answers void and replay the game; explicit setup errors, repeated failures or the overall void budget stop the run visibly.

Browser tests inject `tests/elo-tool/mockUserscript.js` (moves, multi, illegal, flaky, partial, silent behaviours) and open the tool with `?fast`, which shortens timeouts. They need Playwright. Each game requires the direct session's `connected` status within `connectTimeoutMs`; teardown explicitly closes its GUI instance and waits for acknowledgement, with a bounded fallback when the GUI is unavailable. GUI activity and manager information are queried directly over the same-origin session channel. Browsers throttle hidden tabs, so both tabs must stay visible.

The AdSense Offerwall is configured per page in AdSense, not in code.

`tests/elo-tool/userscriptHarness.mjs` builds the real `acas.user.js` with a GM_* shim for Playwright (`installUserscript(context)`). It needs the page served on `http://localhost/A.C.A.S/` (port 80) because the userscript checks the exact host. Direct integration uses this only for normal GUI configuration/storage; chess-site adapter/state tests separately exercise board parsing. Actual Tampermonkey/Violentmonkey internals are not emulated or certified by these tests.
