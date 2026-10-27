// Shared FEN/UCI handling. Do not assume an 8x8 board or discard variant pockets.
export function variantConfig(config = {}) {
    const name = String(config.chessVariant || config.variant || 'chess').replace(/[ -]/g, '').toLowerCase();
    const aliases = { standard: 'chess', normal: 'chess', fromposition: 'chess', threecheck: '3check' };
    const random = ['chess960', 'fischerandom'].includes(name);
    return { variant: random ? 'chess' : aliases[name] || name,
        useChess960: Boolean(config.useChess960 || random) };
}

export function parseVariantFen(fen) {
    const fields = String(fen).trim().split(/\s+/);
    const pocket = fields[0].match(/\[[^\]]*\]$/)?.[0] || '';
    const rows = fields[0].replace(/\[[^\]]*\]$/, '').split('/').map(row => {
        const squares = [];
        for(const token of row.match(/\d+|\+?[a-zA-Z][~]?|\*/g) || []) {
            if(/^\d+$/.test(token)) squares.push(...Array(Number(token)).fill(null));
            else squares.push(token);
        }
        return squares;
    });
    return { fields, rows, pocket };
}

export function writeVariantFen(position) {
    const fields = position.fields.slice();
    fields[0] = position.rows.map(row => {
        let text = '', empty = 0;
        for(const piece of [...row, '*end*']) {
            if(piece === null) empty++;
            else {
                if(empty) text += empty;
                empty = 0;
                if(piece !== '*end*') text += piece;
            }
        }
        return text;
    }).join('/') + position.pocket;
    return fields.join(' ');
}

export function parseVariantMove(uci) {
    const drop = String(uci).match(/^([a-zA-Z])@([a-z]\d+)$/);
    if(drop) return { from: `${drop[1]}@`, to: drop[2], promotion: '', uci, drop: drop[1] };
    const match = String(uci).match(/^([a-z]\d+)([a-z]\d+)([a-zA-Z+]?)(,.*)?$/);
    if(!match) return null;
    const shot = match[4]?.match(/^,([a-z]\d+)([a-z]\d+)$/);
    return { from: match[1], to: match[2], promotion: match[3] || '', uci,
        ...(shot && shot[1] === match[2] && !match[3]
            ? { shot: { from: shot[1], to: shot[2] } } : {}) };
}

export function getAmazonsShot(move, opponent = false) {
    if(variantConfig(move).variant !== 'amazons') return null;
    const detail = opponent ? move.opponentHintDetail : move.hintDetail;
    if((detail && detail !== 'full') || (opponent ? move.opponentHidden : move.playerHidden)) return null;
    const parsed = parseVariantMove(opponent ? move.opponentUci : move.playerUci);
    const [from, to] = (opponent ? move.opponent : move.player) || [];
    return parsed?.shot && parsed.from === from && parsed.to === to ? parsed.shot : null;
}

export function positionKey(fen) {
    return String(fen).trim().split(/\s+/).slice(0, 2).join(' ');
}