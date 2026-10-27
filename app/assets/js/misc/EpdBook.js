import { Chess } from '../../engines/libraries/chessjs/chess.js';
import { parseVariantFen, parseVariantMove, variantConfig } from './variantPosition.js';

// Move-annotated EPD, not a collection of starting positions. Coordinate moves
// use Fairy's UCI notation; SAN conversion is limited to ordinary chess.
export default class EpdBook {
    constructor(text) {
        this.positions = new Map();

        for(const [index, source] of text.split(/\r\n?|\n/).entries()) {
            const line = source.trim();
            if(!line || line.startsWith('#') || line.startsWith(';')) continue;
            const record = line.match(/^(\S+)\s+([wb])\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
            if(!record) throw new Error(`Invalid EPD position on line ${index + 1}.`);

            const fields = record.slice(1, 5);
            let tail = record[5] || '';
            // Preserve check counters when present, but ignore move clocks.
            const checks = tail.match(/^\d+\+\d+(?:\s+|$)/);
            if(checks) {
                fields.push(checks[0].trim());
                tail = tail.slice(checks[0].length);
            }
            tail = tail.replace(/^\d+\s+\d+(?:\s+|$)/, '');
            const position = EpdBook.readPosition(fields);
            if(!position) throw new Error(`Invalid EPD board on line ${index + 1}.`);

            const operations = new Map();
            for(const operation of EpdBook.splitOperations(tail)) {
                const match = operation.trim().match(/^(bm|pm|pv)\s+(.+)$/);
                if(match) operations.set(match[1], match[2].trim().split(/\s+/));
            }
            const moves = operations.get('bm') || operations.get('pm')?.slice(0, 1)
                || operations.get('pv')?.slice(0, 1) || [];
            if(!moves.length) continue;
            if(!this.positions.has(position.key)) this.positions.set(position.key, new Set());
            moves.forEach(move => this.positions.get(position.key).add(move));
        }

        if(!this.positions.size) throw new Error(
            'This EPD file contains no book moves. Add bm, pm or pv annotations; starting-position lists cannot supply move suggestions.'
        );
    }

    static splitOperations(text) {
        const operations = [];
        let start = 0, quoted = false, escaped = false;
        for(let index = 0; index < text.length; index++) {
            const char = text[index];
            if(escaped) { escaped = false; continue; }
            if(quoted && char === '\\') { escaped = true; continue; }
            if(char === '"') quoted = !quoted;
            else if(char === ';' && !quoted) {
                operations.push(text.slice(start, index));
                start = index + 1;
            }
        }
        if(quoted) throw new Error('Invalid EPD: unterminated quoted operand.');
        operations.push(text.slice(start));
        return operations;
    }

    static readPosition(input) {
        const fields = input.slice();
        if(fields.length >= 6 && /^\d+$/.test(fields.at(-2)) && /^\d+$/.test(fields.at(-1))) fields.splice(-2);
        if(fields.length < 4 || !/^[wb]$/.test(fields[1])) return null;
        const board = fields[0];
        if((board.match(/\d+/g) || []).some(amount => Number(amount) > 26)
            || board.split('/').length > 99
            || !/^(?:[1-9]\d*|\+?[a-zA-Z]~?|\*|\/)+(?:\[[a-zA-Z]*\])?$/.test(board)) return null;
        const position = parseVariantFen(fields.join(' '));
        const width = position.rows[0].length;
        if(!width || width > 26 || position.rows.some(row => row.length !== width)) return null;
        // Holdings are a multiset; their order (and empty brackets) must not
        // prevent a match. Do not discard holdings, rights or check counters.
        fields[0] = board.replace(/\[([a-zA-Z]*)\]$/, (match, pieces) =>
            pieces ? `[${[...pieces].sort().join('')}]` : '');
        return { key: fields.join(' '), position, fields };
    }

    getMoves(fullFen, config = {}) {
        if(typeof fullFen !== 'string') return [];
        const root = EpdBook.readPosition(fullFen.trim().split(/\s+/));
        if(!root) return [];
        const tokens = this.positions.get(root.key);
        if(!tokens) return [];
        const { rows, pocket } = root.position;
        const at = square => rows[rows.length - Number(square.slice(1))]?.[square.charCodeAt(0) - 97];
        const onBoard = square => /^[a-z][1-9]\d*$/.test(square)
            && Number(square.slice(1)) <= rows.length && square.charCodeAt(0) - 97 < rows[0].length;
        const context = variantConfig(config);
        const result = new Map();
        let chess = null;

        for(const token of tokens) {
            let move = parseVariantMove(token);
            // Compound moves need more than a single book arrow.
            if(token.includes(',')) continue;
            if(!move && context.variant === 'chess' && !context.useChess960) {
                chess ??= new Chess();
                if(!chess.load(root.fields.slice(0, 4).join(' ') + ' 0 1')) continue;
                const played = chess.move(token);
                if(played) move = { from: played.from, to: played.to, promotion: played.promotion || '' };
            }
            if(!move || !onBoard(move.to) || (!move.drop && !onBoard(move.from)) || move.from === move.to) continue;
            const piece = move.drop
                ? (root.fields[1] === 'w' ? move.drop.toUpperCase() : move.drop.toLowerCase())
                : at(move.from);
            if(!piece || piece === '*' || (piece === piece.toUpperCase()) !== (root.fields[1] === 'w')) continue;
            if(move.drop && (!pocket.includes(piece) || at(move.to))) continue;
            let to = move.to;
            if(context.useChess960 && piece.toLowerCase() === 'k'
                && at(to)?.toLowerCase() === 'r' && (at(to) === at(to).toUpperCase()) === (root.fields[1] === 'w'))
                to = `${to.charCodeAt(0) > move.from.charCodeAt(0) ? 'g' : 'c'}${move.from.slice(1)}`;
            result.set(`${move.from}|${to}|${move.promotion}`, {
                from: move.from, to, piece, promotion: move.promotion || null, weight: 1, learn: 0
            });
        }
        return [...result.values()];
    }
}