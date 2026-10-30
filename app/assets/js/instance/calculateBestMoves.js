import { setProfileBubbleStatus } from '../gui/profiles.js';
import { updatePipData, updatePipHints } from '../gui/pip.js';
import { incrementUserUsageStat } from '../gui/stats.js';
import { setDynamicSettingsContext } from '../gui/dynamicSettings.js';
import { Chess } from '../../engines/libraries/chessjs/chess.js';

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
        const isPlayerTurn = await this.isPlayerTurn(profileName);
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

        if(!learning) this.Interface.removeMarkings(profileName, 'Calculating best moves');

        let reversedFen = null;
        let specificMoves = '';

        if(!learning && alwaysMyTurn && profileFen.split(' ')[1] !== playerColor) profileFen = REVERSE_FEN_TURN(profileFen);
        if(!learning && alwaysMyTurn && reverseSide && !specificMovesObj) reversedFen = REVERSE_FEN_TURN(profileFen);

        if(specificMovesObj?.isOpponent) reversedFen = REVERSE_FEN_TURN(profileFen);

        calculation.analyzedFen = reversedFen || profileFen;
        calculation.analyzedColor = calculation.analyzedFen.split(' ')[1];
        calculation.annotationEligible = calculation.analyzedFen === currentFen && !specificMovesObj?.moves?.length;
        calculation.chessVariant = variant;
        calculation.useChess960 = profileVariables.useChess960;

        if(specificMovesObj?.moves)
            specificMoves = ' searchmoves ' + specificMovesObj.moves.join(' ');

        // Cap otherwise unlimited searches: the app needs a final bestmove.
        // Fusion accepts the same limits and searchmoves as the other UCI engines.
        const depth = profileVariables.searchDepth || 100;
        const nodes = profileVariables.engineNodes;
        let searchCommandStr;

        if(nodes > 0) {
            searchCommandStr = `go nodes ${nodes}${specificMoves}`;
            updatePipData({ goalNodes: nodes, goalDepth: null }, this, profileName);
        } else {
            searchCommandStr = `go depth ${depth}${specificMoves}`;
            updatePipData({ goalDepth: depth, goalNodes: null }, this, profileName);
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

        updatePipData({ startTime: Date.now(), movetime, depth: 0, nodes: 0, calculationTimeElapsed: 0, calculationFinished: false }, this, profileName);

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