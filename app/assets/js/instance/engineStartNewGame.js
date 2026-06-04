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
    const isExternal = IS_EXTERNAL_ENGINE_SETTING_ACTIVE[profile];

    if(engineName === 'lc0' && !isExternal && this.pV[profile].lc0WeightName.includes('maia') && engineNodes > 1) {
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

    // Global resets run once, before any per-profile work, so looping over
    // profiles below does not wipe another profile's dynamic-options state.
    resetDynamicOptionsReady();
    this.kingMoved = ''; // reset king moved check

    // MoveEval is shared across the instance, so reset it once with the
    // instance-level player color (not per-profile) to avoid parallel stomping.
    if(this.MoveEval) this.MoveEval.startNewGame(await this.getPlayerColor());

    const startForProfile = async profileName => {
        const engineName = await this.getEngineName(profileName);
        const isAdvancedElo = await this.getConfigValue(this.configKeys.enableAdvancedElo, profileName);

        this.clearHistoryVariables(profileName);

        if(this.isEngineCalculating(profileName))
            this.engineStopCalculating(profileName, 'Engine was calculating while a new game was started!');

        this.sendMsgToEngine('isready', profileName); // not really necessary but not bad to have
        this.sendMsgToEngine('uci', profileName); // to display variants and other details
        this.sendMsgToEngine('ucinewgame', profileName); // very important to be before setting variant and so forth

        if(isAdvancedElo) await startWithDynamicOptions.bind(this)(chessVariant, engineName, profileName);
        else await startWithBasicOptions.bind(this)(chessVariant, engineName, profileName);

        this.sendMsgToEngine('position startpos', profileName);
        if(engineName !== 'lc0') this.sendMsgToEngine('d', profileName);
    };

    // When no profile is given (e.g. on a new match) start a new game for every profile.
    if(!profile) {
        await Promise.all(Object.keys(this.pV).map(startForProfile));
    } else {
        await startForProfile(profile);
    }
}