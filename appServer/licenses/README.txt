A.C.A.S Calculation Server: third-party components

The server's own code is under GNU GPL version 3. Third-party components
keep their own licences. They are not all relicensed under the GPL.

The installer includes LICENSE (GPLv3), THIRD-PARTY-NOTICES.txt,
LICENSE.electron.txt and LICENSES.chromium.html. The source folder contains
the app's corresponding source, lockfile and build scripts, including the
UniversalBoardDrawer copy used by the screen overlay.

Bundled components
------------------
Electron: MIT, with Chromium, Node.js, FFmpeg and other components under
their own terms. Keep both Electron's licence and its complete generated
Chromium notices. Consult those notices for component-specific terms,
including any LGPL source/relinking obligations for the exact build.
https://github.com/electron/electron

electron-store, ws and their production npm dependencies: the generated
THIRD-PARTY-NOTICES.txt includes the installed versions and full upstream
copyright, licence and NOTICE files, including nested dependencies.

Bootstrap Icons 1.10.5 (CSS and icon fonts): MIT.
https://github.com/twbs/icons/tree/v1.10.5

Mona Sans, IBM Plex Sans, Rubik and Whisper: SIL Open Font License 1.1.
The fonts retain that licence, including the Mona Sans and Plex reserved
font names. See ui/fonts/OFL.txt in the source and the generated notices.
https://github.com/github/mona-sans/tree/v1.0
https://github.com/IBM/plex
https://github.com/googlefonts/rubik
https://github.com/googlefonts/whisper

UniversalBoardDrawer 1.3.7 by Haka: GPLv3. The actual copy bundled with
A.C.A.S is included in source, rather than just a link to upstream.
https://github.com/Hakorr/UniversalBoardDrawer

Optional AI downloads, NOT bundled in the installer
--------------------------------------------------
llama.cpp b12633 by the ggml authors: MIT. Its full licence is in these
notices. The official runtime also embeds dependency notices, available
with llama licenses (llama.exe licenses on Windows, not llama-server).
The Windows x64 CPU build's complete embedded notices are included here,
covering LLVM OpenMP, cpp-httplib, BoringSSL and jsonhpp as well.
Other builds can differ. Preserve all licence files shipped in each
runtime archive, including LICENSE-LLVM-OpenMP when present, and review
each backend before redistribution.
https://github.com/ggml-org/llama.cpp/tree/b12633

Inkling 2 Mini by Thinking Machines Lab, with GGUF conversion by
AtomicChat: declared Apache License 2.0. The full
licence is included here. A.C.A.S does not modify the downloaded GGUF.
Default download, the uncensored Inkling GGUF with no adapter:
https://huggingface.co/AtomicChat/Inkling-2-Mini-Uncensored-GGUF/tree/82b34b9b0e5bc2e3e7b6d617ec8cc3e0f9692ee2
Plain base for Pena's optional adapter:
https://huggingface.co/AtomicChat/Inkling-2-Mini-GGUF/tree/4f0c56af7e0c242e620be6394983d245b8c3fd27
Optional Pena adapter: GPLv3 for the Pena-specific contribution, with
upstream Apache-2.0 terms retained. It includes chess-coaching fine-tuning
and OpenUncensored's refusal-removal edit. Do not apply it to an
already-uncensored base. The credits panel includes both licence texts.
https://huggingface.co/Hakorr/Pena/tree/499376296cc03cb4c964bf1a148371f1150ae3f2
Original provider's model card:
https://huggingface.co/thinkingmachines/Inkling-2-Mini/blob/7a67ae2314b44ef05c87fd1d4d311c58aaeb18f6/README.md

IMPORTANT: the original provider also links a Model Acceptable Use Policy.
Its relationship to the Apache grant needs clarification before calling
the entire model stack unrestricted or GPL-compatible. The uncensored
variant does not remove upstream legal obligations.
https://thinkingmachines.ai/model-acceptable-use-policy/

The Windows NVIDIA option downloads CUDA runtime/cuBLAS libraries from
the official llama.cpp release. These are proprietary NVIDIA components,
NOT MIT or GPL. Merely fetching them separately does not settle licence
compatibility, acceptance or redistribution requirements. Review the
terms for each exact CUDA release before redistribution or mirroring.
https://docs.nvidia.com/cuda/eula/index.html

User-selected chess engines, models, adapters and native runtimes are
separate files with their own licences. No third-party engine binary or
Pena LoRA is bundled here. Managed setup downloads the pinned public
base, adapter and runtime into the current user's app data.

See LICENSING.md for the audit scope and remaining release checks.
