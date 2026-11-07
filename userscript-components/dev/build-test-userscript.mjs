// Generates acas.user.test.js from acas.user.js: a separately installable debug build that
//  - logs errors instead of silently swallowing them,
//  - preserves every production @require verbatim,
//  - tracks CommLink and userscript storage health and prints it to the console every 5 seconds.
// Run from anywhere: node userscript-components/dev/build-test-userscript.mjs
// Disable the normal A.C.A.S userscript while the debug build is enabled. It has its own storage,
// so the terms have to be accepted again.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourcePath = join(root, 'acas.user.js');
const outputPath = join(root, 'acas.user.test.js');

const source = readFileSync(sourcePath, 'utf8');
const eol = source.includes('\r\n') ? '\r\n' : '\n';
let code = source.replace(/\r\n/g, '\n');

function replaceOnce(search, replacement, what) {
    const index = code.indexOf(search);

    if(index === -1 || code.indexOf(search, index + search.length) !== -1)
        throw new Error(`Anchor for "${what}" not found exactly once, update the build script`);

    code = code.slice(0, index) + replacement + code.slice(index + search.length);
}

function replaceAll(regex, replacement, what) {
    const count = code.match(regex)?.length || 0;

    if(!count) throw new Error(`No matches for "${what}", update the build script`);

    code = code.replace(regex, replacement);

    return count;
}

// Header: own name (localized names would override it), no auto-update to production
code = code.replace(/^\/\/ @name:.*\n/gm, '');
code = code.replace(/^\/\/ @(updateURL|downloadURL).*\n/gm, '');
replaceAll(/^\/\/ @name {8}.*$/m, '// @name        A.C.A.S DEBUG BUILD (acas.user.test.js)', 'name');

const debugHelpers = `
// ---- DEBUG BUILD helpers ----
const __acasDebug = (() => {
    const lastWarnAt = {};
    const tag = () => '[A.C.A.S debug' + (typeof commLinkInstanceID === 'string' ? ' ' + commLinkInstanceID.slice(0, 8) : '') + ']';

    return {
        tag,
        error: (e, where = '') => console.error(tag(), where || 'swallowed error', e),
        warnThrottled: (key, ...args) => {
            if(Date.now() - (lastWarnAt[key] || 0) < 5000) return;
            lastWarnAt[key] = Date.now();
            console.warn(tag(), ...args);
        }
    };
})();
`;

replaceOnce('(async () => { try { await LOAD_LEGACY_GM_SUPPORT();',
    '(async () => { try { await LOAD_LEGACY_GM_SUPPORT();\n' + debugHelpers, 'script body start');

const swallowedCatches = replaceAll(/catch\s*\((\w+)\)\s*\{\s*\}/g, 'catch($1) { __acasDebug.error($1) }', 'empty catch blocks')
    + replaceAll(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/g, '.catch(e => __acasDebug.error(e))', 'empty promise catches')
    + replaceAll(/if\(debugModeActivated\) console\.error\(e\);/g, '__acasDebug.error(e);', 'debug-only error logs');

replaceOnce(`    } catch(e) {
        return null;
    }
});`, `    } catch(e) {
        __acasDebug.error(e, 'CommLink listener (' + packet?.command + ')');
        return null;
    }
});`, 'frontend CommLink listener catch');

replaceOnce('    //console.warn(e);', "    console.error('[A.C.A.S debug] userscript crashed', e);", 'top-level catch');

const instrumentation = `
// ---- DEBUG BUILD instrumentation: inspect window.ACAS_DEBUG in the console ----
(() => {
    const D = __acasDebug;
    const s = {
        instanceID: commLinkInstanceID, href: location.href, isTopFrame: window === window.top,
        manager: (typeof GM_info !== 'undefined' ? GM_info?.scriptHandler + ' ' + GM_info?.version : 'unknown'),
        storage: { calls: 0, timeouts: 0, errors: 0, slowestMs: 0, slowestCall: null },
        receive: { loops: 0, lastLoopAt: 0, handled: 0, lastHandledAt: 0, lastDurationMs: 0, maxDurationMs: 0, errors: 0 },
        send: { total: 0, ok: 0, failed: 0, inFlight: 0, lastOkAt: 0, lastFailAt: 0, lastFailCommand: null, maxRttMs: 0 },
        gui: { heartbeatAgeMs: null, propagationMs: null, maxPropagationMs: 0 },
        gm: { keys: 0, packetKeys: 0, approxBytes: 0, ownHistoryLength: 0, ownBoardStateBytes: 0 }
    };

    for(const name of ['getValue', 'setValue', 'deleteValue', 'listValues']) {
        const original = CommLink.storage[name];

        CommLink.storage[name] = async (...args) => {
            const startedAt = performance.now();
            s.storage.calls++;

            try {
                return await original(...args);
            } catch(e) {
                if(/timed out/.test(e?.message)) s.storage.timeouts++;
                else s.storage.errors++;
                D.warnThrottled('storage-' + name, 'CommLink storage.' + name + ' failed:', e?.message || e);
                throw e;
            } finally {
                const took = performance.now() - startedAt;

                if(took > s.storage.slowestMs) {
                    s.storage.slowestMs = Math.round(took);
                    s.storage.slowestCall = name + ' ' + (args[0] ?? '');
                }
            }
        };
    }

    const originalReceive = CommLink.receivePackets.bind(CommLink);

    CommLink.receivePackets = async () => {
        const startedAt = performance.now();
        s.receive.loops++;
        s.receive.lastLoopAt = Date.now();

        try {
            const handled = await originalReceive();

            if(handled) {
                s.receive.handled += handled;
                s.receive.lastHandledAt = Date.now();
            }

            return handled;
        } catch(e) {
            s.receive.errors++;
            D.error(e, 'receivePackets');
            throw e;
        } finally {
            const took = performance.now() - startedAt;
            s.receive.lastDurationMs = Math.round(took);
            s.receive.maxDurationMs = Math.max(s.receive.maxDurationMs, Math.round(took));
        }
    };

    const originalSend = CommLink.send.bind(CommLink);

    CommLink.send = async (platform, command, data) => {
        const startedAt = Date.now();
        s.send.total++;
        s.send.inFlight++;

        try {
            const result = await originalSend(platform, command, data);

            if(result == null) {
                s.send.failed++;
                s.send.lastFailAt = Date.now();
                s.send.lastFailCommand = command;
                D.warnThrottled('send-' + command, 'No reply to "' + command + '" (to ' + platform + ') after ' + (Date.now() - startedAt) + 'ms');
            } else {
                s.send.ok++;
                s.send.lastOkAt = Date.now();
                s.send.maxRttMs = Math.max(s.send.maxRttMs, Date.now() - startedAt);
            }

            return result;
        } finally {
            s.send.inFlight--;
        }
    };

    // The GUI writes its heartbeat as Date.now(), so its age on arrival is the manager's delivery delay to this frame
    try {
        GM_addValueChangeListener('acasGuiHeartbeat', (key, oldValue, newValue) => {
            const delay = Date.now() - Number(newValue);

            if(!Number.isFinite(delay)) return;

            s.gui.propagationMs = delay;
            s.gui.maxPropagationMs = Math.max(s.gui.maxPropagationMs, delay);
        });
    } catch(e) { D.error(e, 'heartbeat listener'); }

    const measureStorage = () => {
        try {
            const keys = GM_listValues();
            let bytes = 0;

            for(const key of keys) {
                try { bytes += key.length + (JSON.stringify(GM_getValue(key))?.length || 0); } catch(e) { D.error(e, 'measure ' + key); }
            }

            s.gm.keys = keys.length;
            s.gm.packetKeys = keys.filter(key => key.includes('commlink-packet-')).length;
            s.gm.approxBytes = bytes;
            s.gm.ownHistoryLength = storedStateHistory.length;
            s.gm.ownBoardStateBytes = JSON.stringify(getBoardState()).length;
        } catch(e) { D.error(e, 'measureStorage'); }
    };

    setInterval(() => {
        const now = Date.now();
        const heartbeat = Number(GM_getValue('acasGuiHeartbeat')) || 0;
        s.gui.heartbeatAgeMs = heartbeat ? now - heartbeat : null;

        measureStorage();

        const receiveStalledMs = s.receive.lastLoopAt ? now - s.receive.lastLoopAt : null;

        if(s.gui.heartbeatAgeMs != null && s.gui.heartbeatAgeMs > 6000)
            console.warn(D.tag(), 'GUI heartbeat seen from here is ' + s.gui.heartbeatAgeMs + 'ms old. Either the GUI is closed, or the manager stopped delivering storage changes to this frame.');

        if(receiveStalledMs != null && receiveStalledMs > 3000)
            console.warn(D.tag(), 'CommLink receive loop has not run for ' + receiveStalledMs + 'ms (stuck handler or storage call).');

        console.log(D.tag(),
            'send ok/failed/inFlight ' + s.send.ok + '/' + s.send.failed + '/' + s.send.inFlight,
            '| maxRtt ' + s.send.maxRttMs + 'ms',
            '| receive loops ' + s.receive.loops + ' last ' + s.receive.lastDurationMs + 'ms max ' + s.receive.maxDurationMs + 'ms',
            '| storage timeouts ' + s.storage.timeouts + ' errors ' + s.storage.errors + ' slowest ' + s.storage.slowestMs + 'ms',
            '| GUI heartbeat age ' + s.gui.heartbeatAgeMs + 'ms, delivery ' + s.gui.propagationMs + 'ms (max ' + s.gui.maxPropagationMs + 'ms)',
            '| GM keys ' + s.gm.keys + ' (packets ' + s.gm.packetKeys + ') ~' + Math.round(s.gm.approxBytes / 1024) + 'KB',
            '| own history ' + s.gm.ownHistoryLength + ' (' + s.gm.ownBoardStateBytes + 'B per board update)');
    }, 5000);

    window.ACAS_DEBUG = s;
    if(typeof unsafeWindow === 'object') unsafeWindow.ACAS_DEBUG = s;

    console.log(D.tag(), 'debug build running in', s.isTopFrame ? 'top frame' : 'iframe', s.href, 'manager:', s.manager);
})();
`;

replaceOnce("CommLink.registerSendCommand('toggleConcealAssistance');\n",
    "CommLink.registerSendCommand('toggleConcealAssistance');\n" + instrumentation, 'CommLink instrumentation point');

writeFileSync(outputPath, code.replace(/\n/g, eol));

console.log(`Wrote ${outputPath}`);
console.log(`Un-silenced ${swallowedCatches} swallowed error handlers; production @requires preserved`);
