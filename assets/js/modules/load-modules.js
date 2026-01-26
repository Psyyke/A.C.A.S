// load-modules.js
// Main entry point for loading all A.C.A.S modules and initializing the app.
// Part of the modular ES6 codebase in assets/js/modules/.
// Imported as the only script in HTML files.

// Module loader for A.C.A.S

import { Chessground } from '../libraries/chessgroundx/chessground.js';
import zerofish from '../../app/assets/engines/zerofish/zerofishEngine.js';

export function loadModules() {
    window.ChessgroundX = Chessground;
    window.zerofish = zerofish;
}
