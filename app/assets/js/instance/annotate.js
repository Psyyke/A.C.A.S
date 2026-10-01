import MoveEvaluator from '../MoveEvaluator.js';

// Completed positions only; no streaming-depth chatter or takeback announcements.
export async function annotateOpponentMove(state, previousFen) {
    const fen = state?.fen?.full;
    const firstUpdate = !this.annotationFen;
    if(!fen || this.annotationFen === fen) return;
    this.annotationFen = fen;
    if(firstUpdate || !previousFen || previousFen === fen) return;
    const history = this.gameStateHistory || [];
    const recordedPrevious = [...history].reverse().find(item => item.fen?.full && item.fen.full !== fen)?.fen.full;
    if(recordedPrevious !== previousFen) return;
    const previousTurn = previousFen.split(' ')[1];
    if(previousTurn === fen.split(' ')[1]) return;
    const profiles = (await GET_PROFILES(this.instanceID)).filter(Boolean);
    for(const profile of profiles) {
        const variables = this.pV[profile.name];
        const isCurrent = () => !this.instanceClosed && this.currentFen === fen
            && this.annotationFen === fen && this.pV[profile.name] === variables;
        if(!variables || !isCurrent()) continue;
        const enabled = await this.getConfigValue(this.configKeys.ttsAnnounceEnemyMoves, profile.name);
        if(!enabled || !isCurrent() || CONCEAL_ASSISTANCE_ACTIVE) continue;
        if(previousTurn === await this.getPlayerColor() || !isCurrent()) continue;
        if(!this.MoveEval) this.MoveEval = new MoveEvaluator();
        const move = await this.MoveEval.resolveMove(previousFen, fen,
            [state.boardChanges?.from, state.boardChanges?.to, state.boardChanges?.promotionPiece],
            { chessVariant: variables.chessVariant || this.activeVariant, useChess960: variables.useChess960, isCurrent });
        if(!move || !isCurrent()) continue;
        await this.speak(move.selected.notationMove, profile.name, 'ttsAnnounceEnemyMoves', {
            isCurrent, opponent: true, useSan: true, announcementKey: `opponent|${fen}`
        });
    }
}

export async function annotateEvaluation(evaluation, fen, profile) {
    const variables = this.pV[profile];
    if(!variables || !Number.isFinite(evaluation) || this.currentFen !== fen) return;
    // History includes the initial position: six states mean five played moves.
    // Use the recorded history, not a variant-specific starting FEN or move clock.
    const hasEnoughHistory = () => (this.gameStateHistory?.length || 0) >= 6;
    const enabled = await this.getConfigValue(this.configKeys.ttsAnnounceEvaluation, profile);
    if(this.pV[profile] !== variables || this.currentFen !== fen || this.instanceClosed) return;
    if(!enabled || CONCEAL_ASSISTANCE_ACTIVE || !hasEnoughHistory()) {
        delete variables.spokenAdvantage;
        delete variables.spokenEvaluationFen;
        return;
    }
    if(variables.spokenEvaluationFen === fen) return;
    variables.spokenEvaluationFen = fen;
    const boundaries = [-500, -250, -80, 80, 250, 500];
    const band = boundaries.filter(boundary => evaluation >= boundary).length;
    const previous = variables.spokenAdvantage;
    if(previous === band) return;
    if(previous !== undefined && band > previous && evaluation < boundaries[band - 1] + 35) return;
    if(previous !== undefined && band < previous && evaluation > boundaries[band] - 35) return;
    variables.spokenAdvantage = band;
    await this.speak({ advantageBand: band }, profile, 'ttsAnnounceEvaluation', {
        isCurrent: () => this.currentFen === fen && this.pV[profile] === variables && hasEnoughHistory(),
        announcementKey: `advantage|${fen}`
    });
}