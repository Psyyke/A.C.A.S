const coordinate = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function numeric(text, field, { integer = false, min = -Infinity, max = Infinity } = {}) {
    const value = Number(text);
    if(!text?.trim() || !Number.isFinite(value) || integer && !Number.isSafeInteger(value) || value < min || value > max)
        throw new Error(`Invalid Lc0 ${field}: ${text}`);
    return value;
}

export function parseMoveStats(line) {
    const text = line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/^info string\s+/, '').trim();
    if(!/^[a-h][1-8][a-h][1-8][qrbn]?\s+\(/.test(text)) return null;
    const head = text.match(/^(\S+)\s+\(\s*(\d+)\s*\)\s+N:\s*(\d+)\s+\(\+\s*(\d+)\)\s+\(P:\s*([^%]+)%\)/);
    if(!head) throw new Error(`Malformed Lc0 move statistics: ${text}`);
    const fields = {};
    for(const [, key, raw] of text.matchAll(/\(([A-Z]+):\s*([^)]*)\)/g)) {
        if(key === 'P') continue;
        fields[key] = /^-\.[-]+$/.test(raw.trim()) ? null : numeric(raw, key);
    }
    for(const key of ['Q', 'V', 'U', 'S', 'WL', 'D', 'M'])
        if(!Object.hasOwn(fields, key)) throw new Error(`Lc0 statistics are missing ${key}: ${text}`);
    const visits = numeric(head[3], 'visits', { integer: true, min: 0 });
    const probability = numeric(head[5], 'policy', { min: 0, max: 100 }) / 100;
    return {
        move: head[1], visits, inFlight: numeric(head[4], 'in-flight visits', { integer: true, min: 0 }),
        policyPrior: probability,
        // Unvisited Q is first-play urgency, not a searched evaluation.
        search: visits ? { q: fields.Q, winLoss: fields.WL, draw: fields.D, movesLeft: fields.M } : null,
        firstPlayUrgency: visits ? null : fields.Q,
        neuralValue: fields.V, exploration: fields.U, selectionScore: fields.S,
        bound: text.match(/\(([TWL])\)\s*$/)?.[1] || null, raw: line
    };
}

export function parsePv(line) {
    if(!line.startsWith('info ') || /\bstring\b/.test(line)) return null;
    const pv = line.match(/\bpv\s+(.+)$/)?.[1].trim().split(/\s+/);
    if(!pv) return null;
    if(!pv.length || pv.some(move => !coordinate.test(move))) throw new Error(`Invalid Lc0 PV: ${line}`);
    const number = name => {
        const match = line.match(new RegExp(`\\b${name} (-?\\d+)\\b`));
        return match ? numeric(match[1], name, { integer: true }) : null;
    };
    const score = line.match(/\bscore (cp|mate) (-?\d+)/);
    const wdl = line.match(/\bwdl (\d+) (\d+) (\d+)/);
    return {
        rank: number('multipv') ?? 1, pv, depth: number('depth'), nodes: number('nodes'),
        score: score ? { kind: score[1], value: Number(score[2]), bound: line.match(/\b(lowerbound|upperbound)\b/)?.[1] || null } : null,
        wdl: wdl ? wdl.slice(1).map(Number) : null, raw: line
    };
}

export function collectSearch(lines) {
    const statistics = new Map(), variations = new Map();
    let bestMove;
    for(const line of lines) {
        const stat = parseMoveStats(line);
        if(stat) statistics.set(stat.move, stat);
        const pv = parsePv(line);
        if(pv) variations.set(pv.rank, pv);
        if(line.startsWith('bestmove ')) {
            bestMove = line.split(/\s+/)[1];
            if(bestMove !== '0000' && !coordinate.test(bestMove)) throw new Error(`Invalid Lc0 best move: ${line}`);
        }
    }
    if(bestMove === undefined) throw new Error('Lc0 search did not complete.');
    if(bestMove !== '0000' && !statistics.size) throw new Error('Lc0 returned no verbose candidate statistics.');
    const candidates = [...statistics.values()].sort((a, b) => b.visits - a.visits || b.policyPrior - a.policyPrior);
    return { bestMove: bestMove === '0000' ? null : bestMove, candidates,
        lines: [...variations.values()].sort((a, b) => a.rank - b.rank) };
}
