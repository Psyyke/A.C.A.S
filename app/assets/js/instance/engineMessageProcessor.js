import { setProfileBubbleStatus } from '../gui/profiles.js';
import { fillDynamicEngineOptionContainer } from '../gui/dynamicEngineOptions.js';
import { updatePipData } from '../gui/pip.js';
import { setDynamicOptionsReady } from '../gui/dynamicEngineOptions.js';
import { setDynamicSettingsContext } from '../gui/dynamicSettings.js';
import { isActivityLoggingEnabled, logActivity } from '../misc/activityLog.js';
import { evaluationForPlayer } from '../misc/evaluation.js';
import { annotateEvaluation } from './annotate.js';
import { parseVariantMove } from '../misc/variantPosition.js';

export default async function engineMessageProcessor(msg, profile) {
    msg = msg?.trim();
    if(!msg) return;
    const profileObj = this.pV[profile];
    if(isActivityLoggingEnabled()) {
        logActivity(/^(?:info string )?(?:error|failed|failure)\b|\bno such option\b/i.test(msg) ? 'error' : 'engine-output', msg, {
            instanceID: this.instanceID,
            profile,
            ...this.getEngineActivityContext(profile)
        });
    }

    if(!profileObj) {
        if(this.debugLogsEnabled) console.warn('Attempted to process an engine message from a nonexisting engine, uhh, ghosts?');

        return;
    }

    const data = PARSE_UCI_RESPONSE(msg);
    const isBestmove = Object.hasOwn(data, 'bestmove');
    const oldestUnfinishedCalcRequestObj = this.pV[profile].pendingCalculations.find(x => !x.finished);
    if(!isBestmove && msg.startsWith('info ') && oldestUnfinishedCalcRequestObj) oldestUnfinishedCalcRequestObj.lastData = data;
    const isMessageForCurrentFen = Boolean(oldestUnfinishedCalcRequestObj?.fen)
        && oldestUnfinishedCalcRequestObj.fen === this.currentFen;
    // Keep notation tied to the search root, including turn overrides. The PIP
    // can show another instance/profile than the currently selected settings.
    const movePosition = {
        fen: oldestUnfinishedCalcRequestObj?.analyzedFen ?? oldestUnfinishedCalcRequestObj?.fen,
        chessVariant: oldestUnfinishedCalcRequestObj?.chessVariant ?? profileObj.chessVariant ?? this.activeVariant,
        useChess960: oldestUnfinishedCalcRequestObj?.useChess960 ?? profileObj.useChess960
    };
    const calculationTimeElapsed = oldestUnfinishedCalcRequestObj?.startedAt
        ? Date.now() - oldestUnfinishedCalcRequestObj.startedAt
        : 0;
    const isMsgNoSuchOption = msg.includes('No such option') && !msg.includes('Variant') && !msg.includes('UCI_');
    const isMsgFailure = msg.includes('Failed') && !msg.includes('MIME type');
    const isMsgOption = msg.startsWith('option name ');
    if(isMsgOption) {
        if(msg.startsWith('option name UCI_Variant type combo')) {
            const chessVariants = PARSE_UCI_OPTION(msg)?.vars ?? [];
            profileObj.chessVariants = chessVariants;
            this.guiBroadcastChannel.postMessage({ type: 'updateChessVariants', data: chessVariants });
        }
        // Register in wire order, but never block normal bestmove processing behind
        // startup: settings applied on bestmove may themselves request another uciok.
        profileObj.uciOptionRegistrations ??= Promise.resolve();
        profileObj.uciOptionRegistrations = profileObj.uciOptionRegistrations.then(() => {
            if(this.pV[profile] !== profileObj || this.instanceClosed) return;
            return fillDynamicEngineOptionContainer(msg, profile, this.instanceID,
                profileObj.useExternalChessEngine ? profileObj.externalChessEngine : this.getEngineAcasObj(profile)?.type);
        }).catch(console.error);
        await profileObj.uciOptionRegistrations;
        return;
    }

    const finishOldestUnfinishedCalculation = () => {
        // Unsolicited/late bestmove must not finish a different profile's work.
        if(!oldestUnfinishedCalcRequestObj || oldestUnfinishedCalcRequestObj.finished) return;
        if(isBestmove) profileObj.externalSearchRecoveryAttempts = 0;
        oldestUnfinishedCalcRequestObj.finished = true;
        clearTimeout(profileObj.currentMovetimeTimeout);
        clearTimeout(profileObj.currentStopTimeout);

        const request = profileObj.pendingCalculationRequest;
        delete profileObj.pendingCalculationRequest;
        // Compare the full FEN: the same pieces can have a different side to move.
        if(!profileObj.recoveringSearch && (request || oldestUnfinishedCalcRequestObj.fen !== this.currentFen)) {
            this.calculateBestMoves(this.currentFen, request?.fen === this.currentFen
                ? request.config : { specificProfileName: profile }).catch(console.error);
        }
    }

    if(isMsgNoSuchOption) {
        const p = await GET_PROFILE_FOR_INSTANCE(profile, this.instanceID);
        const profileChessEngine = p.config.chessEngine;
        const missingOptionName =  msg.split('No such option:')?.[1]?.trim();

        toast.warning(`"${missingOptionName}" not supported on ${profileChessEngine} (Running on profile "${GET_HUMAN_READABLE_PROFILE_NAME(profile)}")`, 4000);

        return;
    }

    if(isMsgFailure) {
        finishOldestUnfinishedCalculation();

        const p = await GET_PROFILE_FOR_INSTANCE(profile, this.instanceID);
        const profileChessEngine = p.config.chessEngine;

        toast.warning(`"${msg}" ("${profileChessEngine}" running on profile "${GET_HUMAN_READABLE_PROFILE_NAME(profile)}")`, 4e4);

        return;
    }

    if(!data?.currmovenumber && this.logEngineMessages) console.warn(`${profile} ->`, msg, `\n(Message is for FEN -> ${oldestUnfinishedCalcRequestObj?.fen})`);

    if(msg.includes('info')) {
        if(data?.multipv == null || data.multipv === 1) {
            if(data?.depth) {
                const depthText = TRANS_OBJ?.calculationDepth ?? 'Depth';
                const winningText = TRANS_OBJ?.winning ?? 'Winning';
                const losingText = TRANS_OBJ?.losing ?? 'Losing';

                if(data?.mate) {
                    const isWinning = data.mate > 0;
                    const mateText = `${isWinning ? winningText : losingText} ${Math.abs(data.mate)}`;

                    this.Interface.updateMoveProgress(`${mateText} | ${depthText} ${data.depth}`, isWinning ? 1 : 2);
                } else {
                    this.Interface.updateMoveProgress(`${depthText} ${data.depth}`, 0);
                }

                updatePipData({ 'depth': data?.depth, 'mate': data?.mate });
            }

            if((data?.cp != null || data?.mate != null) && isMessageForCurrentFen) {
                const fen = this.currentFen;
                const mate = data.mate != null;
                const score = mate ? data.mate : data.cp;
                // Capture synchronously: a fast worker can deliver bestmove while color lookup is pending.
                const primaryScore = { score, mate };
                oldestUnfinishedCalcRequestObj.primaryScore = primaryScore;
                if(!/\b(?:lowerbound|upperbound)\b/.test(msg) && oldestUnfinishedCalcRequestObj.annotationEligible) {
                    oldestUnfinishedCalcRequestObj.annotationScore = primaryScore;
                }
                const analyzedColor = oldestUnfinishedCalcRequestObj?.analyzedColor
                    ?? oldestUnfinishedCalcRequestObj?.fen?.split(' ')[1];
                const evaluation = evaluationForPlayer(score, mate, analyzedColor, await this.getPlayerColor());
                if(this.pV[profile] !== profileObj || this.currentFen !== fen
                    || oldestUnfinishedCalcRequestObj.primaryScore !== primaryScore) return;
                if(evaluation && oldestUnfinishedCalcRequestObj) {
                    oldestUnfinishedCalcRequestObj.primaryEvaluation = evaluation.playerEvaluation;
                    await this.Interface.updateEval(score, mate, profile, analyzedColor);
                }
            }
        }
    }

    if(data?.wdl) {
        const [winChance, drawChance, lossChance] = data?.wdl ?? [];

        updatePipData({ winChance, drawChance, lossChance });
    }

    if(data?.pv && isMessageForCurrentFen) {
        const ranking = VAR_TO_CORRECT_TYPE(data?.multipv) || 1;

        let moves = data.pv.trim().split(/\s+/).map(parseVariantMove);
        if(!moves[0]) return;

        if(moves?.length === 1) // if no opponent move guesses yet
            moves = [...moves, null];

        const cp = data?.cp;
        const [playerMove, opponentMove] = moves;
        const moveObj = CREATE_MOVE_OBJ({
            playerMove,
            opponentMove,
            cp,
            profile,
            ranking
        });
        Object.assign(moveObj, movePosition, { playerUci: playerMove.uci });

        this.pV[profile].pastMoveObjects.push(moveObj);

        const isMovetimeLimited = await this.getConfigValue(this.configKeys.maxMovetime, profile) ? true : false;
        const onlyShowTopMoves = await this.getConfigValue(this.configKeys.onlyShowTopMoves, profile);
        const movesOnDemand = await this.getConfigValue(this.configKeys.movesOnDemand, profile);
        const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);
        const markingLimit = this.pV[profile].multiPV;
        const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;

        const [topMoveObjects, removedDuplicateMoveAmount]
            = GET_UNIQUE_MOVES(this.pV[profile].pastMoveObjects?.slice(markingLimit * -1));
        const ownFutureMove = moves?.[2];

        if(ownFutureMove) {
            const futureMoveObj = CREATE_MOVE_OBJ({
                playerMove: ownFutureMove,
                profile,
                cp: 0,
                ranking: 99
            });

            futureMoveObj.isFuture = true;
            futureMoveObj.parentMove = moves?.[0];

            const futureMoves = this.pV[profile].futureMoves;

            // Ensure the best future is selected
            const existingIndex = futureMoves.findIndex(move =>
                move.parentMove?.from === futureMoveObj.parentMove?.from &&
                move.parentMove?.to === futureMoveObj.parentMove?.to &&
                move.parentMove?.promotion === futureMoveObj.parentMove?.promotion
            );

            if(existingIndex !== -1) {
                futureMoves.splice(existingIndex, 1);
            }

            futureMoves.push(futureMoveObj);
        }

        updatePipData({ calculationTimeElapsed, 'nodes': data?.nodes, topMoveObjects });
        
        let isSearchInfinite = this.pV[profile].searchDepth ? false : true;

        if(await this.getEngineName(profile) === 'lc0' || this.pV[profile].engineNodes > 0) {
            isSearchInfinite = this.pV[profile].engineNodes > 9e6 ? true : false;
        }

        if(
            markingLimit !== 0
            && topMoveObjects.length === (markingLimit - removedDuplicateMoveAmount)
            && (!onlyShowTopMoves || (isSearchInfinite && !isMovetimeLimited)) // handle infinite search, cannot only show top moves when search is infinite
            && (!isDelayActive || (calculationTimeElapsed > moveDisplayDelay)) // handle visual delay, do not show move if time elapsed is too low
        ) {
            this.displayMoves(topMoveObjects, profile);
        }
    }

    if(isBestmove) {
        finishOldestUnfinishedCalculation();
        if(!oldestUnfinishedCalcRequestObj || !isMessageForCurrentFen) return;
        const bestmove = String(data.bestmove ?? '').trim();
        if(!bestmove || ['0000', '0', '(none)', 'none'].includes(bestmove)) {
            const terminal = oldestUnfinishedCalcRequestObj.annotationScore;
            if(terminal) {
                const fen = this.currentFen;
                const evaluation = evaluationForPlayer(terminal.score, terminal.mate,
                    oldestUnfinishedCalcRequestObj.analyzedColor ?? oldestUnfinishedCalcRequestObj.fen?.split(' ')[1],
                    await this.getPlayerColor());
                if(evaluation && this.currentFen === fen && this.pV[profile] === profileObj) {
                    annotateEvaluation.call(this, evaluation.playerEvaluation, fen, profile).catch(console.error);
                }
            }
            setProfileBubbleStatus('idle', profile, 'Idle, engine returned no legal move.');
            return;
        }

        // Use one completed primary evaluation per position. Re-evaluating after an engine
        // switch must not feed back into another switch on the very same position.
        const fen = this.currentFen;
        const primaryScore = oldestUnfinishedCalcRequestObj?.primaryScore;
        const playerColor = await this.getPlayerColor();
        if(this.pV[profile] !== profileObj || this.currentFen !== fen) return;
        const completedEvaluation = primaryScore && evaluationForPlayer(primaryScore.score, primaryScore.mate,
            oldestUnfinishedCalcRequestObj.analyzedColor ?? oldestUnfinishedCalcRequestObj.fen?.split(' ')[1],
            playerColor);
        const evaluation = completedEvaluation?.playerEvaluation;
        const annotationScore = oldestUnfinishedCalcRequestObj.annotationScore;
        const annotation = annotationScore && evaluationForPlayer(annotationScore.score, annotationScore.mate,
            oldestUnfinishedCalcRequestObj.analyzedColor, playerColor);
        if(isMessageForCurrentFen && annotation) {
            annotateEvaluation.call(this, annotation.playerEvaluation, fen, profile).catch(error => console.warn('[Audio] Evaluation annotation failed:', error));
        }
        const shouldUpdateDynamicContext = isMessageForCurrentFen
            && Number.isFinite(evaluation) && this.dynamicEvaluationFen !== fen;
        if(shouldUpdateDynamicContext) {
            this.dynamicEvaluationFen = fen;
            setDynamicSettingsContext(this.instanceID, fen, { evaluation });
            // A missing/older userscript can take three 1.5s attempts to reply.
            // Notify it independently; completed suggestions must not wait for that reply.
            this.CommLink.commands.updateDynamicContext({ evaluation, fen }).catch(console.error);
        }

        setProfileBubbleStatus('idle', profile, 'Idle, calculated best moves successfully!');

        if(isMessageForCurrentFen) {
            const lastData = oldestUnfinishedCalcRequestObj?.lastData ?? {};

            SEND_WEBHOOK({
                instanceId: this.instanceID,
                profile,
                site: this.domain,
                variant: this.activeVariant,
                engine: this.pV[profile].useExternalChessEngine ? 'External' : await this.getEngineName(profile),
                bestMove: data.bestmove,
                evaluation: lastData.cp,
                fen: oldestUnfinishedCalcRequestObj?.fen,
                depth: lastData.depth,
                seldepth: lastData.seldepth,
                nodes: lastData.nodes,
                time: lastData.time,
                calculationTime: calculationTimeElapsed,
                nps: lastData.nps,
                hashfull: lastData.hashfull,
                tbhits: lastData.tbhits,
                multipv: lastData.multipv,
                mate: lastData.mate,
                pv: lastData.pv,
                currmove: lastData.currmove,
                currmovenumber: lastData.currmovenumber,
                engineOutput: msg
            }).catch(console.error);
        }

        if(isMessageForCurrentFen && profileObj.activeGuiMoveMarkings.length === 0) {
            const markingLimit = profileObj.multiPV;
            const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);
            if(this.pV[profile] !== profileObj || this.currentFen !== fen || this.instanceClosed) return;
            const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;

            let topMoveObjects = profileObj.pastMoveObjects?.slice(markingLimit * -1);

            if(topMoveObjects?.length === 0) {
                topMoveObjects = [];
                topMoveObjects.push({
                    ...CREATE_MOVE_OBJ({
                        playerMove: parseVariantMove(bestmove),
                        profile,
                        ranking: 1
                    }),
                    ...movePosition,
                    playerUci: bestmove
                });
            } else {
                topMoveObjects = GET_UNIQUE_MOVES(topMoveObjects)?.[0];
            }

            const engineName = await this.getEngineName(profile);
            if(this.pV[profile] !== profileObj || this.currentFen !== fen || this.instanceClosed) return;
            if(engineName === 'lc0' || profileObj.engineNodes > 0) {
                updatePipData({ 'nodes': profileObj.engineNodes, 'goalDepth': null });
            } else {
                updatePipData({ 'depth': profileObj.searchDepth, 'goalNodes': null });
            }

            if(isDelayActive && markingLimit !== 0) {
                const timeElapsed = oldestUnfinishedCalcRequestObj?.startedAt
                    ? Date.now() - oldestUnfinishedCalcRequestObj.startedAt : calculationTimeElapsed;
                const remainingDelay = Math.max(0, moveDisplayDelay - timeElapsed);
                setTimeout(() => {
                    if(!this.instanceClosed && this.pV[profile] === profileObj
                        && fen === this.currentFen && !this.isEngineCalculating(profile)) {
                        this.displayMoves(topMoveObjects, profile).catch(console.error);
                    }
                }, remainingDelay);
            } else {
                if(markingLimit !== 0)
                    await this.displayMoves(topMoveObjects, profile);
            }
        }

        // Applying evaluation-based settings can reload an engine and wait for UCI options.
        // Do this after rendering (or scheduling the explicit delay), not before suggestions.
        if(shouldUpdateDynamicContext && !this.instanceClosed
            && this.pV[profile] === profileObj && this.currentFen === fen) {
            await this.syncDynamicSettings();
        }
    }

    const variantStartposFen = data['Fen:'];
    if(variantStartposFen) profileObj.variantStartposFen = variantStartposFen;

    if(msg === 'uciok') {
        await profileObj.uciOptionRegistrations;
        if(this.pV[profile] !== profileObj || this.instanceClosed) return;
        setDynamicOptionsReady(profile, this.instanceID);

        setTimeout(() => { // wait a bit for potential variantStartposfen
            if(this.instanceClosed || this.pV[profile] !== profileObj) return;
            const startPosFen = profileObj.variantStartposFen;
            const dimensions = startPosFen ? GET_BOARD_DIMENSIONS_FROM_FEN(startPosFen) : [8, 8];
            const startPos = startPosFen || this.defaultStartpos;

            const waitForChessgroundLoad = setInterval(() => {
                if(this.instanceClosed || this.pV[profile] !== profileObj) { clearInterval(waitForChessgroundLoad); return; }
                if(window?.ChessgroundX) {
                    clearInterval(waitForChessgroundLoad);

                    this.setupEnvironment(startPos, dimensions);
                    delete profileObj.variantStartposFen;
                }
            }, 5);
        }, 50);
    }
}