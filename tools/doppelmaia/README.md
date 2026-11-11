# DoppelMaia

[Read the current research notebook](research.html) for the readable explanation,
game phase results, measured training cost and a quick map of the implementation.
It uses the same page layout as the tool. The technical archive below also keeps
older experiments, including their corrections, so not every number is a current
benchmark.

## Collecting public game files locally

The import area links to [Export Matches](../game-exporter/), where users can
download [the standalone game exporter](export-matches.html).
The [Export Matches tool page](../game-exporter/) provides the site styled entry
point, instructions and request privacy explanation. It never calls chess APIs.
It uses the site's ad and consent setup and omits referrers. The downloaded
collector has no ads or analytics. Collection stays in that file because hiding a referrer
alone does not remove a hosted page's Origin header.
Download the HTML and open it from the device. It contains its own styles and
script and makes no requests when opened. It uses system monospace fonts without embedded
font data or a font server. There is no website header or footer, just the
single tool panel and a short note beneath the plain status message.
The status shows the current operation, collected and skipped counts, and any
error details without a separate log.
Collection is deliberately disabled
when the file is served by a website.

The local file contacts the chosen public Chess.com or Lichess API directly.
It omits login credentials and the referrer, uses no proxy and saves PGN files
that the normal importer accepts. A local file does not send an A.C.A.S website
origin. The provider can still see the IP address, browser information and
requested username. This is not an anonymity guarantee.

Requests are serial. Rate limits cause a visible wait and at most two retries.
Stop remains available during that wait. Interrupted collections offer an
explicitly partial file instead of claiming the requested export is complete.
The default is 1,000 recent games. Optional UTC dates and a limit up to 100,000
keep larger requests deliberate. Collected PGN is bounded at 100 MiB, matching
DoppelMaia's import budget across all files selected together. Choose fewer
games or a shorter date range if the collection is too large. Splitting the
same collection into several files does not bypass the combined import limit.

No uploaded games or account tokens are used by the exporter. Public API access
can still fail because of provider availability, an unavailable account or local
file CORS restrictions. Errors stay visible. Do not recommend disabling browser
security or adding private credentials.

The provider contracts are the
[Chess.com public API](https://www.chess.com/news/view/published-data-api) and
[Lichess game export API](https://lichess.org/api#tag/Games/operation/apiGamesUser).
The live browser check exported two real games from each provider and passed
them through the normal importer. Its request headers contained no cookies,
authorization or referrer. The Lichess exporter rejects crawler classified
clients such as HeadlessChrome, so that opt in test uses an ordinary desktop
Chrome window. It does not replace the user agent or disable browser security.

## Latest experiment outcome

The [creative followup](research.html#creative) completed 21 small screen fits,
18 full data fits and 27 checkpoint averaging checks. The best small game
balancing gain did not hold up with the complete training sets. Validation
selected checkpoint averages for three accounts and kept the earlier models
for three.

On the genuinely later window, strict new agreement was 12,074 of 19,659 before
and 12,071 after. That is 61.42% against 61.40%, with no reliable gain.
Familiar openings improved from 82.85% to 83.47%. Keep the ordinary full browser
trainer as the default. Do not silently add game weighting or averaging and
present it as a new board breakthrough.

The original 61.55% result still refers to its own earlier locked test.
The later comparison uses different games, so compare models within a table
row rather than treating scores from different windows as one learning curve.
Protocols, all four requested phase slices, model hashes and raw predictions
are under `temp\doppelmaia-creative-20261110`. Reproduction commands and the
preserved failed attempts are described in the
[native research notes](experiments/finetune_README.md#creative-development-screen).

One page, two local steps at `tools/doppelmaia/`:

- Import games to learn from. PGN, supported site JSON and reusable data are
  detected from their contents.
- Choose the player when needed, then select the model, rating and learning
  balance. Preparation happens automatically.

The old `tools/chess-training-data/` URL redirects to the preparation section.
Reusable data is an optional shortcut,
not a second kind of chess game that a new user needs to understand.

The existing `tools/leela2onnx/` remains the separate inference-format converter.
There is deliberately no generic Python checkpoint converter. PyTorch pickles,
TensorFlow checkpoints and ONNX files do not describe interchangeable Lc0 nets.
Never execute an uploaded checkpoint to discover its contents.

Maia 3 now has a full transformer training method in the browser. It is the
default for imported games. The fast adapter remains available, and personality
presets use that adapter because their published evidence applies to it.

An important correction to the older research is recorded below. The previous
account selection included BOT accounts. Those results are not human only
evidence. The new collector audits account titles and uses training only ratings.

## What this implementation trains

Original bundled Maia 1500 has a six-block, 64-channel residual tower and a
convolutional policy head. The final policy convolution has 80 output channels,
64 input channels and a 3 by 3 kernel, or 46,080 kernel weights plus 80 biases.

The base selector includes every bundled Maia model: 1100 through 1900 in
100-point steps, plus 2200. All ten pass the supported-weight structure check.
Choose a rating near the player's usual level as a starting point, not a desired
final Elo. These are separate original Maia networks, not Maia 3's continuous Elo
input. Maia 3 has separate full transformer and fast adapter methods below.
Custom compatible `.pb` or `.pb.gz` Lc0 weights are accepted too. Compatibility
depends on the input encoding and policy architecture, not the model's name.

Only that final convolution is updated. The tower, its squeeze-excitation layers,
earlier policy convolution and value head remain unchanged. This is genuine
gradient-based neural fine-tuning, but it is not the complete
[Maia Individual](https://github.com/CSSLab/maia-individual) TensorFlow pipeline
or a claim to reproduce its research results.

The network's original features come from upstream Lc0's Float32 ONNX conversion.
`featureModel` retains just the graph needed to produce the input of
`/policy/conv2`. ONNX Runtime executes it using the selected WASM or WebGPU
provider. It does not silently switch providers after a failure.

`learning.js` evaluates the final convolution for legal moves and differentiates
legal-masked softmax cross entropy against the player's actual move. Local CPU
worker updates use mini-batch SGD, momentum 0.9, global gradient norm clipping at
5 and weak anchoring to the starting policy. Defaults are 16 samples per batch,
learning rate 0.005, at most 10 epochs and patience 3. Shuffling uses seed 42.
WebGPU accelerates feature extraction, not these JavaScript gradient updates.

Caching the frozen features is intentional. Training the whole tower would need
a different differentiable backend and substantially more memory. The default
6,000-position run uses about 96 MB for a 64-channel feature cache, plus runtime,
dataset and graph memory. Limits are 10,000 positions and a 256 MB feature cache.
Keep this page open while it runs.

## Maia 3 adaptation

**Maia 3** is the recommended default for the bundled CSSLab transformer.
Set its base Elo near the source player's level for the closest imitation.
Advanced settings stay collapsed. Full transformer training requires WebGPU.
Choose **Fast adapter** for the method in this section, including CPU training.
A selected provider never silently falls back after failure.

`maia3-model.js` reads the actual bundled ONNX graph, not an assumed Lc0 layout.
It requires the 512-wide `/model/last_ln/LayerNormalization_output_0` feature
and 4,352 move logits. The original FP16 initializers, tensor attributes, Cast
targets and value types are promoted to Float32 for portable WASM and WebGPU.
The only model download is the existing roughly 46 MB base file.
Each report records its SHA-256 fingerprint for reproducible comparisons.

The adaptation is:

```text
h = tanh(frozen_features[512])
personal_logits = frozen_move_logits + h @ learned_weights[512, 4352] + learned_bias[4352]
logits = personal_logits + exact_opening_match @ learned_opening_deltas
```

The full feature adapter has 2,232,576 trainable residual parameters.
All start at zero, making the untrained export an identity adapter.
The transformer and value head never receive gradients. The previous
64 feature projection remains supported with `options.featureSize = 64`
for reproducible historical experiments. The default is now 512, preserving
more of the pretrained position information. This is a context dependent policy
adapter, not full Maia 3 fine-tuning, LoRA, or a reproduction of Maia Individual.

Frozen features and legal base logits are extracted in batches of eight and
cached. Training uses legal-masked cross entropy, mini-batch SGD, momentum 0.9,
weight decay 0.0001, batch size 32, seed 42 and patience eight. The default rate
is 0.005 with at most 40 epochs. CPU and WebGPU implement the same equations.
The WebGPU path uses real WGSL forward, parallel softmax reduction and gradient
update passes, not JavaScript gradients labeled as GPU. On its first batch,
every updated parameter must agree with the CPU reference within 0.000002.
Non-finite features, parameters, export logits and device loss are errors.

Three goals are available:

- **Imitate games** uses the player's observed moves as one-hot targets.
- **Prefer an opening** adds up to 40 legal SAN plies as explicit supervised
  examples, repeated to roughly one fifth of training samples. Checkpoint
  selection combines 75% held-out game CE with 25% known-line replay CE.
  Reports keep both components. The replay is intentionally not called
  held-out data or evidence of generalization.
- **Prefer a board shape** rewards the fraction of specified pawn squares
  occupied after each legal move. Squares are mover-relative, so White's e4
  becomes Black's e5. The frozen policy tilted by `8 * occupancy` supplies
  75% of each soft target, with 25% from the observed human move. Reports
  include held-out expected target occupancy. This is a soft one-ply
  preference, not long-horizon formation planning.

Results show six original-to-trained comparisons: all validation positions,
openings, familiar positions, new positions, middlegames and endings.
The Maia 3 trainers measure phases on the same validation subsets for both
networks. Openings use plies below 24. After that, ten or fewer pieces
(including kings) count as an ending, otherwise a middlegame.
Empty or unsupported comparisons say "Not measured", never a guessed score.

The graphs show the actual training and validation objectives. Move-match
rates still compare against observed moves. For opening mode the validation
curve is the documented composite, not pure held-out game CE. Epoch zero
measures the zero adapter. The best validation checkpoint, including zero,
is restored. Low training loss, RMSE near zero, or a remembered opening
does not establish human-style generalization or playing strength.

Personal opening choices are also learned automatically in imitation mode.
Only training examples before ply 24 contribute counts. A position needs
at least two observations and at most 128 positions are retained.
A prior of four model observations smooths each empirical move distribution.
The log probability correction is clipped to four in either direction and
scaled by `1 - baseAnchor`. Validation chooses a blend of 0, 0.5 or 1.
This keeps a poor repertoire from being enabled just because it fits training.
It is a statistical opening preference, not a forced line or a search book.

The export packs four canonical squares into each of 16 base 13 integers.
All values stay exact in Float32. Standard ONNX operators compare all 16
integers, so the opening table has no hash collisions and never fires for
a merely similar board. The ordinary Maia 3 input only includes mover
relative piece placement, so the opening matcher follows that same encoding.
The whole repertoire is embedded in the model. There is no separate book
file or app runtime lookup to lose.

Reports distinguish familiar validation inputs, genuinely novel inputs and
opening positions. The same opening can occur in two different games.
That is useful for repertoire testing but is not novel position generalization.
Validation labels never contribute to the opening counts.

Exports are complete Float32 ONNX models, about 100 MB plus up to 2.3 MB
for the opening table. They include the base transformer and learned adapter.
`maia3-trainer-worker.js` executes
the exported graph and compares legal logits against its independent adapter
calculation within 0.01 before offering a download. This does not turn Maia 3
into an Lc0 `.pb.gz` network.

**Use in A.C.A.S** stores the complete ONNX in the separate
`acas-maia3-personal-models` IndexedDB database and opens the app with its ID.
The app selects Maia 3, the saved model, provider and training Elo for the
currently selected profile. Missing storage is an explicit error, never a
default-model substitution. **Maia 3 Weights** also accepts ONNX uploads and
lets the user return to the default model or change the custom model provider.
Models are profile-scoped, survive reloads, and are not shared across origins.
The ordinary Maia 3 WASM engine is unchanged when no custom model is selected.

## Input formats

All game content comes from files selected by the user. Nothing queries a player
API or uploads games.

- Multi-game PGN with standard SAN moves, comments, variations and optional FEN.
- [Chess.com monthly archive JSON](https://www.chess.com/news/view/published-data-api):
  a `games` array containing each game's `pgn`, players and optional `rules`.
- [Lichess exported games](https://lichess.org/api#tag/Games/operation/apiGamesUser):
  NDJSON, a JSON game or an array of games with SAN `moves` and
  `players.white/black.user.name` or `.id`. Exports must include moves.
- JSON arrays of the supported game records.

An archive index containing URLs is not a game archive. Missing moves, invalid
full games and unsupported variants are diagnosed individually. Only standard
chess is supported. PGN variations are ignored, never used as player choices.
Canonical starting FEN and the full UCI move sequence form the deduplication key.

The chosen player is matched case-insensitively. Only that player's turns become
labels. Defaults include opening moves and cap each game at 200 positions,
then select up to 6,000 positions across games. When a cap is needed, about
30% of each game's quota covers the opening and the rest spans its later moves.
With a quota of just one position, a deterministic game-specific offset selects
from the whole game instead of always choosing its first turn. Larger quotas
rotate their selected positions by that offset so a partial round of games does
not favor opening moves. The split and sampling remain reproducible.
This avoids filling the whole budget with only the first turns of many games.
Caches from before this sampling fix must be rebuilt from original game files.
Old reusable data contains only the positions already selected and cannot
recover later moves that were left out.
Original Maia uses only examples with eight actual history positions and
explicitly reports skipped early examples. Maia 3 can use early opening moves.
No missing Lc0 history is invented. Maia 3 uses its own existing
64 by 12 token encoding, vertical black-side mirroring and 4,352-move mapping.

The deterministic split holds out entire games. A game cannot be in both sets.
Positions shared by different games can still overlap, particularly in openings.
This is not a guarantee of statistical independence. Repeatedly choosing settings
using this validation set also biases its score. Use separate untouched games
for a final quality assessment.

## Dataset and privacy

`data.js` exports `parseGameFiles`, `buildDataset` and `validateDataset`.
Version 1 datasets are ordinary JSON:

```js
{
    version: 1,
    player: "player",
    options: { validationFraction: 0.2, seed: 42, maxPositions: 6000,
        skipFirstPlies: 0, maxPerGame: 200 },
    train: { gameIds: [], samples: [] },
    validation: { gameIds: [], samples: [] }
}
```

Each sample contains `gameId`, `gameIndex`, `ply`, `color`, `fen`, `history`,
`repetitions`, `move` and `legalMoves`, with optional `result`. History is
current-first, with repetitions computed from the full game before sampling.
Move labels use UCI notation. Import validation replays legal moves and checks
the schema and separation before training.

Successfully prepared games and validated reusable imports are automatically
cached in IndexedDB on this browser. Startup restores the processed positions
without replaying moves or rebuilding the dataset. A subtle status shows what
is saved. Clear saved games removes the cache, not positions already loaded
in the current tab. Storage failures are shown there and logged to the console,
without preventing training on positions already in memory.

The cache is internal, not an import shortcut for untrusted files. External
reusable files still receive full validation. Bump `CACHE_VERSION` in
`storage.js` whenever preparation or validation semantics change and invalidate
old caches. Incompatible caches show an explicit reimport message. Restored data
retains its player, Elo, options and game separation. Changing import options
requires importing the original games again.
The import toast lasts three seconds. A separate loading bar tracks each stage:
files read, game records parsed, games prepared and reusable positions validated.
Stages without a measurable total use an indeterminate bar.
Import time estimates extrapolate elapsed time and completed work for the current
stage only. They reset between reading, parsing, preparation and validation,
and exclude later stages whose work has not been measured yet.
Download reusable data for a portable backup of the prepared positions.
Weights and training reports
persist only when the user downloads them or chooses Use in A.C.A.S. Dataset and model downloads can
contain identifying names or reveal playing style.

## Honest progress and export

The shared isolation service worker retries failed GET navigations once with
cache bypass. If both fetches fail, it serves an explicit uncached 503 error
page with a manual retry link instead of rejecting the navigation promise.
Resource failures return 503 and are logged, not replaced with successful data.
This handles transient fetch failures but cannot repair an unavailable host or
a browser/network policy blocking the request.

Prepared datasets now retain the selected player's per-game ratings. A spread
over 200 Elo shows a warning and offers a target Elo with a default +/-100 range.
Filtering keeps only rated games inside the inclusive range, preserves the
existing train/validation separation and requires positions in both splits.
The range applies automatically when rated data is loaded or either input
changes. Increase the range to include all rated games. Games without ratings
are excluded from rating-filtered runs. The target and range are saved separately
for each imported file's content fingerprint and selected player, including after
a reload or reimport of the same file. A different file uses its own defaults.
For older caches without a file fingerprint, preferences use the dataset's game
IDs instead. Reset settings also removes these saved ranges. Invalid or empty
ranges block training until corrected. The browser cache remains
unchanged, while reusable downloads and training reports reflect the selection.
Older saved data with only an average needs reimporting from rated game files
before rating filtering is available. A wide rating spread is a suggestion to
review the data, not proof the games are unsuitable for training.

Full training can exhaust GPU memory even when baseline inference succeeds,
because backpropagation needs additional buffers. Refresh after an allocation
failure and lower Full model batch to 4 or 1 before retrying. GPU errors retain
the initial failure, prioritizing out-of-memory reports over subsequent invalid
buffer or command-buffer errors. The full technical message stays in the log.

Results suggest trying a lower learning rate when an epoch reduces training
loss but increases validation loss and lowers validation accuracy. This is a
possible overfitting signal, not a diagnosis. The note also appears in the log.
All training methods accept learning rates down to 0.00000001 in the form.
Import and training settings are remembered in this browser, with separate
epochs, learning rate, base anchor and compute settings for each training method.
Personality choices and custom trait values are remembered too. File inputs and
the player list are not restored. Manually chosen Elo takes precedence over
automatic Elo from restored games. Storage failures are shown and logged.
Reset settings clears these preferences and reloads the page without removing
saved games. The reset button is disabled during training and data preparation.

Positions per run can reduce an already prepared, imported or restored dataset
without replaying games. Its maximum follows the training method, 50,000 for the
full model and 10,000 for the adapter or original Maia. Smaller runs select
evenly spaced positions within each existing split, keeping approximately the
same training/validation ratio and at least one position in each. Saved data and
reusable downloads remain unchanged. The run report records the selected subset.

The training finish estimate appears after the first weight update and refreshes
with each batch and completed epoch. It includes measured evaluation time and
assumes the maximum epoch count. Early stopping can finish sooner, and export
verification adds time.

The live board and feature count come from actual completed inference calls.
Gradient counts and processed samples come from completed training batches.
Animations only indicate activity. They do not generate simulated progress.

Epoch zero measures the original model. Every later plotted point evaluates the
current model on both fixed sample sets. Training and validation use the same
metric, independent of mini-batch order. Loss is cross entropy in natural-log
units. Move match rate is legal top-1 accuracy, not playing Elo.

The lowest validation-loss epoch is restored. Export quantizes the changed
layers back to Lc0 LINEAR16, then measures validation loss again. If quantization
erases the improvement, the original weights are retained and the UI explicitly
says so. Original network metadata, license and unrelated weight fields survive
unchanged. Stale upstream training statistics are removed from modified exports.

Before training, the first three examples' local convolution logits must match
the full upstream ONNX model within 0.003. Before a download is enabled, upstream
Lc0 converts the exported protobuf again and ONNX Runtime checks its policy
logits against the exported local head using the same tolerance. This verifies
the file interface and arithmetic, not personalized quality or playing strength.
The downloaded report includes raw epoch metrics and post-quantization results.

Upload `.pb.gz` in A.C.A.S's current Lc0 weights settings. Start at one search
node for imitation. Deeper search can override style preferences.

## Hosting and compatibility

Use HTTPS or localhost. The scoped isolation worker reuses the converter's
runtime mapping, serving `runtime/` imports from `app/assets/engines/lc0/`.
The original runtime files are not duplicated. Deploy the combined tool and the
matching engine distribution together. Keep the existing engine MIME rules for
`.mjs` and `.wasm`. No Python runtime or new package dependency is needed.

Uploaded Lc0 base weights use LINEAR16, classical 112-plane input, a single convolutional
policy head and an unnormalized final policy convolution. Attention networks,
Maia 2, Maia 3, raw ONNX and arbitrary checkpoints are rejected by that original-Maia upload path. Original Maia variants
are the intended starting models.

Wire field numbers and encoding follow the pinned Lc0
[net.proto](https://github.com/LeelaChessZero/lc0/blob/fd71a2d921b689c5f479d3227c3806c8e272d9c5/libs/lczero-common/proto/net.proto).
Input planes and policy ordering follow its
[encoder.cc](https://github.com/LeelaChessZero/lc0/blob/fd71a2d921b689c5f479d3227c3806c8e272d9c5/src/neural/encoder.cc).
Unknown protobuf fields are retained instead of reconstructing the whole net.
See the engine's [notices](../../app/assets/engines/lc0/NOTICE.txt) for licensing.
This code uses the repository's GPLv3 license.

## Tests

From the repository root:

```text
node --test tools/doppelmaia/data.test.mjs tools/doppelmaia/model.test.mjs tests/personalized-maia-browser.test.mjs tests/personalized-maia-encoding.test.mjs tests/personalized-maia-ui.test.mjs
node --test tests/personalized-maia3.test.mjs tests/personalized-maia3-ui.test.mjs tests/engine-worker.test.mjs
```

Tests cover site export fixtures, malformed records, duplicate games, game-level
splits, full-history repetitions, real neural updates, fallback checkpoints,
quantization and untouched weight fields. Browser tests compare planes and legal
policy indices directly with upstream search, run the complete local-file UI
workflow, render real metric curves and download actual Lc0 weights.

The small convergence fixture deliberately reuses a position to prove gradients
and serialization work. Its large loss reduction is not evidence of
generalization to real unseen games.

For native Chrome WebGPU checks in PowerShell, set `PERSONAL_MAIA_PROVIDER` to
`webgpu` and `LC0_TEST_BROWSER` to the Chrome executable before the Maia 3 test.
The test includes finite-difference gradients, color-relative objective checks,
real training, full ONNX serialization and a legal UCI bestmove from the actual
app worker using a stored custom model. Its repeated toy positions prove
mechanics only. Do not describe those scores as held-out human imitation.

The Maia 3 UI test also checks collapsed settings, real objective charts,
one-click installation, a non-default profile, the actual app instance loader,
switching between default and personalized weights, reload persistence,
missing-model errors and 360/768/1280-pixel layouts.

## Reproducible Maia 3 experiments

The browser needs no Python packages. Optional native checks use the pinned
packages in `experiments/requirements.txt`, preferably in a separate virtual
environment. `validate_maia3.py` uses ONNX's independent checker, native ONNX
Runtime and NumPy. It independently promotes the original base to Float32,
checks base-logit parity, calculates the learned residual with NumPy and
verifies that value logits are unchanged.

From the repository root, an example PowerShell benchmark is:

```powershell
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PERSONAL_MAIA_PROVIDER = 'webgpu'
$env:MAIA3_EPOCHS = '10'
$env:MAIA3_MODEL_OUT = 'temp\personalized-maia3.onnx'
node tools\doppelmaia\experiments\benchmark.mjs YOUR-DATASET.json temp\maia3-report.json
```

Use `wasm` for the CPU comparison. `MAIA3_GOAL` accepts `imitate`, `opening`
or `shape`. The latter two use the documented example opening and pawn squares
in the benchmark script, while the actual page accepts the user's own targets.
`MAIA3_RANDOM_TARGETS=1` replaces training labels with seeded random legal
moves as a control, leaving validation labels untouched. The report records
that control explicitly. Avoid simultaneous GPU workloads when timing.

To prepare the matching feature graph for native export validation:

```powershell
node --input-type=module -e "import fs from 'node:fs'; import {prepareMaia3} from './tools/doppelmaia/maia3-model.js'; fs.writeFileSync('temp\\maia3-features.onnx',prepareMaia3(fs.readFileSync('app\\assets\\engines\\Maia3\\model\\maia3_simplified.onnx')));"
python tools\doppelmaia\experiments\validate_maia3.py --features temp\maia3-features.onnx --export temp\personalized-maia3.onnx
```

These are observed development measurements on this Windows machine, not a
speed guarantee or a human-personalization study. The input was the existing
seeded synthetic example, 333 training and 67 held-out positions split by
game, with the same seed, batch size and ten-epoch settings:

| Stage | WASM CPU | WebGPU |
| --- | ---: | ---: |
| Frozen feature extraction | 30.52 s | 3.18 s |
| Adapter training, including initialization and evaluation | 1.65 s | 0.55 s |
| Exported held-out cross entropy | 4.967515 | 4.967515 |

This single comparison measured about 9.6 times faster feature extraction
and 3 times faster adapter training. Loading and final export verification
are outside those stage timings. Small batches can be slower on GPU because
initialization and synchronization dominate.

The same synthetic run started at held-out CE 5.158494. Held-out top-1 move
agreement stayed at 2.99%, so the loss reduction must not be presented as
better human imitation or higher chess strength.

Separate 20-epoch objective checks increased expected pawn-target occupancy
from 28.10% to 38.93%. Opening replay CE fell from 0.6853 to 0.2810 at the
selected checkpoint. The latter is a known-line memory check, not an unseen
opening test. Real WebGPU updates agreed with the CPU reference within
`5.83e-11` in the 400-position run. Native NumPy validation of a learned
WebGPU export measured `1.91e-6` maximum logit error, zero base-conversion
error and zero value-logit change.

## Synthetic style study

A frozen backbone is a practical speed and memory trade-off, not a certificate
of style imitation. Its pretrained features already encode chess positions,
so a relatively small adapter can learn different move preferences without
retraining the transformer. That also limits what it can represent. Full
fine-tuning might capture additional patterns but would need separate quality,
memory and speed experiments.

`experiments/style-study.mjs` tests a deliberately exaggerated **KnightFan**
player. After 12 random opening plies, it always chooses a legal knight move
when possible. Its opponents choose random legal moves. All games are legal
PGNs, with the player alternating colors.

The actual trainer uses **Imitate games**, not the shape or opening objective.
It receives normal UCI move labels and is never told the knight preference.
The evaluation worker runs each complete exported ONNX model, rather than
evaluating only the in-memory adapter.

### Separation and controls

- Each run uses 1,200 training positions, 240 validation positions and 300
  sealed test positions from 20 other games.
- All evaluated positions offer both knight and non-knight moves.
- Games do not cross splits. Identical mover-relative board placements,
  even across colors, are excluded within and across all three sets. This
  matches the piece-placement information Maia 3 actually receives, ignoring
  FEN clocks and castling flags rather than treating those as new positions.
- The test set is never passed to training or used to select checkpoints.
- The controls are untouched Maia 3 and the same training positions with
  seeded random legal-move labels. Validation stays unchanged for the control,
  so it gets the same opportunity to keep a useful checkpoint.
- Three independently generated datasets use seeds 20261110, 20261111 and
  20261112. Settings stay fixed across all three: Elo 1500, rate 0.02, batch
  32, at most 40 epochs, patience eight. These are study settings, not the
  shorter ten-epoch, 0.005-rate tool defaults.

### Observed sealed-test results

| Generator seed | Base knight top-1 | Learned knight top-1 | Random-label control | Learned knight probability |
| --- | ---: | ---: | ---: | ---: |
| 20261110 | 44.0% | 92.7% | 44.0% | 90.7% |
| 20261111 | 46.0% | 93.7% | 46.0% | 93.0% |
| 20261112 | 47.0% | 86.3% | 47.0% | 86.5% |

Knight probability sums the legal softmax probabilities of all knight moves.
Its increase over the base was 50.6, 49.4 and 47.0 percentage points.
Paired game-cluster bootstrap 95% intervals were respectively
`[45.7, 55.7]`, `[44.3, 54.8]` and `[40.9, 53.0]` percentage points, using
2,000 seeded resamples of whole test games. These are descriptive uncertainty
intervals for this artificial game generator, not population-level evidence
about human players.

The random-label controls all selected epoch zero. Learned checkpoints were
epochs 38, 39 and 40. In the first run, test cross entropy fell from 5.3571
to 4.1840 and exact observed-move agreement rose from 6.0% to 15.3%.
Preferring the right piece type is not the same as predicting the exact
knight move chosen by the synthetic player.

This is positive evidence that the frozen-feature adapter can learn one
obvious preference and apply it to unseen positions. It is **not proof** of
copying a real person's full playing style, autonomous full-game behavior,
opening expertise, better tactics or Elo. Those need independent human-game
datasets, stronger behavioral controls and playing tests.

The base model fingerprint for these runs was
`405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856`.

### Reproduce or try the example

```powershell
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PERSONAL_MAIA_PROVIDER = 'webgpu'
$env:MAIA3_EPOCHS = '40'
$env:STYLE_SEED = '20261110'
$env:STYLE_SAVE_MODEL = '1'
node tools\doppelmaia\experiments\style-study.mjs temp\doppelmaia-style-study
node --test tests\doppelmaia-style.test.mjs
```

The output contains train/validation/test PGNs, an importable prepared dataset,
the sealed test samples and a detailed JSON report with per-position results.
`STYLE_SAVE_MODEL=1` additionally saves the verified `knightfan-maia3.onnx`.
Upload it in the app's **Maia 3 Weights** and use Elo 1500. Its intended habit
is knowingly silly, so it is not a recommended chess-strength model.

## Native rating and human study

This historical study used the small adapter and native CUDA to test more
settings. Its collector did not exclude BOT accounts. These numbers have not
been established as human only results, and ratings used all partitions.
The newer audited study and full browser transformer method fix those limits.

### A higher starting rating

Maia 3's Elo input changes its move preferences. It does not certify the
exported engine's playing rating. Training on a person's games can learn
their mistakes along with their habits. Changing the rating after training
can also change the adapter's effect.

This historical adapter experiment used these target balances.
Current full model settings are documented below.

| Choice | Recorded move target | Starting model target |
| --- | ---: | ---: |
| Learn from my moves | 100% | 0% |
| Balance both | 50% | 50% |
| Stay closer to the base | 20% | 80% |

The starting model target is its legal move softmax at the chosen Elo.
This is a fixed teacher distribution, not an engine quality score.
It adds no second neural inference during training.

In mathematical form, the training target is
`(1 - baseAnchor) * oneHot(observedMove) + baseAnchor * baseProbabilities`.
This is equivalent to move imitation with a forward KL penalty toward the
starting policy, up to a constant independent of the learned weights.
It encourages staying near that policy. It cannot guarantee chess strength.

Validation, charts and checkpoint selection still use the real recorded
move, not the blended target. Otherwise a chart could look better simply
because we made the target easier. The report records `baseAnchor` and the
exported model needs no special inference code.

Opening and pawn shape goals keep their existing objectives. The balance
control is hidden for them and nonzero anchoring with those goals is rejected.

### Real player holdouts

This historical 64 feature study measured rating transfer, not matched rating
imitation. The 58.3% to 59.8% result used a 2000 setting for players whose own
source ratings were lower. The newer study below includes openings and uses
the current full feature browser method.

`experiments/native_data.py` reads an existing local Lichess database with
streaming Zstandard decompression. No games are uploaded or fetched by this
script. This run used the first 900,000 games of the October 2026 public
standard rated archive from [Lichess](https://database.lichess.org/).

Five players were selected by game count among the eligible ratings,
without looking at any model result. Their usernames are replaced by labels.
The selected players supplied 864 games, with median source ratings from
1096 to 1708. These are source player ratings, not measured engine ratings.

Each player's games are sorted by date and time. The earliest 60% train the
adapter, the next 20% choose its checkpoint and the final 20% are sealed tests.
The data contains 9,069 training, 2,216 validation and 2,181 test positions.
Canonical mover relative board inputs are unique within and across each
player's three splits. The first 12 plies are skipped.

The following table compares untouched Maia at 2000 with **Balance both**
trained and evaluated at 2000. Loss is cross entropy on later games.
The intervals describe the change from the starting model, using 2,000
paired whole game bootstrap resamples.

| Player | Median source rating | Base loss | Learned loss | Base move match | Learned move match | Loss change interval |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Player01 | 1566 | 1.066 | 0.975 | 62.3% | 65.8% | -0.131 to -0.051 |
| Player02 | 1498 | 0.978 | 0.938 | 67.1% | 67.9% | -0.058 to -0.022 |
| Player03 | 1708 | 0.859 | 0.852 | 72.9% | 72.5% | -0.015 to 0.000 |
| Player04 | 1419 | 1.802 | 1.725 | 47.8% | 50.1% | -0.106 to -0.049 |
| Player05 | 1096 | 2.069 | 2.045 | 41.4% | 42.4% | -0.060 to 0.006 |

Mean loss improved for all five. Some intervals include zero and move match
did not improve for every player. The mean across equally weighted players
went from 58.29% to 59.75% move match. Trait frequency errors did not improve
consistently either. These results support some useful personal prediction,
not a complete copy of a person.

The experiment also reports direct training at 1500 and 2000, anchors
0, 0.5 and 0.8, residual scales 0.25, 0.5 and 1, and random label controls.
All settings were fixed before this comparison. Every control kept epoch zero.
The test set does not choose epochs, tune settings or change the default.
Intervals are descriptive and are not corrected for all these comparisons.

### Quality and whole games

Stockfish 19 scores all legal moves on 80 fixed test positions per player
and on 80 KnightFan positions. Eight independent engine processes use one
thread each. The final check uses 500,000 nodes per position and reached a
minimum completed depth of nine. An earlier 50,000 node pass is retained
separately. A fresh process and hash are used per position.

Expected centipawn loss weights each legal move's loss by the model's policy
probability. Loss is capped at 1000 centipawns so mating scores do not dominate.
The report also includes the greedy move's loss and probability assigned to
moves losing at least 100 centipawns. These are bounded search estimates,
not a tournament or an Elo measurement.

| KnightFan at 2000 | Knight probability | Expected centipawn loss |
| --- | ---: | ---: |
| Untouched base | 40.9% | 88.7 |
| Learn from my moves | 89.6% | 180.2 |
| Balance both | 69.3% | 123.9 |
| Stay closer to the base | 54.4% | 98.8 |

This shows the tradeoff plainly. Copying a knowingly bad habit can make the
policy worse. Keeping more base habits reduces that effect while retaining
some preference.

The five archive profiles' equally weighted expected losses were 76.52
centipawns for the 2000 base, 77.73 for direct imitation, 76.95 for Balance both
and 76.68 for Stay closer to the base. Those small differences do not prove
equal strength. The per player game intervals are in the full report.

`experiments/native_rollouts.py` also tests autonomous behavior with the
complete exported models. Each variant plays 16 shared sampled openings from
both colors against unchanged Maia at a setting of 2000. Both sides choose
their highest probability legal move. Each game gets at most 100 additional
plies. Draw claims are honored and unfinished games are not called draws.

| Model | Knight choice when alternatives exist | Wins | Draws | Losses | Unfinished |
| --- | ---: | ---: | ---: | ---: | ---: |
| Untouched base | 29.1% | 8 | 10 | 8 | 6 |
| Learn from my moves | 89.6% | 0 | 0 | 31 | 1 |
| Balance both | 57.6% | 0 | 5 | 21 | 6 |
| Stay closer to the base | 36.1% | 6 | 10 | 6 | 10 |

The strong preference survives whole games, but it loses badly. The gentler
version is less extreme. These 32 games per variant against one deterministic
policy are much too small and narrow for an Elo claim. The opponent's 2000
setting is not a measured rating either.

### Native execution and parity

The verified environment uses Python 3.13, PyTorch 2.11 with CUDA 12.8,
ONNX Runtime GPU 1.24.4 and an RTX 4070 Ti SUPER. A warmed feature comparison
on 256 positions took 1.717 seconds on eight CPU threads and 0.071 seconds
on CUDA, about 24 times faster. This excludes loading and downloading.
Different hardware and batch sizes will give different results.

CUDA inference batches contain up to 128 positions. Cached features let
PyTorch train many comparisons without rerunning the transformer.
Cache identity includes the prepared model and exact dataset.
Training remains Float32 with TF32 disabled for the parity checks.
The initial inference trace recorded 1,266 CUDA and 67 CPU kernel executions.
Shape operations on CPU are expected. Missing CUDA initialization is an error,
not a silent fallback.

The native CPU and CUDA SGD checks matched the JavaScript reference within
`9.32e-10`. CPU and CUDA full model outputs differed by at most `0.000228`.
All three full KnightFan ONNX exports were checked at ratings 1000, 1500,
2000 and 2400 against the learned residual formula. Maximum logit error was
`0.000140`. Browser WASM and WebGPU tests separately cover anchored targets,
real updates, honest validation and app loading.

Use the isolated environment rather than changing the app's dependencies.
The pinned native requirements deliberately pair CUDA 12 PyTorch with
CUDA 12 ONNX Runtime. Newer ONNX Runtime wheels can require a different CUDA
major version. Stockfish jobs use Python threads to supervise external
processes, avoiding eight extra copies of CUDA libraries on Windows.

```powershell
py -3.13 -m venv temp\maia-native-env
temp\maia-native-env\Scripts\python.exe -m pip install -r tools\doppelmaia\experiments\native-requirements.txt
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\native_data.py temp\lichess-databases\lichess_db_standard_rated_2026-10.pgn.zst temp\doppelmaia-native-study\human-dataset.json
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\native_study.py --human temp\doppelmaia-native-study\human-dataset.json --output temp\doppelmaia-native-study --stockfish C:\path\to\stockfish.exe --workers 8
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\native_rollouts.py temp\doppelmaia-native-study
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\native_review.py temp\doppelmaia-native-study
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\test_native.py --study temp\doppelmaia-native-study
```

`native_bridge.mjs` uses the real browser graph preparation, exporter and
JavaScript SGD implementation. It does not replace them with a native
approximation. Install a native Stockfish from its
[official releases](https://github.com/official-stockfish/Stockfish/releases)
and pass its executable path. The source database and engine executable
are external inputs, not committed dependencies.

### Review the data

The generated `temp\doppelmaia-native-study\review.html` works offline and
contains tables, learning curves, a rating transfer graph and file links.
`summary.csv` is the small spreadsheet. `native-report.json` keeps settings,
hashes, histories, intervals and all variant metrics. `test-predictions.csv`
contains every sealed test prediction with its move and FEN.
`human-dataset.json` is the research dataset, not an app import file.
It includes source game links, timestamps and split membership for review.
`rollout-report.json`, `rollout-moves.csv` and the PGNs show whole game behavior.

The three `knightfan-2000-anchor*.onnx` models load directly as Maia 3 weights.
Start at Elo 2000. They are demonstration personalities, not strength upgrades.

More players, longer time periods, training seeds and stronger tournament
tests are still needed. This study does not test the current user's own
games and cannot certify a person's complete style.

## Matched rating imitation and openings

This is another historical cohort collected without BOT exclusion.
Its numbers are not established as human only evidence. Its ratings used all
partitions rather than training games alone.

The newer study uses 2,249 games from ten public players found in the first
2,000,000 games of the same local archive. Median source ratings range from
1103 to 1758. Players were selected by activity and rating before training.
Each model uses its player's median rounded to the nearest 100 as its matched
conditioning. That is still a model setting, not measured engine Elo.

Exact duplicate games are removed. Chronological game splits use the earliest
60% for training, the next 20% for validation and the final 20% for testing.
There are 31,062 training, 8,332 validation and 8,191 test positions.
Positions from separate games may repeat. Familiar and genuinely novel
mover relative board inputs are therefore reported separately.

The test compares 64 projected features against all 512 frozen tanh features,
with SGD and Adam. Validation selects the checkpoint, method and personal
opening blend. All ten selected full 512 feature SGD at a rate of 0.005.
The maximum is 40 epochs with patience 8, momentum 0.9 and decay 0.0001.
The study used the fast adapter with Max personalization. Imported games now
default to the full transformer instead.
Balanced is a gentler option, so these scores should not be advertised as
its expected improvement.

The browser now supports the same full features, SGD and portable opening
residual. Sampling includes early moves and spreads capped examples across
later play too. Original Maia still requires eight real history positions.
The opening residual is learned only from repeated training positions and is
embedded in the ONNX itself. It is not a forced runtime opening book.

### Results on later games

These are means across equally weighted players, not pooled positions.
Move agreement compares the highest probability legal move with the recorded
choice. Human choices are variable, so even a good imitation will not match
every move.

| Held out positions | Base move agreement | Personalized move agreement |
| --- | ---: | ---: |
| All | 54.7% | 56.8% |
| Opening before ply 24 | 52.9% | 59.2% |
| Familiar board inputs | 54.8% | 70.0% |
| Novel board inputs | 54.4% | 54.8% |

Mean cross entropy fell from 1.502 to 1.384. It improved for nine of ten
players, not everyone. Most of the accuracy gain is on familiar positions.
The small novel input accuracy gain is important to keep visible rather than
calling this a complete copy of a human.

Each person's own model had lower test loss than the average of the other
nine models on the same positions and rating. All ten paired whole game
bootstrap intervals excluded zero. That supports player specific learning,
but does not prove every recognizable habit or control every population
difference. Random legal label controls all retained epoch zero.
Two fixed method training repeats produced mean move agreement of 56.67%
and 56.67%, close to the main 56.80% run.

Complete held out opening paths were checked separately from capped samples.
The first four own moves all matched in 7.8% of games with the base and 25.6%
with personalization. The first six matched in 2.0% and 6.6%. These tests
replay the recorded opponent replies. They are teacher forced predictions,
not autonomous games following the same opening.

At settings 400 below matched conditioning, agreement changed from 53.8%
to 55.2%. At settings 400 above it changed from 52.9% to 55.7%.
Personal habits can survive changing the setting. This does not show that
the personalized engine became 400 Elo stronger or weaker.

### Reproducing and reviewing the study

Use the isolated native environment and pinned requirements above. The
archive is streamed, not loaded into RAM as a 31 GB string.

```powershell
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\native_data.py temp\lichess-databases\lichess_db_standard_rated_2026-10.pgn.zst temp\doppelmaia-imitation-study-v2\human-dataset.json --games 2000000 --players 10 --include-openings --train-positions 6000 --holdout-positions 1200
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\imitation_study.py temp\doppelmaia-imitation-study-v2\human-dataset.json temp\doppelmaia-imitation-study-v2
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\imitation_followup.py temp\doppelmaia-imitation-study-v2 --dataset temp\doppelmaia-imitation-study-v2\human-dataset.json
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\imitation_review.py temp\doppelmaia-imitation-study-v2
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\test_imitation.py --study temp\doppelmaia-imitation-study-v2
```

`review.html` contains measured learning curves, variant tables, familiar and
novel scores, ownership controls, repeat seeds and opening paths.
`imitation-summary.csv` is the small spreadsheet. `imitation-predictions.csv` and
`opening-predictions.csv` keep individual test predictions.
The JSON reports retain protocol details, hashes and bootstrap intervals.
`human-dataset.json` includes source links, dates and split ownership.
It is a research file, not the browser dataset format.

The ten `PlayerNN-personal.onnx` files load directly as Maia 3 weights.
Player04 is an example at a setting of 1800, not the current user's model.
Each exported graph was checked against the learned native formula at its
matched setting and at offsets of 400, including matching and novel boards.
Maximum logit error across the ten exports was 0.00000573.
The independent output tests reproduce CSV scores, game separation, opening
path counts, export hashes and JavaScript repertoire arithmetic.
Browser WASM and WebGPU tests check the full feature update and exact
opening graph too.

## Personality presets

The first step can use imported games or anonymous practice positions.
The personality path currently supports Maia 3. It does not silently apply
Maia 3 targets to original Maia or custom Lc0 architectures.

`personality.js` preserves 50 exploration candidates and exposes 18 curated
presets, with 20 numeric preferences.
The dropdown fills the same controls that manual tuning changes.
Each preference ranges from -4 to 4, with overall strength from 0 to 3.
These are soft policy preferences, not engine search options.

The move features cover piece type, captures, checks, castling, forward moves,
retreats, central and edge squares, minor piece development, fianchetto squares,
pawn shelter, distance to the opposing king, pawn advances, quiet moves and
captured material. Features are mover relative. Shelter is adjacent friendly
pawns divided by three. Contact is one minus Chebyshev king distance divided
by seven. Valuable captures use the captured piece value divided by nine.
These definitions are intentionally simple and inspectable. They do not model
a multi move attack, a guaranteed fortress or tactical soundness.

```text
move_score = strength * sum(weight[j] * move_feature[j])
teacher = softmax(legal_base_logits + move_score)
```

The same legal base logits supply the teacher and the zero residual baseline.
No observed human move is mixed into personality targets. The target move
display and agreement chart use the teacher's highest probability move.
They must not be presented as matching an imported player's choices.
The graph's loss is soft target cross entropy. The report also includes
teacher KL and expected requested score before and after learning.
Manual edits define a new configuration, not a CUDA certified preset.

Preset evidence uses the Fast adapter method. Its base transformer remains
frozen. The ordinary full 512 feature adapter
learns these targets using exactly the same SGD as game imitation.
Validation selects by the soft objective. Opening memory is disabled for this
mode. Every export goes through the normal complete ONNX logit verification.
Changing Elo after training changes the base and neural features, not the
stored personality parameters.
Full transformer training can learn these targets too, but switching methods
does not carry over the preset's adapter evidence badge.

Practice positions come from the public Lichess CC0 archive. The generator
removes player names, separates source games and excludes every repeated
canonical input across training, validation and research testing.
The browser asset contains 2,078 training and 514 validation positions.
The original native test had 1,097 positions from 97 other games.
Those boards now also help curate the catalog, so they are not a fresh
independent catalog test.
The published bytes pass full legal history validation in tests. Loading checks
their SHA-256 against the tested evidence instead of replaying every historical
move on each page visit. Imported user datasets still undergo full validation.
The practice file is about a few MB and downloads locally from the app host.

### CUDA equivalence

CUDA uses the actual JavaScript prepared model and exporter.
`personality_prepare.mjs` calculates move features with the browser's own
chess code. Python consumes those exact features, not a second approximate
chess implementation. Configuration, targets, feature width, rate, mini batch
size, shuffle, momentum, decay, patience and validation selection match the
browser. CUDA and WebGPU are Float32 implementations, not bit identical
hardware. Small floating point differences are expected.
Matching results requires the same inputs and settings. The real player
research uses chronological training, validation and sealed test groups.
The ordinary import flow uses its documented seeded game split instead.
Research scores are not predictions for an arbitrary user's upload.

`test_imitation.py` compares full 512 feature updates and an eight epoch plan
with a partial last batch against native CUDA, including the selected
validation checkpoint. `personality_parity.mjs` goes further by training the
complete Knight fan preset in real browser WebGPU and comparing its final
logits on unseen boards with the CUDA model. This checks an actual complete
run rather than calling a single gradient step end to end parity.
Both selected epoch 40. The maximum final logit difference on 32 unseen
boards was `4.77e-6`, with a validation cross entropy difference of `2.15e-9`.
This establishes the tested frozen adapter path, not browser transformer
fine-tuning or identical move choices for every possible floating point tie.

The earlier four variant research compared Adam and 64 feature models too.
Those are historical comparisons, not hidden options used to inflate the
browser's default result.

### Reproducing preference checks

Use the isolated native environment and requirements documented above.
Create a local PGN containing at least 200 complete standard games from the
CC0 source, then run these commands from the repository root.

```powershell
node tools\doppelmaia\experiments\personality_prepare.mjs YOUR-PRACTICE.pgn tools\doppelmaia\personality-positions.json temp\doppelmaia-personality-study\practice.json
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\personality_study.py temp\doppelmaia-personality-study\practice.json temp\doppelmaia-personality-study
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\personality_rollouts.py temp\doppelmaia-personality-study
node tools\doppelmaia\experiments\personality_rollout_scores.mjs temp\doppelmaia-personality-study
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\personality_review.py temp\doppelmaia-personality-study --evidence temp\doppelmaia-personality-study\historical-evidence.json
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools\doppelmaia\experiments\personality_parity.mjs temp\doppelmaia-personality-study
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\test_readiness.py --personalities temp\doppelmaia-personality-study PersonalityEvidenceTests
node --test tests\doppelmaia-personality.test.mjs tests\personalized-maia-personality-ui.test.mjs
```

A passing preset must reduce held out teacher KL, increase its requested
score with paired whole game intervals excluding zero, keep that direction
at conditioning offsets of 200 and increase expected preference on boards
reached during autonomous games. Every preset plays eight games and eight
paired base controls across four openings and both colors. Games stop after
80 new plies or a legal ending. Unfinished games are kept separate.

`personality-evidence.json` records the tested configuration. The evidence
label also checks the epoch budget and learning rate. Changing the
catalog or practice data requires rerunning its evidence. A favorable teacher
score does not establish a percentage of human personality copied, a measured
playing rating or safe tactics. Extreme profiles can be deliberately weak.

The completed 50 preset run reduced mean held out teacher KL from 0.668
to 0.214. Each preset passed the stated directional checks. Individual
teacher gap reductions ranged from 19% to 88%, not near 100%.
Across 400 autonomous personal games there were 35 wins, 67 draws,
149 losses and 149 unfinished games against the corresponding base.
Another 400 games used paired base controls. This makes the strength
tradeoff visible rather than describing every unusual style as strong.

## Curated personalities

Fifty was an exploration count, not a catalog quota. Twenty six candidates
passed the initial behavior requirements, twenty three survived pairwise
separation and eighteen also passed the fresh game check. Those eighteen
are the public dropdown. The other configurations remain available to research
through `personalityCandidates`, not as verified public presets.

The collection includes the pawn march, queen show, pacifist, centralist,
edgewalker, knight raider, quiet bishop, flank storm, center storm, distant orbit,
heavy metal, pawns on holiday, gentle knight, corner knight, central knight,
pawn magnet, friendly chaos and alien chess.

Selection compares every learned adapter on the same 1097 boards at Elo 1500.
Changing a preset's starting rating cannot create its measured distinctness.
Complete autonomous PGNs are reconstructed and every chosen move is checked
against its recorded board. Move features still come from the shared JavaScript
implementation, not a separate Python approximation.
JS below means Jensen Shannon divergence between the legal move distributions.

| Requirement | Fixed threshold |
| --- | --- |
| Departure from the common base | Mean policy JS at least 0.025 and changed top moves at least 20% |
| Every retained pair | Mean JS at least 0.02 and changed top moves at least 15% |
| Pair uncertainty | Whole game lower 95% bound on disagreement at least 10% |
| Actual chosen preferences | Positive paired opening lower 95% bound |
| Opening consistency | Intended direction in at least 75% of opening groups |

Candidates are considered by fewer active traits, then larger baseline
departure. There is no requested count to fill. Discovery uses existing test
boards and is explicitly exploratory. Intervals are nominal, not a simultaneous
confidence guarantee across every candidate.

The twenty three discovered profiles then played 552 fresh games across six
different openings and both colors, including paired base controls.
Weights and thresholds were not changed after those games. Eighteen confirmed
their direction. Five did not, including the pawn bunker. They were not kept
just to offer a particular name or a high starting rating.
These checks do not establish human recognition, complete personalities,
tactical soundness or playing strength.

```powershell
$python = 'temp\maia-native-env\Scripts\python.exe'
$study = 'temp\doppelmaia-personality-study'
$catalog = 'temp\doppelmaia-personality-curation'
$fresh = 'temp\doppelmaia-personality-confirmation'
& $python tools\doppelmaia\experiments\personality_curation.py $study $catalog
& $python tools\doppelmaia\experiments\personality_rollouts.py $study --selection "$catalog\curation-report.json" --output $fresh --fresh-openings
& $python tools\doppelmaia\experiments\personality_curation.py $study $catalog --confirm $fresh
& $python tools\doppelmaia\experiments\personality_review.py $study --evidence tools\doppelmaia\personality-evidence.json --curation "$catalog\curation-report.json"
& $python tools\doppelmaia\experiments\research_review.py personalities $catalog --fresh $fresh
```

Confirmation preserves `discovery-report.json`. Fresh games record the exact
discovery hash, adapter identities and feature model hash.
Use that untouched discovery file when repeating the confirmation.
The offline review retains every rejected candidate and links complete games.

Published evidence now uses version two. It includes the full candidate
history, the confirmed subset and all 153 pairwise checks for the public set.
Both the practice loader and UI badge use the same schema validator.
Update the curated ID set only from the confirmed results, then run
`tests\doppelmaia-personality.test.mjs` and
`tests\personalized-maia-personality-ui.test.mjs`.
Changing the training method or controls removes the exact preset claim.

## Expanded human imitation checks

**Historical source correction**. The completed twenty account run included
nine BOT accounts and eleven accounts without that title. Its reported averages
are mixed account measurements, not human only imitation scores. The previous
rating estimate also used all partitions. New studies exclude BOT titles and
derive conditioning from training games alone. Existing numbers are retained
for an honest record rather than relabeled as fresh human evidence.

`readiness_study.py` uses a fixed full 512 feature browser method, not per
player architecture selection. It compares 1,000 positions, 3,000 positions
and the full browser budget, then all three imitation balances.
Random legal labels use the unchanged real validation choices.
The same learned models are evaluated at source conditioning and offsets
of 200 without retraining. Complete games choose partitions chronologically.
Familiar board inputs and novel inputs remain separate.

The optional Stockfish check scores every legal move on 24 unique test boards
from each of the first five players, spread across the sample phases.
Each gets 250,000 nodes with one engine thread. This is a bounded move quality
check, not a rating tournament or proof that raising a setting preserves
every human habit while strengthening play.

```powershell
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\native_data.py temp\lichess-databases\lichess_db_standard_rated_2026-10.pgn.zst temp\doppelmaia-readiness-study\human-dataset.json --games 6000000 --players 20 --include-openings --train-positions 6000 --holdout-positions 1200
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\readiness_study.py temp\doppelmaia-readiness-study\human-dataset.json temp\doppelmaia-readiness-study --stockfish C:\path\to\stockfish.exe
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\readiness_review.py temp\doppelmaia-readiness-study
temp\maia-native-env\Scripts\python.exe tools\doppelmaia\experiments\test_readiness.py --humans temp\doppelmaia-readiness-study ReadinessEvidenceTests
```

`readiness-report.json` keeps each fixed setting and its raw learning history.
`readiness-predictions.csv` contains the main model's individual test results.
`readiness-summary.csv` and `review.html` make them easier to review.
This expanded source window overlaps earlier experiments. It is not an
independent replication on a new population.

Original Maia and the supported non Maia comparison use a different policy
convolution path. Their native parity and compatibility study is documented
in [original_README.md](experiments/original_README.md). Maia 3 results must
not be copied over as claims about those networks.

## Full transformer fine-tuning

The default games method trains all eight actual Maia 3 transformer blocks,
the input and Elo embeddings, shared GAB tensor and policy projections.
That is 22,409,728 trainable parameters across 154 tensors. It is not a frozen
feature adapter. The value head and its final pooled normalization stay frozen,
but their outputs can still change because the shared transformer changes.

`maia3-transformer.js` implements forward propagation, automatic differentiation,
global gradient clipping and AdamW on TensorFlow.js WebGPU. The runtime is bundled
locally. `transformer-training.js` handles targets, shuffled batches, real learning
curves, checkpoints and complete standard ONNX exports. `maia3-trainer-worker.js`
routes `options.method = 'full'` to this path.

Full runs from the page now enable `options.useHistory`. Their input has
96 channels rather than 12. It contains eight real, causal board frames from
oldest to newest, with each frame mirrored for its own side to move.
Short games repeat the earliest available board at the beginning.
The current board is the final 12 channels.

The JavaScript trainer, exported ONNX and app share this encoding. The exporter
removes the old wrapper's repeated board `Tile` and records
`acas.maia3.history = 8:oldest-first:per-frame-turn:earliest-padding`.
The app gets history by replaying the UCI position command. A standalone FEN
uses earliest observed board padding, not a reconstruction of unknown moves.
Existing 12 channel networks keep their original behavior. The lower level
training API leaves `useHistory` off unless requested so earlier numerical
fixtures can still be reproduced.

Training caches these binary tokens as bytes and converts each batch to
Float32. At the 50,000 position limit, the history token cache is about 307 MB
rather than 1.23 GB of Float32 tokens. Runtime, dataset, targets and optimizer
memory are additional.

Defaults are twelve maximum epochs, rate 0.00001, batch 16, patience two, weight decay 0.01,
gradient norm limit one and base anchor 0.25. Advanced settings expose batch sizes
from one to 32. The import budget can reach 50,000 total positions for this method.
The fast adapter and original Maia paths still have their 10,000 position limit.
The default import budget remains 6000.

Imitation checkpoints use validation boards absent from training, including
epoch zero. If no such boards exist, training stops with a clear error.
Opening, shape and personality objectives use the same target helpers as the
adapter. Full models do not add the adapter's exact opening lookup.
The output is a roughly 91 MB Maia 3 ONNX file that works in the app, not an
Lc0 protobuf file. Baseline and exported predictions are checked with ONNX Runtime.

```powershell
npm --prefix tools\doppelmaia ci
npm --prefix tools\doppelmaia run build:training
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:DOPPELMAIA_FULL_TEST = '1'
node --test --test-concurrency=1 tests\doppelmaia-transformer.test.mjs tests\personalized-maia3-ui.test.mjs
```

TensorFlow.js core and WebGPU are pinned at 4.22.0. The build uses esbuild 0.28.2.
Keep the generated runtime, legal notices and Apache license together.
The local bundle uses `.js` because some Apache setups do not serve `.mjs`
with a JavaScript content type.

Do not remove the packed matrix multiplication setting without repeating the
numerical tests. Automatic SplitK produced wrong transposed GAB products in
this TensorFlow.js version. The working implementation explicitly selects
`WEBGPU_MATMUL_PROGRAM_TYPE = 3` and disables CPU forwarding.

### Causal history CUDA verification

The 96 channel path was checked against native CUDA before measuring new
imitation results. On twelve real positions, initial policy logits differed
by at most 0.00013733 and value logits by 0.00000859. The maximum difference
across all 154 trainable parameter gradients was 0.00002575.
After four real updates, both implementations chose the same top moves.
Their maximum legal move probability difference was 0.00000741.

A larger run used 10,241 training positions and 512 validation positions,
including 439 boards absent from training. Both implementations selected
epoch one and stopped after epoch three. Selected validation CE differed by
0.00098155. Agreement was identical at that checkpoint on both all validation
moves and the novel board subset. The browser made 1923 real updates and
verified its complete export. Training and evaluation took about 211 seconds
in the browser and 54 seconds on CUDA.

These are numerical implementation checks, not measures of human imitation.
The runs are not bit identical. Later epoch predictions can differ, and the
earlier stress test below remains part of the evidence.
See `temp\doppelmaia-unseen-v4\parity` and
`temp\doppelmaia-unseen-v4\workflow` for the raw comparisons.
The source and commands are in
[the native training notes](experiments/finetune_README.md#contextual-unseen-move-study).

### Earlier repeated board CUDA verification

The complete six epoch browser run and CUDA reference selected epoch four.
Their selected validation CE differed by 0.000006 and held out move agreement
was equal. This fixture checks the implementation, not human imitation quality.

At identical learned weights, policy logits differed by at most 0.000243,
value logits by 0.0000146 and gradients across all 154 trainable tensors by
0.000123. A separate 96 update stress run at rate 0.00003 showed larger
independent trajectory differences. Its final mean policy KL was 0.01298,
top move agreement between implementations was 98.46%, and the maximum
individual legal probability difference was 0.624. Raw logit RMSE was 0.585.
These are not bit identical training runs.

Small FP32 arithmetic differences can grow during optimization. The saved
stress results are not hidden by the closer selected checkpoint comparison.
`transformer_numerics.py` replays the same plan with an algebraically equivalent
CUDA normalization implementation to investigate that sensitivity.

A larger audited account fixture also passed. It trained 10,241 positions for
three epochs and validated on 512 positions, including 432 novel inputs.
Both implementations selected epoch two. Selected CE differed by 0.0001465
and exported validation move agreement by one move out of 512, or 0.195
percentage points. Browser training and evaluation took about 327 seconds,
compared with 76 seconds for CUDA graphs. All eight newly selected study
models also ran in the actual app worker with policy error below 0.000320.

Full training requires WebGPU. The page remembers compute choices separately
for Full, Fast adapter and original Maia, so leaving Full does not force the
other trainers to use a GPU. Original Maia still starts with WASM CPU.

### Fresh unseen move result

The new comparison scanned 72 million local Lichess games and retained six
accounts without BOT titles. The two exclusions had too few later games.
The source audit replays all 206,262 prepared examples from 7097 original games,
including account ownership, ratings, timestamps, legal moves and causal history.

The 159,546 training moves precede separate validation and test windows.
All methods below use the same 21,687 strict test boards, excluding that
account's training, validation and every earlier development split.
This does not certify novelty against other accounts or Maia's pretraining.
Previous models are evaluated again on these boards, not copied from an older
headline with a different cohort or test set.

| Method | Unseen move agreement | Cross entropy |
| --- | ---: | ---: |
| Original Maia 3 | 53.55% | 1.44700 |
| Starting model with real history | 55.98% | 1.35868 |
| Previous personalized models | 59.01% | 1.24984 |
| Larger data with the old repeated board input | 59.09% | 1.22563 |
| Contextual full training | **61.55%** | **1.15170** |
| Contextual model with Elo input raised by 200 | 61.22% | 1.17033 |
| Another account's contextual model | 53.23% | 1.49601 |

The gain over the previous personalized models is **2.54 percentage points**.
Its paired source game 95% interval runs from 2.05 to 3.00 across 1071 test games.
Against the same larger data with the old input, history adds 2.46 points,
with an interval from 1.99 to 2.88. More data alone barely changed agreement.
The total gain over the original starting model is 8.00 points.

All six accounts improve over their previous models, by 1.80 to 3.55 points.
This is a reproducible but modest improvement, not the large leap sought.
It does not reach 80% or establish near perfect imitation.
These single seed intervals concern games in the selected cohort, not all
players or uncertainty from retraining with different seeds.

The method was chosen after 18 development adaptation runs, two exploratory
79M runs and 24 matched data training runs. Fresh test scores never chose the
checkpoint or base anchor. Each input family compares anchors 0 and 0.25.
Settings are batch 32, rate 0.00001, twelve maximum epochs and patience three.
The page exposes these settings, but keeps its smaller default import budget.
Increase Position limit when using a larger game library.

All 21,687 strict test boards also ran through the actual app WebGPU worker.
It made exactly the same top move predictions as native CUDA with these
exported weights. That is inference equivalence, not a claim that independent
training runs are bit identical. The separate 10,241 position browser training
comparison above checks the optimizer and checkpoint workflow.

The full review, raw predictions, six deployable ONNX models and source snapshots
are in `temp\doppelmaia-unseen-v4\evaluation-v2\index.html`.
See [the reproduction notes](experiments/finetune_README.md#contextual-unseen-move-study).

### Earlier audited imitation result

The earlier audited cohort excluded every target account with a BOT title. Eight accounts
remain from the 36 million game source window, with 117,717 training positions.
This does not independently verify their human identities. Training only
ratings, chronological games and exact source hashes are audited.

| Strictly unseen test boards | Move agreement | Cross entropy |
| --- | --- | --- |
| Starting Maia 3 | 54.27% | 1.41406 |
| Correct tanh adapter ablation | 55.90% | 1.34461 |
| Validation selected full transformer | 59.16% | 1.22911 |
| Selected model at Elo input plus 200 | 58.87% | 1.24676 |
| Another account's selected model | 51.85% | 1.55442 |

These are pooled rates on the same 14,022 inputs absent from both training
and validation. The selected model's gain is 4.89 percentage points, with
a whole source game 95% interval from 4.25 to 5.53. The interval describes
this activity selected cohort, not all players.

All test moves improved from 54.56% to 63.13%. Familiar inputs reached 82.63%,
but that is not unseen board generalization. The 80% unseen target was not
reached. Do not select a different row after seeing its test score or present
recorded move agreement as a percentage of personality copied.
The first account's random label control kept epoch zero.

Exact commands, source attribution and the audited larger player study are in
[the transformer guide](experiments/finetune_README.md).

### Historical six account study

The earlier native run used 4620 games and 31,754 training positions.
Five of its six accounts had BOT titles. The first three were Maia bot accounts.
It is a mixed account experiment, not evidence of human only generalization.
Its frozen comparator also used raw pooled features rather than the browser's
`tanh` features. Current code fixes that comparison under a new protocol version.
The old saved results are left unchanged and labeled here.

Strict novel test boards exclude both training and validation board inputs.
On 5658 such positions, pooled recorded move agreement was as follows.

| Method | Move agreement | Cross entropy |
| --- | ---: | ---: |
| Starting Maia 3 | 57.67% | 1.40785 |
| Raw pooled feature adapter, not the browser adapter | 58.13% | 1.37064 |
| Last transformer block and policy | 62.96% | 1.11930 |
| All eight transformer blocks and policy | 65.82% | 1.02437 |

Full tuning improved agreement by 8.15 percentage points over the base.
The paired whole game 95% interval was 6.91 to 9.39 points. This interval
describes games from these six accounts, not the whole player population.
Per player gains ranged from 1.63 to 22.38 points. They do not establish
near perfect imitation, and another player's model occasionally did better.

The six complete ONNX exports were verified in the actual app WebGPU worker.
Their maximum measured browser logit error was 0.000242. They are ordinary
personal Maia 3 models and can be uploaded to the app. Updating the shared
transformer also changes value outputs, even though its value head is frozen.
Do not treat their WDL estimates as calibrated or claim a playing strength gain.

Architecture mapping, attribution, exact commands, controls and reproducible
exports are in [finetune_README.md](experiments/finetune_README.md). The local
study writes an offline report and model downloads to
`temp\doppelmaia-finetune-study\index.html`.
