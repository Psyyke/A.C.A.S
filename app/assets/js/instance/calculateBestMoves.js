import { setProfileBubbleStatus } from '../gui/profiles.js';
import { updatePipData } from '../gui/pip.js';
import { incrementUserUsageStat } from '../gui/stats.js';
import { setDynamicSettingsContext } from '../gui/dynamicSettings.js';

// This function is called every time a seemingly valid new board position is detected on the chess site DOM.
// The userscript tries to filter out as many weird position changes as possible, but sometimes it can miss some.
// For example when a move is played and the opponent's piece disappears from the board before the player's piece appears on the board,
// it can look like a legal position change (1 piece disappeared, 1 piece appeared) but it is not. Wrong fens like this might break A.C.A.S.
export default async function calculateBestMoves(currentFen, config = {}) {
    if(!currentFen || this.instanceClosed) return;

    setDynamicSettingsContext(this.instanceID, currentFen);
    await this.syncDynamicSettings();
    const profiles = await GET_PROFILES(this.instanceID);
    let { skipValidityChecks, specificMovesObj, specificProfileName } = config;

    const shouldCalculate = p => p.config.engineEnabled
        && (specificProfileName ? p.name === specificProfileName : true)
        && ((!p.config.movesOnDemand && !specificMovesObj) || (specificMovesObj && p.config.movesOnDemand));

    if(specificMovesObj) skipValidityChecks = true;

    await Promise.all(profiles.filter(p => shouldCalculate(p)).map(async profile => {
        // Side-to-move rewriting must not leak into another profile's calculation.
        let profileFen = currentFen;
        const profileName = profile.name;
        const profileVariables = this.pV[profileName];
        const isCurrentCalculation = () => !this.instanceClosed && this.pV[profileName] === profileVariables
            && (!this.currentFen || this.currentFen === currentFen);
        const queueLatestCalculation = () => {
            const active = profileVariables.pendingCalculations.find(x => !x.finished);
            // Duplicate notifications for one position must not continuously restart its search.
            if(active?.fen === currentFen && !active.stopRequested && !skipValidityChecks && !specificMovesObj) return;
            profileVariables.pendingCalculationRequest = { fen: currentFen, config: { ...config, specificProfileName: profileName } };
            if(profileVariables.useExternalChessEngine)
                this.engineStopCalculating(profileName, 'Superseded by a newer calculation request');
        };
        if(!profileVariables || !isCurrentCalculation()) return;
        if(profileVariables.recoveringSearch) {
            profileVariables.pendingCalculationRequest = { fen: currentFen, config: { ...config, specificProfileName: profileName } };
            return;
        }
        if(!profileVariables.engineSettingsReady) return;

        const onlyCalculateOwnTurn = await this.getConfigValue(this.configKeys.onlyCalculateOwnTurn, profileName);
        const isPlayerTurn = await this.isPlayerTurn(profileName);
        if(!isCurrentCalculation()) return;

        // Do not calculate on enemy turn if the user has enabled "only calculate own turn"
        if(onlyCalculateOwnTurn && !isPlayerTurn && !specificMovesObj && !skipValidityChecks) return;
        // Do not calculate if pawn is on promotion square, it's "not a legal position" and engines can get stuck on it
        if(this.isPawnOnPromotionSquare(currentFen)) return;
        // Engine is still calculating, do not start any new calculation since,
        // that will not give us 'bestmove' which A.C.A.S' logic EXPECTS.
        // The best moves will be calculated after we get the 'bestmove'.
        if(this.isEngineCalculating(profileName)) {
            queueLatestCalculation();
            return;
        }

        const playerColor = await this.getPlayerColor();
        const reverseSide = await this.getConfigValue(this.configKeys.reverseSide, profileName);
        const alwaysMyTurn = await this.getConfigValue(this.configKeys.alwaysMyTurn, profileName);

        const isAttackingPlayerColor = reverseSide
            ? playerColor.toLowerCase() === 'w' ? 'b' : 'w'
            : playerColor;

        if(!isCurrentCalculation()) return;
        const variant = profileVariables.chessVariant;
        const isCustomVariant = variant && variant !== 'chess';

        // Don't continue if player is attacking king and the variant is 'chess' (not custom)
        // Otherwise some engines crash! Some variants have such situations legally though.
        if(!isCustomVariant && IS_PLAYER_ATTACKING_KING(currentFen, isAttackingPlayerColor))
            return;

        const engineName = await this.getEngineName(profileName);
        const movetime = await this.getConfigValue(this.configKeys.maxMovetime, profileName);
        // Parallel FEN updates can pass the earlier busy check while awaiting settings.
        if(!isCurrentCalculation() || !profileVariables.engineSettingsReady) return;
        if(this.isEngineCalculating(profileName)) {
            queueLatestCalculation();
            return;
        }

        profileVariables.lastCalculatedFen = currentFen;
        profileVariables.lastFen = currentFen;
        delete profileVariables.pendingCalculationRequest;
        const calculation = { fen: currentFen, startedAt: Date.now(), finished: false, goSent: false };
        profileVariables.pendingCalculations = profileVariables.pendingCalculations.filter(x => !x.finished);
        profileVariables.pendingCalculations.push(calculation);

        this.Interface.removeMarkings(profileName, 'Calculating best moves');

        let reversedFen = null;
        let specificMoves = '';

        if(alwaysMyTurn && profileFen.split(' ')[1] !== playerColor) profileFen = REVERSE_FEN_TURN(profileFen);
        if(alwaysMyTurn && reverseSide && !specificMovesObj) reversedFen = REVERSE_FEN_TURN(profileFen);

        if(specificMovesObj?.isOpponent) reversedFen = REVERSE_FEN_TURN(profileFen);

        calculation.analyzedFen = reversedFen || profileFen;
        calculation.analyzedColor = calculation.analyzedFen.split(' ')[1];
        calculation.annotationEligible = calculation.analyzedFen === currentFen && !specificMovesObj?.moves?.length;
        calculation.chessVariant = variant;
        calculation.useChess960 = profileVariables.useChess960;

        if(specificMovesObj?.moves)
            specificMoves = ' searchmoves ' + specificMovesObj.moves.join(' ');

        // Should not actually go infinite depth, read commenting below.
        // This is just a backup. It's not terrible to go infinite depth but problematic.
        let searchCommandStr = 'go infinite' + specificMoves;

        switch(engineName) {
            case 'acas-fusion':
                const calcDepth = this.pV[profileName].searchDepth || 100;

                console.error('This engine is not supported at the moment');
                
                //const historyString = GENERATE_HISTORY_STR(this.gameStateHistory.slice(0, -1));
                //searchCommandStr = `go depth ${calcDepth}${specificMoves} history ${historyString}`;
                //updatePipData({ 'goalDepth': calcDepth });
                
                break;

            default:
                // The search is "infinite" if the searchDepth is null. The engine's max depth seems to be 245 on 'go infinite',
                // but if it reaches that max depth on 'go infinite' it does not give 'bestmove'. A.C.A.S expects a bestmove, so that is no good.
                // That is why we limit the infinite search depth ourselves.
                const depth = this.pV[profileName].searchDepth || 100;
                const nodes = this.pV[profileName].engineNodes;

                if(nodes > 0) {
                    searchCommandStr = `go nodes ${nodes}${specificMoves}`;
                    updatePipData({ 'goalNodes': nodes });
                } else {
                    searchCommandStr = `go depth ${depth}${specificMoves}`;
                    updatePipData({ 'goalDepth': depth });
                }

                break;
        }

        const abandonCalculation = (retryLatest = true) => {
            calculation.finished = true;
            if(this.pV[profileName] !== profileVariables) return;
            clearTimeout(profileVariables.currentStopTimeout);
            const request = profileVariables.pendingCalculationRequest;
            delete profileVariables.pendingCalculationRequest;
            if(retryLatest && !this.instanceClosed && (request || this.currentFen !== currentFen)) {
                this.calculateBestMoves(this.currentFen, request?.fen === this.currentFen
                    ? request.config : { specificProfileName: profileName }).catch(console.error);
            }
        };

        try {
            if(await this.sendMsgToEngine(`position fen ${reversedFen || profileFen}`, profileName, false,
                () => isCurrentCalculation() && !calculation.stopRequested) === false) {
                abandonCalculation(!isCurrentCalculation() || calculation.stopRequested);
                return;
            }
            if(!isCurrentCalculation() || calculation.stopRequested) {
                abandonCalculation();
                return;
            }
            if(await this.sendMsgToEngine(searchCommandStr, profileName, false,
                () => isCurrentCalculation() && !calculation.stopRequested) === false) {
                abandonCalculation(!isCurrentCalculation() || calculation.stopRequested);
                return;
            }
            calculation.goSent = true;
            if(profileVariables.useExternalChessEngine && this.pV[profileName] === profileVariables
                && !calculation.finished && (calculation.stopRequested || !isCurrentCalculation())) {
                calculation.stopRequested = false;
                this.engineStopCalculating(profileName, 'Position changed while go was being sent');
            }
        } catch(error) {
            abandonCalculation(false);
            console.error('Could not start engine calculation:', error);
            return;
        }
        incrementUserUsageStat('engineCalculations');
        if(!isCurrentCalculation() || calculation.finished || calculation.stopRequested) return;

        updatePipData({ 'startTime': Date.now(), movetime });

        const statusText = `Calculating best moves with UCI command: ${searchCommandStr}\n`
            + `Max movetime: ${movetime || 'None'}`;
        setProfileBubbleStatus('calculating', profileName, statusText);

        if(typeof movetime === 'number' && movetime !== 0) {
            const startFen = this.currentFen;

            profileVariables.currentMovetimeTimeout = setTimeout(() => {
                if(!isCurrentCalculation() || calculation.finished) return;
                const isFenStillSame = startFen === this.currentFen;
                const noStartFenOrFenSame = !startFen || isFenStillSame;
                const isEngineCalculating = this.isEngineCalculating(profileName);

                if(noStartFenOrFenSame && isEngineCalculating)
                    this.engineStopCalculating(profileName, 'Max movetime!');
                
            }, movetime + 1);
        }
    }));
}