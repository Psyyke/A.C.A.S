import { featureText } from './featureTranslations.js';
import { estimateMaiaElo, findMove } from './maiaElo.js';

export const feedbackText = (key, fallback, values) => featureText('moveFeedback', key, fallback, values);

export const maiaLearningWarning = () => feedbackText('maiaWarning',
    'Maia 2/3 ratings are approximate. Use Stockfish for reliable reviews.');

const feedbackCategories = {
    '🏆': 7, '🤖': 7, '💎': 6, '👍': 5, '📖': null, '⚪': 0,
    '😬': 8, '❔': 1, '❓': 2, '⭕': 3, '💀': 4
};
const feedbackEmojis = Object.keys(feedbackCategories);

// Approximate fit of average win-chance loss (in % points per move) to rating.
// The prior pulls early estimates toward ~1500 until enough moves are rated.
const eloLossPrior = { loss: 7.3, weight: 4 };
const minStatMoves = 2;

// A shallow review can't see mistakes it is too weak to find, so it can't certify high ratings.
const reviewDepthEloCap = depth => Number.isFinite(depth) && depth > 0 ? 1000 + 150 * depth : Infinity;

export function estimateElo(losses, reviewDepth) {
    if(losses.length < minStatMoves) return null;
    const average = (losses.reduce((sum, loss) => sum + loss, 0) + eloLossPrior.loss * eloLossPrior.weight)
        / (losses.length + eloLossPrior.weight);
    // Logarithmic fit anchored near 800 / 1500 / 2000 / 2500 Elo at ~14 / 6.5 / 4 / 2.2 win-% loss per move.
    const elo = 3228 - 923 * Math.log(Math.max(0.5, average));
    const capped = Math.min(elo, reviewDepthEloCap(Number(reviewDepth)));
    return Math.round(Math.max(400, Math.min(3200, capped)) / 10) * 10;
}

// Per-move accuracy from win-chance loss, averaged over the side's rated moves.
export function estimateAccuracy(losses) {
    if(losses.length < minStatMoves) return null;
    const accuracy = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
    return Math.round(losses.reduce((sum, loss) => sum + accuracy(loss), 0) / losses.length);
}

function tallyFeedback(instance, profile) {
    const variables = instance.pV[profile];
    if(!variables || instance.instanceClosed) return null;

    const learning = variables.learningMode;
    const totals = Array.from({ length: learning ? 1 : 2 }, () =>
        Object.fromEntries(feedbackEmojis.map(emoji => [emoji, 0])));
    const losses = totals.map(() => []);
    const moves = totals.map(() => []);
    const standard = !variables.chessVariant || variables.chessVariant === 'chess';
    let previous = null;

    instance.gameStateHistory.forEach((state, index, history) => {
        const emoji = state.feedback?.[profile];
        const loss = state.feedbackLoss?.[profile];
        const movedColor = history[index - 1]?.fen?.full?.split(' ')[1];
        const side = learning || movedColor === variables.feedbackPlayerColor ? 0 : 1;
        if(Object.hasOwn(totals[side], emoji)) totals[side][emoji]++;
        if(Number.isFinite(loss)) losses[side].push(loss);

        const fen = state.fen?.full;
        if(!fen) return;
        if(previous && previous.split(' ')[0] !== fen.split(' ')[0]) {
            const moveSide = learning || previous.split(' ')[1] === variables.feedbackPlayerColor ? 0 : 1;
            const move = standard && !variables.useChess960 ? findMove(previous, fen) : null;
            if(move) moves[moveSide].push({ fen: previous, move });
        }
        if(!previous || previous.split(' ')[0] !== fen.split(' ')[0]) previous = fen;
    });

    return { variables, learning, totals, losses, moves };
}

// Keep both slots, including empty or disabled sides, in board order.
const sideSlots = (variables, build) => [
    variables.enableEnemyFeedback ? build(1) : '',
    variables.enableMoveRatings ? build(0) : ''
];

export function feedbackCountLines(instance, profile, includeNames = false) {
    const tally = tallyFeedback(instance, profile);
    if(!tally) return [];
    const { variables, learning, totals } = tally;

    const countText = counts => feedbackEmojis.filter(emoji => counts[emoji] > 0)
        .map(emoji => {
            if(!includeNames) return `${emoji}${counts[emoji]}`;
            const name = feedbackQualityText({ category: feedbackCategories[emoji], isBook: emoji === '📖' }, true);
            return `${emoji} ${name}: ${counts[emoji]}`;
        }).join(includeNames ? '\n' : '  ');

    if(learning) return [countText(totals[0])];
    if(!variables.enableMoveRatings && !variables.enableEnemyFeedback) return [];

    return sideSlots(variables, side => countText(totals[side]));
}

// Elo and accuracy lines, aligned with feedbackCountLines.
export function feedbackStatLines(instance, profile, includeNames = false) {
    const tally = tallyFeedback(instance, profile);
    if(!tally || !tally.variables.feedbackEloEstimate) return [];
    const { variables, learning, losses, moves } = tally;
    const refresh = () => instance.onMaiaEloUpdate?.(profile);

    const statText = (sideLosses, sideMoves) => {
        const maia = estimateMaiaElo(sideMoves, refresh, `${instance.instanceID}|${profile}`);
        const elo = maia?.elo ?? estimateElo(sideLosses, variables.feedbackEngineDepth);
        const accuracy = estimateAccuracy(sideLosses);
        if(includeNames) {
            return [
                elo && `${feedbackText('eloEstimate', 'Estimated Elo')}: ${elo}${maia ? ` ±${maia.sd}` : ''}`,
                accuracy !== null && `${feedbackText('accuracy', 'Accuracy')}: ${accuracy}%`
            ].filter(Boolean).join('\n');
        }
        if(!elo) return accuracy !== null ? `${accuracy}%` : '';
        return accuracy !== null ? `Elo ${elo} (${accuracy}%)` : `Elo ${elo}`;
    };

    if(learning) return [statText(losses[0], moves[0])];

    return [statText(losses[1], moves[1]), statText(losses[0], moves[0])];
}

// Pads numbers with figure spaces so GUI stats keep one width as digits change.
export function padStatText(text) {
    // Pad at the start so the text stays flush right and the width stays constant.
    const digits = (text.match(/\d+/g) || []).map(value => value.length);
    const missing = Math.max(0, 4 - (digits[0] ?? 4)) + (digits.length > 1 ? Math.max(0, 3 - digits[1]) : 0);
    return '\u2007'.repeat(missing) + text;
}

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
        : result.beatsEngine && !matchesBest ? feedbackText('beatsEngine', 'was better than the engine')
        : labels[category] || result.label;
    const score = value => value.mate !== null ? `${value.mate > 0 ? '' : '-'}M${Math.abs(value.mate)}`
        : `${value.cp >= 0 ? '+' : ''}${(value.cp / 100).toFixed(2)}`;
    const best = !matchesBest && result.bestLine
        ? `${result.bestContinuation || result.bestLine} (${score(result.best)})` : '';
    // Text ratings always include their emoji; the emoji setting controls board markings.
    const qualityEmoji = `${result.isBook ? '📖' : category === 7 && !forced ? result.beatsEngine && !matchesBest ? '🏆' : '🤖' : result.emoji || '⚪'} `;
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
        result.uncertainty || (result.recorded ? feedbackText('recorded', 'Recorded evaluations may have different search depths.') : null),
        `${feedbackText('bestLine', 'Best line')}: ${result.bestPv}.`,
        `${feedbackText('playedLine', 'Played line')}: ${played}.`
    ].filter(Boolean).join('\n');
    return { summary, description, compact: summary, emoji: qualityEmoji.trim() };
}