import { updatePipData } from '../gui/pip.js';
import { onDynamicOptionsReady, resetDynamicOptionsReady } from '../gui/dynamicEngineOptions.js';

async function startWithBasicOptions(variant, engineName, profile) {
    const elo = await this.getConfigValue(this.configKeys.engineElo, profile);

    this.setEngineMultiPV(await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile), profile);
    this.setEngineShowWDL(true, profile);

    if(engineName !== 'lc0') this.setEngineVariant(variant, profile);
    this.setEngineElo(elo, false, profile);
}

async function startWithDynamicOptions(variant, engineName, profile) {
    await onDynamicOptionsReady(profile) //.catch(err => toast.error(`onDynamicOptionsReady failed: "${err.message}"`, 5000));
    
    const advancedEloDepth = await this.getConfigValue(this.configKeys.advancedEloDepth, profile);
    const engineNodes = await this.getConfigValue(this.configKeys.engineNodes, profile);
    const allSavedOptions = await GET_GM_VALUES_STARTS_WITH('DYNAMIC_', this.instanceID, profile);

    if(engineName === 'lc0' && this.pV[profile].lc0WeightName.includes('maia') && engineNodes > 1) {
        const msg = TRANS_OBJ?.maiaNodeWarning ?? 'Maia weights work best with no search, please only use one (1) search node!';
        toast.warning(msg, 5000);
    }

    if(engineNodes > 0) {
        this.pV[profile].engineNodes = engineNodes;
        updatePipData({ 'goalDepth': null });
    } else {
        this.pV[profile].searchDepth = advancedEloDepth;
    }

    // The applyDynamicOption has logic to filter out default values to not spam the engine
    for(let key in allSavedOptions) {
        await this.applyDynamicOption(key, allSavedOptions[key], profile);
    }
}

/* Activated on;
    1.) Start of totally new instances.
    2.) Board had a certain amount of squares which had changes (userscript determines this)
    3.) When the chess variant changes. */
export default async function engineStartNewGame(variant, profile) {
    const chessVariant = FORMAT_VARIANT(variant);
    const engineName = await this.getEngineName(profile);
    const playerColor = await this.getPlayerColor(profile);
    const isAdvancedElo = await this.getConfigValue(this.configKeys.enableAdvancedElo, profile);

    resetDynamicOptionsReady();

    if(!profile) {
        Object.keys(this.pV).forEach(profileName => {
            this.clearHistoryVariables(profileName);
        });
    } else this.clearHistoryVariables(profile);

    this.kingMoved = ''; // reset king moved check

    if(this.MoveEval) this.MoveEval.startNewGame(playerColor);

    if(this.isEngineCalculating(profile))
        this.engineStopCalculating(profile, 'Engine was calculating while a new game was started!');

    this.sendMsgToEngine('isready', profile); // not really necessary but not bad to have
    this.sendMsgToEngine('uci', profile); // to display variants and other details
    this.sendMsgToEngine('ucinewgame', profile); // very important to be before setting variant and so forth
        
    if(isAdvancedElo) await startWithDynamicOptions.bind(this)(chessVariant, engineName, profile);
    else await startWithBasicOptions.bind(this)(chessVariant, engineName, profile);

    this.sendMsgToEngine('position startpos', profile);
    if(engineName !== 'lc0') this.sendMsgToEngine('d', profile);
}