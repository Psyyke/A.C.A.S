// Instance-scoped engine metadata/readiness, without GUI initialization dependencies.
const dynamicOptionValues = {};
const dynamicOptionsWaiters = {};
let dynamicOptionsReady = {};

const optionScope = (profileName, instanceID) => instanceID == null ? profileName : `${instanceID}\u0000${profileName}`;

export function resetDynamicOptionsReady(profileName, instanceID) {
    if(profileName == null) dynamicOptionsReady = {};
    else delete dynamicOptionsReady[optionScope(profileName, instanceID)];
}

export function setDynamicOptionsReady(profileName, instanceID) {
    const scope = optionScope(profileName, instanceID);
    dynamicOptionsReady[scope] = true;
    const waiters = dynamicOptionsWaiters[scope];
    if(waiters) {
        waiters.forEach(({ resolve }) => resolve());
        delete dynamicOptionsWaiters[scope];
    }
}

export function onDynamicOptionsReady(profileName, timeout = 5000, instanceID) {
    const scope = optionScope(profileName, instanceID);
    if(dynamicOptionsReady[scope]) return Promise.resolve();
    dynamicOptionsWaiters[scope] ??= [];
    return new Promise((resolve, reject) => {
        const waiter = { resolve: () => { clearTimeout(timer); resolve(); } };
        const timer = setTimeout(() => {
            dynamicOptionsWaiters[scope] = (dynamicOptionsWaiters[scope] ?? []).filter(item => item !== waiter);
            reject(new Error(`Timeout waiting for profile "${profileName}", did not receive UCI options from engine!`));
        }, timeout);
        dynamicOptionsWaiters[scope].push(waiter);
    });
}

export function setDynamicOption(dbKey, value, profileName, instanceID) {
    const scope = optionScope(profileName, instanceID);
    dynamicOptionValues[scope] ??= {};
    dynamicOptionValues[scope][dbKey] = value;
}

export function getDynamicOption(dbKey, profileName, instanceID) {
    return dynamicOptionValues[optionScope(profileName, instanceID)]?.[dbKey];
}

export function getDynamicEngineDbKeyPrefix(engineId) {
    return `DYNAMIC_${engineId}_`;
}