import { setProfileBubbleStatus } from '../gui/profiles.js';
import { updatePipData, updatePipHints } from '../gui/pip.js';
import { incrementUserUsageStat } from '../gui/stats.js';
import { setDynamicSettingsContext } from '../gui/dynamicSettings.js';
import { Chess } from '../../engines/libraries/chessjs/chess.js';
import { enginePosition } from './enginePosition.js';
import { searchCommand } from './searchCommand.js';

function getTerminalOutcome(fen, playerColor) {
    if(!['w', 'b'].includes(playerColor)) return null;

    const position = fen.split(' ')[0];
    if(position.match(/K/g)?.length !== 1 || position.match(/k/g)?.length !== 1) return null;

    try {
        const board = new Chess();
        if(!board.load(fen)) return null;

        if(board.in_checkmate()) return board.turn() === playerColor ? 'losing' : 'winning';
        return board.in_stalemate() ? 'draw' : null;
    } catch(error) {
        // Incomplete DOM positions must not interrupt the next engine search.
        return null;
    }
}

// This function is called every time a seemingly valid new board position is detected on the chess site DOM.
// The userscript tries to filter out as many weird position changes as possible, but sometimes it can miss some.
// For example when a move is played and the opponent's piece disappears from the board before the player's piece appears on the board,
// it can look like a legal position change (1 piece disappeared, 1 piece appeared) but it is not. Wrong fens like this might break A.C.A.S.
export default async function calculateBestMoves(currentFen, config = {}) {
    if(!currentFen || this.instanceClosed) return;

    const playerColor = await this.getPlayerColor();
    if(this.instanceClosed || (this.currentFen && this.currentFen !== currentFen)) return;

    setDynamicSettingsContext(this.instanceID, currentFen, { playerColor });
    await this.syncDynamicSettings();
    const profiles = await GET_PROFILES(this.instanceID);
    await this.suggestionMix?.configure();
    if(this.instanceClosed || (this.currentFen && this.currentFen !== currentFen)) return;
    const mixState = this.suggestionMix?.begin(currentFen);
    this.CommLink.expectProfiles?.(currentFen, profiles.filter(profile =>
        profile.config.engineEnabled && !profile.config.learningMode && !profile.config.movesOnDemand));
    let { skipValidityChecks, specificMovesObj, specificProfileName } = config;

    const shouldCalculate = p => p.config.engineEnabled
        && (specificProfileName ? p.name === specificProfileName : true)
        && !(p.config.learningMode && specificMovesObj)
        && (p.config.learningMode || (!p.config.movesOnDemand && !specificMovesObj) || (specificMovesObj && p.config.movesOnDemand));

    if(specificMovesObj) skipValidityChecks = true;

    await Promise.all(profiles.filter(p => shouldCalculate(p)).map(async profile => {
        // Side-to-move rewriting must not leak into another profile's calculation.
        let profileFen = currentFen;
        const profileName = profile.name;
        const profileVariables = this.pV[profileName];
        const learning = Boolean(profile.config.learningMode);
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
        if(!profileVariables.engineSettingsReady) {
            if(profileVariables.useExternalChessEngine && profileVariables.externalRestartPending) {
                profileVariables.externalRestartPending = false;
                profileVariables.externalRecoveryCancelled = false;
                profileVariables.externalCrashRecoveryAttempts = 0;
                profileVariables.externalSearchRecoveryAttempts = 0;
                profileVariables.pendingCalculationRequest = { fen: currentFen, config: { ...config, specificProfileName: profileName } };
                await this.recoverExternalEngineSearch(profileName, null, null, true);
            }
            return;
        }

        const variant = FORMAT_VARIANT(profileVariables.chessVariant) || 'chess';
        const supportsVariant = profileVariables.chessVariants.some(value => FORMAT_VARIANT(value) === variant);
        const dimensions = GET_BOARD_DIMENSIONS_FROM_FEN(currentFen);
        const hasChessDimensions = dimensions[0] === 8 && dimensions[1] === 8;
        // The GUI warning alone is not enough: sending a variant FEN can crash Stockfish.
        if(!supportsVariant || variant === 'chess' && !hasChessDimensions) {
            const message = TRANS_OBJ?.variantNotSupported ?? 'Variant not supported';
            setProfileBubbleStatus('warning', profileName, `${message}: ${variant} (${dimensions[0]}×${dimensions[1]})`);
            return;
        }

        const reverseSide = await this.getConfigValue(this.configKeys.reverseSide, profileName);
        const isAttackingPlayerColor = reverseSide
            ? playerColor.toLowerCase() === 'w' ? 'b' : 'w'
            : playerColor;

        if(!isCurrentCalculation()) return;

        // A winning checkmate leaves the opponent to move. Detect the real result
        // before own-turn filters, king-attack guards or hypothetical turn rewrites.
        if(!learning && !specificMovesObj && variant === 'chess' && !profileVariables.useChess960) {
            const terminalOutcome = getTerminalOutcome(currentFen, isAttackingPlayerColor);

            if(terminalOutcome) {
                updatePipHints(this, profileName, { moveObjects: [], terminalOutcome });
                setProfileBubbleStatus('idle', profileName, 'Idle, game has ended.');
                return;
            }
        }

        const onlyCalculateOwnTurn = await this.getConfigValue(this.configKeys.onlyCalculateOwnTurn, profileName);
        // Turn and pieces must come from the same snapshot, not a newer incoming packet.
        const isPlayerTurn = currentFen.split(' ')[1] === isAttackingPlayerColor;
        if(!isCurrentCalculation()) return;

        // Do not calculate on enemy turn if the user has enabled "only calculate own turn"
        if(!learning && onlyCalculateOwnTurn && !isPlayerTurn && !specificMovesObj && !skipValidityChecks) return;
        // Do not calculate if pawn is on promotion square, it's "not a legal position" and engines can get stuck on it
        if(this.isPawnOnPromotionSquare(currentFen)) return;
        // Engine is still calculating, do not start any new calculation since,
        // that will not give us 'bestmove' which A.C.A.S' logic EXPECTS.
        // The best moves will be calculated after we get the 'bestmove'.
        if(this.isEngineCalculating(profileName)) {
            queueLatestCalculation();
            return;
        }

        const alwaysMyTurn = await this.getConfigValue(this.configKeys.alwaysMyTurn, profileName);

        if(!isCurrentCalculation()) return;
        const isCustomVariant = variant && variant !== 'chess';

        // Don't continue if player is attacking king and the variant is 'chess' (not custom)
        // Otherwise some engines crash! Some variants have such situations legally though.
        if(!isCustomVariant && IS_PLAYER_ATTACKING_KING(currentFen, learning ? currentFen.split(' ')[1] : isAttackingPlayerColor))
            return;

        const engineName = await this.getEngineName(profileName);
        const searchMode = profileVariables.usingAdvancedMode
            ? await this.getConfigValue(this.configKeys.advancedSearchMode, profileName) : 'standard';
        const movetime = searchMode === 'movetime' ? 0
            : await this.getConfigValue(this.configKeys.maxMovetime, profileName);
        const engineMovetime = searchMode === 'movetime'
            ? (await this.getConfigValue(this.configKeys.advancedSearchMovetime, profileName)) ?? 5000 : null;
        // Parallel FEN updates can pass the earlier busy check while awaiting settings.
        if(!isCurrentCalculation() || !profileVariables.engineSettingsReady) return;
        if(this.isEngineCalculating(profileName)) {
            queueLatestCalculation();
            return;
        }

        let search;
        try {
            search = searchCommand({
                advanced: profileVariables.usingAdvancedMode, mode: searchMode, movetime: engineMovetime,
                depth: profileVariables.searchDepth, nodes: profileVariables.engineNodes,
                specificMoves: specificMovesObj?.moves ? ' searchmoves ' + specificMovesObj.moves.join(' ') : ''
            });
        } catch(error) {
            console.error('[Engine] Invalid search settings:', error);
            setProfileBubbleStatus('warning', profileName, error.message);
            const failed = { fen: currentFen, finished: true };
            this.CommLink.analysisStarted?.(profileName, failed);
            this.suggestionMix?.started(profileName, failed);
            await this.suggestionMix?.failed(profileName, failed);
            this.CommLink.analysisFailed?.(profileName, failed, error.message);
            return;
        }

        profileVariables.lastCalculatedFen = currentFen;
        profileVariables.lastFen = currentFen;
        delete profileVariables.pendingCalculationRequest;
        const calculation = {
            fen: currentFen, startedAt: Date.now(), finished: false, goSent: false,
            isSearchInfinite: search.infinite || search.goalNodes > 9e6
        };
        profileVariables.pendingCalculations = profileVariables.pendingCalculations.filter(x => !x.finished);
        profileVariables.pendingCalculations.push(calculation);
        this.CommLink.analysisStarted?.(profileName, calculation);
        this.suggestionMix?.started(profileName, calculation);

        if(!learning) this.Interface.removeMarkings(profileName, 'Calculating best moves');

        let reversedFen = null;

        if(!learning && alwaysMyTurn && profileFen.split(' ')[1] !== playerColor) profileFen = REVERSE_FEN_TURN(profileFen);
        if(!learning && alwaysMyTurn && reverseSide && !specificMovesObj) reversedFen = REVERSE_FEN_TURN(profileFen);

        if(specificMovesObj?.isOpponent) reversedFen = REVERSE_FEN_TURN(profileFen);

        calculation.analyzedFen = reversedFen || profileFen;
        calculation.analyzedColor = calculation.analyzedFen.split(' ')[1];
        calculation.annotationEligible = calculation.analyzedFen === currentFen && !specificMovesObj?.moves?.length;
        calculation.chessVariant = variant;
        calculation.useChess960 = profileVariables.useChess960;
        calculation.variantText = profileVariables.variantText;
        calculation.searchMode = searchMode;
        calculation.engineMovetime = search.engineMovetime;
        const searchCommandStr = search.command;
        updatePipData({ goalNodes: search.goalNodes, goalDepth: search.goalDepth }, this, profileName);

        const abandonCalculation = (retryLatest = true) => {
            calculation.finished = true;
            this.suggestionMix?.failed(profileName, calculation).catch(console.error);
            if(!retryLatest) {
                this.CommLink.analysisFailed?.(profileName, calculation, 'engine search could not start');
            }
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
            if(!profileVariables.useExternalChessEngine && ['maia2', 'maia3', 'acas-fusion'].includes(engineName)) {
                // Maia's Elo inputs belong to the side to move, not always us.
                const ownColor = await this.getPlayerColor(profileName);
                const { engineElo, engineEnemyElo } = profileVariables.appliedSettings || {};
                const ownTurn = calculation.analyzedColor === ownColor;
                const commands = [`setoption name ACAS_LearningMode value ${learning}`];

                if(!profileVariables.usingAdvancedMode && Number.isFinite(engineElo) && Number.isFinite(engineEnemyElo)) {
                    commands.push(`setoption name UCI_Elo value ${ownTurn ? engineElo : engineEnemyElo}`,
                        `setoption name Enemy_Elo value ${ownTurn ? engineEnemyElo : engineElo}`);
                }

                for(const command of commands) {
                    if(!isCurrentCalculation() || calculation.stopRequested
                        || await this.sendMsgToEngine(command, profileName, true,
                            () => isCurrentCalculation() && !calculation.stopRequested) === false) {
                        abandonCalculation();
                        return;
                    }
                }
            }

            let positionCommand = `position fen ${calculation.analyzedFen}`;
            if(variant === 'chess' && !profileVariables.useChess960 && calculation.analyzedFen === currentFen) {
                try {
                    positionCommand = enginePosition(currentFen, this.gameStateHistory,
                        profileVariables.useExternalChessEngine ? 262144 : Infinity);
                } catch(error) {
                    console.warn('[Engine] Repetition history unavailable; analyzing current FEN only:', error);
                }
            }
            if(await this.sendMsgToEngine(positionCommand, profileName, false,
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

        const displayMovetime = search.engineMovetime && movetime > 0
            ? Math.min(search.engineMovetime, movetime) : search.engineMovetime || movetime;
        updatePipData({ startTime: Date.now(), movetime: displayMovetime, depth: 0, nodes: 0, calculationTimeElapsed: 0, calculationFinished: false }, this, profileName);

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
    })).finally(async () => {
        if(mixState) await this.suggestionMix.end(mixState);
    });
}