import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFloat16, encodeFloat16 } from './float16.js';

test('handles float16 boundary values without native float16 support', () => {
    for(const [value, expected] of [
        [0, 0x0000], [-0, 0x8000], [1, 0x3c00], [-2, 0xc000],
        [2 ** -24, 0x0001], [2 ** -25, 0x0000], [3 * 2 ** -25, 0x0002],
        [65504, 0x7bff], [65520, 0x7c00], [Infinity, 0x7c00], [-Infinity, 0xfc00]
    ]) {
        assert.equal(encodeFloat16(value), expected);
        assert.ok(Object.is(decodeFloat16(expected), value) || encodeFloat16(decodeFloat16(expected)) === expected);
    }
    assert.ok(Number.isNaN(decodeFloat16(encodeFloat16(NaN))));
});

test('decodes every half-precision value', { skip: typeof Float16Array === 'undefined' }, () => {
    const data = new ArrayBuffer(2);
    const raw = new Uint16Array(data);
    const half = new Float16Array(data);
    for(let i = 0; i < 65536; i++) {
        raw[0] = i;
        const actual = decodeFloat16(i);
        assert.ok(Object.is(actual, half[0]) || Number.isNaN(actual) && Number.isNaN(half[0]), `bits ${i}`);
    }
});

test('encodes float32 values and rounding ties correctly', { skip: typeof Float16Array === 'undefined' }, () => {
    const data = new ArrayBuffer(4);
    const raw = new Uint32Array(data);
    const values = new Float32Array(data);
    const expected = new Float16Array(1);
    const halfBits = new Uint16Array(expected.buffer);
    let seed = 0x87654321;
    for(let i = 0; i < 200000; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        raw[0] = seed;
        const value = values[0];
        expected[0] = value;
        if(Number.isNaN(value)) assert.ok(Number.isNaN(decodeFloat16(encodeFloat16(value))));
        else assert.equal(encodeFloat16(value), halfBits[0], `float32 bits ${seed.toString(16)}`);
    }
    for(const value of [0, -0, Infinity, -Infinity, 2 ** -25, 3 * 2 ** -25, 65504, 65520]) {
        expected[0] = value;
        assert.equal(encodeFloat16(value), halfBits[0], String(value));
    }
});
