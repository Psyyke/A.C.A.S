import { externalChessEngineDropdown } from './gui/elementDeclarations.js';
import AcasInstance from './AcasInstance.js';
import { addInstanceToSettingsDropdown, removeInstanceFromSettingsDropdown } from './gui/instances.js';
import { isBuiltInFairyEngine } from './instance/fairyVariant.js';

window.AcasInstances = [];

let initToasts = [];
let instanceLock = Promise.resolve();

export function createInstance(domain, instanceID, chessVariant) {
    instanceLock = instanceLock.then(() =>
        _createInstanceSafe(domain, instanceID, chessVariant)
    ).catch(err => {
        console.error('createInstance chain error:', err);
    });

    return instanceLock;
}

async function _createInstanceSafe(domain, instanceID, chessVariant) {
    try {
        chessVariant = FORMAT_VARIANT(chessVariant);

        if(!domain) {
            console.error('Failed to create instance: Domain is required!');
            return;
        }

        if(!instanceID) {
            console.error('Failed to create instance: Instance ID is required!');
            return;
        }

        const hasExternalEnginesAdded =
            [...externalChessEngineDropdown?.querySelectorAll('.dropdown-item.large') || []]
                .length > 0;

        const isExternalReady = window.wsConnectionOpen && hasExternalEnginesAdded;
        const isReadyToContinue = isExternalReady || !window.useExternalEngine;

        if(!isReadyToContinue) {
            console.warn('Instance creation deferred: external engine not ready');
            return;
        }

        const instanceExists = window.AcasInstances.find(instanceObj => instanceObj.id === instanceID);

        if(instanceExists) {
            prelongInstanceLife(domain, instanceID, chessVariant);
            return;
        }

        const instance = new AcasInstance(
            domain,
            instanceID,
            chessVariant,
            instanceLoaded
        );

        window.AcasInstances.push({
            domain,
            id: instanceID,
            instance,
            date: Date.now()
        });

        const msg = TRANS_OBJ?.newInstanceRequest ?? 'New match found!';
        const initToast = toast.instance(`${msg} (${domain})`);

        initToasts.push({ instanceID, toast: initToast });

        console.log(
            `New engine instance created! (DOMAIN: ${domain}, ID: ${instanceID})`
        );

    } catch (err) {
        console.error('Error during instance creation:', err);
    }
}

export function removeInstance(instance) {
    window.AcasInstances = window.AcasInstances.filter(x => x.id !== instance.instanceID);

    removeInstanceFromSettingsDropdown(instance.instanceID);
}

function instanceLoaded(informationObj) {
    const initToast = initToasts.find(x => x.instanceID === informationObj.id);
    initToasts = initToasts.filter(x => x !== initToast);

    if(initToast) setTimeout(initToast?.toast?.close, 1000);

    addInstanceToSettingsDropdown(informationObj.id, informationObj.domain, informationObj.variant, informationObj.element);
}

function prelongInstanceLife(domain, instanceID, chessVariant) {
    const instanceObj = window.AcasInstances.find(instanceObj => instanceObj.id === instanceID);

    if(instanceObj) {
        instanceObj.date = Date.now();

        const i = instanceObj.instance;
        const newVariantFormatted = FORMAT_VARIANT(chessVariant);
        if(!newVariantFormatted || newVariantFormatted === i.detectedChessVariant) return;

        // A keep-alive reports the site's variant, not the engine's selected UCI
        // variant. Comparing it with an explicit override restarted every heartbeat.
        i.detectedChessVariant = newVariantFormatted;
        const instanceProfiles = Object.keys(i.pV);
        const currentActiveVariants = instanceProfiles.map(profileName => {
            const variables = i.pV[profileName];

            return {
                'currentVariant': variables.chessVariant,
                'availableVariants': variables.chessVariants,
                'managesFairyVariant': variables.usingAdvancedMode && isBuiltInFairyEngine(variables),
                profileName
            };
        });

        currentActiveVariants.forEach(obj => {
            const currentVariantFormatted = FORMAT_VARIANT(obj.currentVariant);
            const newVariantExistsForEngine = obj.availableVariants.includes(newVariantFormatted);

            if(obj.managesFairyVariant) {
                i.createAndLoadSpecificEngine(obj.profileName).catch(console.error);

                return;
            }

            if(newVariantExistsForEngine && newVariantFormatted !== currentVariantFormatted) {
                instanceObj.instance.engineStartNewGame(newVariantFormatted, obj.profileName);
            }
        });
    }
}

setInterval(() => {
    window.AcasInstances.forEach(instanceObj => {
        const instanceAgeMs = Date.now() - instanceObj.date;

        if(instanceAgeMs > 4000) {
            if(instanceAgeMs > 10000) {
                const warningMsg = TRANS_OBJ?.instanceConnectionTermination ?? 'Terminated instance due to lost connection.\n\nUnexpected? Visit the tab to reactivate A.C.A.S.';
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