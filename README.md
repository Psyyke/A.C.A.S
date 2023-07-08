# A.C.A.S (Advanced Chess Assistance System)

A.C.A.S is an **advanced chess assistance system** system which enhances your chess performance with cutting-edge real-time move analysis. Just install the userscript, open the A.C.A.S GUI and you're good to go! No downloading needed.

* No anti-features (*e.g. ads, tracking*)
* Supports the most popular chess game sites (*e.g. chess.com, lichess.org*)
* Supports multiple move suggestions, move arrow markings, chess variants & fonts
* Almost impossible to detect

## Getting Started

Simply [install the A.C.A.S userscript](https://github.com/Hakorr/A.C.A.S/raw/main/acas.user.js), open the [A.C.A.S GUI](https://hakorr.github.io/A.C.A.S/) and a supported chess game site. 

> **Warning**
> You need to keep the A.C.A.S tab active to keep the whole system functional. Think of the tab as an engine of a car, the userscript alone is simply an empty hull, it won't run, nor move. The A.C.A.S GUI has the chess engine which calculates the moves.

| A.C.A.S (Tab #1)    | Chess Website (Tab #2)  |
|----------------------|----------------------|
| ![image](https://github.com/Hakorr/A.C.A.S/assets/76921756/750998aa-061e-478a-a2c2-5e7c5b341775) | ![image](https://github.com/Hakorr/A.C.A.S/assets/76921756/ad87db6b-4dc5-4443-8405-29ad140d5894) |
| The engine runs on a completely different tab than the chess game page, completely isolated from it. The site cannot block the usage of A.C.A.S. | A.C.A.S sends move data via [CommLink](https://github.com/AugmentedWeb/CommLink) and the userscript displays the data on the board using [UniversalBoardDrawer](https://github.com/Hakorr/UniversalBoardDrawer). (*If "Display Moves On External Site" setting is activated!*) |

## Q&A

### Why doesn't it work?

It could be a bug, please make an issue [here](https://github.com/Hakorr/Userscripts/issues).

## Used Libraries

* [Fairy Stockfish WASM](https://github.com/fairy-stockfish/fairy-stockfish.wasm) (*the chess engine of A.C.A.S*)
* [Chessground X](https://github.com/gbtami/chessgroundx) (*for displaying a board on the GUI. Modified the library a bit*)
* [UniversalBoardDrawer](https://github.com/Hakorr/UniversalBoardDrawer) (*for drawing arrows on the GUI and the chess site chessboards*)
* [FileSaver](http://purl.eligrey.com/github/FileSaver.js) (*for saving the config file*)
* [CommLink](https://github.com/AugmentedWeb/CommLink) (*for cross-window communication between the GUI tab and chess sites*)
