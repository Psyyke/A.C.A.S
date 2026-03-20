import { beggingFloaty, userStatElements } from './elementDeclarations.js';

function showBeggingFloaty(minutes) {
    const hoursText = beggingFloaty.querySelector('b');
    hoursText.innerText = Math.round(minutes / 60);

    beggingFloaty.showModal();
}

function saveUserUsageStat(key, value) {
    localStorage.setItem(USER_USAGE_PREFIX + key, value);

    if(key === MINUTES_USED_STORAGE_KEY && (value % 1440 === 0)) {
        showBeggingFloaty(value);
    }

    updateUserUsageStats(key, value);
}

export function incrementUserUsageStat(key, amount = 1) {
    const existing = getUserUsageStat(key);

    let newValue = amount;

    if(existing && !isNaN(existing.value)) {
        newValue = existing.value + amount;
    }

    saveUserUsageStat(key, newValue);
    return newValue;
}

function getUserUsageStat(key) {
    const val = localStorage.getItem(USER_USAGE_PREFIX + key);
    if(val === null) return null;

    return {
        key: key,
        value: Number(val)
    };
}

function getAllUserUsageStats() {
    const stats = [];
    const storageKeys = Object.keys(localStorage);

    for(let i = 0; i < storageKeys.length; i++) {
        if(storageKeys[i].startsWith(USER_USAGE_PREFIX)) {
            const cleanKey = storageKeys[i].replace(USER_USAGE_PREFIX, '');
            const stat = getUserUsageStat(cleanKey);
            if(stat) stats.push(stat);
        }
    }

    return stats;
}

export function updateUserUsageStats(key = null, value = null) {
    userStatElements.forEach(elem => {
        const elemKey = elem.dataset.key;

        if(key && elemKey !== key) return;

        const valueEl = elem.querySelector('p');
        if(!valueEl) return;

        const statValue = value !== null
            ? value
            : (getUserUsageStat(elemKey)?.value ?? 0);

        valueEl.textContent = FI_NUMBER_FORMATTER.format(statValue);
    });
}