import { Chess } from '../../libraries/chessjs/chess.js';

const gradeLanguage = /\b(?:rated|rating|centipawns?|evaluat\w*|blunder\w*|mistake\w*|inaccura\w*|catastrophic|best move|good move|excellent|weak move|mate in (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))\b|[+-]\d+\.\d+/i;
const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const uciOf = move => move.from + move.to + (move.promotion || '');

/** Post-construction audit only. Targets never participate in production notes or registry recovery. */
export function auditRequestedMoveEvidence({ snapshot, sheet, target }) {
    const requested = snapshot.unavailableRequestedMoves || [];
    if(!requested.length) return { mentions: [], definiteGradeStatements: [], unsupportedDefiniteGradeStatements: [] };
    const lines = snapshot.record.engine?.lines || [], board = new Chess(snapshot.fen), legal = board.moves({ verbose: true });
    const mentions = requested.map(uci => {
        const root = lines.findIndex(line => (line.pv?.[0] || line.move) === uci);
        const conditional = lines.some(line => line.pv?.slice(1).includes(uci));
        const inputA = (snapshot.referenceRegistry?.askedBindings || []).filter(binding => binding.analysis.uci === uci).map(binding => binding.alias);
        return { uci, san: legal.find(move => uciOf(move) === uci)?.san || null,
            support: root >= 0 ? 'recorded-root-line' : conditional ? 'conditional-PV-plus-rules' : 'rules-or-other-recorded-context',
            rootLine: root >= 0 ? `L${root + 1}` : null, recoveredOriginalA: inputA };
    });
    const statements = target.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(text => gradeLanguage.test(text));
    const definiteGradeStatements = statements.map(text => {
        const citations = [...new Set([...text.matchAll(/\[([ALMH]\d*)\]/g)].map(match => match[1]))];
        const sources = citations.filter(id => {
            const fact = sheet.byId[id];
            return fact && (/^L\d+$/.test(id) && lines[Number(id.slice(1)) - 1]?.score
                || id === 'M' && snapshot.record.last?.label
                || /^H\d+$/.test(id) && snapshot.timeline?.moves?.length
                || /^A\d+$/.test(id) && (snapshot.referenceRegistry?.askedBindings || []).some(binding => binding.alias === id && binding.display.kind !== 'illegal'));
        });
        const contextual = mentions.filter(mention => mention.rootLine && sheet.byId[mention.rootLine]);
        if(!sources.length && contextual.length === 1 && /^(?:Also|That|It)\b/i.test(text.trim())
            && text.trim().split(/\s+/).length <= 10 && target.includes(`[${contextual[0].rootLine}]`)) sources.push(contextual[0].rootLine);
        const rootSources = sources.filter(id => /^L\d+$/.test(id));
        const comparison = /\b(?:instead|than|quicker|slower|same|both|gap|difference)\b/i.test(text);
        const rootScores = (comparison && rootSources.length ? lines : rootSources.map(id => lines[Number(id.slice(1)) - 1])).map(line => line.score);
        const distances = [...text.matchAll(/\bmate in (\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)]
            .map(match => numberWords[match[1].toLowerCase()] || Number(match[1]));
        const badNumeric = distances.filter(distance => rootSources.length && !rootScores.some(score => Math.abs(score.mate) === distance));
        const cp = [...text.matchAll(/(?<![\w.])([+-]\d+\.\d+)(?!\d)/g)].map(match => Number(match[1]));
        const sign = board.turn() === 'w' ? 1 : -1;
        const badCp = cp.filter(value => rootSources.length && !rootScores.some(score => Number.isFinite(score.cp)
            && Number((sign * score.cp / 100).toFixed(1)) === value));
        const labels = [...text.matchAll(/\b(excellent|neutral|inaccurac(?:y|ies)|mistakes?|blunders?|catastrophic|good move|weak move)\b/gi)]
            .map(match => match[1].toLowerCase().replace(/mistakes$/, 'mistake').replace(/blunders$/, 'blunder').replace(/inaccuracies$/, 'inaccuracy'));
        const badLabels = labels.filter(label => !sources.some(id => !/^L/.test(id)
            && new RegExp(`\\b${label}\\b`, 'i').test(sheet.byId[id].text)));
        return { text, citations, recordedAssessmentSources: sources,
            numericSourceConflicts: [...badNumeric.map(value => ({ kind: 'mate-distance', value })), ...badCp.map(value => ({ kind: 'white-pawn-score', value }))],
            gradeLabelConflicts: badLabels,
            supportedAssessmentContext: sources.length > 0 && !badNumeric.length && !badCp.length && !badLabels.length };
    });
    return { mentions, definiteGradeStatements,
        unsupportedDefiniteGradeStatements: definiteGradeStatements.filter(statement => !statement.supportedAssessmentContext),
        limitation: 'Assessment-context/source-number check only, not a broad factuality score. Root, conditional, played-move and historical evidence remain distinct; missing A grading alone does not make an answer unsupported.' };
}

export function auditRegisteredSourceMeaning({ snapshot, sheet, target }) {
    const ids = [...new Set([...target.matchAll(/\[([FA]\d+)\]/g)].map(match => match[1]))];
    const registry = snapshot.referenceRegistry;
    const issues = [];
    for(const id of ids) {
        const binding = id[0] === 'F' ? registry?.bindings.find(binding => binding.alias === id)
            : registry?.askedBindings?.find(binding => binding.alias === id);
        if(!binding || !sheet.byId[id]) issues.push({ alias: id, reason: (id[0] === 'F' ? registry?.unresolved
            : registry?.unresolvedAsked)?.find(issue => issue.alias === id)?.reason || 'original-input-alias-is-unresolved' });
    }
    const requestedMoveAudit = auditRequestedMoveEvidence({ snapshot, sheet, target });
    return { preserved: issues.length === 0 && requestedMoveAudit.unsupportedDefiniteGradeStatements.length === 0,
        bindingIssues: issues, requestedMoveAudit,
        scope: 'Original-input F/A alias meanings bound to recomputed board facts or captured, numerically checked legal analyses; bounded requested-grade evidence audit, not arbitrary target entailment.' };
}
