# Lc0 browser port

This folder builds the real Lc0 v0.32.1 classic search and Eigen neural backend
from upstream commit `fd71a2d921b689c5f479d3227c3806c8e272d9c5`. It is
available in A.C.A.S as separate experimental CPU and WebGPU engines. The
existing ZeroFish engine keeps its original engine ID `lc0`. Its own UCI
identity is `Lc0 v0.29.0+zerofish`, and its only reported backend is Eigen CPU.
The settings list names it `CPU Lc0 v0.29.0`.
The current engine IDs are `lc0-v0.32.1-wasm` and `lc0-v0.32.1-webgpu`.
Earlier `modern-lc0`, `modern-lc0-webgpu` and `lc0-v0.32.1` selections remain
supported aliases, including when displaying saved settings.

The browser build is experimental. It includes upstream Eigen CPU inference
and an ONNX Runtime Web backend for WebGPU or WASM inference. The browser
backend converts the supplied Lc0 protobuf weights with upstream Lc0, then
uses the original Lc0 search and position encoding. It is not a replacement
for every native Lc0 backend or network format. Broader browser, network and
long-running tests are still needed.

Select `CPU Lc0 v0.32.1` or `GPU Lc0 v0.32.1` in engine settings.
It starts with the existing lightweight Maia 1500 network (1.7 MB).
Maia learns from games around its named rating, but search settings affect
playing strength, so this is not a guaranteed 1500 Elo engine.
Open Lc0 Weights to upload another network for the selected profile or choose
Use default to return to Maia 1500. An uploaded file stays
in this browser's storage and is not included in settings exports. An
upload shows an animated clock toast while waiting, then a success toast once
the engine produces its first search output,
not merely when storage finishes. With no active analysis, confirmation waits
until the weights are used. Invalid weights do not get a success toast. The old
preinstalled dropdown belongs to Legacy Lc0 only. The default reuses the
existing Maia asset instead of downloading or storing a duplicate.
WebGPU requires a compatible
browser and GPU, uses float32, and reports errors rather than falling back to CPU.
CPU is a good starting point for Maia at one node per move. WebGPU can help
with larger networks and longer searches, but is not automatically faster.
Both options require cross-origin isolation. Chess and Chess960 are supported.
Large networks can need substantial memory and are not yet reliable on every
device. Lc0 itself converts the supplied protobuf for WebGPU, so the standalone
converter at `tools/leela2onnx/` is optional and useful for other ONNX tools.

## What is supported

### Weights

Modern Lc0 accepts original Lc0 protobuf weights, either plain `.pb` or
gzip-compressed `.pb.gz` and `.gz`. Compression is detected from the contents,
not the filename. The engine and the browser converter both handle gzip.
Use original Lc0 weights, not a ZIP archive or a renamed ONNX file.
Raw `.onnx` uploads and old Lc0 text weights are not supported by the app.

Classical, squeeze-and-excitation and attention networks are supported only
where the selected upstream backend supports their input format, activations
and heads. A protobuf extension alone does not establish compatibility.
Networks requiring a newer Lc0 version can be rejected by this pinned build.

| Network tested | Coverage |
| --- | --- |
| Maia 1100 | Engine, converter and app transport, including actual `.pb.gz` and `.gz` files |
| Maia 1200 | Engine and app integration checks |
| Maia 1500 | Default weights, CPU and GPU checks, lower-precision probes and self-play stress tests |
| Good Gyal 7 | Conversion, search benchmarks and synthetic and real-search precision comparisons |
| BT4-1740 | Conversion and long searches, with intermittent memory and WebGPU invalid-buffer failures still unresolved |

This is the tested list, not certification of every weight file or device.
Legacy Lc0 keeps its separate bundled network dropdown and older restrictions.

### Search and options

Classic is Lc0's normal Monte Carlo tree search, guided by its neural network.
Upstream also has policyhead and valuehead one-step modes and an experimental
`dag-preview` search. The app currently starts classic only. It is the real
upstream search, but this browser build does not provide every native backend
or command-line feature. Native GPU backends, native filesystem access and
user-supplied Syzygy tablebases are not integrated. Network compatibility and
memory limits still depend on the chosen backend and device.

The engine sends UCI options to A.C.A.S, which creates the Advanced settings
from them. `WeightsFile` and `Backend` are intentionally hidden there because
the app controls them when starting a worker. Choose the file and CPU or
WebGPU engine in the GUI instead. Other options are those reported by this
build, not a promise that filesystem-dependent native options work in a browser.

**ConfigFile** is a textarea for config contents, not a path. Use one native
long option per line, such as `--cpuct=3.25` or `--threads=1`. Blank lines and
`#` comments are welcome. A.C.A.S writes it to an in-memory file before Lc0
starts, since changing the UCI ConfigFile path alone does not reload a config.
Editing or clearing it restarts that profile. Saved individual UCI controls
override config values. Contents are limited to 64 KiB and included in settings
exports. They are only applied in Advanced Elo.

Weights and backend selection stay with the app's dedicated controls.
Config flags for other config files, log files and tablebase directories are
rejected because they need files outside this browser's supported inputs.
Malformed or unknown options fail the profile with a diagnostic.

## Build

Install Git, Node.js, Python, Meson, Ninja, and Emscripten 4.0.21. Activate the
Emscripten environment so that `EMSDK` is set and `meson` and `ninja` are on
the path. From the repository root, run:

```powershell
npm ci --prefix app\assets\engines\lc0
node app\assets\engines\lc0\build.mjs
```

The build downloads the pinned upstream source and its dependencies into
`build/source`. Set `LC0_BUILD_DIR` to use a different build directory, in
which case the checkout is at `LC0_BUILD_DIR/source`. The upstream checkout is
generated and is not committed. Meson downloads
its pinned Eigen and Abseil dependencies on the first build. Generated files
are placed in `dist`. The engine and ONNX Runtime assets, licenses, notices
and build metadata in `dist` are intended for version control and static
hosting. The build directory remains ignored. If build options or the SDK
path change, use a fresh `LC0_BUILD_DIR`.

The host must serve `.mjs` files as `text/javascript` and `.wasm` files as
`application/wasm`. This folder includes an Apache `.htaccess` mapping for
hosts such as UwAmp that do not recognize `.mjs`. Apache must allow these
overrides. For other servers, configure the same MIME types in the server.
An empty or incorrect module MIME type prevents WebGPU startup before any
inference runs.
To check the real host, including a WebGPU search rather than just the test
server, run:

```powershell
$env:LC0_TEST_HOST_URL = 'http://localhost/A.C.A.S/'
$env:LC0_TEST_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test app\assets\engines\lc0\hosting.test.mjs
```

Use your deployment's base URL with a trailing slash. This optional test needs
a WebGPU-capable browser and runs in a fresh browser context.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the source layout, update checklist,
converter details, testing history and known limitations.

The default WebAssembly memory limit is 2 GiB. To experiment with larger
networks, set `LC0_MAX_MEMORY=4GB` and use a fresh build directory. This
raises the limit rather than reserving 4 GiB up front. The browser and system
also need enough memory for the weights, conversion, and inference.
The generated converter runtime was built with `LC0_MAX_MEMORY=4GB`.
Use that setting when regenerating it if large-network support is desired.

The upstream code is GPL-3.0-or-later. The generated engine is derived from
that source. Make the corresponding source and these build changes available
when distributing it. The upstream source includes its license and the
versions of its dependencies. The build copies Lc0's license and downloads
the pinned ONNX Runtime license and third-party notices into `dist`, checking
their SHA-256 hashes. `build-info.json` records the build versions and memory
limit. ONNX Runtime Web is separately licensed under the MIT license.
The notices alone are not a substitute for providing corresponding source.
See [NOTICE.txt](./NOTICE.txt) for attribution, the exact upstream revision
and the GitHub location of our modifications. Publish this entire source
folder, the lockfile, build instructions and notices together with the matching
`dist` binaries. For releases, keep an immutable commit or tag identifying
that pair and link recipients to it. Do not publish only the generated files.
No separate source archive is generated by this build.

## Worker protocol

The worker requires a secure, cross-origin-isolated page with WebAssembly
threads and SIMD. Create `worker.js` as a module worker. Send
`{ type: 'initialize', weights: arrayBuffer }` and wait for `ready`. Send a
single UCI command as `{ type: 'uci', line: '...' }`. Responses have type `uci`
and a `line`. Diagnostic lines use type `log`, and failures use type `error`
with a `message`. Terminate the worker when finished. Create a new worker to
change weights or backend. Those UCI options cannot be changed in place.

Omit `provider` for Eigen CPU inference. To use the experimental ONNX backend,
send `provider: 'webgpu'` or `provider: 'wasm'` with the initialization message.
WebGPU is not silently selected as a fallback. Startup converts the supplied
weights and loads a matching ONNX model, which can take time and memory.
Unsupported networks or providers report an error. Monitor worker error events
and terminate the worker after a failure.

For an experimental lower-precision WebGPU model, add
`inferenceDataType: 'f16'` to the initialization message. This requires an
adapter with `shader-f16` and reports an error if it is unavailable. The
default remains float32. Float16 can change network outputs, scores and moves,
and is not yet validated across all networks, browsers or GPUs. It is not
available with the WASM or Eigen providers.
The experimental path is not a drop-in accuracy match. On one GPU, the
Good Gyal 7 network exceeded the float16 smoke-test bounds on synthetic
inputs, including an all-zero input. For that input the scalar value differed
from float32 WASM by about 0.091 with WebGPU float16. Native ONNX Runtime CPU
with the upstream float16 model differed from native float32 by about 0.0063.
Native-converted and browser-converted half models produced identical GPU
outputs. Widening only Conv and MatMul still failed the accuracy bounds.
Keeping all activations and math in float32 reduced the remaining error to
the half-rounded weights. See the precision investigation in
[DEVELOPMENT.md](./DEVELOPMENT.md). Full float16 arithmetic remains experimental.

For compact float16 weights with float32 math, use
`inferenceDataType: 'f16-mixed'` with either ONNX provider. It does not need
`shader-f16`. This opt-in mode passed the initial synthetic tensor and
early-search bounds for Maia 1500 and Good Gyal 7. A later corpus captured
from real Good Gyal searches failed the same policy-logit bound on 6 of 33
inference batches, with maximum error 0.724 against the 0.2 limit.
The value error stayed below 0.000518, but that does not make the policy
failure acceptable. This mode is not generally accuracy-equivalent. It reduces
serialized ONNX size, not the precision or memory cost of GPU computation.
It did not speed up the measured search. Float32 remains the app default.

The subsequent accelerated FP16 investigation also failed real-search tensor
checks, even after widening accumulators, splitting convolutions and retaining
float32 input and output heads. Its best synthetic result was not enough.
The candidate was slower than deployed float32 and has not been enabled.
Reproducible experimental build scripts and the measured failures are recorded
in [DEVELOPMENT.md](./DEVELOPMENT.md#accelerated-fp16-follow-up).

`ready` means the runtime and weights file are available, not that the network
has been loaded. Lc0 loads the network when a search starts. Monitor worker
errors as well as `error` messages. Upstream UCI command and network loading
errors are also sent as `uci` lines beginning with `error `. The worker
normalizes Lc0's `bestmove a1a1` terminal response to UCI's `bestmove 0000`.

## Experimental ONNX converter

The same upstream build can run Lc0's `leela2onnx` command in the browser.
Create `converter-worker.js` as a module worker on a cross-origin-isolated page.
Send `{ type: 'convert', weights: arrayBuffer }` and transfer the buffer.
Add `dataType: 'f16'` for a float16 model. The default is float32 (`'f32'`).
Use `'f16-mixed'` for half-sized weight storage with float32 inputs, outputs
and computation. This adds explicit initializer casts through our checked
upstream patch. It is not upstream's full float16 model.
Mixed conversion requires original weights and rejects already embedded ONNX.
Conversion progress is reported as `log` messages. A successful conversion
returns `{ type: 'converted', output: arrayBuffer }`. Errors use type `error`
with a `message`. Also monitor worker error events and terminate the worker
afterward. Each worker handles one conversion.

The experimental converter is available at `tools/leela2onnx/`. It uses
Lc0's conversion options and needs enough memory for the input and output.
Large transformer networks can exceed the WebAssembly memory limit. BT4-1740
failed conversion with an allocation error in the default 2 GiB build.
With the experimental 4 GiB build, float32 and float16 conversion succeeded,
and an earlier WebGPU search passed the smoke test against Eigen on one machine.
Later large-network search attempts encountered allocation and WebGPU
invalid-buffer errors, so reliable operation at this size is not established.
An opt-in float16 WebGPU search with BT4 later reached 5,003 nodes with two
search threads and a minibatch size of eight on one machine. A float32 run
also passed the same 5,000-node test on that machine. Its first
evaluations and moves on three positions were also compared with Eigen.
This does not establish that float16 resolves the earlier failures or that
the engine will work reliably on other machines.
For two test inputs, the float16 model's ONNX Runtime outputs matched those
of a model converted by the native upstream release. This is not a guarantee
for every position, network architecture, browser, or GPU.

## Smoke test

After installing the dependencies, install Playwright's Chromium browser if
it is not already available:

```powershell
npm exec --prefix app\assets\engines\lc0 -- playwright install chromium
```

Then build and run:

```powershell
node app\assets\engines\lc0\browser-test.mjs
node --test app\assets\engines\lc0\*.test.mjs
```

This tests legal moves, MultiPV, node-limited and interrupted searches, two
simultaneous engines, multiple search threads, two bundled networks, and an
invalid weights file in a cross-origin-isolated browser. It also checks
en passant, promotion, checkmate, Chess960 castling, searchmoves and WDL. One engine runs with
Lc0's default search settings. The test checks concurrent initialization and
the error for a page without cross-origin isolation. It also runs a search
using the app's cross-origin isolation service worker without server-provided
isolation headers. It does not establish performance or correctness for all
networks and positions.
Set `LC0_TEST_WEIGHTS` to an additional local weights file to include it in the
concurrent search test. The test also converts Maia weights in the browser and
checks malformed input. Set `LC0_TEST_CONVERT_WEIGHTS` to test another network.
Set `LC0_TEST_CONVERT_TYPE` to `f16` or `f16-mixed` to test those output formats.
Set `LC0_TEST_ONNX_OUTPUT` to save the resulting model for independent
validation. Set `LC0_TEST_PRIMARY_WEIGHTS` to use another network for the
main search.

For a repeatable comparison with native Lc0, first convert the same weights
to float32 ONNX using the upstream v0.32.1 `leela2onnx` command. Set
`LC0_TEST_REFERENCE_ONNX` to that file and `LC0_TEST_CONVERT_WEIGHTS` to the
weights used for it. The smoke test compares all model outputs on three
inputs with ONNX Runtime WASM. This comparison uses extra memory for both
models and currently supports float32 only.
For a float16 converter comparison on WebGPU, convert the same weights with
native Lc0 using `--onnx-data-type=f16`, set `LC0_TEST_REFERENCE_F16_ONNX`
to that model and set `LC0_TEST_INFERENCE_TYPE=f16`. The browser and native
float16 models must produce identical outputs on the same GPU for three
test inputs. This is separate from the float16 versus float32 accuracy check.

Set `LC0_TEST_PROVIDER` to `wasm` or `webgpu` to test the ONNX backend,
including simultaneous engines. WebGPU tests compare model outputs with the
WASM provider and compare early search results with Eigen on three positions.
Set `LC0_TEST_INFERENCE_TYPE=f16` alongside `LC0_TEST_PROVIDER=webgpu` to
exercise the opt-in float16 inference path. This additionally compares three
input patterns at batches 1, 2 and 16 against a float32 model.
Use `LC0_TEST_INFERENCE_TYPE=f16-mixed` for the mixed path. Both lower-precision
paths also extend early-search parity to seven positions, counting the main
search. `LC0_TEST_EXTENDED_POSITIONS=1` enables the same corpus for float32.
Their unchanged smoke-test bounds allow an
absolute difference of 0.2 for policy logits, 0.01 for other outputs and
10 centipawns for the early search scores. Those bounds are regression checks,
not claims of equivalent playing strength. The float32 checks stay tighter.
A usable GPU adapter
is required. Set `LC0_TEST_BROWSER_ENGINE=firefox` to use Playwright Firefox
instead of Chromium after installing it with
`npm exec --prefix app\assets\engines\lc0 -- playwright install firefox`.
For local Chromium testing,
`LC0_TEST_BROWSER` selects a browser executable and `LC0_TEST_HEADED=1` runs it
visibly. `LC0_TEST_UNSAFE_WEBGPU=1` enables experimental Chromium flags when
needed. These flags are for testing, not deployment requirements.

To compare CPU settings, set `LC0_TEST_NODES`, `LC0_TEST_THREADS`, and
`LC0_TEST_BATCH` before running the smoke test. The result includes wall time
and Lc0's node and NPS reports for the Maia search. The wall time includes
network loading, so compare repeated runs on the same machine and browser.
Set `LC0_TEST_EXACT_NODES=1` to disable Lc0's smart pruning for the main
search and verify that it reaches the requested node count. Otherwise, smart
pruning may stop a node-limited search early.
For longer searches, increase `LC0_TEST_TIMEOUT_MS` from its 45-second
default. Compare providers on the same machine and browser. This smoke test
is not a comprehensive benchmark.
