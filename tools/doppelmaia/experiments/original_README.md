# Original Maia: measured native CUDA / browser parity

These standalone experiments exercise the **existing** original-convolutional-Lc0 browser
trainer. They do not change the UI, engine integration, training defaults, or Maia3.
Supported starting networks are the ten bundled original Maia1100–1900/2200 models
and compatible non-Maia **TinyGyal-8**. Other architectures are not implied supported.

## Reproduce the experiment

Activate a native Python environment with torch CUDA 12.8, ONNX Runtime GPU,
onnx, python-chess and zstandard. You also need Node with Playwright, the
running Apache app and the local Lichess archive used below.

```powershell
$py = (Get-Command python -ErrorAction Stop).Source
$out = 'temp\doppelmaia-original-comparison'
& $py tools\doppelmaia\experiments\original_data.py temp\lichess-databases\lichess_db_standard_rated_2026-10.pgn.zst "$out\dataset.json"
node tools\doppelmaia\experiments\original_bridge.mjs encode "$out\dataset.json" $out
& $py tools\doppelmaia\experiments\original_study.py
& $py tools\doppelmaia\experiments\original_review.py $out
& $py tools\doppelmaia\experiments\original_test.py -v
node --test tools\doppelmaia\experiments\original_browser.test.mjs
```

Default app URL: `http://localhost/A.C.A.S/tools/doppelmaia/`.
Override with `ORIGINAL_APP_URL` (include trailing slash), and optionally
`LC0_TEST_BROWSER` for a Chromium executable. Its real service worker isolates the
page and maps `./runtime/` to the actual upstream Lc0 converter / ORT assets.
Converter work happens in Playwright, not a substitute protobuf converter.
`--models maia-1500 tinygyal-8` bounds a diagnostic run; the full output tests
deliberately require all eleven default models. `--epochs` defaults to 10.

## Evidence and bounds

`original_data.py` streams only the first 1,000 games of the existing local public
Lichess archive. It deduplicates games, sorts by UTC timestamp, separates games
60/20/20, and takes 256/64/128 moves across their respective game groups. Games
must be standard, normally terminated, and at least 40 plies. Positions start at
ply 12 and must have at least two legal moves. Per-game plies are ranked by
SHA256(game-ID:ply) before round-robin sampling, avoiding an opening-only sample.
No board/side position is reused,
even across splits. Histories contain the real preceding eight FENs and
repetition flags calculated while replaying the complete game. Source game links,
canonical-game SHA256 IDs, source-prefix fingerprint, dataset fingerprint, model
fingerprints, and exact held-out predictions are retained.

This is **pooled archive move agreement**, not personalized human style evidence.
The historical collector did not audit BOT titles, so these numbers have not
been established as human only results. Numerical browser and CUDA checks still
test the implementation correctly regardless of who supplied the moves.
The tiny test set is noisy, and this experiment does not establish strength,
rating calibration, statistical superiority, feature equivalence across models,
or a path to near-100% agreement.

Native extraction is ONNX Runtime CUDA with CPU EP fallback explicitly disabled.
Saved execution profiles must contain CUDA convolutions and no CPU-provider
events. PyTorch head updates are on CUDA; TF32 is disabled. Browser WASM provides
an independent inference reference on one sample from each split per model.
All 448 encoded tensors exactly match an independent python-chess encoder.

The policy is the same 80-output, 3×3 convolution and 1,858-entry mapping used by
`weights.js`, not a new adapter. Actual `learning.js` is run without modifications:

* complete shared-real-data training histories, selected weights, and last-updated
  weights are compared with CUDA for every model;
* a 12-update stress fixture checks every JS batch with a `2e-6` weight tolerance;
* mutation controls must fail when removing momentum, clip5, or base-weight decay;
* an explicit equation test checks decay toward initial weights, not toward zero,
  and bias momentum.

For averaged gradient `g`, `s=min(1,5/||g||₂)`,
`d=s*g+0.0001*(w-w_initial)`, `v=float32(0.9*v+d)`,
`w=float32(w-learningRate*v)`. CUDA convolution reductions need not be bitwise
identical to JS's double arithmetic / Float32Array stores. Tolerances are checked
explicitly. Native history metrics must agree within `3e-4`, selected and
last-updated real-data weights within `2e-5`, and inference/export logits within
`.003` (the browser trainer's own threshold).

Default fitting is maximum 10 epochs, patience 3, learning rate .005, batch 16,
seed-42 LCG/Fisher-Yates order, validation CE checkpointing including epoch zero.
The test set never selects checkpoints or settings. LINEAR16 quantized exports
must improve validation CE or revert to the exact source PB, matching the browser.
Every changed last-epoch diagnostic candidate is separately exported through
`writePolicy`, reconverted by upstream Lc0, and checked numerically on CUDA,
even when validation rejects it. These `candidate\` files are **not deployment
recommendations**. Tests verify all non-final-policy ONNX initializers remain
byte-identical for both candidates and selected exports.

## Outputs

`temp\doppelmaia-original-comparison\review.html` is a standalone offline reviewer
with all eleven measured result rows and all test-move predictions; it has no
remote assets. `summary.csv`, `report.json`, and `dataset.json` retain structured
evidence. Each model folder includes source/feature ONNX, CUDA execution profiles,
actual-JS references, history metrics, held-out predictions, a changed diagnostic
`candidate\weights.pb`, and validation-selected `export\weights.pb` plus converted
ONNX. Source and feature caches are reused only when the source SHA256 matches.

Do not interpret an unchanged selected export as a failed or skipped run: default
training can overfit this small pooled sample. The history and changed diagnostic
candidate prove updates happened; the validation safeguard intentionally preserves
the starting network when no validated improvement is obtained.

## Measured outcome on the fixed real-human holdout

The measured phase-diverse dataset contains plies 12–141 and three true repetition
history flags. All ten Maia candidates were rejected by validation, so all ten
selected exports correctly preserve their original PB bytes. This is a negative
training result, not evidence that default fitting improved Maia.

| Start | Test agreement before → selected export | Test CE before → export |
|---|---:|---:|
| Maia1100 | 54.6875% → unchanged | 1.4557 → unchanged |
| Maia1200 | 50.7813% → unchanged | 1.5184 → unchanged |
| Maia1300 | 53.9063% → unchanged | 1.4474 → unchanged |
| Maia1400 | 54.6875% → unchanged | 1.4095 → unchanged |
| Maia1500 | 55.4688% → unchanged | 1.4168 → unchanged |
| Maia1600 | 56.2500% → unchanged | 1.4258 → unchanged |
| Maia1700 | 52.3438% → unchanged | 1.4474 → unchanged |
| Maia1800 | 54.6875% → unchanged | 1.4465 → unchanged |
| Maia1900 | 52.3438% → unchanged | 1.4438 → unchanged |
| Maia2200 | 51.5625% → unchanged | 1.4503 → unchanged |
| TinyGyal-8 | 40.6250% → 37.5000% | 2.1386 → 2.1902 |

TinyGyal's selected checkpoint improved validation CE but worsened test agreement
and CE: validation improvement does not guarantee test improvement. Do not select
it for quality from this experiment. Timing and precise numerical errors live in
`report.json` and `summary.csv`; all runs stay far below a few minutes per model.

## Larger matching-rating single-player followup

The original pooled run remains a compatibility/numerical study. The followup
reconstructs **Player01**, median **1540**, from the existing anonymized metadata:
715 complete real games identified by their source URLs and player-color records.
Raw PGNs and usernames are not persisted. Reconstruction streams 1,998,093 archive
games in about 22 seconds, parses only the matching games, and retains exact
history8/repetition data for that player's own moves.

```powershell
& $py tools\doppelmaia\experiments\original_person.py
node tools\doppelmaia\experiments\original_bridge.mjs encode temp\doppelmaia-original-person\dataset.json temp\doppelmaia-original-person
& $py tools\doppelmaia\experiments\original_study.py --output temp\doppelmaia-original-person --models maia-1500 tinygyal-8
& $py tools\doppelmaia\experiments\original_person_review.py
& $py tools\doppelmaia\experiments\original_person_test.py -v
$env:ORIGINAL_REVIEW_DIR='temp\doppelmaia-original-person'
node --test tools\doppelmaia\experiments\original_browser.test.mjs
Remove-Item Env:\ORIGINAL_REVIEW_DIR
```

Train/validation/test caps are **1024/256/512**, using the existing chronological
60/20/20 source-game groups, excluding repeated board/side positions across
all splits. Player-side moves only, matched to original Maia1500 and non-Maia
TinyGyal; identical default optimizer and validation safety behavior. No test-based
hyperparameter search is performed. Exact actual-JS training and changed-export
parity checks are unchanged and operate at the larger split sizes.

Outputs are isolated under `temp\doppelmaia-original-person`.
`person-summary.json` reports source-game counts, epoch losses explaining any
epoch-zero retention, and 2,000 source-game-cluster bootstrap confidence intervals
for test agreement and its paired change. These holdouts support a useful bounded
single-player pilot; correlated moves, one player, and one chronological holdout
do not establish generalization across players or playing strength.

### Single-player measured result

The requested sample sizes were achieved: 1,024/256/512 own-player moves from
408/138/138 sampled train/validation/test source games (715 full source games
reconstructed). There are 60 true history repetition flags. Neither model needed
the epoch-zero fallback on this larger person-specific dataset:

| Model | Selected epoch | Validation CE before → export | Test CE before → export | Test agreement before → export |
|---|---:|---:|---:|---:|
| Maia1500 | 2 (5 executed) | .888571 → .866048 | .889747 → .885401 | 74.4141% → 69.3359% |
| TinyGyal-8 | 7 (10 executed) | 1.970159 → 1.857294 | 1.974731 → 1.902392 | 48.4375% → 44.1406% |

This is a mixed/negative imitation result: selected CE improved, but top-1 human
move agreement **decreased**. CE and top-1 agreement measure different things;
the browser's validation-CE selection criterion does not guarantee improved
top-1 agreement. Do not call either export an imitation improvement.

The paired test agreement change's 95% source-game-cluster bootstrap intervals
are **−8.53 to −1.39 percentage points** for Maia1500 and **−8.14 to −0.58 points**
for TinyGyal. With 138 held-out source games the pilot can detect this adverse
agreement movement, but cannot justify small positive improvements or general
claims. Maia test agreement baseline 95% interval: 70.11–78.28%; export:
65.27–73.18%. These are conditional bootstrap intervals for this selected player,
not independent replication or population-wide guarantees.

Earlier pooled runs retained baseline because every trained Maia epoch worsened
held-out CE while training CE decreased: small pooled training overfit its
256-position sample. On the person-specific sample Maia training CE falls from
.9060 to .3472 over five epochs, while validation CE fluctuates
.8886/.9941/.8661/.9169/.8864/.9621; epoch 2 is retained, not the overfit final epoch.
These numbers demonstrate why the original epoch-zero safety is meaningful and
why larger player-specific holdouts change the checkpoint outcome.

The larger CUDA / complete actual-JS selected-and-last-weight parity maximum was
`2.98e-7`; maximum inference/export error was `1.073e-5`. Both source/changed PB
files were converted through the real browser Lc0 converter, checked as ONNX,
and validated on CUDA. Per-model total wall times were 9.52s and 8.64s; CUDA
head-training times .67s and 1.32s. An initial shared-Windows-memory allocation
failure was retried successfully; no CPU fallback or parent-process intervention
was used. Four person-output tests and two offline browser tests passed, as did
the original eight regression tests.
