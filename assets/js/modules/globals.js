// globals.js
// Global variables and logging utilities for A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used for shared constants, translation objects, and logging helpers.

/**
 * Global configuration keys and indicators.
 * @type {Object}
 */
export const GLOBAL_VARIABLES = {
    gmConfigKey: 'AcasConfig',
    tempValueIndicator: '-temp-value-'
};

/**
 * Translation object for the current language (set at runtime).
 * @type {Object|null}
 */
export let transObj = null;

/**
 * Full translation object for the current language (set at runtime).
 * @type {Object|null}
 */
export let fullTransObj = null;

/**
 * Logging utilities for A.C.A.S.
 * @type {Object}
 */
export const log = {
    info: (...message) => console.log(`[A.C.A.S]%c ${message.join(' ')}`, 'color: #67a9ef;'),
    success: (...message) => console.log(`[A.C.A.S]%c ${message.join(' ')}`, 'color: #67f08a;')
};

/**
 * Generate GeoGebra dot commands for board visualization.
 * @param {Object} data
 * @returns {Object}
 */
export function geoGebraDotCommands(data) {
    const { w, b } = data;
    const arrToGeoList = arr => `{${arr.join(",")}}`;
    const wList = arrToGeoList(w);
    const bList  = arrToGeoList(b);
    const wCmd =
        `wPoints = Sequence((i, Element(${wList}, i)), i, 1, ${w.length})`;
    const bCmd =
        `bPoints = Sequence((i, Element(${bList}, i)), i, 1, ${b.length})`;
    return { wCmd, bCmd };
}

/**
 * Remove duplicate moves from a move list.
 * @param {Array} moves
 * @returns {[Array, number]}
 */
export function getUniqueMoves(moves) {
    const seen = new Set();
    const cleaned = new Array(moves.length);
    let write = 0;
    let removedCount = 0;
    for(let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const key =
            m.player[0] + ',' + m.player[1] + '|' +
            m.opponent[0] + ',' + m.opponent[1] + '|' +
            m.profile;
        if (!seen.has(key)) {
            seen.add(key);
            cleaned[write++] = m;
        } else {
            removedCount++;
        }
    }
    cleaned.length = write;
    return [cleaned, removedCount];
}

/**
 * Convert an object to a string representation.
 * @param {Object} obj
 * @returns {string}
 */
export function objectToString(obj) {
    const parts = [];
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            if (Array.isArray(value)) {
                const innerValues = value.map(item => objectToString(item)).join(', ');
                parts.push(`${key}: ${innerValues}`);
            } else if (typeof value === 'object' && value !== null) {
                const innerObject = objectToString(value);
                parts.push(`${key}: { ${innerObject} }`);
            } else {
                parts.push(`${key}: ${value}`);
            }
        }
    }
    return parts.join(', ');
}
