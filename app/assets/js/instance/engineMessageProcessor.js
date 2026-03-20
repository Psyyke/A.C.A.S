import { setProfileBubbleStatus } from '../gui/profiles.js';
import { fillDynamicEngineOptionContainer } from '../gui/dynamicEngineOptions.js';
import { updatePipData } from '../gui/pip.js';
import { setDynamicOptionsReady } from '../gui/dynamicEngineOptions.js';

export default async function engineMessageProcessor(msg, profile) {
    const profileObj = this.pV[profile];

    if(!profileObj) {
        if(this.debugLogsEnabled) console.warn('Attempted to process an engine message from a nonexisting engine, uhh, ghosts?');

        return;
    }

    const data = PARSE_UCI_RESPONSE(msg);
    const oldestUnfinishedCalcRequestObj = this.pV[profile].pendingCalculations.find(x => !x.finished);
    const isMessageForCurrentFen = oldestUnfinishedCalcRequestObj?.fen === this.currentFen;
    const isMsgNoSuchOption = msg.includes('No such option') && !msg.includes('Variant') && !msg.includes('UCI_');
    const isMsgFailure = msg.includes('Failed') && !msg.includes('MIME type');
    const isMsgOption = msg.startsWith('option name ');

    const finishOldestUnfinishedCalculation = () => {
        if(oldestUnfinishedCalcRequestObj)
            oldestUnfinishedCalcRequestObj.finished = true;

        // Check if the board has changed while we were finishing up a move calculation.
        if(oldestUnfinishedCalcRequestObj?.fen !== this.currentFen) {
            // Finish everything
            this.pV[profile].pendingCalculations.forEach(x => x.finished = true);

            // Let's start the new move calculation since we have now received the old 'bestmove'.
            // A.C.A.S expects 'bestmove' to appear to finish up the calculation which is why we do this.
            // (Starting a new best move calculation while the old one was running, there would be no 'bestmove')
            this.calculateBestMoves(this.currentFen);
        }
    }

    if(isMsgNoSuchOption) {
        const p = await GET_PROFILE(profile);
        const profileChessEngine = p.config.chessEngine;
        const missingOptionName =  msg.split('No such option:')?.[1]?.trim();

        toast.warning(`"${missingOptionName}" not supported on ${profileChessEngine} (Running on profile "${profile}")`, 4000);

        return;
    }

    if(isMsgFailure) {
        finishOldestUnfinishedCalculation();

        const p = await GET_PROFILE(profile);
        const profileChessEngine = p.config.chessEngine;

        toast.warning(`"${msg}" ("${profileChessEngine}" running on profile "${profile}")`, 4e4);

        return;
    }

    if(!data?.currmovenumber && this.logEngineMessages) console.warn(`${profile} ->`, msg, `\n(Message is for FEN -> ${oldestUnfinishedCalcRequestObj?.fen})`);

    if(msg.includes('option name UCI_Variant type combo')) {
        const chessVariants = EXTRACT_VARIANT_NAMES(msg);

        this.pV[profile].chessVariants = chessVariants;

        this.guiBroadcastChannel.postMessage({ 'type': 'updateChessVariants', 'data' : chessVariants });
    }

    if(msg.includes('info')) {
        if(data?.multipv === '1' || ['lozza-5', 'lc0'].includes(await this.getEngineName(profile))) {
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

            if(data?.cp)
                this.Interface.updateEval(data.cp, false, profile);

            if(data?.mate) 
                this.Interface.updateEval(data.mate, true, profile);
        }
    }

    if(data?.wdl) {
        const [winChance, drawChance, lossChance] = data?.wdl?.split(' ');

        updatePipData({ winChance, drawChance, lossChance });
    }

    if(data?.pv && isMessageForCurrentFen) {
        const moveRegex = /[a-zA-Z]\d+/g;
        const ranking = VAR_TO_CORRECT_TYPE(data?.multipv) || 1;
        let moves = data.pv.split(' ').map(move => move.match(moveRegex));

        if(moves?.length === 1) // if no opponent move guesses yet
            moves = [...moves, [null, null]];

        const cp = data?.cp;
        const [[from, to], [opponentFrom, opponentTo]] = moves;
        const moveObj = { 'player': [from, to], 'opponent': [opponentFrom, opponentTo], cp, profile, ranking };

        this.pV[profile].pastMoveObjects.push(moveObj);

        const isMovetimeLimited = await this.getConfigValue(this.configKeys.maxMovetime, profile) ? true : false;
        const onlyShowTopMoves = await this.getConfigValue(this.configKeys.onlyShowTopMoves, profile);
        const movesOnDemand = await this.getConfigValue(this.configKeys.movesOnDemand, profile);
        const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);
        const markingLimit = this.pV[profile].multiPV;
        const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;

        const [topMoveObjects, removedDuplicateMoveAmount] = GET_UNIQUE_MOVES(this.pV[profile].pastMoveObjects?.slice(markingLimit * -1));
        const calculationStartedAt = oldestUnfinishedCalcRequestObj?.startedAt;
        const calculationTimeElapsed = Date.now() - calculationStartedAt;

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

    if(data?.bestmove) {
        finishOldestUnfinishedCalculation();

        setProfileBubbleStatus('idle', profile, 'Idle, calculated best moves successfully!');

        if(isMessageForCurrentFen && this.pV[profile].activeGuiMoveMarkings.length === 0) {
            const markingLimit = this.pV[profile].multiPV; // await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile)
            const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);
            const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;

            let topMoveObjects = this.pV[profile].pastMoveObjects?.slice(markingLimit * -1);

            if(topMoveObjects?.length === 0) {
                topMoveObjects = [];
                topMoveObjects.push({ 'player': [data.bestmove.slice(0,2), data.bestmove.slice(2, data.bestmove.length)], 'opponent': [null, null], 'ranking': 1  });
            } else {
                topMoveObjects = GET_UNIQUE_MOVES(topMoveObjects)?.[0];
            }

            if(await this.getEngineName(profile) === 'lc0' || this.pV[profile].engineNodes > 0) {
                updatePipData({ 'nodes': this.pV[profile].engineNodes, 'goalDepth': null });
            } else {
                updatePipData({ 'depth': this.pV[profile].searchDepth, 'goalNodes': null });
            }

            if(isDelayActive) {
                const startFen = this.currentFen;

                setTimeout(() => {
                    if(startFen == this.currentFen && !this.isEngineCalculating(profile)) {
                        this.displayMoves(topMoveObjects, profile);
                    }
                }, moveDisplayDelay);
            } else {
                if(markingLimit !== 0)
                    this.displayMoves(topMoveObjects, profile);
            }
        }
    }

    if(isMsgOption) {
        fillDynamicEngineOptionContainer(msg, profile);
    }

    if(msg === 'uciok') {
        setDynamicOptionsReady(profile);
    }

    const variantStartposFen = data['Fen:'];

    if(variantStartposFen || msg === 'uciok') {
        const dimensions = GET_BOARD_DIMENSIONS_FROM_FEN(variantStartposFen);
        const startPos = variantStartposFen || this.defaultStartpos;

        const waitForChessgroundLoad = setInterval(() => {
            if(window?.ChessgroundX) {
                clearInterval(waitForChessgroundLoad);

                this.setupEnvironment(startPos, dimensions);
            }
        }, 5);
    }
}