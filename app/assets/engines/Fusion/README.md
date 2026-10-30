# Fusion

Fusion uses the bundled **Maia 3 simplified ONNX model** as its mandatory
human-move prior, with **Stockfish 18 Lite Single** evaluating candidate quality.
It does not train a new network or substitute a different Maia checkpoint.

Stockfish alone supplies cp/mate scores, WDL estimates and continuation PVs;
Maia's outcome head and Fusion style bonuses never rewrite those quantities.
"Objective" means search-derived, not infallible: depth and node budgets still
limit what Stockfish can establish. Normal mixed selection requires a real
Stockfish score; if no mixed candidate qualifies, selection falls back to Maia
with the same personality and personal variation. Position evaluation stays
separate from the chosen human-style candidate's score, including forced mates.

## Human policy is required

- No Maia policy means **no move suggestion**, never raw Stockfish or a uniform
  imitation policy. This applies to intermediate output, stop, timeout, learning
  mode, and model/inference errors.
- Startup and inference recovery share a maximum of **three worker generations
  per Fusion instance**: the original worker plus two restarts. A retry uses a
  fresh Maia worker/session, not the same crashed object. Inference operations
  are serialized; queued roots that are no longer current are skipped.
- A load attempt times out after 45 seconds; an inference attempt after 10
  seconds. Backoff is bounded. Exhausting the shared restart allowance pauses
  uncached inference until the engine instance is explicitly recreated. There
  is no automatic reset on each position or new game that could loop forever.
- Successful policies are cached by full FEN and both clamped Elo inputs. A
  same-position cached policy is still a real Maia prediction, not a substitute.
- `Maia Wait` bounds extra waiting after Stockfish finishes. Remaining movetime
  caps it; clock searches add no wait. If time expires first, Fusion cancels that
  suggestion with an explanatory `info string` and `bestmove (none)`. In that
  case `(none)` means unavailable/cancelled, not necessarily game over. This is
  different from a quality-filter conflict: with a valid policy over allowed
  legal moves, Fusion always has Maia plus personality as its fallback.
- The app distinguishes that cancellation from a terminal board position and
  shows the reported warning rather than treating it as stalemate/checkmate.
- An explicit stop can use an already available human policy, including the
  Maia-style fallback if no mixed candidate qualifies. Without a policy it
  returns no suggestion. Late results cannot finish a different search.

## Advanced Elo: depth is not a rating

Enable **Advanced Elo** to use the manually configured Depth or Search Nodes and
the dynamically loaded UCI controls. The regular Engine Elo **and Opponent Elo**
fields are disabled/blurred in this mode; `UCI_Elo` and `Enemy_Elo` in the advanced
panel are the applicable Maia inputs.

With **Depth = 1, Search Nodes = 0, and advanced UCI_Elo = 3200**:

1. The app sends `go depth 1`; the Elo value does not override it.
2. Maia receives **3200**. Both Fusion rating inputs now accept 600–3200 instead
   of the previous conservative 2600 cap. Values above 2600 are uncalibrated
   assumptions for the bundled model, not a measured strength claim.
3. Maia still predicts moves with its full neural forward pass. Its computation
   is not an iterative tree search controlled by `depth`.
4. Stockfish supplies a nominal depth-1 check of alternatives. This is shallow
   tactical protection, not a guarantee of 3200 playing strength. Depth 1 also
   does not mean exactly one ply is ever visited: selective/quiescence search
   can extend tactical lines.

A **positive Search Nodes value takes precedence over Depth** in this app.
Stockfish remains full-skill internally; Basic Elo maps to the app's search-depth
settings, not random Stockfish skill weakening. No Fusion Elo has been measured.
The shared Opponent Elo GUI field also accepts 600–3200. Standalone Maia 3
retains its app range of 600–2600 and Maia 2 1100–2000. Applying either saved
rating outside those ranges warns and clamps the engine input, including when
switching back from Fusion, without rewriting saved values.

## Dynamically loaded UCI controls

| Option | Meaning |
| --- | --- |
| Stockfish Weight | 0–95; default 60. Higher adds a stronger objective-quality penalty. It is not a percentage of moves chosen from one engine. Maia is always required. Old saved 100 values are clamped to 95. |
| Personality | One of the styles below. These are Fusion heuristics, not learned Maia personality embeddings. |
| UCI_Elo / Enemy_Elo | Rating assumptions for the side to move and its opponent, 600–3200. Defaults 2600 / 1500 in Advanced Elo; not measured engine ratings. |
| MultiPV | Number of candidate suggestions returned. |
| Candidate Moves | Default 16: minimum number of Stockfish alternatives requested in mixed mode, at least MultiPV and at most the allowed-move count. More alternatives cost time. At weight 0, all legal root moves are requested for scoring. |
| Maia Temperature | Percentage scale; 100 = base temperature. Lower sharpens the human prior, higher flattens it. Personality supplies an additional multiplier. |
| Personality Strength | Default 100%; controls bounded named-style log-probability adjustments. 0 disables named style bonuses, not the personality's temperature/safety settings or Personal Variation. |
| Human Plausibility | Minimum Maia probability **relative to its most likely allowed move**, in percent. Default 50 means a move must have at least half of that move's probability. Applies before style or objective scoring, including sampling. |
| Score Window | Default 100 cp: scale for the objective penalty; smaller favors quality more strongly. |
| Tactical Safety | Enabled by default for mixed selection, including secondary MultiPV lines. Loss is measured against Stockfish's best evaluated allowed move, even if that move is not Maia-plausible. If none qualifies, Fusion explicitly falls back to Maia plus style without this safety veto. |
| Max Centipawn Loss | Default 50 cp: base quality-loss window; personality adjusts tolerance. Forced-mate root scores require the same objective mate score. |
| Randomness / Top P | Chance to sample, and nucleus cutoff for that sampling pool. Default randomness 0 uses deterministic ranking for a fixed policy and evaluations. |
| Random Seed | Default 0 uses the browser/app origin's saved identity. A positive seed overrides it for the profile. Controls both stable individual style and any optional sampling. |
| Personal Variation | Default 35 (0–100): small fixed preferences derived from the seed. 0 disables individual style variation, independently of named Personality Strength. |
| Maia Wait | Maximum additional milliseconds to wait for mandatory Maia after Stockfish finishes; expiry cancels the suggestion. |
| Hash / Move Overhead / UCI_ShowWDL | Stockfish memory (MB), time overhead (ms), and WDL reporting. Single-thread build. |
| Clear Hash | Clears Stockfish's hash and the small Maia result cache; does not reset the recovery budget. |

For evaluated, plausible alternatives, selection uses:

```text
log(Maia probability) / temperature
    + bounded personality adjustment
    - weight / (1 - weight) * centipawn loss / score window
```

Human Plausibility always defines the allowed policy pool, including fallback.
Normal mixed selection uses scored candidates that pass Tactical Safety. If that
pool is empty, Fusion ranks the full plausible Maia pool using the same
temperature, personality and seeded personal variation, bypassing Stockfish's
selection penalty and safety veto. A completion diagnostic identifies that
fallback. Optional sampling uses this human-style pool with the same seed and
Top P controls; it does not reapply the failed safety constraint.

The fallback can choose a move that Stockfish considers unsafe or has not
searched. Actual candidate scores and PVs are retained where available; an
unsearched fallback has a one-move PV and no fabricated cp/mate/WDL. Stockfish's
root evaluation stays separate and can still be displayed. Missing candidate
scores are also kept missing in display data and learning-mode records, rather
than becoming 0 cp. Each published ranking replaces the previous suggestion set,
so fewer fallback moves cannot retain stale secondary lines or future arrows.
Webhook score and PV fields use the primary suggestion, not the last secondary
MultiPV line; an unscored primary leaves its evaluation fields absent.

Weight 0 explicitly uses Maia plus style without objective penalties or safety
filtering. Restricted searches always honor the allowed moves. With a valid
Maia policy assigning positive probability to at least one allowed legal move,
selection returns a move, even if no Stockfish candidate qualifies. Invalid or
missing policies, terminal positions and empty restrictions still cannot yield
a valid human-policy move; no raw Stockfish or random legal move is substituted.

## Persistent individual style

The GUI generates a cryptographic nonzero seed once and saves it under
`acas.fusion.identitySeed.v1` in localStorage. It passes that seed through the
Fusion worker URL before initialization. Each browser/app origin shares one
identity across its boards, profiles, games and worker restarts unless an
explicit positive Random Seed overrides it. Failed storage falls back to the
same seed for this GUI tab session, with a console warning. A raw worker loaded
without an identity URL gets only a worker-lifetime seed, not durable storage.

Five seeded axes add correlated style preferences: defence, initiative,
strategy, simplification and caution. They are fixed across positions, not
random noise assigned independently to each move. Their log-odds contribution
is bounded to ±0.5 before the overall style cap. Named personality bonuses and
personal variation never change factual scores or eligibility thresholds.

Default Randomness remains 0. Optional sampling uses separate deterministic
seed/position salts for the sampling gate and selection, ignoring the FEN's
halfmove/fullmove counters. It does not reroll whenever a search is repeated.
Depth, hash/search history or inference differences can still change rankings;
seeds cannot guarantee unique moves or human-indistinguishable behavior.
These are intentional starting defaults, not benchmark-proven optimal settings.
Existing saved overrides remain in effect rather than being overwritten.

## Personalities

| Personality | Intended preferences |
| --- | --- |
| Balanced | No named-style bonuses; retains any configured Personal Variation. |
| Human | Flatter human policy and a wider safety window. |
| Solid | Pawn shelter, relieving king pressure, saving attacked material. |
| Aggressive | Checks, captures, forward play and pawn approaches to the enemy king. |
| Positional | Development, centralization, shelter and less early queen wandering. |
| Tactical | Sharper policy, checks/captures and tighter quality tolerance. |
| Bunker Goblin | Extremely shelter-conscious; castles, protects the king and dislikes pawn storms. |
| Porcupine Accountant | Obsessively saves attacked pieces, simplifies by captures, and protects shelter. |
| Paranoid Turtle | Strongly defensive; retreats, reduces king pressure and dislikes unnecessary advances. |
| Caffeinated Squirrel | Flatter policy with energetic checks, development and pawn storms. |
| Queen Retirement Club | Simplification and queen-trade opportunities; less early queen activity. |

Features compare the actual board before and after each legal move. Defensive
features include king-ring pressure, forward pawn shelter, and changes in
attacked material (with a smaller penalty for geometrically defended material).
Shelter and king-ring preferences taper in the endgame. These are bounded,
shallow geometric style features, not tactical proofs or empirically validated
human archetypes. Fun presets can sacrifice strength, especially with permissive
quality settings. No heuristic can guarantee that every move looks human.

## App integration

- Standard chess only, not Chess960 or fairy variants.
- Accepts app worker envelopes and raw UCI, handshake/readiness, FEN/startpos plus
  move lists, new game, stop/quit, depth/node/time/clock limits and ponderhit.
- Moves on demand filters both engines to legal `searchmoves`, expanding
  unsuffixed promotion destinations into legal promotion moves.
- Stockfish MultiPV uses coherent completed iterations and supplies objective
  cp/mate values, WDL and continuation PVs. `rootcp` / `rootmate` keep root
  evaluation separate from a style-selected candidate's evaluation. `rootwdl`
  aligns the main WDL display with that objective reference. `rootmove`
  and `rootpv` record the real objective reference for learning-mode grading;
  they are metadata, not replacement human suggestions.
- Learning mode disables sampling but retains mandatory Maia and personality
  ranking; it does not silently become Stockfish. Objective scores remain
  available for feedback independently of the suggested human move.
- Model readiness is awaited before the app marks the worker loaded, avoiding
  a first search racing the initial download. If initialization exhausts its
  budget, the worker remains responsive for clear no-suggestion/error output.

## Research reviewed

- CSSLab `maia3/models.py` and `maia3/uci.py`, repository tree
  `1e13597c42d4858b7cfd7cfdae01e297263364b2`: separate self/opponent Elo inputs,
  legal-move masking, policy temperature/nucleus sampling, separate outcome head.
- Monroe et al., **Chessformer: A Unified Architecture for Chess Modeling**,
  arXiv:2605.19091 (2026). Board-square tokens, geometry-aware attention,
  and distinct human-move-prediction vs playing-strength objectives.
- Tang et al., **Maia-2: A Unified Model for Human-AI Alignment in Chess**,
  NeurIPS 2024; arXiv:2409.20553. Skill-conditioned human behavior is distinct
  from optimal-move search.

The papers motivate retaining a learned human prior. They do **not** establish
the playing strength, fidelity or correctness of Fusion's handcrafted styles.
Fusion continues to use the app's existing simplified ONNX interface rather
than assuming compatibility with every upstream model/history configuration.

## Validation

Reviewed statically against the worker protocol, dynamic options and search
callers, including mixed selection, Maia fallback, weight 0, missing policy,
restricted/promotion moves, unscored records, ranking replacement and primary-line
webhooks. No terminal commands, live browser/WASM execution, tests or strength
tournaments were run in this session. Runtime behavior and Elo remain unverified.