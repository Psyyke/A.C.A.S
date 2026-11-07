import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../appServer/backend/main.js', import.meta.url), 'utf8');
const preloadSource = await readFile(new URL('../appServer/backend/preload.js', import.meta.url), 'utf8');

function createOpenExternalHandler({ senderIsMainWindow = true } = {}) {
    const handlerSource = mainSource.match(/handleTrustedIpc\('openExternal',[\s\S]*?\n\t\}\);/);
    assert.ok(handlerSource, 'main process must register the external-link handler');

    const handler = new Function('mainWindow', 'shell', `return (async (event, rawUrl) => {
${handlerSource[0].replace(/^\s*handleTrustedIpc\('openExternal', async \(_event, rawUrl\) => \{/, '').replace(/\n\s*\}\);\s*$/, '')}
})`)(
        senderIsMainWindow ? { webContents: {} } : null,
        { openExternal: async url => { globalThis.__openedExternalUrl = url; } }
    );

    return handler;
}

test('preload routes external links through the main process', () => {
    assert.match(preloadSource, /openExternal:\s*\(url\)\s*=>\s*ipcRenderer\.invoke\('openExternal',\s*url\)/);
    assert.doesNotMatch(preloadSource, /shell\.openExternal/);
    assert.match(mainSource, /event\.sender !== mainWindow\.webContents/);
    assert.match(mainSource, /event\.senderFrame !== event\.sender\.mainFrame/);
    assert.match(mainSource, /path\.resolve\(senderPath\) !== trustedPage/);
});

test('external link handler rejects non-HTTPS and malformed input', async () => {
    const handler = createOpenExternalHandler({ senderIsMainWindow: false });
    const event = { sender: {} };

    for(const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://example.com', 'not a URL']) {
        await assert.rejects(handler(event, url));
    }
});

test('external link handler permits HTTPS without embedded credentials', async () => {
    const mainWindow = { webContents: {} };
    // Rebuild with the actual expected sender for the positive-path assertion.
    const handlerSource = mainSource.match(/handleTrustedIpc\('openExternal',[\s\S]*?\n\t\}\);/)[0];
    const body = handlerSource.replace(/^\s*handleTrustedIpc\('openExternal', async \(_event, rawUrl\) => \{/, '').replace(/\n\s*\}\);\s*$/, '');
    const openHandler = new Function('mainWindow', 'shell', `return async (event, rawUrl) => {${body}\n}`)(
        mainWindow,
        { openExternal: async url => { globalThis.__openedExternalUrl = url; } }
    );

    await openHandler({ sender: mainWindow.webContents }, 'https://example.com/path');
    assert.equal(globalThis.__openedExternalUrl, 'https://example.com/path');
    await assert.rejects(openHandler({ sender: mainWindow.webContents }, 'https://user:pass@example.com'));
});
