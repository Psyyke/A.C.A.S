# A.C.A.S (Advanced Chess Assistance System)

> **Warning** A.C.A.S is currently in development. Expect bugs, especially on variants.

A.C.A.S is an **advanced chess assistance system** (a chess cheat) which helps you make better moves with the help of a chess engine. Just install the userscript, open the A.C.A.S GUI and you're good to go! No downloading needed.

![277160104-791ad4ef-96c8-4679-ad78-e1188c73d5e4](https://github.com/Psyyke/A.C.A.S/assets/76921756/406c49ec-24dd-4b96-9fc4-4db1cc1fe205)


* No anti-features (*e.g. ads, tracking*)
* WebAssembly chess engine (faster than regular JavaScript engines)
* Supports the most popular chess game sites (*e.g. chess.com, lichess.org*)
* Supports multiple move suggestions, move arrow markings, chess variants & fonts
* Impossible to detect (well, you can never be sure, so let's say it's *almost* impossible)

> **Note** Please be advised that the use of A.C.A.S may violate the rules and lead to disqualification or banning from tournaments and online platforms. The developers of A.C.A.S and related systems will NOT be held accountable for any consequences resulting from its use. We strongly advise to use A.C.A.S only in a controlled environment ethically.

| [▶️ Open A.C.A.S](https://psyyke.github.io/A.C.A.S/) | [⬇️ Install (GreasyFork)](https://greasyfork.org/en/scripts/459137-a-c-a-s-advanced-chess-assistance-system)  | [💬 Discuss With Community](https://hakorr.github.io/Userscripts/community/invite)
|-------|-------|-------|

## Example Gameplay

<img src="https://github.com/Psyyke/A.C.A.S/assets/76921756/af4af26b-d5e9-4502-ac6a-8921d34c3cfa" alt="example-gameplay" style="width:85%;"/>


## Getting Started

Simply [install the A.C.A.S userscript](https://greasyfork.org/en/scripts/459137-a-c-a-s-advanced-chess-assistance-system), open the [A.C.A.S GUI](https://psyyke.github.io/A.C.A.S/) and a supported chess game site. Then, just start playing!

> **Note**
> You need to keep the A.C.A.S GUI tab active to keep the whole system functional. Think of the tab as an engine of a car, the userscript alone is simply an empty hull, it won't run, nor move. The A.C.A.S GUI has the chess engine which calculates the moves.
> 

## Fundamental Idea

| A.C.A.S (Tab #1)    | Chess Website (Tab #2)  |
|----------------------|----------------------|
| ![image](https://github.com/Psyyke/A.C.A.S/assets/76921756/787740d5-b6a2-4ff1-8e8b-b96699a526e7) | ![image](https://github.com/Psyyke/A.C.A.S/assets/76921756/44c9e498-42fd-4d3f-92ea-91371e9732b5) |
| The engine runs on a completely different tab than the chess game page, completely isolated from it. The site cannot block the usage of A.C.A.S. | A.C.A.S sends move data via [CommLink](https://github.com/AugmentedWeb/CommLink) and the userscript displays the data on the board using [UniversalBoardDrawer](https://github.com/Hakorr/UniversalBoardDrawer). (*If "Display Moves On External Site" setting is activated!*) |

### Arrow Meaning

| Color    | Meaning  |
|----------------------|----------------------|
| 🟩 | Best Move |
| 🟦 | Secondary Move |
| 🟥 | Enemy Move |

> **Note** Enemy move is shown if "*Display Opponent Move Guess*" setting is activated and the square an arrow starts from is hovered. The enemy move arrow is just a guess made by the engine and means that the engine thinks after you make the move the arrow suggests, the enemy will make the move the enemy arrow suggests.

## Q&A

### Why did I get banned, wasn't this impossible to detect?

Chess engines simply play differently than humans. It's fairly easy to detect by pure statistics. For example, chess.com bans about 16 000 players for fair play abuse each month.

Your ban most likely wasn't because of the site detecting A.C.A.S, it was because of your suspicious behaviour patterns. A.C.A.S cannot fix this, it's your responsiblity to play as a human.

Don't want to get banned again? Don't use A.C.A.S against other humans.

### Why doesn't it work?

Before making an issue, please read these and also join the [Userscript Hub](https://hakorr.github.io/Userscripts/community/invite) Discord server for assistance,

- Make sure the [A.C.A.S GUI](https://psyyke.github.io/A.C.A.S/) is active. Do not close the tab. Browsers freeze code execution on inactive pages, you need to visit the A.C.A.S GUI tab from time to time or keep it open on a separate window. This prevents A.C.A.S from freezing and not giving any move suggestions, for example.

- Do you not see any moves displayed on the chess site? Are you sure you have enabled "Display Moves On External Site" box on the A.C.A.S GUI settings? After enabling that setting, please refresh the chess site to see changes.

- Are you trying to play variants on Chess.com? If so, it's not currently supported very well since I had to rush the project, sorry! Other sites with variants might also be buggy, you can make an issue about that if you want.

Otherwise, it could be a bug, please make an issue [here](https://github.com/psyyke/A.C.A.S/issues/new). 

> **Note** When making an issue, please be descriptive! Mention,
> - The chess site and the variant you were playing.
> - The browser and the userscript manager you were using.
> - What did you do for the bug to happen, does it happen often? How could I reproduce it?
> - You can also include a screenshot of the browser console (e.g. `CTRL + SHIFT + I` or right click, inspect, and go to the console tab), look for **grey underlined text** at the beginning of a red background area, on the right side of the screen, which has the word 'A.C.A.S'. That's an error from the userscript.

## Development

### A.C.A.S GUI

#### Hosting on localhost

1) Install the A.C.A.S userscript.
2) Select a webserver of your choosing, e.g. [UwAmp](https://www.uwamp.com/en/).
3) Create a folder named `A.C.A.S` to the root folder of your webserver. (e.g. `www/A.C.A.S`)
4) Clone the repository and put the files inside the folder you just created.
6) You should now see A.C.A.S running on `http://localhost/A.C.A.S/`.
7) Make sure the A.C.A.S userscript is on and you should be good to go!

> **Warning** Make sure there are no additional folders which would make the URL like `http://localhost/A.C.A.S/A.C.A.S/`.

> **Note** You can use [GitHub Desktop](https://desktop.github.com/) to make Git actions such as cloning easy.

### A.C.A.S Userscript

Developing the userscript is easy, simply develop it as you'd any other userscripts.

> **Note** Browsers might cache userscripts after you've refreshed the site enough times. If you notice your userscript being cached, disable the userscript, refresh the page, then enable the userscript and refresh the page again.

## Used Libraries

* [Fairy Stockfish WASM](https://github.com/fairy-stockfish/fairy-stockfish.wasm) (*the chess engine of A.C.A.S*)
* [ZeroFish](https://github.com/schlawg/zerofish) (*WASM port of Lc0 and the latest Stockfish, another chess engine of A.C.A.S*)
* [Maia-Chess](https://github.com/CSSLab/maia-chess) (*legit looking weights for Lc0*)
* [COI-Serviceworker](https://github.com/gzuidhof/coi-serviceworker) (*allowing WASM on GitHub pages, extremely important library*)
* [HackTimer](https://github.com/turuslan/HackTimer) (*bypasses browser timer throttling, it's questionable if this does anything, but it doesn't hurt to have it for now*)
* [ChessgroundX](https://github.com/gbtami/chessgroundx) (*for displaying a board on the GUI. Modified the library a bit*)
* [FileSaver](http://purl.eligrey.com/github/FileSaver.js) (*for saving the config file*)

## Used Libraries (Made for A.C.A.S)

* [UniversalBoardDrawer](https://github.com/Hakorr/UniversalBoardDrawer) (*for drawing arrows on the GUI and the chess site chessboards*)
* [CommLink](https://github.com/AugmentedWeb/CommLink) (*for cross-window communication between the GUI tab and chess sites*)

## Contact

Discussion about A.C.A.S can be had on the [Userscript Hub](https://hakorr.github.io/Userscripts/community/invite) Discord server.

## Other

You can find the userscript on [GreasyFork](https://greasyfork.org/en/scripts/459137-a-c-a-s-advanced-chess-assistance-system) as well.

You can find A.C.A.S v1 [here](https://github.com/Hakorr/Userscripts/tree/main/Other/A.C.A.S). It is no longer updated.
