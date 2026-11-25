# Pena VRAM modes: full speed on big cards, still fits on small ones

Short version: Pena picks a mode from how much memory the graphics card has. Cards with 14 GB or more keep today's settings, which are already the fastest we measured. Smaller cards move parts of Inkling into system RAM, just enough to fit next to ZONOS3 and a future LoRA. Nothing slows down unless the card actually needs it.

The card size comes from the same llama-server that runs Pena, so NVIDIA, AMD, Intel and Mac are all read the same way. If it still can't be read, Pena plays it safe with the 8 GB mode and says so, instead of guessing big and running out.

Status: built. It lives in `appServer\backend\nativeAI.js` with tests in `tests\server-native-ai.test.mjs`. On top of the steps below, Automatic mode also retries one mode smaller when llama-server dies while loading, and remembers that until the app restarts. The steps stay here as a map of how it works.

## What was measured

Test machine: RTX 4070 Ti SUPER (16 GB), Ryzen 7 7800X3D, 31 GB RAM, llama.cpp b12633 CUDA 13, `Inkling-2-Mini-Uncensored-AD-IQ2_M.gguf`, ZONOS3 in Chrome over WebGPU, and an 8192 token context. Every row below runs Inkling and ZONOS3 together with a rank 64 attention LoRA loaded. VRAM is the whole card, sampled with `nvidia-smi` every 100 ms. "Above idle" subtracts what the desktop was already using, so it is what Pena itself needs.

| Card | Mode | Above idle (MiB) | Prompt tok/s | Writing tok/s | Time to first words* |
|---|---|---|---|---|---|
| 14 GB or more | `fast` | 11378 | 960 | 51 | about 2.5 s |
| 11 to 13 GB | `12` | 8890 | 761 | 42 | about 3 s |
| 9.5 to 11 GB | `10` | 7113 | 617 | 19 | about 4 s |
| 7.5 to 9.5 GB | `8` | 6215 | 104 | 23 | about 20 s |
| under 7.5 GB | `6` | 3805 | 69 | 18 | about 30 s |

\*For a fresh 2,000 token prompt plus the first 20 words. Follow-up turns reuse the cached prompt, so they start faster.

Without the LoRA, `fast` writes at about 57 tok/s. ZONOS speaks at about 0.12 seconds per second of audio in every mode, so the voice keeps up everywhere. Speech only needs about 4 tok/s, so for read-aloud the prompt speed matters more than the writing speed.

Things that did not help the fast mode: `-ub 1024` read prompts slower (946 tok/s) and used 900 MB more, and `-ub 2048` was slower still (755 tok/s) and used 3 GB more. Today's defaults stay as they are.

## How the memory works

Inkling has 24 physical blocks and runs each one 3 times per token. About 1 GB is attention and embeddings, and about 7 GB is expert weights, roughly 280 MB per block.

- `--n-cpu-moe N` keeps the experts of the first N blocks in system RAM. Values above 24 do nothing extra.
- With op offload on (the default), llama.cpp copies CPU experts to the GPU when it reads a prompt. That keeps prompts fast, but the copy buffer grows as weights leave. From 6 to 18 blocks Inkling stays at about 7.2 GB, and it only drops to about 5.4 GB once all 24 blocks are on the CPU. So only 6 and 24 are worth using with op offload.
- `--no-op-offload` skips that copy. VRAM then falls steadily, but prompts get about 5 to 10 times slower. That is only worth it on 8 GB and 6 GB cards, where nothing else fits.
- `--cache-type-k q8_0 --cache-type-v q8_0` halves the context cache, and `-ub 256` trims the scratch buffer.
- `--load-mode none` loads CPU experts into normal RAM instead of memory mapping them. Prompts got 15 to 25% faster in offload modes. It needs that much free RAM, which is about 7 GB in mode `6`.

## The LoRA

- Train it on attention only: `attn_q`, `attn_k`, `attn_v`, `attn_output`, `attn_gate`. Rank 64 is about 67 MB and changed VRAM by less than the measurement noise. It costs about 10% writing speed.
- Avoid expert LoRAs. Rank 16 on the experts would be about 800 MB and would break the small modes.
- For maximum speed in a release, merge the LoRA into the full precision model, then quantize it again to IQ2_M with the same imatrix. A merged model has no LoRA cost at all.

## Steps to build it

Do these in order and run the tests at the end.

1. **Modes.** In `appServer\backend\nativeAI.js`, add this above `buildLlamaArgs`:
   ```js
   const LOW_VRAM_BASE = ['--batch-size', '1024', '--ubatch-size', '256',
       '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--load-mode', 'none'];
   export const VRAM_MODES = Object.freeze({
       fast: [],
       12: [...LOW_VRAM_BASE, '--n-cpu-moe', '6'],
       10: [...LOW_VRAM_BASE, '--n-cpu-moe', '24'],
       8: [...LOW_VRAM_BASE, '--n-cpu-moe', '16', '--no-op-offload'],
       6: [...LOW_VRAM_BASE, '--n-cpu-moe', '24', '--no-op-offload']
   });
   export function vramModeFor(totalMiB) {
       if(totalMiB === null) return null;
       if(totalMiB === 0 || totalMiB >= 14000) return 'fast';
       if(totalMiB >= 11000) return '12';
       if(totalMiB >= 9500) return '10';
       if(totalMiB >= 7500) return '8';
       return '6';
   }
   ```
   `null` means the size could not be read. `0` means llama-server found no GPU at all, so it runs on the CPU and there is nothing to shrink.
2. **Setting.** Add `vramMode: 'auto'` to `AI_DEFAULTS`. In `normalizeAISettings`, copy `settings.vramMode` when it is defined, then throw `Unknown VRAM mode.` unless it is `'auto'` or a key of `VRAM_MODES`.
3. **Detection.** Ask the runtime itself. `llama-server --verbose --list-devices` prints every GPU it can use on stdout, like `CUDA0: NVIDIA GeForce RTX 4070 Ti SUPER (16375 MiB, 15111 MiB free)` or `Vulkan0: ...`, for CUDA, Vulkan (AMD, Intel, NVIDIA) and Metal alike. With `--verbose`, the Vulkan backend also prints `ggml_vulkan: 1 = AMD Radeon(TM) Graphics ... | uma: 1 |` on stderr, and `uma: 1` marks an integrated GPU. llama.cpp skips integrated GPUs whenever a discrete one exists (`src/llama.cpp`, "add integrated GPUs only if no discrete GPUs were found"), so the detector must skip them too. This matters: on the test machine the Ryzen iGPU reports 16480 MiB of shared RAM, more than the real card. Add this to `nativeAI.js` and import `execFile` from `node:child_process`:
   ```js
   export function parseDeviceMemory(stdout, stderr) {
       if(!String(stdout).includes('Available devices:')) return null;
       const integrated = new Set([...String(stderr).matchAll(/ggml_vulkan: (\d+) = .*\| uma: 1 \|/g)]
           .map(match => `Vulkan${match[1]}`));
       const devices = [...String(stdout).matchAll(/^\s+(\S+): .+ \((\d+) MiB, \d+ MiB free\)\s*$/gm)]
           .map(([, name, total]) => ({ name, totalMiB: Number(total), integrated: integrated.has(name) }));
       const discrete = devices.filter(device => !device.integrated);
       return Math.max(0, ...(discrete.length ? discrete : devices).map(device => device.totalMiB));
   }
   function readNvidiaMemory() {
       return new Promise(resolve => execFile('nvidia-smi',
           ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
           { timeout: 8000, windowsHide: true },
           (error, stdout) => resolve(error ? null : Number(String(stdout).split(/\r?\n/)[0]) || null)));
   }
   export function detectGpuMemory(executablePath) {
       return new Promise(resolve => execFile(executablePath, ['--verbose', '--list-devices'],
           { cwd: path.dirname(executablePath), env: runtimeEnvironment(executablePath),
               timeout: 15000, windowsHide: true, maxBuffer: 1 << 20 },
           (error, stdout, stderr) => resolve(parseDeviceMemory(stdout, stderr))))
           .then(total => total ?? readNvidiaMemory());
   }
   ```
   Ignore the exit code and always parse stdout. `nvidia-smi` is only a backup for a custom runtime that can't list devices. Pass it into `NativeAIHost` as a new `readGpuMemory = detectGpuMemory` dependency, next to `readModelInfo`. Keep the two names different, because `readGpuMemory = readGpuMemory` in a default parameter throws.
4. **Pick the mode.** In `NativeAIHost.start`, right after `readModelInfo`, add:
   ```js
   this.vramGuessed = false;
   if(normalized.backend === 'cpu' || (normalized.vramMode === 'auto' && !this.modelInfo?.inkling))
       this.vramMode = 'fast';
   else if(normalized.vramMode !== 'auto') this.vramMode = normalized.vramMode;
   else {
       this.vramMode = vramModeFor(await this.dependencies.readGpuMemory(normalized.executablePath));
       if(!this.vramMode) { this.vramMode = '8'; this.vramGuessed = true; }
   }
   ```
   The block counts only fit Inkling, so other models stay on `fast` unless the user picks a mode by hand. When the size can't be read at all, `8` is the safe pick. It fits 8 GB cards and everything bigger, and on a big card it is slower but still works. That beats crashing or spilling into shared memory on a small one.
5. **Flags.** Give `buildLlamaArgs` a fourth parameter `vramMode = 'fast'` and end it with `args.push(...VRAM_MODES[vramMode])` before `return`. Pass `this.vramMode` from `start`. Add `vramMode: this.vramMode || 'fast'` and `vramGuessed: Boolean(this.vramGuessed)` to the object returned by `status()`.
6. **Advanced setting.** In `appServer\ui\index.html`, inside `<div class="ai-options">`, add `<label>Graphics memory<select id="ai-vram-mode"><option value="auto">Automatic</option><option value="fast">16 GB or more</option><option value="12">12 GB</option><option value="10">10 GB</option><option value="8">8 GB</option><option value="6">6 GB</option></select></label>`. In `appServer\ui\js\localAI.js`, add `vramMode: document.getElementById('ai-vram-mode')` to `inputs`. It is a string, so the existing load and save code works unchanged. In `render`, append `· ${status.vramMode} GB mode` to the ready text when `status.vramMode` is not `fast`. When `status.vramGuessed` is true, use this ready text instead: `Couldn't read your graphics memory, so Pena is using the 8 GB mode. Pick yours under Graphics memory for more speed.`
7. **Tests.** In `tests\server-native-ai.test.mjs`, check these:
   - `vramModeFor` gives `fast` for 0, 16376 and 24564, `12` for 12282 and 11264, `10` for 10240, `8` for 8188, `6` for 6144, and `null` for `null`.
   - `parseDeviceMemory` gives 16061 for a Vulkan NVIDIA card plus a bigger `uma: 1` iGPU, 8176 when the iGPU is listed first and the discrete card second, 7900 for an iGPU only laptop, 21845 for `MTL0: Apple M2 Pro (21845 MiB, ...)`, 0 for `Available devices:` followed by `(none)`, and `null` for empty output.
   - `buildLlamaArgs` with `fast` has no `--n-cpu-moe` and no `--cache-type-k`.
   - Mode `8` includes `--n-cpu-moe 16` and `--no-op-offload`.
   - `normalizeAISettings({ vramMode: '7' })` throws.
   - A host with `readGpuMemory: async () => 12282` and an Inkling model spawns with `--n-cpu-moe 6`. The same host with a non Inkling model spawns without it. `readGpuMemory` receives the executable path.
   - A host with `readGpuMemory: async () => null` and an Inkling model spawns with `--n-cpu-moe 16` and `--no-op-offload`, and `status().vramGuessed` is true.
8. **Docs.** Add a short note about Graphics memory to `appServer\README.md`.
9. **Check.** Run `node --test tests\server-native-ai.test.mjs`. On a GPU machine, run `node tests\pena-vram-bench.cjs` with each mode's flags in `args` and `"mode":"both"`. Results go to `temp\pena-vram-bench\results.jsonl`. `peakAboveIdleMiB` should stay close to the table, and card size minus 1.5 GB of desktop minus 0.4 GB of margin should be larger than it.

## If a mode still runs out

- `8`: move to `--n-cpu-moe 20`. It measured 4727 MiB and 72 tok/s prompts.
- `12`: add `--ubatch-size 128` to save about 250 MB more.
- `10`: add `--ubatch-size 64` to save about 370 MB more.
- Any mode: a smaller context, such as 4096, saves part of the 512 MB cache.

## Nice extras for later

- On 8 GB and 6 GB cards, offer "faster replies, browser voice". Without ZONOS, those cards can use mode `10` flags, which read prompts at about 500 to 600 tok/s instead of 70 to 100.
- Show the picked mode with a small hint in the Pena settings, so people know why Pena is slower.
- If llama-server exits while loading in Automatic mode, try once more one mode smaller before showing the error. That catches desktops that use far more VRAM than the 1.5 GB the table assumes. (Done.)

## Not tested yet

- Real 6, 8, 10 and 12 GB cards. These numbers come from a 16 GB card. The desktop and browser can use more or less memory on yours, which is why each mode keeps some slack.
- Answer quality with the q8 cache. It is usually close to identical, but nobody has compared Pena's replies yet.
- The real LoRA. The rank 64 test LoRA had the same shape but untrained weights.
- AMD and Intel cards running Pena. Detection was checked with the real Vulkan build on the test machine, which found the RTX card and skipped the Ryzen iGPU, but no AMD or Intel card has loaded Inkling yet.
- Macs. Metal reports its working set limit as the device size, so a 16 GB Mac lands in mode `10`. That seems sensible for shared memory but is unmeasured.
- Two discrete GPUs. The detector uses the biggest one, and llama.cpp spreads Inkling across both.
- Lots of cancel and restart cycles.
