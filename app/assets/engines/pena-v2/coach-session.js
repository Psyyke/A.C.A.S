import { Chess } from '../libraries/chessjs/chess.js';
import { Facts } from './concepts.js';
import { findPlayedMove } from './questions.js';
import { moveGradeKind } from './coach-style.js';

const STORAGE_KEY = 'acasPenaPlayerPatternsV2';

export function mistakePattern(record, playerColor) {
    if(!record?.last?.fen || !record.fen || moveGradeKind(record.last.label) !== 'bad') return null;
    const played = findPlayedMove(record.last.fen, record.fen);
    if(!played || played.color !== playerColor) return null;
    const before = new Facts(record.last.fen), after = new Facts(record.fen);
    const newlyLoose = after.find(null, playerColor).filter(piece => piece.type !== 'k'
        && after.hanging(piece).length && after.capturers(piece.square, after.board.turn()).length
        && !before.hanging({ ...piece, square: piece.square === played.to ? played.from : piece.square }).length);
    if(newlyLoose.length) return { key: 'loose-pieces', evidence: `leaving ${newlyLoose.map(piece => piece.square).join(', ')} vulnerable to a legal capture` };
    const best = record.last.bestUci;
    if(best) {
        const board = new Chess(record.last.fen);
        const move = board.moves({ verbose: true }).find(move => move.from + move.to + (move.promotion || '') === best);
        if(move && /[+#]$/.test(move.san) && !/[+#]$/.test(played.san))
            return { key: 'missed-checks', evidence: 'missing an engine-preferred checking move' };
    }
    const fullmove = Number(record.last.fen.split(' ')[5]);
    const home = playerColor === 'w' ? '1' : '8';
    if(played.piece === 'q' && fullmove <= 10 && before.find('nb', playerColor).filter(piece => piece.square[1] === home).length >= 2)
        return { key: 'early-queen', evidence: 'moving the queen early while at least two minor pieces remain on their home rank' };
    return null;
}

export class PlayerPatterns {
    constructor(storage = globalThis.localStorage, onError = error => console.warn('[Pena player patterns]', error)) {
        this.storage = storage;
        this.onError = onError;
        this.seen = new Set();
        this.data = { games: 0, counts: {}, lastMentionGame: -3, activeGames: {} };
        try {
            const saved = storage?.getItem(STORAGE_KEY);
            if(saved) {
                const data = JSON.parse(saved);
                if(!Number.isSafeInteger(data.games) || data.games < 0 || !data.counts || typeof data.counts !== 'object'
                    || Array.isArray(data.counts) || !Number.isSafeInteger(data.lastMentionGame)
                    || data.lastMentionGame < -3 || data.lastMentionGame > data.games
                    || data.activeGames && (typeof data.activeGames !== 'object' || Array.isArray(data.activeGames)
                        || Object.values(data.activeGames).some(game => !Number.isSafeInteger(game) || game < 1 || game > data.games))
                    || Object.entries(data.counts).some(([key, value]) => !['loose-pieces', 'missed-checks', 'early-queen'].includes(key)
                        || !value || ['count', 'games', 'lastGame'].some(field => !Number.isSafeInteger(value[field]) || value[field] < 0)
                        || value.games > data.games || value.lastGame > data.games))
                    throw new Error('Invalid saved coaching patterns.');
                this.data = { ...data, activeGames: data.activeGames || {} };
            }
        } catch(error) { this.onError(error); }
    }

    save() {
        try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data)); }
        catch(error) { this.onError(error); }
    }

    beginGame(key, { fresh = false } = {}) {
        if(key && !fresh && Number.isSafeInteger(this.data.activeGames[key])) return this.data.activeGames[key];
        this.data.games++;
        if(key) {
            delete this.data.activeGames[key];
            this.data.activeGames[key] = this.data.games;
            const keys = Object.keys(this.data.activeGames);
            if(keys.length > 32) delete this.data.activeGames[keys[0]];
        }
        this.save();
        return this.data.games;
    }

    observe(record, playerColor, game) {
        const pattern = mistakePattern(record, playerColor);
        if(!pattern) return null;
        const id = `${game}:${record.last.fen}:${record.last.uci || record.fen}`;
        if(this.seen.has(id)) return null;
        this.seen.add(id);
        while(this.seen.size > 512) this.seen.delete(this.seen.values().next().value);
        const previous = this.data.counts[pattern.key] || { count: 0, games: 0, lastGame: 0 };
        this.data.counts[pattern.key] = { count: Math.min(999, previous.count + 1),
            games: previous.games + Number(previous.lastGame !== game), lastGame: game };
        this.save();
        return pattern;
    }

    recurring(record, playerColor, game) {
        const pattern = mistakePattern(record, playerColor);
        if(!pattern || this.data.games - game > 0 || game - this.data.lastMentionGame < 3
            || (this.data.counts[pattern.key]?.games || 0) < 2) return null;
        return pattern;
    }

    reminder(record, playerColor, game) {
        const pattern = this.recurring(record, playerColor, game);
        if(!pattern) return '';
        return `A board-checked recurring pattern across games is ${pattern.evidence}. This move is another example. Mention the pattern briefly, without claiming it caused anything the evidence does not establish.`;
    }

    comment(record, playerColor, game) {
        const pattern = this.recurring(record, playerColor, game);
        return pattern ? {
            'loose-pieces': 'Leaving pieces vulnerable has come up in your earlier games too.',
            'missed-checks': 'Overlooking checks has come up in your earlier games too.',
            'early-queen': 'Moving the queen early before developing your minor pieces has come up in your earlier games too.'
        }[pattern.key] : '';
    }

    markMentioned(game) {
        this.data.lastMentionGame = game;
        this.save();
    }
}
