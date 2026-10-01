import FairyAnalysis from './FairyAnalysis.js';
import { parseVariantFen, writeVariantFen, variantConfig } from './misc/variantPosition.js';

// Counterfactual contributions are estimates, not material values. Keep negative
// contributions: in losing-chess variants a piece can genuinely be a liability.
export default class PieceEvaluator extends FairyAnalysis {
    constructor(fen) { super(); this.fen = fen; }
    cancel() { this.cancelStaleRequests(); }

    eval(callback, config = {}) {
        const fen = config.fen || this.fen;
        const context = variantConfig(config);
        const depth = 5;
        return this.enqueue(`pieces|${context.variant}|${context.useChess960}|${fen}|${depth}`, { ...config, fen }, async job => {
            const position = parseVariantFen(fen);
            const base = await this.search(job, depth);
            if(job.cancelled) return null;
            const score = base.iterations.get(Math.max(...base.iterations.keys()))[0];
            // Mate/outcome distances cannot be subtracted as centipawns.
            if(score.cp === null) return {};
            const results = {};
            const nonRoyalKings = ['antichess', 'giveaway', 'suicide'].includes(job.variant);
            for(let row = 0; row < position.rows.length; row++) {
                for(let file = 0; file < position.rows[row].length; file++) {
                    if(job.cancelled) return null;
                    const piece = position.rows[row][file];
                    if(!piece || piece === '*' || !nonRoyalKings && piece.replace(/[+~]/g, '').toLowerCase() === 'k') continue;
                    const modified = parseVariantFen(fen);
                    modified.rows[row][file] = null;
                    const square = String.fromCharCode(97 + file) + (position.rows.length - row);
                    // Removing a rook must not leave a dangling castling right.
                    const hasCastling = modified.fields.length >= 6 && /^[-KQkqA-Ha-h]+$/.test(modified.fields[2]);
                    const white = piece === piece.toUpperCase();
                    const homeRank = row === (white ? position.rows.length - 1 : 0);
                    if(piece.replace(/[+~]/g, '').toLowerCase() === 'r' && hasCastling && homeRank) {
                        const rights = new Set([white ? String.fromCharCode(65 + file) : String.fromCharCode(97 + file)]);
                        if(job.useChess960) {
                            const kingFile = position.rows[row].findIndex(token => token === (white ? 'K' : 'k'));
                            // K/Q rights in X-FEN identify the outermost rook on
                            // that side of the king, not necessarily a/h files.
                            const rook = white ? 'R' : 'r';
                            if(kingFile >= 0 && file < kingFile && !position.rows[row].slice(0, file).includes(rook)) rights.add(white ? 'Q' : 'q');
                            if(kingFile >= 0 && file > kingFile && !position.rows[row].slice(file + 1).includes(rook)) rights.add(white ? 'K' : 'k');
                        } else {
                            if(file === 0) rights.add(white ? 'Q' : 'q');
                            if(file === position.rows[row].length - 1) rights.add(white ? 'K' : 'k');
                        }
                        modified.fields[2] = [...modified.fields[2]].filter(right => !rights.has(right)).join('') || '-';
                    }
                    if(piece.replace(/[+~]/g, '').toLowerCase() === 'p' && /^[a-z]\d+$/.test(modified.fields[3] || '')) modified.fields[3] = '-';
                    const modifiedJob = { ...job, fen: writeVariantFen(modified) };
                    // Removal can end the game in variants (for example racing kings
                    // or extinction rules). Do not pretend an outcome is a cp value.
                    const legal = await this.legalMoves(modifiedJob);
                    if(job.cancelled) return null;
                    if(!legal.length) continue;
                    let without;
                    const worker = this.engine;
                    try {
                        without = await this.search(modifiedJob, depth);
                    } catch(error) {
                        if(job.cancelled) return null;
                        // Some counterfactual removals are illegal or terminal in
                        // variant rules. Skip them, not the entire board; crashes
                        // still propagate to the shared recovery path.
                        if(worker !== this.engine) throw error;
                        continue;
                    }
                    if(job.cancelled) return null;
                    const other = without.iterations.get(Math.max(...without.iterations.keys()))[0];
                    if(other.cp === null) continue;
                    const ownColor = piece === piece.toUpperCase() ? 'w' : 'b';
                    const cp = (score.cp - other.cp) * (ownColor === position.fields[1] ? 1 : -1);
                    results[square] = { piece, cp, eval: cp / 100 };
                }
            }
            return results;
        }).then(result => {
            if(typeof callback === 'function') callback(result || {});
            return result || {};
        });
    }
}