import { featureText } from './featureTranslations.js';

export const feedbackText = (key, fallback, values) => featureText('moveFeedback', key, fallback, values);

export function feedbackDisplay(result) {
    const labels = typeof TRANS_OBJ !== 'undefined' ? TRANS_OBJ?.moveFeedback?.labels : null;
    const label = result.forced ? feedbackText('forced', 'Forced Move') : labels?.[result.category] || result.label;
    const score = value => value.mate !== null ? `${value.mate > 0 ? '' : '-'}M${Math.abs(value.mate)}`
        : `${value.cp >= 0 ? '+' : ''}${(value.cp / 100).toFixed(2)}`;
    const provisional = result.provisional ? ` (${feedbackText('provisional', 'provisional')})` : '';
    const best = result.bestMove !== result.move ? ` ${feedbackText('best', 'Best')}: ${result.bestLine} (${score(result.best)}).` : '';
    const summary = `${result.emoji} ${result.selected.san}: ${label}${provisional}. ${feedbackText('eval', 'Eval')} ${score(result.played)}.${best}`;
    const description = [
        `${result.selected.san}: ${label}${provisional}.`,
        result.critical ? feedbackText('critical', 'Critical move.') : null,
        `${feedbackText('eval', 'Eval')}: ${score(result.played)}.`,
        `${feedbackText('best', 'Best')}: ${result.bestLine} (${score(result.best)}).`,
        result.cpLoss !== null ? `${feedbackText('loss', 'Eval loss')}: ${(result.cpLoss / 100).toFixed(2)}.` : null,
        `${feedbackText('depth', 'Depth')}: ${result.depth}/${result.requestedDepth}.`,
        `${feedbackText('engine', 'Engine')}: Fairy Stockfish 14.`,
        `${feedbackText('bestLine', 'Best line')}: ${result.bestPv}.`,
        `${feedbackText('playedLine', 'Played line')}: ${result.playedPv}.`
    ].filter(Boolean).join('\n');
    return { summary, description };
}