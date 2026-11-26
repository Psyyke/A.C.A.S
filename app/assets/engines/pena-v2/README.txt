PENA V2 - SHIPPED APP RUNTIME

RUNTIME
  Pena uses the A.C.A.S local calculation server for native AI inference.
  app-worker.js prepares chess evidence and streams requests through local-ai.js
  over the existing loopback WebSocket port. It never loads an LLM in the browser.
  Choose llama-server, a chat-capable GGUF model and an optional compatible GGUF
  LoRA in the local server's AI section. CUDA, Vulkan and Metal are native build
  choices for supported NVIDIA, AMD/Intel and macOS hardware respectively.
  The selected executable must support the model's architecture and GGUF layout.
  See appServer/README.md for setup, compatibility and runtime requirements.
  A selected model's own chat template and tokenizer determine the final budget.
  Inkling retains its evidence-first trained layout. Other models receive standard
  chat messages with the same chess evidence, not Inkling-specific token markers.
  Startup, disconnects and errors are shown rather than using a browser fallback.
  Phones and tablets hide and disable Pena regardless of imported settings.
  Speech, microphone processing and chess evidence helpers remain in the GUI.
  No conversations are written to settings or logs. A native prompt cache can
  remain in memory until the AI stops, and OS-level recovery is not ruled out.
  Coaching prompts favor explaining ideas and tradeoffs over announcing a best
  move. With "Don't give away moves" enabled, unsolicited move suggestions are
  held back from the answer, speech and teaching. Ask for a move to see one.
  Only your own moves count. Your opponent's threats, and the forced line that
  follows if you ignore one, stay in the answer because they are the lesson.
  After a move is withheld, "I want it" and "yes please" reveal it for that
  position. A bare "What?" keeps the offer without giving the move away.
  This does not turn the setting off, and a new topic or board clears the offer.
  If you asked something and the whole answer was the move, Pena says so in its
  own words and lets you ask for the move when you want it. If an automatic
  reply was only a move, the bubble doesn't just vanish. It shows a short grey
  line saying the setting kept the move back. A question whose answer got fully
  filtered out gets a grey line too. Grey lines are only shown, never read aloud.
  If a reply contains bracketed text that does not match the supplied evidence,
  Pena shows the reply with a warning icon. Hover over it for details.
  Screen readers can read the warning too. Bracketed prose can trigger it.
  The reply is not verified.
  Move detection is heuristic and may miss unusual wording. Board teaching
  resolves visual cues from the answer against the current position. It does
  not verify the model's advice or guarantee that a strategic claim is correct.
  The observed board is authoritative even if rapid moves leave gaps in history.
  Chess coaching (on by default, top of Conversation in the Pena settings) is
  the one switch for all of this. On, Pena gets the English board, live thought
  notes and engine verdicts, Stockfish checks his suggested moves at depth 12,
  and board filters clean the answer. Off, the question goes to the plain model
  as plain chat with raw: true. It gets only the System prompt and the
  recent chat, never the board or a FEN. No engines, app notes, filters or move checks
  run, nothing is said without being asked, and the other Conversation switches
  are locked. The old Move checking and What Pena sees settings are gone.
  System prompt still controls the character. Temperature, thinking effort and
  Max thinking tokens stay editable. Auto uses low effort in plain mode, and
  manual effort stays as selected without coaching retries.
  The evidence switches only ever shaped the PCF/LoRA input, and that keeps its
  full defaults.
  New positions cancel stale preparation, engine evidence, native replies, speech
  and drawings. Board events update Pena immediately, with polling as a fallback.
  Each new board starts fresh, so Pena doesn't see its replies from older
  positions there and won't just repeat them. If a reply still puts a piece on
  a square it already left, that sentence is quietly dropped. The same goes
  for a sentence copied almost word for word from a reply at another position.
  A sentence that misreads the board geometry goes too, like a bishop said to
  guard a pawn it can't reach, or a pinned pawn said to be stuck when it can
  still step along the pin.
  Saying a piece looks at or eyes a square counts too, when nothing lines up.
  Pena follows the newest open match. If a tab drops its connection and comes
  back with the same game, it gets its own chat back and an unchanged board
  gets no new comment. Other tabs and new games start with an empty chat, so
  one match never borrows the conversation of another.
  This also applies to plain chat and small talk: their turns and app follow-up
  notes stay with that game's in-memory chat. New chat drops current and older
  exchanges before building the next prompt, even when the board is unchanged.
  Pena also leaves out who is winning or better unless you ask, since other A.C.A.S
  features already show that. Ask "who's winning?" or "how am I doing" to hear it.
  "Only talk when asked" prevents automatic replies. Turning it on also cancels
  an automatic reply already in progress. Turning on "Don't give away moves"
  cancels pending unsolicited advice, but an explicit move question still works.
  Pena speaks casually as an AI chess coach, without claiming to be human.
  coaching-policy.js is active. The worker adds its policy to system messages,
  including custom prompts, with an extra restriction when moves are withheld.
  Plain Inkling (no LoRA) gets the board as short English sentences instead of
  PCF codes. Each piece gets one line with what it attacks, what it guards, who
  hits it, who defends it and, for the side to move, its legal moves. The last
  move played is spelled out too when the previous board is available. The
  original Stockfish lines and notes stay. Extra PCF evidence such as LC0,
  Maia, BinProps and detailed conditional positions is not sent on this path.
  english-board.js builds it, and every fact comes from the rules, not the model.
  Live thought evidence. When plain Inkling thinks on the English path, Pena
  watches its thoughts for moves it imagines, like "if Bf8 then Rd5". It pauses
  right there, adds a short rule-checked note about that future board into the
  thinking, and lets the same thought carry on. So Inkling doesn't get every
  possible future position up front, it gets facts about the ones it actually
  thinks about. thought-injection.js does this, with thought-questions.js
  answering little self-questions like "is e5 defended?".
  Notes come with a quick Stockfish 19 lite look (verdict-engine.js, depth 12,
  a few milliseconds per search in a nested worker). Stockfish 19 lite is a lot
  faster than Stockfish 8 here and doesn't miss anything Pena needs. The engine
  never just hands over a best move. Each verdict carries a board reason, what
  the punishing reply hits, what a line wins, what a move threatens or which
  threat it stops. The private reminder asks Inkling to explain WHY in board
  terms, since "it develops" or "it controls the center" isn't a reason. Pena
  is a coach, the rest of A.C.A.S already shows engine moves.
  When thinking settles on a move nobody checked, it gets one last look, and a
  mistake there earns a short rethink. Once every move the player asked about
  has its note, thinking wraps up sooner, which made compare questions about a
  third faster in local runs. Open questions like "what should I watch out
  for?" also get a threat check on the current board early in the thinking,
  what the opponent would play if it were their move and what it hits or wins.
  When nothing wins material, the note says so, so Inkling doesn't invent a
  threat. Answers drop talk about notes, checks and "the
  supplied evidence". With "Don't give away moves" on, notes don't name the
  better move. This needs the app server's raw completion action. An older
  server just falls back to the normal reply, and the userscript is unaffected.
  These are small local samples, so treat the speedups as rough.
  Past, present and future. Notes always say which board they're about. A move
  that was already played gets a "game history" note, a move Inkling imagines
  gets a "board after" note, and "right now" or "currently" get the current
  board. Plain "now" counts as the current board too, unless a move, a line
  or a look back sits nearby (then it means that other board), or it reads
  "just now", "until now" or "now that". If a thought could mean more than
  one board and the facts differ,
  Pena stays quiet rather than risk putting a fact on the wrong board. Older
  moves are only described in the past tense, and the same note is never
  injected twice. thought-time.js does this.
  Move claims. Inkling sometimes reads a note and then says something else
  anyway, like "...Re5 can be taken by the bishop on d5" when the bishop can't
  take it. move-claims.js watches for claims about what a named move does
  ("X can be taken by Y", "X hits the rook on e7", "X gives up the pressure on
  c6") and replays them on every board the move could mean: the real board,
  the line being discussed, and boards after moves named just before. A claim
  only counts as wrong when it's wrong on all of them, so a true claim about
  an imagined line stays quiet. In the thinking, a wrong claim gets a short
  correction right after the sentence. In the answer, the sentence is dropped.
  Run over about 4000 saved Inkling thoughts and answers, it flagged 12, and
  each one was a real mistake checked by hand. It reads common phrasings only,
  so plenty of wrong claims still slip past.
  Answers also lose bare evidence ids like "F1:", "L1/L2" or a cut-off
  "(F7, F11", and "the supplied lines" becomes "the engine lines".
  Bigger picture notes (english-strategy.js) are opt-in with the strategy
  option of englishCoachingInput and off by default. BinProp pattern tests pick
  the topics (development early on, space, tied-down defenders, king activity
  with queens off) and each one comes with exact board reasons. In two small
  hand-checked A/B rounds they didn't make answers better overall. They helped
  a "watch out" question but added a few new mistakes and id leaks elsewhere,
  and the evidence header already carries open files, weak pawns, breaks and
  king safety. So they stay off until a bigger test says otherwise.
  The English board is used for every model now, including questions about
  earlier moves. Those questions get a "Moves so far" line plus rule-checked
  past-tense notes for any earlier move they name, and the graded game
  timeline notes still come along. A LoRA was trained on PCF, so only with a
  LoRA loaded does Pena keep PCF. On the PCF path the live worker also adds a short rule-checked piece ledger
  beside the latest question. Knight questions with named squares get complete
  geometric controls for those squares, clearly marked as hypothetical rather
  than played moves, on both paths. The reminder is included in the prompt
  budget and leaves the trained PCF payload alone. Raw FEN is never sent.
  Hypothetical knight attacks, square lists and explicit jumps are checked too.
  A knight on d5 cannot attack d8, and a queen claimed on c3 must really be a
  queen on the discussed board. Rejected sentences stay out of speech and chat
  memory, and appear in the checks list instead.
  These are bounded checks, not a guarantee that generated advice is factual.
  Free-form reasoning can still get ownership, strategy or an unrecognized
  phrasing wrong. A LoRA learns the format, not a reliable chess rules engine.
  "From d5 it eyes e6" counts as a knight claim when the question asked about
  a knight on d5. Pronoun targets only reach back inside their own sentence.
  In a small local A/B on one position (54 replies, fixed seeds), Inkling 2
  Mini with pena-lora.gguf misplaced knight targets in about a third of replies
  without the reminder, and the plain model almost never did. Adding a raw FEN
  didn't help. If geometry slips keep showing up, try the model without the
  LoRA first, then retrain the LoRA on geometry-checked answers.
  Teaching binds named sides, guard relationships, pin victims and pawn chains
  to actual pieces and geometry. Active piece-to-piece actions resolve an
  unnamed target against the actor's side, while defensive wording keeps allied
  targets. Passive wording, explicit owners and ambiguous targets are handled
  separately, so a clear reference wins and uncertain ones stay unhighlighted.
  Suggestions do not relocate explicitly named live pieces in their later
  explanations. Observed pawn pushes can be recapped
  from the verified preceding board rather than guessed from the new position.
  The latest player question supplies referents for follow-up wording like
  "it is hanging". Later mentions resolve individually, including file-pawns,
  and repeated highlights renew their own lifetime rather than fading early.
  Strategic recipes cover the vocabulary of all 30 BinProp families using
  grounded square regions, labels and relations. These show explanatory
  witnesses, not the BinProp score or proof that the model's claim is true.
  Each sentence also keeps the evidence tags the model wrote next to it
  (cited-evidence.js). Those tags pick which line a move belongs to and help
  tell pieces apart, but they never draw anything on their own, so hidden
  moves stay hidden. On 5,000 saved replies about 96.7% of annotated squares,
  pieces and moves land correctly with tags, 91.4% from evidence alone and
  87.5% from prose alone. Concepts sit near 90%.
  A vague subject keeps the piece it was bound to, except that a pawn concept
  like "it's isolated" can't belong to a queen and goes to the one pawn that fits.
  Live cues also work without a GUI drawer and reach the Ghost Script overlay.
  Square highlights use the local server's accepted drawing format.
  Labels stay above square highlights and arrows, including later markings.
  Ghost fades keep their original timing and remove shapes before cancelling
  their animations, so a finished highlight does not flash back into view.
  Future consequences use the labelled GUI preview with Follow Line enabled.
  They are not drawn over the unchanged external live board.
  Preview navigation floats below the board without resizing the instance.
  Speech waits at most one second for existing drawings when changing between
  preview and live positions, so a long drawing lifetime won't stall the reply.
  Changing positions clears the previous board's drawings.
  Plan and threat cues use their own before-board. Generic definitions use
  labelled example positions, with final relations on the final example board.
  Ambiguous actors, missing historical frames and unsupported claims remain
  unresolved rather than receiving invented arrows. Full concept coverage is
  not certified, and highlighted words alone are not an accuracy measurement.
  The local UniversalBoardDrawer is version 1.3.8. Its errors are available
  through lastError and an optional onError callback, without console output.
  The userscript uses its quiet diagnostic collector for drawer errors too.
  Publish the updated library on Greasy Fork before distributing the userscript.
  Its acasv=3 cache key does not publish the local library by itself.

VOICE
  Read aloud starts on by default. The speaker button can turn it off, and
  Pena remembers your choice.
  ZONOS3 is the default voice when no choice is saved. It runs locally in a
  WebGPU browser and downloads about 900 MiB of model data from Hugging Face
  when selected, with progress shown in Voice settings and the Pena window.
  When Pena starts with read aloud on, the voice begins loading right away,
  next to the chat model, so it's usually ready by the first answer.
  Cancel loading in Voice settings or switch voice modes to stop it. If needed,
  loading starts again when Pena speaks. The browser may cache the model and
  may remove it when storage is low.
  Speech text stays in the browser. The download host still sees the requests.
  GPU memory is shared with the local AI and other applications. If WebGPU is
  unavailable, runs out of memory or its device is lost, Pena reports this and
  uses the browser voice. Other errors are reported rather than hidden.
  Stopping an in-progress download or generation releases the voice runtime.
  Turning Pena off or switching voice modes releases it as well.
  Thaddeus is the default ZONOS3 voice. Choose from ZONOS3's supplied voices,
  or import a voice clip you have permission to use. Existing
  voice choices stay selected and are shared across boards. Imported clips stay
  in this browser and can be removed in settings.
  Imported clips must be at most 60 seconds and 12 MiB. The first use of the
  an imported clip downloads a roughly 43 MiB speaker encoder and
  uses more GPU memory.
  Board teaching uses short speech clips so visual cues appear with their words.
  Short clause subjects stay with their verbs rather than becoming tiny clips.
  A lone word like "so" or "is", an article, or a move number like "12." joins
  the phrase it leads into, both in speech and in the highlighted text.
  Little lead-in words like "by", "to" or "next to" stay with what they lead
  into, so a clip never ends on one and the voice can't swallow it.
  Pena never sends a single bare word to the voice on its own. A word like
  "check," or "though," rides with the words before it instead.
  Pena adds pauses between sentences and around punctuation.
  ZONOS3 uses steering controls for expressive delivery, not inline emotion
  tags. Pena does not add emotion tags to either ZONOS3 or browser speech.
  Browser voices come from the browser and operating system, including Finnish
  voices if installed. Pena's replies are still in English, not translated.
  ZONOS3 uses English text and an alignment guard to reduce skipped or invented
  speech, but a multilingual model can still drift. The browser runtime does not
  normalize numbers, so Pena spells out ordinary numbers before ZONOS reads them.
  Speech speed changes playback speed and pitch. Existing neural selections use
  ZONOS3, not Piper.
  Saved Piper files are not deleted, but cannot be selected here.
  In a small RTX 4070 Ti SUPER test before the alignment guard was enabled,
  warm WebGPU generation took about 0.31 s
  for a 3 s clip. A locally built CUDA server took about 0.35 s for the same
  text and voice, producing a 2.73 s clip. These are not universal results.
  System-wide GPU readings were close but cannot establish each runtime's peak
  memory. The voice and Pena LLM have not been tested together for VRAM fit.

PROMPT AND FUTURE FINE-TUNING
  Temperature defaults to 0.3 with a fresh sampling seed for some variety.
  Temperature 0 stays predictable. Saved temperature and custom prompts stay
  as chosen.
  The notes below are historical research and preview records, not instructions
  for the currently shipped local-server mode. They do not enable browser AI.
  Inkling needs its own tokenizer and native conversation template. Historical
  serializers and the 8192/384 evidence budget remain for frozen data replay,
  not as an Inkling serving contract. Do not relabel old token IDs or adapters.
  Preserve canonical messages, targets, provenance and train/validation/test
  boundaries. A compact export must retain the facts its target answers cite.
  First qualify a real forward/backward optimizer step and checkpoint save/load
  for the selected base. Low-bit GGUF inference fitting a GPU does not prove a
  trainable representation fits. Then prepare a separate export and LoRA run.
  Compact input and an explicit reasoning-token cap are latency candidates.
  NVIDIA's published Inkling 2 Mini LoRA example uses the standard base on
  four GB200 GPUs, with a reported 44 GiB peak per GPU and up to 4,097 tokens
  per example. Its loader dequantizes expert weights. It is not a qualified
  single-GPU recipe, an OpenUncensored run or a timing estimate for this data.
  https://docs.nvidia.com/nemo/automodel/model-coverage/vision-language-models/thinkingmachines/Inkling-2-Mini
  Earlier desktop CUDA results used standard Inkling, not this edited base,
  and do not qualify browser performance. The browser backend, complete prompt
  counts, memory use, complete-answer latency and output quality still need
  verification before loading can be enabled.

INKLING BROWSER PREVIEW
  For local development, from C:\Users\USER\Desktop\Pena-chat run
  node pena-runtime\inkling-preview.mjs and open its printed loopback address
  in a WebGPU browser.
  The host serves only fixed local assets. Inference and selected GGUF files
  stay in the browser, and no model server is used. Stop the host with Ctrl+C.
  The host serves the packaged vendor runtime, not temporary checkout files.
  Build the experimental package with node pena-runtime\build.mjs --inkling.
  The desktop app junction locates the repository's temp\wllama-inkling
  checkout for this build and the backend check, regardless of working directory.
  vendor\inkling-runtime.json records the source snapshot and patch/JS/WASM hashes.
  Its patch path is relative to C:\Users\USER\Desktop\Pena-chat.
  The user selects a compatible local GGUF. The qualified test copy is at
  C:\Users\USER\Desktop\Pena-chat\atomic-iq2-m.gguf; select that file in the preview.
  Auto effort conservatively routes questions to none, low, medium or high,
  with manual overrides and request-level reasoning caps. It is a heuristic,
  not a guarantee of correct effort or a calibrated chess-quality score.
  Evidence has its own field. Progress reports observed prompt processing,
  thinking and answer streaming. Selected, unverified chess observations
  appear as coach notes, and raw thoughts are available in a collapsed panel.
  Optional browser speech reads acknowledgements, notes and the answer. An
  additional opt-in speaks raw thoughts instead of filtered notes. These can
  contain internal instructions or wrong claims and are not verified analysis.
  Older thoughts may be skipped if speech falls behind generation.
  The preview also offers the app's Piper voice engine and its default
  en_US-ljspeech-high voice. Prepare it before use to download the public
  voice and phonemizer, or import a custom ONNX voice, its JSON and MODEL_CARD.
  Voice cache is isolated by browser origin, so import custom voices separately
  in the app and preview. The preview defaults to port 18771 to retain its cache.
  Explicit review takes the previous answer and new correction/evidence,
  labels that answer unverified and requests high effort. It does not claim
  that a detected error or successful correction is guaranteed.
  Questions remain independent. Empty or truncated output is labelled.
  The default output ceiling is 2048 including thinking. A 192-token
  ceiling truncated real position and full-evidence answers. Short replies
  stop early, so raising the ceiling is not a fixed extra generation cost.
  Declared 12/16 GB presets use microbatches 256/512, full GPU offload,
  one slot and f16 key/value caches. Context defaults to 8192 and shifting
  is disabled. WebGPU limits are not used to guess the card's VRAM.
  These presets are not physical-card or concurrent-engine fit guarantees.
  Before the WebGPU fixes below, a browser smoke test with the temporary Atomic IQ2_M model and a short
  question produced a streamed answer and reasoning in about 105 seconds.
  That is not a speed or quality qualification of the selected Open model.
  On the same short question a budget of eight produced eight streamed
  reasoning tokens and an answer in 53 seconds, but the answer was not fully
  accurate about relative pins. A zero budget produced no final answer after
  192 generated tokens, so the preview does not offer zero. These observations
  do not prove budget behavior or answer quality for other models or inputs.
  Neither the selected OpenUncensored base nor use alongside the app on a
  12 GB card is qualified. Do not treat the preview as an app release.
  Current packaged-preview checks ran in Chrome without unsafe WebGPU flags
  on the 16 GB RTX 4070 Ti SUPER. Both declared presets completed five
  requests, reported real prefill progress and ended with stop, not length.
  Greetings took about 3.1 seconds and pin definitions about 5.4 seconds.
  Missing-board questions correctly declined to invent a winning move.
  The full compact-wire conversations used 7321/7415 runtime prompt tokens
  and completed in 49.33/47.36 seconds for the 12/16 GB presets respectively.
  They are different train/validation examples, not a paired speed comparison.
  Whole-card dedicated memory peaked at 11332/12060 MiB, including other
  allocations. These are tests on a physical 16 GB card, not 12 GB hardware
  certification or concurrent A.C.A.S engine qualification.
  A position-only counterexample still failed at high effort: the unfinetuned
  Atomic model falsely called c6 absolutely pinned after
  1.e4 e5 2.Nf3 Nc6 3.Bb5, hallucinating that d7 was empty. Its pawn is still
  there. Higher effort and complete output do not establish chess accuracy.
  Live loading and LoRA training stay gated. Raw data is unchanged, and the
  modest compact-wire reduction is not the requested drastic compaction.

WEBGPU SPEED WORK
  The development preview uses an experimental WebGPU build.
  Its source patch is C:\Users\USER\Desktop\Pena-chat\pena-runtime\inkling-webgpu.patch, against the
  copied llama.cpp snapshot e412c6f468b7b9e0f16f2540244236f8ad68e9ae.
  Do not apply it to the older npm runtime. build.mjs --inkling packages an
  already built experimental checkout, it does not compile the C++ backend.
  The patch enables existing Q2_0 expert multiplication shaders, batches
  uniform uploads per command submission, and reuses immutable buffer bindings.
  Binding keys retain resource handles and include pipeline, binding number,
  buffer, offset and size. The cache is capped at 32,768 entries and invalidated
  when an allocator buffer is freed. Model weights and inference mathematics
  are unchanged. The temporary CPU-node instrumentation has been removed.
  On the Atomic IQ2_M package, 34 expert-down operations previously fell back
  to CPU. Enabling Q2_0 reduced graph splits from 69 to one. In the 40-input,
  16-generated-token probe, readbacks fell from 1,242 to 18. Parameter batching
  reduced writeBuffer calls from 148,318 to 2,531. Binding reuse reduced
  repeated binding creation and raised generation to about 18.8 tokens/s.
  The original probe generated about 1.8 tokens/s. Prompt processing improved
  from about six to 36 tokens/s. These are short local probes, not guarantees.
  Raising command submission batches from 64 to 256 did not improve the
  measured speed, so that experiment was reverted.
  An earlier preview answered "What is a pin in chess?" twice in 5.57 and
  5.42 seconds, with the same answer and streamed reasoning. These runs used
  a thinking budget of eight, 192 output tokens and a 2,048-token context.
  They produced a final answer rather than stopping at a token-only proxy.
  Whole-card dedicated memory peaked at 10,275 MiB, sampled every 250 ms.
  This does not measure shared GPU memory, exercise other A.C.A.S engines,
  or qualify a physical 12 GB card. The GPU was a 16 GB RTX 4070 Ti SUPER.
  A native CUDA build using the same copied source and exact Atomic GGUF
  averaged 48.1 generated tokens/s and 816.8 prompt tokens/s over three
  synthetic llama-bench repetitions. Browser speed still does not match
  native CUDA, especially for long inputs. Native benchmarking is only a
  reference, not an inference service used by the preview.
  No training inputs, targets, BinProps, quantization or loop passes were
  removed for these gains. OpenUncensored and production remain unqualified.
  Later release measurements on the same Atomic IQ2_M package gave about
  24.58 generated tokens/s and 229.6 long-prompt tokens/s. The current retained
  small-K matrix kernels and binary/scale fusion measured 25.00 generated
  tokens/s on the 75-token probe and 250.87 prompt tokens/s on the 3119-token
  prompt with microbatch 512. Long-prompt generation measured 23.28 tokens/s.
  Both answers and private-generation text matched their frozen greedy
  references exactly. This is a numerical check, not a chess-quality pass.
  Long-prefill improvement is about 9 percent. Decode is still well below
  48 tokens/s, and the small change there is not an established speed gain.
  More expert output rows, speculative ngrams and descriptor memoization
  did not improve the measured result enough to retain. Later multi-token
  expert/pipeline experiments changed greedy output and were also removed.
  No lower parity standard, extra draft model or untested KV quantization
  was used to present these experiments as improvements.

  Apply the patch to a fresh copy of the matching source in PowerShell:
    $patch = 'C:\Users\USER\Desktop\Pena-chat\pena-runtime\inkling-webgpu.patch'
    git -C temp\wllama-inkling\llama.cpp apply --ignore-whitespace $patch
  Use --reverse --check instead to verify an already patched source.
  Use the existing Emscripten build environment, configure
  WLLAMA_TEST_BACKEND=ON, and rebuild the wllama target before packing:
    node temp\wllama-inkling\scripts\pack_wasm.js temp\wllama-inkling\build\wllama.wasm temp\wllama-inkling\esm\wasm\wllama.wasm
  Validate the test-enabled packed binary from the repository root:
    node C:\Users\USER\Desktop\Pena-chat\pena-runtime\inkling-backend-check.mjs temp\wllama-inkling\esm\wasm\wllama.wasm
  This executes 75 routed Q2 WebGPU cases against the CPU reference, including
  decode vectors, batches, broadcast experts and strided views, with the
  upstream NMSE limit of 5e-4. No model download is needed.
  Reconfigure CMake after editing backend tests, then build and repack.
  Additional binary/scale and small-K cases:
    node C:\Users\USER\Desktop\Pena-chat\pena-runtime\inkling-backend-check.mjs temp\wllama-inkling\esm\wasm\wllama.wasm --speed
  This checks twelve fused binary/scale cases and 26 F32/Q8 matrix cases.
  Numerical fixtures do not replace full-model greedy parity or chess quality.
  The old preview binary is preserved as wllama-before-webgpu-speed.wasm.
  Run node C:\Users\USER\Desktop\Pena-chat\pena-runtime\verify-inkling-model.mjs LOCAL.gguf to authenticate
  the pinned Atomic uncensored IQ2_M file, 8665091680 bytes, revision
  e298ba5299c4e071d81d005fecf3695652fe109a. File identity is not a promise of
  universal refusal behavior. Its uncensoring edits are already merged.
  Do not apply that adapter a second time or deploy an OpenUncensored-trained
  adapter on Atomic silently. These are different edited bases.
  For a fast future LoRA, merge into its matching high-precision edited base,
  requantize with a qualified recipe, then recheck browser speed and accuracy.
  An unmerged adapter adds matrix work. No trained adapter is qualified here.
  LoRA adapters can ride along with the model now. Pick the model GGUF and the
  adapter GGUF together in the preview. Any file with general.type = adapter
  gets mounted as models/lora-NNN.gguf and applied at scale 1. This lives in
  the temp\wllama-inkling src (utils.ts and wllama.ts), so rebuilds keep it.
  The runtime only reads the inkling2_loop layout. Mainline inkling2 GGUFs like
  Unsloth's or KookiesXy's will not load, adapter or not.
  The Pena LoRA plan is the plain AtomicChat/Inkling-2-Mini-GGUF IQ2_M plus a
  Pena adapter exported with --ou-edit, which carries OpenUncensored's edit too.
  The recipe is in C:\Users\USER\Desktop\Pena-chat\pena-runtime\INKLING-LORA-TRAINING.md.
  f16 KV is intentional. Quantized caches can need dequantization scratch
  that outweighs cache savings, so measure whole-card memory and latency
  instead of assuming a smaller cache means smaller total allocations.
  A CUDA report is not proof of a corresponding browser defect.

READABLE EVIDENCE PILOT
  readable-evidence.js renders a strictly decoded PCF/3 selection in pilot
  styles with named piece relations and all 30 named BinProp results for each
  recorded perspective. It retains selected facts, citations and scope labels,
  with all-zero current square-control rows omitted under an explicit rule.
  Other record types still use explicit field names and are not polished
  natural language. This is an offline prototype, not an app input switch.
  The full renderings do not choose evidence. No pilot
  guarantees answer grounding or establishes that a prompt fits the browser.
  The opt-in spatial-ablation profile deliberately omits A/J/S/X records and
  reports their counts. It is not a question-aware selector or suitable for
  training or deployment without evidence and answer-grounding checks.
  An initial three-training-prompt tokenizer probe using the selected Inkling
  tokenizer and the GGUF chat template at low effort measured 7,260-7,356
  tokens for PCF/3, 20,895-23,246 for the verbose rendering, 14,125-15,132
  for the grouped rendering and 11,792-13,049 for the spatial ablation.
  This probe excludes any runtime-specific prompt additions and does not
  measure inference, answer quality or 12 GB fit. None is a qualified
  shorter replacement. The ablation also loses the reported spatial facts.
  The opt-in compact-lossless/2 format uses a single named field legend per
  record kind, tab-separated records and explicit frame group headers. It
  preserves every decoded PCF/3 selected record, including all A/J/S/X spatial
  facts, piece identities, incoming/outgoing attack and defense relations,
  selected historical and conditional frames, and all 30 named BinProps for
  every recorded perspective. Consecutive all-zero S rows use an explicit ZERO
  square list; the decoder restores all four counts and the original row order.
  It does not use question selection, historical baseline deltas, derived
  frames, target answers or a new chess evaluation. Preserving selected PCF
  records cannot recover information absent from that original selection.
  decodeLosslessCompactEvidence reconstructs and validates the original
  selection. renderReadableMessage(..., {format:'compact-lossless'}) is the
  shared message renderer for prospective runtime use and offline copies;
  no live default has changed and comprehension is not yet qualified.
  The copy-only converter follows the existing offline export pattern: a
  freshly created output directory, exclusive file creation, source SHA-256
  checks before and after conversion, exact round-trip checks for every
  converted message, unchanged answers/metadata and an output hash manifest.
  Errors remove only that new incomplete copy. It refuses already converted
  rows and existing directories. Canonical input is never opened for writing.
  The default required canonical SHA-256 is
  78d874a93e98965b151709dcf417db4df20de6db5857d31151d27ac4d830dd8a.
  Run: node C:\Users\USER\Desktop\Pena-chat\pena-runtime\convert-evidence.mjs SOURCE.jsonl NEW_DIRECTORY
  A third expected-SHA argument is for explicitly authenticated other sources.
  The manifest marks trainingReady=false: source semantic review does not
  establish quality equivalence after changing model input. Re-tokenize with
  the selected model and identical native conversation template before any
  training. Conversion preserves all splits; it is not a new split assignment,
  target rewrite, automatically approved corpus, or live deployment.
  Focused checks:
  node --test app\assets\engines\pena-v2\tests\pcf-evidence.test.mjs C:\Users\USER\Desktop\Pena-chat\pena-runtime\convert-evidence.test.mjs
  A real-tokenizer-only, read-only audit samples the lowest ID hashes in train
  and validation, leaves test examples out, verifies exact selected facts, and
  prints token counts without prompts:
  node C:\Users\USER\Desktop\Pena-chat\pena-runtime\audit-evidence-tokens.mjs CANONICAL.jsonl LLAMA_TOKENIZE.exe INKLING.gguf 10
  These counts use the supplied GGUF tokenizer on joined message contents.
  They exclude BOS, the native conversation template, effort instructions,
  generation prefix and answers; they are not runtime context-fit or quality
  measurements. No full model or broad manual scenario audit is performed.
  On ten lowest-ID-hash examples per split, Inkling-2-Mini-UD-Q2_K_XL.gguf
  (SHA-256 20292e8142b69535ca88a5d04439d0fdeb4dc698d44c002dca706dcf92901441)
  measured train medians of 7,480.5 original, 14,549.5 full grouped and
  12,096.5 lossless tokens; validation medians were 7,556, 14,747.5 and 12,235.
  Every converted selection reconstructed exactly. All twenty lossless prompts
  beat the full grouped rendering (median per-prompt savings 16.8% train and
  16.2% validation), but NONE beat original PCF/3. This lossless-readable
  improvement still fails the shorter-than-original format gate. Keep it
  opt-in; do not mass-convert the canonical corpus for training or switch the
  live default on this evidence. No canonical mass conversion was performed.
  A separate, stronger compact-wire/1 candidate keeps the existing PCF/3
  compact tables, inherited groups and named references rather than expanding
  them into new tables. It removes only redundant ! markers on scalar spatial
  atoms and after dots in structured effects. Lists retain their ! separators.
  The decoder restores the original wire bytes before ordinary PCF validation;
  the renderer refuses any input whose transformation is not exactly reversible.
  Square names, piece identities, all relations, source citations and every
  original field/record remain. A short wrapper explains the references and
  current relation columns and names all 30 BinProps once with explicit
  false-default/true-code semantics for each recorded color. No chess facts
  are computed or selected. This candidate also remains opt-in and unqualified.
  renderReadableMessage(..., {format:'compact-wire'}) is shared with the
  copy converter. To explicitly request a copy use
  node C:\Users\USER\Desktop\Pena-chat\pena-runtime\convert-evidence.mjs SOURCE.jsonl NEW_DIRECTORY EXPECTED_SHA256 compact-wire
  Existing directories and converted messages are still refused. There is
  no automatic migration, tokenization, training or live default change.
  The same read-only audit now also compares compact-wire and reports native
  tokenizer contributions by record kind. Those contributions are tokenized
  independently after concatenating each kind across the same twenty samples;
  they are diagnostic attribution, not additive exact per-prompt totals.
  On the identical twenty samples and Inkling GGUF tokenizer identified above,
  final compact-wire medians were 7,305.5 vs 7,480.5 original tokens for train
  and 7,401 vs 7,556 for validation. ALL twenty were shorter than original;
  median per-prompt savings were 2.06% and 2.10%, respectively. Mean savings
  were 155.8 tokens, ranging from 56 to 217. Every converted selection restored
  exactly, including historical groups, sampled effects, all BinProp vectors,
  comparisons, identities and citations. This is a modest token improvement,
  not evidence of equivalent model comprehension, quality or runtime fit.
  The attribution explains why larger natural expansions failed: lossless
  tables cost 21,674 legend tokens across these samples; R grew from 14,950
  to 28,388, BINCOMP from 2,277 to 11,959, and M from 5,518 to 13,572.
  Reusing original PCF avoids those expansions. In compact-wire, Z costs
  20,135 vs 24,772 original, R 11,880 vs 14,950, and D 9,850 vs 12,899.
  Boundary removal saved 16,536 table tokens across the sample; the added
  named semantic wrapper costs 13,420 more tokens than original guidance.
  Most potential savings are therefore consumed by explicit readable
  semantics, leaving only the modest measured net gain. Do not claim large
  compaction or enable a live default from this result. No mass conversion,
  training or full model quality audit was performed.
  One subsequent bounded frame-membership factoring probe preserved literal
  spatial records once, explicitly listed every participating frame, and used
  ordered substitutions to restore the original wire bytes and selected facts.
  It retained exactly the same piece identities and explicit relationships;
  no board reconstruction, evaluation removal or answer selection was used.
  On the same twenty examples it found only 49 eligible repeated facts
  (38 D, 6 R, 5 G), with 113 occurrences. Existing historical BASE reuse and
  shared conditional frames already remove much of the duplication.
  Factoring medians were 7,388.5 train and 7,510 validation tokens, vs original
  7,480.5/7,556 and compact-wire 7,305.5/7,401. Only 17 of 20 were shorter
  than original; NONE beat compact-wire. Frame-membership/dictionary overhead
  added an average 101.35 tokens over compact-wire. The >=20% gate failed.
  That experimental implementation was removed; compact-wire remains the
  opt-in candidate. Its numeric audit is retained only in session files.
  PCF/3p is the plain sibling of PCF/3 and the format to train Inkling on.
  Inkling does not need the older tokenizer boundary markers, so PCF/3p keeps every record, guidance line,
  citation and BinProp exactly as is and just drops the markers. Lists use
  commas instead. decodePcf reads both versions to the same rows.
  encodePcf(selection, {plain:true}) writes it, and the Inkling path should
  build prompts with pcfCoachingInput(..., {plain:true}) so the app sends the
  exact bytes the LoRA learned. The builder default stays PCF/3 for the
  older pilots. To make a training copy run
  node C:\Users\USER\Desktop\Pena-chat\pena-runtime\convert-evidence.mjs SOURCE.jsonl NEW_DIRECTORY EXPECTED_SHA256 pcf-plain
  The full canonical corpus converted cleanly (18,175 rows, every row
  round-tripped, answers untouched, source SHA unchanged). On 1,010 sampled
  rows with the Inkling tokenizer the median prompt went from 7,470.5 to
  6,534 tokens, a 12.4% saving with no facts removed.
  Inkling layout (pena-inkling-layout/1) is the one to train on now. It is
  PCF/3p with the evidence moved into its own system message, right after the
  Pena system prompt. The chat template writes the thinking effort line just
  before the first non-system message, so the evidence sits ahead of it and
  stays in the prompt cache whatever effort or question comes next. The
  question subject lines and "Player question: ..." stay in the user message.
  Build it live with pcfCoachingInput(..., {inkling:true}), which also counts
  tokens with inklingPrompt, a mirror of the GGUF template. Make a training copy
  with the inkling format of convert-evidence.mjs. Every row is checked to
  flatten back to the exact PCF/3p message.
  The full 18,175-row token and mask audit fits within 8,192 tokens, including
  the final answer. It checks final-answer-only loss masks, including assistant
  history, against the pinned GGUF template. Most training rows exceed 4,096.
  This is a data preflight, not a trained or browser-tested adapter. The
  current manifest remains trainingReady=false until the trainer, trainable
  base and browser-compatible export have been verified.
  The payoff is prewarming. The app can read the evidence while the player is
  still typing (max_tokens 1, cache_prompt true), and the question then starts
  in under a second instead of 30 to 40. On a 6,474 token row the first token
  came after 29.0 s cold and 0.83 s warm, with token-identical greedy output.
  The question-focused profile is a separate experimental selection over
  already selected PCF. It checks the original position, keeps the full current
  piece graph and both current BinProp sets, and retains sampled move effects.
  It uses the current question to select conditional frames. On a follow-up it
  retains all previously selected conditional frames instead of interpreting
  an older question against a potentially different current board.
  Ambiguous, illegal or opponent move requests retain the original selection.
  It reports missing requested frames and record omissions. For a single
  unambiguous current-position move without a selected conditional frame, it
  can calculate an explicitly labelled rule-only frame with piece relations and
  changed geometric attacks and defenses. It is not an engine evaluation.
  The selector does not use target answers, and original source coverage
  metadata does not describe filtered or newly derived facts. Complete
  historical ledgers may use current records with explicit absent and changed
  entries. Comparison vectors may use a named default and exceptions. These
  representations still need model-comprehension checks.
  Current metric comparison rows are grouped by source, preferred line,
  alternative line and horizon. Named metrics retain both endpoints of each
  preferred, alternative and difference range and the bounded flag. A single
  value means equal endpoints. This is a lossless experimental representation,
  not proof that the model understands the comparison.
  Run the read-only sample audit from the repository root with
  node app\assets\engines\pena-v2\tests\format-pilot-audit.mjs DATASET.jsonl 10
  It selects the lowest ID hashes in each of train and validation, leaves the
  test split untouched, and outputs complete sample prompts and citation
  differences as JSON. Treat that output as private training data. Citation
  retention is not proof that an answer is grounded.
  On one hundred examples per split, the selected Inkling tokenizer and GGUF
  template counted a median of 7,552 focused vs 7,495 original tokens for train
  and 7,607 vs 7,492 for validation. 90 of 200 focused prompts were shorter.
  No target citation was lost in this sample. Fifteen samples lacked a source
  conditional frame for a parsed current move, and fourteen received a
  rule-derived frame. One still had missing frames. This sample
  does not establish semantic sufficiency or browser latency. The focused
  profile still fails the substantially shorter
  format gate. Do not use it to migrate data or enable the app.
  Grouping metric comparisons saved a median of 407 template tokens in the
  55 sampled prompts that contained those rows. The audit reconstructed every
  grouped row, including its scope and range endpoints. Across all 200 prompts,
  the train and validation medians above remained unchanged, and 90 prompts
  were shorter than the original. No target citation was lost in this sample.
  A separate probe kept only primary sampled lines and individual plies
  matching named moves for 78 single-turn, non-comparison questions. It saved
  about 521 tokens on average, but removed a target citation in eight cases.
  This filtering is not implemented. Citation retention alone would not prove
  the remaining evidence supports the answer either.
  A synthetic browser-only WebGPU probe on a 16 GB RTX 4070 Ti SUPER used
  Atomic IQ2_M, a 2,048-token context and a 625-token prompt. With batch 512,
  microbatch 128 processed 7.46 prompt tokens/s and generated 1.93 tokens/s.
  Microbatch 512 processed 6.95 prompt tokens/s and generated 1.66 tokens/s.
  These are single runs, not a model-quality comparison or a 12 GB hardware
  test. The 24-token outputs were incomplete and contained no final answer.
  The context was too small for the measured real prompts. Increasing
  microbatch alone did not solve this runtime's latency bottleneck.
  Compare actual model-template token counts and held-out answer quality
  before choosing a format or preparing a separate immutable-derived export.

LIVE COMPACT PCF/3
  pcf-evidence.js builds a typed, FEN-free evidence bank, performs strict
  round-trip checks and renders the exact selected records as a readable teacher
  view. pcf-input.js measures the complete model prompt with the supplied actual
  tokenizer, selects whole fact bundles within the shared 8192/384 budget and
  reports omissions. Mandatory current and immediately previous evidence that
  does not fit fails visibly, without silently dropping the previous position.
  The app worker starts from a cautious guess of 1.55 characters per token. Real
  Inkling prompts pack closer to 1.8, so when a busy board looks too big for the
  guess, the worker asks the local server for the real count before giving up.
  Before retirement, the live worker converted /3 to PCF/3 with its loaded
  tokenizer. That worker path is now disabled. Offline preparation retains
  the same PCF producer. Returned citations are checked against the selected
  PCF references. The current base model has NOT been trained on PCF, so this
  input switch is not evidence of coaching quality or adapter readiness.

  Current-piece R records explicitly include geometric enemy attackers, friendly
  defenders, enemy targets AND friendly pieces defended for every occupied square.
  G contains all geometric controlled squares; L contains legal moves only for
  the actual side to move. U records legal checks/captures/promotions/castling;
  C is a bounded, local material-exchange estimate, NOT a search or safety proof.
  A/P/J/S/X/N/B supply king-relative, pawn, pair, control, ray, pin and audited
  strategic primitives. BINS contains all30 predicates from the pinned BinProp
  chess/claude-opus-5 library for each color. True predicates use short mnemonic
  codes; unlisted predicates are false. When selected, BINLINE includes each
  unique sampled endpoint's30 predicate results and BINCOMP includes per-source,
  equal-ply support and
  contrast results, including false/non-distinguishing cases. O explicitly counts
  comparison groups available and included; limited context can omit groups.
  The other seven upstream chess libraries are not included. The static browser
  port is generated from the pinned MIT source and compared against the original
  library; see binprop-chess.js, binprop-full.js and BINPROP-LICENSE.txt.
  Heuristic correlations and source names are not proof of engine reasons,
  winning captures, safe threats or forced outcomes. Legacy contrast cards are
  suppressed when their rounded threshold disagrees with the original predicate.
  H gives exact question-bound facts, Z gives conditional
  move mechanisms, V gives first-move states and M gives sampled paired profiles.
  Current, conditional and historical frames are never interchangeable. Full
  history is replayed internally. The immediately previous recorded position is
  mandatory, including its complete piece/attack/defence ledger, geometric
  controls, material, pawn facts, numeric profiles and both 30-predicate vectors.
  Historical groups use lossless BASE C inheritance, DROP and explicit overrides
  to avoid duplicating unchanged rows. ORDER preserves pawn record order only.
  Teachers receive the fully expanded facts, never instructions to reverse a move.
  T/D in C describe the actual last played move and every changed geometric
  relation, including unmoved pieces. BCHANGE explicitly supplies both colors'
  true/false motif flips and current-minus-previous numeric profile differences.
  Those differences remain scoped heuristics, not causal engine explanations.
  With no recorded prior position, Y reports the missing history; none is invented.
  Older historical frames are selected within the remaining budget;
  O records coverage and missing information. Partial conditional frames identify
  changed entities and explicitly report which record families are complete.

  pcf-replies.js optionally performs independent LC0 searches from each selected
  conditional child, preserving up to three actual MultiPV replies per child,
  search budgets and CHILD-side value perspective. These extra searches are not
  enabled by the GUI or present in the old saved corpus. Missing searches are
  encoded as unknown; an ordinary principal-variation reply is not represented
  as an independently verified best or second-best child move.

  Historically, the pinned Qwen tokenizer was checked against actual PCF records and all valid
  numeric packed-code combinations, including short BinProp flag/count/fit cases.
  Spatial atoms use a tested ! boundary; rare
  SAN/checkmate and wide-count cases use named CHECK/MATE/WIDE codes. Exact
  browser/native token parity and independent current-board geometry checks passed
  on96 local scaffolds. This does not guarantee arbitrary future text boundaries,
  student decoding, historical/conditional semantics or model quality. Every
  new corpus still needs complete token, mask, semantic and resource validation.
  The readable teacher view expands each selected binary predicate and support
  result by name. It is generated from the same selected PCF records; it must
  never receive private source FENs, unselected evidence or extra source weights.

SHARED INTERNAL INPUT CONTRACT /3
  The live GUI and offline exporter both call groundedCoachingInput before PCF.
  BinProp is invoked there, not merely in a research arm. strategic-coaching-input.js
  reuses all five audited strategy.js predicates on legally replayed candidate
  endpoints. LC0 and recorded Stockfish comparisons stay separate, with equal
  horizons and every supplied same-candidate continuation included. No qualifying
  contrast means no invented fallback. At most two cards are shown, prioritizing
  a requested alternative; counts of additional omitted cards are explicit.
  BP.scope explains the heuristic/sample limits. BP1/BP2 carry labelled White,
  Black and root-side-minus-opponent values plus shared named witness examples.
  The full comparison/card provenance remains in input.strategy. These are
  geometric/count contrasts, not proof of engine reasons or safe/forced play.
  Exact conditional LC0 checks/captures/promotions beyond the first move have
  LCn.pN references too. Current and conditional boards must never be merged.
  The bounded pure-evidence cache keys full frame/move/entity identities and
  mentioned alternatives; it never accepts stale boards or cached prose.

  Grounded packing /3 reversibly aliases duplicate complete first-move occupied
  relation payloads with sameRelations=ID. Source IDs, numerical precision and
  first-move changes remain intact; unpack/pack equality is checked. Original
  V1 reply wording, questions and conversation are not rewritten by this stage.
  Browser/native exact token parity, complete context/output reserve and actual
  GPU resource qualification are independent gates on each new dataset. Old
  /2 training snapshots are historical baselines, not BinProp-trained adapters.
  Passing code/oracle checks does not certify generated natural-language claims.

LAYOUT AND TESTS
  This directory contains the Pena GUI, pending-model worker, coaching input,
  speech assets and browser dependency bundles. The former pena directory is
  no longer needed. All app regressions and their fixtures are under tests\;
  Apache denies access to that directory. Exclude tests\ from release packages.
  There are no model weights, trainers, build dependencies, experiment bundles
  or Desktop imports in the shipped runtime dependency graph.
  From the repository root:
    node --test app\assets\engines\pena-v2\tests\*.test.mjs
  The former real-model smoke command is retired and must not download weights.
  Inkling has no qualified browser-model smoke command yet.
  Private-profile storage can truncate large writes despite an
  advertised larger quota; the loader checks the complete file size before GPU
  loading and rejects an incomplete download explicitly.

  Historical experiment/Queen tests live with the Desktop development tools.
  Obsolete Queen encoder/recommendation tests, empty scaffolding and two old notes-layout
  expectations were removed. Current PCF citation/history tests remain.

DEPENDENCIES AND LICENSES
  The GGUF runtime is @wllama/wllama 3.13.0 (MIT), with its app-local WASM.
  pena-runtime\package-lock.json pins the build dependency; rebuild from
  C:\Users\USER\Desktop\Pena-chat with
    npm --prefix pena-runtime ci --ignore-scripts
    node pena-runtime\build.mjs
  There are no npm dependencies installed into the shipped runtime directory.
  vendor\tokenizer.js bundles only @mlc-ai/web-tokenizers 0.1.6. The unused
  WebLLM inference runtime and its old Qwen model catalogue are no longer shipped.
  The tokenizer build is pinned alongside wllama in pena-runtime.
  Speech Transformers and ONNX Runtime dependencies remain bundled separately.
  Their build entries and lockfiles live in the Desktop Pena-chat workspace
  under tools\pena-v2\speech. Do not rebuild the retired WebLLM runtime into this app.
  vendor\ contains the required JS/WASM bundles and license notices. It is
  visible to Git, not an ignored build-output folder. Include it in releases.
  The model loader, voice worker and speech workers all use these app-local
  assets. No Desktop toolchain, development server or junction is used at runtime.
  Research-only model loaders/configurations and their fixtures stay on Desktop;
  the shipped model API contains only the supported browser model.
  Keep BINPROP-LICENSE.txt, NOTICE, LICENSE-Queen.txt for retained position-format
  helpers, the repository LICENSE and dependency licenses with
  their respective source/distributions; research relocation changes no licenses.

  The old long persona and its dated prompt serializer have been removed.
  Source notes and final inference share the minimal coaching system text and
  model-specific serializer. Detailed personality instructions belong to teacher generation,
  not a second production prompt. Current source fact/citation bindings remain
  necessary for app history, visuals and unchanged validated training answers.

DEVELOPMENT BOUNDARY
  Desktop Pena-chat owns training/export/oracle code, retired Queen tools and
  weights, research harnesses and generated studies. Exact pre-consolidation
  sources are preserved there for immutable historical hash/provenance checks.
  Original targets, historical certificates and paused checkpoints are never
  overwritten by conversion. New inputs require new frozen-source qualifications.
  Source hashes from before relocation remain historical, not certificates of
  this layout. Requalification must use new outputs, never weaken old checks.
