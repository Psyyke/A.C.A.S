# A.C.A.S (Advanced Chess Assistance System)

> **Warning** A.C.A.S is currently in development. Expect bugs, especially on variants.

A.C.A.S is an **advanced chess assistance system** (some might even call it a "*cheat*") which enhances your chess performance with cutting-edge real-time move analysis. Just install the userscript, open the A.C.A.S GUI and you're good to go! No downloading needed.

* No anti-features (*e.g. ads, tracking*)
* Supports the most popular chess game sites (*e.g. chess.com, lichess.org*)
* Supports multiple move suggestions, move arrow markings, chess variants & fonts
* Impossible to detect (well, you can never be sure, so let's say it's *almost* impossible)

> **Note** Please be advised that the use of A.C.A.S may violate the rules and lead to disqualification or banning from tournaments and online platforms. The developers of A.C.A.S and related systems will NOT be held accountable for any consequences resulting from its use. We strongly advise to use A.C.A.S only in a controlled environment ethically.

| [▶️ Open A.C.A.S](https://hakorr.github.io/A.C.A.S/) | [⬇️ Install (Direct)](https://github.com/Hakorr/A.C.A.S/raw/main/acas.user.js)   | [⬇️ Install (GreasyFork)](https://greasyfork.org/en/scripts/459137-a-c-a-s-advanced-chess-assistance-system)  |
|-------|-------|-------|

## Example Gameplay

<img src="https://github.com/Hakorr/A.C.A.S/assets/76921756/9a6dcab4-04db-4409-8f9f-3d871120746c" alt="example-gameplay" style="width:85%;"/>

## Getting Started

Simply [install the A.C.A.S userscript](https://github.com/Hakorr/A.C.A.S/raw/main/acas.user.js), open the [A.C.A.S GUI](https://hakorr.github.io/A.C.A.S/) and a supported chess game site. Then, just start playing!

> **Note**
> You need to keep the A.C.A.S GUI tab active to keep the whole system functional. Think of the tab as an engine of a car, the userscript alone is simply an empty hull, it won't run, nor move. The A.C.A.S GUI has the chess engine which calculates the moves.
> 

## Fundamental Idea

| A.C.A.S (Tab #1)    | Chess Website (Tab #2)  |
|----------------------|----------------------|
| ![image](https://github.com/Hakorr/A.C.A.S/assets/76921756/750998aa-061e-478a-a2c2-5e7c5b341775) | ![image](https://github.com/Hakorr/A.C.A.S/assets/76921756/ad87db6b-4dc5-4443-8405-29ad140d5894) |
| The engine runs on a completely different tab than the chess game page, completely isolated from it. The site cannot block the usage of A.C.A.S. | A.C.A.S sends move data via [CommLink](https://github.com/AugmentedWeb/CommLink) and the userscript displays the data on the board using [UniversalBoardDrawer](https://github.com/Hakorr/UniversalBoardDrawer). (*If "Display Moves On External Site" setting is activated!*) |

### Arrow Meaning

| Color    | Meaning  |
|----------------------|----------------------|
| 🟩 | Best Move |
| 🟦 | Secondary Move |
| 🟥 | Enemy Move |

> **Note** Enemy move is shown if "*Display Opponent Move Guess*" setting is activated and the square an arrow starts from is hovered. The enemy move arrow is just a guess made by the engine and means that the engine thinks after you make the move the arrow suggests, the enemy will make the move the enemy arrow suggests.

## Q&A

### Why doesn't it work?

Before making an issue, please read these,

- Make sure the [A.C.A.S GUI](https://hakorr.github.io/A.C.A.S/) is active. Do not close the tab. Browsers freeze code execution on inactive pages, you need to visit the A.C.A.S GUI tab from time to time or keep it open on a separate window. This prevents A.C.A.S from freezing and not giving any move suggestions, for example.

- Do you not see any moves displayed on the chess site? Are you sure you have enabled "Display Moves On External Site" box on the A.C.A.S GUI settings? After enabling that setting, please refresh the chess site to see changes.

- Are you trying to play variants on Chess.com? If so, it's not currently supported very well since I had to rush the project, sorry! Other sites with variants might also be buggy, you can make an issue about that if you want.

Otherwise, it could be a bug, please make an issue [here](https://github.com/Hakorr/Userscripts/issues).

## Used Libraries

* [Fairy Stockfish WASM](https://github.com/fairy-stockfish/fairy-stockfish.wasm) (*the chess engine of A.C.A.S*)
* [COI-Serviceworker](https://github.com/gzuidhof/coi-serviceworker) (*allowing WASM on GitHub pages, extremely important library!!!*)
* [Chessground X](https://github.com/gbtami/chessgroundx) (*for displaying a board on the GUI. Modified the library a bit*)
* [FileSaver](http://purl.eligrey.com/github/FileSaver.js) (*for saving the config file*)

## Used Libraries (Made for A.C.A.S)

* [UniversalBoardDrawer](https://github.com/Hakorr/UniversalBoardDrawer) (*for drawing arrows on the GUI and the chess site chessboards*)
* [CommLink](https://github.com/AugmentedWeb/CommLink) (*for cross-window communication between the GUI tab and chess sites*)

## Other

You can find the userscript on [GreasyFork](https://greasyfork.org/en/scripts/459137-a-c-a-s-advanced-chess-assistance-system) as well.

You can find A.C.A.S v1 [here](https://github.com/Hakorr/Userscripts/tree/main/Other/A.C.A.S). It is no longer updated.
