import MoveEvaluator from '../MoveEvaluator.js';

export default async function renderFeedback(gameStateObj) {
    const currentFen = gameStateObj.fen.full;
    const profiles = await GET_PROFILES();

    const display = async (from, to, cp, category, label, profileID) => {
        clearFeedback(profileID);

        const feedbackOnExternalSite = await this.getConfigValue(this.configKeys.feedbackOnExternalSite, profileID);

        const addedFeedbacks = [];
        const BoardDrawer = this.BoardDrawer;

        function addText(squareFen, size, text, style, position) {
            const shapeType = 'text';
            const shapeSquare = squareFen;
            const shapeConfig = { size, text, style, position };

            const textElem = BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig);

            addedFeedbacks.push(CREATE_BOARD_DRAWER_MOVE_OBJ(textElem, {
                shapeType, shapeSquare, shapeConfig
            }, profileID, 'feedback'));
        }

        if(typeof category === 'number') {
            // ['Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic', 'Good Move', 'Excellent', 'Brilliancy'];
            const emoji = ['🙂', '🤨', '😟', '😨', '💀', '😊', '😁', '🤩']?.[category] || '😐';

            addText(to, 1.7, emoji, `opacity: 1;`, [0.8, 0.8]);
        }

        if(!this.pV[profileID]) return;

        this.pV[profileID].activeFeedbackDisplays.push(...addedFeedbacks);

        if(feedbackOnExternalSite) {
            this.CommLink.commands.renderVisualsToSite(FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE(addedFeedbacks));
        }
    }

    const clearFeedback = profileID => {
        if(!profileID) return;
        if(!this.pV[profileID]) return;

        // Remove all previous metrics
        const previousFeedbacks = this.pV[profileID].activeFeedbackDisplays;

        if(previousFeedbacks.length) {
            previousFeedbacks.forEach(x => {
                if(x.elem) x.elem.remove();
            });

            this.pV[profileID].activeFeedbackDisplays = [];
        }
    }

    // Remove any existing feedback
    profiles.filter(p => !p.config.enableMoveRatings || !p.config.enableEnemyFeedback).forEach(profileObj => {
        clearFeedback(profileObj?.name);
    });

    // Display new feedback
    for(const profileObj of profiles.filter(p => p.config.enableMoveRatings || p.config.enableEnemyFeedback)) {
        const profileID = profileObj.name;

        // GET_PROFILES() returns every configured profile, but pV only holds the ones
        // whose engine actually loaded. A profile with the engine off and move ratings
        // on used to throw here and kill feedback for every other profile too.
        if(!this.pV[profileID]) continue;

        const lastFen = this.pV[profileID].lastFen;
        const feedbackEngineDepth = await this.getConfigValue(this.configKeys.feedbackEngineDepth, profileID);
        const enablePlayerFeedback = await this.getConfigValue(this.configKeys.enableMoveRatings, profileID);
        const enableEnemyFeedback = await this.getConfigValue(this.configKeys.enableEnemyFeedback, profileID);
        const isChangeLogical = this.isFenChangeLogical(lastFen, currentFen);

        const playerColor = await this.getPlayerColor();

        if(isChangeLogical && lastFen && currentFen) {
            const from = gameStateObj.boardChanges.from,
                  to = gameStateObj.boardChanges.to,
                  pieceColor = gameStateObj.turn;

            const isPlayerPiece = playerColor === pieceColor;
            const shouldReturnPlayerFeedbackDisabled = isPlayerPiece && !enablePlayerFeedback && enableEnemyFeedback;
            const shouldReturnEnemyFeedbackDisabled = !isPlayerPiece && enablePlayerFeedback && !enableEnemyFeedback;
            const shouldReverseFen = !isPlayerPiece && enableEnemyFeedback;

            let fromFen = lastFen;
            
            if(shouldReturnPlayerFeedbackDisabled || shouldReturnEnemyFeedbackDisabled) continue;
            if(shouldReverseFen) fromFen = REVERSE_FEN_TURN(fromFen);
            if(!this.MoveEval) this.MoveEval = new MoveEvaluator();

            this.MoveEval.eval([from, to], { 'fen' : fromFen, 'depth': feedbackEngineDepth }, resultObj => {
                const category = resultObj.category;
                const cp = resultObj.cp;
                const label = this.MoveEval.resultLabels[category];

                display(from, to, cp, category, label, profileID);
            });
        }
    }
}