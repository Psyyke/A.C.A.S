import MoveEvaluator from '../MoveEvaluator.js';
import { feedbackText as text, feedbackDisplay, feedbackQualityText, feedbackCountLines } from '../misc/feedbackText.js';
import { updatePipFeedback } from '../gui/pip.js';
import { getHintSettings, filterHintMoves, presentHintMove } from '../misc/learningHints.js';
import { formatMoveNotationAsync, formatPvNotationAsync, getMoveSan, replayPvAsync, resolveVariantMove } from '../misc/moveNotation.js';
import { parseVariantMove, variantConfig } from '../misc/variantPosition.js';

const recordedEvaluator = new MoveEvaluator(false);

function isBookMove(profile, fen, uci) {
    const book = this.openingBooks?.get(profile);
    const move = parseVariantMove(uci);
    if(!book || !fen || !move) return false;
    // Polyglot encodes castling as king-to-rook, rather than king-to-destination.
    const castlingMoves = { e1h1: 'g1', e1a1: 'c1', e8h8: 'g8', e8a8: 'c8' };
    return book.getMoves(fen).some(candidate => {
        const castleTo = candidate.piece?.toLowerCase() === 'k'
            ? castlingMoves[`${candidate.from}${candidate.to}`] : null;
        return candidate.from === move.from && (candidate.to === move.to || castleTo === move.to)
            && String(candidate.promotion || '').toLowerCase() === move.promotion.toLowerCase();
    });
}

function queueLearningFeedbackSpeech(profile, postFen) {
    const variables = this.pV[profile];
    const analysisKey = variables.analysisKey;
    const key = `review-quality|${profile}|${analysisKey}|${postFen}`;
    const quality = feedbackQualityText(variables.lastFeedbackResult);
    const pending = variables.pendingFeedbackSpeech;
    // Keep the timer running through depth/PV updates that preserve the grade.
    if(pending?.key === key && pending.quality === quality) return;
    clearTimeout(pending?.timeout);
    const announcement = { key, quality };
    variables.pendingFeedbackSpeech = announcement;
    const isCurrent = () => !this.instanceClosed && this.pV[profile] === variables
        && this.isLearningProfile(profile) && variables.analysisKey === analysisKey
        && this.learningReviewPostFen === postFen && variables.lastFeedbackFen === postFen
        && variables.pendingFeedbackSpeech === announcement
        && Boolean(variables.lastFeedbackResult) && feedbackQualityText(variables.lastFeedbackResult) === quality;
    announcement.timeout = setTimeout(() => {
        announcement.timeout = null;
        if(!isCurrent()) {
            if(variables.pendingFeedbackSpeech === announcement) delete variables.pendingFeedbackSpeech;
            return;
        }
        // Read the displayed result now, not the shallow result that started the timer.
        this.speak({ feedbackResult: variables.lastFeedbackResult }, profile, 'ttsVoiceEnabled', {
            review: true, isCurrent, announcementKey: key
        }).catch(console.error).finally(() => {
            if(variables.pendingFeedbackSpeech === announcement) delete variables.pendingFeedbackSpeech;
        });
    }, 400);
}

export function recordEngineAnalysis(data, calculation, profile, moveObject) {
    if(!calculation?.annotationEligible || (!data.pv && !data.bestmove && data.cp == null && data.mate == null)
        || /\b(?:lowerbound|upperbound)\b/.test(calculation.rawLine || '')) return;
    const variables = this.pV[profile];
    const state = this.gameStateHistory.findLast(item => item.fen?.full === calculation.fen);
    if(!state || !variables) return;
    state.analysis ??= {};
    if(state.analysis[profile]?.engine !== variables.analysisKey) delete state.analysis[profile];
    const analysis = state.analysis[profile] ??= { engine: variables.analysisKey, moves: [] };
    const uci = data.pv?.trim().split(/\s+/)[0] || data.bestmove;
    const ranking = Number(data.multipv) || 1;
    const mate = data.mate != null && Number.isFinite(Number(data.mate)) ? Number(data.mate) : null;
    const cp = data.cp != null && Number.isFinite(Number(data.cp)) ? Number(data.cp) : null;
    analysis.name = variables.useExternalChessEngine ? `External (${variables.externalChessEngine})` : variables.requestedEngine;
    if(!moveObject) {
        if(ranking === 1 && (cp !== null || mate !== null)) {
            analysis.score = { cp, mate, depth: Number(data.depth) || 0,
                playerUci: analysis.moves[0]?.playerUci, pv: [] };
            if(this.isLearningProfile(profile)) renderLearningFeedback.call(this, profile).catch(console.error);
        }
        return;
    }
    if(data.pv && (cp !== null || mate !== null)) {
        const candidate = { ...moveObject, cp,
            fen: calculation.fen, chessVariant: calculation.chessVariant, useChess960: calculation.useChess960,
            playerUci: uci, mate, depth: Number(data.depth) || 0, pv: data.pv.split(/\s+/) };
        analysis.moves = [...analysis.moves.filter(item => item.ranking !== ranking), candidate].sort((a, b) => a.ranking - b.ranking);
        if(ranking === 1) analysis.score = candidate;
    } else if(!analysis.moves.length) {
        analysis.moves = [{ ...moveObject, cp: null, mate: null,
            ...analysis.score, fen: calculation.fen, playerUci: uci,
            chessVariant: calculation.chessVariant, useChess960: calculation.useChess960 }];
        if(analysis.score) analysis.score = analysis.moves[0];
    }
    if(this.isLearningProfile(profile) && [this.learningReviewFen, this.learningReviewPostFen].includes(calculation.fen)) {
        if(calculation.fen === this.learningReviewFen)
            this.displayMoves(analysis.moves, profile, false, true, true).catch(console.error);
        renderLearningFeedback.call(this, profile).catch(console.error);
    }
}

export async function renderLearningFeedback(specificProfile) {
    if(!this.learningMode) return;
    const fen = this.learningReviewFen, postFen = this.learningReviewPostFen;
    const before = this.gameStateHistory.findLast(state => state.fen?.full === fen);
    const after = this.gameStateHistory.findLast(state => state.fen?.full === postFen);
    for(const profile of specificProfile ? [specificProfile] : Object.keys(this.pV)) {
        const variables = this.pV[profile];
        if(!variables || !this.isLearningProfile(profile)) continue;
        const request = variables.feedbackRequest = (variables.feedbackRequest || 0) + 1;
        const isCurrent = () => this.isLearningProfile(profile) && !this.instanceClosed && this.pV[profile] === variables
            && this.learningReviewPostFen === postFen && variables.feedbackRequest === request;
        const [hints, arrowOpacity, playerColor] = await Promise.all([
            getHintSettings(this, profile),
            this.getConfigValue(this.configKeys.arrowOpacity, profile),
            this.getPlayerColor(profile)
        ]);
        if(!isCurrent()) continue;
        clearFeedback.call(this, profile, true, true);
        if(!before || !after || fen.split(' ')[1] !== playerColor) {
            if(!variables.lastFeedbackResult) setFeedbackMessage.call(this, profile, text('learningWaiting', 'Play a move to see feedback'));
            continue;
        }
        const changes = after.boardChanges;
        let move = changes?.from && changes?.to ? `${changes.from}${changes.to}${changes.isPromotion ? String(changes.promotionPiece || '').toLowerCase() : ''}` : null;
        const context = variantConfig(variables);
        if(context.variant !== 'chess' || context.useChess960) {
            const transition = await resolveVariantMove(fen, postFen,
                [changes?.from, changes?.to, changes?.promotionPiece], { ...context, isCurrent });
            if(!isCurrent()) continue;
            // The engine resolves drops, '+' promotions and Chess960 castling,
            // even when the DOM's ordinary from/to hint is incomplete.
            move = transition?.selected?.uci || null;
        }
        const analysis = before.analysis?.[profile], response = after.analysis?.[profile];
        const bestMove = analysis?.engine === variables.analysisKey ? analysis.moves[0] : null;
        const own = { ...CREATE_MOVE_OBJ({ playerMove: parseVariantMove(move), profile }), fen,
            playerUci: move, chessVariant: variables.chessVariant, useChess960: variables.useChess960 };
        const playedName = getMoveSan(own) || move;
        const best = analysis?.score;
        const next = response?.engine === variables.analysisKey ? response.score : null;
        // Value-only networks (Maia) score the position, not each policy move.
        const valueOnly = String(analysis?.name).toLowerCase().includes('maia');
        const candidate = !valueOnly ? analysis?.moves.find(item => item.playerUci === move
            && (item.mate != null || item.cp != null)) : null;
        if(!bestMove || !best || (!next && !candidate) || !move) continue;

        const toScore = (item, negate = false, uci = item.playerUci) => ({
            cp: item.cp == null ? null : item.cp * (negate ? -1 : 1),
            mate: item.mate == null ? null : item.mate * (negate ? -1 : 1),
            move: uci, depth: item.depth || 0, pv: item.pv || [uci]
        });
        // A candidate PV starts with the played move. A post-move PV starts
        // with the reply, so prepend the move before replaying from the old FEN.
        const replyPv = next ? (next.pv?.length ? next.pv : response?.moves?.[0]?.pv || []) : [];
        const playedScore = candidate ? toScore(candidate) : { ...toScore(next, true, move), pv: [move, ...replyPv] };
        if(playedScore.pv.length < 2 && replyPv.length) playedScore.pv = [move, ...replyPv];
        const result = recordedEvaluator.compare(toScore(best, false, bestMove.playerUci), playedScore, false);
        const showLines = (variables.multiPV ?? 0) > 0 && arrowOpacity > 1;
        const visible = showLines ? filterHintMoves([bestMove], hints, fen) : [];
        const bestLine = visible[0] ? await formatMoveNotationAsync(presentHintMove(visible[0], visible[0].hintDetail), true, false, undefined, isCurrent) : '';
        if(!isCurrent()) continue;
        // A review's explanatory PV is independent of the opponent-arrow toggle.
        // Keep applying piece/detail filters at each position along the line.
        const allowContinuation = candidate => filterHintMoves([candidate], hints, candidate.fen)
            .some(item => item.hintDetail === 'full');
        const bestPositions = visible[0]?.hintDetail === 'full'
            ? await replayPvAsync(bestMove.pv, bestMove, allowContinuation, isCurrent) : [];
        if(!isCurrent()) continue;
        const bestContinuation = bestPositions.map(position => position.san).join(' ➜ ');
        const playedContinuation = showLines && allowContinuation(own)
            ? await formatPvNotationAsync(playedScore.pv, own, allowContinuation, isCurrent) : '';
        if(!isCurrent()) continue;
        Object.assign(result, { move, isBook: isBookMove.call(this, profile, fen, move),
            isPlayerMove: fen.split(' ')[1] === playerColor,
            selected: { san: playedName }, bestLine, bestPv: bestContinuation || bestLine,
            bestContinuation, bestPositions, playedContinuation, playedPv: playedContinuation || playedName,
            engineName: analysis.name, recorded: true,
            requestedDepth: Math.max(best.depth || 0, next?.depth || 0) });
        variables.lastFeedbackResult = result;
        variables.lastFeedbackFen = postFen;
        const { summary, description, emoji } = feedbackDisplay(result);
        (after.feedback ??= {})[profile] = emoji;
        setFeedbackMessage.call(this, profile, summary, description);
        queueLearningFeedbackSpeech.call(this, profile, postFen);
        const score = result.played;
        if(score.cp !== null || score.mate !== null) {
            this.Interface.updateEval(score.mate ?? score.cp, score.mate !== null, profile, fen.split(' ')[1], true, {
                fen, postFen, depth: result.depth, isCurrent
            }).catch(console.error);
        }
    }
}

function setFeedbackMessage(profileID, message, description = '') {
    const container = this.instanceElem?.querySelector('.instance-feedback-container');
    if(!container) return;
    let row = Array.from(container.children).find(elem => elem.dataset.profileId === profileID);
    if(!message) {
        row?.remove();
        updatePipFeedback(this);
        return;
    }
    if(!row) {
        row = document.createElement('div');
        row.className = 'instance-feedback';
        row.dataset.profileId = profileID;
        row.setAttribute('role', 'status');
        container.appendChild(row);
    }
    const variables = this.pV[profileID];
    const isCountEnabled = (_, index) => variables.learningMode
        || (index === 0 ? variables.enableEnemyFeedback : variables.enableMoveRatings);
    const allCountLines = feedbackCountLines(this, profileID);
    const countLines = allCountLines.filter(isCountEnabled);
    const countTitles = feedbackCountLines(this, profileID, true).filter(isCountEnabled);
    const countLabels = allCountLines.length === 2
        ? [text('opponent', 'Opponent'), text('yours', 'Yours')].filter(isCountEnabled) : [];
    const counts = JSON.stringify([countLabels, countLines, countTitles]);
    if(row.dataset.feedbackText === String(message) && row.dataset.feedbackCounts === counts
        && row.title === (description || message)) {
        row.classList.toggle('hidden', this.learningMode && !this.isLearningProfile(profileID));
        updatePipFeedback(this);
        return;
    }

    // Preserve the original line breaks and score placement for PiP.
    row.dataset.feedbackText = `${message}`;
    row.dataset.feedbackCounts = counts;
    row.replaceChildren();

    if(countLines.length) {
        const totals = document.createElement('div');
        totals.className = 'instance-feedback-totals';
        countLines.forEach((line, index) => {
            const countLine = document.createElement('div');
            countLine.className = 'instance-feedback-count-line';
            const values = document.createElement('span');
            values.className = 'instance-feedback-counts';
            values.textContent = line;
            values.title = countTitles[index];

            if(countLabels.length) {
                countLine.classList.add('has-label');
                const label = document.createElement('span');
                label.textContent = countLabels[index];
                countLine.appendChild(label);
            }
            countLine.appendChild(values);
            totals.appendChild(countLine);
        });
        row.appendChild(totals);
    }

    const feedback = document.createElement('div');
    feedback.className = 'instance-feedback-message';

    String(message).split('\n').filter(Boolean).forEach(line => {
        const score = line.match(/\s*\(([+-]?\d+(?:\.\d+)?|-?M\d+)\)/);
        const lineElem = document.createElement('div');
        lineElem.className = 'instance-feedback-line';
        const textElem = document.createElement('span');
        textElem.textContent = score ? line.replace(score[0], '').trim() : line;
        lineElem.appendChild(textElem);
        if(score) {
            lineElem.classList.add('has-score');
            const scoreElem = document.createElement('span');
            scoreElem.className = 'instance-feedback-score';
            scoreElem.textContent = `(${score[1]})`;
            lineElem.appendChild(scoreElem);
        }
        feedback.appendChild(lineElem);
    });
    row.appendChild(feedback);
    row.title = description || message;
    row.classList.toggle('hidden', this.learningMode && !this.isLearningProfile(profileID));
    updatePipFeedback(this);
}

function nextFeedbackRevision() {
    this.feedbackVisualRevision = Math.max(Date.now() * 1000, (this.feedbackVisualRevision || 0) + 1);
    return this.feedbackVisualRevision;
}

document.addEventListener('acas-translations-updated', () => {
    for(const entry of window.AcasInstances || []) {
        const instance = entry.instance;
        if(!instance || instance.instanceClosed) continue;
        for(const [profile, variables] of Object.entries(instance.pV)) {
            if(variables.lastFeedbackResult) {
                const { summary, description } = feedbackDisplay(variables.lastFeedbackResult);
                setFeedbackMessage.call(instance, profile, summary, description);
                variables.activeFeedbackDisplays?.forEach(marking => {
                    marking.elem?.setAttribute('aria-label', description);
                    const title = marking.elem?.querySelector('title');
                    if(title) title.textContent = description;
                    marking.data.feedbackDescription = description;
                });
            }
        }
    }
});

export function clearFeedback(profileID, clearExternal = true, keepMessage = false) {
    const variables = this.pV[profileID];
    if(!variables) return;
    const hadExternalFeedback = variables.feedbackDisplayedExternally;
    (variables.activeFeedbackDisplays || []).forEach(marking => marking.elem?.remove());
    variables.activeFeedbackDisplays = [];
    variables.feedbackDisplayedExternally = false;
    if(!keepMessage) {
        variables.lastFeedbackFen = null;
        variables.lastFeedbackResult = null;
        setFeedbackMessage.call(this, profileID, null);
    } else if(variables.lastFeedbackResult) {
        const { summary, description } = feedbackDisplay(variables.lastFeedbackResult);
        setFeedbackMessage.call(this, profileID, summary, description);
    }
    if(clearExternal && hadExternalFeedback) {
        // A shape-less feedback packet clears this profile/category only. An
        // empty array cannot identify which profile's external emoji to remove.
        this.CommLink?.commands?.renderVisualsToSite([{
            profileID, category: 'feedback', feedbackFen: this.currentFen,
            feedbackRevision: nextFeedbackRevision.call(this)
        }]);
    }
}

export function prepareFeedbackPosition(currentFen) {
    if(this.feedbackPositionFen === currentFen) return;
    this.feedbackPositionFen = currentFen;
    this.feedbackGeneration = (this.feedbackGeneration || 0) + 1;
    this.MoveEval?.cancelPending();
    this.BoardPiecesEval?.cancelStaleRequests();
    Object.keys(this.pV).forEach(profileID => {
        const variables = this.pV[profileID];
        const sameGame = Boolean(currentFen) && this.gameStateHistory.some(state => state.fen?.full === variables.lastFeedbackFen);
        clearFeedback.call(this, profileID, true, sameGame);
        this.pV[profileID].activePieceEvalDisplays?.forEach(marking => marking.elem?.remove());
        this.pV[profileID].activePieceEvalDisplays = [];
    });
}

export default async function renderFeedback(gameStateObj, specificProfileName) {
    if(this.learningMode) await renderLearningFeedback.call(this, specificProfileName);
    const currentFen = gameStateObj?.fen?.full;
    const reportedChanges = gameStateObj?.boardChanges;
    if(!currentFen || this.instanceClosed || this.currentFen !== currentFen) return;

    // Snapshot the actual preceding game state BEFORE any await. Suggestion
    // engines may skip opponent turns, run on demand, or update lastFen meanwhile.
    const history = this.gameStateHistory || [];
    const stateIndex = history.findLastIndex(state => state.fen?.full === currentFen);
    let previousFen = null;
    for(let index = stateIndex - 1; index >= 0; index--) {
        const fen = history[index]?.fen?.full;
        // A settings/orientation refresh can duplicate a board in history.
        if(fen && fen.split(' ')[0] !== currentFen.split(' ')[0]) {
            previousFen = fen;
            break;
        }
    }
    prepareFeedbackPosition.call(this, currentFen);
    const generation = this.feedbackGeneration;
    const isCurrentPosition = () => !this.instanceClosed && this.currentFen === currentFen
        && this.feedbackPositionFen === currentFen && this.feedbackGeneration === generation;

    const profiles = (await GET_PROFILES(this.instanceID)).filter(Boolean);
    if(!isCurrentPosition()) return;
    const targets = profiles.filter(profile => !this.isLearningProfile(profile.name)
        && (!specificProfileName || profile.name === specificProfileName));

    await Promise.all(targets.map(async profileObj => {
        const profileID = profileObj.name;
        const variables = this.pV[profileID];
        if(!variables) return;
        const request = (variables.feedbackRequest || 0) + 1;
        variables.feedbackRequest = request;
        this.MoveEval?.cancelStaleRequests();
        const isCurrentRequest = () => isCurrentPosition() && !this.isLearningProfile(profileID) && this.pV[profileID] === variables
            && variables.feedbackRequest === request;

        try {
            const [enablePlayerFeedback, enableEnemyFeedback, feedbackEngineDepth, playerColor, useChess960] = await Promise.all([
                this.getConfigValue(this.configKeys.enableMoveRatings, profileID),
                this.getConfigValue(this.configKeys.enableEnemyFeedback, profileID),
                this.getConfigValue(this.configKeys.feedbackEngineDepth, profileID),
                this.getPlayerColor(profileID),
                this.getConfigValue(this.configKeys.useChess960, profileID)
            ]);
            if(!isCurrentRequest()) return;

            Object.assign(variables, {
                enableMoveRatings: Boolean(enablePlayerFeedback),
                enableEnemyFeedback: Boolean(enableEnemyFeedback),
                feedbackPlayerColor: playerColor
            });

            // turn is the NEXT player, not the piece that just moved. Never
            // rewrite the opponent's turn: the pre-move FEN already has it right.
            const movedColor = previousFen?.split(' ')[1];
            const isPlayerMove = movedColor === playerColor;
            const enabled = movedColor ? isPlayerMove ? enablePlayerFeedback : enableEnemyFeedback
                : enablePlayerFeedback || enableEnemyFeedback;
            const variant = variables.chessVariant || this.activeVariant;
            if(!enabled) {
                clearFeedback.call(this, profileID, true, Boolean(enablePlayerFeedback || enableEnemyFeedback));
                updatePipFeedback(this);
                return;
            }
            if(!previousFen || !['w', 'b'].includes(movedColor)) {
                return;
            }

            // Keep the last rating visible until a replacement is ready.
            // Calculation placeholders are deliberately omitted.
            if(!this.MoveEval) this.MoveEval = new MoveEvaluator();
            const analysisConfig = { chessVariant: variant, useChess960: useChess960 || variables.useChess960,
                isCurrent: isCurrentRequest };
            const transition = await this.MoveEval.resolveMove(previousFen, currentFen,
                [reportedChanges?.from, reportedChanges?.to, reportedChanges?.promotionPiece], analysisConfig);
            if(!isCurrentRequest()) return;
            if(!transition) {
                if(!variables.lastFeedbackResult) setFeedbackMessage.call(this, profileID, text('mismatch', 'Move history mismatch or unsupported variant.'));
                return;
            }
            const changes = transition.selected;
            const promotion = changes.promotion || '';

            const result = await this.MoveEval.eval([changes.from, changes.to, promotion], {
                ...analysisConfig, fen: previousFen, postFen: currentFen, depth: feedbackEngineDepth || 15, transition
            });
            if(!isCurrentRequest()) return;
            if(!result) {
                if(!variables.lastFeedbackResult) setFeedbackMessage.call(this, profileID, text('unavailable', 'Evaluation unavailable.'));
                return;
            }

            // Settings can change while the engine is searching. Recheck them
            // before drawing, including the asynchronous external-site toggle.
            const [playerEnabled, enemyEnabled, feedbackOnExternalSite, latestPlayerColor] = await Promise.all([
                this.getConfigValue(this.configKeys.enableMoveRatings, profileID),
                this.getConfigValue(this.configKeys.enableEnemyFeedback, profileID),
                this.getConfigValue(this.configKeys.feedbackOnExternalSite, profileID),
                this.getPlayerColor(profileID)
            ]);
            if(!isCurrentRequest()) return;
            if(!(movedColor === latestPlayerColor ? playerEnabled : enemyEnabled)) {
                clearFeedback.call(this, profileID, true, Boolean(playerEnabled || enemyEnabled));
                return;
            }

            if(!Number.isInteger(result.category)) return;
            const showEmoji = await this.getConfigValue(this.configKeys.feedbackEmojis, profileID) !== false;
            if(!isCurrentRequest()) return;
            const isBook = isBookMove.call(this, profileID, previousFen, result.move);
            const emoji = isBook ? '📖' : result.emoji || '😐';
            const notationConfig = {
                fen: previousFen, chessVariant: variant, useChess960: useChess960 || variables.useChess960
            };
            const [bestContinuation, playedContinuation] = await Promise.all([
                formatPvNotationAsync(result.best?.pv, notationConfig, undefined, isCurrentRequest),
                formatPvNotationAsync(result.played?.pv, notationConfig, undefined, isCurrentRequest)
            ]);
            if(!isCurrentRequest()) return;
            const feedbackResult = { ...result, isBook, isPlayerMove: movedColor === latestPlayerColor,
                bestContinuation, playedContinuation };
            const { summary, description, emoji: ratingEmoji } = feedbackDisplay(feedbackResult);
            const state = this.gameStateHistory.findLast(item => item.fen?.full === currentFen);
            if(state) (state.feedback ??= {})[profileID] = ratingEmoji;
            clearFeedback.call(this, profileID, !feedbackOnExternalSite, true);
            variables.lastFeedbackFen = currentFen;
            variables.lastFeedbackResult = feedbackResult;
            setFeedbackMessage.call(this, profileID, summary, description);
            if(!this.BoardDrawer || !showEmoji || this.learningMode && !feedbackOnExternalSite) return;
            const shapeType = 'text';
            const shapeSquare = changes.to;
            const shapeConfig = { size: 1.7, text: emoji, style: 'opacity: 1;', position: [0.65, 0.65] };
            const elem = !this.learningMode ? this.BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig) : null;
            if(!elem && !this.learningMode) return;
            elem?.setAttribute('aria-label', description);
            // Keep accessible metadata on the emoji; the explanation is also
            // visible below the board because overlays ignore pointer events.
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = description;
            elem?.appendChild(title);
            const marking = CREATE_BOARD_DRAWER_MOVE_OBJ(elem, { shapeType, shapeSquare, shapeConfig }, profileID, 'feedback');
            marking.data.feedbackFen = currentFen;
            marking.data.feedbackRevision = nextFeedbackRevision.call(this);
            marking.data.feedbackDescription = description;
            variables.activeFeedbackDisplays.push(marking);
            variables.feedbackDisplayedExternally = Boolean(feedbackOnExternalSite);
            if(feedbackOnExternalSite) {
                this.CommLink.commands.renderVisualsToSite(FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE([marking]));
            }
        } catch(error) {
            if(isCurrentRequest() && !variables.lastFeedbackResult) {
                setFeedbackMessage.call(this, profileID, text('unavailable', 'Evaluation unavailable.'));
            }
            console.warn('[Feedback] Could not display rating:', profileID, error);
        }
    }));
}