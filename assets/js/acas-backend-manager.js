let instances = [];

function createInstance(domain, instanceID, chessVariant) {
    const instanceExists = instances.find(instanceObj => instanceObj.id == instanceID) ? true : false;

    chessVariant = formatVariant(chessVariant); // important

    if(!instanceExists) {
        const msg = transObj?.newInstanceRequest ?? 'New match found!';
        toast.message(`${msg} (${domain})`, 2000);

        instances.push({
            'domain': domain,
            'id': instanceID,
            'instance': new BackendInstance(domain, instanceID, chessVariant, instanceLoaded),
            'date': Date.now(),
        });

        log.success(`New engine instance created! (DOMAIN: ${domain}, ID: ${instanceID})`);
    } else {
        prelongInstanceLife(domain, instanceID, chessVariant);
    }
}

function instanceLoaded(informationObj) {
    //console.log('Instance load confirmed:', informationObj);

    addInstanceToSettingsDropdown(informationObj.id, informationObj.domain, informationObj.variant, informationObj.element);
}

function prelongInstanceLife(domain, instanceID, chessVariant) {
    const instanceObj = instances.find(instanceObj => instanceObj.id == instanceID);

    if(instanceObj) {
        instanceObj.date = Date.now();

        const i = instanceObj.instance;
        const instanceProfiles = Object.keys(i.pV);
        const currentActiveVariants = instanceProfiles.map(profileName => {
            return {
                'currentVariant': i.pV[profileName].chessVariant,
                'availableVariants': i.pV[profileName].chessVariants,
                profileName
            };
        });

        if(!chessVariant) return;

        currentActiveVariants.forEach(obj => {
            const newVariantFormatted = formatVariant(chessVariant);
            const currentVariantFormatted = formatVariant(obj.currentVariant);

            const newVariantExistsForEngine = obj.availableVariants.find(x => x === newVariantFormatted) ? true : false;

            if(newVariantExistsForEngine && newVariantFormatted !== currentVariantFormatted) {
                instanceObj.instance.engineStartNewGame(newVariantFormatted, obj.profileName);
            }
        });
    }
}

function removeInstance(instance) {
    instances = instances.filter(x => x.id != instance.instanceID);

    removeInstanceFromSettingsDropdown(instance.instanceID);
}

setInterval(() => {
    instances.forEach(instanceObj => {
        const instanceAgeMs = Date.now() - instanceObj.date;

        if(instanceAgeMs > 4000) {
            if(instanceAgeMs > 10000) {
                const warningMsg = transObj?.instanceConnectionTermination ?? 'Terminated instance due to lost connection.\n\nUnexpected? Visit the tab to reactivate A.C.A.S.';
                toast.warning(`${warningMsg} (${instanceObj.domain})`, 5000);

                instanceObj.instance.close();
            } else {
                instanceObj.instance.Interface.displayConnectionIssueWarning();
            }
        } else {
            instanceObj.instance.Interface.removeConnectionIssueWarning();
        }
    });
}, 1000);