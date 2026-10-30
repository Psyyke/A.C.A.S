import { setProfileBubbleStatus } from '../gui/profiles.js';
import { fillDynamicEngineOptionContainer, setDynamicOptionsReady } from '../gui/dynamicEngineOptions.js';
import { updatePipData, updatePipHints } from '../gui/pip.js';
import { setDynamicSettingsContext } from '../gui/dynamicSettings.js';
import { isActivityLoggingEnabled, logActivity } from '../misc/activityLog.js';
import { evaluationForPlayer } from '../misc/evaluation.js';
import { annotateEvaluation } from './annotate.js';
import { parseVariantMove } from '../misc/variantPosition.js';
import { isBuiltInFairyEngine } from './fairyVariant.js';
import { recordEngineAnalysis } from './renderFeedback.js';

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

    const isFusionEngine = !profileObj.useExternalChessEngine && profileObj.requestedEngine === 'acas-fusion';
    const data = PARSE_UCI_RESPONSE(msg);
    const isBestmove = Object.hasOwn(data, 'bestmove');
    const oldestUnfinishedCalcRequestObj = this.pV[profile].pendingCalculations.find(x => !x.finished);

    // A missing mandatory human policy is not checkmate/stalemate. Wait for the
    // following bestmove to finish the request, preserving search queue order.
    if(isFusionEngine && msg.startsWith('info string Fusion: error: ')) {
        if(oldestUnfinishedCalcRequestObj) {
            oldestUnfinishedCalcRequestObj.fusionFailure = msg.slice('info string Fusion: error: '.length);
        }
        return;
    }

    if(oldestUnfinishedCalcRequestObj) {
        oldestUnfinishedCalcRequestObj.rawLine = msg;

        if(!data.pv && !isBestmove) recordEngineAnalysis.call(this, data, oldestUnfinishedCalcRequestObj, profile);
    }

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

    if(isMessageForCurrentFen && (msg.startsWith('info ') || isBestmove)) {
        updatePipData({
            calculationTimeElapsed,
            calculationFinished: isBestmove,
            ...(data.nodes != null ? { nodes: data.nodes } : {})
        }, this, profile);
    }

    let parsedMove;

    if(data.pv || isBestmove) {
        const line = data.pv?.trim().split(/\s+/) || [data.bestmove];
        const playerMove = parseVariantMove(line[0]);

        if(playerMove) {
            parsedMove = CREATE_MOVE_OBJ({
                playerMove,
                opponentMove: parseVariantMove(line[1]),
                cp: data.cp ?? (isFusionEngine ? null : undefined),
                profile,
                ranking: Number(data.multipv) || 1
            });

            Object.assign(parsedMove, movePosition, { playerUci: playerMove.uci });
            recordEngineAnalysis.call(this, data, oldestUnfinishedCalcRequestObj, profile, parsedMove);

            if(data.pv && isFusionEngine && oldestUnfinishedCalcRequestObj) {
                // Fusion publishes a complete ranked set starting at MultiPV 1.
                // Keep that set separate from earlier mixed/fallback iterations.
                if(parsedMove.ranking === 1) {
                    oldestUnfinishedCalcRequestObj.fusionMoves = [];
                    oldestUnfinishedCalcRequestObj.fusionPrimaryData = data;
                    if(isMessageForCurrentFen) profileObj.futureMoves = [];
                }
                oldestUnfinishedCalcRequestObj.fusionMoves ??= [];
                oldestUnfinishedCalcRequestObj.fusionMoves.push(parsedMove);
            } else if(data.pv && isMessageForCurrentFen) {
                profileObj.pastMoveObjects.push(parsedMove);
            }
        } else {
            recordEngineAnalysis.call(this, data, oldestUnfinishedCalcRequestObj, profile);
        }
    }

    const isMsgNoSuchOption = msg.includes('No such option') && !msg.includes('Variant') && !msg.includes('UCI_');
    // Fusion recovery diagnostics can quote "Failed" from a retryable error.
    // Only its explicit final failure plus bestmove completes that search.
    const isMsgFailure = msg.includes('Failed') && !msg.includes('MIME type')
        && !msg.startsWith('info string Fusion:');
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

    if(msg.includes('info') && isMessageForCurrentFen) {
        if(data?.multipv == null || data.multipv === 1) {
            if(data?.depth) {
                const depthText = TRANS_OBJ?.calculationDepth ?? 'Depth';
                const winningText = TRANS_OBJ?.winning ?? 'Winning';
                const losingText = TRANS_OBJ?.losing ?? 'Losing';

                const progressMate = Number.isFinite(data.rootmate) ? data.rootmate
                    : Number.isFinite(data.rootcp) ? null : data.mate;
                if(progressMate && !this.isLearningProfile(profile)) {
                    const isWinning = progressMate > 0;
                    const mateText = `${isWinning ? winningText : losingText} ${Math.abs(progressMate)}`;

                    this.Interface.updateMoveProgress(`${mateText} | ${depthText} ${data.depth}`, isWinning ? 1 : 2, profile);
                } else {
                    this.Interface.updateMoveProgress(`${depthText} ${data.depth}`, 0, profile);
                }

                updatePipData({ depth: data.depth }, this, profile);
            }

            if((data?.cp != null || data?.mate != null || Number.isFinite(data.rootcp)
                || Number.isFinite(data.rootmate)) && isMessageForCurrentFen) {
                const fen = this.currentFen;
                const hasRootScore = Number.isFinite(data.rootcp);
                const hasRootMate = Number.isFinite(data.rootmate);
                const mate = hasRootMate || (!hasRootScore && data.mate != null);
                const score = hasRootMate ? data.rootmate : hasRootScore ? data.rootcp : mate ? data.mate : data.cp;

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
                    // Hypothetical turns, restricted searches and score bounds
                    // are useful for hints, but must not move the position's bar.
                    if(oldestUnfinishedCalcRequestObj.annotationEligible && !/\b(?:lowerbound|upperbound)\b/.test(msg)) {
                        await this.Interface.updateEval(score, mate, profile, analyzedColor, false, {
                            fen, depth: Number(data.depth) || 0,
                            isCurrent: () => oldestUnfinishedCalcRequestObj.primaryScore === primaryScore
                                && !oldestUnfinishedCalcRequestObj.stopRequested
                        });
                    }
                }
            }
        }
    }

    if((data?.rootwdl || data?.wdl) && isMessageForCurrentFen && !this.isLearningProfile(profile)
        && (data.multipv == null || data.multipv === 1)) {
        const [winChance, drawChance, lossChance] = data.rootwdl || data.wdl;

        updatePipData({ winChance, drawChance, lossChance }, this, profile);
    }

    if(data?.pv && isMessageForCurrentFen) {
        const fusionMoves = oldestUnfinishedCalcRequestObj?.fusionMoves;
        let moves = data.pv.trim().split(/\s+/).map(parseVariantMove);

        if(!moves[0]) return;

        if(moves?.length === 1) // if no opponent move guesses yet
            moves = [...moves, null];

        const isMovetimeLimited = await this.getConfigValue(this.configKeys.maxMovetime, profile) ? true : false;
        const onlyShowTopMoves = await this.getConfigValue(this.configKeys.onlyShowTopMoves, profile);
        const movesOnDemand = await this.getConfigValue(this.configKeys.movesOnDemand, profile);
        const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);

        // A newer Fusion set can arrive while settings are being read. Do not
        // restore an obsolete continuation or suggestion after that replacement.
        if(isFusionEngine && (this.pV[profile] !== profileObj || this.currentFen !== oldestUnfinishedCalcRequestObj.fen
            || fusionMoves !== oldestUnfinishedCalcRequestObj.fusionMoves || !fusionMoves?.includes(parsedMove))) return;

        const markingLimit = this.pV[profile].multiPV;
        const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;

        const [topMoveObjects, removedDuplicateMoveAmount]
            = GET_UNIQUE_MOVES(isFusionEngine
                ? fusionMoves.slice(0, markingLimit)
                : this.pV[profile].pastMoveObjects?.slice(markingLimit * -1));
        const ownFutureMove = moves?.[2];

        if(ownFutureMove) {
            const futureMoveObj = CREATE_MOVE_OBJ({
                playerMove: ownFutureMove,
                profile,
                cp: isFusionEngine ? null : 0,
                ranking: 99
            });

            Object.assign(futureMoveObj, movePosition);
            futureMoveObj.isFuture = true;
            futureMoveObj.parentMove = moves?.[0];

            const futureMoves = this.pV[profile].futureMoves;

            // Ensure the best future is selected
            const existingIndex = futureMoves.findIndex(move =>
                move.parentMove?.from === futureMoveObj.parentMove?.from &&
                move.parentMove?.to === futureMoveObj.parentMove?.to &&
                move.parentMove?.promotion === futureMoveObj.parentMove?.promotion &&
                move.parentMove?.uci === futureMoveObj.parentMove?.uci
            );

            if(existingIndex !== -1) {
                futureMoves.splice(existingIndex, 1);
            }

            futureMoves.push(futureMoveObj);
        }

        updatePipData({ calculationTimeElapsed, 'nodes': data?.nodes, topMoveObjects }, this, profile);
        
        let isSearchInfinite = this.pV[profile].searchDepth ? false : true;

        if(await this.getEngineName(profile) === 'lc0' || this.pV[profile].engineNodes > 0) {
            isSearchInfinite = this.pV[profile].engineNodes > 9e6 ? true : false;
        }

        if(isFusionEngine && (this.pV[profile] !== profileObj || this.currentFen !== oldestUnfinishedCalcRequestObj.fen
            || fusionMoves !== oldestUnfinishedCalcRequestObj.fusionMoves)) return;

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
            if(oldestUnfinishedCalcRequestObj.fusionFailure) {
                this.Interface.removeMarkings(profile, 'Fusion human policy unavailable for allowed legal moves');
                updatePipHints(this, profile, { moveObjects: [] });
                setProfileBubbleStatus(oldestUnfinishedCalcRequestObj.stopRequested ? 'idle' : 'warning', profile,
                    oldestUnfinishedCalcRequestObj.fusionFailure);
                return;
            }
            const terminal = oldestUnfinishedCalcRequestObj.annotationScore || oldestUnfinishedCalcRequestObj.primaryScore;

            if(terminal) {
                const fen = this.currentFen;
                const evaluation = evaluationForPlayer(terminal.score, terminal.mate,
                    oldestUnfinishedCalcRequestObj.analyzedColor ?? oldestUnfinishedCalcRequestObj.fen?.split(' ')[1],
                    await this.getPlayerColor(profile));

                if(evaluation && this.currentFen === fen && this.pV[profile] === profileObj) {
                    if(!this.isLearningProfile(profile)
                        && oldestUnfinishedCalcRequestObj.annotationEligible && !oldestUnfinishedCalcRequestObj.stopRequested) {
                        updatePipHints(this, profile, { moveObjects: [],
                            terminalOutcome: evaluation.playerEvaluation > 0 ? 'winning'
                                : evaluation.playerEvaluation < 0 ? 'losing' : 'draw' });
                    }
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
            setDynamicSettingsContext(this.instanceID, fen, { evaluation, playerColor });
            // A missing/older userscript can take three 1.5s attempts to reply.
            // Notify it independently; completed suggestions must not wait for that reply.
            this.CommLink.commands.updateDynamicContext({ evaluation, fen }).catch(console.error);
        }

        setProfileBubbleStatus('idle', profile, 'Idle, calculated best moves successfully!');

        if(isMessageForCurrentFen) {
            const lastData = oldestUnfinishedCalcRequestObj.fusionPrimaryData
                ?? oldestUnfinishedCalcRequestObj.lastData ?? {};

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

        if(isMessageForCurrentFen && (isFusionEngine || profileObj.activeGuiMoveMarkings.length === 0)) {
            const markingLimit = profileObj.multiPV;
            const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);

            if(this.pV[profile] !== profileObj || this.currentFen !== fen || this.instanceClosed) return;

            const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;

            let topMoveObjects = isFusionEngine
                ? oldestUnfinishedCalcRequestObj.fusionMoves?.slice(0, markingLimit) ?? []
                : profileObj.pastMoveObjects?.slice(markingLimit * -1);

            if(topMoveObjects?.length === 0) {
                topMoveObjects = [];
                if(parsedMove) topMoveObjects.push(parsedMove);
            } else {
                topMoveObjects = GET_UNIQUE_MOVES(topMoveObjects)?.[0];
            }

            // Replace stale secondary/future arrows without repeating speech or
            // Auto Move when this primary suggestion is already displayed.
            const silent = isFusionEngine && profileObj.activeGuiMoveMarkings.length > 0
                && profileObj.hintCandidates?.fen === fen
                && profileObj.hintCandidates.moves[0]?.playerUci === topMoveObjects[0]?.playerUci;
            const engineName = await this.getEngineName(profile);

            if(this.pV[profile] !== profileObj || this.currentFen !== fen || this.instanceClosed) return;

            if(engineName === 'lc0' || profileObj.engineNodes > 0) {
                updatePipData({ nodes: this.isLearningProfile(profile) ? oldestUnfinishedCalcRequestObj.lastData?.nodes ?? 0 : profileObj.engineNodes,
                    goalDepth: null }, this, profile);
            } else {
                // Keep the last reported depth, not the configured search limit.
                updatePipData({ goalNodes: null }, this, profile);
            }

            if(isDelayActive && markingLimit !== 0) {
                const timeElapsed = oldestUnfinishedCalcRequestObj?.startedAt
                    ? Date.now() - oldestUnfinishedCalcRequestObj.startedAt : calculationTimeElapsed;
                const remainingDelay = Math.max(0, moveDisplayDelay - timeElapsed);

                setTimeout(() => {
                    if(!this.instanceClosed && this.pV[profile] === profileObj
                        && fen === this.currentFen && !this.isEngineCalculating(profile)) {
                        this.displayMoves(topMoveObjects, profile, false, silent).catch(console.error);
                    }
                }, remainingDelay);
            } else {
                if(markingLimit !== 0)
                    await this.displayMoves(topMoveObjects, profile, false, silent);
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

        const waitsForFairyStartup = isBuiltInFairyEngine(profileObj);

        if(waitsForFairyStartup) return;

        setTimeout(() => { // wait a bit for potential variantStartposfen
            if(this.instanceClosed || this.pV[profile] !== profileObj) return;

            const startPosFen = profileObj.variantStartposFen;
            const startPos = startPosFen || this.currentFen || this.defaultStartpos;
            const dimensions = GET_BOARD_DIMENSIONS_FROM_FEN(startPos);

            const waitForChessgroundLoad = setInterval(() => {
                const isStale = this.instanceClosed || this.pV[profile] !== profileObj;

                if(isStale) {
                    clearInterval(waitForChessgroundLoad);
                    return;
                }

                if(window?.ChessgroundX) {
                    clearInterval(waitForChessgroundLoad);

                    this.setupEnvironment(startPos, dimensions).catch(console.error);
                    delete profileObj.variantStartposFen;
                }
            }, 5);
        }, 50);
    }
}