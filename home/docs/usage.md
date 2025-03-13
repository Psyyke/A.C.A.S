# Usage

Using A.C.A.S is easy! Once you have the userscript installed, just keep the <a target="_about" href="../">GUI</a> open while you're playing on a chess site. By default, the moves it suggests will show up directly on the board you're playing on.

!>Press Ctrl+D (Cmd+D for Mac) to bookmark this page.

<a id="lottie-animation"/>

## Chess Sites Compatibility  

Most chess sites are supported! If the one you're playing on isn't, please let us know!

| Category       | Sites |
|---------------|-------|
| **Battletested** (Should work flawlessly) | [Chess.com](https://www.chess.com/play), [Lichess.org](https://www.lichess.org), [Playstrategy.org](https://playstrategy.org), [Pychess.org](https://www.pychess.org/), [Chess.net](http://chess.net/) |
| **Stable** (Works fine, but might have some minor bugs) | [EdChess.io](https://app.edchess.io/), [Chess.org](https://chess.org), [Papergames.io](https://papergames.io/en/chess), [Vole.wtf](https://vole.wtf/kilobytes-gambit/), [Coolmathgames.com](https://www.coolmathgames.com/0-chess) |
| **Uncertain** (Might work fine, be buggy, or not work at all) | [Chessarena.com](https://chessarena.com/lobby), [Gameknot.com](https://gameknot.com), [Redhotpawn.com](https://redhotpawn.com), [Chessworld.net](https://chessworld.net), [Simplechess.com](https://www.simplechess.com/), [Immortal.game](https://immortal.game/), [Freechess.club](https://www.freechess.club/), [Chessclub.com](https://www.chessclub.com), [Chesstempo.com](https://www.chesstempo.com) |

>This table might be outdated. Check out the supported sites by clicking on the <a target="_about" href="../?hl=supportedSites">see all supported sites</a> button.

## Control Panel

The <a target="_about" href="../?hl=controlPanel">settings control panel</a> has buttons to show hidden settings and to load, save and reset the settings. You can use it to share your settings with your friends or the community, or load someone's settings.

## Profiles

You can use <a target="_about" href="../?shl=chessEngineProfile">profiles</a> to run multiple chess engines at once. Keep in mind that some features might not work well with multiple engines running, but most should work fine. If you notice some feature acting weirdly with multiple engines, don't be alarmed.

Profiles can also be used to just store different configurations if you <a target="_about" href="../?shl=engineEnabled">disable the engine</a>.

## Settings

#### ⚙️ Floating Panel

The <a target="_about" href="../?shl=pip">Floating Panel</a> setting creates a small "*Picture-in-Picture*" view you can resize to be even smaller that will stay on top of every window. It contains important information about the current match.

!>This setting is very important to know for non-Firefox users because it stops A.C.A.S from freezing, and makes the engine run faster! Firefox users and those that do not want to use this can just create two browser windows next to each other, so that the A.C.A.S tab is visible, even if just a little bit, which also stops A.C.A.S tab from freezing.

#### ⚙️ Chess Engine

The <a target="_about" href="../?shl=chessEngine">Chess Engine</a> setting changes the engine which is used to calculate moves. We recommend using **Fairy Stockfish 14** as you can play chess variants with it and its the most optimized for A.C.A.S. Other engines might be unstable as they haven't been tested so much on A.C.A.S.

| Engine | For |
|-----|-----|
| Fairy Stockfish 14 | Chess variants and strong gameplay |
| Stockfish <17 | The strongest gameplay |
| Lc0 with Maia | Realistic human-like gameplay |
| Lozza 5 | Pretty strong engine-like gameplay |

!>A.C.A.S also takes other information from the engine's results to give you insights into the match. Some engines offer less of extra information which cannot then be analyzed. Use Stockfish for best results.

#### ⚙️ Chess Variant

The <a target="_about" href="../?shl=chessVariant">Chess Variant</a> setting changes the type of chess Fairy Stockfish plays. Other engines don’t really support it, but most do support <a target="_about" href="../?shl=useChess960">Chess 960</a>, which is a variant of chess in which the piece starting positions are randomized.

>Most users do not play chess variants, **you most likely do not need to change this nor the <a target="_about" href="../?shl=useChess960">Chess 960</a>**. If you happen to play a variant, A.C.A.S should automatically detect the chess variant you're playing if its supported.

#### ⚙️ Engine Elo

The <a target="_about" href="../?shl=engineElo">Engine Elo</a> setting controls how strong the engine plays (between 500-3200 elo). Note that engines like Stockfish are **very strong**, playing way above human 3000 elo. For that reason, making them play at low elo (below 1500) might result in weird behaviour. Stockfish cannot really play extremely low elo (below 1000). Lc0 is better suited for that.

<img src="img/chart.png">

#### ⚙️ Weights

The <a target="_about" href="../?shl=lc0Weight">Lc0 Weights</a> setting determines how the Lc0 engine plays. The weight controls the engine's playing style, influencing the decisions it makes while playing. **Maia weights** have the elo they're roughly playing at marked on them. The elo and playing style of other weights is not known, but most of them are quite weak.

!>Most weights A.C.A.S has, Maia specifically, are designed to only use 1 search node. It's fine that it goes just to depth 1. Using more than 1 search node might cause weird behavior.

#### ⚙️ Moves On External Site

The <a target="_about" href="../?shl=displayMovesOnExternalSite">Moves On External Site</a> setting adds details about the move (*such has the arrow*) to the external site, which could be Chess.com for example, directly on the board you're playing on.

!>Chess sites *could* implement detections to this. Right now no site seems to detect it, but if you're extra worried, disable this, it doesn't matter if you're not following the engine moves.

#### ⚙️ Theme Color
<a target="_about" href="../?shl=themeColorHex">Theme Color</a> setting and the settings below it allow you to change the theme to your liking.

##### Default Arrow Meaning

| Color    | Meaning  |
|----------------------|----------------------|
| 🟩 | Best Move |
| 🟦 | Secondary Move |
| 🟥 | Enemy Move |

> Enemy move is shown if <a target="_about" href="../?shl=showOpponentMoveGuess">Opponent Move Guess</a> setting is activated and the square an arrow starts from is hovered. The enemy move arrow is just a guess made by the engine and means that the engine thinks after you make the move the arrow suggests, the enemy will make the move the enemy arrow suggests.