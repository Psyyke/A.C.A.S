import test from 'node:test';
import assert from 'node:assert/strict';
import { realProducerSnapshot, frontendDrawer } from './screen-overlay-fixture.mjs';
import { PenaTeacher } from '../app/assets/engines/pena-v2/teacher.js';
import { compileTeaching } from '../app/assets/engines/pena-v2/narration.js';
import { normalizeOverlay } from '../appServer/backend/screenOverlayProtocol.js';
import { parseClientMessage } from '../appServer/backend/uciCommand.js';

test('Pena guard cues reach the real ghost drawer and survive local-server validation', async () => {
    const fen = '7k/8/8/8/3N4/5N2/8/K7 w - - 0 1';
    const h = frontendDrawer('chromium', fen);
    const instance = { currentFen: fen, boardState: { boardOrientation: 'w' }, getConfigValue: async () => true,
        CommLink: { commands: { renderVisualsToSite: packet => h.render(packet) } } };
    const teacher = new PenaTeacher(instance);
    try {
        const text = 'Your knight on f3 guards your knight on d4.';
        const cue = compileTeaching(text, fen, text, { rootColor: 'w' }).cues.find(cue => cue.references.relations.length);
        assert.ok(cue);
        teacher.show(text, fen, { references: cue.references, duration: 2000 });
        await new Promise(resolve => setImmediate(resolve));
        const packet = JSON.stringify({ type: 'screenOverlay', msg: h.drawer.snapshot() });
        const safe = normalizeOverlay(parseClientMessage(packet).msg);
        assert.ok(safe.shapes.some(shape => shape.type === 'arrow' && shape.positions.join('') === 'f3d4'));
        assert.ok(safe.shapes.some(shape => shape.type === 'rectangle' && shape.positions === 'd4'));
        instance.currentFen = fen.replace(' w ', ' b ');
        teacher.publish(fen);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(h.drawer.snapshot().shapes.length, 0);
    } finally {
        teacher.clear();
        await new Promise(resolve => setImmediate(resolve));
        h.clear();
        h.drawer.terminate();
    }
});

test('actual ScreenBoardDrawer snapshots and live producers survive backend validation', () => {
    for(const browser of ['chromium', 'firefox']) {
        const h = realProducerSnapshot(browser);
        const packet = JSON.stringify({ type: 'screenOverlay', msg: h.snapshot });
        const safe = normalizeOverlay(parseClientMessage(packet).msg);
        assert.equal(safe.visible, true);
        assert.equal(safe.geometry.browser, browser);
        assert.deepEqual(safe.shapes.map(shape => shape.id), h.snapshot.shapes.map(shape => shape.id));
        for(const original of h.snapshot.shapes) {
            const normalized = safe.shapes.find(shape => shape.id === original.id);
            for(const declaration of (original.config.style || '').split(';').filter(part => part.trim())) {
                const [key, ...rest] = declaration.split(':');
                if(key.trim() === 'display') continue;
                assert.ok(normalized.config.style.includes(`${key.trim().toLowerCase()}:${rest.join(':').trim()};`),
                    `Dropped producer style: ${declaration}`);
            }
            assert.deepEqual(normalized.animations, original.animations);
            assert.equal(normalized.ariaLabel, original.ariaLabel);
            assert.equal(normalized.title, original.title);
        }
        assert.ok(safe.shapes.some(shape => shape.config.text === '×'));
        assert.ok(safe.shapes.some(shape => shape.config.text === '⚠'));
        assert.ok(safe.shapes.some(shape => shape.animations.length === 1));
        assert.ok(safe.shapes.some(shape => shape.title === '♞ Teaching <idea>'));
        h.document.hidden = true;
        assert.equal(h.drawer.snapshot().visible, false);
        h.board.getBoundingClientRect = () => ({ left: -20, top: 20, width: 200, height: 200 });
        assert.equal(h.drawer.snapshot().visible, false);
        h.clear();
        h.drawer.terminate();
    }
});
