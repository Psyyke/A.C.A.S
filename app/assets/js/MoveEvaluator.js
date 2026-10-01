import FairyAnalysis from './FairyAnalysis.js';
import { variantConfig } from './misc/variantPosition.js';

// Compare best and played moves at the same root/depth, from the mover's side.
export default class MoveEvaluator extends FairyAnalysis {
    constructor() {
        super();
        this.searchDepth = 12;
        this.resultLabels = ['Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic', 'Good Move', 'Excellent', 'Best Move', 'Weak Move'];
        this.resultEmojis = ['🙂', '🤨', '😟', '😨', '💀', '😊', '😁', '🤩', '😕'];
        this.ratingBands = [
            { limit: 0.75, maxCpLoss: 10, category: 6, reason: 'Nearly matches the best move.' },
            { limit: 1.75, maxCpLoss: 25, category: 5, reason: 'Close to the best move.' },
            { limit: 3, category: 0, reason: 'Playable, but less precise.' },
            { limit: 5, category: 8, reason: 'A small concession.' },
            { limit: 10, category: 1, reason: 'Loses ground.' },
            { limit: 20, category: 2, reason: 'Avoidable loss.' },
            { limit: 35, category: 3, reason: 'Serious loss.' },
            { limit: Infinity, category: 4, reason: 'Throws away the position.' }
        ];
    }

    winningChances(score) {
        if(score.mate !== null) return score.mate > 0 ? 100 : 0;
        return 100 / (1 + Math.exp(-0.00368208 * Math.max(-4000, Math.min(4000, score.cp))));
    }

    expectedScore(score) {
        if(score.mate !== null) return score.mate > 0 ? 100 : 0;
        const total = score.wdl?.reduce((sum, value) => sum + value, 0);
        return total > 0 ? 100 * (score.wdl[0] + score.wdl[1] / 2) / total : null;
    }

    measureLoss(best, played) {
        const winningChanceLoss = Math.max(0, this.winningChances(best) - this.winningChances(played));
        const bestExpected = this.expectedScore(best), playedExpected = this.expectedScore(played);
        const expectedScoreLoss = bestExpected !== null && playedExpected !== null ? Math.max(0, bestExpected - playedExpected) : 0;
        const loss = Math.max(winningChanceLoss, expectedScoreLoss);
        const cpLoss = best.cp !== null && played.cp !== null ? Math.max(0, best.cp - played.cp) : null;
        const scaledCpLoss = cpLoss === null ? 0 : cpLoss / (1 + Math.min(Math.abs(best.cp), 2000) / 400);
        const baseLoss = Math.max(winningChanceLoss, scaledCpLoss / 12.5);
        const qualityLoss = Math.max(baseLoss, Math.min(expectedScoreLoss, baseLoss * 1.25));
        return { cpLoss, scaledCpLoss, winningChanceLoss, expectedScoreLoss, loss, qualityLoss };
    }

    compare(best, played, forced, runnerUp = null) {
        const metrics = this.measureLoss(best, played);
        const { cpLoss, loss, qualityLoss } = metrics;
        const band = this.ratingBands.find(band => qualityLoss < band.limit
            && (band.maxCpLoss === undefined || cpLoss !== null && cpLoss <= band.maxCpLoss));
        const alternativeLoss = runnerUp ? this.measureLoss(best, runnerUp).qualityLoss : null;
        const avoidsMate = runnerUp && runnerUp.mate !== null && runnerUp.mate <= 0 && (best.mate === null || best.mate > 0);
        const keepsMate = best.mate > 0 && runnerUp && !(runnerUp.mate > 0);
        const critical = best.move === played.move && Boolean(runnerUp) && (avoidsMate || keepsMate || alternativeLoss >= 10);
        let category, reason;
        if(forced) { category = 0; reason = 'Only legal move.'; }
        else if(best.move === played.move) {
            category = 7;
            reason = avoidsMate ? 'Only move that avoids forced mate.' : keepsMate ? 'Only move that keeps forced mate.'
                : critical ? 'Only move that avoids a major concession.' : 'Engine’s top choice.';
        } else if(played.mate !== null && played.mate <= 0 && (best.mate === null || best.mate > 0)) {
            category = loss >= 35 ? 4 : best.cp !== null && best.cp < -700 ? 2 : 3;
            reason = 'Allows forced mate.';
        } else if(best.mate > 0 && !(played.mate > 0)) {
            const stillWinning = played.cp !== null && played.cp >= 700;
            category = stillWinning ? 8 : loss >= 35 ? 4 : loss >= 10 ? 3 : 2;
            reason = stillWinning ? 'Still winning, but misses mate.' : 'Misses forced mate.';
        } else if(best.mate > 0 && played.mate > 0) {
            const extraMoves = Math.max(0, played.mate - best.mate);
            category = extraMoves <= 2 ? 6 : 5;
            reason = extraMoves ? `Keeps mate; ${extraMoves} moves slower.` : 'Keeps forced mate.';
        } else if(best.mate !== null && best.mate <= 0 && played.mate !== null && played.mate <= 0) {
            const fasterBy = Math.max(0, Math.abs(best.mate) - Math.abs(played.mate));
            category = fasterBy >= Math.max(4, Math.ceil(Math.abs(best.mate) / 2)) ? 1 : fasterBy >= 2 ? 8 : 0;
            reason = fasterBy >= 2 ? `Allows mate ${fasterBy} moves sooner.` : 'Mate was already forced.';
        } else {
            category = band.category;
            reason = band.reason;
            if(category === 4 && (cpLoss === null || cpLoss < 300 || loss < 35)) { category = 3; reason = 'Serious loss.'; }
        }
        return { category, label: forced ? 'Forced Move' : this.resultLabels[category], emoji: this.resultEmojis[category],
            cp: cpLoss === null ? null : -cpLoss, ...metrics, alternativeLoss, critical,
            best, played, bestMove: best.move, depth: Math.min(best.depth, played.depth), forced, reason };
    }

    async evaluateJob(job) {
        const transition = job.transition || await this.resolveTransition(job, job.postFen, job.hint);
        if(!transition || job.cancelled) return null;
        const moves = transition.moves;
        const move = transition.selected.uci;
        const baseline = await this.search(job, job.depth, moves, Math.min(2, moves.length));
        if(job.cancelled) return null;
        let depth = Math.max(...baseline.iterations.keys());
        let lines = baseline.iterations.get(depth);
        let played = lines.find(line => line.move === move), restricted = null;
        if(!played) {
            restricted = await this.search(job, depth, [move], 1);
            if(job.cancelled) return null;
            const common = [...restricted.iterations.keys()].filter(value => baseline.iterations.has(value));
            if(!common.length) return null;
            depth = Math.max(...common);
            lines = baseline.iterations.get(depth);
            played = restricted.iterations.get(depth)[0];
        }
        const result = this.compare(lines[0], played, moves.length === 1, lines[1]);
        const recent = [...baseline.iterations.keys()].filter(value => value <= depth && value >= depth - 2).map(value => {
            const candidates = baseline.iterations.get(value);
            const selected = candidates.find(line => line.move === move) || restricted?.iterations.get(value)?.[0];
            return selected ? this.compare(candidates[0], selected, moves.length === 1, candidates[1]) : null;
        }).filter(Boolean);
        const gradeChanged = recent.some(comparison => comparison.category !== result.category || result.critical && !comparison.critical);
        const spread = Math.max(...recent.map(comparison => comparison.qualityLoss)) - Math.min(...recent.map(comparison => comparison.qualityLoss));
        const conflict = lines[0].cp !== null && played.cp !== null && played.cp > lines[0].cp + 15;
        const provisional = !result.forced && (depth < 8 || recent.length < 2 || gradeChanged || spread >= 2 || conflict);
        const uncertainty = result.forced ? '' : depth < 8 ? 'Shallow search.' : conflict ? 'Search scores disagree.'
            : gradeChanged || spread >= 2 ? 'Recent depths disagree.' : recent.length < 2 ? 'No stable depth comparison.' : '';
        const bestMove = await this.describeMoveWithSan(job, result.best.move, moves);
        if(job.cancelled) return null;
        return { ...result, move, fen: job.fen, requestedDepth: job.depth, provisional, uncertainty,
            selected: transition.selected, chessVariant: job.variant,
            bestLine: bestMove.san,
            playedLine: transition.selected.san,
            bestPv: result.best.pv.join(' '), playedPv: result.played.pv.join(' ') };
    }

    eval(moveObj, config = {}, callback) {
        const context = variantConfig(config);
        const depth = Math.max(1, Math.min(99, Math.floor(Number(config.depth) || this.searchDepth)));
        const key = `rating|${context.variant}|${context.useChess960}|${config.fen}|${config.postFen}|${depth}|${moveObj.join('')}`;
        return this.enqueue(key, { ...config, depth, hint: moveObj }, job => this.evaluateJob(job)).then(result => {
            if(result && typeof callback === 'function') callback(result);
            return result;
        });
    }
}