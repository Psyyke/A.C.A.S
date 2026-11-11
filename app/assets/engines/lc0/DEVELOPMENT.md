# Lc0 port developer notes

This is an experimental browser port, not a replacement for the existing
ZeroFish engine. The app exposes it separately with CPU and WebGPU options.
The converter page uses the same upstream build.

## Where the source lives

`build.mjs` clones Lc0 v0.32.1 at
`fd71a2d921b689c5f479d3227c3806c8e272d9c5`, checks out its submodules and
builds the actual upstream classic search, Eigen backend and `leela2onnx`.
The generated checkout lives at `build/source` by default, or at
`LC0_BUILD_DIR/source` when that variable is set. It is not checked in.
The portable build recipe and all browser-specific changes live here instead:

- `build.mjs` pins the source and tools, applies checked patches, builds and
  copies the runtime and notices.
- `bridge.h` provides the thread-safe UCI command queue.
- `network_browser.cc` implements an upstream Lc0 network backend that sends
  batches to JavaScript while search threads wait on shared memory.
- `worker.js` exposes the engine UCI protocol and locks weights and backend
  for the lifetime of a worker.
- `worker-tree.js` gives the app direct ownership of every Lc0 worker,
  including the converter and Emscripten pthreads. Messages use transferable
  ports and buffers while shared WASM memory stays shared. Stopping an engine
  terminates the whole tree, even during startup or conversion. This avoids
  Chromium retaining nested worker VMs after their parent is terminated.
  Use `createWorkerTree()` when embedding the engine in a page.
- `browser-inference.js` converts the chosen weights, runs ONNX Runtime Web
  and validates and copies results into Lc0's memory. `float16.js` handles
  half-precision tensor values.
- `converter-worker.js` runs the upstream `leela2onnx` command in the same
  WebAssembly build. It is not a separate JavaScript converter.
- `float16_storage.h` keeps half-precision weight initializers while inserting
  float32 casts before their consumers. The converter keeps activations,
  scalar constants, inputs and outputs in float32 for this explicit mode.
- `precision-test.mjs` compares supplied ONNX models on the same input corpus
  with optional accuracy enforcement and a JSON report.
- `build-webgpu.mjs` builds an isolated, experimental JSEP runtime from the
  pinned ONNX Runtime package. `webgpu-precision-patches.mjs` applies checked
  packed shader changes without editing installed dependencies.
- `half-partials.mjs` rewrites float32 convolutions into experimental half
  partials with float32 sums. `candidate-converter.mjs` binds smoke-test and
  benchmark overrides to the exact source weight hash. These are development
  probes, not deployed converter modes.
- `browser-test.mjs` and the `*.test.mjs` files exercise the port.
- `dist` contains the deployable Lc0 and ONNX Runtime Web files, their
  licenses and notices, and `build-info.json`. The converter needs only
  `lc0.js` and `lc0.wasm`. The ONNX engine backend also needs the ONNX
  Runtime files. Keep the notices when distributing either backend.

The original upstream files remain available from the pinned revision at
<https://github.com/LeelaChessZero/lc0/tree/fd71a2d921b689c5f479d3227c3806c8e272d9c5>.
The build copies `bridge.h`, `network_browser.cc` and `float16_storage.h` into the generated
checkout. It also checks each patch against upstream before applying it.
Do not edit the generated checkout as the source of a fix. Put browser
changes in this folder and update the build recipe instead.

## What the patches do

The Meson source list includes the browser backend. The engine loop reads
commands from the browser queue instead of standard input. A wasm32 node
layout guard fixes an upstream architecture assumption. The ONNX converter
loads transformer encoder layers one at a time to reduce peak memory. Normal
weight loading remains eager. An iterator include fixes the Emscripten build.
The converter also accepts our `--onnx-fp16-weights` flag with
`--onnx-data-type=f32`. This rounds weight arrays to half, then inserts casts
in topological order while retaining float32 math. Non-finite half weights
are rejected with the initializer name. It does not change upstream's
`--onnx-data-type=f16` behavior. The mixed model's declared type is float32.
The mixed flag rejects files with embedded ONNX instead of silently
extracting an unchanged model. It needs original Lc0 weight arrays.
The WebAssembly build uses threads, SIMD, 5 MiB stacks and runtime exit.
`LC0_MAX_MEMORY=4GB` changes the memory limit and requires a fresh build
directory. It does not guarantee that the browser has enough memory.

## Updating Lc0 or the converter

1. Pick an upstream release and update the tag and commit in `build.mjs`.
   Check its submodule revisions and read upstream release and converter
   changes. Do not remove the exact patch checks to make an update pass.
2. Use a fresh `LC0_BUILD_DIR`. Rework patches against the new source and
   check that lazy encoder loading still preserves every network format.
   Check the converter's flags, output names and precision behavior.
3. Keep the Emscripten and ONNX Runtime pins deliberate. Update the version
   checks, notice hashes, package lock and build metadata together when
   changing them. Build from a clean checkout and keep the upstream GPL source,
   local modifications and required notices available to recipients.
4. Run the unit and browser tests in the README. Compare converted models
   against the native upstream converter and compare search with native Lc0
   or Eigen across supported networks and positions. Test all three precisions
   separately and investigate differences rather than relaxing float32
   checks. Test malformed weights, cancellation, reloads and memory limits.
5. Rebuild and include all deployable `dist` files. Update
   the converter page's version and these notes. Verify the page on static
   hosting, where its scoped service worker supplies cross-origin isolation.

The page in `tools/leela2onnx/` transfers the local weights to a fresh worker
and lets the user download the returned ONNX buffer. It supports float32,
full float16 and float16 weight storage with float32 math.
Errors and upstream diagnostics are shown on the page. It does not
upload weights to a server. Its scoped service worker maps requests under
`tools/leela2onnx/runtime/` to this folder and supplies isolation headers.
The worker and its Emscripten pthreads need those scoped URLs, even on a
server that already supplies isolation headers. The page test exercises both
server configurations, conversion, download, cancellation and missing
runtime errors. It also runs the downloaded float32 and mixed Maia models
through ONNX Runtime, checks the policy and WDL outputs against each other
and verifies the mixed download is less than 60% of the float32 size.
Run it with:

```powershell
node --test app\assets\engines\lc0\converter-page.test.mjs
```

The converter waits for worker activation and reloads once if the scoped
worker is active but does not control the current page. An existing active
registration does not necessarily emit another `controllerchange` event.
A session guard prevents reload loops if the browser blocks control.
`tests/lc0-converter-isolation.test.mjs` covers this recovery and fresh installs.

Set `LC0_TEST_BROWSER_ENGINE=firefox` to use Playwright Firefox.
Set `LC0_TEST_EMBEDDED_WEIGHTS` to an ONNX-wrapped Lc0 protobuf to also check
that mixed conversion reports an explicit error for already embedded models.

Large conversions need memory for the input,
upstream decoding and output at the same time. A 2 GiB build failed BT4
conversion, while a 4 GiB build succeeded in both formats on one machine.
Other models and devices can still fail.

## Inference and integration cautions

The older bundled engine identifies itself as `Lc0 v0.29.0+zerofish` and
reports only the Eigen backend. Its GUI name is CPU Lc0 v0.29.0.
`legacy-benchmark.mjs` compares that engine with current float32 WebGPU on
the actual host. With Maia 1500, 500 nodes, one thread, batch one and NN cache
disabled, three warmed searches took 37.99 to 38.19 seconds on the old CPU
build and 4.39 to 4.43 seconds on WebGPU, about 8.6 times faster.
Both selected `e7e5`, but reported scores differed between engine versions.
The subsequent old-engine Good Gyal run timed out, so there is no completed
Good Gyal comparison or complete JSON report from that invocation.
This is a fixed-workload timing observation, not an equal-strength comparison.

The ONNX backend always converts the same protobuf passed to Lc0. Input planes
come from upstream Lc0 and inference requests are serialized in JavaScript.
WASM pointers are unsigned because 4 GiB builds may use addresses above
2 GiB. Search threads wait on a futex and must be released on every failure.
`ready` means the runtime and file are available, not that Lc0 has parsed
the network. Monitor worker errors, `error` messages and UCI `error ` lines.

The float32 path is the default. WebGPU float16 requires `shader-f16` and is
opt-in. Small tests passed in Chrome, Edge and Firefox. A BT4 search reached
5,003 nodes on one machine, but earlier BT4 attempts also produced allocation
and WebGPU invalid-buffer errors. Their cause is not established. Good Gyal 7
float16 WebGPU results exceeded the tensor parity bounds on synthetic inputs,
including an all-zero input. Native CPU float16 differed less from float32 on
the same input. Browser-converted and native-converted float16 models produced
identical GPU outputs on those inputs for both Good Gyal 7 and Maia 1100.
This rules out a difference introduced only by the browser converter.
Do not assume float16 fixes memory failures or preserves strength, and do
not silently select it.

### Float16 accuracy investigation

The deployed ONNX Runtime 1.31.1 bundle uses its native WebGPU provider.
The older JSEP TypeScript shader sources in the npm package are not the
shader implementation used by this runtime. Editing those files alone would
not fix the deployed kernels. The `enableMatmulFp32Accumulation` session
option currently covers MatMulNBits and fused quantized variants, not Lc0's
unquantized Conv and MatMul operators.

Good Gyal 7 reproduced the regression on an RTX 4070 Ti SUPER in Chrome
156.0.8078.80. Three synthetic input patterns were tested at batches 1 and 2.
Widening selected operations in an independently converted native half model
gave these worst errors against float32 WASM:

| Computation | Policy max absolute error | Scalar value max absolute error |
| --- | ---: | ---: |
| Original float16 WebGPU | 1.7930 | 0.09115 |
| Float32 Conv and MatMul, half activations between operations | 0.3254 | 0.02788 |
| Float32 math and activations, half-rounded weights | 0.0503 | 0.00420 |

These probes establish that low-precision computation and intermediate
rounding add substantial error beyond weight quantization. They do not
identify one faulty kernel or establish that a wider dot-product accumulator
alone is enough. Full accelerated float16 is still not an accuracy-safe default.

The implemented alternative is `f16-mixed`. The checked upstream patch stores
weight arrays as float16, casts them to float32 before use, and leaves scalar
constants and all arithmetic in float32. ONNX Runtime can fold these casts
when loading the model. This saves serialized bytes, not float32 device
buffers or arithmetic. It is not a faster half-precision kernel implementation.
It is supported by the WASM and WebGPU ONNX providers without `shader-f16`.
Eigen continues to use its original weights and does not accept this option.

The production converter's Good Gyal mixed model passed ONNX's full checker.
All inputs and outputs stayed float32 and all 140 half weight initializers
were finite. Native ONNX Runtime CPU outputs matched an independent graph
with native half weights expanded to float32 within 0.00001 on all nine
batch/pattern samples. Its serialized size was 23,776,493 bytes, compared
with 47,470,541 bytes for the native float32 model.

The browser regression checks retain the existing limits of 0.2 for policy
logits, 0.01 for other outputs and 10 centipawns for early-search scores.
On WebGPU at batches 1, 2 and 16, Good Gyal mixed policy error stayed below 0.05031
and scalar value error below 0.00420. Maia 1500 policy error stayed below
0.05526 and WDL error below 0.000901. Seven early-search positions also compare
against Eigen, alongside stop, restricted promotion, en passant and Chess960.
These are regression checks, not guarantees about strength or other networks.
More importantly, the real-search corpus below later failed the same policy
bound for this production mixed model. The initial synthetic result must not
be treated as general numerical validation.
The mixed Maia worker also passed the full smoke test with Firefox's WASM
provider, without WebGPU or `shader-f16`.

One concurrent run of the Good Gyal GPU smoke test and the WebGPU GUI reload
test stalled. Both passed separately afterward. That concurrent reload case
remains unresolved and is not evidence that mixed precision fixes GPU
lifecycle reliability.

A two-node promotion position was unsuitable for direct MultiPV score parity.
Even float32 WebGPU visited a terminal underpromotion and reached three nodes,
while Eigen first emitted two nodes with an unvisited queen candidate.
Those scores represented different search stages, not an isolated precision
comparison. Restricted promotion remains covered by the protocol test.

To reproduce mixed inference checks:

```powershell
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:LC0_TEST_PROVIDER = 'webgpu'
$env:LC0_TEST_INFERENCE_TYPE = 'f16-mixed'
$env:LC0_TEST_CONVERT_WEIGHTS = 'C:\path\to\weights.pb'
$env:LC0_TEST_PRIMARY_WEIGHTS = $env:LC0_TEST_CONVERT_WEIGHTS
$env:LC0_TEST_TIMEOUT_MS = '180000'
node app\assets\engines\lc0\browser-test.mjs
```

For arbitrary graph probes, set `LC0_PRECISION_MODELS` to a JSON array of
`{ "name": "...", "path": "...", "type": "float32", "provider": "wasm" }`
entries. Types are `float32` or `float16`, providers are `wasm` or `webgpu`.
The first entry is the reference. Set `LC0_PRECISION_ENFORCE=1` to enforce
the same tensor limits, which requires a float32 WASM reference and at least
one candidate. `LC0_PRECISION_REPORT` saves a JSON report. Run
`node app\assets\engines\lc0\precision-test.mjs`.
It checks three patterns at batches 1, 2 and 16, verifies finite values and
matching output names and shapes, and warms each shape before timing.
Those individual inference timings are diagnostics, not search benchmarks.

### Accelerated FP16 follow-up

No accelerated candidate from this investigation is deployed. The app still
uses float32. Keeping shader accumulators wide is useful, but not enough to
preserve the original float32 outputs with half weights and activations.

`build-webgpu.mjs` uses esbuild and the TypeScript JSEP implementation from
the pinned `onnxruntime-web` 1.31.1 package. It copies matching JSEP WASM,
checks the existing runtime notices and records its precision flags. This
is a different execution provider implementation from the deployed native
WebGPU runtime, not a patch to its binary. Build the ordinary runtime first
so the checked notices exist. Then, from the repository root:

```powershell
$env:LC0_JSEP_BUILD_DIR = 'C:\lc0-probes\jsep-half-products'
$env:LC0_JSEP_FP32_ACCUMULATION = '1'
$env:LC0_JSEP_FP16_PRODUCTS = '1'
node app\assets\engines\lc0\build-webgpu.mjs
node app\assets\engines\lc0\half-partials.mjs C:\lc0-probes\weights-f32.onnx C:\lc0-probes\partials64.onnx 64
```

The default output is ignored `build/jsep`. The script rejects `dist` as its
output. Without accumulation flags it builds the unmodified JSEP shaders.
Accumulation alone widens both operands and sums. With both flags, the packed
kernels keep genuine half products and float32 sums. The checked patch covers
the packed scalar and vector paths, not every kernel, reduction or epilogue.
Do not assume it guarantees FP32 accumulation across an arbitrary graph.

The partial-convolution rewrite needs float32 interfaces, inline float32
kernels and ONNX opset 13 or later. It slices channels, rounds kernels and
inputs to half, convolves without bias, then adds partials and the original
bias in float32. The rest of the graph stays float32. It rejects grouped
convolutions, subgraphs, non-finite or overflowing weights and transformer-only
graphs rather than silently falling back. This is not a full-half network.

Good Gyal 7 synthetic results at batches 1, 2 and 16 on the same GPU:

| JSEP candidate | Policy max absolute error | Scalar value max absolute error |
| --- | ---: | ---: |
| Original full half | 2.3553 | 0.08822 |
| Full half graph with float32 packed products and sums | 1.8649 | 0.03707 |
| Full half graph with half products and float32 packed sums | 2.0514 | 0.03048 |
| 64-channel convolution partials, half products, float32 rest | 0.13353 | 0.002059 |

The last candidate passed those synthetic bounds and seven-position early
search checks for Good Gyal and Maia 1500. Its Maia synthetic errors stayed
below 0.07793 policy and 0.002046 WDL. Independent ONNX full checks passed
both rewritten models. However, capturing the actual upstream encoded planes
exposed policy failures that these tests missed.

The real Good Gyal corpus contained 33 inference batches with sizes including
1, 6, 13, 19, 20 and 32. Every output was compared with float32 WASM without
excluding illegal-move logits or changing the policy limit of 0.2 or value
limit of 0.01:

| Real-input candidate | Policy max absolute error | Value max absolute error | Failing batches |
| --- | ---: | ---: | ---: |
| Deployed float32 WebGPU | 0.000916 | 0.000000865 | 0 / 33 |
| Production mixed converter, float32 computation | 0.72358 | 0.000518 | 6 / 33 |
| Half-product convolution partials, width 64 | 0.75617 | 0.000549 | 7 / 33 |
| Half-product convolution partials, width 32 | 0.52674 | 0.000533 | 8 / 33 |
| Width 64 only in residual tower, float32 stem and heads | 0.51455 | 0.000434 | 8 / 33 |

An independent model with native half weights expanded to float32 reproduced
the production mixed result. Weight quantization itself therefore exceeds
the current bound on this corpus, even without half arithmetic. These results
do not establish a single faulty shader or that all half models are unusable.
They establish that this port cannot honestly advertise general FP32 parity
or enable these candidates by default. Early score and move agreement is
not a substitute for checking complete inference outputs.

There was also no speed benefit. In three warmed 500-node Good Gyal runs,
one thread and batch size one, width-64 half-product partials took
1.267 to 1.354 seconds versus 1.145 to 1.163 seconds for deployed float32.
Both selected `e7e5` at -6 cp. Native float32 CUDA was around 0.216 to
0.232 seconds. Extra casts, partials and dispatches did not close that gap.

To reproduce using new captures rather than synthetic inputs:

```powershell
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:LC0_TEST_PROVIDER = 'webgpu'
$env:LC0_TEST_PRIMARY_WEIGHTS = 'C:\lc0-probes\weights.pb.gz'
$env:LC0_TEST_CONVERT_WEIGHTS = $env:LC0_TEST_PRIMARY_WEIGHTS
$env:LC0_TEST_INPUTS_OUTPUT = 'C:\lc0-probes\search-inputs.json'
node app\assets\engines\lc0\browser-test.mjs
$env:LC0_PRECISION_RUNTIME = 'C:\lc0-probes\jsep-half-products'
$env:LC0_PRECISION_INPUTS = 'C:\lc0-probes\search-inputs.json'
$env:LC0_PRECISION_MODELS = ConvertTo-Json -Compress @(
    @{ name='reference'; path='C:\lc0-probes\weights-f32.onnx'; type='float32'; provider='wasm' },
    @{ name='candidate'; path='C:\lc0-probes\partials64.onnx'; type='float32'; provider='webgpu' }
)
$env:LC0_PRECISION_REPORT = 'C:\lc0-probes\precision.json'
$env:LC0_PRECISION_ENFORCE = '1'
node app\assets\engines\lc0\precision-test.mjs
```

The capture wrapper delegates normal production inference unchanged and records
the main worker's tensors. Clear `LC0_TEST_INPUTS_OUTPUT` after capture.
The precision harness validates finite `[batch,112,8,8]` tensors and saves
the complete comparison and violations before rejecting failed accuracy.
Captured real positions and synthetic inputs both belong in future validation.

Set `LC0_TEST_RUNTIME` or `LC0_BENCH_RUNTIME` to the experimental JSEP folder
for smoke tests or sequential benchmarks. Set `LC0_TEST_CANDIDATE_ONNX` or
`LC0_BENCH_CANDIDATE_ONNX` to the rewritten graph and the corresponding
inference type to `f16-mixed`, which declares its float32 interfaces.
The main, conversion and benchmark weights must match the candidate's source.
The shared override checks their SHA-256 before substitution so another
concurrent worker cannot accidentally receive the wrong network.
These overrides are test-only. They do not add raw ONNX upload to the app.

Use `LC0_BENCH_INFERENCE_TYPE=f16-mixed` with the sequential benchmark to
measure the tradeoff. In three 500-node Good Gyal runs with one thread and
batch size one, float32 WebGPU took 1.078 to 1.122 seconds, while mixed
WebGPU took 1.121 to 1.186 seconds. Both chose `e7e5` and reported -6 cp.
Native float32 CUDA took 0.211 to 0.233 seconds in these runs.
The mixed mode did not close the CUDA performance gap. Float32 remains the
app default. Faster accurate half kernels need separate ONNX Runtime work.

A later float32 BT4-1740 check reproduced the WebGPU invalid-buffer error.
Fresh runs at 4, 32 and 1,000 requested nodes then passed, including Eigen
score comparisons, stop, promotion, en passant and Chess960 castling.
The 1,000-node run reported 1,001 nodes and took 6.55 seconds of search wall
time with one thread and batch size one. This does not resolve the intermittent
failure or establish sustained stability. The tested compressed file was
382,645,316 bytes with SHA-256
`4a97d91c91e7ba7d27bb12cfd6d39975a7819372396479869431cbb479a97fcb`.
To repeat the check, use a fresh Chrome process and run:

```powershell
$env:LC0_TEST_PROVIDER = 'webgpu'
$env:LC0_TEST_PRIMARY_WEIGHTS = 'C:\path\to\BT4-1740.pb.gz'
$env:LC0_TEST_NODES = '1000'
$env:LC0_TEST_THREADS = '1'
$env:LC0_TEST_BATCH = '1'
$env:LC0_TEST_EXACT_NODES = '1'
$env:LC0_TEST_TIMEOUT_MS = '900000'
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:LC0_TEST_HEADED = '1'
$env:LC0_TEST_UNSAFE_WEBGPU = '1'
$env:LC0_TEST_VERBOSE = '1'
node app\assets\engines\lc0\browser-test.mjs
```

Keep the full browser diagnostics when a run fails. Do not retry inside the
engine, silently switch precision or present a later passing run as a fix.

On one NVIDIA GPU, a float32 Good Gyal 7 search reached 10,016 nodes with
four search threads and a minibatch size of 16. The same smoke test checks
stop, concurrent workers and early Eigen parity. Three concurrent float32
WebGPU workers, including two using Good Gyal 7, also completed short
searches on that machine. These are useful regression checks, not proof of
stability or speed on other hardware.

ONNX Runtime Web 1.24.1 produced incorrect policy outputs on the tested GPU.
Version 1.31.1 passed the float32 GPU versus WASM tensor checks on that machine.
Keep those checks when upgrading. The 5 MiB main and pthread stacks fixed a
WASM out-of-bounds crash seen with smaller stacks. The large-network converter
also needs `EXIT_RUNTIME=1` so its worker can report completion.

The app exposes `modern-lc0` for Eigen CPU and `modern-lc0-webgpu` for
float32 WebGPU. The `lc0` ID still identifies ZeroFish. The earlier experimental
versioned IDs remain accepted as aliases. Each modern profile stores an
uploaded file in IndexedDB and a reference in settings. An empty or unset
reference selects the existing `app/assets/lc0-nets/maia-1500.pb` asset.
Do not silently substitute it for missing or corrupt uploaded files.
The default is about 1.7 MB and needs no IndexedDB write. Maia's training
rating is not a calibrated strength rating for arbitrary search settings.
Settings exports do not include uploaded files. A weight or backend
change needs a new worker. The GUI test exercises searches and weight changes
through BoardSession using a real isolated server. Run it for CPU and, on a
WebGPU-capable machine, for GPU:

```powershell
node --test tests\upstream-lc0-gui.test.mjs tests\upstream-lc0-browser.test.mjs
node --test tests\upstream-lc0-match.test.mjs
$env:LC0_GUI_WEBGPU = '1'
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test tests\upstream-lc0-gui.test.mjs
```

The GUI checks include the styled file chooser, floaty layout at 360, 768 and
1,280 pixels, the default Maia network, a missing default HTTP response,
malformed uploads, recovery after failure, replacement and reset to default,
preserving a file shared by another profile, Advanced UCI options and
restricted moves on demand. The latest targeted suite passed 88 tests.
The WebGPU GUI check and Firefox converter-page check also passed separately.
Set `LC0_GUI_VERBOSE=1` for browser console diagnostics or
`LC0_GUI_SCREENSHOT_DIR` to an existing directory for floaty screenshots.
The test installs network interception before workers start. Adding routing
while threaded WebGPU workers were active hung browser automation in this
environment.

Ten rapid games each with Eigen CPU and float32 WebGPU, using two real
workers and Maia 1100 at four nodes per move, emitted only legal moves.
Eight games in each run finished and two reached the 100-ply cap.
Set `LC0_MATCH_GAMES=10` to repeat and `LC0_GUI_WEBGPU=1` for the GPU run.
A longer Good Gyal 7 WebGPU run reached 100,017 nodes in about 69.5 seconds
with four threads and batch size 16, followed by stop and protocol checks.
These are functional stress tests, not playing-strength measurements.

### Longer self-play runs

The self-play harness uses two persistent upstream workers and validates every
played move with chess.js. It resets both engines between games, retains full
move histories and reports games that hit the safety cap separately from
finished games. One node per move is the fastest policy-style Maia setting.
Use more nodes to exercise deeper search rather than to reproduce Maia's
training rating.

```powershell
$env:LC0_MATCH_GAMES = '1000'
$env:LC0_MATCH_NODES = '1'
$env:LC0_MATCH_MAX_PLIES = '600'
$env:LC0_MATCH_OPENING_PLIES = '8'
$env:LC0_MATCH_REPORT = 'C:\path\to\selfplay-cpu.json'
node --test tests\upstream-lc0-match.test.mjs
$env:LC0_GUI_WEBGPU = '1'
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:LC0_MATCH_REPORT = 'C:\path\to\selfplay-webgpu.json'
node --test tests\upstream-lc0-match.test.mjs
```

The report contains every game's UCI moves, result, elapsed time, searched-move
count and median, p95 and maximum request latency. The parent directory must
already exist. Eight-ply openings use a deterministic random seed of 1500,
starting from the same five first-move choices. These random legal openings
are for stress coverage, not an opening book or a strength benchmark.
Leave `LC0_MATCH_OPENING_PLIES` unset for the original five-opening reuse test.
The cap defaults to 600 plies and the test has a two-hour timeout.
Do not compare self-play timings collected under different system loads as
isolated backend benchmarks. Use the sequential benchmark below for that.

On the same Ryzen 7 7800X3D and RTX 4070 Ti SUPER machine, the expanded run
completed 3,000 games with Maia 1500, one thread and batch size one:

| Backend | Opening corpus | Games | Searched moves | Wall time |
| --- | --- | ---: | ---: | ---: |
| Eigen WASM | Five first-move choices | 1,000 | 62,000 | 232.33 s |
| Float32 WebGPU | Five first-move choices | 1,000 | 62,000 | 639.29 s |
| Eigen WASM | Seeded eight-ply openings | 500 | 36,802 | 149.97 s |
| Float32 WebGPU | Seeded eight-ply openings | 500 | 36,802 | 362.83 s |

Every game finished under the 600-ply safety cap. No illegal engine moves
were emitted across 197,604 searched moves. The first corpus repeated four
distinct full game histories, so its value is sustained worker reuse, not
position diversity. All 1,000 CPU and GPU histories in that corpus matched.
The seeded corpus contained 500 distinct histories on each backend, and all
500 CPU and GPU histories matched. All 207,204 played plies, including seeded
opening moves, were replayed in a separate validation pass. The seeded outcomes
were 192 white wins, 146 black wins and 162 draws on each backend.
Some GUI tests and the BT4 stress check ran alongside self-play. These wall
times are workload observations, not isolated speed comparisons or strength
ratings. Startup and conversion are outside the self-play timer, but the
first search can still include weight parsing and warm-up.

The larger float32 BT4-1740 check completed exactly 10,000 nodes with four
threads and batch size 16 in 44.30 seconds of search wall time, while other
GPU self-play was running. Stop, special moves, Chess960 and short Eigen
score comparisons also passed. Keep the earlier intermittent invalid-buffer
failure warning. This passing stress run does not explain or fix that issue.

For a sequential native Eigen, browser Eigen and optional browser WebGPU
comparison, use a native Lc0 binary and the same weights on the same machine:

```powershell
$env:LC0_NATIVE = 'C:\path\to\lc0.exe'
$env:LC0_BENCH_WEIGHTS = 'C:\path\to\weights.pb.gz'
$env:LC0_BENCH_NODES = '500'
$env:LC0_BENCH_RUNS = '3'
$env:LC0_BENCH_WEBGPU = '1'
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node app\assets\engines\lc0\benchmark.mjs
```

Each run defaults to one search thread and batch size one, with the same
position, no smart pruning and a warm-up search. Set `LC0_BENCH_THREADS` and
`LC0_BENCH_BATCH` to compare other matched settings. The search results report
wall time separately from startup and warm-up. WebGPU startup includes model
conversion, but does not measure it separately. GPU results use float32 by
default and are specific to the machine. Set `LC0_BENCH_INFERENCE_TYPE` to
`f16-mixed` or `f16` to measure an explicit alternative with WebGPU enabled.
The report records the selected type. Raw float16 results are not accuracy
validation.
Different batching and network sizes may change the relative speeds.
Set `LC0_NATIVE_BACKEND` to a supported native backend such as `cuda` to
compare native GPU instead. Set `LC0_BENCH_SKIP_CPU=1` to skip browser CPU.
Set `LC0_BENCH_REPORT` to save a JSON report. Each run must report at least
the requested nodes and a nonterminal UCI best move or the benchmark fails.

On one Windows machine with a Ryzen 7 7800X3D and RTX 4070 Ti SUPER, three
500-node Good Gyal 7 runs took 12.97 to 13.84 seconds with native Lc0 v0.32.1
Eigen, 22.13 to 23.27 seconds with browser Eigen, and 0.85 to 0.88 seconds
with browser WebGPU. The browser reported 501 nodes. All runs chose the same
move and reported the same score. A separate matched float32 comparison on
the same GPU took 149 to 158 ms with native CUDA and 833 to 883 ms with
WebGPU. Native CUDA reached `readyok` in 417 ms and needed 882 ms for a
16-node warm-up. WebGPU took 958 ms to `readyok` and 290 ms for warm-up.
These startup measurements exclude reading the source file into the page.
The search timings exclude model conversion and initialization. These are not
general performance or strength claims.

With four threads and batch size 16, three matched 5,000-node searches took
433 to 448 ms with native CUDA and 2.68 to 2.70 seconds with WebGPU. Both
overshot the requested node count slightly and chose the same best move. The
multi-threaded search can take a different path across runs. Batching may
improve throughput but can also affect strength, so compare settings for the
network and time limit rather than assuming bigger batches are always better.

### Latest isolated CPU and GPU comparison

After the expanded self-play and BT4 runs finished, another sequential
benchmark on 2026-11-09 used the same hardware, Lc0 v0.32.1 and float32
inference. Both browser backends used Chrome 156.0.8078.80. Each entry below
is the range of three searches after a separate 16-node warm-up. Native
Eigen and native CUDA were measured in separate invocations of the harness.
The WebGPU column includes both invocations for the single-thread rows.

| Network | Nodes | Threads / batch | Native Eigen | Browser Eigen | Native CUDA | Browser WebGPU |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Maia 1500 | 5,000 | 1 / 1 | 6.05 to 6.16 s | 13.62 to 14.17 s | 0.806 to 0.881 s | 8.04 to 8.29 s |
| Good Gyal 7 | 500 | 1 / 1 | 12.08 to 12.09 s | 18.94 to 19.48 s | 0.212 to 0.214 s | 1.04 to 1.13 s |
| Good Gyal 7 | 5,000 | 4 / 16 | Not measured | Not measured | 0.631 to 0.679 s | 3.69 to 3.77 s |

Position was `startpos moves e2e4`, smart pruning was disabled and the cache
size was 1,000. All runs reached at least the requested nodes. Some overshot
slightly. Each row chose the same best move across backends. Maia's final
score was -18 cp with Eigen and CUDA, and -19 cp with WebGPU. These small
numerical/search differences must not be presented as identical inference or
proof of identical playing strength.

For these longer searches, browser WebGPU was about 1.7 times faster than
browser Eigen with Maia and about 18 times faster with Good Gyal 7.
Browser Eigen was about 1.6 to 2.3 times slower than native Eigen.
WebGPU remained about 5 to 10 times slower than native float32 CUDA.
The earlier timings above are historical observations, not fixed guarantees.

Tiny one-node searches tell a different story. In the fixed-opening self-play
run, median request latency was 3.41 ms for browser Eigen and 9.63 ms for
WebGPU. The seeded run measured 3.77 ms and 9.34 ms. CPU is a good starting
point for the default Maia policy-style use case. GPU dispatch and readback
overhead can outweigh its compute advantage on tiny requests. More batching
helps throughput on longer searches but can change the search path and strength.
Do not silently change a user's node count or batching to advertise a speedup.

Use the benchmark command above with `LC0_BENCH_WEIGHTS` set to Maia 1500
and `LC0_BENCH_NODES=5000` to repeat the first row. For the second row, use
Good Gyal 7 and 500 nodes. The last row uses Good Gyal 7, 5,000 nodes,
`LC0_BENCH_THREADS=4`, `LC0_BENCH_BATCH=16` and native backend `cuda`.
Startup and conversion remain outside these search timings.

Keep the deployed runtime, corresponding source and notices together. Exercise
the real GUI lifecycle and service-worker isolation after updates, not only
the standalone worker. Broader network, browser, GPU and sustained-use
coverage is still needed.
