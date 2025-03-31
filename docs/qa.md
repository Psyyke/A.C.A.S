# Q&A 🤔

## Chess Engine Terms Explained  

| Term          | Explanation |
|--------------|-------------|
| **Move**     | A chess engine considers different possible ways a piece can be moved. Each time a piece moves from one square to another, it is called a "move." |
| **Half-Move (Ply)** | A single action by one player. In chess, one complete turn consists of two half-moves (plies)—one for White and one for Black. |
| **Depth**    | The number of half-moves (plies) the engine looks ahead when calculating moves. A higher depth usually means better decision-making but requires more processing time. |
| **Evaluation (Eval)** | A numerical value that represents how good or bad a position is for a player. A positive value means White is better, while a negative value means Black is better. A.C.A.S displays this visually using a bar next to the board, a mostly white bar means white is winning. |
| **Nodes**    | The number of possible positions the engine has analyzed. The more nodes the engine checks, the deeper and more accurate its calculations can be. |
| **NNUE (Neural Network)** | A neural network evaluation system used in modern engines to assess positions more accurately than traditional evaluation methods. It allows engines to make stronger and more human-like decisions. |
| **Movetime** | The amount of time the engine has to think before making a move. More time results in stronger moves, while less time leads to faster but potentially weaker decisions. |
| **Chess Elo (Rating)** | A numerical system used to measure a player’s (or an engine's) strength. Beginner players are usually rated under 1000, while strong club players range from 1600–2200. Grandmasters are typically 2500+, and top chess engines like Stockfish and Lc0 can reach ratings above 3500. |
| **Fen** | The first part of FEN describes where all the pieces are on the board. Each rank (row) is written from left to right, and empty squares are shown as numbers. Example: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR is the starting position. |

### How to play more legit?

Vary move times, avoid perfect accuracy, allow position swings, be mindful of blurs (changing tabs), balance speed and accuracy, limit fast moves in longer games, match your rating, avoid extreme consistency and so on...

Whew, that’s a lot of stuff! AI detection systems track all kinds of patterns, making it really hard to cheat without getting caught. Honestly, just play legit—it's way easier and more fun. You could disable the <a target="_about" href="app?shl=displayMovesOnExternalSite">Moves On External Site</a> setting, so that you don't see them all the time, that way you're playing yourself but still have a helping hand when needed, that way you can actually learn.

<div class="gas"></div>

### Why is it not working?

If it's not working at all, the site might be unsupported or modified in a way which broke A.C.A.S and we need to update it. In that case, please report it to us. Some edge-cases, like unpopular devices and special Linux distros may not work for some reason. We still want A.C.A.S to work on most devices, so let us know if it doesn't work at all.

Before making any reports or negative reviews, please read the [troubleshoot](docs/troubleshoot) site first.

### Does this have an automove setting?

Yes, A.C.A.S has automove (a bot that plays for you) that is currently only supported on Chess.com. This feature is hidden by default to prevent abuse of the feature, as most people that use automove use it on real online matches, which is against the Terms of Service. It is mostly used for debugging and quality control purposes.

### Why did I get banned, wasn't this impossible to detect?

Chess engines simply play differently than humans. It's fairly easy to detect by pure statistics. For example, chess.com bans about 16 000 players for fair play abuse each month. You too will get banned if you rely too much on the suggested moves and play unfairly.

Your ban most likely wasn't because of the site detecting A.C.A.S *directly*, it was because of your "suspicious behaviour patterns" (move times and such). This is something A.C.A.S cannot really fix, unless there would exist a bot that could play exactly like a human. For now, it's your responsiblity to play as a human and be fair to others.

Don't want to get banned again? Don't use A.C.A.S against other humans.

---

*Didn't find what you were looking for? Perhaps the [troubleshoot](docs/troubleshoot) page can help?*