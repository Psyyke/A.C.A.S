# Troubleshoot 🛠️

!> Browsers freeze code execution on inactive pages, you need to visit the GUI tab from time to time, **keep it at least partly visible on a separate window** or **use the <a target="_about" href="app?shl=pip">Floating Panel</a> setting**. This prevents A.C.A.S from freezing and not giving any move suggestions.

<div class="gas"></div>

## Not Working

Before [making an issue](https://github.com/Psyyke/A.C.A.S/issues), please read these and also join the [Discord server](https://hakorr.github.io/Userscripts/community/invite) for assistance,

- Make sure the <a target="_about" href="app">GUI</a> is active. Do not close the tab.

- Not seeing any moves displayed on the chess site? Are you sure you have enabled the <a target="_about" href="app?shl=displayMovesOnExternalSite">Display Moves On External Site</a> setting? After enabling that setting, please refresh the chess site to see changes.

- Are you trying to play variants on Chess.com? If so, it's not currently supported very well since I had to rush the project, sorry! Other sites with variants might also be buggy, you can make an issue about that if you want.

- Make sure you did **NOT** set "*Piece Animations*" to "*Arcade*" on **Chess.com** board settings! Set the "*Piece Animations*" to "*None*" so that A.C.A.S can parse the board correctly. Thanks!

- If A.C.A.S complains having no userscript even though it is installed, press down the "shift" key, and then click your browser's refresh button to perform a hard refresh, hopefully clearing the wrongly cached state.

- Nothing is helping? Restart your PC. Try Violentmonkey and a Chromium based browser, such as Brave. Use the default settings. Keep two windows open at the same time next to each other, one having the GUI and one the chess site.

Otherwise, it could be a bug, please make an issue [here](https://github.com/psyyke/A.C.A.S/issues/new). 

> When making an issue, please be descriptive! Mention,
> - The chess site and the variant you were playing.
> - The browser and the userscript manager you were using.
> - What did you do for the bug to happen, does it happen often? How could I reproduce it?
> - You can also include a screenshot of the browser console (e.g. `CTRL + SHIFT + I` or right click, inspect, and go to the console tab), look for **grey underlined text** at the beginning of a red background area, on the right side of the screen, which has the word 'A.C.A.S'. That's an error from the userscript.