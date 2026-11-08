import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for(const filename of ['acas.user.js', 'acas.user.test.js']) {
    const source = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
    const normalized = source.replace(/\r\n/g, '\n');
    const blockStart = normalized.indexOf("if(runningOnDevPage) {\n");
    const blockEnd = normalized.indexOf('\nfunction maybeAnnounceMarkingsToPage', blockStart);
    assert.ok(blockStart >= 0 && blockEnd > blockStart);
    const install = new Function('window', 'unsafeWindow', 'runningOnDevPage', 'getFen',
        'getBoardChanges', 'announceToPage', `
        const devTaskErrors = [];
        function recordDevTaskError(error) { devTaskErrors.push({ message: error.message }); }
        const chessBoardElem = { isConnected: true }, commLinkInstanceID = 'instance';
        const lastAllowedFen = 'accepted', lastRejectedFen = '', gameState = { turn: 'b' };
        const isUserMouseDown = false, lastMutationObservationDate = 1, lastMoveRequestTime = 2;
        const gameStateHistory = { get: () => [] };
        const getSiteData = () => null;
        ${normalized.slice(blockStart, blockEnd)}
        `);

    test(`${filename}: dev diagnostics accepts the page-window wrapper and reports snapshot errors`, () => {
        let listener;
        const responses = [];
        const window = {
            location: { origin: 'https://psyyke.github.io' },
            addEventListener: (type, callback) => { listener = callback; }
        };
        const pageWindow = {};
        install(window, pageWindow, true, () => { throw new Error('board snapshot failed'); },
            () => {}, (name, value) => responses.push({ name, value }));
        const event = { source: pageWindow, origin: window.location.origin,
            data: { type: 'acas-dev-diagnostics-request', requestId: 'request' } };
        listener(event);
        assert.equal(responses.length, 1);
        assert.equal(responses[0].value.error, 'board snapshot failed');
        assert.equal(responses[0].value.lastAllowedFen, 'accepted');
        assert.equal(responses[0].value.taskErrors[0].message, 'board snapshot failed');
        listener({ ...event, origin: 'https://example.com' });
        listener({ ...event, source: {} });
        assert.equal(responses.length, 1);
    });

    test(`${filename}: no dev diagnostic listener is installed outside the dev page`, () => {
        install({ addEventListener: () => assert.fail('Unexpected listener') },
            {}, false, () => {}, () => {}, () => {});
    });
}
