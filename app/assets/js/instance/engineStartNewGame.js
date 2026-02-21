// Activated when the board had >5 changed squares (see this.isCorrectAmountOfBoardChanges)
// Also on the very start on totally new games, & when variant changes.
export default async function engineStartNewGame(variant, profile) {
    const chessVariant = formatVariant(variant);
    const engineName = await this.getEngineType(profile);
    const playerColor = await this.getPlayerColor(profile);

    if(!profile) {
        Object.keys(this.pV).forEach(profileName => {
            this.clearHistoryVariables(profileName);
        });
    } else this.clearHistoryVariables(profile);

    this.kingMoved = ''; // reset king moved check

    if(this.MoveEval)
        this.MoveEval.startNewGame(playerColor);

    if(!this.isEngineNotCalculating(profile))
        this.engineStopCalculating(profile, 'Engine was calculating while a new game was started!');

    this.sendMsgToEngine('ucinewgame', profile); // very important to be before setting variant and so forth
    this.sendMsgToEngine('uci', profile); // to display variants

    this.setEngineMultiPV(await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile), profile);
    this.setEngineShowWDL(true, profile);

    if(engineName !== 'lc0')
        this.sendMsgToEngine(`setoption name UCI_AnalyseMode value true`, profile); // required for threads, etc.

    switch(engineName) {
        case 'lc0':
            const nodes = await this.getConfigValue(this.configKeys.engineNodes, profile);

            this.setEngineNodes(nodes, profile);
            this.sendMsgToEngine('position startpos', profile);

            break;
        default:
            const elo = await this.getConfigValue(this.configKeys.engineElo, profile);

            this.setEngineVariant(chessVariant, profile);
            this.setEngineElo(elo, false, false, profile);

            this.sendMsgToEngine('position startpos', profile);
            this.sendMsgToEngine('d', profile);

            break;
    }
}