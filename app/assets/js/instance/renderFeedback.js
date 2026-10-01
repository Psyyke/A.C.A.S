import MoveEvaluator from '../MoveEvaluator.js';
import { feedbackText as text, feedbackDisplay } from '../misc/feedbackText.js';

function setFeedbackMessage(profileID, message, description = '') {
    const container = this.instanceElem?.querySelector('.instance-feedback-container');
    if(!container) return;
    let row = Array.from(container.children).find(elem => elem.dataset.profileId === profileID);
    if(!message) {
        row?.remove();
        return;
    }
    if(!row) {
        row = document.createElement('div');
        row.className = 'instance-feedback';
        row.dataset.profileId = profileID;
        row.setAttribute('role', 'status');
        container.appendChild(row);
    }
    const readableName = String(GET_HUMAN_READABLE_PROFILE_NAME(profileID));
    const profileName = readableName.charAt(0).toLocaleUpperCase() + readableName.slice(1);
    row.textContent = `${message}`;
    row.title = description || message;
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

export function clearFeedback(profileID, clearExternal = true) {
    const variables = this.pV[profileID];
    if(!variables) return;
    const hadExternalFeedback = variables.feedbackDisplayedExternally;
    (variables.activeFeedbackDisplays || []).forEach(marking => marking.elem?.remove());
    variables.activeFeedbackDisplays = [];
    variables.feedbackDisplayedExternally = false;
    variables.lastFeedbackFen = null;
    variables.lastFeedbackResult = null;
    setFeedbackMessage.call(this, profileID, null);
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
        clearFeedback.call(this, profileID);
        this.pV[profileID].activePieceEvalDisplays?.forEach(marking => marking.elem?.remove());
        this.pV[profileID].activePieceEvalDisplays = [];
    });
}

export default async function renderFeedback(gameStateObj, specificProfileName) {
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
    const targets = profiles.filter(profile => !specificProfileName || profile.name === specificProfileName);

    await Promise.all(targets.map(async profileObj => {
        const profileID = profileObj.name;
        const variables = this.pV[profileID];
        if(!variables) return;
        const request = (variables.feedbackRequest || 0) + 1;
        variables.feedbackRequest = request;
        this.MoveEval?.cancelStaleRequests();
        const isCurrentRequest = () => isCurrentPosition() && this.pV[profileID] === variables
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

            // turn is the NEXT player, not the piece that just moved. Never
            // rewrite the opponent's turn: the pre-move FEN already has it right.
            const movedColor = previousFen?.split(' ')[1];
            const isPlayerMove = movedColor === playerColor;
            const enabled = movedColor ? isPlayerMove ? enablePlayerFeedback : enableEnemyFeedback
                : enablePlayerFeedback || enableEnemyFeedback;
            const variant = variables.chessVariant || this.activeVariant;
            if(!enabled) {
                clearFeedback.call(this, profileID);
                return;
            }
            if(!previousFen || !['w', 'b'].includes(movedColor)) {
                clearFeedback.call(this, profileID);
                setFeedbackMessage.call(this, profileID, text('waiting', 'Waiting for a recorded move.'));
                return;
            }
            clearFeedback.call(this, profileID);
            setFeedbackMessage.call(this, profileID, text('analyzing', 'Analyzing {move}…', {
                move: [reportedChanges?.from, reportedChanges?.to].filter(Boolean).join(' → ')
            }));
            if(!this.MoveEval) this.MoveEval = new MoveEvaluator();
            const analysisConfig = { chessVariant: variant, useChess960: useChess960 || variables.useChess960,
                isCurrent: isCurrentRequest };
            const transition = await this.MoveEval.resolveMove(previousFen, currentFen,
                [reportedChanges?.from, reportedChanges?.to, reportedChanges?.promotionPiece], analysisConfig);
            if(!isCurrentRequest()) return;
            if(!transition) {
                clearFeedback.call(this, profileID);
                setFeedbackMessage.call(this, profileID, text('mismatch', 'Move history mismatch or unsupported variant.'));
                return;
            }
            const changes = transition.selected;
            const promotion = changes.promotion || '';

            clearFeedback.call(this, profileID);
            setFeedbackMessage.call(this, profileID, text('analyzing', 'Analyzing {move}…', { move: changes.san }));
            const result = await this.MoveEval.eval([changes.from, changes.to, promotion], {
                ...analysisConfig, fen: previousFen, postFen: currentFen, depth: feedbackEngineDepth || 15, transition
            });
            if(!isCurrentRequest()) return;
            if(!result) {
                clearFeedback.call(this, profileID);
                setFeedbackMessage.call(this, profileID, text('unavailable', 'Evaluation unavailable.'));
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
                clearFeedback.call(this, profileID);
                return;
            }

            clearFeedback.call(this, profileID, !feedbackOnExternalSite);
            if(!Number.isInteger(result.category)) return;
            const emoji = result.emoji || '😐';
            const { summary, description } = feedbackDisplay(result);
            setFeedbackMessage.call(this, profileID, summary, description);
            variables.lastFeedbackFen = currentFen;
            variables.lastFeedbackResult = result;
            if(!this.BoardDrawer) return;
            const shapeType = 'text';
            const shapeSquare = changes.to;
            const shapeConfig = { size: 1.7, text: emoji, style: 'opacity: 1;', position: [0.65, 0.65] };
            const elem = this.BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig);
            if(!elem) return;
            elem.setAttribute('aria-label', description);
            // Keep accessible metadata on the emoji; the explanation is also
            // visible below the board because overlays ignore pointer events.
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = description;
            elem.appendChild(title);
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
            if(isCurrentRequest()) {
                clearFeedback.call(this, profileID);
                setFeedbackMessage.call(this, profileID, text('unavailable', 'Evaluation unavailable.'));
            }
            console.warn('[Feedback] Could not display rating:', profileID, error);
        }
    }));
}