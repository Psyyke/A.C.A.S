These test modules are vibe coded and aren't meant to be beautiful lasting code.

Scripted scenarios stop their pending waits when you switch tests.
Free Move allows both colors. Takeback uses `stepDelay` between moves and
`takebackHold` after undos. Loop is offered for PGN replays, which reset to their
starting position on each pass. One-shot modules do not show an inactive Loop
control. Promotion scenarios also cover knight underpromotion and a black
capture promotion on a flipped board.

## Automatic short run

Run short tests runs 36 scenarios, three per category, then waits up to
3 seconds for a legal A.C.A.S suggestion at each final position. Automatic
replay delays are capped at 100 ms, except explicit promotion delays.
There is no extra wait after the final move. A countdown shows when the runner
is waiting for A.C.A.S. Manual replays retain their original timings. The board
faces the side to move during that check. Check and game-over positions are
skipped, not failed. The score is passes divided by eligible scenarios, with
individual outcomes and response times. Stop or selecting another test cancels
the run. Results reset on refresh.

This measures final-position responsiveness, not every intermediate animation,
engine health or move accuracy. Keep A.C.A.S connected and configured to show
full suggestions. The unchanged bridge has no FEN or request ID, so a stale
suggestion that remains legal can still count. Several promotions end without
check, including a quiet reply after the fast promotion.
Categories include delayed, fast and instant promotions, knight and capture
promotions, castling, en passant, takebacks, vanishing moves, board recreation,
flips and batched premoves. The automatic edge scenarios use brief scripted
actions while the individual test buttons keep their original demos.

## Live matches

Live mode plays against the bundled Stockfish 18 single lite.
Move time starts at 500 ms and can be changed from 1 to 60000 ms in the panel.
The setting stays saved in this browser and applies to the next search, not a
search already running. Larger values allow more thinking, not a fixed animation
delay. Search timeouts include an extra grace period for slower settings.
Exports keep the initial setting per game and the requested search time per
Stockfish move, so changing speed mid-game does not lose that detail.
A.C.A.S suggestions still arrive through the existing page bridge, so no userscript
changes are needed. You can also play the A.C.A.S side manually. Promotions on that
side default to a queen. Each new game swaps sides, including automatic restarts.
Each new game navigates to a fresh dev page, giving the unchanged userscript a
new instance ID and exercising normal GUI creation and old-instance disconnect.
This simulates sequential game churn, not hundreds of simultaneous games.
Run records carry over through a one-use session checkpoint only for these
automatic navigations. An ordinary refresh still clears statistics.
Navigation replaces the current history entry, so long runs do not fill the
Back button history. A paused new game stays paused after navigation.
If saving the checkpoint fails, play stops with an explicit message.
Pause stops the opponent and ignores suggestions until you resume.
This is also an unattended stress runner. If A.C.A.S has not played a legal move
on its turn for 2 minutes, the game is marked failed and a new match starts.
Illegal suggestions do not reset the watchdog. Paused time does not count.
Failures always restart, even when restarting completed games is turned off.
Pause also suspends a pending recovery.

Opponent startup, readiness, search, worker and command errors are recorded
separately and recover too. Retries wait 5 seconds, then 10, 20 and at most 30
seconds for consecutive failures. Any accepted move resets that backoff.
The backoff carries over to the fresh page too.
Failure records include the side, reason, position and waiting time.
They never count as a win, draw or completed game.

Stats stay in memory for this page and survive test switches, but reset on refresh.
Only the Stockfish speed preference is saved in local storage.
The panel shows completed games, wins by side, draws, interrupted games, plies,
average move times and average completed-game duration. The last 20 games appear
in the panel. Export JSON includes every game from this page session, its PGN, colors, result,
end reason and individual move timings, plus the current game.
Games left unfinished are recorded separately and never counted as wins or draws.

Board redraws disconnect old resize observers and listeners. Closing a test
also cancels pending redraws, dragging and arrow drawing, while live mode clears
worker callbacks before termination. Leaving the page closes the active test.
Full game records and heap samples are intentionally kept for export, so their
memory use grows with the run. This is different from abandoned boards or workers
leaking. Fresh matches release the old page, but increasingly large checkpoints
can eventually hit the browser's session storage limit. That stops the run with
an explicit message rather than silently losing statistics. No finite check can
guarantee an endless run or rule out leaks inside A.C.A.S or the browser.

For a pre-release check, leave completed-game restarts enabled and let the page
run for an hour, then export JSON. Run diagnostics sample elapsed time and the
optional Chromium JS heap counters every minute and save them alongside games.
Open GUI tabs on the same origin report their heap through BroadcastChannel
when the dev page requests a sample. Each responding tab has its own ID and
reading in the subheader, with samples included in live JSON export. The
subheader stays active across all tests, including the short run and idle page.
Refresh already-open
GUI tabs once to load the reporter. Requests happen at start and every minute,
with a 5-second reply window. No GUI reply replaces the previous reading
rather than showing an old value as current. Unsupported heap counters show
Unavailable, and unsupported channels show Channel unavailable.

Tabs must share the same origin and browser storage partition. Different
hosts or ports, and differently partitioned contexts, cannot communicate.
These are optional Chromium heap counters, not total browser or dedicated
engine-worker memory. Chromium may aggregate heap counters for tabs sharing a
process, so do not sum readings or assume perfect per-tab isolation. Heap
growth alone does not prove a leak. Use browser profiling to investigate.
Keep the tabs awake for reliable timing. Browser suspension, a renderer crash
or an exhausted browser process cannot be recovered by JavaScript inside this page.

Move time runs from the previous move (or game start) to the accepted move.
It excludes pauses but includes engine startup, A.C.A.S processing, message delivery
and any manual input delay. Game duration sums the played move times.
These are end-to-end timings, not pure engine computation benchmarks.
The existing bridge sends only two squares, with no position or request ID.
Out-of-turn and illegal suggestions are ignored, but an old suggestion that is
still legal on a later A.C.A.S turn cannot be identified perfectly without changing
that protocol.