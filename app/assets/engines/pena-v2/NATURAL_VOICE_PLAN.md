# Pena's natural voice

This is where Pena's coaching voice stands, what we measured, and a plan for whoever picks it up next.
The goal is simple. Pena should sound like a friend who plays well, sitting next to you for a whole session, and never like a form being read out loud.

## Implementation status

The implementation now includes the runtime mechanisms below. The historical
measurements later in this document are not acceptance results for this revision.

- Move grades reach automatic played-move instructions. Good moves get no grade verdict and mistakes get a plain grading instruction.
- Default chat and natural coaching share direct voice rules: no rhetorical throat-clearing or hollow choice summaries, a supported recommendation with its trade-off, contractions and varied sentence lengths. Saved unchanged defaults adopt these rules, while custom prompts keep their voice. This prompt update has regression coverage but has not had a fresh whole-game model study.
- The voice rules give positive instructions and direct examples instead of listing unwanted phrases for the model to imitate. New ideas are introduced as possibilities, with definite descriptions reserved for established subjects. Shared speech and display cleanup handles importance framing as a family of clauses: introductory wrappers, predicates after any subject, contractions, past tense and appositive labels. It preserves negation, concrete descriptions and attributed ideas. Assistant history is screened before it goes back into default coaching and plain-chat prompts, so old phrasing is not repeatedly offered as an example. Player messages and board evidence stay untouched. These rules cover tested grammatical families, not every possible model paraphrase, and still need fresh model and listening checks.
- Empty advice wrappers now unwrap by clause type, including noun-led instructions, "what matters" clauses, "what you need to do" clauses and observation preambles. Nested wrappers are removed until the actual advice is reached, including in lists. Past-tense plans, negation, conditions and the opponent's intentions are not converted into commands for the player.
- Attention frames are also inverted into direct advice: "X is the thing to watch" becomes "Watch X", with the same treatment for focusing on, paying attention to, keeping an eye on, dealing with and responding to a subject. Contractions and pronoun objects are handled too, so "it's the thing to deal with" becomes "deal with it". Clause connectors, timing conditions and citation markers are retained. This does not turn uncertainty, negation, historical descriptions or an opponent's intentions into player instructions.
- Progressive action frames such as "is the one piece doing" become "is doing" for arbitrary following actions, including adverbs, contractions, plural and past-tense forms. The same cleanup reaches chat, speech and reused assistant history. Explicit "only" claims, tactical ability clauses, negation and different relative-clause tenses are left intact.
- Relevance frames are shortened to their actual predicate: "your pawns are the ones that matter" becomes "your pawns matter". The shared pass also handles singular forms, contractions, past tense, "what matters", "count" and "make a difference", preserving modifiers, citations and Markdown. It leaves negation, uncertainty, explicit exclusivity, tense distinctions and factual identifying clauses intact.
- Recommendation frames such as "is the thing to do" become ordinary suggestions such as "is a good idea". Parallel move, step and approach wording follows the same policy, including plurals, contractions and past tense. Timing, conditions, uncertainty, citations and Markdown are kept. Explicit "only" or "best" claims and negative recommendations are not weakened by this cleanup.
- Content-free conclusion clauses are removed after substantive text, whether attached with a connector or written as a separate sentence. This covers generic affirmations of pressure, danger or threats and empty reminders of importance. Concrete consequences, new targets, explanations, negation and standalone answers are retained, along with citation markers and following advice. No replacement slogan is added.
- A runtime article pass introduces new countable judgements with "a" or "an", for example "Your e5 pawn is a soft spot:". It recognizes evaluative noun phrases with varying modifiers, rather than replacing every "the". Matching descriptions already introduced for the same subject, descriptions explicitly asked about, factual occupants, unique/superlative qualifications, negation and restrictive references stay definite. The pass retains Markdown, punctuation and citation markers, and runs consistently on streamed replies, final replies and reused history without depending on the system prompt.
- The shared default generation prompt now leads with a supported recommendation and its concrete reason, using a short castling-versus-pawn-push example to show the intended tone. It no longer tells the model to introduce every new idea as merely one possibility. A separate move-hidden example and an explicit precedence rule keep that tone instruction from overriding move hiding. Saved defaults migrate, custom prompts remain custom, and natural phrasing is retained by output screening. This prompt change has not yet had fresh model or listening qualification.
- Quiet, normal and chatty automatic commentary is a Pena preference. Quiet speaks for mistakes or worse, real threats and rare critical good finds verified by move comparison, not every opponent probe. Normal also responds to checks, exchanges and hanging pieces, alternating comments with silence on otherwise calm good/neutral moves. Chatty considers every position.
- Comment focus rotates only among topics supported by the actual board, grade or searched line: pressure, exchanges, undeveloped pieces, pawn structure and endgame king activity.
- The last few spoken openers are passed back into the next comment. The app never names a stock phrase to avoid, because that primes the small model.
- Player patterns use verified own-move transitions and board facts, not generic grades or the opponent's mistakes. Supported patterns are newly vulnerable pieces, missed engine-preferred checks and premature queen moves. They must recur across distinct games, and reminders have a three-game cooldown. Reconnecting the same instance does not create another game. Old unqualified grade counts are not migrated.
- Natural-style pattern reminders now come from that verified state as a short retained sentence, rather than depending on the model following a reminder prompt. They accompany a nonempty screened answer and do not replace empty/rejected model text. Cooldown is consumed by actual retained reminder text, not by an ignored instruction.
- Teaching distinguishes generic definitions and rules from live-board discourse. Definition roles do not borrow recent movers or citations; supported definitions use labelled glossary demos. Concrete references, uniquely supported generic-piece relations and question subjects still produce live highlights.
- Mid-sentence turn openers and note/evidence sentences are filtered. The raw text view keeps the original.
- Thinking-loop cutting, the one retry and the move-hiding filter remain the safety gates.
- Complete streamed sentences pass the same move-hiding, board, geometry and voice gate as final replies before being shown or spoken. Draft events missing schema/reference metadata are not an early-speech shortcut.
- Checks are retained with each reply. The count includes screened board-sensitive statements, rejected statements and actual live rule/engine checks. "Checked" is not a claim that all strategic reasoning is verified; plain chat has no check badge.
- Check reports remain hidden until the response finishes, even while live checks and screened speech accumulate. Completed turns keep their reports. The chat follows streamed content and layout changes until the reader scrolls up, resumes following when they return to the bottom, and shows a newly submitted question at the bottom.
- Superseded background game grading is cancelled through the engine queue's current-request guard and treated as an expected abort. Genuine analysis failures still produce a warning and are not mislabeled as cancellation.
- Empty or cancelled automatic turns reserve no height and are removed on the next turn. A typed question whose answer is filtered still receives its quiet explanatory note.
- An ordered whole-game study mode carries focus, recent comments, silence and pattern state, with conversation bound to the position just like the app. It fingerprints code, inputs, model identity and settings before allowing resume. Independent accuracy comparison requires matched event IDs and the separate board checker.
- The v10 whole-game run passes the cadence, verdict, opener, accuracy and move-hiding gates. The phrase repetition gate still fails, mostly on real chess content (see the v10 section below).

Regression coverage includes ownership, cross-game pattern cooldown, repetition,
normal/quiet frequency, positive and rejected check counts, archived check details,
screened speech before completion, rejected streaming claims, cancellation and
empty-turn layout. The model-quality thresholds below remain acceptance gates,
not promises inferred from passing unit tests. Repeated concrete tactical advice
is never discarded merely to improve a phrase-diversity score.

### Qualification result, 2026-11-28

**The runtime mechanisms are implemented, but the full voice-quality plan is not
qualified for completion.** The latest serial regression selection passed 232 tests;
one opt-in audible ZONOS test was skipped.

The revision-3 model study (before the bounded safety repair below) used two recorded Maia game samples, each containing
80 contiguous plies from the starting position. Each of legacy/natural and
show/hide covered the same 160 events. The actual GGUF architecture was
`inkling2_loop`, using the production effort-none normalization with a 16-token
reasoning margin. Whole-game model history followed `PenaConversation`: older
positions' Q/A pairs were not inserted as current-position dialogue.

| Natural-style result | Moves shown | Moves hidden |
|---|---:|---:|
| Terminal generation failures | 0 | 0 |
| Average spoken words | 38.8 | 39.0 |
| Average sentences | 2.01 | 1.88 |
| "is/was fine" in played comments | 4/72, pass | 6/71, fail |
| Opens "Your <piece> on" | 43/136, fail | 34/133, fail |
| Maximum repeated non-chess phrase in 10 comments | 8, fail | 8, fail |
| Independent checker flags per comment, legacy -> natural | 0.0662 -> 0.0588, pass | 0.0368 -> 0.0376, fail |
| Calm events without a comment | 24/31 | 24/31 |

All 32 mistake events and all 75 threat events reached generation in both modes.
With moves shown all retained a spoken answer. In hide mode the safety filters
emptied three answers, so one mistake and three threat events had no spoken
comment (the categories overlap). This must not be "fixed" by speaking a rejected
move or inventing a coaching answer. On the common-spoken hide subset both styles
had five checker flags over 133 comments; the strict all-spoken rate still fails.
Checker flags are limited automated findings, not a complete factuality audit.

A qualitative read of all 133 nonempty natural-hide answers found eight clear
current-player move disclosures, including described captures, queen/bishop check
hints and rook-to-file instructions. A bounded follow-up filter repair now
withholds those eight saved examples while retaining their factual observations.
It also rejects the two definite factual errors found in the hide sample: a
knight on c3 "leaning on b2" and calling Black's h3 rook "your rook" to White.
These repairs have focused positive/negative regressions and saved-output replay
checks; the saved generations were not rewritten or presented as a new model run.
The table is therefore a diagnostic pre-repair result, not qualification of the
final repaired path or proof that all indirect move hints are caught.

The revision-3 scripted pattern tests established ownership, recurrence and
cooldown of the reminder supplied to the model. In the sampled real-model event,
the model did not actually mention the recurring missed-check pattern. The new
deterministic reminder sentence fixes that dependency: scripted cross-game tests
now pass its retained text through the real show/hide screening helper and check
cooldown only after it appears. This is presentation-path evidence, not a new
whole-game listening trial or evidence that the model learned a habit.

The run data and provenance are in the gitignored directory
`temp\pena-voice-maia40-20261128-0221`, under the `*-r3` labels. Revision-2 results
are pre-parity experiments: they incorrectly carried old-position conversation
into new automatic comments and are not production acceptance evidence. Their
raw data has been retained rather than rewritten.

Remaining work is measured candidate/content selection or model work for
repetition and opener variety, plus another matched show/hide accuracy run before
claiming those gates passed. More prompt prohibitions or deleting valid tactical
sentences solely to improve the counts is not an acceptable substitute. The
analysis commands report measurements; a successful command exit is not an
automatic release approval. All applicable quality gates and the manual hide/
pattern/audio checks still have to pass.

### Follow-up: contextual teaching and candidate experiment

The generic pin definition now uses its glossary example, not an unrelated
recent mover. Definition/example moves cannot advance the live teaching board.
Concrete references resume live cues, including the front and back roles of a
verified pin (the back piece can be the king). Ambiguous generic pieces stay
unresolved, while question subjects and directly described development still bind.

A fresh bounded experiment generated two sequential candidates per natural-style
turn, screened both normally, then selected for lower recent phrase overlap and
fewer stock piece/square openers. Urgent replies retained the first safe
candidate's explicitly named target squares. This is a conservative heuristic,
not a truth checker. It was **not enabled in the app**.

Four trials replayed the same recorded 80-ply Maia sample (game 5, White), using
legacy/natural-candidate and moves shown/hidden. Each requested 67 comments, with
zero terminal generation failures. Both candidates, selected index, token totals
and wall time are retained in the `*-r4` files beside the revision-3 data.

| Two-candidate diagnostic | Moves shown | Moves hidden |
|---|---:|---:|
| Second candidate selected | 23/67 | 21/67 |
| Opens "Your <piece> on" | 7/67 | 12/67 |
| "is/was fine" in played comments | 1/35 | 2/35 |
| Maximum phrase repetition in 10 comments (target 3) | 6, fail | 6, fail |
| Limited checker flags, legacy -> candidate | 7/67 -> 3/67 | 6/66 -> 0/67 |
| Mean wall time per requested two-candidate turn | 8.79 s | 8.92 s |
| Total generated completion tokens (both candidates) | 10,841 | 11,098 |

The opener/verdict sample is below the plan's 120/60-comment denominators; those
gates are unqualified, not passes. There was no matched single-candidate natural
control, so these numbers do not isolate the selector's benefit or extra latency.
All 21 mistake and 30 threat events retained comments, but the sample's calm
silence rate was 13/14, not evidence of an ideal half-silent cadence.

Reading all 67 retained hidden answers found clear remaining move disclosures,
including building with e3/c4, the c4/e4 pawn break, attacking the bishop with the
rook, a queen double-attack hint, taking the checking queen and a bishop-check
hint. Zero limited checker flags therefore emphatically does not mean safe or
correct advice. A bounded follow-up now catches the first two named-pawn-plan
families, with history/opponent-preservation tests; saved generations are unchanged.

The experiment fails the repetition and manual move-hiding gates and remains
study-only. Reports were produced before the final contextual-role, early-reminder
cooldown and named-pawn-plan repairs; they are diagnostic evidence, not current
production qualification. The study marks two-candidate runs as unshipped
experiments even when their provenance is otherwise current. Another model or a
stronger content-generation approach is still needed before declaring the full
plan complete; deleting valid warnings to lower repetition is not acceptable.

### Fresh single-candidate study and hide-mode replay, 2026-11-28

The latest matched study used two 80-ply games for baseline/natural styles with
moves shown/hidden. It used the production single-candidate path, the same event
IDs in both conditions, and completed all natural generations. The independent
board checker comparison passed in both display modes:

| Natural-style result | Moves shown | Moves hidden |
|---|---:|---:|
| Spoken comments / requested | 136 / 136 | 135 / 136 |
| Terminal generation failures | 0 | 0 |
| "is/was fine" in played comments | 5/72 | 3/71 |
| Opens "Your <piece> on" | 39/136, fail | 37/135, fail |
| Maximum phrase repetition in 10 comments (target 3) | 6, fail | 7, fail |
| Checker flags per comment, baseline -> natural | 0.1185 -> 0.0368, pass | 0.0963 -> 0.0296, pass |
| Calm events without a comment | 24/31 (77.4%) | 24/31 (77.4%) |

The accuracy result is a useful improvement, not a complete factuality audit.
Hide mode still had one filtered-empty answer, including a missed mistake and
threat event, and its normal-mode silence rate is much higher than the plan's
roughly-half target. The study therefore does not qualify those gates.

After the bounded hide-filter repair, all 135 saved natural-hide answers were
replayed through the current move-hiding helper with the original played-move
context. Eight answers were shortened, covering the witnessed rook-to-target,
queen-check, check-then-hit, recommended capture, queen-move, rook-lift,
central-pawn-move and free-pawn hints. The factual lead-ins were retained, and
regressions keep opponent plans and historical moves. This is diagnostic replay
of saved replies, not a fresh model run or evidence that every indirect hint is
caught.

The focused Pena, worker and whole-game study suites pass 190 tests. Phrase
repetition and piece/square opener rates still fail, and first-audio latency
has not been measured on the real model/audio path. Pattern ownership and
cooldown have scripted coverage, but they still need a live-session quality
check. The full plan remains incomplete.

### Normal cadence follow-up, 2026-11-28

The previous normal policy only forced a comment after a suppressed ply. That
meant isolated calm turns following an important comment were nearly always
silent, even when most calm turns in the game had also been skipped. Normal mode
now alternates across all otherwise-calm turns, including when important turns
fall between them. The cadence counter is game-local and survives pausing and
resuming a tab.

A policy-only replay over the same 160 recorded events requested comments for
144 positions and left 16 of 31 calm positions silent (51.6%). All 32 mistake
events and 75 threat events still reached the request path. This verifies the
scheduler against the study sequence, not that generated replies survive every
filter or that listeners prefer this cadence. The local study model endpoint
was offline at that point. The whole-game run in the next section confirms it.

### Whole-game rerun and voice fixes, 2026-11-28 (v10)

This round fixed a few things the earlier runs turned up, then reran all four
matched studies (legacy and natural, show and hide) on the same 160 events with
the same local model. The llama-server needed `GGML_CUDA_DISABLE_GRAPHS=1` to
stay up through the long runs.

What changed:

- **Opener restart.** If an automatic comment starts with "Your <piece> on",
  generation stops early and asks once more with a short nudge. In a probe it
  escaped the opener 13 times in 14.
- **Threat ownership.** Quiet mode and the comment focus only treat a threat as
  something to warn about when it is aimed at the player. The factsheet now says
  a threat the player created is "a real threat for the opponent to answer".
- **New checks are not copies.** Two check sentences naming different squares
  ("check from the bishop on c3" and later "check from the queen on f2") were
  treated as a repeat and dropped. That emptied one hide-mode comment. Sentences
  about different squares are now kept.
- **More stock rewordings.** "the natural move", "active on the e-file",
  "keep the X coordinated" and "keep the X connected" get a fresh wording once
  they have been used three times recently. Curly apostrophes ("don’t") now match
  the same phrase as straight ones. This last fix landed after the v10 runs.
- **The measurement** now counts "e-file" as one chess token, treats pronoun
  contractions as function words and counts tactic names as chess words.

| v10 natural | show | hide |
| --- | --- | --- |
| Comments spoken | 144 of 144 | 144 of 144 |
| Calm turns silent | 16 of 31 | 16 of 31 |
| Mistakes and threats spoken | all 32 and 75 | all 32 and 75 |
| "is fine" verdicts | 2 of 72 | 4 of 72 |
| "Your <piece> on" openers | 12 of 144 | 6 of 144 |
| Wrong board claims per comment, legacy to natural | 0.111 to 0.049 | 0.069 to 0.042 |
| Player moves leaked while hiding | | 0 |
| Max repeats of one phrase in 10 comments | 5 | 6 |

The cadence, verdict, opener, accuracy and hiding gates all pass on a real
generation run. The repetition gate does not. Most of what repeats is real chess
content that stays true for several moves, like "leaves your king in the
centre", "out of check" or "keep the d4 pawn alive". Deleting it would only game
the number and throw away advice, so it stays. Replaying the saved v10 answers
through the apostrophe fix changes one comment and leaves the maximum where it
was. Getting it under the gate likely needs the focus and prompt to move the
model on to new ideas, not another filter.

Still open: the repetition gate, measured first-audio latency, a live check of
player-pattern reminders across real games, and actually listening to a session.

## What was bugging us

Played over a real game, the old comments had a few habits that got tiring fast.

- Almost every comment opened with "White to move." even though you just saw the board.
- It talked about where its info came from: "the engine line points at Bd3", "the pawn-chain note makes b2 the soft spot", "is the natural one".
- Lead-ins with a colon, like "Development is still the bigger priority:".
- A question or an offer at the end of nearly everything ("What do you want me to focus on?", "If you want, I can walk through…").
- After a plain move it sometimes thought you'd typed something: "The question got cut off, so I can't answer it directly."
- Now and then the model got stuck printing chat markup until the token budget ran out, and you saw "The local model returned no visible final answer".

## Where the voice lives

Everything about how Pena sounds while coaching sits in [coach-style.js](coach-style.js).

- `coachStyles` holds the named styles. Each one has a `system` prompt (or `null` to keep the old prompts), `events` (rewrite automatic comments into a plain instruction) and `cleanup` (run the spoken filters).
  - `natural` is the default.
  - `legacy` is the voice from before, kept for comparisons.
- `naturalCoachSystem` is the coaching prompt for the natural style.
- `eventInstruction` turns the app's event strings, `(played Nf3)` and `(position updated)`, into what the model reads: "(The player didn't say anything. They just played Nf3.) React like a coach watching over their shoulder…". The app and the chat history keep the original strings.
- `styleCoachingMessages` builds the model-facing messages for one request. The system message and the evidence stay the same for automatic comments and typed questions, so the prompt cache keeps working. Only the last user message changes.
- `polishCoaching` runs the spoken cleanups:
  - `dropTurnStatements` removes "White to move." and lead-ins like "It's your move, and".
  - `dropClosingOffers` removes closing offers and check-in questions. For automatic comments it also removes any closing question, talk about a missing question, and sentences that only talk about notes or evidence.

### How one automatic comment flows

1. The board changes. `onPosition` in [service.js](service.js) creates `positionEvent` after the opponent moves or `moveEvent(san)` after your move.
2. `converse` prepares the record, records eligible player patterns and applies the frequency gate before asking the model. It sends the selected focus, grade and recent openings in the request.
3. In [app-worker.js](app-worker.js), `prepareInput` builds the evidence and calls `styleCoachingMessages`.
4. `generate` streams complete sentences with their evidence schema and IDs, retaining the bounded loop recovery below. Live thought checks are reported as separate check events, never as spoken coaching.
5. `streamGroundedSentence` runs `screenCoachReply` before presentation and speech. `finishGroundedChat` uses the same gate, keeps citations and full reply checks, and only queues the unspoken remainder. Raw model output remains separate from the filtered advice.

## What changed and how much

We measured all of this on the real local model with the study harness (see "How to experiment" below).

- Setup: 120 events from real games. Half come right after the player's move and half right after the opponent's.
- Model: Inkling 2 Mini IQ2_M, effort none, temperature 0.3, the same seed per event.
- `base` is the legacy style with the old filters. `nat` is the natural style with the new filters.
- `show` and `hide` refer to the "Don't give away moves" switch.

| Out of 120 comments | base-show | nat-show | base-hide | nat-hide |
|---|---|---|---|---|
| Opens with whose move it is | 87 | 0 | 79 | 0 |
| Has a question | 15 | 0 | 13 | 0 |
| Offers to say more | 5 | 1 | 4 | 0 |
| Talks about the engine | 73 | 1 | 26 | 0 |
| Says "natural" | 22 | 5 | 9 | 2 |
| Says "priority" | 2 | 0 | 4 | 0 |
| Thinks the question got cut off | 0 | 0 | 1 | 0 |
| Model printed chat markup instead of an answer | 9 | 0 | 16 | 0 |
| Hit the token limit | 11 | 0 | 19 | 0 |

- Length went from 76 words to 39 per comment with moves shown, and from 70 to 42 with moves hidden. Sentences went from 5.5 to 2.3.
- A comment takes about 3.6 seconds instead of 4.8 in the study, which ran two requests side by side (the app runs one at a time).
- None of the natural runs needed the loop retry.

These are historical, independent-event samples, not a whole-match listening
test or proof of a tenfold improvement. The habit counts describe saved filtered
answers. The word counts above describe raw answers, before move hiding.
The direct-server study uses production prompt and filter helpers, but not the
worker's streaming loop guard, live thought checks or speech synthesis. Its
timings are not time to first audio in the app.

### Move-hiding repair and release gates

The saved natural hide sample still had two indirect move leaks. In case `42p`,
Black is the player and the position is:

```text
r1bq1rk1/p4ppp/n1pb4/1p1pN3/1P6/P2PB1P1/4PPBP/RN1Q1RK1 b - - 0 12
```

The answer named the knight on e5, then said "Take it off the board before White
gets to use it." Black has exactly one legal capture of that knight, `Bxe5`.
This is a move suggestion even though it uses no notation.

[hideMoveSuggestions](coaching-policy.js) now also catches player-directed
capture, removal and trade commands with named pieces or pronouns. In a replay
of the 120 saved natural hide answers, it removed the command in `42p` and `7p`,
kept both observations and left the other 118 answers unchanged. The saved
generation files were not rewritten.

This is a bounded repair, not proof that every indirect suggestion is detected.
Before accepting another voice experiment:

- Run the move-hiding tests, including `42p`, and manually read the hide sample.
  Count indirect recommendations as leaks too. Fewer repeated words does not
  excuse giving away a move.
- Keep tests for opponent threats, past captures, genuine board observations
  and explicit requests to reveal a move.
- Test loop recovery separately in the worker. One retry is the limit. If that
  retry fails, the usual error UI must report it rather than completing with an
  empty success. No error text should be spoken as coaching.
- Apply the accuracy checks in step 6 before shipping new focus selection,
  candidate selection or earlier speech. Fluent wording is not evidence of
  better chess advice.

The repair run passed 178 of 179 tests across `pena.test.mjs`,
`local-worker.test.mjs`, `local-ai.test.mjs` and `app-integration.test.mjs`.
The remaining ZONOS startup fixture failure also occurs with the HEAD version
of the code. No new-model generation was needed for this filter repair.

### What's still a bit samey

The natural voice still leans on a few words. Out of 120 nat-show comments:

| Phrase | Comments |
|---|---|
| "just" | 36 |
| "is hanging" | 34 |
| "watch" | 26 |
| "real" | 22 |
| "fine" | 20 |
| "eyeing" | 18 |
| "don't rush" | 13 |
| "is the move" | 9 |
| "cleanest" | 8 |

- "X is fine, but…" shows up in 18 of the 60 comments after the player's own move. Here are a few from the c3 run:
  - "Kf2 is fine, but it leaves your h3 pawn hanging…"
  - "Nc6 is fine, it solidifies e5…"
  - "Qg7+ is fine but it lets White slide the king out…"
- 35 of 120 comments open with "Your <piece> on".

A colon in the middle of a sentence, like "Qd7 is the cleanest: it attacks…", is left alone on purpose. That's normal speech. Only colon lead-ins get rewritten.

## Things that didn't work

These were tried on the same 40 events with the same seeds, so they're worth knowing before trying them again.

| Try | What it was | Result |
|---|---|---|
| c1 | A list of stock phrases to avoid, added to the system prompt | "real" went up from 6 to 11, "cleanest" went down from 6 to 1, the rest stayed about the same. Naming a phrase seems to prime this small model to say it. |
| c2 | c1 plus "lead with the idea, not a piece and its square" | Comments opening with "Your X on" went from 13 to 14. No change. |
| c3 | The instruction after your move said "Only grade the move when it was a mistake or a really good find" instead of "If it was a mistake, say so plainly" | "is fine" stayed at 10 of 30 played events. It grades out of habit, even though the evidence already says the move was best. |
| Earlier | A prompt line asking for no colon lead-ins | Not enough on its own. That's why `dropAnnouncedLabels` in [formatting.js](formatting.js) exists as a filter. |

The lesson is that small models follow "do this" much better than "don't say that". Fixing variety and verdicts will probably take code that decides things before the model talks, not longer prompts.

## How to experiment

### In the app

Open the browser console and run `localStorage.acasPenaCoachStyle = 'legacy'`, then reload. Remove the key to go back to `natural`. Any name that isn't in `coachStyles` falls back to `natural`.

To try your own voice, add a style to `coachStyles`:

```js
calm: Object.freeze({ system: 'You are Pena…', events: true, cleanup: true })
```

The LoRA path (PCF) keeps its trained wording and skips the natural style.

### On the real model

[tests/voice-study.mjs](tests/voice-study.mjs) uses the app's prompt and filter helpers
against a local llama-server. It has its own request and presentation path, so
use the worker and service tests too when changing runtime behavior.

Start the server from PowerShell, using the runtime and model the app downloaded:

```powershell
$base = Join-Path $env:APPDATA 'acas-local-server\pena'
& (Join-Path $base 'runtime\b12633-win32-x64-cuda13\llama-server.exe') --host 127.0.0.1 --port 18927 --model (Join-Path $base 'models\Inkling-2-Mini-Uncensored-AD-IQ2_M.gguf') --alias pena-study --parallel 2 --ctx-size 16384 --n-gpu-layers 99 --ubatch-size 128 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --reasoning-budget 0 --threads 4 --jinja --no-webui --offline --log-disable
```

Then, from the repo root:

```powershell
node app\assets\engines\pena-v2\tests\voice-study.mjs prepare temp\pena-format-exp\positions.json 120
node app\assets\engines\pena-v2\tests\voice-study.mjs run nat-show 120
node app\assets\engines\pena-v2\tests\voice-study.mjs analyze base-show nat-show
node app\assets\engines\pena-v2\tests\voice-study.mjs show nat-show 20
```

- `prepare` builds `events.json` with Stockfish 8 records and move grades. Positions are an array of `{ id, fen, history, playerColor }`, where `history` holds the earlier FENs of that game.
- `run` saves one reply per event to `<label>.jsonl`, with both the raw and the filtered text.
- `analyze` counts the habits in the table above and the most repeated phrases.
- `show` prints replies to read, with the raw text whenever a filter changed it.

For whole-game acceptance, use complete histories rather than the independent
event sample:

```powershell
$s = 'app\assets\engines\pena-v2\tests\voice-study.mjs'
$env:PENA_STUDY_DIR = 'temp\pena-whole-game-study'
$env:PENA_STUDY_MODEL_ID = '<immutable GGUF SHA256>'
$env:PENA_STUDY_CHATTINESS = 'normal'
node $s prepare games.json --game
$env:PENA_STUDY_STYLE = 'legacy'; node $s game baseline-show
$env:PENA_STUDY_STYLE = 'natural'; node $s game natural-show
node $s analyze baseline-show natural-show
node $s compare baseline-show natural-show
```

Repeat with `PENA_STUDY_HIDE=1` and fresh labels. Runs shorter than 80 plies are
reported as segments, not as a completed 40-move acceptance sample. A changed
prompt, implementation, model identity or setting requires a new label. Missing
independent checker data is an explicit failure, not an accuracy pass. The study
does not itself measure audible ZONOS pronunciation or time to first physical audio.

Direct study requests read the served GGUF architecture and reuse the native
server's reasoning normalization. In particular, `inkling2_loop` needs 16 tokens
of per-block headroom even with effort none; forcing a zero budget can create
empty-thinking loops and invalidate a comparison with the app. The model identity,
architecture and actual request settings are part of the run provenance.
After the one allowed retry, a genuinely empty generation is saved as an explicit
failed event, not a successful silent comment. Studies continue to the next board
without putting the failure in conversation history. Generation failures are
reported separately from intentional silence and cannot count as accuracy passes.

You can steer a run with these environment variables:

| Variable | What it does |
|---|---|
| `PENA_STUDY_DIR` | Where events and results live. Default `temp\pena-voice-study`. |
| `PENA_STUDY_URL` | The llama-server address. Default `http://127.0.0.1:18927`. |
| `PENA_STUDY_STYLE` | A `coachStyles` name. Default `natural`. |
| `PENA_STUDY_SYSTEM` | A text file to try in place of the style's system prompt. This is the quickest way to test a prompt idea. |
| `PENA_STUDY_HIDE=1` | Turns on "Don't give away moves". |
| `PENA_STUDY_RETRY=0` | Skips the one retry after a markup loop, to see how often loops happen. |
| `PENA_STUDY_RAW=1` | Makes `analyze` count the model's text before any filter. |
| `PENA_STUDY_CANDIDATES=2` | Experimental sequential two-candidate selection after normal screening; saves both outputs, selected index, total tokens and wall time. Default is one. This is not shipped app behavior or production acceptance evidence. |

The `temp` folder is gitignored. The results behind the numbers above are in `temp\pena-voice-study` on the machine that ran them, and `temp\pena-format-exp\positions.json` holds the 2,000 game positions they came from. If you don't have them, any list of real game positions in the shape above works.

### Rules of thumb

- Use all 120 events before believing a change. With 40 events, a difference of 2 or 3 is noise.
- Compare the same event ids with the same seeds. The harness uses seed 9000 plus the event id.
- Run both show and hide. Hide mode has its own filter, and it can silence a whole comment.
- Use a fresh output label after changing a prompt or filter. `run` resumes by
  event id and does not check whether the code or prompt changed. `analyze`
  reads the saved `answer` fields, it does not rerun today's filters.
- Read 20 replies with `show` as well as looking at the counts. A filter can win on the counts and still sound broken.
- Keep the system message and the evidence the same between automatic comments and questions, and put per-comment text only in the last user message. That keeps the prompt cache warm.
- Don't change the event strings in [chat.js](chat.js), `(played SAN)` and `(position updated)`, or the turn headers in factsheet.js and english-board.js. Tests rely on them.
- Every new filter should have a "keeps real advice" test next to the "removes the habit" test in [tests/pena.test.mjs](tests/pena.test.mjs). Filters that eat real coaching are worse than the habit.

## The plan

The order below is roughly the most noticeable gain for the least work.
Keep the release gates above green throughout. Accuracy checks in step 6 are
a prerequisite for shipping changes in steps 3, 4 and 7. Measure each step with
the harness and note the numbers here.

### 1. Let the move grade decide whether to give a verdict

The evidence already rates every move the player makes. In the 60 played events, 35 were Best, Good or Excellent, and the model still says "Kf2 is fine, but…" out of habit.

- `analysePosition` in [conversation.js](conversation.js) puts the grade in `record.last.label` (line 214). Right now it only reaches the model as part of the factsheet text.
- Pass the label to `eventInstruction` through the worker message. `prepareInput` in app-worker.js already passes the FENs the same way.
- Turn it into a plain instruction:
  - For Best, Excellent and Good: "It was a good move, so don't grade it. Talk about what comes next."
  - For Inaccuracy and Weak Move: explain the small concession without overstating it as a major mistake.
  - For Mistake, Blunder and Catastrophic: "It was a mistake. Say plainly what it allowed."
  - For Neutral: describe what changed without calling a playable move a mistake.
- Done when "is fine" in played events drops from about 18 in 60 to 5 or fewer, and questions, turn talk and engine talk stay at zero in both show and hide.

### 2. Stay quiet when nothing is happening

A coach who talks after every single move gets tiring, however well they talk. The best fix for long sessions is fewer comments, not better ones.

- Decide in code, in `onPosition` (service.js around lines 1317 to 1336), before asking the model.
- Speak when:
  - the move was an inaccuracy or worse,
  - there's a threat in `record.threat`,
  - something is hanging,
  - the opponent's move changed the material, or
  - nothing has been said for a few moves.
- Stay quiet when the move was Best or Good and the position is calm.
- Consider a chattiness setting (quiet, normal, chatty) stored like the other Pena preferences.
- Done when about half the calm moves get no comment at the normal setting, every mistake and threat still gets one, and the player can still ask anything at any time.

### 3. Remember phrases across a game

Within one comment the voice is fine now. Across a game, "is hanging", "watch" and "don't rush" add up.

- Use the `game` mode in voice-study to play events in order through one game's `history`, so phrase repeats across comments can be measured.
- Keep the last few spoken comments. `rememberCommentary` in [commentary.js](commentary.js) already keeps the last 24 sentences for the non-chat path, and `repeated` there checks overlap.
- Try two ways and compare them:
  - Ask for two candidates and keep the one that overlaps least with recent comments. This never names a phrase to the model, so nothing gets primed. The app starts llama-server with `--parallel 1` ([nativeAI.js](../../../../appServer/backend/nativeAI.js) line 162), so two candidates either run one after the other or need a second slot, and the extra time has to be measured.
  - Mention the recent openers in the last user message, like "You started your last two comments with 'Your knight on'." Given what c1 showed, measure this carefully.
- Done when, over a 40-move game, no non-chess phrase of 2 or more words shows up in more than 3 of any 10 comments in a row.

### 4. Choose what each comment is about

Many comments describe one piece on one square. A coach mixes things up.

- In code, pick one focus per comment from what the record supports:
  - what the move did,
  - what the opponent wants now,
  - a plan for the next few moves,
  - a piece that's doing nothing,
  - a pawn structure or endgame idea worth learning, or
  - a short well done after a good find.
- Rotate the focus so the same kind doesn't come twice in a row unless the position demands it, like a hanging piece.
- Send it as part of `eventInstruction`, for example "Talk about their plan, not a single piece."
- Done when comments opening with "Your <piece> on" go from 35 in 120 to under 15, without making accuracy worse (see step 6).

### 5. Remember the player

The best coaching is "you keep doing this". Track recurring mistakes across games in local storage, like leaving pieces loose, missing checks, moving the queen early, or ignoring the opponent's last move.

- Mention a pattern only when it just happened again, and at most once every few games.
- Only use patterns that came from the move grades and the board facts, never from the model's own words.
- Done when a test with a scripted set of games shows the pattern mentioned once at the right moment and never otherwise.

### 6. Check accuracy on the natural path

The small IQ2_M model still mixes up geometry now and then, as in "leaves your h3 pawn hanging the bishop on g4". The shorter natural replies say less, so there's less to get wrong, but nobody has measured it yet.

- `temp\pena-format-exp\checker.mjs` (if you have it) checks board claims against the position. Run it on base and nat results to compare error rates per comment.
- If a sentence fails the board check, drop it before speaking, the same way the other reply checks work.
- Done when the natural style makes no more wrong board claims per comment than legacy.

### 7. Pacing for speech

Speech waits for the whole reply because the filters need complete sentences.

- The filters work sentence by sentence, so the first sentence could be checked and spoken as soon as the second one starts.
- Keep `polishCoaching` working on whole text for the history, and add a per-sentence path for speech.
- Done when the time to first audio drops noticeably on a normal comment, with no filtered sentence ever spoken.

### 8. Small leftovers

- In the old runs, an opener like "The position is White to move, move 4, with…" got through when it sat in the middle of a sentence. The natural prompt stopped it, but `dropTurnStatements` doesn't catch that shape.
- A sentence that mentions a note but also names squares, like "the pawn-chain note makes b2 the soft spot", is kept because it holds chess words. Rewording "the X note" out of such sentences would be nicer than keeping or dropping the whole thing.
- In hide mode, removing a sentence can leave the next one starting with a dangling "Now" or "So".
- The LoRA (PCF) path keeps its trained wording. Its training data should be regenerated in the new voice at some point.

## The thinking loop guard

The "no visible final answer" message came from the model printing `<|message_model|><|content_thinking|><|end_message|>` over and over with thinking turned off. That happened in about 8% of comments with the legacy prompt, and in none of the 240 natural ones. The guard stays as a safety net, all in app-worker.js.

- `generate` (line 338) stops a reply when thinking runs past a small limit with nothing visible yet. The limit is 64 tokens with effort none, and the thinking budget plus 96 otherwise.
- Visible text is cut where chat markup starts (`chatMarkup`, line 35), so a good answer followed by markup still gets spoken.
- `converse` (line 174) retries once with thinking off and a temperature of at least 0.4 when nothing visible came back (line 237).
- If that's still empty, the worker reports failure through the existing error
  UI, for automatic comments as well as typed questions. It never disguises a
  failed retry as a successful empty answer, and the error is not spoken.
- The mocked test lives at the end of [tests/local-worker.test.mjs](tests/local-worker.test.mjs).
