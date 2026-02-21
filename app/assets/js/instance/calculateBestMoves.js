// This function is called every time a seemingly valid new board position is detected on the chess site DOM.

// The userscript tries to filter out as many weird position changes as possible, but sometimes it can miss some.
// For example when a move is played and the opponent's piece disappears from the board before the player's piece appears on the board,
// it can look like a legal position change (1 piece disappeared, 1 piece appeared) but it is not. Wrong fens like this might break A.C.A.S.

export default async function calculateBestMoves(currentFen, skipValidityChecks = false, specificMovesObj = false, moveObj) {
    const profiles = await getProfiles();

    const shouldCalculate = p => p.config.engineEnabled 
        && ((!p.config.movesOnDemand && !specificMovesObj) || (specificMovesObj && p.config.movesOnDemand));

    if(specificMovesObj) skipValidityChecks = true;

    profiles.filter(p => shouldCalculate(p)).forEach(async profile => {
        const profileName = profile.name;
        if(!currentFen && this.pV[profileName].lastFen) currentFen = this.pV[profileName].lastFen;

        const onlyCalculateOwnTurn = await this.getConfigValue(this.configKeys.onlyCalculateOwnTurn, profileName);
        const isPlayerTurn = await this.isPlayerTurn(profileName);

        // Do not calculate on enemy turn if the user has enabled "only calculate own turn"
        if(onlyCalculateOwnTurn && !isPlayerTurn && !specificMovesObj && !skipValidityChecks) return;
        // Do not calculate if pawn is on promotion square, it's "not a legal position" and engines can get stuck on it
        if(this.isPawnOnPromotionSquare(currentFen)) return;
        // Engine is still calculating, do not start any new calculation since,
        // that will not give us 'bestmove' which A.C.A.S' logic EXPECTS.
        // The best moves will be calculated after we get the 'bestmove'.
        if(!this.isEngineNotCalculating(profileName)) return;

        const previousFen = this.pV[profileName].lastFen;
        const reverseSide = await this.getConfigValue(this.configKeys.reverseSide, profileName);
        let reversedFen = null;
        let specificMoves = '';

        if(reverseSide && !specificMovesObj) reversedFen = reverseFenPlayer(currentFen);
        if(specificMovesObj?.isOpponent) reversedFen = reverseFenPlayer(currentFen);

        this.pV[profileName].lastCalculatedFen = currentFen;
        this.pV[profileName].lastFen = currentFen;
        this.pV[profileName].pendingCalculations.push({ 'fen': currentFen, 'startedAt': Date.now(), 'finished': false });

        this.Interface.removeMarkings(profileName, 'Calculating best moves');

        this.renderMetric(currentFen, profileName);
        this.Interface.updateBoardFen(currentFen);
    
        this.sendMsgToEngine(`position fen ${reversedFen || currentFen}`, profileName);

        if(specificMovesObj?.moves)
            specificMoves = ' searchmoves ' + specificMovesObj.moves.join(' ');

        // Should not actually go infinite depth, read commenting below.
        // This is just a backup. It's not terrible to go infinite depth but problematic.
        let searchCommandStr = 'go infinite' + specificMoves;

        switch(await this.getEngineType(profileName)) {
            case 'lc0':
                const nodes = this.pV[profileName].engineNodes;

                searchCommandStr = `go nodes ${nodes}${specificMoves}`;

                updatePipData({ 'goalNodes': nodes });

                break;
            
            case 'acas-fusion':
                const calcDepth = this.pV[profileName].searchDepth || 100;
                const playerColor = await this.getPlayerColor();
                const moveHistory = this.moveHistory
                    .slice(0, -1); // remove latest the move we are calculating right now
                const historyString = generateHistoryString(moveHistory, playerColor);

                searchCommandStr = `go depth ${calcDepth}${specificMoves} history ${historyString}`;

                updatePipData({ 'goalDepth': calcDepth });
                break;

            default:
                // The search is "infinite" if the searchDepth is null. The engine's max depth seems to be 245 on 'go infinite',
                // but if it reaches that max depth on 'go infinite' it does not give 'bestmove'. A.C.A.S expects a bestmove, so that is no good.
                // That is why we limit the infinite search depth ourselves.
                const depth = this.pV[profileName].searchDepth || 100;

                searchCommandStr = `go depth ${depth}${specificMoves}`;

                updatePipData({ 'goalDepth': depth });

                break;
        }

        this.sendMsgToEngine(searchCommandStr, profileName);

        const movetime = await this.getConfigValue(this.configKeys.maxMovetime, profileName);

        updatePipData({ 'startTime': Date.now(), movetime });

        if(typeof movetime == 'number') {
            const startFen = this.currentFen;

            this.pV[profileName].currentMovetimeTimeout = setTimeout(() => {
                if(startFen == this.currentFen && movetime != 0 && !this.isEngineNotCalculating(profileName)) {
                    this.engineStopCalculating(profileName, 'Max movetime!');
                }
            }, movetime + 5);
        }
    });
}