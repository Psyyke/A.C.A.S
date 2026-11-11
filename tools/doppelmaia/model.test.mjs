import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { unpackWeights, readPolicy, writePolicy, get, fields, decodeLayer, encodeLayer } from './weights.js';
import { moveIndex, encodePlanes } from './encoding.js';
import { trainPolicy } from './learning.js';

test('every selectable bundled Maia rating has a supported policy architecture', async () => {
    const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
    const files = [...html.matchAll(/<option value="(maia-\d+\.pb)"/g)].map(match => match[1]);
    assert.equal(files.length, 10);
    for(const file of files) {
        const bytes = await unpackWeights(await readFile(new URL(`../../app/assets/lc0-nets/${file}`, import.meta.url)));
        assert.equal(readPolicy(bytes).channels, 64, file);
    }
});

test('Maia policy export retains untouched neural layers and network metadata', async () => {
    const bytes = await unpackWeights(await readFile(new URL('../../app/assets/lc0-nets/maia-1500.pb', import.meta.url)));
    const policy = readPolicy(bytes);
    assert.equal(policy.channels, 64);
    assert.equal(policy.matrix.length, 46080);
    policy.matrix[100] += 0.02;
    const output = writePolicy(bytes, policy.matrix, policy.bias);
    const roundtrip = readPolicy(output);
    assert.ok(Math.abs(roundtrip.matrix[100] - policy.matrix[100]) < 0.0001);
    for(const item of fields(bytes).filter(item => ![5, 10].includes(item.id)))
        assert.deepEqual(get(output, item.id), item.value);
    const originals = fields(get(bytes, 10)), exported = fields(get(output, 10));
    assert.deepEqual(exported.filter(item => item.id !== 3), originals.filter(item => item.id !== 3));
    assert.throws(() => readPolicy(Uint8Array.of(0)), /protobuf/);
});

test('LINEAR16 handles constant layers and rejects nonfinite weights', () => {
    assert.deepEqual(decodeLayer(encodeLayer(Float32Array.of(2, 2))), Float32Array.of(2, 2));
    assert.throws(() => encodeLayer(Float32Array.of(NaN)), /non-finite/);
});

test('Lc0 policy mapping handles colors, standard castling and knight promotions', () => {
    assert.equal(moveIndex('a1b1', false), 0);
    assert.equal(moveIndex('a8b8', true), 0);
    assert.equal(moveIndex('e1g1', false, true), moveIndex('e1h1', false));
    assert.notEqual(moveIndex('e1g1', false), moveIndex('e1h1', false));
    assert.equal(moveIndex('a7a8n', false), moveIndex('a7a8', false));
    assert.equal(moveIndex('h7h8b', false), 1857);
});

test('classical plane encoding uses side-to-move orientation and unscaled rule50', () => {
    const planes = encodePlanes(['8/8/8/8/8/8/p7/4K2k b - - 17 42'], [true]);
    assert.equal(planes[0 * 64 + 48], 1);
    assert.equal(planes[5 * 64 + 63], 1);
    assert.equal(planes[11 * 64 + 4 + 56], 1);
    for(const plane of [12, 108, 111]) assert.ok(planes.slice(plane * 64, (plane + 1) * 64).every(value => value === 1));
    assert.ok(planes.slice(109 * 64, 110 * 64).every(value => value === 17));
});

test('real gradients lower held-out cross entropy and choose the best checkpoint', async () => {
    const policy = { channels: 1, matrix: new Float32Array(80 * 9), bias: new Float32Array(80) };
    const sample = { features: new Float32Array(64).fill(1), legal: [0, 1], target: 1 };
    const mapping = Int32Array.of(0, 64);
    const events = [];
    const result = await trainPolicy(policy, [sample, sample], [sample], mapping,
        { epochs: 8, learningRate: 0.01, batchSize: 2 }, event => events.push(event));
    assert.equal(result.improved, true);
    assert.ok(result.best.validationLoss < result.history[0].validationLoss * 0.6);
    assert.ok(events.some(event => event.type === 'batch'));
    assert.ok(policy.matrix.some(value => value !== 0));
});

test('validation regressions stop training and restore the original model', async () => {
    const policy = { channels: 1, matrix: new Float32Array(80 * 9), bias: new Float32Array(80) };
    const train = { features: new Float32Array(64).fill(1), legal: [0, 1], target: 1 };
    const heldOut = { ...train, target: 0 };
    const result = await trainPolicy(policy, [train], [heldOut], Int32Array.of(0, 64),
        { epochs: 20, learningRate: 0.01, batchSize: 1, patience: 3 }, () => {});
    assert.equal(result.improved, false);
    assert.equal(result.bestEpoch, 0);
    assert.equal(result.history.length, 4);
    assert.ok(policy.matrix.every(value => value === 0));
    assert.ok(policy.bias.every(value => value === 0));
});
