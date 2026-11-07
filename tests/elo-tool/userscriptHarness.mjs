// Runs the real acas.user.js in Playwright pages by shimming the Tampermonkey API, so the
// userscript <-> GUI <-> tools page chain can be tested without a browser extension.
// The shim shares one synchronous store (localStorage) and wakes listeners across tabs and frames
// with a BroadcastChannel, which is how GM storage behaves for the same origin.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../maia-elo/serve.mjs';

const requireUrls = readFileSync(join(repoRoot, 'acas.user.js'), 'utf8')
    .split('\n')
    .map(line => line.match(/^\/\/ @require\s+(\S+)/)?.[1])
    .filter(Boolean);

async function loadRequires() {
    const cacheDir = join(tmpdir(), 'acas-userscript-requires');
    mkdirSync(cacheDir, { recursive: true });

    return Promise.all(requireUrls.map(async (url, index) => {
        const file = join(cacheDir, `${index}-${url.replace(/[^a-z0-9]/gi, '_').slice(-60)}.js`);
        if(!existsSync(file)) {
            const response = await fetch(url);
            if(!response.ok) throw new Error(`Could not fetch ${url}`);
            writeFileSync(file, await response.text());
        }
        return readFileSync(file, 'utf8');
    }));
}

const shim = `
const __bc = new BroadcastChannel('gm-shim');
const __listeners = new Map();
const __fire = (key, oldValue, newValue, remote) =>
    (__listeners.get(key) ?? []).forEach(callback => { try { callback(key, oldValue, newValue, remote); } catch(error) { console.error(error); } });
__bc.onmessage = ({ data }) => __fire(data.key, data.oldValue, data.newValue, true);
const GM_getValue = (key, fallback) => {
    const raw = localStorage.getItem('gm:' + key);
    return raw === null ? fallback : JSON.parse(raw);
};
const GM_setValue = (key, value) => {
    const oldValue = GM_getValue(key);
    if(value === undefined) localStorage.removeItem('gm:' + key);
    else localStorage.setItem('gm:' + key, JSON.stringify(value));
    __fire(key, oldValue, value, false);
    __bc.postMessage({ key, oldValue, newValue: value });
};
const GM_deleteValue = key => GM_setValue(key, undefined);
const GM_listValues = () => Object.keys(localStorage).filter(key => key.startsWith('gm:')).map(key => key.slice(3));
const GM_addValueChangeListener = (key, callback) => {
    if(!__listeners.has(key)) __listeners.set(key, []);
    __listeners.get(key).push(callback);
    return key;
};
const GM_openInTab = url => { (window.__openedTabs ??= []).push(url); return { close() {} }; };
const GM_registerMenuCommand = () => {};
const GM_setClipboard = () => {};
const GM_notification = () => {};
const GM_info = { script: { version: 'harness' } };
const unsafeWindow = window;
const GM = {
    getValue: async (...args) => GM_getValue(...args),
    setValue: async (...args) => GM_setValue(...args),
    deleteValue: async key => GM_deleteValue(key),
    listValues: async () => GM_listValues(),
    openInTab: async url => GM_openInTab(url),
    info: GM_info
};
`;

export async function buildUserscript() {
    const libs = await loadRequires();
    const main = readFileSync(join(repoRoot, 'acas.user.js'), 'utf8');
    return `(async () => {\n${shim}\n${libs.join('\n;\n')}\n;\n${main}\n})();`;
}

// Call before any page of the context is created.
export async function installUserscript(context) {
    const source = await buildUserscript();
    await context.addInitScript(source);
}
