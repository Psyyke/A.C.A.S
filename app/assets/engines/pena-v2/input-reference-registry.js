import { Chess } from '../libraries/chessjs/chess.js';

const unique = list => [...new Set(list)].sort();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
const types = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

export function inputFactSelector(kind, side, text) {
    return { kind, side: side || null, squares: unique(text.match(/[a-h][1-8]/g) || []),
        files: unique([...text.matchAll(/\b([a-h])-file\b/g)].map(match => match[1])),
        wing: kind === 'pawn majority' ? text.match(/\b(kingside|queenside)\b/)?.[1] || null : null,
        moveSan: kind === 'pawn break' ? text.match(/\bpawn break (?:\.\.\.)?([a-h]x?[a-h]?[1-8][+#]?)/)?.[1] || null : null };
}

export function inputFactKey(fact) {
    const refs = fact.references || {};
    return JSON.stringify(canonical({ kind: fact.kind, side: fact.side || null,
        squares: unique(refs.squares || []),
        regions: (refs.regions || []).map(region => ({ label: region.label, squares: unique(region.squares || []), anchor: region.anchor }))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        relations: (refs.relations || []).map(relation => [...relation]).sort(),
        moves: (refs.moves || []).map(move => [...move]).sort() }));
}

const sameSan = (left, right) => left.replace(/[+#]/g, '') === right.replace(/[+#]/g, '');
function checkedPv(fen, pv) {
    const board = new Chess(fen);
    for(const uci of pv) {
        if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
            || !board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })) return false;
    }
    return true;
}

function matchesDisplay(analysis, display, turn) {
    if(display.kind === 'cp-rounded-white') return Number.isSafeInteger(analysis.score?.cp)
        && Number(((turn === 'w' ? 1 : -1) * analysis.score.cp / 100).toFixed(1)) === display.pawns;
    if(display.kind === 'mate') return Number.isSafeInteger(analysis.score?.mate)
        && Math.abs(analysis.score.mate) === display.distance
        && (analysis.score.mate > 0 ? turn : turn === 'w' ? 'b' : 'w') === display.winner;
    return false;
}

function legalSan(fen, san) {
    try { return Boolean(new Chess(fen).move(san, { sloppy: true })); } catch { return false; }
}

export function recoverInputAskedBindings({ fen, definitions, candidates }) {
    const board = new Chess(fen), legal = board.moves({ verbose: true });
    const bindings = [], unresolved = [];
    for(const { id, text } of definitions.filter(item => /^A\d+$/.test(item.id))) {
        const illegal = text.match(/^asked move(?: \([^)]*\))?: (\S+) is not a legal move here/);
        if(illegal) {
            if(legalSan(fen, illegal[1])) unresolved.push({ alias: id, reason: 'original-illegal-annotation-conflicts-with-board-rules' });
            else bindings.push({ alias: id, display: { kind: 'illegal' }, analysis: { san: illegal[1] } });
            continue;
        }
        const found = text.match(/^asked move(?: \([^)]*\))?: (\S+) is rated (Best Move|Good Move|Forced Move|Excellent|Neutral|Weak Move|Inaccuracy|Mistake|Blunder|Catastrophic)\b/);
        if(!found) continue;
        const move = legal.find(move => sameSan(move.san, found[1]));
        if(!move) { unresolved.push({ alias: id, reason: 'original-rated-move-is-not-legal-on-recorded-board' }); continue; }
        const uci = move.from + move.to + (move.promotion || '');
        const mate = text.match(/\b(White|Black) mates in (\d+)\b/);
        const cp = text.match(/(?:\), |, )([+-]?\d+\.\d)(?=, )/);
        const display = mate ? { kind: 'mate', winner: mate[1] === 'White' ? 'w' : 'b', distance: Number(mate[2]) }
            : cp ? { kind: 'cp-rounded-white', pawns: Number(cp[1]) } : null;
        const match = display && candidates.find(candidate => (candidate.uci || candidate.move || candidate.pv?.[0]) === uci
            && (!candidate.label || candidate.label === found[2]) && matchesDisplay(candidate, display, board.turn())
            && candidate.pv?.[0] === uci && checkedPv(fen, candidate.pv.slice(0, 6)));
        if(!match) { unresolved.push({ alias: id, uci, reason: 'original-grade-has-no-matching-recorded-numeric-analysis' }); continue; }
        const pv = match.pv.slice(0, 6), replay = new Chess(fen);
        const sans = pv.map(move => replay.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san);
        const shown = text.match(/, likely line (.*?)(?:, (?:White|Black) (?:wins|gives up)|, ending in|\.$|$)/)?.[1];
        if(shown) {
            const shownSans = shown.replace(/\d+\.(?:\.\.)?/g, '').trim().split(/\s+/);
            if(shownSans.length > sans.length || shownSans.some((san, index) => !sameSan(san, sans[index]))) {
                unresolved.push({ alias: id, uci, reason: 'original-grade-PV-does-not-match-recorded-legal-analysis' }); continue;
            }
        }
        bindings.push({ alias: id, display, analysis: { uci, pv, label: found[2], score: structuredClone(match.score),
            ...(match.reason ? { reason: match.reason } : {}), ...(match.bestUci ? { bestUci: match.bestUci } : {}) } });
    }
    return { bindings, unresolved };
}

export function applyInputAskedBindings({ fen, asked, registry }) {
    if(!registry) return asked.slice(-3);
    const board = new Chess(fen), aliases = [...(registry.askedBindings || []), ...(registry.unresolvedAsked || [])].map(binding => binding.alias);
    const reserved = new Set(aliases);
    if(reserved.size !== aliases.length || (registry.askedBindings || []).length > 3) throw new Error('Invalid captured A aliases.');
    const captured = (registry.askedBindings || []).map(binding => {
        const analysis = binding.analysis;
        if(binding.display.kind === 'illegal') {
            if(!/^A[1-9]\d*$/.test(binding.alias) || typeof analysis?.san !== 'string' || legalSan(fen, analysis.san))
                throw new Error(`Captured illegal input analysis ${binding.alias} conflicts with board rules.`);
            return { san: analysis.san, inputAlias: binding.alias };
        }
        if(!/^A[1-9]\d*$/.test(binding.alias) || !analysis?.pv?.length || analysis.pv[0] !== analysis.uci
            || !matchesDisplay(analysis, binding.display, board.turn()) || !checkedPv(fen, analysis.pv))
            throw new Error(`Captured input analysis ${binding.alias} failed board/score/PV validation.`);
        return { ...structuredClone(analysis), inputAlias: binding.alias };
    });
    const extra = asked.filter(item => !captured.some(known => item.uci ? known.uci === item.uci : known.san === item.san)).slice(-(3 - captured.length));
    if(captured.length === 3) return captured;
    let next = 1;
    return [...captured, ...extra.map(item => {
        while(reserved.has(`A${next}`)) next++;
        const inputAlias = `A${next++}`;
        reserved.add(inputAlias);
        return { ...item, inputAlias };
    })];
}

function validateEntities(board, entities) {
    return entities.every(entity => {
        const piece = board.get(entity.square);
        return piece?.type === entity.type && piece.color === entity.color;
    });
}

/** Conversion reads every ORIGINAL INPUT F definition, never an assistant target. No prose is retained. */
export function recoverInputReferenceRegistry({ fen, playerColor, sourceInputSha256, definitions, facts, askedCandidates = [] }) {
    if(!/^[a-f0-9]{64}$/.test(sourceInputSha256 || '')) throw new Error('Input registry needs its immutable original-input identity.');
    const board = new Chess(fen), pool = facts.filter(fact => /^F\d+$/.test(fact.id));
    const bySelector = new Map();
    for(const fact of pool) {
        const key = JSON.stringify(inputFactSelector(fact.kind, fact.side, fact.text));
        if(!bySelector.has(key)) bySelector.set(key, []);
        bySelector.get(key).push(fact);
    }
    const bindings = [], unresolved = [];
    for(const { id, text } of definitions.filter(item => /^F\d+$/.test(item.id))) {
        const parsed = text.match(/^([^:]+):\s*(.*)$/);
        if(!parsed) { unresolved.push({ alias: id, reason: 'unsupported-original-input-definition' }); continue; }
        const owner = parsed[1].match(/ \((you|opponent)\)$/)?.[1];
        const kind = parsed[1].replace(/ \((?:you|opponent)\)$/, '');
        const side = owner === 'you' ? playerColor : owner === 'opponent' ? playerColor === 'w' ? 'b' : 'w' : null;
        const selector = inputFactSelector(kind, side, parsed[2]);
        const entities = [...parsed[2].matchAll(/\b(White|Black) (pawn|knight|bishop|rook|queen|king) (?:on )?([a-h][1-8])\b/g)]
            .map(match => ({ color: match[1] === 'White' ? 'w' : 'b', type: types[match[2]], square: match[3] }));
        if(!validateEntities(board, entities)) {
            unresolved.push({ alias: id, selector, entities, reason: 'factual-piece-conflict-on-recorded-board' });
            continue;
        }
        const matches = bySelector.get(JSON.stringify(selector)) || [];
        if(matches.length !== 1) {
            unresolved.push({ alias: id, selector, entities,
                reason: matches.length ? 'ambiguous-current-board-fact' : 'no-current-validated-board-fact', candidates: matches.length });
            continue;
        }
        bindings.push({ alias: id, selector, entities, factKey: inputFactKey(matches[0]), visible: true });
    }
    const asked = recoverInputAskedBindings({ fen, definitions, candidates: askedCandidates });
    return { schema: 'pena-input-reference-registry/1', fen, source: 'immutable-original-input', sourceInputSha256,
        bindings, unresolved, askedBindings: asked.bindings, unresolvedAsked: asked.unresolved };
}

/** Registry keys resolve only against freshly recomputed facts on this exact board. */
export function applyInputReferenceRegistry(sheet, registry, { fen, playerColor, formatFactLine }) {
    if(registry?.schema !== 'pena-input-reference-registry/1' || registry.fen !== fen
        || !/^[a-f0-9]{64}$/.test(registry.sourceInputSha256 || '') || !Array.isArray(registry.bindings) || !Array.isArray(registry.unresolved))
        throw new Error('Invalid or stale input reference registry.');
    const board = new Chess(fen), pool = sheet.facts.filter(fact => /^F\d+$/.test(fact.id));
    const byKey = new Map();
    for(const fact of pool) {
        const key = inputFactKey(fact);
        if(!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(fact);
    }
    const aliases = [...registry.bindings, ...registry.unresolved].map(binding => binding.alias);
    if(aliases.some(alias => !/^F[1-9]\d*$/.test(alias)) || new Set(aliases).size !== aliases.length)
        throw new Error('Input reference aliases must be unique F IDs.');
    const assigned = new Map(), required = new Set(), usedKeys = new Set();
    for(const binding of registry.bindings) {
        const matches = byKey.get(binding.factKey) || [];
        if(matches.length !== 1 || !validateEntities(board, binding.entities || [])
            || JSON.stringify(inputFactSelector(matches[0].kind, matches[0].side, matches[0].text)) !== JSON.stringify(binding.selector)
            || usedKeys.has(binding.factKey)) throw new Error(`Input alias ${binding.alias} does not bind one validated recorded-board fact.`);
        usedKeys.add(binding.factKey);
        assigned.set(matches[0], binding.alias);
        if(binding.visible) required.add(binding.alias);
    }
    const reserved = new Set(aliases), remapped = new Map();
    let next = 1;
    for(const fact of pool) {
        let id = assigned.get(fact);
        if(!id) { while(reserved.has(`F${next}`)) next++; id = `F${next++}`; reserved.add(id); }
        remapped.set(fact, { ...fact, id });
    }
    const oldSheet = sheet.sheet;
    const facts = sheet.facts.map(fact => remapped.get(fact) || fact);
    const promptFacts = sheet.promptFacts.map(fact => remapped.get(fact) || fact);
    for(const fact of facts) if(required.has(fact.id) && !promptFacts.includes(fact)) promptFacts.push(fact);
    const packed = [sheet.header, ...promptFacts.map(fact => formatFactLine(fact, playerColor))].join('\n');
    return { ...sheet, facts, promptFacts, byId: Object.fromEntries(facts.map(fact => [fact.id, fact])), sheet: packed,
        text: packed + sheet.text.slice(oldSheet.length),
        referenceRegistryDiagnostics: { validatedBindings: registry.bindings.length, unresolved: structuredClone(registry.unresolved) } };
}
