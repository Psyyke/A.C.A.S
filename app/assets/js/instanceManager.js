import { externalChessEngineDropdown } from './gui/elementDeclarations.js'
import AcasInstance from './AcasInstance.js';
import { addInstanceToSettingsDropdown, removeInstanceFromSettingsDropdown } from './gui/instances.js';

window.AcasInstances = [];
let initToasts = [];

export function createInstance(domain, instanceID, chessVariant) {
    chessVariant = FORMAT_VARIANT(chessVariant);

    const hasExternalEnginesAdded = [...externalChessEngineDropdown?.querySelectorAll('.dropdown-item.large')]
        ?.length > 0;
    const isExternalReady = window.wsConnectionOpen && hasExternalEnginesAdded;
    const isReadyToContinue = isExternalReady || !window.useExternalEngine;

    if(!isReadyToContinue) return;

    setTimeout(() => {
        const instanceExists = window.AcasInstances.find(instanceObj => instanceObj.id == instanceID) ? true : false;

        if(instanceExists) {
            prelongInstanceLife(domain, instanceID, chessVariant);
            return;
        }

        window.AcasInstances.push({
            'domain': domain,
            'id': instanceID,
            'instance': new AcasInstance(domain, instanceID, chessVariant, instanceLoaded),
            'date': Date.now()
        });

        const msg = TRANS_OBJ?.newInstanceRequest ?? 'New match found!';
        const initToast = toast.instance(`${msg} (${domain})`);

        initToasts.push({ instanceID, 'toast': initToast });
        console.log(`New engine instance created! (DOMAIN: ${domain}, ID: ${instanceID})`);

        setTimeout(() => {
            if(CONCEAL_ASSISTANCE_ACTIVE) toast.warning(
                TRANS_OBJ?.concealmentActive ?? 'Concealment active!', 10000);
        }, 1000);

    }, isExternalReady ? 1000 : 0);
}

export function removeInstance(instance) {
    window.AcasInstances = window.AcasInstances.filter(x => x.id != instance.instanceID);

    removeInstanceFromSettingsDropdown(instance.instanceID);
}

function instanceLoaded(informationObj) {
    const initToast = initToasts.find(x => x.instanceID === informationObj.id);
    initToasts = initToasts.filter(x => x !== initToast);

    if(initToast) setTimeout(initToast?.toast?.close, 1000);

    addInstanceToSettingsDropdown(informationObj.id, informationObj.domain, informationObj.variant, informationObj.element);
}

function prelongInstanceLife(domain, instanceID, chessVariant) {
    const instanceObj = window.AcasInstances.find(instanceObj => instanceObj.id == instanceID);

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
            const newVariantFormatted = FORMAT_VARIANT(chessVariant);
            const currentVariantFormatted = FORMAT_VARIANT(obj.currentVariant);

            const newVariantExistsForEngine = obj.availableVariants.find(x => x === newVariantFormatted) ? true : false;

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