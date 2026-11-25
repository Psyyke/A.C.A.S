import { compareStrategy, strategyCards } from './strategy.js';
import { moveInsightFacts } from './insights.js';
import { parseQuestionMoves } from './questions.js';

const other = color => color === 'w' ? 'b' : 'w';
const label = piece => `${piece.color}${piece.type.toUpperCase()}@${piece.square}`;
const cache = new Map();
const freeze = value => {
    if(value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};
const metrics = {
    'pawn-structure': ['pawnStructure', 'pawn-structure heuristic'],
    'pawn-pressure': ['pawnPressure', 'weak-pawn-pressure heuristic'],
    'defensive-duties': ['defensiveDuties', 'geometric guard/blockader count'],
    'king-zone-pressure': ['kingZonePressure', 'non-king king-zone control relations'],
    'advanced-control': ['advancedControl', 'advanced pawn-file-gap weighted subtotal'],
    development: ['developedMinors', 'minor pieces off home rank']
};

function range(values) {
    const low = Math.min(...values), high = Math.max(...values);
    return low === high ? String(low) : `${low}..${high}`;
}

function summary(samples, metric, color) {
    const number = value => Array.isArray(value) ? value.length : value.value;
    return ['w', 'b'].map(side => range(samples.map(sample => number(sample.profile.colors[side][metric])))).join('/')
        + `/${range(samples.map(sample => Math.round((number(sample.profile.colors[color][metric])
            - number(sample.profile.colors[other(color)][metric])) * 1e9) / 1e9))}`;
}

function witnesses(samples, metric, color) {
    const describe = profile => {
        const data = profile.colors[color][metric];
        if(metric === 'developedMinors') return data.map(label);
        if(metric === 'pawnStructure') return data.rows.filter(row => row.passed || row.isolated)
            .map(row => `${label(row.piece)}:${row.passed ? 'passed' : 'isolated'}`);
        if(metric === 'defensiveDuties') return data.rows.map(row =>
            `${label(row.piece)}:${row.kind === 'geometric-guard' ? 'guards' : 'blocks'}:${label(row.target)}`);
        if(metric === 'pawnPressure') return data.rows.flatMap(row => row.attackers.map(piece => `${label(piece)}>${label(row.piece)}`));
        return data.rows.flatMap(row => row.attackers.map(piece => `${label(piece)}>${row.square}`));
    };
    const sets = samples.map(sample => new Set(describe(sample.profile)));
    const shared = [...sets[0]].filter(item => sets.every(set => set.has(item)));
    return shared.slice(0, 2).join(',') || 'NONE-shared';
}

/** Computed BinProp witnesses; no model-authored properties or fallback explanations. */
export function strategicCoachingEvidence(input, engineEvidence) {
    const root = input.frames.find(frame => frame.id === 'root');
    if(!root?.spatial || engineEvidence.fen !== root.fen)
        throw new Error('Strategic coaching requires the exact current framed input.');
    const frames = [...input.frames];
    for(const frame of engineEvidence.frames) {
        if(frames.some(existing => existing.id === frame.id)) throw new Error('Strategic source frame collision.');
        frames.push(frame);
    }
    const lc = engineEvidence.references.filter(ref => ref.kind === 'lc0-line').map(ref => ({
        id: ref.id, moves: ref.data.moves, frameIds: ref.data.frameIds, preferred: ref.data.preferred
    }));
    const groups = [{ name: 'LC0', lines: lc }, { name: 'Stockfish', lines: input.lines.map(line => ({
        ...line, preferred: line.id === input.source.preferredLineId
    })) }];
    const mentioned = new Set(parseQuestionMoves(input.question, root.fen).filter(item => !item.opponent)
        .map(item => item.move.from + item.move.to + (item.move.promotion || '')));
    const identity = JSON.stringify([root.spatial.turn, [...mentioned].sort(), groups, frames.map(({ id, fen, parentId, move, pieces }) =>
        [id, fen, parentId, move, pieces])]);
    if(cache.has(identity)) return cache.get(identity);
    const comparisons = [], references = [];
    for(const group of groups) {
        const preferred = group.lines.find(line => line.preferred);
        if(!preferred) continue;
        for(const alternative of group.lines.filter(line => line.moves[0] !== preferred.moves[0])) {
            const positive = group.lines.filter(line => line.moves[0] === preferred.moves[0]);
            const negative = group.lines.filter(line => line.moves[0] === alternative.moves[0]);
            if(comparisons.some(item => item.source === group.name && item.alternativeMove === alternative.moves[0])) continue;
            const horizon = Math.min(...[...positive, ...negative].map(line => line.frameIds.length));
            if(horizon < 1) throw new Error('Strategic comparison has no legal sampled continuation.');
            const comparison = compareStrategy({ frames, color: root.spatial.turn,
                positivePaths: positive.map(line => ['root', ...line.frameIds.slice(0, horizon)]),
                negativePaths: negative.map(line => ['root', ...line.frameIds.slice(0, horizon)]) });
            comparisons.push({ source: group.name, preferredMove: preferred.moves[0], alternativeMove: alternative.moves[0],
                positiveIds: positive.map(line => line.id), negativeIds: negative.map(line => line.id),
                horizon, comparison, cards: strategyCards(comparison) });
        }
    }
    comparisons.sort((a, b) => Number(mentioned.has(b.alternativeMove)) - Number(mentioned.has(a.alternativeMove)));
    let qualifyingCards = 0;
    for(const item of comparisons) for(const card of item.cards) {
        qualifyingCards++;
        if(references.length >= 2) continue;
        const [metric, title] = metrics[card.kind];
        const { comparison } = item;
        const first = `${item.positiveIds.join('/')}@${item.horizon}ply`, second = `${item.negativeIds.join('/')}@${item.horizon}ply`;
        const named = ['w', 'b'].map(color => `${color}:${witnesses(comparison.positive, metric, color)}|${witnesses(comparison.negative, metric, color)}`).join(';');
        references.push({ id: `BP${references.length + 1}`, kind: 'binprop-contrast', frameId: root.id,
            text: `IF ${first} versus ${second}: ${title} (w/b/${comparison.color}-minus-${other(comparison.color)}) ${summary(comparison.positive, metric, comparison.color)} versus ${summary(comparison.negative, metric, comparison.color)}. Shared examples(first|second): ${named}.`,
            data: { source: item.source, horizon: item.horizon, positiveIds: item.positiveIds, negativeIds: item.negativeIds,
                comparison, card } });
    }
    const forcing = [];
    for(const line of lc) {
        for(let ply = 1; ply < line.frameIds.length; ply++) {
            const before = frames.find(frame => frame.id === line.frameIds[ply - 1]);
            const after = frames.find(frame => frame.id === line.frameIds[ply]);
            const facts = moveInsightFacts(before, after).filter(fact => ['check', 'capture', 'promotion'].includes(fact.kind));
            if(!facts.length) continue;
            forcing.push({ id: `${line.id}.p${ply + 1}`, kind: 'lc0-forcing-effect', frameId: after.id,
                text: `IF ${line.id}, ply ${ply + 1} ${after.move.color}:${after.move.san}: ${facts.map(fact => fact.text).join(' ')}`,
                data: { lineId: line.id, path: line.frameIds.slice(0, ply + 1), facts } });
        }
    }
    const status = { id: 'BP.scope', kind: 'binprop-scope', frameId: root.id,
        text: `BinProp sampled equal-ply comparisons=${comparisons.length}; cards=${references.length}; omitted=${qualifyingCards - references.length}. `
            + 'Scores/thresholds=heuristics,not cp/safety/forced outcomes/engine reasons;not all possible replies. '
            + 'King-zone excludes kings;advanced subtotals may stop>=14,not permanent holes. '
            + 'Witnesses=shared examples,not complete;NONE-shared!=zero. sameRelations=ID copies full relations. No fallback.',
        data: { comparisons: comparisons.length, contrasts: references.length, omittedContrasts: qualifyingCards - references.length, usedFallback: false } };
    const result = freeze({ schema: 'pena-v2-strategic-coaching-evidence/1', references: [status, ...references, ...forcing], comparisons });
    cache.set(identity, result);
    if(cache.size > 128) cache.delete(cache.keys().next().value);
    return result;
}
