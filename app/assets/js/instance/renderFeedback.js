import MoveEvaluator from '../MoveEvaluator.js';

export default async function renderFeedback(currentFen) {
    const profiles = await getProfiles();

    const display = async (from, to, cp, category, label, profileName) => {
        clearFeedback(profileName);

        const feedbackOnExternalSite = await this.getConfigValue(this.configKeys.feedbackOnExternalSite, profileName);

        const addedFeedbacks = [];
        const BoardDrawer = this.BoardDrawer;

        function addText(squareFen, size, text, style, position) {
            const shapeType = 'text';
            const shapeSquare = squareFen;
            const shapeConfig = { size, text, style, position };

            const textElem = BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig);

            addedFeedbacks.push({ 'elem': textElem, 'data': { shapeType, shapeSquare, shapeConfig }});
        }

        if(typeof category === 'number') {
            // ['Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic', 'Good Move', 'Excellent', 'Brilliancy'];
            const emoji = ['🙂', '🤨', '😟', '😨', '💀', '😊', '😁', '🤩']?.[category] || '😐';

            addText(to, 1.7, emoji, `opacity: 1;`, [0.8, 0.8]);
        }

        this.pV[profileName].activeFeedbackDisplays.push(...addedFeedbacks);

        if(feedbackOnExternalSite) {
            // Create a copy without modifying the original array
            const feedbacksWithoutElem = addedFeedbacks.map(x => ({ ...x, elem: null }));

            this.CommLink.commands.feedbackToSite(feedbacksWithoutElem);
        }
    }

    const clearFeedback = profileName => {
        if(!profileName) return;

        // Remove all previous metrics
        const previousFeedbacks = this.pV[profileName].activeFeedbackDisplays;

        if(previousFeedbacks.length) {
            previousFeedbacks.forEach(x => {
                if(x.elem) x.elem.remove();
            });

            this.pV[profileName].activeFeedbackDisplays = [];
        }
    }

    // Remove any existing feedback
    profiles.filter(p => !p.config.enableMoveRatings || !p.config.enableEnemyFeedback).forEach(profileObj => {
        clearFeedback(profileObj?.name);
    });

    // Display new feedback
    for(const profileObj of profiles.filter(p => p.config.enableMoveRatings || p.config.enableEnemyFeedback)) {
        const profileName = profileObj.name;
        const lastFen = this.pV[profileName].lastFen;
        const feedbackEngineDepth = await this.getConfigValue(this.configKeys.feedbackEngineDepth, profileName);
        const enablePlayerFeedback = await this.getConfigValue(this.configKeys.enableMoveRatings, profileName);
        const enableEnemyFeedback = await this.getConfigValue(this.configKeys.enableEnemyFeedback, profileName);
        const isChangeLogical = this.isFenChangeLogical(lastFen, currentFen);

        const playerColor = await this.getPlayerColor();

        if(isChangeLogical && lastFen && currentFen) {
            const moveObj = extractMoveFromBoardFen(lastFen, currentFen);
            const from = moveObj.from,
                    to = moveObj.to,
                    pieceColor = moveObj.color;
            const isPlayerPiece = playerColor === pieceColor;
            const shouldReturnPlayerFeedbackDisabled = isPlayerPiece && !enablePlayerFeedback && enableEnemyFeedback;
            const shouldReturnEnemyFeedbackDisabled = !isPlayerPiece && enablePlayerFeedback && !enableEnemyFeedback;
            const shouldReverseFen = !isPlayerPiece && enableEnemyFeedback;

            let fromFen = lastFen;
            
            if(shouldReturnPlayerFeedbackDisabled || shouldReturnEnemyFeedbackDisabled) return;
            if(shouldReverseFen) fromFen = reverseFenPlayer(fromFen);
            if(!this.MoveEval) this.MoveEval = new MoveEvaluator();

            this.MoveEval.eval([from, to], { 'fen' : fromFen, 'depth': feedbackEngineDepth }, resultObj => {
                const category = resultObj.category;
                const cp = resultObj.cp;
                const label = this.MoveEval.resultLabels[category];

                display(from, to, cp, category, label, profileName);
            });
        }
    }
}