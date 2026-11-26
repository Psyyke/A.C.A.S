# Local Calculation Server (for A.C.A.S)

Please visit the GitHub for more details: https://github.com/Psyyke/A.C.A.S

This file includes local hosting setup, platform requirements and dependency licenses.

Open **Settings** with the gear beside the connection status and port. Choose any
of the main app's 42 languages, adjust the server text size, or toggle console
line wrapping. These preferences apply right away and are saved on this computer.
You can also clear the cache here.

GPU acceleration for the server windows is off by default. You can turn it on
in Settings and restart the server to apply the change. This does not change
GPU use by chess engines or Pena.
**Credits & licences** opens a searchable panel for app libraries, fonts,
icons and optional AI downloads. Expand an entry to read its licence or
follow its source links. Chromium notices open as a separate document.
To change the port, save it in Settings. This restarts the server app and stops
running engines, so set the same port in the web GUI to reconnect.

The web app needs server version **1.2.1** or newer. It shows a dismissible update
floaty when an older server connects, including legacy servers that do not report
their version. The warning links to the latest release and appears only once per
page visit. It closes automatically when a compatible server connects.

On Windows and Linux, closing the main window stops the server and its Ghost
overlays too. The Windows `run_dev_loop.bat` can then reopen it after a second.
On macOS, closing the window keeps the app running as usual.

File picker titles use the chosen language, while system-provided controls and
backend diagnostic details may still appear in English.

## Adding engines

Drop one or more local engine executables into the server window, or use
**Add engine binary**. Before checking dropped files, the server asks for
confirmation because the check runs them. Only use files you trust. It sends
`uci` and adds programs that reply with `uciok` within 15 seconds. The check
stops the process afterwards. On Linux and macOS it may add owner execute
permission, just like launching an engine normally.

A failed check does not always mean an engine is incompatible. It might need
extra files or launch options, or take longer to start. You can still add it
with the file picker. Files stay in their original locations.
On Windows, run the server as a normal user. Windows can block drops from
Explorer if the server is running as administrator. Close an elevated server
and start it normally before trying again.

## Pena AI (native GGUF)

One web GUI can open separate engine and Pena connections. The server announces
the first connection and the final disconnect, and only counts engine or board
connections toward the multiple-GUI warning.

Open **AI** beside the server status in the Electron window and press **Download Pena**. The web
GUI has the same button. The server then does everything by itself:

* Picks a pinned official [llama.cpp](https://github.com/ggml-org/llama.cpp/releases)
  build (`b12633`). Windows NVIDIA gets CUDA 13.5 (driver 580+) or CUDA 12.4
  (driver 551+), AMD and Intel get Vulkan, Apple Silicon gets Metal, and
  everything else gets the CPU build. Linux uses Vulkan on every vendor.
* Downloads the runtime and the uncensored Inkling 2 Mini (8.67 GB) into this
  computer's app user-data folder under `pena`, and runs it with no LoRA.
  In local tests the published [Pena chess LoRA](https://huggingface.co/Hakorr/Pena)
  misread piece geometry far more often than Inkling on its own, so it's
  opt-in now. To use it, pick its matching plain base
  (`Inkling-2-Mini-AD-IQ2_M.gguf` from AtomicChat/Inkling-2-Mini-GGUF) and the
  LoRA in **Advanced**. Never pair the LoRA with the uncensored model, since
  the adapter already carries the refusal-removal edit.
  No developer files, Hugging Face account or manually selected
  model paths are needed for the default.
  Existing installs fetch only the changed files. Downloads resume after a
  pause or a dropped connection, and every file is checked against its
  pinned SHA-256 before use.
* Unpacks the runtime, starts it and remembers to start Pena on the next launch.
  Launching never downloads anything by itself.

Errors show up as toasts in the app server and in the web GUI. The web GUI can
only ask for this pinned setup or pause it, never choose files.
**Stop** unloads the model, cancels inference and turns off the automatic start.
Quit cleans up the owned native process; closing the window on macOS leaves the
app running.

### Advanced

**Advanced** lets you run your own **llama-server executable** and GGUF model,
plus an optional GGUF LoRA trained for that exact base model. Custom files are
used when both a runtime and a model are chosen. **Use Pena's download** clears
them again. Context, GPU layers, threads and the backend choice apply to both.
For Pena's download, the backend decides which build gets downloaded (pick
**CPU only** if your GPU driver cannot run it).

**Graphics memory** is Automatic by default, so there's nothing to set up. Pena
asks llama-server how much memory your graphics card has and picks a mode for
Inkling. Cards with 14 GB or more run at full speed with no extra flags. 12, 10, 8
and 6 GB cards keep part of Inkling in system RAM to leave room for ZONOS3,
trading speed for lower VRAM use. The 8 GB mode keeps 20 of its 24 expert blocks in RAM to
leave room for prompt-processing peaks. These are allocation presets, not hard
VRAM limits: larger contexts, custom models/adapters or other GPU applications
can still exhaust memory. If the size can't be read, Pena uses the 8 GB
mode and says so. If llama-server still dies while loading, Pena tries again one
mode smaller and remembers that until the app restarts. You can pick a mode by
hand here too. Other models stay at full speed unless you pick one. The numbers
behind each mode are in `PENA-12GB-PLAN.md`.

For your own build, keep its required libraries beside the executable:

* Windows/Linux NVIDIA: CUDA build plus compatible NVIDIA driver/runtime.
* Windows/Linux AMD (or other supported GPUs): Vulkan build plus working Vulkan
  drivers. Actual device/model support depends on that build.
* macOS: Metal build on supported Apple hardware; select the actual executable,
  not a `.app` bundle. Unix binaries need execute permission. Signing/quarantine
  and library issues must be resolved by the user.
* CPU: select a CPU-compatible executable and **CPU only** (zero GPU layers).

With custom files, **Backend** labels the selected build; it cannot add
CUDA/Vulkan/Metal support to an executable. **Automatic** infers a label only
when its path contains a backend name. Defaults request 99 GPU layers, automatic flash
attention, one inference slot and 8,192 context tokens. Lower context/GPU layers
if memory is insufficient; threads zero uses the runtime default. Native builds
supporting `--flash-attn auto`, `--jinja`, `--offline`, `--no-webui` and
`--log-disable` and `--reasoning-budget` are required. A model's architecture, quantization, chat template
and LoRA must all be supported by the selected build: “GGUF” alone does **not**
guarantee compatibility. No cross-platform/model certification
is implied.

Only the trusted Electron main-frame UI can configure executable/model/adapter
paths via IPC. The native HTTP server binds
`127.0.0.1` on an OS-selected free port, with a private per-launch API key.
Inherited `LLAMA_*` overrides are removed, offline mode is enabled and native
stdout/stderr are discarded. The existing origin-validated WebSocket server
proxies inference; browsers need no native HTTP/CORS access. Allowed origins
are exactly `http://localhost` and `https://acaschess.com`. Origin checks
are not authentication against programs already running on your computer.
Older installed servers need rebuilding or updating before the app on
`https://acaschess.com/app/` can connect. Local development still uses
`http://localhost/A.C.A.S/app/`.

### WebSocket AI protocol

Connect to the existing Calculation Server WebSocket port (default 2800).
Messages use a nonempty string `requestId` (maximum 128 characters):

```js
{type: 'ai', action: 'status', requestId: 'status-1'}
{type: 'ai', action: 'setup', requestId: 'setup-1'}        // download if needed, then start
{type: 'ai', action: 'cancelSetup', requestId: 'setup-2'}  // pause a download
{type: 'ai', action: 'promptInfo', requestId: 'count-1',
 messages: [{role: 'user', content: 'Hello'}],
 chat_template_kwargs: {enable_thinking: false}}
{type: 'ai', action: 'generate', requestId: 'chat-1',
 options: {messages: [{role: 'user', content: 'Hello'}],
           max_tokens: 256, temperature: 0.7,
           chat_template_kwargs: {enable_thinking: false}}}
{type: 'ai', action: 'cancel', requestId: 'chat-1'}
```

Replies have `type: 'ai'`, the matching `requestId`, and:

* `phase: 'status'`: `state`/`status` (`ready`, `loading`, `offline`), `ready`,
  `error`, `model`/`lora` basenames, `context`, `modelInfo` and `capabilities`.
  `setup` adds `installed`, `busy`, `phase` (`checking`, `downloading`,
  `verifying`, `unpacking`, `starting`, `idle`), `progress` (0 to 1),
  `received`/`total` bytes, `downloadBytes` and the last setup `error`.
  State changes are also pushed with `requestId: null`. Bounded GGUF metadata
  inspection identifies architecture/Inkling identity even after renaming the
  model (for example, `atomic-iq2-m.gguf`); `modelInfo.identitySource` distinguishes
  metadata from a filename-only fallback hint. Backend/family detection is not
  proof of runtime support or provenance, and never certifies LoRA compatibility.
* `phase: 'promptInfo'`: `tokens`, `context`; uses native `/apply-template`
  with `add_generation_prompt:true`, then `/tokenize` with `add_special:false`.
  Pass the same messages/template kwargs **and top-level** `reasoning_effort`/
  `reasoning_budget_tokens` as generation. Alternatively pass the identical
  generation `options` object on `promptInfo`. These controls can change the
  rendered prompt even when the messages/kwargs are unchanged. No prompt is returned.
* `phase: 'chunk'`: `chunk` is unchanged parsed OpenAI SSE JSON, including
  reasoning deltas, prompt progress, usage and timings when supplied. Consumers
  must not display/speak `reasoning_content` as the visible answer.
* `phase: 'complete'`: `text` (content deltas only), `finishReason`, optional
  `usage`/`timings`; cancellation returns `cancelled:true`, empty `text`, and
  `finishReason:'cancelled'`. Retain previously received chunks if desired.
* `phase: 'error'`: `error` and `message` contain a human-readable reason.
  Empty visible completions fail with `code:'NO_VISIBLE_ANSWER'`, preserving
  `finishReason`, native `usage` and `timings` when supplied instead of returning
  a misleading successful empty answer.

Generation accepts text-only `system`/`user`/`assistant` messages, `max_tokens`
(or `max_completion_tokens`), `temperature`, `top_p`, `top_k`, `min_p`,
`repeat_penalty`, presence/frequency penalties, `seed`, `stop`,
`chat_template_kwargs`, `reasoning_effort`, `reasoning_budget_tokens` and
`return_progress`, `timings_per_token`, and `stream_options.include_usage`
(default true). `stream`, `model`, `cache_prompt` are tolerated for client
compatibility, but streaming is always on, the Electron-selected model is used,
and prompt caching is off. Reasoning options are forwarded, not simulated;
support depends on the build/template. No arbitrary extra options, file paths,
URLs, tool calls, grammar files, or native launch configuration are accepted.
Output is limited to min(8,192, context) tokens; payloads to 512 KiB, 256 messages
and 450,000 content characters. One generation runs at a time. Cancel uses the
original request ID and produces that request's terminal response; disconnect
aborts all requests owned by that socket. Startup has a three-minute health
timeout and at most three attempts for early native exits/port-bind races.

Native reasoning defaults to a zero-token budget. For metadata-identified
Inkling, a request for no thinking is normalized to its supported template
control (`chat_template_kwargs.reasoning_effort:'none'`); the generic
`enable_thinking:false`/top-level `reasoning_effort` override is removed for that
family to keep the native template effort intact. Standard `inkling2` retains
an explicit zero sampler budget. Only `inkling2_loop` receives 16 tokens of
per-thinking-block headroom even when the client requests zero, matching the
loop variant's no-thinking requirement. No messages/evidence are changed.
`capabilities.noThinkingBudgetTokens` reports the effective zero/16 policy.
The same normalization is applied to
`promptInfo`, including its top-level messages/kwargs schema. Other models'
reasoning parameters are forwarded unchanged.

### AtomicChat loop-model validation

AtomicChat's IQ2_M file uses `inkling2_loop`, not the standard `inkling2`
architecture. A loop-compatible native build is required. Local Windows CUDA
validation successfully loaded this architecture and returned a real greeting.
The native sampler treats `-1` as unlimited and zero as immediately forcing a
thinking-block end; it re-arms for later blocks. Zero is not silently unlimited,
but repeated immediately closed blocks can consume the entire output budget.
The loop-only 16-token headroom avoids that no-answer behavior.

The unchanged Italian development-fixture PCF input had exactly 6,397 native
prompt tokens at context 8,192. With client no-thinking/zero controls normalized
to the loop policy and `max_tokens:512`, raw SSE returned 16 reasoning chunks
(54 characters), then 467 visible chunks (1,198 characters), a final `stop`,
and 490 generated tokens total. Native prefill took 5.97 seconds, generation
8.21 seconds and the WebSocket request 14.19 seconds overall. This is a verified
visible final completion, **not** a universal ten-second latency guarantee or
a coaching-quality study. The fixture used a synthetic test-style search
snapshot; no engine experiment, training change or evidence modification was
performed. Any future LoRA must match the exact base and be verified separately.
No machine-specific runtime is bundled into the app or installer.

Focused native hosting tests (no runtime/model download):
`node --test tests/server-native-ai.test.mjs`.

## Developing / Building

The easiest way to make an installer is the build script for your system. It
grabs a private copy of Node.js into a `.node` folder if yours is missing or too
old, installs the build tools and packages the app into `dist/`. Nothing else
needs to be installed.

* **Windows:** double-click `build.bat`. It asks for admin rights, because the
  packaging tools unpack files that Windows only allows admins to create. You get
  an NSIS installer.
* **macOS:** double-click `build.command`, or run `sh build.sh` in Terminal. You
  get a `.dmg` and a `.zip`.
* **Linux:** run `sh build.sh` in a terminal. You get an AppImage, plus a `.deb`
  when your system has the tools for it.

Each system can only build its own installer, so build the Mac one on a Mac and
the Linux one on Linux.

For development, Node.js 22.12 or newer is required. From the `appServer`
directory, on Windows, macOS, or Linux:

1. `npm ci`
2. `npm start`

On Windows, `run_dev_loop.bat` also starts the development server and restarts
it when it closes. Open it normally rather than from an administrator terminal.
Installed builds need to be rebuilt and reinstalled to include source changes.

`npm run build` also packages for the current system. Windows gets an NSIS
installer, macOS gets a `.dmg` and a `.zip`, and Linux gets an AppImage and a
`.deb`. The other batch files are just Windows shortcuts.

### Platform status

The Electron application targets Windows, macOS, and desktop Linux, not every
operating system. Windows native startup and WebSocket communication are tested
locally. macOS and Linux builds aren't signed or notarized, so macOS may ask you
to allow the app in System Settings the first time. They still need hands-on
testing, so source-level checks aren't a promise that everything works there.

Use an engine binary built for your OS and CPU. Unix engines often have no file
extension; select the executable itself, not a macOS `.app` bundle. Windows
`.bat`/`.cmd` wrappers are not supported. On Unix, the server adds owner execute
permission when needed; OS quarantine, signing, or missing-library errors may
still need to be resolved separately. Always on Top depends on the window manager
(particularly on Linux/Wayland).

On macOS, closing the last window leaves the app and server running; reopening
from the Dock restores the window. Quit the app to stop its engines and server.

With the root development test dependencies installed, run
`node --test tests/server-platform.test.mjs` from the repository root on each OS
to check native Electron startup, WebSocket replies, and window pinning using an
isolated temporary configuration.

In the engine console, the clock button cycles through full timestamps,
seconds and milliseconds, two-digit seconds, and hidden timestamps. The choice
applies to all consoles and is remembered when the server restarts.

The pin button beside the collapse button toggles Always on Top for the current
window. Pinning keeps the Calculation Server above other normal windows until
you unpin it or close the app.

The log-only button beside the pin hides console titles, controls, and command
inputs. Click it again to restore them. It also applies to newly opened consoles.

Running processes and lifecycle notifications show the engine name, site domain,
and profile instead of internal instance IDs. Older web clients without site
metadata show "Unknown site"; update the web GUI and relaunch the engine to show
the domain.

## Warning

This program hosts a local WebSocket server on your computer. While local servers are safer than public ones, please keep in mind that hosting a server is never risk free.

(Licenced with GPLv3, this program comes with ABSOLUTELY NO WARRANTY!)

## Dependencies

The server bundles Electron, electron-store, ws, Bootstrap Icons, Mona Sans,
Rubik, Whisper, IBM Plex Sans and a local copy of UniversalBoardDrawer for
the screen overlay. Production npm dependency notices are collected from the
installed packages on every build. Browser-only chess engines and libraries
are not part of this installer.

Installed copies include `THIRD-PARTY-NOTICES.txt`, the full GPL in `LICENSE`,
Electron and Chromium notices, and the app's matching source and build files
under `source`. Fonts and third-party libraries keep their own licences.

Optional AI setup downloads llama.cpp and the Inkling GGUF separately.
NVIDIA CUDA libraries have proprietary terms. Inkling's original provider
links an acceptable-use policy alongside its Apache-2.0 declaration, which
needs clarification before calling the entire model stack GPL-compatible.

See [the licensing check](LICENSING.md) for verified versions, sources,
attribution requirements and the remaining release checks. No extra font
credit screen is normally needed, but licence notices must accompany copies.

## License

GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright © 2007 Free Software Foundation, Inc. <https://fsf.org/>

Everyone is permitted to copy and distribute verbatim copies of this license document, but changing it is not allowed.

Preamble
The GNU General Public License is a free, copyleft license for software and other kinds of works.

The licenses for most software and other practical works are designed to take away your freedom to share and change the works. By contrast, the GNU General Public License is intended to guarantee your freedom to share and change all versions of a program--to make sure it remains free software for all its users. We, the Free Software Foundation, use the GNU General Public License for most of our software; it applies also to any other work released this way by its authors. You can apply it to your programs, too.

When we speak of free software, we are referring to freedom, not price. Our General Public Licenses are designed to make sure that you have the freedom to distribute copies of free software (and charge for them if you wish), that you receive source code or can get it if you want it, that you can change the software or use pieces of it in new free programs, and that you know you can do these things.

To protect your rights, we need to prevent others from denying you these rights or asking you to surrender the rights. Therefore, you have certain responsibilities if you distribute copies of the software, or if you modify it: responsibilities to respect the freedom of others.

For example, if you distribute copies of such a program, whether gratis or for a fee, you must pass on to the recipients the same freedoms that you received. You must make sure that they, too, receive or can get the source code. And you must show them these terms so they know their rights.

Developers that use the GNU GPL protect your rights with two steps: (1) assert copyright on the software, and (2) offer you this License giving you legal permission to copy, distribute and/or modify it.

For the developers' and authors' protection, the GPL clearly explains that there is no warranty for this free software. For both users' and authors' sake, the GPL requires that modified versions be marked as changed, so that their problems will not be attributed erroneously to authors of previous versions.

Some devices are designed to deny users access to install or run modified versions of the software inside them, although the manufacturer can do so. This is fundamentally incompatible with the aim of protecting users' freedom to change the software. The systematic pattern of such abuse occurs in the area of products for individuals to use, which is precisely where it is most unacceptable. Therefore, we have designed this version of the GPL to prohibit the practice for those products. If such problems arise substantially in other domains, we stand ready to extend this provision to those domains in future versions of the GPL, as needed to protect the freedom of users.

Finally, every program is threatened constantly by software patents. States should not allow patents to restrict development and use of software on general-purpose computers, but in those that do, we wish to avoid the special danger that patents applied to a free program could make it effectively proprietary. To prevent this, the GPL assures that patents cannot be used to render the program non-free.

The precise terms and conditions for copying, distribution and modification follow.

TERMS AND CONDITIONS
0. Definitions.
“This License” refers to version 3 of the GNU General Public License.

“Copyright” also means copyright-like laws that apply to other kinds of works, such as semiconductor masks.

“The Program” refers to any copyrightable work licensed under this License. Each licensee is addressed as “you”. “Licensees” and “recipients” may be individuals or organizations.

To “modify” a work means to copy from or adapt all or part of the work in a fashion requiring copyright permission, other than the making of an exact copy. The resulting work is called a “modified version” of the earlier work or a work “based on” the earlier work.

A “covered work” means either the unmodified Program or a work based on the Program.

To “propagate” a work means to do anything with it that, without permission, would make you directly or secondarily liable for infringement under applicable copyright law, except executing it on a computer or modifying a private copy. Propagation includes copying, distribution (with or without modification), making available to the public, and in some countries other activities as well.

To “convey” a work means any kind of propagation that enables other parties to make or receive copies. Mere interaction with a user through a computer network, with no transfer of a copy, is not conveying.

An interactive user interface displays “Appropriate Legal Notices” to the extent that it includes a convenient and prominently visible feature that (1) displays an appropriate copyright notice, and (2) tells the user that there is no warranty for the work (except to the extent that warranties are provided), that licensees may convey the work under this License, and how to view a copy of this License. If the interface presents a list of user commands or options, such as a menu, a prominent item in the list meets this criterion.

1. Source Code.
The “source code” for a work means the preferred form of the work for making modifications to it. “Object code” means any non-source form of a work.

A “Standard Interface” means an interface that either is an official standard defined by a recognized standards body, or, in the case of interfaces specified for a particular programming language, one that is widely used among developers working in that language.

The “System Libraries” of an executable work include anything, other than the work as a whole, that (a) is included in the normal form of packaging a Major Component, but which is not part of that Major Component, and (b) serves only to enable use of the work with that Major Component, or to implement a Standard Interface for which an implementation is available to the public in source code form. A “Major Component”, in this context, means a major essential component (kernel, window system, and so on) of the specific operating system (if any) on which the executable work runs, or a compiler used to produce the work, or an object code interpreter used to run it.

The “Corresponding Source” for a work in object code form means all the source code needed to generate, install, and (for an executable work) run the object code and to modify the work, including scripts to control those activities. However, it does not include the work's System Libraries, or general-purpose tools or generally available free programs which are used unmodified in performing those activities but which are not part of the work. For example, Corresponding Source includes interface definition files associated with source files for the work, and the source code for shared libraries and dynamically linked subprograms that the work is specifically designed to require, such as by intimate data communication or control flow between those subprograms and other parts of the work.

The Corresponding Source need not include anything that users can regenerate automatically from other parts of the Corresponding Source.

The Corresponding Source for a work in source code form is that same work.

2. Basic Permissions.
All rights granted under this License are granted for the term of copyright on the Program, and are irrevocable provided the stated conditions are met. This License explicitly affirms your unlimited permission to run the unmodified Program. The output from running a covered work is covered by this License only if the output, given its content, constitutes a covered work. This License acknowledges your rights of fair use or other equivalent, as provided by copyright law.

You may make, run and propagate covered works that you do not convey, without conditions so long as your license otherwise remains in force. You may convey covered works to others for the sole purpose of having them make modifications exclusively for you, or provide you with facilities for running those works, provided that you comply with the terms of this License in conveying all material for which you do not control copyright. Those thus making or running the covered works for you must do so exclusively on your behalf, under your direction and control, on terms that prohibit them from making any copies of your copyrighted material outside their relationship with you.

Conveying under any other circumstances is permitted solely under the conditions stated below. Sublicensing is not allowed; section 10 makes it unnecessary.

3. Protecting Users' Legal Rights From Anti-Circumvention Law.
No covered work shall be deemed part of an effective technological measure under any applicable law fulfilling obligations under article 11 of the WIPO copyright treaty adopted on 20 December 1996, or similar laws prohibiting or restricting circumvention of such measures.

When you convey a covered work, you waive any legal power to forbid circumvention of technological measures to the extent such circumvention is effected by exercising rights under this License with respect to the covered work, and you disclaim any intention to limit operation or modification of the work as a means of enforcing, against the work's users, your or third parties' legal rights to forbid circumvention of technological measures.

4. Conveying Verbatim Copies.
You may convey verbatim copies of the Program's source code as you receive it, in any medium, provided that you conspicuously and appropriately publish on each copy an appropriate copyright notice; keep intact all notices stating that this License and any non-permissive terms added in accord with section 7 apply to the code; keep intact all notices of the absence of any warranty; and give all recipients a copy of this License along with the Program.

You may charge any price or no price for each copy that you convey, and you may offer support or warranty protection for a fee.

5. Conveying Modified Source Versions.
You may convey a work based on the Program, or the modifications to produce it from the Program, in the form of source code under the terms of section 4, provided that you also meet all of these conditions:

a) The work must carry prominent notices stating that you modified it, and giving a relevant date.
b) The work must carry prominent notices stating that it is released under this License and any conditions added under section 7. This requirement modifies the requirement in section 4 to “keep intact all notices”.
c) You must license the entire work, as a whole, under this License to anyone who comes into possession of a copy. This License will therefore apply, along with any applicable section 7 additional terms, to the whole of the work, and all its parts, regardless of how they are packaged. This License gives no permission to license the work in any other way, but it does not invalidate such permission if you have separately received it.
d) If the work has interactive user interfaces, each must display Appropriate Legal Notices; however, if the Program has interactive interfaces that do not display Appropriate Legal Notices, your work need not make them do so.
A compilation of a covered work with other separate and independent works, which are not by their nature extensions of the covered work, and which are not combined with it such as to form a larger program, in or on a volume of a storage or distribution medium, is called an “aggregate” if the compilation and its resulting copyright are not used to limit the access or legal rights of the compilation's users beyond what the individual works permit. Inclusion of a covered work in an aggregate does not cause this License to apply to the other parts of the aggregate.

6. Conveying Non-Source Forms.
You may convey a covered work in object code form under the terms of sections 4 and 5, provided that you also convey the machine-readable Corresponding Source under the terms of this License, in one of these ways:

a) Convey the object code in, or embodied in, a physical product (including a physical distribution medium), accompanied by the Corresponding Source fixed on a durable physical medium customarily used for software interchange.
b) Convey the object code in, or embodied in, a physical product (including a physical distribution medium), accompanied by a written offer, valid for at least three years and valid for as long as you offer spare parts or customer support for that product model, to give anyone who possesses the object code either (1) a copy of the Corresponding Source for all the software in the product that is covered by this License, on a durable physical medium customarily used for software interchange, for a price no more than your reasonable cost of physically performing this conveying of source, or (2) access to copy the Corresponding Source from a network server at no charge.
c) Convey individual copies of the object code with a copy of the written offer to provide the Corresponding Source. This alternative is allowed only occasionally and noncommercially, and only if you received the object code with such an offer, in accord with subsection 6b.
d) Convey the object code by offering access from a designated place (gratis or for a charge), and offer equivalent access to the Corresponding Source in the same way through the same place at no further charge. You need not require recipients to copy the Corresponding Source along with the object code. If the place to copy the object code is a network server, the Corresponding Source may be on a different server (operated by you or a third party) that supports equivalent copying facilities, provided you maintain clear directions next to the object code saying where to find the Corresponding Source. Regardless of what server hosts the Corresponding Source, you remain obligated to ensure that it is available for as long as needed to satisfy these requirements.
e) Convey the object code using peer-to-peer transmission, provided you inform other peers where the object code and Corresponding Source of the work are being offered to the general public at no charge under subsection 6d.
A separable portion of the object code, whose source code is excluded from the Corresponding Source as a System Library, need not be included in conveying the object code work.

A “User Product” is either (1) a “consumer product”, which means any tangible personal property which is normally used for personal, family, or household purposes, or (2) anything designed or sold for incorporation into a dwelling. In determining whether a product is a consumer product, doubtful cases shall be resolved in favor of coverage. For a particular product received by a particular user, “normally used” refers to a typical or common use of that class of product, regardless of the status of the particular user or of the way in which the particular user actually uses, or expects or is expected to use, the product. A product is a consumer product regardless of whether the product has substantial commercial, industrial or non-consumer uses, unless such uses represent the only significant mode of use of the product.

“Installation Information” for a User Product means any methods, procedures, authorization keys, or other information required to install and execute modified versions of a covered work in that User Product from a modified version of its Corresponding Source. The information must suffice to ensure that the continued functioning of the modified object code is in no case prevented or interfered with solely because modification has been made.

If you convey an object code work under this section in, or with, or specifically for use in, a User Product, and the conveying occurs as part of a transaction in which the right of possession and use of the User Product is transferred to the recipient in perpetuity or for a fixed term (regardless of how the transaction is characterized), the Corresponding Source conveyed under this section must be accompanied by the Installation Information. But this requirement does not apply if neither you nor any third party retains the ability to install modified object code on the User Product (for example, the work has been installed in ROM).

The requirement to provide Installation Information does not include a requirement to continue to provide support service, warranty, or updates for a work that has been modified or installed by the recipient, or for the User Product in which it has been modified or installed. Access to a network may be denied when the modification itself materially and adversely affects the operation of the network or violates the rules and protocols for communication across the network.

Corresponding Source conveyed, and Installation Information provided, in accord with this section must be in a format that is publicly documented (and with an implementation available to the public in source code form), and must require no special password or key for unpacking, reading or copying.

7. Additional Terms.
“Additional permissions” are terms that supplement the terms of this License by making exceptions from one or more of its conditions. Additional permissions that are applicable to the entire Program shall be treated as though they were included in this License, to the extent that they are valid under applicable law. If additional permissions apply only to part of the Program, that part may be used separately under those permissions, but the entire Program remains governed by this License without regard to the additional permissions.

When you convey a copy of a covered work, you may at your option remove any additional permissions from that copy, or from any part of it. (Additional permissions may be written to require their own removal in certain cases when you modify the work.) You may place additional permissions on material, added by you to a covered work, for which you have or can give appropriate copyright permission.

Notwithstanding any other provision of this License, for material you add to a covered work, you may (if authorized by the copyright holders of that material) supplement the terms of this License with terms:

a) Disclaiming warranty or limiting liability differently from the terms of sections 15 and 16 of this License; or
b) Requiring preservation of specified reasonable legal notices or author attributions in that material or in the Appropriate Legal Notices displayed by works containing it; or
c) Prohibiting misrepresentation of the origin of that material, or requiring that modified versions of such material be marked in reasonable ways as different from the original version; or
d) Limiting the use for publicity purposes of names of licensors or authors of the material; or
e) Declining to grant rights under trademark law for use of some trade names, trademarks, or service marks; or
f) Requiring indemnification of licensors and authors of that material by anyone who conveys the material (or modified versions of it) with contractual assumptions of liability to the recipient, for any liability that these contractual assumptions directly impose on those licensors and authors.
All other non-permissive additional terms are considered “further restrictions” within the meaning of section 10. If the Program as you received it, or any part of it, contains a notice stating that it is governed by this License along with a term that is a further restriction, you may remove that term. If a license document contains a further restriction but permits relicensing or conveying under this License, you may add to a covered work material governed by the terms of that license document, provided that the further restriction does not survive such relicensing or conveying.

If you add terms to a covered work in accord with this section, you must place, in the relevant source files, a statement of the additional terms that apply to those files, or a notice indicating where to find the applicable terms.

Additional terms, permissive or non-permissive, may be stated in the form of a separately written license, or stated as exceptions; the above requirements apply either way.

8. Termination.
You may not propagate or modify a covered work except as expressly provided under this License. Any attempt otherwise to propagate or modify it is void, and will automatically terminate your rights under this License (including any patent licenses granted under the third paragraph of section 11).

However, if you cease all violation of this License, then your license from a particular copyright holder is reinstated (a) provisionally, unless and until the copyright holder explicitly and finally terminates your license, and (b) permanently, if the copyright holder fails to notify you of the violation by some reasonable means prior to 60 days after the cessation.

Moreover, your license from a particular copyright holder is reinstated permanently if the copyright holder notifies you of the violation by some reasonable means, this is the first time you have received notice of violation of this License (for any work) from that copyright holder, and you cure the violation prior to 30 days after your receipt of the notice.

Termination of your rights under this section does not terminate the licenses of parties who have received copies or rights from you under this License. If your rights have been terminated and not permanently reinstated, you do not qualify to receive new licenses for the same material under section 10.

9. Acceptance Not Required for Having Copies.
You are not required to accept this License in order to receive or run a copy of the Program. Ancillary propagation of a covered work occurring solely as a consequence of using peer-to-peer transmission to receive a copy likewise does not require acceptance. However, nothing other than this License grants you permission to propagate or modify any covered work. These actions infringe copyright if you do not accept this License. Therefore, by modifying or propagating a covered work, you indicate your acceptance of this License to do so.

10. Automatic Licensing of Downstream Recipients.
Each time you convey a covered work, the recipient automatically receives a license from the original licensors, to run, modify and propagate that work, subject to this License. You are not responsible for enforcing compliance by third parties with this License.

An “entity transaction” is a transaction transferring control of an organization, or substantially all assets of one, or subdividing an organization, or merging organizations. If propagation of a covered work results from an entity transaction, each party to that transaction who receives a copy of the work also receives whatever licenses to the work the party's predecessor in interest had or could give under the previous paragraph, plus a right to possession of the Corresponding Source of the work from the predecessor in interest, if the predecessor has it or can get it with reasonable efforts.

You may not impose any further restrictions on the exercise of the rights granted or affirmed under this License. For example, you may not impose a license fee, royalty, or other charge for exercise of rights granted under this License, and you may not initiate litigation (including a cross-claim or counterclaim in a lawsuit) alleging that any patent claim is infringed by making, using, selling, offering for sale, or importing the Program or any portion of it.

11. Patents.
A “contributor” is a copyright holder who authorizes use under this License of the Program or a work on which the Program is based. The work thus licensed is called the contributor's “contributor version”.

A contributor's “essential patent claims” are all patent claims owned or controlled by the contributor, whether already acquired or hereafter acquired, that would be infringed by some manner, permitted by this License, of making, using, or selling its contributor version, but do not include claims that would be infringed only as a consequence of further modification of the contributor version. For purposes of this definition, “control” includes the right to grant patent sublicenses in a manner consistent with the requirements of this License.

Each contributor grants you a non-exclusive, worldwide, royalty-free patent license under the contributor's essential patent claims, to make, use, sell, offer for sale, import and otherwise run, modify and propagate the contents of its contributor version.

In the following three paragraphs, a “patent license” is any express agreement or commitment, however denominated, not to enforce a patent (such as an express permission to practice a patent or covenant not to sue for patent infringement). To “grant” such a patent license to a party means to make such an agreement or commitment not to enforce a patent against the party.

If you convey a covered work, knowingly relying on a patent license, and the Corresponding Source of the work is not available for anyone to copy, free of charge and under the terms of this License, through a publicly available network server or other readily accessible means, then you must either (1) cause the Corresponding Source to be so available, or (2) arrange to deprive yourself of the benefit of the patent license for this particular work, or (3) arrange, in a manner consistent with the requirements of this License, to extend the patent license to downstream recipients. “Knowingly relying” means you have actual knowledge that, but for the patent license, your conveying the covered work in a country, or your recipient's use of the covered work in a country, would infringe one or more identifiable patents in that country that you have reason to believe are valid.

If, pursuant to or in connection with a single transaction or arrangement, you convey, or propagate by procuring conveyance of, a covered work, and grant a patent license to some of the parties receiving the covered work authorizing them to use, propagate, modify or convey a specific copy of the covered work, then the patent license you grant is automatically extended to all recipients of the covered work and works based on it.

A patent license is “discriminatory” if it does not include within the scope of its coverage, prohibits the exercise of, or is conditioned on the non-exercise of one or more of the rights that are specifically granted under this License. You may not convey a covered work if you are a party to an arrangement with a third party that is in the business of distributing software, under which you make payment to the third party based on the extent of your activity of conveying the work, and under which the third party grants, to any of the parties who would receive the covered work from you, a discriminatory patent license (a) in connection with copies of the covered work conveyed by you (or copies made from those copies), or (b) primarily for and in connection with specific products or compilations that contain the covered work, unless you entered into that arrangement, or that patent license was granted, prior to 28 March 2007.

Nothing in this License shall be construed as excluding or limiting any implied license or other defenses to infringement that may otherwise be available to you under applicable patent law.

12. No Surrender of Others' Freedom.
If conditions are imposed on you (whether by court order, agreement or otherwise) that contradict the conditions of this License, they do not excuse you from the conditions of this License. If you cannot convey a covered work so as to satisfy simultaneously your obligations under this License and any other pertinent obligations, then as a consequence you may not convey it at all. For example, if you agree to terms that obligate you to collect a royalty for further conveying from those to whom you convey the Program, the only way you could satisfy both those terms and this License would be to refrain entirely from conveying the Program.

13. Use with the GNU Affero General Public License.
Notwithstanding any other provision of this License, you have permission to link or combine any covered work with a work licensed under version 3 of the GNU Affero General Public License into a single combined work, and to convey the resulting work. The terms of this License will continue to apply to the part which is the covered work, but the special requirements of the GNU Affero General Public License, section 13, concerning interaction through a network will apply to the combination as such.

14. Revised Versions of this License.
The Free Software Foundation may publish revised and/or new versions of the GNU General Public License from time to time. Such new versions will be similar in spirit to the present version, but may differ in detail to address new problems or concerns.

Each version is given a distinguishing version number. If the Program specifies that a certain numbered version of the GNU General Public License “or any later version” applies to it, you have the option of following the terms and conditions either of that numbered version or of any later version published by the Free Software Foundation. If the Program does not specify a version number of the GNU General Public License, you may choose any version ever published by the Free Software Foundation.

If the Program specifies that a proxy can decide which future versions of the GNU General Public License can be used, that proxy's public statement of acceptance of a version permanently authorizes you to choose that version for the Program.

Later license versions may give you additional or different permissions. However, no additional obligations are imposed on any author or copyright holder as a result of your choosing to follow a later version.

15. Disclaimer of Warranty.
THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM “AS IS” WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

16. Limitation of Liability.
IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

17. Interpretation of Sections 15 and 16.
If the disclaimer of warranty and limitation of liability provided above cannot be given local legal effect according to their terms, reviewing courts shall apply local law that most closely approximates an absolute waiver of all civil liability in connection with the Program, unless a warranty or assumption of liability accompanies a copy of the Program in return for a fee.

END OF TERMS AND CONDITIONS

How to Apply These Terms to Your New Programs
If you develop a new program, and you want it to be of the greatest possible use to the public, the best way to achieve this is to make it free software which everyone can redistribute and change under these terms.

To do so, attach the following notices to the program. It is safest to attach them to the start of each source file to most effectively state the exclusion of warranty; and each file should have at least the “copyright” line and a pointer to where the full notice is found.

    <one line to give the program's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
Also add information on how to contact you by electronic and paper mail.

If the program does terminal interaction, make it output a short notice like this when it starts in an interactive mode:

    <program>  Copyright (C) <year>  <name of author>
    This program comes with ABSOLUTELY NO WARRANTY; for details type `show w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type `show c' for details.
The hypothetical commands `show w' and `show c' should show the appropriate parts of the General Public License. Of course, your program's commands might be different; for a GUI interface, you would use an “about box”.

You should also get your employer (if you work as a programmer) or school, if any, to sign a “copyright disclaimer” for the program, if necessary. For more information on this, and how to apply and follow the GNU GPL, see <https://www.gnu.org/licenses/>.

The GNU General Public License does not permit incorporating your program into proprietary programs. If your program is a subroutine library, you may consider it more useful to permit linking proprietary applications with the library. If this is what you want to do, use the GNU Lesser General Public License instead of this License. But first, please read <https://www.gnu.org/licenses/why-not-lgpl.html>.
