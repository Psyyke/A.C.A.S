import { updatePipData } from '../gui/pip.js';

export default async function updateSettings(updateObj) {
    const settingKey = updateObj?.data?.key,
          settingValue = updateObj?.data?.value;
    const profileName = updateObj.data.profile.name || settingValue;
    const isDirectlyCausedByUser = updateObj.data.isDirectlyCausedByUser;
    const isDynamicUciSetting = settingKey.startsWith('DYNAMIC_');

    const profiles = await GET_PROFILES();
    const profilesWithDisabledEngine = profiles.filter(p => p.config.engineEnabled === false);
    const nonexistingProfilesWithEngine = Object.keys(this.pV).filter(profileName => !profiles.find(p => p.name === profileName));
    const isEngineEnabled = await this.getConfigValue(this.configKeys.engineEnabled, profileName);

    // Handle profiles which engine is disabled
    for(const profileObj of profilesWithDisabledEngine) {
        const profileName = profileObj.name;
        const profileVariables = this.pV[profileName];

        if(profileVariables) {
            this.killEngine(profileName);

            return;
        }
    }
    
    // Handle profiles which do not exist anymore
    for(const profileName of nonexistingProfilesWithEngine) {
        this.killEngine(profileName);

        return;
    }

    const chessVariant = FORMAT_VARIANT(await this.getConfigValue(this.configKeys.chessVariant, profileName));
    const useChess960 = await this.getConfigValue(this.configKeys.useChess960, profileName);

    const findSetting = key => Object.values(updateObj?.data)?.includes(key);
    const didUpdateVariant = findSetting(this.configKeys.chessVariant);
    const didUpdateElo = [this.configKeys.engineElo, this.configKeys.engineEnemyElo]
        .find(key => findSetting(key));
    const didUpdateLc0Weight = findSetting(this.configKeys.lc0Weight);
    const didUpdateChessFont = findSetting(this.configKeys.chessFont);
    const didUpdateMultiPV = findSetting(this.configKeys.moveSuggestionAmount);
    const didUpdate960Mode = findSetting(this.configKeys.useChess960);
    const didUpdateChessEngine = findSetting(this.configKeys.chessEngine);
    const didUpdateEngineEnabled = findSetting(this.configKeys.engineEnabled);
    const didUpdateNodes = findSetting(this.configKeys.engineNodes);
    const didUpdateChessEngineProfile = findSetting(this.configKeys.chessEngineProfile);
    const didUpdateAdvancedElo = findSetting(this.configKeys.enableAdvancedElo);
    const didUpdateAdvancedEloDepth = findSetting(this.configKeys.advancedEloDepth);
    const didUpdateSearchNodes = findSetting(this.configKeys.engineNodes);

    if(didUpdateVariant || didUpdate960Mode) {
        this.set960Mode(useChess960, profileName);
        this.engineStartNewGame(didUpdateVariant ? chessVariant : this.pV[profileName].chessVariant, profileName);

        return;
    }

    if(didUpdateChessEngineProfile) {
        this.freezeEngineKilling[profileName] = true;

        setTimeout(() => {
            this.freezeEngineKilling[profileName] = false;
        }, 1500);
    }

    if(isDynamicUciSetting && isDirectlyCausedByUser) {
        this.applyDynamicOption(
            settingKey,
            settingValue,
            profileName,
            true
        );
    }

    if(didUpdateAdvancedElo) {
        this.updateAdvancedModeStatus(profileName, settingValue);
        this.createAndLoadSpecificEngine(profileName);
    }

    if((didUpdateChessEngine || (didUpdateEngineEnabled && isEngineEnabled)) && isDirectlyCausedByUser) {
        if(didUpdateChessEngine) 
            console.log('Kill and load engine', profileName, 'since the engine type was changed');
        else if(didUpdateEngineEnabled)
            console.log('(Attempt to kill) and then load engine', profileName, 'since the engine was enabled');

        this.createAndLoadSpecificEngine(profileName);

        return;
    }

    if(didUpdateChessFont)
        this.setChessFont(await this.getConfigValue(this.configKeys.chessFont));

    if(didUpdateElo)
        this.setEngineElo(await this.getConfigValue(this.configKeys.engineElo, profileName), true, profileName);

    if(didUpdateAdvancedEloDepth) {
        this.pV[profileName].searchDepth = settingValue;
    }

    if(didUpdateSearchNodes) {
        this.pV[profileName].engineNodes = settingValue;
        updatePipData({ 'goalDepth': null });
    }

    if(didUpdateLc0Weight)
        this.setEngineWeight(await this.getConfigValue(this.configKeys.lc0Weight, profileName), profileName);

    if(didUpdateMultiPV)
        this.setEngineMultiPV(await this.getConfigValue(this.configKeys.moveSuggestionAmount, profileName), profileName);

    if(didUpdate960Mode)
        this.set960Mode(useChess960, profileName);
}