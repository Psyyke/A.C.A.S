import { boardAt } from './positions.js';
import { parseQuestionMove, parseQuestionMoves } from './questions.js';
import { pastTopic } from './timeline.js';
import { derivePcfRuleFrame } from './pcf-evidence.js';

const sourceKinds = new Set(['E', 'Q', 'H', 'W', 'V', 'Z', 'REPLY', 'Y']);
const currentKinds = new Set(['F', 'I', 'R', 'G', 'L', 'U', 'C', 'P', 'N', 'B', 'BINS', 'T', 'D', 'BCHANGE']);
const spatialCues = {
    A: /\b(?:safe|safety|mobility|active|activity|king|escape)\b/i,
    J: /\b(?:pawn|pawns|structure|passed|isolated|doubled|backward)\b/i,
    S: /\b(?:square|control|controls|controlled|cover|covers|covered|attacks|attacked)\b/i,
    X: /\b(?:ray|line|file|rank|diagonal|block|blocks|blocker|x[ -]?ray|pin|pinned|skewer)\b/i
};
const comparisonCue = /\b(?:compar\w*|versus|vs\.?|instead|alternative|differ\w*|better|worse|why|change\w*|prefer\w*|strategy|strategic|plan|positional|binprop)\b/i;

function compactHistoryRows(currentRows, historyRows, kind, keyIndex) {
    const index = rows => {
        const byId = new Map();
        for(const row of rows) {
            const id = row.values[keyIndex];
            if(row.kind !== kind || !id || byId.has(id)) throw new Error('Invalid key in historical comparison.');
            byId.set(id, row);
        }
        return byId;
    };
    const current = index(currentRows), history = index(historyRows);
    const absent = [...current.keys()].filter(id => !history.has(id));
    const changed = historyRows.filter(row => {
        const baseline = current.get(row.values[keyIndex]);
        return !baseline || row.values.slice(1).some((value, i) => value !== baseline.values[i + 1]);
    });
    return { absent, changed };
}

export const compactHistoryRelations = (currentRows, historyRows) => compactHistoryRows(currentRows, historyRows, 'R', 3);
export const compactHistorySquares = (currentRows, historyRows, kind) => {
    if(!['G', 'P'].includes(kind)) throw new Error('Unsupported square-indexed history group.');
    return compactHistoryRows(currentRows, historyRows, kind, 1);
};

function assertMatchingPosition(rows, fen) {
    if(typeof fen !== 'string') throw new Error('Question-focused evidence requires the original position.');
    const board = boardAt(fen), fields = board.fen().split(' ');
    const status = rows.find(row => row.kind === 'F' && row.values[0] === 'C');
    if(!status || fields.length !== 6 || [4, 6, 7, 9, 10].some((index, i) =>
        status.values[index] !== fields[[1, 2, 3, 4, 5][i]]))
        throw new Error('Question-focused position does not match the selected current status.');
    const expected = board.board().flat().filter(Boolean)
        .map(piece => `${piece.square}:${piece.color}${piece.type.toUpperCase()}`).sort();
    const actual = rows.filter(row => row.kind === 'R' && row.values[0] === 'C')
        .map(row => `${row.values[1]}:${row.values[2]}`).sort();
    if(JSON.stringify(expected) !== JSON.stringify(actual))
        throw new Error('Question-focused position does not match the selected current pieces.');
}

/**
 * Experimental selection from already validated records. It never uses target answers.
 * The omission report describes selection changes, not semantic answer sufficiency.
 * Do not use this selector for lossless corpus conversion: compact-lossless
 * renders the entire original selection without question-driven omissions.
 */
export function selectQuestionEvidence(selection, { question, fen, priorMessages = [] } = {}) {
    if(selection?.schema !== 'pena-pcf-selection/3' || !Array.isArray(selection.rows)
        || typeof question !== 'string' || !question.trim() || !Array.isArray(priorMessages)
        || priorMessages.some(message => !['system', 'user', 'assistant'].includes(message?.role) || typeof message.content !== 'string'))
        throw new Error('Invalid question-focused evidence input.');
    const rows = selection.rows;
    assertMatchingPosition(rows, fen);
    const previousQuestions = priorMessages.filter(message => message.role === 'user')
        .map(message => message.content.split('\n\nPlayer question: ').at(-1));
    const context = [...previousQuestions, question].join('\n');
    const parsed = parseQuestionMoves(question, fen);
    const currentRequest = parseQuestionMove(question, fen);
    const unresolved = currentRequest.status === 'ambiguous' || currentRequest.status === 'illegal' || Boolean(currentRequest.opponent);
    const asked = new Set(parsed.filter(item => !item.opponent)
        .map(item => item.move.from + item.move.to + (item.move.promotion || '')));
    const frames = new Map(rows.filter(row => row.kind === 'F').map(row => [row.values[0], row.values]));
    const conditional = new Set();
    for(const [id, frame] of frames) {
        if(frame[1] === 'conditional' && (asked.has(frame[3]) || previousQuestions.some(text => text.trim()))) conditional.add(id);
    }
    const missingMoves = [...asked].filter(move => ![...conditional].some(id => frames.get(id)[3] === move));
    const latestMoves = parsed.filter(item => !item.opponent)
        .map(item => item.move.from + item.move.to + (item.move.promotion || ''));
    const derivedMoves = !unresolved && !pastTopic(question) && currentRequest.status === 'move'
        && !currentRequest.opponent && latestMoves.length === 1 && missingMoves.includes(latestMoves[0]) ? latestMoves : [];
    const status = rows.find(row => row.kind === 'F' && row.values[0] === 'C');
    const derived = derivedMoves.flatMap((move, index) =>
        derivePcfRuleFrame(fen, rows, move, `VQ${index + 1}`, status.values[5]));
    for(const id of [...conditional]) {
        let parent = frames.get(id)?.[2];
        while(parent && parent !== 'C' && frames.has(parent)) {
            conditional.add(parent);
            parent = frames.get(parent)[2];
        }
    }
    const priorFrame = rows.find(row => row.kind === 'T' && row.values[0] === 'C')?.values[1];
    const historical = pastTopic(context);
    const comparison = comparisonCue.test(context);
    const kept = [], omitted = {};
    for(const row of rows) {
        const [frame] = row.values;
        let include = false;
        if(unresolved) include = true;
        else if(row.kind === 'O') include = true;
        else if(sourceKinds.has(row.kind)) include = true;
        else if(['M', 'BINLINE', 'BINCOMP'].includes(row.kind)) include = comparison;
        else if(frame === 'C') include = currentKinds.has(row.kind) || Boolean(spatialCues[row.kind]?.test(context));
        else if(frame.startsWith('H')) include = historical || conditional.has(frame)
            || frame === priorFrame && ['F', 'R'].includes(row.kind);
        else if(frame.startsWith('V')) include = conditional.has(frame);
        if(include) kept.push(row);
        else omitted[row.kind] = (omitted[row.kind] || 0) + 1;
    }
    for(const color of ['w', 'b']) {
        if(!kept.some(row => row.kind === 'BINS' && row.values[0] === 'C' && row.values[1] === color))
            throw new Error(`Missing ${color} current BinProp perspective.`);
    }
    if(kept.filter(row => row.kind === 'R' && row.values[0] === 'C').length
        !== rows.filter(row => row.kind === 'R' && row.values[0] === 'C').length)
        throw new Error('Question-focused evidence lost a current piece.');
    return { rows: kept, omitted, askedMoves: [...asked], missingMoves, derivedMoves, derived, unresolved, historical, comparison };
}
