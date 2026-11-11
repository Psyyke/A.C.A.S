# Rodent V in the browser

This is the real Rodent V 1.2.03 search, evaluation and personality system,
compiled from upstream revision `b55a1d142a4254dd091ede86845b2b9ac036653e`.
Choose **Rodent V** in the A.C.A.S engine picker.

It runs on one CPU thread in a Web Worker. No Calculation Server, GPU or
SharedArrayBuffer is needed. The default engine download is about 9.4 MB.
The first 768-neuron personality also loads an 8.1 MB runtime, then its
network and books. Those assets stay on the same host as A.C.A.S.
Browser caching can save later downloads.

## Personalities and Advanced Elo

Yes, personalities are configurable through **Advanced Elo**. Open a board
so the engine can publish its options, open the cog beside Engine ELO, and
enable Advanced Elo. The **Personality** dropdown offers:

- `default`, the latest embedded 512-neuron multilayer network
- `ampere`
- `chaotic`
- `hector`
- `nimzoid`
- `rodent`, the older upstream default preset
- `tal_hybrid`
- `tal_nnue`

The seven named presets are the upstream text files, not A.C.A.S imitations.
They select an NNUE network, opening books and evaluation settings.
For example, `tal_hybrid` mixes handcrafted evaluation and NNUE, while
`tal_nnue` uses the supplied Tal network. These are playing styles, not a
promise to reproduce a particular person's moves.

For a custom style, paste the **contents** of a personality text file into
**PersonalityFile**. No disk path or file upload is needed. It accepts comments
starting with `;` or `#`, blank lines and one UCI setting per line, for example:

```text
setoption name hceWeight value 80
setoption name nnueWeight value 40
setoption name OwnSafety value 60
setoption name OppSafety value 150
```

Changing the text restarts this profile's engine. The file is limited to 64 KiB,
is included in settings exports and is only active in Advanced Elo.
Clear the textarea to remove its overrides. Resource references inside the
text must still name bundled networks or books, such as
`nets/rodent_4kb_768hl_8ob_v2.bin`. Unknown settings, invalid values and unavailable
resources produce an error rather than quietly loading a different style.

You can also edit the individual UCI settings:

- **hceWeight / nnueWeight** control the handcrafted and neural contributions.
  The default is pure NNUE, so changing handcrafted terms alone will not
  reshape that default's evaluation. A hybrid preset is a handy starting point.
- **Own... / Opp...** tune material, mobility, king safety, pawns, passed pawns,
  threats and other terms separately for the engine and its opponent.
- **likesClosed, kingTropism, forwardness** are upstream style terms.
- **NnuePath, MainBook, GuideBook** select bundled resources, not local disk
  paths or arbitrary uploads. Prefer a preset unless you know the matching
  network scale and mirroring settings.
- **OwnBook** enables the preset's books. It is off by default. Book moves
  return a single move without searched scores or multiple variations.

The order is **base preset, then PersonalityFile text, then explicitly saved
individual controls**. Explicitly saved style edits take
precedence over both, even after changing personality or reloading the
app. This includes edits equal to the displayed engine default, such as
`hceWeight = 0`. An explicit NnuePath also wins over the preset's network.
Use a fresh profile for an untouched preset. Unedited fields show the
engine's advertised defaults, not a live expansion of the preset file.
Settings exports include these selections and overrides.

### Strength is separate from style

In normal mode, Engine ELO uses Rodent's own strength limiter from
**800 to 3000**. The app's **3200** setting means full strength, not a
calibrated 3200 rating. Out-of-range limited ratings are clamped with a warning.
Stockfish's skill levels and ELO-derived depths are not used for Rodent.
With **Only Top Moves** enabled, limited Elo searches wait for the final
`bestmove`. The app uses Rodent's reported node limit, including limits set
through Advanced Elo, rather than assuming a deep search is unrestricted.
At **3200**, suggestions can update while the unrestricted engine
thinks, just like the app's other unrestricted engines. Max Movetime still
applies.

In Advanced Elo, enable **UCI_LimitStrength** and set **UCI_Elo** yourself.
Rodent reduces its node budget for lower ratings. An explicit Search Nodes
budget takes precedence over that rating budget in upstream Rodent.
Depth and movetime can stop the search earlier too.

Personality choices, browser speed and search limits all affect strength.
The browser port has not been calibrated against human ratings. Style-shaped
evaluations are also not neutral Stockfish evaluations.

## Supported app features

- Chess and Chess960, including UCI king-to-rook castling
- FEN positions and move history
- MultiPV suggestions and scored principal variations
- Depth, nodes, engine movetime, infinite search and responsive stop
- Moves On Demand through UCI `searchmoves`
- New-game resets, per-profile settings and runtime changes
- The supplied opening books and all seven personality files

Threads is fixed at 1 and Hash is limited to 1-256 MB. Native filesystem
access, saving personality files to disk, arbitrary network uploads, training
commands, other chess variants and UCI WDL output are not integrated.
The app's own opening-book feature is separate from Rodent's OwnBook option.

Missing or corrupt binaries, books and networks fail the affected profile
explicitly. They do not silently select another network or close other profiles.

## Why two runtimes?

The pinned upstream default uses a 512-neuron network. Every bundled
personality points to a 768-neuron network. NNUE width is a compile-time
constant upstream, and its permissive loader can misread those older blobs
in a 512-neuron executable.

We build both widths with the original scalar kernels. The controller picks
the matching runtime, stops any previous search, then restores options and
the current position. It never truncates or pads network parameters.
Changing personalities also clears evaluation and pawn caches so old scores
cannot leak into a new style.

The browser changes are in `browser.go`, `worker.js`, `personality.js`, `runtime-worker.js`
and the checked replacements in `build.mjs`. They provide asynchronous UCI
input, bounded same-origin asset loading, cooperative search yielding,
architecture switching and root-move restrictions. Upstream does not
implement `searchmoves`, so the port filters root moves and bypasses internal
book picks for restricted searches.

## Build

Install Git, Node.js and **Go 1.27.4**, then run from the repository root:

```powershell
node app\assets\engines\rodent-v\build.mjs
```

There are no npm build dependencies. `RODENT_GO` can point to a Go executable.
`RODENT_UPSTREAM_DIR` can point to an existing clean checkout at the pinned
revision. Otherwise the script downloads it into the ignored `build` folder.
The Go tool downloads the dependency pinned by upstream's go.mod and go.sum.

Keep the whole `dist` folder with the workers and the shared
`../text-files.js` helper when deploying. The build
includes the binaries, matching Go JS runtime, resource hashes, licenses and
an archive of the exact upstream source. The build directory is not deployed.
Serve over HTTPS or localhost for Web Crypto. The included Apache mapping
sets the WASM MIME type, and buffered instantiation also tolerates hosts that
serve WASM as ordinary binary data.

## Tests

From the repository root, with the existing Playwright test dependency:

```powershell
node --test tests\rodent-v.test.mjs tests\rodent-v-gui.test.mjs tests\rodent-v-settings.test.mjs
```

The browser suite exercises real searches without cross-origin isolation,
all presets, both widths, legal PVs, Chess960, search restrictions, stopping,
settings restoration and missing resources. The GUI test goes through the
real app, its Advanced Elo controls and a board session.

For comparison against native scalar builds of the same upstream source:

```powershell
$env:RODENT_NATIVE_TEST = '1'
node --test tests\rodent-v-native.test.mjs
```

That test needs the Go SDK and upstream checkout used by the build. It checks
exact scores, PVs and best moves at depth 3 on four positions for the latest
default and each of the seven presets, including successive style changes.
This is correctness coverage, not an Elo or performance benchmark.

## License

Rodent V is by Naman Thanki and Pawel Koziol, based on Sungorus 1.4 by Pablo
Vazquez. See [NOTICE.txt](./NOTICE.txt) and the licenses in `dist`.
Publish this source folder and the upstream source archive alongside the
matching binaries. Attribution alone does not replace corresponding source.
