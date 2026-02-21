export default async function updateSettings(updateObj) {
    const profile = updateObj.data.profile.name || updateObj?.data?.value;
    const profiles = await getProfiles();
    const profilesWithDisabledEngine = profiles.filter(p => !p.config.engineEnabled);
    const nonexistingProfilesWithEngine = Object.keys(this.pV).filter(profileName => !profiles.find(p => p.name === profileName));

    const isEngineEnabled = await this.getConfigValue(this.configKeys.engineEnabled, profile);

    // Handle profiles which engine is disabled
    for(const profileObj of profilesWithDisabledEngine) {
        const profileName = profileObj.name;
        const profileVariables = this.pV[profileName];

        if(profileVariables) {
            console.log('Kill engine', profileName, 'due to it being disabled');

            this.killEngine(profileName);
        }
    }
    
    // Handle profiles which do not exist anymore
    for(const profileName of nonexistingProfilesWithEngine) {
        console.log('Kill engine', profileName, 'due to the profile not existing anymore');

        this.killEngine(profileName);
    }

    function findSettingKeyFromData(key) {
        return Object.values(updateObj?.data)?.includes(key);
    }

    const advancedEloKeys = [
        this.configKeys.enableAdvancedElo,
        this.configKeys.advancedEloDepth,
        this.configKeys.advancedEloSkill,
        this.configKeys.advancedEloMaxError,
        this.configKeys.advancedEloProbability,
        this.configKeys.advancedEloHash,
        this.configKeys.advancedEloThreads
    ];

    const didUpdateVariant = findSettingKeyFromData(this.configKeys.chessVariant);
    const didUpdateElo = [this.configKeys.engineElo, ...advancedEloKeys]
        .find(key => findSettingKeyFromData(key));
    const didUpdateAdvancedElo = advancedEloKeys
        .find(key => findSettingKeyFromData(key));
    const didUpdateLc0Weight = findSettingKeyFromData(this.configKeys.lc0Weight);
    const didUpdateChessFont = findSettingKeyFromData(this.configKeys.chessFont);
    const didUpdateMultiPV = findSettingKeyFromData(this.configKeys.moveSuggestionAmount);
    const didUpdate960Mode = findSettingKeyFromData(this.configKeys.useChess960);
    const didUpdateChessEngine = findSettingKeyFromData(this.configKeys.chessEngine);
    const didUpdateEngineEnabled = findSettingKeyFromData(this.configKeys.engineEnabled);
    const didUpdateNodes = findSettingKeyFromData(this.configKeys.engineNodes);
    const didUpdateChessEngineProfile = findSettingKeyFromData(this.configKeys.chessEngineProfile);

    if(didUpdateChessEngineProfile) {
        const profile = updateObj.data.value;

        this.freezeEngineKilling[profile] = true;

        setTimeout(() => {
            this.freezeEngineKilling[profile] = false;
        }, 1500);
    };

    const chessVariant = formatVariant(await this.getConfigValue(this.configKeys.chessVariant, profile));
    const useChess960 = await this.getConfigValue(this.configKeys.useChess960, profile);

    if(didUpdateVariant || didUpdate960Mode) {
        this.set960Mode(useChess960, profile);

        this.engineStartNewGame(didUpdateVariant ? chessVariant : this.pV[profile].chessVariant, profile);
    } else {
        if(didUpdateChessFont)
            this.setChessFont(await this.getConfigValue(this.configKeys.chessFont));

        if(didUpdateChessEngine || (didUpdateEngineEnabled && isEngineEnabled)) {
            if(didUpdateChessEngine) 
                console.log('Kill and load engine', profile, 'since the engine type was changed');
            else if(didUpdateEngineEnabled)
                console.log('Kill and load engine', profile, 'since the engine was enabled');

            this.killEngine(profile);

            this.pV[profile] = await this.profileVariables.create(this, profile);
            this.loadEngine(profile);
        }

        if(didUpdateElo)
            this.setEngineElo(await this.getConfigValue(this.configKeys.engineElo, profile), true, didUpdateAdvancedElo, profile);

        if(didUpdateNodes)
            this.setEngineNodes(await this.getConfigValue(this.configKeys.engineNodes, profile), profile);

        if(didUpdateLc0Weight)
            this.setEngineWeight(await this.getConfigValue(this.configKeys.lc0Weight, profile), profile);

        if(didUpdateMultiPV)
            this.setEngineMultiPV(await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile), profile);

        if(didUpdate960Mode)
            this.set960Mode(useChess960, profile);
    }
}