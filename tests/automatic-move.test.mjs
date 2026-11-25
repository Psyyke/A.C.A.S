import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('stopped moves finish once and invalid or missing geometry cannot emit NaN events', async () => {
    const source = readFileSync(new URL('../userscript-components/AutomaticMove.js', import.meta.url), 'utf8');
    const events = [];
    class Element {}
    class MouseEvent { constructor(type, options) { this.type = type; Object.assign(this, options); } }
    const target = { dispatchEvent: event => events.push(event) };
    const context = {
        Element, MouseEvent, PointerEvent: MouseEvent, crypto: globalThis.crypto,
        document: { elementFromPoint: () => target }, setTimeout, Math
    };
    const AutomaticMove = vm.runInNewContext(`${source}\nAutomaticMove`, context);
    const outcomes = [];
    const move = new AutomaticMove({ fenMoveArr: ['e2', 'e4'], moveDomCoords: [[10, 20], [30, 40]],
        domain: 'lichess.org' }, result => outcomes.push(result));
    await move.stop();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(outcomes, [false]);
    assert.ok(events.every(event => Number.isFinite(event.clientX) && Number.isFinite(event.clientY)));

    const probe = Object.create(AutomaticMove.prototype);
    Object.assign(probe, { active: true, domain: 'lichess.org', lastPieceSize: undefined });
    AutomaticMove.actives.push({ move: probe });
    const before = events.length;
    await probe.triggerPieceClick(null);
    await probe.triggerPieceClick([NaN, 20]);
    assert.equal(events.length, before);
    await probe.triggerPieceClick([10, 20]);
    assert.equal(events.length, before + 2);
    assert.ok(events.slice(before).every(event => Number.isFinite(event.clientX) && Number.isFinite(event.clientY)));
});
