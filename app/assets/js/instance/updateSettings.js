import { updatePipData } from '../gui/pip.js';
import { clearFeedback } from './renderFeedback.js';

export default async function updateSettings(updateObj) {
    const settingKey = updateObj?.data?.key,
          settingValue = updateObj?.data?.value;
    const profileName = updateObj.data.profile?.name || settingValue;
    const isDirectlyCausedByUser = updateObj.data.isDirectlyCausedByUser;
    const isDynamicUciSetting = settingKey.startsWith('DYNAMIC_');

    const profiles = (await GET_PROFILES(this.instanceID)).filter(Boolean);
    const profilesWithDisabledEngine = profiles.filter(p => p.config.engineEnabled === false);
    const nonexistingProfilesWithEngine = Object.keys(this.pV).filter(profileName => !profiles.find(p => p.name === profileName));
    const isEngineEnabled = await this.getConfigValue(this.configKeys.engineEnabled, profileName);
    if(isEngineEnabled === false) {
        this.killEngine(profileName);
        return false;
    }

    // Handle profiles which engine is disabled
    for(const profileObj of profilesWithDisabledEngine) {
        const disabledProfileName = profileObj.name;

        if(this.pV[disabledProfileName]) {
            this.killEngine(disabledProfileName);

            // Only stop here if the changed profile is the one being disabled; killing
            // an unrelated profile's engine must not abort this profile's update.
            if(disabledProfileName === profileName) return false;
        }
    }

    // Handle profiles which do not exist anymore
    for(const deadProfileName of nonexistingProfilesWithEngine) {
        this.killEngine(deadProfileName);

        if(deadProfileName === profileName) return false;
    }

    const chessVariant = FORMAT_VARIANT(await this.getConfigValue(this.configKeys.chessVariant, profileName));
    const useChess960 = await this.getConfigValue(this.configKeys.useChess960, profileName);

    const findSetting = key => settingKey === key;
    const didUpdateVariant = findSetting(this.configKeys.chessVariant);
    const didUpdateElo = [this.configKeys.engineElo, this.configKeys.engineEnemyElo]
        .find(key => findSetting(key));
    const didUpdateLc0Weight = findSetting(this.configKeys.lc0Weight);
    const didUpdateChessFont = findSetting(this.configKeys.chessFont);
    const didUpdateMultiPV = findSetting(this.configKeys.moveSuggestionAmount);
    const didUpdate960Mode = findSetting(this.configKeys.useChess960);
    const didUpdateChessEngine = findSetting(this.configKeys.chessEngine);
    const didUpdateEngineEnabled = findSetting(this.configKeys.engineEnabled);
    const didUpdateChessEngineProfile = findSetting(this.configKeys.chessEngineProfile);
    const didUpdateAdvancedElo = findSetting(this.configKeys.enableAdvancedElo);
    const didUpdateAdvancedEloDepth = findSetting(this.configKeys.advancedEloDepth);
    const didUpdateSearchNodes = findSetting(this.configKeys.engineNodes);

    const refreshFeedback = () => {
        const latestState = this.gameStateHistory?.[this.gameStateHistory.length - 1];
        if(latestState?.fen?.full === this.currentFen && this.feedbackPositionFen === this.currentFen) {
            // Do not hold the dynamic-settings queue open while Stockfish thinks.
            this.renderFeedback(latestState, profileName).catch(error => console.warn('[Feedback] Settings refresh failed:', error));
        }
    };
    const feedbackKeys = [this.configKeys.enableMoveRatings, this.configKeys.enableEnemyFeedback,
        this.configKeys.feedbackEngineDepth, this.configKeys.feedbackOnExternalSite, this.configKeys.reverseSide,
        this.configKeys.chessVariant, this.configKeys.useChess960];
    if(feedbackKeys.includes(settingKey) && this.pV[profileName]) {
        // Invalidate callbacks immediately, even when the board hasn't moved.
        this.pV[profileName].feedbackRequest = (this.pV[profileName].feedbackRequest || 0) + 1;
        this.MoveEval?.cancelStaleRequests();
        clearFeedback.call(this, profileName);
        if(!didUpdateVariant && !didUpdate960Mode) refreshFeedback();
    }

    if(settingKey === this.configKeys.enableEveryPieceEvals && this.pV[profileName]) {
        this.pV[profileName].pieceEvalRequest = (this.pV[profileName].pieceEvalRequest || 0) + 1;
        this.BoardPiecesEval?.cancelStaleRequests();
        if(this.currentFen) this.renderMetric(this.currentFen, profileName).catch(console.error);
    }
    if(settingKey === this.configKeys.ttsAnnounceEvaluation && this.pV[profileName]) {
        delete this.pV[profileName].spokenAdvantage;
        delete this.pV[profileName].spokenEvaluationFen;
    }

    if(didUpdateVariant || didUpdate960Mode) {
        // Both of these reach into this.pV[profileName]. A profile whose engine is off was
        // never loaded so it has no entry, and the disabled-profile loop above only bails
        // out when one exists.
        if(this.pV[profileName]) {
            const variables = this.pV[profileName];
            this.set960Mode(useChess960, profileName, Boolean(updateObj.data.isDynamicChange));
            await this.engineStartNewGame(didUpdateVariant ? chessVariant : this.pV[profileName].chessVariant,
                profileName, Boolean(updateObj.data.isDynamicChange));
            if(this.pV[profileName] !== variables || this.instanceClosed) return false;
            refreshFeedback();
            if(this.currentFen) this.renderMetric(this.currentFen, profileName).catch(console.error);
            return { appliedValue: didUpdateVariant ? this.pV[profileName].chessVariant : this.pV[profileName].useChess960 };
        }

        return false;
    }

    if(didUpdateChessEngineProfile) {
        this.freezeEngineKilling[profileName] = true;

        setTimeout(() => {
            this.freezeEngineKilling[profileName] = false;
        }, 1500);
    }

    if(isDynamicUciSetting && (isDirectlyCausedByUser || updateObj.data.isDynamicChange)) {
        const applied = await this.applyDynamicOption(
            settingKey,
            settingValue,
            profileName,
            true
        );
        const values = this.pV[profileName]?.appliedSettings;
        return applied === false ? false : { appliedValue: values && Object.hasOwn(values, settingKey) ? values[settingKey] : settingValue };
    }

    if(didUpdateAdvancedElo) {
        // createAndLoadSpecificEngine builds the pV entry itself, so only the status
        // update needs an existing one
        if(this.pV[profileName]) this.updateAdvancedModeStatus(profileName, settingValue);

        await this.createAndLoadSpecificEngine(profileName);
    }

    if((didUpdateChessEngine || (didUpdateEngineEnabled && isEngineEnabled))
        && (isDirectlyCausedByUser || updateObj.data.isDynamicChange)) {
        if(didUpdateChessEngine) 
            console.log('Kill and load engine', profileName, 'since the engine type was changed');
        else if(didUpdateEngineEnabled)
            console.log('(Attempt to kill) and then load engine', profileName, 'since the engine was enabled');

        await this.createAndLoadSpecificEngine(profileName);

        return;
    }

    if(didUpdateChessFont)
        this.setChessFont(await this.getConfigValue(this.configKeys.chessFont));

    if(didUpdateElo) {
        if(!this.pV[profileName] || this.pV[profileName].usingAdvancedMode) return false;
        const result = await this.setEngineElo(await this.getConfigValue(this.configKeys.engineElo, profileName), isDirectlyCausedByUser, profileName);
        if(result === false) return false;
        const applied = this.pV[profileName]?.appliedSettings;
        if(settingKey === this.configKeys.engineEnemyElo && applied && !Object.hasOwn(applied, settingKey)) return false;
        return { appliedValue: applied && Object.hasOwn(applied, settingKey) ? applied[settingKey]
            : settingKey === this.configKeys.engineElo && result ? result.appliedValue : settingValue };
    }

    if(didUpdateAdvancedEloDepth && this.pV[profileName]) {
        if(!this.pV[profileName].usingAdvancedMode) return false;
        this.pV[profileName].searchDepth = await this.getConfigValue(this.configKeys.advancedEloDepth, profileName);
        return { appliedValue: this.pV[profileName].searchDepth };
    }

    if(didUpdateSearchNodes) {
        if(this.pV[profileName]) this.pV[profileName].engineNodes = this.pV[profileName].usingAdvancedMode || await this.getEngineName(profileName) === 'lc0'
            ? await this.getConfigValue(this.configKeys.engineNodes, profileName) : 0;

        updatePipData({ 'goalDepth': null });
        return this.pV[profileName] ? { appliedValue: this.pV[profileName].engineNodes } : false;
    }

    if(didUpdateLc0Weight) {
        if(!this.pV[profileName] || await this.getEngineName(profileName) !== 'lc0') return false;
        await this.setEngineWeight(await this.getConfigValue(this.configKeys.lc0Weight, profileName), profileName);
        return { appliedValue: this.pV[profileName].lc0WeightName };
    }

    if(didUpdateMultiPV && this.pV[profileName]) {
        const amount = await this.getConfigValue(this.configKeys.moveSuggestionAmount, profileName);
        this.setEngineMultiPV(amount, profileName, updateObj.data.isDynamicChange);
        return { appliedValue: this.pV[profileName].multiPV ?? amount };
    }

    if(settingKey === this.configKeys.openingBookName) await this.loadOpeningBook();
}