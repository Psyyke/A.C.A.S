# Usage 📖

Using A.C.A.S is easy! Once you have the userscript installed, just keep the <a target="_about" href="app">GUI</a> open while you're playing on a chess site. By default, the moves it suggests will show up directly on the board you're playing on.

!>Press Ctrl+D (Cmd+D for Mac) to bookmark this page.

<a id="lottie-animation"/>

## Chess Sites Compatibility 🔗

Most chess sites are supported! If the one you're playing on isn't, please let us know!

| Category       | Sites |
|---------------|-------|
| **Battletested** (Should work flawlessly) | [Chess.com](https://www.chess.com/play), [Lichess.org](https://www.lichess.org), [Playstrategy.org](https://playstrategy.org), [Pychess.org](https://www.pychess.org/), [Chess.net](http://chess.net/) |
| **Stable** (Works fine, but might have some minor bugs) | [EdChess.io](https://app.edchess.io/), [Chess.org](https://chess.org), [Papergames.io](https://papergames.io/en/chess), [Vole.wtf](https://vole.wtf/kilobytes-gambit/), [Coolmathgames.com](https://www.coolmathgames.com/0-chess) |
| **Uncertain** (Might work fine, be buggy, or not work at all) | [Chessarena.com](https://chessarena.com/lobby), [Gameknot.com](https://gameknot.com), [Redhotpawn.com](https://redhotpawn.com), [Chessworld.net](https://chessworld.net), [Simplechess.com](https://www.simplechess.com/), [Immortal.game](https://immortal.game/), [Freechess.club](https://www.freechess.club/), [Chessclub.com](https://www.chessclub.com), [Chesstempo.com](https://www.chesstempo.com) |

>This table might be outdated. Check out the supported sites by clicking on the <a target="_about" href="app?hl=supportedSites">see all supported sites</a> button.

## Control Panel 🖥️

The <a target="_about" href="app?hl=controlPanel">settings control panel</a> has buttons to show hidden settings and to load, save and reset the settings. You can use it to share your settings with your friends or the community, or load someone's settings.

## Profiles 👥

You can use <a target="_about" href="app?shl=chessEngineProfile">profiles</a> to run multiple chess engines at once. Keep in mind that some features might not work well with multiple engines running, but most should work fine. If you notice some feature acting weirdly with multiple engines, don't be alarmed.

Profiles can also be used to just store different configurations if you <a target="_about" href="app?shl=engineEnabled">disable the engine</a>.

## Languages 🌐

<img src="assets/images/example5.png">


You can change the language using the flag dropdown found on the top right on the <a target="_about" href="app">GUI</a>.

## Settings

#### ⚙️ Floating Panel

The <a target="_about" href="app?shl=pip">Floating Panel</a> setting creates a small "*Picture-in-Picture*" view you can resize to be even smaller that will stay on top of every window. It contains important information about the current match.

!>This setting is very important to know for non-Firefox users because it stops A.C.A.S from freezing, and makes the engine run faster! Firefox users and those that do not want to use this can just create two browser windows next to each other, so that the A.C.A.S tab is visible, even if just a little bit, which also stops A.C.A.S tab from freezing.

#### ⚙️ Chess Engine

The <a target="_about" href="app?shl=chessEngine">Chess Engine</a> setting changes the engine which is used to calculate moves. We recommend using **Fairy Stockfish 14** as you can play chess variants with it and its the most optimized for A.C.A.S. Other engines might be unstable as they haven't been tested so much on A.C.A.S.

| Engine | For |
|-----|-----|
| Fairy Stockfish 14 | Chess variants and strong gameplay |
| Stockfish <17 | The strongest gameplay |
| Lc0 with Maia | Realistic human-like gameplay |
| Lozza 5 | Pretty strong engine-like gameplay |

!>A.C.A.S also takes other information from the engine's results to give you insights into the match. Some engines offer less of extra information which cannot then be analyzed. Use Stockfish for best results.

<div class="gas"></div>

#### ⚙️ Chess Variant

!>Most users do not play chess variants, **you most likely do not need to change this nor the <a target="_about" href="app?shl=useChess960">Chess 960</a>**. If you happen to play a variant, A.C.A.S should automatically detect the chess variant you're playing if its supported.

The <a target="_about" href="app?shl=chessVariant">Chess Variant</a> setting changes the type of chess Fairy Stockfish plays. Other engines don’t really support it, but most do support <a target="_about" href="app?shl=useChess960">Chess 960</a>, which is a variant of chess in which the piece starting positions are randomized. If you happen to play variants, you need to use Fairy Stockfish <a target="_about" href="app?shl=chessEngine">Chess Engine</a>. You can access it via `?sab=true`.

#### ⚙️ Engine Elo

The <a target="_about" href="app?shl=engineElo">Engine Elo</a> setting controls how strong the engine plays (between 500-3200 elo). Note that engines like Stockfish are **very strong**, playing way above human 3000 elo. For that reason, making them play at low elo (below 1500) might result in weird behaviour. Stockfish cannot really play extremely low elo (below 1000). Lc0 is better suited for that.

<img src="assets/images/chart.png">

#### ⚙️ Weights

The <a target="_about" href="app?shl=lc0Weight">Lc0 Weights</a> setting determines how the Lc0 engine plays. The weight controls the engine's playing style, influencing the decisions it makes while playing. **Maia weights** have the elo they're roughly playing at marked on them. The elo and playing style of other weights is not known, but most of them are quite weak. You can access the Lc0 engine via `?sab=true`.

!>Most weights A.C.A.S has, Maia specifically, are designed to only use 1 search node. It's fine that it goes just to depth 1. Using more than 1 search node might cause weird behavior.

#### ⚙️ Moves On External Site

The <a target="_about" href="app?shl=displayMovesOnExternalSite">Moves On External Site</a> setting adds details about the move (*such has the arrow*) to the external site, which could be Chess.com for example, directly on the board you're playing on.

!>Chess sites *could* implement detections to this. Right now no site seems to detect it, but if you're extra worried, disable this, it doesn't matter if you're not following the engine moves.

#### ⚙️ Theme Color
<a target="_about" href="app?shl=themeColorHex">Theme Color</a> setting and the settings below it allow you to change the theme to your liking.

##### Default Arrow Meaning

| Color    | Meaning  |
|----------------------|----------------------|
| 🟩 | Best Move |
| 🟦 | Secondary Move |
| 🟥 | Enemy Move |

> Enemy move is shown if <a target="_about" href="app?shl=showOpponentMoveGuess">Opponent Move Guess</a> setting is activated and the square an arrow starts from is hovered. The enemy move arrow is just a guess made by the engine and means that the engine thinks after you make the move the arrow suggests, the enemy will make the move the enemy arrow suggests.

<div class="gas"></div>

## Render Settings

The rendering settings allow you to display various metrics about the match. These features do not use the chess engine and don't go into great depths if any at all. The features don't give you straight answers on what to do, but just show you the **current** situation on the board. Could be great features for learning.

<img src="assets/images/render-example.png">

#### ⚙️ Colors

> You can often change the board background color on chess sites. If its hard to see the colors, change the board to be something more white and not so colored.

**Green** squares indicate that **at least one of your piece** is defending that square, and that the enemy **does not have any pieces attacking them**. The same goes for **Red** squares, however it indicates that **none of your pieces attack that square** and that the enemy has **at least one piece defending that square**.

**Orange** indicates that the square is **contested**, which means that *at least one* of your- and the enemy's piece attacks/defends it. On the other hand, **Aqua** means that there is no activity on that square, no one is defending it, nor attacking it.

#### ⚙️ Contested Squares

The <a target="_about" href="app?shl=renderSquareContested">Contested Squares</a> setting displays contested squares with the color orange. For clarity, fire emojis 🔥 indicate **contested squares** too. If two fire emojis are stacked it means there are 4 or 5 pieces attacking that square. 3 fire emojis stacked mean there are 6 or 7 pieces attacking that square, 4 fire emojis mean that 8 or 9 pieces are attacking it, and so fourth.

The fire emoji can have text, for example, 🔥 with -2 text means that the square is defended by 2 less pieces than the enemy attacks it with (e.g. you have 1 piece defending the square, the enemy has 3 pieces attacking it, so 1 - 3 = -2). +2 means that you have 2 more pieces attacking the specific square than the enemy does (e.g. you attack a square with 4 pieces and the enemy defends it with only 2, so 4 - 2 = 2).

#### ⚙️ Own Piece Capture

The <a target="_about" href="app?shl=renderPiecePlayerCapture">Own Piece Capture</a> setting displays your vulnerable pieces. The teardrop emoji 💧 appears on **your pieces** which are vulnerable to attack. It takes into account the value of the pieces, so it doesn't appear if, for example, an enemy **Queen** attacks your **Rook** which is protected. However, if an enemy **Rook** was to attack your **Queen**, 💧 would appear on your **Queen**.

#### ⚙️ Enemy Piece Capture

The <a target="_about" href="app?shl=renderPieceEnemyCapture">Enemy Piece Capture</a> setting displays vulnerable enemy pieces. The bleed emoji 🩸 appears on **enemy pieces** which are vulnerable to attack. It takes into account the value of the pieces, so it doesn't appear if, for example, your **Queen** attacks an enemy **Rook** which is protected. However, if your **Rook** was to attack an enemy **Queen**, 🩸 would appear on the enemy **Queen**.

## Advanced Elo Settings

Unfortunately, many of these settings don't seem to do anything, and they most likely don't. Engines running on the browser have strict limitations and they aren't as configurable as locally running engines. For each setting to work, the engine has to have implemented support them. Small engines like Lozza 5 probably don't support anything other than depth, maybe skill level.

With our testing we didn't seem to get "threads" nor "hash" to work and "maximum error" along with "probability" settings also had no impact or weren't supported at all. If you're modifying the hashtable size, make sure to refresh the page or start a new engine to see results, but it's probably not worth it to mess with them.

---

*Didn't find what you were looking for? Perhaps the [troubleshoot](docs/troubleshoot) page can help?*

*Want to learn even more? Visit the [philosophy](docs/philosophy) page!*