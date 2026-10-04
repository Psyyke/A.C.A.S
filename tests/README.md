# Lichess state regression tests

These tests execute the actual userscript adapter and state-management declarations against Chromium DOM fixtures. Storage, engine transport, and unrelated UI are stubbed. The GUI orientation-initialization block and message bridge are tested separately from engine loading.

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
