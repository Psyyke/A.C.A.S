# Dynamic settings application review

## Runtime behavior

- Effective settings, synchronization queues, engine workers, UCI readiness and option
  metadata are scoped to the actual instance, not the GUI settings filter.
- Board updates synchronize before rendering/analysis. Graph edits synchronize and
  request analysis of the current position. Deleting/disabling a graph restores the
  saved value through the same synchronization path.
- Dropdown Y levels use persisted value tables and Step interpolation. Level zero is
  `Saved default`. Profile curves are aligned by value for display, not by old index.
- New/edited curves apply only within their drawn X range. Existing numeric/boolean
  curves retain their old endpoint behavior until edited.
- Engine curves additionally use the saved engine at move number 1/new-match reset.
  Engine changes replace pending/loaded workers and analyze the current FEN after
  initialization. Late callbacks from replaced workers are ignored.
- Rejected or old-engine UCI options cannot mutate the active profile's MultiPV or
  Chess960 cache. Graphed variant, Chess960 and MultiPV settings also reach advanced
  mode startup; removing variant/Chess960 curves restores their saved defaults.
- Evaluation curves use the first completed primary evaluation per position. This
  avoids unbounded engine-switch/evaluation feedback. Evaluation is also sent to the
  corresponding userscript instance for site-side settings.
- The storage schema permits one curve per setting/profile. The editor prevents a
  second variable from silently taking ownership, explains this, and exposes buttons
  to visit the existing curve on another variable. Different profiles do not conflict.

## Setting application paths

| Settings | Application path / applicability |
| --- | --- |
| `chessEngine` | Replace worker, initialize resolved settings, resume current-FEN analysis |
| `engineEnabled` | Stop pending/loaded worker when false; create worker when true |
| `useExternalChessEngine`, `externalChessEngine` | Reload profile; instance-scoped UCI routing |
| `enableAdvancedElo` | Reload profile into resolved basic/advanced mode |
| `engineElo`, `engineEnemyElo` | Basic-mode ELO setter sends strength/skill/ELO and updates cached search depth; Maia clamps to its supported range |
| `advancedEloDepth` | Advanced-mode cached search depth; node search takes precedence when nodes > 0 |
| `engineNodes` | Cached node budget in advanced mode/Lc0, including returning to zero |
| `moveSuggestionAmount` | Cached marking count and UCI MultiPV; zero hides suggestions while engine MultiPV remains at least one |
| `chessVariant`, `useChess960` | Reinitialize profile with resolved variant/960 settings, including advanced mode and graph deletion; engine capability still applies |
| `lc0Weight` | Load resolved weights on Lc0; not applicable to other built-in engines |
| `DYNAMIC_*` spin/check/combo | Instance-scoped UCI metadata; apply resolved value on changes and startup, including basic mode; only applies to its matching engine |
| `maxMovetime`, `moveDisplayDelay` | Read resolved value for each search/display cycle |
| `arrowOpacity`, `bookMoveOpacity` | Read resolved value by move/book rendering |
| `displayMovesOnExternalSite`, `showOpponentMoveGuess`, `showOpponentMoveGuessConstantly`, `onlyShowTopMoves`, `moveAsFilledSquares`, `onlySuggestPieces` | Read resolved values by GUI/userscript rendering |
| `alwaysMyTurn`, `reverseSide`, `onlyCalculateOwnTurn`, `movesOnDemand` | Read resolved values by profile calculation/site interaction |
| `renderSquarePlayer`, `renderSquareEnemy`, `renderSquareContested`, `renderSquareSafe`, `renderPiecePlayerCapture`, `renderPieceEnemyCapture`, `renderOnExternalSite`, `enableEveryPieceEvals` | Read resolved values by metric rendering |
| `enableMoveRatings`, `enableEnemyFeedback`, `feedbackEngineDepth`, `feedbackOnExternalSite` | Instance-scoped resolved profile and per-move feedback reads |
| `ttsVoiceEnabled`, `ttsVoiceName`, `ttsVoiceSpeed` | Read resolved values for speech |
| `autoMove`, `autoMoveLegit`, `autoMoveRandom`, `autoMoveAfterUser`, `legitModeType` | Site-side shared-core getters resolve for that userscript instance |
| `webhookEnabled`, `webhookIncludeBoard` | Webhook settings are resolved using the payload's instance/profile |

Non-profile controls, free text, file selectors, colors, and UCI buttons are not
offered as graph values. Supported dropdowns use the actual available choices.
Basic ELO/advanced depth/node applicability is explained in the graph editor.
Moves-on-demand cached activation now refreshes from resolved, merged instance/global
settings on position changes and during the userscript heartbeat. Enabled dynamic
site-rendering curves provision the site drawer even when their saved defaults are off.

## Regression coverage and validation limits

The existing browser test page `dynamic-graph-tests.html` now includes shared-core
tests, dropdown definition/index alignment tests, concurrent-instance synchronization
tests, actual setting-handler tests, default restoration tests, and toolbar markup
checks. Each supported setting discovered in the real markup also has an individual
resolution/default-restoration regression check. Existing zoom/pan/point/shortcut
checks remain in place.
Additional focused checks cover instance-scoped UCI readiness/metadata, old-engine
option rejection before cache updates, and advanced startup/default restoration.
UCI combo parsing preserves multi-word choices and numeric-looking string identities;
variant discovery is processed before the option-registration early return.

The changes and test fixtures were reviewed through file inspection. No terminal
commands or browser execution were available/used during this change, so the tests
have **not** been executed and live worker behavior remains unverified.