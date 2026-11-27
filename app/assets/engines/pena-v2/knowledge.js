// Generated from usage/index.html and troubleshoot/index.html by build-knowledge.mjs. Do not edit by hand.
export const knowledge = [
 {
  "page": "usage guide",
  "title": "Supported Chess Sites",
  "part": 1,
  "text": "Battletested (Should work flawlessly) Chess.com. Lichess.org. Playstrategy.org. Pychess.org. Chess.net. Stable (Works fine, but might have some minor bugs) EdChess.io. Chess.org. Papergames.io. Coolmathgames.com. Uncertain (Might work fine, be buggy, or not work at all) Worldchess.com. Gameknot.com. Immortal.game. Freechess.club. Chessclub.com. This list might be outdated. Click see all supported sites in the GUI for the current one."
 },
 {
  "page": "usage guide",
  "title": "Languages",
  "part": 1,
  "text": "Change the language with the flag dropdown at the top right of the GUI."
 },
 {
  "page": "usage guide",
  "title": "Board Controls",
  "part": 1,
  "text": "Use the plus and minus buttons on the GUI to resize its boards. Show FEN shows the current position as text and Show PGN shows the recorded moves. The PGN only contains positions A.C.A.S saw, so keep it connected from the start if you want the whole game."
 },
 {
  "page": "usage guide",
  "title": "Running External Engines",
  "part": 1,
  "text": "External engines can be less stable and a bit slower than the built-in WASM engines, depending on your hardware and the engine. Not every engine has been tested, so please report any bugs you run into. The server runs on Windows, macOS and Linux. Windows gets the most testing."
 },
 {
  "page": "usage guide",
  "title": "Running External Engines, Getting started with the server",
  "part": 1,
  "text": "Download Calculation Server (Or compile it yourself, then open it) Click \"Add Engine Binary\" to add your chess engine. (On Windows, look for a .exe) Enable External Chess Engine in the GUI. (Otherwise A.C.A.S uses a built-in engine) Your engines appear as a list in the GUI. Click the one you want. (Add engines in step 2 first) If the server is running but the GUI won't connect, check Server Port in Engine Settings. It must match the port shown in the Calculation Server. The GUI starts with 2800. The icon beside the server's port shows its status: spinning ring means it is waiting for the web GUI to connect, a checkmark in a circle means the web GUI is connected, and a warning triangle means an unauthorized connection was blocked."
 },
 {
  "page": "usage guide",
  "title": "Running External Engines, Getting started with the server",
  "part": 2,
  "text": "Hover over the port for details, or click it to change the port."
 },
 {
  "page": "usage guide",
  "title": "Running External Engines, Connection status circle",
  "part": 1,
  "text": "The server could not start or crashed. The server is up but not connected. Connected to the GUI."
 },
 {
  "page": "usage guide",
  "title": "Running External Engines, Risks of hosting a server",
  "part": 1,
  "text": "External engines work through a WebSocket server on localhost. Running a server is never risk free, and this one might have vulnerabilities despite our best efforts. Never expose it to the public internet. Any website you visit might also try to connect to the server. The server cuts off connections from unknown domains and alerts you. Most modern browsers limit requests to localhost, so only allow it for the A.C.A.S GUI."
 },
 {
  "page": "usage guide",
  "title": "Running External Engines, Having issues with the external server?",
  "part": 1,
  "text": "Keep the Calculation Server on the same computer as the GUI. If your browser asks to connect to apps on your device or local network, allow it for the GUI. Permission names vary by browser and version. Google Chrome / Edge. Click the icon beside the address, then Site settings. Allow access to apps on this device or the local network if listed, then reload the GUI. Mozilla Firefox. Open Firefox Settings and find Permissions. Check Device apps and services and Local network devices if listed. Allow the GUI's site, then reload it."
 },
 {
  "page": "usage guide",
  "title": "Settings",
  "part": 1,
  "text": "You don't need to change everything, the defaults are fine to start with. Setting names below link straight to that setting in the GUI, even if it's inside a panel. Board Controls, Settings Backups and Activity Log. Profiles and Dynamic Settings. Floating Panel, Chess Engine and Fusion. Move Suggestions, Move Timing and Opening Book. Learning Mode, Feedback and Move Detail. Turn Settings, Moves On Demand and Render Settings. Spoken Moves, Messages and Ghost Script. Pena, Colors and Concealment and Restart Triggers."
 },
 {
  "page": "usage guide",
  "title": "Import, Export and Reset",
  "part": 1,
  "text": "The buttons above the settings let you save your setup or start over. Export Settings saves a config.json with your global settings and profiles. Per-board settings, opening books and custom background images are not included. Import Settings loads a saved config and reloads the GUI. It replaces your current config instead of merging, so export a backup first. Reset Settings restores defaults after confirmation. It also removes added profiles, imported opening books and your custom background. Keep your config private if it contains a Discord webhook. Import opening books and background images separately on other devices."
 },
 {
  "page": "usage guide",
  "title": "Activity Log",
  "part": 1,
  "text": "Click above the settings to open the Activity Log. Logging is off by default, so turn it on with its power button before reproducing an issue. It records engine messages, setting changes, warnings and errors. Use the filters and search to find entries, then the copy button to copy the visible results when reporting a bug. The latest 2000 entries are kept in this browser. Check them for private information before sharing."
 },
 {
  "page": "usage guide",
  "title": "Profiles",
  "part": 1,
  "text": "A profile is a separate set of engine settings. Click the + next to the profile tabs to add one. For example, you can keep a Stockfish profile and a Maia profile to compare their suggestions. Selecting a profile only changes which settings you're editing. Every enabled profile keeps running! Turn off Enabled in profiles you don't need, especially on a slow device. Global settings apply to all your boards. When instance selection is available, you can change settings for a single board instead. An instance is a board A.C.A.S has connected to. Some settings, like the Floating Panel, are shared by all profiles."
 },
 {
  "page": "usage guide",
  "title": "Floating Panel",
  "part": 1,
  "text": "The Floating Panel is a small Picture-in-Picture window that stays on top of other windows and shows key info about the current match. You can resize it smaller. Keep it open. It stops the browser from putting A.C.A.S to sleep when you're on another tab. If suggestions freeze when you switch tabs, this is why. With the panel disabled, A.C.A.S plays a silent audio loop instead to stay active. This may help in some browsers like Chrome but isn't guaranteed. You also need to interact with the GUI each time you open it so the browser allows audio. Without the panel, you can also keep two browser windows side by side so A.C.A.S stays at least partly visible. The panel header shows the chess site's domain with a latency in ms on its left."
 },
 {
  "page": "usage guide",
  "title": "Floating Panel",
  "part": 2,
  "text": "This is the connection delay between the userscript on the chess site and the GUI, measured from a keep-alive message the userscript stamps. It's not a network ping to a server. The ms next to Depth in each profile is the calculation time of that profile's engine. It counts from the start of the calculation to the latest engine update, or the final move. The two values are measured separately. Roughly, the time from a board change to the move appearing on the site is the connection delay, plus the calculation time, plus the connection delay again on the way back, plus any move display delay you set. The return delay is assumed to match the first one."
 },
 {
  "page": "usage guide",
  "title": "Floating Panel",
  "part": 3,
  "text": "Click the settings button next to Floating Panel to find these: Display Board shows the board instead of just text, including in Learning Mode. Share Board combines move overlays from several profiles on one board. Enable Display Board and Share Board for every profile you want to combine. They must show the same position and orientation. Animated Learning Mode boards stay separate. Each profile keeps its own status, evaluation and feedback. Display Evaluation shows the evaluation bar and score in every panel mode, independent of Display Board. PiP Quality changes the picture resolution, not the engine's strength. Lower it if the panel is slow or your tablet gets warm. The default is 70%."
 },
 {
  "page": "usage guide",
  "title": "Floating Panel",
  "part": 4,
  "text": "SAN Move Notation shows moves like Nf3 instead of g1f3. It also applies to Move TTS."
 },
 {
  "page": "usage guide",
  "title": "Chess Engine",
  "part": 1,
  "text": "The Chess Engine setting picks the engine that calculates moves. Stockfish 18 Lite Single is the default. Choose a full Stockfish version for stronger analysis. The Lite versions are smaller downloads, which helps on phones and tablets. For chess variants, use Fairy Stockfish 14. Stockfish, including Stockfish 19 (Strong engine analysis) Fairy Stockfish 14 (Chess variants) Maia 3 and Maia 2 (Suggestions based on human play at different ratings) Fusion (Stockfish 18 Lite Single analysis blended with Maia 3 human moves and a selectable personality) Lc0 with Maia (Semi-realistic human-like play) Lozza 9 (Fairly strong engine-like play) External engine (An engine you run through the Calculation Server) A.C.A."
 },
 {
  "page": "usage guide",
  "title": "Chess Engine",
  "part": 2,
  "text": "S uses the engine's output to give you insights into the match. Some engines output less extra information, so fewer insights are possible. Stockfish gives the best results. No engine will play like a human for you. Don't expect to play 2500 ELO matches as a 1000 ELO player. If you get banned for breaking our ToS, that's on you."
 },
 {
  "page": "usage guide",
  "title": "Chess Variant",
  "part": 1,
  "text": "Most users don't play variants, so you most likely don't need to change this or Chess 960. A.C.A.S should detect the variant automatically if it's supported. The Chess Variant setting changes the type of chess Fairy Stockfish plays. Other engines mostly don't support it, but most support Chess 960, where the starting positions of the pieces are randomized. To play variants, use the Fairy Stockfish Chess Engine."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo",
  "part": 1,
  "text": "The Engine Elo setting controls how strong the engine plays, from 600 to 3200 ELO. Treat it as a rough strength setting, not a promise that the engine plays exactly like someone with that rating. Stockfish at low ELO can behave oddly, and Maia is better for suggestions based on lower-rated human play. Standalone Maia 3 uses 600 to 2600 Elo in A.C.A.S and Maia 2 uses 1100 to 2000. The shared inputs allow 600 to 3200. If your saved rating is outside a Maia engine's range, A.C.A.S warns you and limits the applied value without changing your saved choice. Fusion accepts 600 to 3200, but values above 2600 are uncalibrated guesses. For Stockfish-style engines, 3200 removes the usual strength and depth limits."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo",
  "part": 2,
  "text": "Max Movetime can still stop the search."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo, Opponent Elo",
  "part": 1,
  "text": "The Opponent Elo setting tells Maia and Fusion what rating to assume for the other player. It doesn't change the real opponent or read their rating. If you're unsure, keep it the same as Engine Elo. It allows 600 to 3200, with the same Maia limits and warnings as above. With Advanced Elo enabled, the regular Engine Elo and Opponent Elo fields are disabled and blurred. Use the engine's advanced rating options instead."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo, Advanced Elo",
  "part": 1,
  "text": "The chart above shows how A.C.A.S adjusts depth and skill level for the basic Engine Elo setting. It doesn't apply to Maia's rating inputs. To set the limits yourself, click the settings button next to Engine Elo and enable Advanced Elo. Just opening the panel doesn't enable it. Depth controls how far the engine searches. Larger numbers generally take longer. It isn't a number of full turns and the engine doesn't look at every line equally. Search Nodes limits how much search work the engine does. In the default search mode, a positive node limit replaces the depth limit; 0 means use depth instead. Search mode defaults to depth/nodes."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo, Advanced Elo",
  "part": 2,
  "text": "Engine movetime instead sends go movetime with the separate Engine movetime budget, and Infinite sends go infinite. Neither adds depth or node limits; those controls are disabled in these modes. Use these modes only with engines that support them. For engine-managed timing through the Calculation Server, select the external engine, enable Advanced Elo, choose Engine movetime, and set its budget in milliseconds. Max Movetime is disabled and ignored in this mode so it cannot interrupt that budget; its saved value is preserved for other modes. A board change still stops the search. Infinite mode streams analysis until stopped; with Only Top Moves enabled, a nonzero Max Movetime waits for the final result. For standard chess, A.C.A."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo, Advanced Elo",
  "part": 3,
  "text": "S sends the recorded position and moves when they can be legally replayed. History starts when observation begins, so earlier moves are unavailable if you join mid-game. Missing or inconsistent history, Chess960, variants, and hypothetical turn changes use the current FEN instead. The Calculation Server must also be updated to accept longer position commands. Its 262,144-character limit accommodates tens of thousands of moves; if exceeded, only the most recent moves that fit are sent. Other options come from your engine and appear once it starts. Open a chess board if the list is empty. Advanced Elo overrides the basic Elo controls, so disable it to go back to the normal Engine Elo setting."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo, Advanced Elo",
  "part": 4,
  "text": "Some built-in engines accept text files through a textarea: PersonalityFile for Rodent V, VariantPath for Fairy-Stockfish, and ConfigFile for modern Lc0. Paste the file's contents, not its path. A.C.A.S supplies them in memory and restarts that profile when they change. Empty text removes the custom file. The 64 KiB limit applies to each file, and settings exports include the contents. Keep each engine's own format. Rodent uses one setoption name ... value ... per line. Fairy uses INI variant definitions, such as [mychess:chess] followed by doubleStep = false on the next line. Its variant dropdown updates after loading. Lc0 uses long options such as --cpuct=3.25. Invalid contents show an error instead of silently using defaults."
 },
 {
  "page": "usage guide",
  "title": "Engine Elo, Advanced Elo",
  "part": 5,
  "text": "Binary networks, opening books, tablebase directories and log outputs are not text-file inputs. External engines keep their normal path-based settings. Not every Advanced Elo option does something. For example, \"Ponder\" most likely does nothing because A.C.A.S doesn't implement it. Built-in engines are also limited by your browser, so extra cores, memory or files may go unused. This is meant for advanced users. Feel free to experiment. These settings are very dynamic and not every combination can be tested, so bugs are possible. Please report them on GitHub."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine",
  "part": 1,
  "text": "Fusion blends Maia 3 move predictions with Stockfish 18 Lite Single analysis. Maia suggests what a human of that rating would play and Stockfish makes sure the move isn't too costly. A personality then nudges the choice toward a style without changing Stockfish's evaluations. Select Fusion under Chess Engine. For more controls, enable Advanced Elo and open a chess board. Only standard chess is supported. If no combined suggestion passes the filters, Fusion falls back to Maia with your personality and Personal Variation. That skips Stockfish's quality penalties and Tactical Safety, so the move can be weaker. Fusion never falls back to Stockfish-only suggestions. A suggestion always needs a valid Maia prediction for a legal move."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine",
  "part": 2,
  "text": "If Maia fails to load, times out or is stopped before it responds, you may get no suggestion. Maia Wait caps how long Fusion waits for Maia after Stockfish finishes, within the search's time limit."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine, Main settings",
  "part": 1,
  "text": "Stockfish Weight: Higher values favor moves Stockfish rates better. At 0, only Maia and the personality guide the choice. Human Plausibility: Higher values exclude more moves Maia finds unlikely. Maia Temperature: Lower values favor Maia's top picks. Higher values spread the choice more evenly. Personality and Personality Strength: The style and how strongly its bonuses apply. See below. Personal Variation: Adds a consistent set of small preferences based on a saved identity. Random Seed overrides that identity. Randomness and Top P: Allow alternative choices and limit the pool they come from. Randomness 0 keeps the ranking deterministic. Tactical Safety and Max Centipawn Loss: Filter combined suggestions by evaluation loss."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine, Main settings",
  "part": 2,
  "text": "They don't protect Maia fallback moves. Candidate Moves and MultiPV: How many alternatives Stockfish examines and how many suggestions Fusion returns."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine, Personalities",
  "part": 1,
  "text": "A personality adds small bonuses or penalties to moves with certain traits, like giving check, capturing or castling. It also scales two other settings. Temperature multiplies Maia Temperature, so higher means more varied choices. Tolerance multiplies Max Centipawn Loss, so lower means Fusion accepts fewer worse moves. Personality Strength scales the bonuses from 0% (none) to 200% (double). These are handcrafted rules, not trained models or real player profiles. A style can shift the odds but can't replace Maia's policy or make a bad move good. Balanced: No style bonuses. The neutral default. Human: No style bonuses, but more varied choices and a looser loss limit, so it makes human-like slips more often."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine, Personalities",
  "part": 2,
  "text": "Solid: Favors king safety, pawn cover, saving attacked pieces and castling. Strict loss limit. Aggressive: Favors checks, captures, advancing pieces and pawn storms toward the enemy king. Positional: Favors developing pieces and central squares. Avoids bringing the queen out early. Tactical: Favors checks, captures and saving attacked pieces. Sticks closely to Maia's top picks with a strict loss limit. Bunker Goblin: Heavily favors king safety, pawn cover and castling. Avoids pawn storms and early queen moves. Porcupine Accountant: Strongly favors saving attacked pieces and trading material. Plays safely and avoids giving check. Strict loss limit. Paranoid Turtle: Extreme king safety, retreating and saving attacked pieces."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine, Personalities",
  "part": 3,
  "text": "Dislikes advancing and giving check. Caffeinated Squirrel: Chaotic. Loves checks, development, advancing and pawn storms, and avoids trades. Very varied choices with a loose loss limit. Queen Retirement Club: Favors trading pieces, especially queens. Avoids early queen moves."
 },
 {
  "page": "usage guide",
  "title": "Fusion Engine, Ratings and depth",
  "part": 1,
  "text": "In Advanced Elo, UCI_Elo and Enemy_Elo set the ratings Maia assumes, from 600 to 3200. Values above 2600 are uncalibrated. Depth and Search Nodes control Stockfish, not Maia, so a high Elo can't make up for a shallow search. Learning Mode turns off random sampling and uses Stockfish's evaluation for grading, while keeping the Maia and personality preferences. Fusion doesn't guarantee a particular playing strength or human-like play. Follow the chess site's rules and our Terms of Service."
 },
 {
  "page": "usage guide",
  "title": "Rodent V",
  "part": 1,
  "text": "Rodent V runs locally in your browser and supports chess, Chess960 and multiple move suggestions. Its personalities change how it evaluates positions, using handcrafted preferences, neural networks or a mix of both. To try one, select Rodent V, open a board, then enable Advanced Elo from the cog beside Engine ELO. The Personality dropdown has ampere, chaotic, hector, nimzoid, rodent, tal_hybrid and tal_nnue, plus the latest engine default. The port loads the matching network architecture automatically. Have your own personality text? Paste it into PersonalityFile. It overrides the base preset, while saved individual controls override the pasted text. Network and book references inside it must use the bundled resources."
 },
 {
  "page": "usage guide",
  "title": "Rodent V",
  "part": 2,
  "text": "Clear the textarea to return to the preset and your individual controls. You can also tune hceWeight, nnueWeight, OwnSafety, OppSafety, mobility and other UCI settings there. Saved style edits override the selected base personality, including after reload. Use a fresh profile for an untouched preset. Unedited fields show engine defaults, not the preset's live values. Enable OwnBook if you want the preset's opening books too. Style and strength are separate. Normal Engine ELO uses Rodent's 800-3000 limiter, with 3200 meaning full strength. In Advanced Elo, turn on UCI_LimitStrength and choose UCI_Elo. Search Nodes overrides its rating-based node budget. These ratings are approximate, not a guarantee of human playing strength."
 },
 {
  "page": "usage guide",
  "title": "Rodent V",
  "part": 3,
  "text": "See the Rodent port notes for controls, downloads and limitations."
 },
 {
  "page": "usage guide",
  "title": "Weights",
  "part": 1,
  "text": "The Lc0 Weights setting decides how the Lc0 engine plays. Maia weights are marked with the ELO they roughly play at. The strength and style of the other weights is unknown, but most are quite weak. The Maia weights for Lc0 are meant for a single-node search. It's fine that the engine barely looks ahead. Raising Search Nodes changes how suggestions are chosen. These weights are separate from the built-in Maia 2 and Maia 3 engines."
 },
 {
  "page": "usage guide",
  "title": "Move Suggestions and Only Top Moves",
  "part": 1,
  "text": "Move Suggestions sets how many candidate moves the engine tries to give. For example, 3 asks for up to three different moves, not the next three moves of one line. Some engines may give fewer, and more suggestions mean more work for the engine. Only Top Moves mainly changes when suggestions appear. When enabled, A.C.A.S waits until the search finishes instead of showing suggestions that keep changing. It doesn't reduce Move Suggestions to 1. Searches without a normal stopping limit can still show updates while thinking. For a single arrow, set Move Suggestions to 1. Setting it to 0 hides the suggestions but doesn't turn off the engine."
 },
 {
  "page": "usage guide",
  "title": "Move Delay and Max Movetime",
  "part": 1,
  "text": "These sound similar but do different things. Both use milliseconds, so 1000ms is 1 second. Move Delay holds back suggestions until at least this much time has passed since the calculation started. It doesn't give the engine more thinking time. If the search takes longer, you still wait for it. Max Movetime stops the search after roughly this much time. The engine can finish earlier if it reaches its depth or node limit. 0 means no extra time limit, not instant results. For example, with Max Movetime at 1000 and Move Delay at 3000, the engine can stop after about a second, but suggestions only appear after about three. Max Movetime can also follow the opponent's latest thinking time. See Opponent Move Time under Dynamic Settings."
 },
 {
  "page": "usage guide",
  "title": "Opening Book",
  "part": 1,
  "text": "Opening Book loads saved moves from a file. Click the filename box to choose a Polyglot .bin or move-annotated .epd book. Book moves are shown separately from engine suggestions, with white arrows by default. The engine keeps calculating normally. A book only has moves for positions stored in it, so nothing may show up. Move Suggestions also limits how many book moves are shown. Change their color and opacity in Accessibility Settings, or click the × next to the filename to remove the book from that profile. Not every .epd file is an opening book. It needs move annotations like bm, pm or pv. A list of starting positions alone doesn't tell A.C.A.S which moves to show. Books are stored in this browser, so import them again on other devices."
 },
 {
  "page": "usage guide",
  "title": "Opening Book",
  "part": 2,
  "text": "Want to make your own book or mix a few together? BookSmith lets you play lines on a board, stack books in any order and export one merged .bin to load here. You can even import your games from Export Matches and get a book of the moves you actually play."
 },
 {
  "page": "usage guide",
  "title": "Learning Mode",
  "part": 1,
  "text": "Learning Mode reviews a move after you've played it instead of telling you what to play. The GUI shows the position before your last move, the profile's engine suggestions and a rating of the move you played. The board being one move behind is intentional! It uses the engine selected in that profile with its Elo and search settings, so a Maia review can differ from a Stockfish review. Ordinary Move Ratings use a separate Fairy Stockfish engine instead. Keep A.C.A.S connected while playing, because it needs the recorded positions. Learning Mode may not work well with Maia 2 or 3. Their ratings are approximate outcome estimates, not deep tactical analysis. Use Stockfish for more reliable reviews."
 },
 {
  "page": "usage guide",
  "title": "Learning Mode",
  "part": 2,
  "text": "Live move arrows and opening book hints from a learning profile aren't sent to the chess site's board. Move TTS reads the move's rating instead of the next suggestion. Learning profiles also ignore Moves On Demand, Only Own Turn and Always My Turn so both sides of the position get recorded."
 },
 {
  "page": "usage guide",
  "title": "Learning Mode, Display Board and Evaluation",
  "part": 1,
  "text": "The Display Board checkbox in Floating Panel settings controls the board in both normal and Learning Mode. Turn it off for a compact learning panel with the opening, rating counts and move feedback. Display Evaluation separately controls the evaluation bar and score in every mode. The GUI's main board and move review work as usual. Hiding the board pauses the panel's animation and disables the animation controls without clearing your saved choices. Showing it again resumes the animation when a review is available. It doesn't close the panel or affect its keep-alive purpose."
 },
 {
  "page": "usage guide",
  "title": "Learning Mode, Animate Best Line",
  "part": 1,
  "text": "Animate Best Line replays the engine's preferred continuation in the Floating Panel when it found a different move from yours. A line is a sequence of moves and replies. Display Board must be enabled to see it. Stop After Enemy Move ends the replay when the opponent plays their real reply. Disable it to keep watching the review until your next move. Learning Mode belongs to a profile and doesn't disable other profiles that still give live suggestions. If you only want reviews, turn those off."
 },
 {
  "page": "usage guide",
  "title": "Move Ratings and Feedback",
  "part": 1,
  "text": "Move Ratings compare your played move with the best move found by a separate Fairy Stockfish engine. Opponent Ratings do the same for the other player. These review moves already played and don't predict the next one. Search Depth in Feedback Settings controls this separate engine, not your main one. Higher depth gives a better look at the position but takes longer and uses more processing power. In Learning Mode, the selected profile's engine does the review instead. Ratings consider how much worse the played move is than the engine's best, including evaluation changes and forced mates. They don't use the chess site's own rating system, so labels won't match exactly. Shallow analysis can also miss things."
 },
 {
  "page": "usage guide",
  "title": "Move Ratings and Feedback",
  "part": 2,
  "text": "Feedback On External Site puts the rating on the chess site's board. It's separate from Moves On External Site and Render On External Site. Feedback Emojis controls the rating emojis beside moves. is the engine's best move, is a move that evaluates better than the engine's pick, is excellent, is good, is neutral or forced, is weak, is an inaccuracy, is a mistake, is a blunder, is catastrophic and is a book move. Turning them off doesn't stop the review. Feedback In Floating Panel shows a compact version of the feedback in the panel. Move Counts In Floating Panel adds totals for each move rating outside Learning Mode. Enable the ratings you want counted and Feedback In Floating Panel too."
 },
 {
  "page": "usage guide",
  "title": "Move Ratings and Feedback",
  "part": 3,
  "text": "Estimated Elo & Accuracy shows an approximate rating and an accuracy percentage, written like Elo 1500 (87%). It has its own checkbox next to Learning Mode in the feedback display options and works on its own. Move Ratings, Opponent Ratings and Learning Mode can all stay off. The moves are then still reviewed quietly, but no rating or emoji is shown for them. Outside Learning Mode you get one estimate for you and one for your opponent. Both are tracked even if only one side has ratings enabled. In the main window they sit on the same line as that side's move counts, or alone if there are no counts. In the floating panel they share one extra line below the counts, with your opponent on the left and you on the right."
 },
 {
  "page": "usage guide",
  "title": "Move Ratings and Feedback",
  "part": 4,
  "text": "In Learning Mode there is a single estimate for the moves you reviewed. For Elo, Maia 3 looks at the moves actually played and checks how likely those choices would be at ratings from 600 to 2600. It combines those clues into one estimate, with a gentle pull toward 1500 while the evidence is thin. This needs at least 6 eligible moves per side after the first 4 full moves, plus a little time for the background analysis. It works independently of the engine you play with and doesn't read your configured Elo or the opponent's advertised rating. While Maia is still gathering enough results, a simpler estimate uses the average winning chance lost compared to the review engine's best move."
 },
 {
  "page": "usage guide",
  "title": "Move Ratings and Feedback",
  "part": 5,
  "text": "That fallback starts after 2 eligible reviewed moves and skips opening book moves and forced moves. Accuracy uses those same losses even when Elo comes from Maia, so the two numbers don't have to tell exactly the same story. Outside Learning Mode, the move review and accuracy come from a separate Fairy Stockfish engine. In Learning Mode, your profile's engine does that review instead. Maia's Elo estimate uses recorded moves from standard chess games without Chess960. Other variants use the loss-based fallback. If you connect partway through a game, earlier recorded moves are reviewed in the background when possible. Think of the Elo as a little clue about the moves in this game, not a new official rating."
 },
 {
  "page": "usage guide",
  "title": "Move Ratings and Feedback",
  "part": 6,
  "text": "One game can be noisy, and bots don't always play like humans at their advertised rating. Winning doesn't guarantee a higher estimate either. You can play well for most of a game and still lose to one big mistake. The move feedback is usually the better place to find something useful to practice. Engine critiques compare your move to the engine's idea of best. They aren't a judgement of you as a player. Use them to find things worth reviewing, not to worry about every small inaccuracy."
 },
 {
  "page": "usage guide",
  "title": "Move Detail and Filter Shown Pieces",
  "part": 1,
  "text": "Move Detail lets you ask for less help. A.C.A.S can hide part of the move so you figure it out yourself. Full move shows where the piece starts and where it goes. Piece only shows which piece to consider, but not where to move it. Destination only shows the target square, but not which piece goes there. Captures only or Non-captures only hides suggestions of the other kind. You can combine these with piece-only or destination-only hints. Filter Shown Pieces hides suggestions for certain piece types. It has separate lists for your pieces and opponent pieces. For example, you can hide queen moves and keep knight suggestions. Move Detail applies to your move hints."
 },
 {
  "page": "usage guide",
  "title": "Move Detail and Filter Shown Pieces",
  "part": 2,
  "text": "Opponent move guesses have their own piece filters and can still show a full reply, so turn those off too if you don't want that information. These settings filter suggestions the engine already found. They don't make it find another move with an allowed piece, so if everything is filtered out you may see no hint. Moves On Demand uses full move detail outside Learning Mode."
 },
 {
  "page": "usage guide",
  "title": "Moves On Demand",
  "part": 1,
  "text": "Moves On Demand waits until you click or tap a piece on the chess site's board, then asks the engine for moves with that piece instead of suggesting moves for the whole board. It's useful when you want to choose the piece yourself. Refresh the chess site after changing it if it doesn't respond. With Ghost Script, this needs the optional local screen overlay."
 },
 {
  "page": "usage guide",
  "title": "Only Own Turn, Always My Turn and Reverse Side",
  "part": 1,
  "text": "These change which side the main engine calculates for. They're easy to mix up. Only Own Turn skips suggestion searches while it's the opponent's turn. It doesn't turn off separate feedback analysis. Always My Turn makes the engine treat the board as if you could move next, even while the opponent is thinking. Those suggestions are hypothetical because their real reply can change everything. Disable it to analyze the side whose turn it really is. Reverse Side switches the profile's side to the opponent. With Always My Turn, you can look for their best moves instead of yours. It doesn't just rotate the board."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings",
  "part": 1,
  "text": "Dynamic Settings lets a setting change as the game goes on. Click the small curve button beside a supported setting to open its graph. It's optional, so use the normal setting if you want one value for the whole game. The horizontal axis (X) is what you're watching and the vertical axis (Y) is the setting's value. Piece Count counts all pieces and pawns from both sides, including kings. Ordinary chess starts at 32. Move Number is the full move number. It goes up by one after both White and Black have played. Evaluation is your advantage from the latest completed primary engine evaluation. Negative means you're losing, positive means you're winning and 0 is equal."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings",
  "part": 2,
  "text": "It's in centipawns, so +100 means roughly a one pawn advantage, not necessarily an extra pawn on the board. Opponent Move Time (ms) is how long the opponent's latest fully observed turn took. Use it to adapt a setting to their pace. Material Balance (cp) is your remaining material minus theirs, using fixed piece values. It updates from the board without waiting for the engine. Choose a variable and a setting, then click ＋ Line for the profile you're editing. Drag the points, or select one and type its X and Y values. Click ＋ Point to add more. Changes save as you edit. For example, choose Move Number and Engine Elo. Put one point at X 1, Y 1200 and another at X 40, Y 1800."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings",
  "part": 3,
  "text": "With a Linear curve, the Elo gradually rises from 1200 to 1800 over those moves. After move 40 it goes back to your saved Elo unless you extend the line. Step holds a value until the next point. Linear changes evenly between points. Smooth follows a curved transition between points. Checkboxes and dropdowns always use Step because they need a definite choice. For dropdowns, Saved default means use the value from the normal setting. Each setting has one curve per profile, so you can't use separate Piece Count and Move Number curves on it at once. A graph still follows the setting's normal rules. For example, an Engine Elo curve won't apply while Advanced Elo is enabled."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings",
  "part": 4,
  "text": "If you graph Chess Engine itself, it goes back to your saved engine at the start of a new game. The normal input keeps showing your saved value even while a graph overrides it. Check the curve button's live value if the engine seems to use something else. Outside the line's range, or before its variable is available, the saved value is used. Remove the line to go back to a fixed setting."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings, Opponent Move Time (ms)",
  "part": 1,
  "text": "This is the time between the userscript seeing your move and seeing the opponent's reply. It is not the chess site's clock time. Network delays, board animations and late move detection can affect it. It uses the real player's side, not a profile's Reverse Side setting. To make Max Movetime match the latest sample, open its curve editor, choose Opponent Move Time, add a line for your profile and select Linear. Set the endpoints to X 1, Y 1 and X 100000, Y 100000. For example, a reply that took 2400ms sets Max Movetime to 2400ms. This changes the search budget, not when an automatic move is played, and depth or node limits can still end the search earlier."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings, Opponent Move Time (ms)",
  "part": 2,
  "text": "The value updates after a complete observed opponent turn, not continuously while they think, and stays at the latest valid sample between replies. Loading mid-turn gives no complete sample. Reconstructed missed moves aren't timing samples, and a new game clears the value. Until a sample exists, or if it's outside your curve's range, the saved setting is used. The example covers 1ms to 100 seconds and doesn't bypass Max Movetime's normal limits."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings, Material Balance vs. Evaluation",
  "part": 1,
  "text": "Both use centipawns (cp), where 100 cp is one pawn, but they answer different questions. Material Balance: how much material you have compared with the opponent. It adds pawn 100, knight 320, bishop 330, rook 500 and queen 900, then subtracts their total from yours. Kings count as 0. Positive means extra material, negative means less and 0 means equal. Evaluation / Your Advantage: how good the engine thinks your position is. It looks at threats, king safety, piece activity and material, not just a piece count. It depends on the engine and the analysis available. For example, after sacrificing a rook for a winning attack, your Material Balance could be -500 cp while Evaluation is +800 cp."
 },
 {
  "page": "usage guide",
  "title": "Dynamic Settings, Material Balance vs. Evaluation",
  "part": 2,
  "text": "You're down material but the engine thinks you're winning, so Material Balance isn't another win/loss estimate. Use Evaluation to follow the engine's overall assessment. Use Material Balance for predictable rules that don't depend on an engine, like giving more hints when you're down a piece. Unlike Piece Count, it tells losing a queen from losing a pawn. It assumes standard pieces on an 8x8 board and has no variant-specific values."
 },
 {
  "page": "usage guide",
  "title": "Moves On External Site",
  "part": 1,
  "text": "Moves On External Site shows move hints directly on the board you're playing on instead of only on the GUI's board. It only controls move hints, including opening book hints. Board metrics and move ratings have their own switches, Render On External Site and Feedback On External Site. Turning off move arrows doesn't turn those off. Anything added to a chess site's board could be detected. Hiding arrows doesn't make engine use safe or allowed. Follow the site's rules and our ToS."
 },
 {
  "page": "usage guide",
  "title": "Opponent Move Guess",
  "part": 1,
  "text": "Opponent Move Guess shows the reply the engine expects after you play its suggested move. It isn't necessarily what the opponent should play right now, and it doesn't promise what they'll actually play. The reply normally appears when you hover over the square the suggested move starts from. Enable Constantly Visible to keep it showing, which helps on touchscreens. Some engines don't give a reply, so there may be nothing to show."
 },
 {
  "page": "usage guide",
  "title": "Pena AI",
  "part": 1,
  "text": "Pena is your local AI chess coach. He explains ideas, checks moves and answers questions about A.C.A.S. Chat and coaching are English-only, with standard chess support. Pena isn't available on phones or tablets."
 },
 {
  "page": "usage guide",
  "title": "Pena AI, Getting started",
  "part": 1,
  "text": "Open the A.C.A.S Calculation Server on this computer. Enable Pena AI in Misc and click Download Pena in the chat. Or open AI in the server app. Keep the server and GUI open. Setup downloads Inkling 2 Mini Uncensored (about 8.7 GB) and a compatible runtime, then starts Pena. No account needed; downloads can be paused and resumed. The default runs Inkling without a LoRA. Graphics memory is adjusted automatically; smaller GPUs use some system RAM and run slower. Pena starts with the server after setup. Stop in the server app unloads the model and disables automatic start."
 },
 {
  "page": "usage guide",
  "title": "Chatting with Pena",
  "part": 1,
  "text": "Type and press Enter, or click the mic and speak. A pause sends your words; click again to stop listening. Ask why a move works, compare ideas or ask what to watch out for. Use the round arrow in the header for a new chat. Pena follows the newest open match, with separate chats for each game. He reads rule-checked board facts and uses Stockfish to examine moves and imagined lines. Ask who's winning if you want an evaluation. Without a match, you can still chat or ask about A.C.A.S settings, but he can't change them or see the site's clock, ratings or opponent's name."
 },
 {
  "page": "usage guide",
  "title": "Pena AI settings",
  "part": 1,
  "text": "Open the Pena AI cog in Misc. Chess coaching: On by default. Adds board facts, engine checks and automatic comments. Off sends only your System prompt and chat to the model, without board access or answer checks. Don't give away moves: Explains ideas without revealing your move unless you ask. Opponent threats are still explained. Only talk when asked disables automatic comments. Live board teaching: Highlights pieces, squares and arrows. Visual duration controls how long marks stay; Play out future moves previews discussed lines. Voice: The header's speaker toggles reading aloud. Choose ZONOS3, a browser voice or Off. ZONOS downloads voice models in the browser and uses WebGPU, falling back to browser speech if unavailable."
 },
 {
  "page": "usage guide",
  "title": "Pena AI settings",
  "part": 2,
  "text": "You can import a voice clip you have permission to use. Voice pause sets the silence before sending. Thinking & Prompt: Auto effort adapts to the question; Max thinking tokens limits thinking. Temperature controls variety (default 0.3). Edit the System prompt to change Pena's personality or add details about yourself; Reset prompt restores it. For custom models, open Advanced in the server's AI panel. Choose a compatible llama-server executable and GGUF model, with an optional LoRA matching that exact base. Use Pena's download restores the default files. Backend, graphics memory and context controls are also there."
 },
 {
  "page": "usage guide",
  "title": "Pena AI, Privacy and limits",
  "part": 1,
  "text": "AI replies run on your computer, not an online AI service. A.C.A.S doesn't save or log chats; refreshing clears them. Your settings and voice clips stay in the browser. Stop the AI server to release its in-memory prompt cache; this doesn't guarantee erasure from OS or third-party tools. Move checks and board filters catch some mistakes, not every incorrect explanation. Treat Pena's advice as a second opinion. For setup or connection problems, see the help page."
 },
 {
  "page": "usage guide",
  "title": "Colors",
  "part": 1,
  "text": "Open Colors to pick the GUI theme and board squares. Chess Font changes the GUI's pieces. Board Color 1 sets light squares and Board Color 2 sets dark squares independently. Neither changes the chess site's own theme."
 },
 {
  "page": "usage guide",
  "title": "Colors, Custom Background",
  "part": 1,
  "text": "Choose Custom Image under Bg Texture, then click the filename box to upload an image. PNG, JPEG, WebP, GIF and AVIF work, up to 10 MB. Use Image Blur to soften it or × to remove it. The image stays in this browser and isn't included in settings exports."
 },
 {
  "page": "usage guide",
  "title": "Move Colors",
  "part": 1,
  "text": "Best Move, Secondary Move, Enemy Move These are the default move colors, not the square colors explained further down. Accessibility Settings has separate controls for move colors and opacity. Colored Squares replaces arrows with highlighted squares if you find them easier to read."
 },
 {
  "page": "usage guide",
  "title": "Colors, Warning Moves",
  "part": 1,
  "text": "A.C.A.S can color your other suggestions by how much worse they are than the best move. Mistakes, blunders and missed mates each get their own color in Accessibility Settings. Small inaccuracies keep the normal Secondary Move Color. Open the cog next to Warning moves in Visual #2 to turn each type on or off. Only warning moves hides the best move and all normal moves, so you only see the bad ones. Keep Move Suggestions at something small like 2. When Only warning moves is on, the engine checks every legal move in the background, since bad moves rank last, and shows the mildest bad moves up to your chosen amount, since those are the ones you might actually play. The mildest gets the largest arrow."
 },
 {
  "page": "usage guide",
  "title": "Colors, Warning Moves",
  "part": 2,
  "text": "This makes the engine slower, so a lower depth or a short movetime helps. Warnings need an engine that gives scores for every line, so some engines like Fusion may show none."
 },
 {
  "page": "usage guide",
  "title": "Move TTS and Spoken Announcements",
  "part": 1,
  "text": "Move TTS reads suggested moves aloud. TTS means text-to-speech. Choose a voice and speed in the Audible settings. Available voices depend on your browser and device. Announce Opponent Moves reads the move the opponent just played, not the engine's guess. Announce Advantage Changes tells you when the position shifts between states like equal, winning or losing instead of reading every small update. Both have their own switches, so you can hear them without spoken move suggestions. Translate Audio uses your selected GUI language where translations exist. Pick a voice for that language too. In Learning Mode, speech is limited to the move's rating."
 },
 {
  "page": "usage guide",
  "title": "Messages",
  "part": 1,
  "text": "The Messages panel can send engine results to a Discord channel through a webhook. Enter your Discord Webhook URL and turn on Enabled for the profile you want to send from. A message is sent when that profile finishes a search for the current position. The Message Template is the text to send. Words in braces are replaced with engine data. For example, {profile}: {bestMove} (depth {depth}) includes the profile name, move and search depth. Available variables are listed below the template. Values an engine doesn't provide are left blank. Include Board Photo attaches an image of the GUI's board. Unlike normal local analysis, this sends the chosen information to Discord."
 },
 {
  "page": "usage guide",
  "title": "Messages",
  "part": 2,
  "text": "Keep your webhook URL private, because anyone with it can post through that webhook."
 },
 {
  "page": "usage guide",
  "title": "Funneling",
  "part": 1,
  "text": "Funneling picks one move from several suggestions. Each profile can use its own mode. Off: keep your usual suggestions. Books only: show one weighted book move. Engine suggestions stay unchanged. All suggestions: combine book and engine moves into one full suggestion."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Sharing a pool",
  "part": 1,
  "text": "Turn on Share pool across profiles in the profiles you want to combine. Books only and All suggestions can join the same pool. You get one pooled pick, not a separate pick for each mode. Without book preference, each profile with available full moves gets an equal chance to supply the pick. Two profiles means 50/50. Three means about one third each. Offering more moves doesn't give a profile more chances. After a profile wins, its own settings decide the move. Books only uses its book weights. All suggestions uses book weights for a book pick and engine percentages for an engine pick. If that All profile has both sources available, it gives books and engines a 50/50 chance first. Prefer book moves changes that order."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Sharing a pool",
  "part": 2,
  "text": "Turn it on in any shared All profile and available book moves from the whole pool take priority, including Books-only profiles. The contributing book profiles get equal chances, then the winning book's weights apply. When no book move is available, the engine mix takes over. Books-only mode doesn't grant priority on its own."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Practical setups",
  "part": 1,
  "text": "One book arrow, normal engine arrows. Load an opening book and choose Books only. If the book has no move for the position, your engine suggestions carry on as usual. Follow your book, then let the engine take over. For one profile, choose All suggestions and turn on Prefer book moves. A book match uses the book's weights. Once you're out of the book, the engine mix takes over. A little engine variety. For an engine-only profile, choose All suggestions with 90% Best and 10% Any alternative. Set Move Suggestions to at least 2 so the engine has alternatives to offer. When both types are available, roughly nine picks out of ten use Best. Two engines, one pick. Set Stockfish and Maia to All suggestions and share the pool in both."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Practical setups",
  "part": 2,
  "text": "With no books or book preference, each engine gets a 50% chance. Stockfish offering five moves and Maia offering two doesn't change that. Each keeps its own engine percentages. Combine two opening books. Choose Books only and sharing in both book profiles. Each available book gets half the picks. If book A offers e4/d4 at 75/25 and book B only offers e4, the pooled odds are 87.5% e4 and 12.5% d4. The matching e4 moves add together, rather than making book B lose its share. Let a book and an engine take turns. Profile A uses Books only with c4/g4 weighted 75/25. Profile B has no book and uses All suggestions with Best 90% and Any alternative 10%. Share both and leave Prefer book moves off. A gets half the picks and B gets half."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Practical setups",
  "part": 3,
  "text": "With all those choices available, that's 37.5% book c4, 12.5% book g4, 45% engine Best and 5% engine alternative. One Books-only profile, one All profile with a book too. Share both with book preference off. Each profile gets 50%. When the All profile wins, it splits its chance between its book and engine. Overall, 75% of picks come from books and 25% from the engine. The All profile's own book doesn't steal the other profile's turn. Books first, even from another profile. Keep the previous shared setup, but enable Prefer book moves in the All profile. Both profiles' books now get priority. While both have moves, each book gets half the picks. If only one still has book moves, it supplies the book pick."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Practical setups",
  "part": 4,
  "text": "Once neither has a book move, the All profile supplies an engine pick. Three profiles with different personalities. Share a Books-only profile, a Best 100% engine profile and a Best 70% / Any alternative 30% engine profile, with book preference off. Each gets about one third of the picks. The last profile's 70/30 mix applies only when that profile wins. A book runs out. In a shared Books-only plus engine setup, an out-of-book profile gets no chance to supply the pick. It doesn't use up half the turns or produce blank picks. If its book has a move again later, it joins the choices again. Keep profiles independent. Leave sharing off. One profile can use Off, another Books only, and a third All suggestions."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Practical setups",
  "part": 5,
  "text": "Changing one doesn't change the others."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Book weights and engine percentages",
  "part": 1,
  "text": "These are separate. A book with two available moves weighted 75/25 uses those odds for its book pick. Best 90% and Any alternative 10% only describe the engine mix, not the book. You don't need to change one to match the other. Changing an engine percentage adjusts the others for you. Choose alternative types reveals more options, like safe secondary moves, mistakes and blunders. Switching modes keeps your saved choices."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Good to know",
  "part": 1,
  "text": "Only profiles with sharing turned on and Funneling enabled join the pool. Others can still show their own arrows. Books-only engine suggestions stay outside the pool too. For one full arrow overall, use All suggestions and sharing in every profile supplying full moves. Funneling uses available moves, not invented ones. If your selected engine types aren't available, it picks another shown move and gives a short warning. These percentages describe chances over many fresh picks, not a fixed rotation. Redrawing the same position doesn't reroll a valid pick. If books and engines suggest the same move, that move can win through either source."
 },
 {
  "page": "usage guide",
  "title": "Funneling, Good to know",
  "part": 2,
  "text": "With Only Top Moves enabled, Funneling waits for the participating full-move profiles to finish, including Books-only profiles and preferred book picks. Books-only engine lines also wait for their own final results. Turn Only Top Moves off in a profile to allow its live results without waiting for its search to finish. Other sharing profiles with it enabled still need to finish first. Use a time, depth or node limit with Only Top Moves enabled. Unlimited searches need to finish before Funneling shows a pick, so disable Only Top Moves if you want live updates during those searches. Your move filters, colors and visibility settings still apply. Partial hints and Learning Mode stay separate."
 },
 {
  "page": "usage guide",
  "title": "Ghost Script",
  "part": 1,
  "text": "Ghost Script stops A.C.A.S from creating its board overlay on the chess site. Without the optional screen overlay, that also turns off external move arrows, rendered metrics, feedback markings and Moves On Demand. To draw outside the page, start the A.C.A.S local server, turn on Ghost Script and choose Draw on screen in its settings. This applies to every profile. On mobile devices, this setting is unavailable and automatically switches off. Keep the GUI and server running, then refresh the chess site. If the drawing is a little off, adjust the X and Y offsets in pixels. Positive values move it right or down, and changes apply right away."
 },
 {
  "page": "usage guide",
  "title": "Ghost Script",
  "part": 2,
  "text": "The overlay hides when the chess tab loses focus, the board is partly off-screen, the page is pinch-zoomed or the board is inside an iframe. Positioning can vary with browser panels, zoom and display scaling. Linux Wayland is not supported. The GUI can still receive the board and calculate. If it no longer opens automatically, open it yourself and keep it running. Ghost Script isn't an undetectable mode and doesn't change the rules about using assistance."
 },
 {
  "page": "usage guide",
  "title": "Concealment and Restart Triggers",
  "part": 1,
  "text": "The Concealment Trigger temporarily hides assistance like arrows and feedback, including in the Floating Panel, and stops current speech. Use the trigger again to show it. It doesn't stop engine calculations or unload the userscript. Auto Conceal hides assistance again after the chosen time whenever you reveal it. For example, 3000 gives you about three seconds to look. 0 disables the timer. The Restart Trigger restarts connected instances if they get stuck. It doesn't reset your saved settings. Both triggers accept a key or one of the listed mouse gestures, so check them if assistance keeps disappearing or restarting. Keyboard triggers are paused while typing in an input."
 },
 {
  "page": "usage guide",
  "title": "Render Settings",
  "part": 1,
  "text": "Rendering settings show information about the position instead of telling you a move. Square vision and capture warnings don't use a chess engine. Show Piece Contributions does use a separate engine and can take longer. They can help you learn, but they don't replace checking a line yourself. Rendering is configured per profile and shown on the GUI's board. Enable Render On External Site for that profile to show it on the chess site's board too. This switch doesn't enable any metric by itself, so pick the ones you want below it."
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Colors",
  "part": 1,
  "text": "Own Piece Vision uses Green for squares your pieces see. Enemy Piece Vision uses Red for squares the enemy's pieces see. When both are enabled, green and red only mark squares that side alone sees. If you enable just one side, it includes contested squares too. Diagonal Vision and File & Rank Vision use matching line widths for both sides. Shared lines alternate green and red segments, while lines seen by only one side stay solid. Knight Vision uses arrows to show the direction from each knight to the squares it sees. Orange means the square is contested, so at least one piece from each side sees it. Aqua means neither side sees it. Chess sites often let you change the board colors."
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Colors",
  "part": 2,
  "text": "If the highlights are hard to see, try a different board theme."
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Use Centered Dots",
  "part": 1,
  "text": "Use Centered Dots replaces full square highlights with small colored dots. The colors keep their meaning. Orange dots replace the contested square's fire emojis and counts, and a red outline means more enemy pieces see that square than yours. Unwatched Squares are cyan because neither side sees them. That doesn't guarantee a piece is safe there after moving, since moving it can open a line or change what the enemy attacks."
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Contested Squares",
  "part": 1,
  "text": "Contested Squares shows contested squares in orange. Fire emojis mark them too. One fire means 2 or 3 pieces from both sides see the square in total, two stacked fires mean 4 or 5, three mean 6 or 7, and so on. The piece values aren't considered. The fire can have text. For example, with -2 means the square is defended by 2 fewer pieces than attack it (you have 1 defender and the enemy has 3 attackers). +2 means you have 2 more pieces on the square than the enemy (you attack with 4 pieces and the enemy defends with 2)."
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Own Piece Capture",
  "part": 1,
  "text": "Own Piece Capture puts on your pieces when the opponent could win material by capturing them. In ordinary chess it checks captures and recaptures on that square, not just attacker and defender counts. For example, a queen taking your protected rook might lose the queen in return, so your rook isn't marked."
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Enemy Piece Capture",
  "part": 1,
  "text": "Enemy Piece Capture does the same for enemy pieces with when you could gain material from a capture. Equal exchanges aren't marked just because a capture is available. These warnings only look at the exchange, not the whole game. They don't tell you if taking the piece allows mate elsewhere or if a sacrifice is worth it. Chess variants use a rougher attack and defence estimate."
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Show Piece Contributions",
  "part": 1,
  "text": "Show Piece Contributions puts an estimated contribution beside each piece. A.C.A.S uses Fairy Stockfish to compare the position with and without that piece. A larger positive number means the piece seems to help its side more in that position. The numbers use pawn units but aren't fixed material values. A rook doesn't always get 5 and a pawn doesn't always get 1. The number reflects how the position changes without the piece and can even be negative. Ordinary kings get no contribution. This is experimental and runs a shallow search on many modified positions, so it can be slow and give odd numbers. Leave it off to save battery or keep the board cleaner. Didn't find what you were looking for? The help page might help. Want to learn more?"
 },
 {
  "page": "usage guide",
  "title": "Render Settings, Show Piece Contributions",
  "part": 2,
  "text": "Visit the blog. A.C.A.S Free, open-source chess assistance. Licensed with GPLv3"
 },
 {
  "page": "help page",
  "title": "Something not working?",
  "part": 1,
  "text": "Before making an issue, please read these. Make sure the GUI is active. Do not close the tab. Not seeing any moves displayed on the chess site? Make sure Display Moves On External Site is enabled, then refresh the chess site. If assistance appears and then disappears, check the concealment settings, which can temporarily hide arrows and feedback. Are you trying to play variants on Chess.com? If so, it's not currently supported very well since I had to rush the project, sorry! Other sites with variants might also be buggy, you can make an issue about that if you want. Make sure you did NOT set \"Piece Animations\" to \"Arcade\" on Chess.com board settings! Set the \"Piece Animations\" to \"None\" so that A.C.A.S can parse the board correctly."
 },
 {
  "page": "help page",
  "title": "Something not working?",
  "part": 2,
  "text": "Thanks! If A.C.A.S complains having no userscript even though it is installed, press down the \"shift\" key, and then click your browser's refresh button to perform a hard refresh, hopefully clearing the wrongly cached state. IMPORTANT: For users of the Tampermonkey extension (version 5.3+) in a Chrome-based browser, enabling either the \"Allow User Scripts\" toggle (available in Chrome 138+ via extension settings) or Developer Mode is required. (Q209: Permission to execute userscripts). Some users are having issues with Firefox and Tampermonkey, so if you're using Firefox you can try Violentmonkey instead of Tampermonkey (on desktop only)."
 },
 {
  "page": "help page",
  "title": "Something not working?",
  "part": 3,
  "text": "Make sure to also use the \"Floating Panel\" setting if your suggestions appear slowly or the connection stops randomly. Mobile: Violentmonkey has known connection issues on mobile devices (the connection between the chess site and the GUI can stop after a few minutes). Please use Tampermonkey instead. Mobile: Keep the A.C.A.S GUI active by using either split screen OR the Floating Panel. With split screen, the chess site is on one side and the A.C.A.S GUI on the other, so both stay visible. The Floating Panel works without split screen, but many mobile browsers still throttle background tabs even with it, so for the best speed on mobile, use split screen so that A.C.A.S is constantly visible. Nothing is helping? Restart your PC."
 },
 {
  "page": "help page",
  "title": "Something not working?",
  "part": 4,
  "text": "Try Tampermonkey and a Chromium based browser, such as Chrome. Use the default settings. Keep two windows open at the same time next to each other, one having the GUI and one the chess site. Otherwise, it could be a bug, please make an issue here. Please attempt to figure out what steps or situations usually causes the bug so that it could be replicated by the developers. When making an issue, please be descriptive! Mention, The chess site and the variant you were playing. The browser and the userscript manager you were using. What did you do for the bug to happen, does it happen often? How could I reproduce it? You can also include a screenshot of the browser console (e.g."
 },
 {
  "page": "help page",
  "title": "Something not working?",
  "part": 5,
  "text": "CTRL + SHIFT + I or right click, inspect, and go to the console tab), look for grey underlined text at the beginning of a red background area, on the right side of the screen, which has the word 'A.C.A.S'. That's an error from the userscript."
 },
 {
  "page": "help page",
  "title": "Pena AI not working?",
  "part": 1,
  "text": "Pena's AI runs in the A.C.A.S local server, not in the browser. Here are the usual fixes. Can't connect. The app server isn't running or can't be reached. Open it and check that the external engine server port in the GUI matches the app server. Pena retries automatically, or you can press Reconnect in his chat. There is no browser AI fallback. Pena isn't running. If the app server is open, press Download Pena or Start Pena in the chat. Errors show up there and as a toast in the app server. The download stopped. Press the button again and it carries on where it left off. Pena needs about 10 GB of free disk space. A file that fails its checksum is deleted and fetched again. The browser blocks the connection."
 },
 {
  "page": "help page",
  "title": "Pena AI not working?",
  "part": 2,
  "text": "Allow local network access for the A.C.A.S page when prompted. The model service binds only to your own computer. Microphone use still needs HTTPS or localhost. The runtime won't start. Update your graphics driver first. NVIDIA uses CUDA, AMD and Intel use Vulkan, and Macs use Metal. If your card still fails, set Backend to CPU only under Advanced in the app server's Pena AI panel and press Apply & start. It's slow but works anywhere. Your own model or adapter won't load. Use a GGUF supported by the llama-server build you picked under Advanced, with a working chat template. A LoRA must match its base model. Other models are allowed, but not every model understands chess evidence equally well."
 },
 {
  "page": "help page",
  "title": "Pena AI not working?",
  "part": 3,
  "text": "The graphics card ran out of memory or the driver reset. Stop Pena in the app server, close heavy games or other AI tools, and start him again. Under Advanced, a shorter context or fewer GPU layers can help if it still doesn't fit. He's quiet. He only comments on moves during a standard chess match, but you can chat with him any time. If Only talk when asked is on, he waits until you type or speak to him. Pena is missing on mobile. This is intentional. Pena is hidden and disabled on phones and tablets even when an imported configuration enables him. Narrow desktop windows still work. He's slow. With a match open he first gathers Stockfish, LC0 and Maia evidence, which takes a while, especially for the first answer."
 },
 {
  "page": "help page",
  "title": "Pena AI not working?",
  "part": 4,
  "text": "A higher Thinking effort also adds time. Set it to Auto or Low, or lower the Evidence amount, for quicker replies. The mic does nothing. Allow microphone access for the GUI page. If the position changes while you're talking, Pena asks you to try again so the answer matches the board. No sound. Browsers block audio until you interact with the page, so click Read aloud once. Pena speaks English, so pick an English voice. An answer is withheld. Pena holds an answer back if it cites evidence he wasn't given, leaks internal model markup or can't fit the position into his context. Try a shorter or more specific question. Answers that do come through can still be wrong, so treat them as a second opinion."
 },
 {
  "page": "help page",
  "title": "Pena AI not working?",
  "part": 5,
  "text": "He doesn't know the clock or your opponent. That's expected. A.C.A.S can't see the site's clock, time control, ratings or player names, so Pena can't either."
 },
 {
  "page": "help page",
  "title": "Is A.C.A.S a chess cheat?",
  "part": 1,
  "text": "Do NOT abuse A.C.A.S, use it to actually learn. While we support the most popular chess websites like Chess.com and Lichess.org, A.C.A.S is not intended to be used against other players without their consent. It is not ethical to use it to cheat, and you risk getting banned. The intended use is for self-improvement, analysis, or playing by yourself. There's many ways you can use A.C.A.S to learn."
 },
 {
  "page": "help page",
  "title": "How do I play more legitimately with A.C.A.S?",
  "part": 1,
  "text": "To play legitimately, vary your move times, avoid perfect accuracy, allow position swings, be mindful of \"blurs\" (switching browser tabs), balance speed and accuracy, limit fast moves in long games, match your rating, avoid showing extreme consistency, and... ugh, so many things. AI detection systems track these types of behavioral patterns to spot unfair play, so it's best to play honestly. Sooner or later you will get banned for following engine moves directly. Don't be that guy. For learning purposes, you can disable the Moves On External Site setting to only see advice when you choose, allowing you to improve your skills naturally."
 },
 {
  "page": "help page",
  "title": "Why is A.C.A.S not working for me?",
  "part": 1,
  "text": "If A.C.A.S is not working, the supported site may have changed or become unsupported. Please report issues so we can make updates. It's also possible that edge cases (such as unusual devices or rare Linux distributions) may cause problems. Our goal is for A.C.A.S to work on most devices, so inform us if you encounter persistent issues. Before reporting or giving negative reviews, please read the help page."
 },
 {
  "page": "help page",
  "title": "Does A.C.A.S have an automove setting?",
  "part": 1,
  "text": "Yes, A.C.A.S offers an automove setting (a bot that can play for you) which is currently only supported on Chess.com. This setting is hidden by default to prevent misuse, as most people would use automove in online matches, which is against Terms of Service. Automove exists mainly for debugging and quality control. For developer instructions, see the development page."
 },
 {
  "page": "help page",
  "title": "Why did I get banned?",
  "part": 1,
  "text": "Chess engines play differently than humans, making it easy for detection systems to catch statistical anomalies. For example, chess.com bans around 16,000 players for fair play abuse each month. They're quite good at detecting engines. As the saying goes, you're not him, so don't think you can get away with abusing A.C.A.S."
 },
 {
  "page": "help page",
  "title": "Why isn't an en passant move suggested?",
  "part": 1,
  "text": "En passant is legal only on the move immediately after an opponent advances a pawn by two squares. If A.C.A.S starts tracking a game mid-position or reconnects after a refresh, it may not have enough move history to reconstruct that temporary right. Keep A.C.A.S connected from the start of the game; if it misses the relevant move history, the engine cannot suggest an en passant move that the tracked position does not mark as legal."
 },
 {
  "page": "help page",
  "title": "What do common chess engine terms mean?",
  "part": 1,
  "text": "Move A \"move\" in a chess engine refers to each time a piece is moved from one square to another. Half-Move (Ply) A single action by one player. A complete turn has two plies: one for White and one for Black. Depth The number of plies (half-moves) the engine analyzes ahead. A higher depth leads to stronger moves but takes more time. Evaluation (Eval) A numerical value indicating who is ahead in a position. Positive means White is better; negative means Black is better. A.C.A.S shows this visually with a bar next to the board. Nodes The number of positions the engine has checked. More nodes means deeper and more accurate calculations."
 },
 {
  "page": "help page",
  "title": "What do common chess engine terms mean?",
  "part": 2,
  "text": "NNUE (Neural Network) A neural network-based evaluation, letting engines make more human-like and accurate assessments of a position. Movetime The time given for the engine to think before making a move. More time generally gives stronger moves. Chess Elo (Rating) A numerical measurement of a player’s or engine’s playing strength. Beginners: under 1000; club players: 1600–2200; grandmasters: above 2500; top engines: above 3500. FEN Forsyth–Edwards Notation: describes the exact position of all pieces on the chess board using a standard string. Example starting position: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
 },
 {
  "page": "help page",
  "title": "External Server",
  "part": 1,
  "text": "Make sure your browser allows this website to use the \"Local network\" and \"Apps on device\" permissions. Google Chrome / Edge. Click the lock/config icon in the address bar → Site settings. Enable Local network access and Installable / Apps on device permissions. Mozilla Firefox. Click the shield or lock icon → Permissions. Allow Local network and Device access. Safari (macOS / iOS) Open Settings → Safari → Advanced → Experimental Features (macOS) or Settings → Safari (iOS). Ensure Local network access is enabled. If the local server shows OFFLINE or cannot start because its port is in use, close any duplicate A.C.A.S server window."
 },
 {
  "page": "help page",
  "title": "External Server",
  "part": 2,
  "text": "If the port is still busy, click the port display in the server window to choose another port, then enter that same port in the A.C.A.S GUI's external engine settings. Changing the port restarts the server and stops running engines. A.C.A.S Free, open-source chess assistance. Licensed with GPLv3"
 }
];
