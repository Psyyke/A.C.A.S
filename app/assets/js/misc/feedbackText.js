import { featureText } from './featureTranslations.js';

export const feedbackText = (key, fallback, values) => featureText('moveFeedback', key, fallback, values);

function matchesBestMove(result) {
    const best = result.bestMove || result.best?.move;
    const played = result.move || result.played?.move || result.selected?.uci;
    // Compare engine move identities, not SAN/PV display text or evaluation.
    return typeof best === 'string' && typeof played === 'string'
        && Boolean(best.trim()) && best.trim().toLowerCase() === played.trim().toLowerCase();
}

function feedbackQuality(result) {
    const matchesBest = matchesBestMove(result);
    const forced = Boolean(result.forced);
    return { matchesBest, forced, category: matchesBest && !forced ? 7 : result.category };
}

export function feedbackQualityText(result, translate = false) {
    const translations = translate && typeof TRANS_OBJ !== 'undefined' ? TRANS_OBJ?.moveFeedback : null;
    const englishLabels = [
        'Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic',
        'Good', 'Excellent', 'Best', 'Weak'
    ];
    const { category, forced } = feedbackQuality(result);
    // Speech uses grade-only translations; display labels can include "move".
    if(result.isBook) return translations?.bookSpeech || 'Book';
    if(forced) return translations?.forcedSpeech || 'Forced';
    return translations?.speechLabels?.[category] || englishLabels[category] || '';
}

export function feedbackDisplay(result) {
    const translations = typeof TRANS_OBJ !== 'undefined' ? TRANS_OBJ?.moveFeedback : null;
    const { category, forced, matchesBest } = feedbackQuality(result);
    const labels = translations?.summaryLabels || translations?.labels || [
        'was neutral', 'was an inaccuracy', 'was a mistake', 'was a blunder', 'was catastrophic',
        'was good', 'was excellent', 'was best', 'was weak'
    ];
    const label = result.isBook ? feedbackText('bookSummary', 'was book')
        : forced ? feedbackText('forcedSummary', translations?.forced || 'was forced')
        : labels[category] || result.label;
    const score = value => value.mate !== null ? `${value.mate > 0 ? '' : '-'}M${Math.abs(value.mate)}`
        : `${value.cp >= 0 ? '+' : ''}${(value.cp / 100).toFixed(2)}`;
    const best = !matchesBest && result.bestLine
        ? `${result.bestContinuation || result.bestLine} (${score(result.best)})` : '';
    // Text ratings always include their emoji; the emoji setting controls board markings.
    const qualityEmoji = `${result.isBook ? '📖' : category === 7 && !forced ? '🤩' : result.emoji || '😐'} `;
    const played = result.selected.san;
    const summary = [
        `${qualityEmoji}${played} (${score(result.played)}) ${label.toLocaleLowerCase()}`,
        best
    ].filter(Boolean).join('\n');
    const description = [
        summary,
        result.critical ? feedbackText('critical', 'Critical move.') : null,
        result.cpLoss !== null ? `${feedbackText('loss', 'Eval loss')}: ${(result.cpLoss / 100).toFixed(2)}.` : null,
        `${feedbackText('depth', 'Depth')}: ${result.depth}/${result.requestedDepth}.`,
        `${feedbackText('engine', 'Engine')}: ${result.engineName || 'Fairy Stockfish 14'}.`,
        result.recorded ? feedbackText('recorded', 'Recorded evaluations may have different search depths.') : null,
        `${feedbackText('bestLine', 'Best line')}: ${result.bestPv}.`,
        `${feedbackText('playedLine', 'Played line')}: ${played}.`
    ].filter(Boolean).join('\n');
    return { summary, description, compact: summary };
}