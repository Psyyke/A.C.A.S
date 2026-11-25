# Local server licensing check

Checked on 24 November 2026. This is an engineering review, not legal advice
or a certification of every upstream binary.

## Result

The server's own code can stay GPLv3. The inspected npm packages use MIT,
BSD-2-Clause, BSD-3-Clause or ISC, with an MIT option for type-fest.
These are compatible with GPLv3 when their notices are retained.

The fonts stay under SIL OFL 1.1 and can be bundled with the app. Do not
relicense the fonts as GPL or use reserved font names for modified fonts.
Apache-2.0 components can be used with GPLv3, unlike GPLv2-only.
See the [FSF licence list](https://www.gnu.org/licenses/license-list.html)
and the actual licence texts, not just package metadata.

**The optional AI stack is not fully cleared for release.** NVIDIA CUDA is
proprietary, and the original Inkling model card links an acceptable-use
policy alongside its Apache-2.0 declaration. Notices do not resolve those
questions.

## What ships

| Component | Licence and action |
| --- | --- |
| A.C.A.S server and bundled UniversalBoardDrawer | GPLv3. Include the licence and the actual corresponding source, not just a link to a moving branch. |
| Electron 45.2.3 | MIT plus its Chromium, Node.js, FFmpeg and other dependency terms. Keep `LICENSE.electron.txt` and the complete `LICENSES.chromium.html`. |
| electron-store 11.0.2, ws 8.22.1 and production npm dependencies | Full installed licence and NOTICE files are collected at build time, including nested packages. |
| Bootstrap Icons 1.10.5, including both WOFF files | MIT. The CSS banner alone is not the full permission notice. Added the upstream text. |
| Mona Sans, IBM Plex Sans, Rubik, Whisper | OFL 1.1. Preserve copyright and reserved-name notices. |

The Mona Sans file matches
[upstream v1.0](https://github.com/github/mona-sans/tree/v1.0) byte for byte.
Its upstream licence reserves **Mona Sans**, not just Mona. Corrected that
notice and retained the embedded Deni Anggara copyright. Added the installed
IBM font's 2019 copyright alongside the existing upstream 2017 notice.
Rubik and Whisper's embedded copyrights match the existing notices.
No font binaries were modified.

The server README previously listed browser-only chess engines and libraries.
Those are outside this server installer. User-selected engine binaries are
not copied into it and need their own licensing checks if you distribute them.
Build tools such as electron-builder are not shipped as runtime dependencies.
Keep upstream notices if you separately distribute a development environment.

## What AI setup downloads

The current managed model is **not Qwythos or Meta Llama**. llama.cpp is the
runtime project's name, not the model's licence.

* [llama.cpp b12633](https://github.com/ggml-org/llama.cpp/tree/b12633):
  MIT. Inspected the SHA-256-verified Windows x64 CPU release and its source.
  `llama.exe licenses` displays its embedded notices for llama.cpp, LLVM
  OpenMP, cpp-httplib, BoringSSL and jsonhpp. Those notices are included in
  the app's notice bundle. The archive's separate OpenMP licence is retained
  by setup. This does not certify every CUDA, Vulkan, Linux or macOS binary.
* [AtomicChat's plain Inkling GGUF](https://huggingface.co/AtomicChat/Inkling-2-Mini-GGUF/tree/4f0c56af7e0c242e620be6394983d245b8c3fd27):
  the managed base for Pena's published LoRA. Its pinned repository has an
  Apache-2.0 `LICENSE` and no separate `NOTICE` file. A.C.A.S downloads the
  GGUF unchanged.
* [Pena's chess LoRA](https://huggingface.co/Hakorr/Pena/tree/499376296cc03cb4c964bf1a148371f1150ae3f2):
  the Pena-specific contribution is GPLv3. The adapter includes chess-coaching
  fine-tuning and OpenUncensored's refusal-removal edit, so it must be paired
  with the matching plain base, not an already-uncensored one. The server's
  credits preserve the GPL and upstream Apache-2.0 texts. Publication does
  not settle the original provider's policy caveat below.
* [Original model card](https://huggingface.co/thinkingmachines/Inkling-2-Mini/blob/7a67ae2314b44ef05c87fd1d4d311c58aaeb18f6/README.md):
  Thinking Machines Lab declares Apache-2.0 but also links its
  [Model Acceptable Use Policy](https://thinkingmachines.ai/model-acceptable-use-policy/).
  That policy purports to impose use restrictions and to apply to modified
  models too. Obtain clarification about its relationship to the Apache
  grant before describing the weights or a derived LoRA as unrestricted
  or wholly GPL-compatible. AtomicChat's declaration alone does not settle it.
* Windows CUDA 12.4/13.5 runtime and cuBLAS archives: **NVIDIA proprietary
  terms**, not MIT or GPL. Review the
  [12.4 EULA](https://docs.nvidia.com/cuda/archive/12.4.0/eula/index.html)
  and the terms accompanying the actual 13.5 files. The 13.5.0 archived EULA
  URL returned 404 during this check. The
  [current NVIDIA EULA](https://docs.nvidia.com/cuda/eula/index.html) is a
  reference, not proof of the exact 13.5 grant. Do not mirror or bundle these
  libraries until their redistribution and end-user requirements are checked.

Running a separately downloaded native process is not the same as linking
CUDA into the GPL Electron application, but process separation alone is not
a blanket legal clearance. Automatic downloads also do not establish that
end users have accepted NVIDIA's terms.

## Where names and licences must appear

For the inspected MIT, BSD, ISC and OFL components, readable accompanying
files are normally sufficient. They do not generally require logos, credit
buttons or a mandatory attribution page in the installer. Preserve full
copyright, permission, disclaimer and any NOTICE text, not just a list of names.
Do not imply endorsement.

Apache-2.0 requires a licence copy and preservation of applicable notices.
If an upstream distribution supplies `NOTICE`, preserve its applicable
attributions. Mark your own modified files. Before publishing a Pena adapter,
record its exact base revision, changes, licence and training-data permissions.
An adapter does not erase the base model's obligations.

NSIS already displays the GPL during installation. A GPL installer screen is
not a substitute for installed copies, corresponding source, or separate
third-party terms. CUDA may require a separate terms/acceptance flow after
the exact applicable terms are established.

## Packaging safeguards added

Every electron-builder invocation runs `scripts/prepare-licenses.cjs`.
It rejects unreviewed npm licence identifiers, installed/locked metadata
mismatches, missing npm licence texts and missing Electron notices.
It reads full upstream text rather than manufacturing copyright lines.

Installed files include `LICENSE`, `THIRD-PARTY-NOTICES.txt`,
`LICENSE.electron.txt`, `LICENSES.chromium.html`, this document and a `source`
folder. On macOS these extra files live inside the app's `Contents` folder.
The source folder preserves the layout of `appServer` and
`userscript-components/UniversalBoardDrawer.js`, including actual JS, assets,
the lockfile and build scripts. From its `appServer` folder use `npm ci` and
`npm run build`, or the platform build script.

You can generate notices without making an installer:

```
node appServer/scripts/prepare-licenses.cjs
```

Generated files live in `appServer/.licenses` and are refreshed for each build.
The same build step creates `credits.json` for **Settings > Credits & licences**.
It is bundled as an app resource so licence text is readable offline.
Development builds generate it when the panel is opened. Chromium's notice
document opens separately through a fixed native file handler.
The AI runtime/model remain separate optional downloads. The notice bundle
is shipped with the app regardless of which backend a user selects.

## Before publishing a release

1. Resolve the Inkling AUP/Apache ambiguity and the exact CUDA redistribution
   and user-acceptance requirements. Do not call the whole download stack GPL.
2. Verify each shipped platform's actual Electron/FFmpeg build. LGPL-covered
   components can require corresponding library source, build instructions
   and replacement/relinking rights. An HTML notice file alone is not enough.
   The included `source` folder covers A.C.A.S, not all Electron dependencies.
3. Keep the matching upstream source/build materials available for any
   components whose terms require them. Do not remove library replacement
   rights or impose extra reverse-engineering restrictions.
4. Publish a matching source download beside each installer for convenient
   network access, and retain the bundled source. Check the release really
   contains the notices and sources on each target platform.
5. Re-audit when changing fonts, native builds, model revisions or adapters.
   Check any new upstream `NOTICE` files and backend-specific libraries too.
6. Rebuild installers. Existing files in `dist` are not updated by this audit.

## Verification

The focused licensing and existing AI setup suites passed, 9 tests total:

```
node --test tests/server-licensing.test.mjs tests/pena-setup.test.mjs
```

A temporary Windows x64 unpacked build completed through electron-builder's
actual `beforePack` hook. Its installed notices covered all 23 production
dependency records. GPL, Electron, Chromium, font, icon and AI notice files
were present. Sampled packaged source and build inputs matched the working
files byte for byte, including UniversalBoardDrawer and the package lockfile.
This was a packaging check, not a rebuilt release installer or a macOS/Linux
test.

This review did not certify all native backends, model training provenance,
patent/export obligations, artwork provenance, or every Chromium dependency.
The checker catches common packaging regressions, not all legal obligations.
