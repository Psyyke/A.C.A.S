/*!
 * Witness-producing adaptations of BinProp's chess/claude-opus-5 predicates.
 * Copyright (c) 2026 Ori Press and Alexander Golubev. MIT License; see BINPROP-LICENSE.txt.
 */
import { spatialFacts } from './spatial.js';
import { PositionGraph } from './positions.js';

export const strategyMotifs = [
    { id: '2a78a7eca416712b', name: 'advanced control with current pawn-file exclusions', delta: 0.18836000000000003, metric: 'advancedControl' },
    { id: 'f815717572588e18', name: 'superior pawn structure and passed pawn edge', delta: 0.15405, metric: 'pawnStructure' },
    { id: 'd7f4da2534e3d415', name: 'non-king geometric pressure into the king zone', delta: 0.09504999999999998, metric: 'kingZonePressure' },
    { id: 'c0b4f5060c344764', name: 'pressure on the opponent weak pawns', delta: 0.08586, metric: 'pawnPressure' },
    { id: 'fb1bd91c8d7fde86', name: 'opponent pieces tied to passive defence', delta: 0.06611, metric: 'defensiveDuties' }
];
const other = color => color === 'w' ? 'b' : 'w';
const side = color => color === 'w' ? 'White' : 'Black';
const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const name = piece => `${side(piece.color)} ${names[piece.type]} ${piece.square}`;
const controlWitnesses = data => data.rows.map(row => `${row.square}: ${row.attackers.map(name).join(', ')} geometrically controls; `
    + `opposing controllers ${row.defenders.map(name).join(', ') || 'none'}; occupant ${row.occupant ? name(row.occupant) : 'none'}`).join('; ') || 'none';
const file = square => square.charCodeAt(0) - 97;
const rank = (square, color) => color === 'w' ? Number(square[1]) - 1 : 8 - Number(square[1]);
const round = value => Math.round(value * 1e9) / 1e9;
const freeze = value => { if(value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const comparisons = new WeakSet();

export function strategicProfile(frame, color) {
    if(!['w', 'b'].includes(color)) throw new Error('Strategy needs an explicit root-player perspective.');
    const facts = spatialFacts(frame), byId = new Map(facts.pieces.map(piece => [piece.id, piece]));
    const pieces = c => facts.pieces.filter(piece => piece.color === c);
    const pawns = c => pieces(c).filter(piece => piece.type === 'p');
    const controllers = (c, square) => pieces(c).filter(piece => piece.controls.includes(square));
    const material = (c, queen = 900) => pieces(c).reduce((sum, piece) => sum + ({ p: 100, n: 320, b: 330, r: 500, q: queen, k: 0 })[piece.type], 0);
    const pawnGuards = piece => piece.defenders.map(id => byId.get(id)).filter(piece => piece.type === 'p');
    const pawnScore = c => {
        const own = pawns(c), enemy = pawns(other(c)), files = [...new Set(own.map(piece => file(piece.square)))].sort((a, b) => a - b);
        let score = own.length ? 0 : -1;
        const rows = own.map(piece => {
            const f = file(piece.square), r = rank(piece.square, c);
            const ahead = enemy.filter(enemy => Math.abs(file(enemy.square) - f) <= 1 && rank(enemy.square, c) > r);
            const isolated = !files.includes(f - 1) && !files.includes(f + 1), passed = ahead.length === 0;
            const guards = pawnGuards(piece), pawnAttackers = piece.attackers.map(id => byId.get(id)).filter(piece => piece.type === 'p');
            const front = piece.square[0] + (Number(piece.square[1]) + (c === 'w' ? 1 : -1));
            const blockedByEnemy = facts.pieces.some(piece => piece.square === front && piece.color !== c);
            let contribution = 0;
            if(passed) contribution += 1 + 0.55 * Math.max(0, r - 2) + (guards.length ? 0.5 : 0) - (blockedByEnemy ? 0.4 : 0);
            if(isolated) contribution -= 1;
            else if(!ahead.some(piece => file(piece.square) === f) && pawnAttackers.length > guards.length) contribution -= 0.7;
            score += contribution;
            return { piece, passed, isolated, pawnGuards: guards, pawnAttackers, contribution: round(contribution) };
        });
        const doubled = files.reduce((sum, f) => sum + Math.max(0, own.filter(piece => file(piece.square) === f).length - 1), 0);
        const islands = files.reduce((sum, f, i) => sum + (i === 0 || f !== files[i - 1] + 1 ? 1 : 0), 0);
        if(own.length) score -= 0.8 * doubled + 0.4 * (islands - 1);
        return { value: round(score), rows, doubledExtraPawns: doubled, islands };
    };
    const pressure = c => {
        const opponent = other(c), rows = [];
        for(const piece of pawns(opponent)) {
            const r = rank(piece.square, opponent), attackers = piece.attackers.map(id => byId.get(id));
            if(r > 4 || !attackers.length) continue;
            const defenders = piece.defenders.map(id => byId.get(id));
            const potentialPawnGuard = pawns(opponent).some(pawn => Math.abs(file(pawn.square) - file(piece.square)) === 1 && rank(pawn.square, opponent) < r);
            let value = r >= 2 && !potentialPawnGuard ? 1 : 0;
            if(attackers.length > defenders.length && !defenders.some(piece => piece.type === 'p')) value += 2;
            if(value && attackers.some(attacker => ['r', 'q'].includes(attacker.type) && attacker.square[0] === piece.square[0])) value++;
            if(value) rows.push({ piece, attackers, defenders, potentialPawnGuard, value });
        }
        const harassed = pieces(opponent).filter(piece => ['n', 'b', 'r', 'q'].includes(piece.type)
            && piece.attackers.some(id => byId.get(id).type === 'p'));
        return { value: rows.reduce((sum, row) => sum + row.value, 0) + Math.min(2, harassed.length), rows, harassed };
    };
    const duties = c => {
        const rows = [];
        for(const target of pieces(c).filter(piece => piece.type !== 'k' && piece.attackers.length && piece.defenders.length)) {
            for(const defenderId of target.defenders) {
                const defender = byId.get(defenderId);
                if(defender.type !== 'p' && (target.type === 'p' || target.defenders.length === 1))
                    rows.push({ kind: 'geometric-guard', piece: defender, target, attackers: target.attackers.map(id => byId.get(id)) });
            }
        }
        for(const pawn of facts.pawns.filter(pawn => pawn.color !== c && pawn.passed)) {
            const front = pawn.square[0] + (Number(pawn.square[1]) + (pawn.color === 'w' ? 1 : -1));
            const piece = pieces(c).find(piece => piece.square === front && piece.type !== 'p');
            if(piece) rows.push({ kind: 'passed-pawn-blockader', piece, target: byId.get(pawn.pieceId), attackers: [] });
        }
        return { value: new Set(rows.map(row => row.piece.id)).size, rows };
    };
    const kingZone = c => {
        const opponent = other(c), king = pieces(opponent).find(piece => piece.type === 'k');
        const f = file(king.square), r = Number(king.square[1]), zone = [];
        const append = (x, y) => { if(x >= 0 && x < 8 && y >= 1 && y <= 8) zone.push('abcdefgh'[x] + y); };
        for(const df of [-1, 0, 1]) for(const dr of [-1, 0, 1]) if(df || dr) append(f + df, r + dr);
        for(const df of [-2, -1, 0, 1, 2]) append(f + df, r + (opponent === 'w' ? 2 : -2));
        const rows = zone.map(square => ({ square, occupant: facts.pieces.find(piece => piece.square === square) || null,
            attackers: controllers(c, square).filter(piece => piece.type !== 'k'),
            defenders: controllers(opponent, square).filter(piece => piece.type !== 'k') })).filter(row => row.attackers.length);
        return { value: rows.reduce((sum, row) => sum + row.attackers.length, 0), king, zone, rows,
            unguarded: rows.filter(row => !row.defenders.length).map(row => row.square),
            units: [...new Map(rows.flatMap(row => row.attackers).map(piece => [piece.id, piece])).values()] };
    };
    const advancedControl = c => {
        const enemyPawns = pawns(other(c)), rows = [];
        let value = 0;
        for(let f = 1; f <= 6; f++) for(let rr = 4; rr <= 6; rr++) {
            const adjacentEnemyPawns = enemyPawns.filter(piece => Math.abs(file(piece.square) - f) === 1);
            if(adjacentEnemyPawns.some(piece => rank(piece.square, c) > rr)) continue;
            const square = 'abcdefgh'[f] + (c === 'w' ? rr + 1 : 8 - rr);
            const occupant = facts.pieces.find(piece => piece.square === square) || null;
            if(occupant && (occupant.color !== c || occupant.type === 'p')) continue;
            const attackers = controllers(c, square), defenders = controllers(other(c), square);
            if(!attackers.length || attackers.length + (occupant ? 1 : 0) < defenders.length) continue;
            const weight = 1 + (attackers.some(piece => piece.type === 'p') ? 1 : 0) + (rr >= 5 ? 1 : 0);
            rows.push({ square, occupant, attackers, defenders, adjacentEnemyPawns, weight });
            value += weight;
            if(value >= 14) return { value, rows, enemyPawns, scanStopped: true };
        }
        return { value, rows, enemyPawns, scanStopped: false };
    };
    const colors = Object.fromEntries(['w', 'b'].map(c => [c, {
        pawnStructure: pawnScore(c), pawnPressure: pressure(c), defensiveDuties: duties(c),
        kingZonePressure: kingZone(c), advancedControl: advancedControl(c),
        developedMinors: pieces(c).filter(piece => ['n', 'b'].includes(piece.type) && rank(piece.square, c) > 0),
        centralControls: pieces(c).flatMap(piece => piece.controls.filter(square => ['d4', 'e4', 'd5', 'e5'].includes(square)).map(square => ({ piece, square })))
    }]));
    const ours = colors[color], theirs = colors[other(color)];
    const material950 = material(color, 950) - material(other(color), 950), material900 = material(color) - material(other(color));
    const standardMaterial = facts.material[color].points - facts.material[other(color)].points;
    const ourKingAttacked = pieces(color).find(piece => piece.type === 'k').attackers.length > 0;
    const zone = ours.kingZonePressure, enemyZone = theirs.kingZonePressure;
    const motifs = {
        '2a78a7eca416712b': !ourKingAttacked && standardMaterial >= -1 && ours.advancedControl.value >= 3
            && ours.advancedControl.value - theirs.advancedControl.value >= 2,
        f815717572588e18: material950 >= -150 && round(ours.pawnStructure.value - theirs.pawnStructure.value) >= 1.5,
        d7f4da2534e3d415: !ourKingAttacked && standardMaterial >= -3 && zone.units.length >= 2
            && ((zone.unguarded.length >= 1 && zone.unguarded.length > enemyZone.unguarded.length && zone.value > enemyZone.value)
                || (zone.value >= 4 && zone.value - enemyZone.value >= 4 && zone.unguarded.length >= enemyZone.unguarded.length)),
        c0b4f5060c344764: material900 >= -150 && ours.pawnPressure.value - theirs.pawnPressure.value >= 2,
        fb1bd91c8d7fde86: standardMaterial >= -1 && theirs.defensiveDuties.value >= 2 && theirs.defensiveDuties.value - ours.defensiveDuties.value >= 2
    };
    return { frameId: frame.id, color, colors, motifs, standardMaterial,
        semantics: 'Exact counts and geometry; BinProp scores/thresholds are heuristics, not proof of forced duty, safety, legality out of turn or engine causality.' };
}

export function compareStrategy({ frames, positivePaths, negativePaths, color, maxFacts = 2 }) {
    if(!Array.isArray(frames) || new Set(frames.map(frame => frame.id)).size !== frames.length
        || ![positivePaths, negativePaths].every(paths => Array.isArray(paths) && paths.length && paths.length <= 4)
        || !Number.isSafeInteger(maxFacts) || maxFacts < 1 || maxFacts > 3) throw new Error('Invalid bounded strategy comparison.');
    const at = id => { const frame = frames.find(frame => frame.id === id); if(!frame) throw new Error(`Unknown strategy frame ${id}.`); return frame; };
    const allPaths = [...positivePaths, ...negativePaths];
    const lengths = allPaths.map(path => path.length);
    if(lengths.some(length => length < 2) || new Set(lengths).size !== 1) throw new Error('Compare complete equal-ply strategy paths.');
    const root = at(allPaths[0][0]);
    const samples = paths => {
        const replayedSamples = paths.map(path => {
            if(path[0] !== root.id || new Set(path).size !== path.length) throw new Error('Strategy paths must share one root without cycles.');
            const graph = new PositionGraph(root.fen);
            graph.root = { ...root }; graph.frames.set(root.id, graph.root);
            for(let i = 1; i < path.length; i++) {
                const frame = at(path[i]);
                if(frame.parentId !== path[i - 1] || !frame.move) throw new Error('Disconnected strategy path.');
                const replayed = graph.advance(i === 1 ? graph.root : graph.frames.get(path[i - 1]), frame.move.uci, frame.id, 'strategy-check');
                if(replayed.fen !== frame.fen || JSON.stringify(replayed.pieces) !== JSON.stringify(frame.pieces)
                    || JSON.stringify(replayed.move) !== JSON.stringify(frame.move)) throw new Error('Strategy line disagrees with legal replay or identities.');
            }
            const leaf = at(path.at(-1));
            return { path: path.slice(1).map(id => ({ frameId: id, ...at(id).move })),
                profile: strategicProfile(leaf, color) };
        });
        const unique = new Map();
        for(const sample of replayedSamples) {
            const key = sample.path.map(move => move.uci).join(' ');
            if(!unique.has(key)) unique.set(key, sample);
        }
        return [...unique.values()];
    };
    const positive = samples(positivePaths), negative = samples(negativePaths);
    const ranked = strategyMotifs.map(motif => ({ ...motif,
        positiveTrue: positive.filter(sample => sample.profile.motifs[motif.id]).length,
        negativeFalse: negative.filter(sample => !sample.profile.motifs[motif.id]).length
    })).filter(item => item.positiveTrue === positive.length && item.negativeFalse === negative.length)
        .sort((a, b) => b.delta - a.delta);
    const result = freeze({ schema: 'pena-v2-strategy/1', color, horizon: lengths[0] - 1,
        positive, negative, selected: ranked.slice(0, maxFacts), usedFallback: false,
        sampling: { positiveSupplied: positivePaths.length, negativeSupplied: negativePaths.length,
            positiveUnique: positive.length, negativeUnique: negative.length },
        semantics: 'Only these conditional sampled endpoints are compared. TRUE/FALSE is a threshold result, never a zero count. A heuristic correlation is not why an engine prefers a move.' });
    comparisons.add(result); return result;
}

export function renderStrategy(comparison) {
    if(!comparisons.has(comparison)) throw new Error('Use an authoritative computed strategy comparison.');
    const describe = (sample, group) => {
        const profile = sample.profile, ours = profile.colors[comparison.color], theirs = profile.colors[other(comparison.color)];
        const show = pieces => pieces.map(name).join(', ') || 'none';
        const duties = data => data.rows.map(row => `${name(row.piece)} ${row.kind === 'geometric-guard' ? 'geometrically guards attacked' : 'stands immediately in front of passed'} ${name(row.target)}`).join('; ') || 'none';
        const pawns = data => data.rows.filter(row => row.passed || row.isolated).map(row => `${name(row.piece)}: ${[row.passed ? 'passed' : '', row.isolated ? 'isolated' : ''].filter(Boolean).join(', ')}`).join('; ') || 'no passed/isolated pawns';
        return `${group} sampled line ${sample.path.map(move => `${side(move.color)} ${move.san}`).join(', ')} -> [${profile.frameId}]: `
            + `${side(comparison.color)} developed minors ${ours.developedMinors.length} (${show(ours.developedMinors)}); opponent ${theirs.developedMinors.length} (${show(theirs.developedMinors)}). `
            + `Central geometric controls ${ours.centralControls.length} versus ${theirs.centralControls.length}. `
            + comparison.selected.map(motif => {
                const a = ours[motif.metric], b = theirs[motif.metric];
                if(motif.metric === 'kingZonePressure') return `Non-king geometric king-zone control relations ${a.value} versus ${b.value}; distinct controlling units ${a.units.length}/${b.units.length}; targets with zero NON-KING opposing controllers ${a.unguarded.length}/${b.unguarded.length}. Own witnesses: ${controlWitnesses(a)}. Opponent witnesses: ${controlWitnesses(b)}. King guards are excluded; not safe squares, legal access or a mating threat.`;
                if(motif.metric === 'advancedControl') return `Advanced pawn-file-gap weighted subtotal ${a.value} versus ${b.value}; threshold-stopped scans ${a.scanStopped}/${b.scanStopped}. Own witnesses: ${controlWitnesses(a)}. Opponent witnesses: ${controlWitnesses(b)}. Current pawn files only, not permanent holes, safe outposts, exhaustive counts or engine evaluations.`;
                if(motif.metric === 'defensiveDuties') return `Geometric defensive-duty count ${a.value} versus ${b.value}. Own witnesses: ${duties(a)}. Opponent witnesses: ${duties(b)}. Not proof those defenders cannot move.`;
                if(motif.metric === 'pawnStructure') return `Pawn-structure heuristic ${a.value} versus ${b.value}; own ${pawns(a)}; opponent ${pawns(b)}. Doubled extra pawns ${a.doubledExtraPawns}/${b.doubledExtraPawns}, pawn islands ${a.islands}/${b.islands}. Not an engine evaluation.`;
                return `Weak-pawn-pressure heuristic ${a.value} versus ${b.value}; own targets ${a.rows.map(row => name(row.piece)).join(', ') || 'none'}, pawn-harassed units ${show(a.harassed)}; opponent targets ${b.rows.map(row => name(row.piece)).join(', ') || 'none'}, pawn-harassed units ${show(b.harassed)}. Geometric pressure is not a winning capture.`;
            }).join(' ');
    };
    return [comparison.semantics,
        ...comparison.selected.map(motif => `BinProp motif: ${motif.name}; threshold holds in ${motif.positiveTrue}/${comparison.positive.length} preferred-line samples, fails in ${motif.negativeFalse}/${comparison.negative.length} alternative samples.`),
        ...comparison.positive.map(sample => describe(sample, 'Preferred')),
        ...comparison.negative.map(sample => describe(sample, 'Alternative'))].join('\n');
}

function sampledCards(comparison) {
    const color = comparison.color, opponent = other(color), cards = [];
    const extent = values => ({ min: Math.min(...values), max: Math.max(...values) });
    const show = range => range.min === range.max ? `${range.min}` : `${range.min} to ${range.max}`;
    const metrics = {
        pawnStructure: { kind: 'pawn-structure', label: 'pawn-structure heuristic', limit: 'Heuristic scores are not engine evaluations or a guaranteed advantage.' },
        pawnPressure: { kind: 'pawn-pressure', label: 'weak-pawn-pressure heuristic', limit: 'Geometric pressure does not establish a safe capture; heuristic scores are not engine evaluations.' },
        defensiveDuties: { kind: 'defensive-duties', label: 'geometric guard/blockader count', limit: 'These are geometric assignments, not proof that those pieces must stay put.' },
        kingZonePressure: { kind: 'king-zone-pressure', label: 'non-king geometric king-zone control relations', limit: 'Both attacking and defending kings are excluded from these control counts. These are not safe squares, legal access or a mating threat.' },
        advancedControl: { kind: 'advanced-control', label: 'advanced pawn-file-gap weighted subtotal', limit: 'The source-ordered scan runs to completion unless its subtotal reaches at least 14. Current pawn files only, not permanent holes, safe outposts, exhaustive counts or engine evaluations.' },
        developedMinors: { kind: 'development', label: 'minor pieces off the home rank', limit: 'This describes endpoint development, not a forced result or a tempo advantage.' }
    };
    for(const metric of [...comparison.selected.map(motif => motif.metric), 'developedMinors']) {
        const { kind, label, limit } = metrics[metric];
        const sampleData = sample => ({ frameId: sample.profile.frameId, path: sample.path.map(move => move.frameId),
            own: sample.profile.colors[color][metric], opponent: sample.profile.colors[opponent][metric] });
        const samples = { preferred: comparison.positive.map(sampleData), alternative: comparison.negative.map(sampleData) };
        const number = value => metric === 'developedMinors' ? value.length : value.value;
        const ranges = rows => ({ own: extent(rows.map(row => number(row.own))), opponent: extent(rows.map(row => number(row.opponent))),
            balance: extent(rows.map(row => round(number(row.own) - number(row.opponent)))) });
        const values = { preferred: ranges(samples.preferred), alternative: ranges(samples.alternative) };
        const distinguishing = ['own', 'opponent', 'balance'].filter(key => values.preferred[key].max < values.alternative[key].min
            || values.alternative[key].max < values.preferred[key].min);
        if(!distinguishing.length) continue;
        const geometric = ['kingZonePressure', 'advancedControl'].includes(metric);
        const common = rows => {
            const relations = sample => sample.own.rows.flatMap(row => row.attackers.map(piece => ({ square: row.square, piece })));
            const key = relation => [relation.square, relation.piece.id, relation.piece.color, relation.piece.type, relation.piece.square].join(':');
            const sets = rows.slice(1).map(sample => new Set(relations(sample).map(key)));
            return relations(rows[0]).filter(relation => sets.every(set => set.has(key(relation)))).slice(0, 2);
        };
        const sharedControls = geometric ? { preferred: common(samples.preferred), alternative: common(samples.alternative) } : null;
        const examples = rows => rows.map(row => `${name(row.piece)} geometrically controls ${row.square}`).join('; ') || 'none common to every supplied endpoint';
        cards.push({ schema: 'pena-v2-strategy-range-card/1', id: `strategy-${kind}`, kind, metric, samples, values, distinguishing,
            ...(geometric ? { sharedControls } : {}),
            text: `Across ${samples.preferred.length} preferred and ${samples.alternative.length} alternative sampled ${comparison.horizon}-ply continuations, `
                + `${side(color)} ${label}: ${show(values.preferred.own)} versus ${show(values.alternative.own)}; `
                + `${side(opponent)}: ${show(values.preferred.opponent)} versus ${show(values.alternative.opponent)}. `
                + `${side(color)} minus ${side(opponent)}: ${show(values.preferred.balance)} versus ${show(values.alternative.balance)}. `
                + `These are endpoint ranges, preferred versus alternative. ${limit}`
                + (geometric ? ` Shared preferred-endpoint examples: ${examples(sharedControls.preferred)}. Shared alternative-endpoint examples: ${examples(sharedControls.alternative)}.` : ''),
            scope: 'Only all supplied unique legally replayed sampled continuations; not forced, safe, independent games, or proof of engine causality.' });
        if(cards.length === 2) break;
    }
    return freeze(cards);
}

export function strategyCards(comparison) {
    if(!comparisons.has(comparison)) throw new Error('Use an authoritative computed strategy comparison.');
    if(comparison.positive.length > 1 || comparison.negative.length > 1) return sampledCards(comparison);
    const preferred = comparison.positive[0], alternative = comparison.negative[0], color = comparison.color, opponent = other(color);
    const first = preferred.profile.colors, second = alternative.profile.colors;
    const path = sample => sample.path.map(move => `${side(move.color)} ${move.san}`).join(', ');
    const context = `In the sampled lines ${path(preferred)} versus ${path(alternative)}`;
    const references = sample => ({ frameId: sample.profile.frameId, path: sample.path.map(move => move.frameId) });
    const cards = [];
    const add = (kind, text, values) => cards.push(freeze({ id: `strategy-${kind}`, kind, text,
        preferred: references(preferred), alternative: references(alternative), values,
        scope: 'Only this pair of legally replayed sampled endpoints; not forced, safe, or proof of engine causality.' }));
    for(const motif of comparison.selected) {
        const a = first[color][motif.metric], b = first[opponent][motif.metric], c = second[color][motif.metric], d = second[opponent][motif.metric];
        if(motif.metric === 'pawnStructure') {
            const doubled = data => {
                const pieces = data.rows.map(row => row.piece);
                return pieces.filter(piece => pieces.filter(other => other.square[0] === piece.square[0]).length > 1).map(name);
            };
            const values = { preferred: { ownExtraDoubled: a.doubledExtraPawns, opponentExtraDoubled: b.doubledExtraPawns, opponentPawns: doubled(b) },
                alternative: { ownExtraDoubled: c.doubledExtraPawns, opponentExtraDoubled: d.doubledExtraPawns, opponentPawns: doubled(d) } };
            if(a.doubledExtraPawns !== c.doubledExtraPawns || b.doubledExtraPawns !== d.doubledExtraPawns)
                add('pawn-structure', `${context}, the extra doubled-pawn counts are ${side(color)} ${a.doubledExtraPawns}, ${side(opponent)} ${b.doubledExtraPawns} in the first endpoint, versus ${side(color)} ${c.doubledExtraPawns}, ${side(opponent)} ${d.doubledExtraPawns} in the second. `
                    + `The first endpoint's ${side(opponent)} same-file pawns are ${values.preferred.opponentPawns.join(', ') || 'none'}. This is a pawn-structure difference, not a guaranteed advantage.`, values);
        } else if(motif.metric === 'pawnPressure') {
            const targets = data => data.rows.map(row => ({ target: row.piece, attackers: row.attackers, defenders: row.defenders }));
            const preferredTargets = targets(a), alternativeTargets = targets(c);
            add('pawn-pressure', `${context}, ${side(color)}'s weak-pawn-pressure heuristic is ${a.value} in the first endpoint versus ${c.value} in the second (not engine evaluation). `
                + preferredTargets.map(row => `${row.attackers.map(name).join(', ')} geometrically ${row.attackers.length === 1 ? 'attacks' : 'attack'} ${name(row.target)}.`).join(' ')
                + ' This does not establish a safe capture.', { preferredScore: a.value, alternativeScore: c.value, preferredTargets, alternativeTargets });
        } else if(['kingZonePressure', 'advancedControl'].includes(motif.metric)) {
            const kingZone = motif.metric === 'kingZonePressure';
            add(kingZone ? 'king-zone-pressure' : 'advanced-control', `${context}, ${side(color)}'s ${kingZone ? 'non-king geometric king-zone control relations' : 'advanced pawn-file-gap weighted subtotal'} are ${a.value} in the first endpoint versus ${c.value} in the second; `
                + `${side(opponent)}'s corresponding values are ${b.value} and ${d.value}. First-endpoint witnesses: ${controlWitnesses(a)}. Second-endpoint witnesses: ${controlWitnesses(c)}. `
                + (kingZone ? 'Both attacking and defending kings are excluded; this does not prove safe squares, legal access or a mating threat.'
                    : 'The source-ordered scan runs to completion unless its subtotal reaches at least 14; current pawn files do not prove permanent holes or safe outposts. This is not an exhaustive count or engine evaluation.'),
            { preferredOwn: a, preferredOpponent: b, alternativeOwn: c, alternativeOpponent: d });
        } else {
            const guards = data => [...new Map(data.rows.map(row => [row.piece.id, row.piece])).values()];
            add('defensive-duties', `${context}, ${side(opponent)}'s geometric guard/blockader count is ${b.value} in the first endpoint (${guards(b).map(name).join(', ') || 'none'}) versus ${d.value} in the second (${guards(d).map(name).join(', ') || 'none'}); `
                + `${side(color)}'s corresponding counts are ${a.value} and ${c.value}. These are geometric assignments, not proof that those pieces must stay put.`,
                { preferredOwn: a.value, preferredOpponent: b.value, alternativeOwn: c.value, alternativeOpponent: d.value,
                    preferredGuards: guards(b), alternativeGuards: guards(d) });
        }
    }
    if(cards.length < 2 && (first[color].developedMinors.length !== second[color].developedMinors.length
        || first[opponent].developedMinors.length !== second[opponent].developedMinors.length)) {
        const a = first[color].developedMinors, b = second[color].developedMinors;
        add('development', `${context}, ${side(color)} has ${a.length} minor pieces off the home rank in the first endpoint (${a.map(name).join(', ') || 'none'}) and ${b.length} in the second (${b.map(name).join(', ') || 'none'}). `
            + `${side(opponent)}'s corresponding counts are ${first[opponent].developedMinors.length} and ${second[opponent].developedMinors.length}. This describes development, not a forced result.`,
            { preferredOwn: a, alternativeOwn: b, preferredOpponent: first[opponent].developedMinors, alternativeOpponent: second[opponent].developedMinors });
    }
    return freeze(cards.slice(0, 2));
}

export function coachingStrategy(record, { enabled = false } = {}) {
    if(!enabled) return [];
    if(record?.schema !== 'pena-v2-coaching/1') throw new Error('Strategy needs a verified coaching record.');
    const best = record.branches.find(branch => branch.recommended);
    if(!best) throw new Error('Missing preferred branch.');
    const paths = branch => branch.lines.filter(line => ['searched-reply', 'asked-opponent-idea'].includes(line.role))
        .map(line => [record.rootFrameId, branch.frameId, ...line.frameIds]);
    return record.branches.filter(branch => branch !== best).flatMap(branch => {
        const positive = paths(best), negative = paths(branch);
        if(!positive.length || !negative.length) return [];
        const horizon = Math.min(...[...positive, ...negative].map(path => path.length));
        const unique = paths => [...new Map(paths.map(path => [path.slice(0, horizon).join('/'), path.slice(0, horizon)])).values()];
        const comparison = compareStrategy({ frames: record.frames, positivePaths: unique(positive), negativePaths: unique(negative), color: record.playerColor });
        return [{ preferredMove: best.move, alternativeMove: branch.move, comparison, cards: strategyCards(comparison), text: renderStrategy(comparison) }];
    });
}
