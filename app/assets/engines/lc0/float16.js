const scratch = new ArrayBuffer(4);
const float = new Float32Array(scratch);
const bits = new Uint32Array(scratch);

export function encodeFloat16(value) {
    float[0] = value;
    const word = bits[0];
    const sign = (word >>> 16) & 0x8000;
    const exponent = (word >>> 23) & 0xff;
    const fraction = word & 0x7fffff;
    if(exponent === 0xff) return sign | (fraction ? 0x7e00 : 0x7c00);
    if(exponent > 142) return sign | 0x7c00;
    if(exponent < 102) return sign;
    if(exponent < 113) {
        const mantissa = fraction | 0x800000;
        const shift = 126 - exponent;
        const result = mantissa >>> shift;
        const remainder = mantissa & ((1 << shift) - 1);
        const halfway = 1 << (shift - 1);
        return sign | (result + (remainder > halfway || remainder === halfway && (result & 1) ? 1 : 0));
    }
    let result = ((exponent - 112) << 10) | (fraction >>> 13);
    const remainder = fraction & 0x1fff;
    if(remainder > 0x1000 || remainder === 0x1000 && (result & 1)) result++;
    return sign | result;
}

export function decodeFloat16(value) {
    const sign = value & 0x8000 ? -1 : 1;
    const exponent = (value >>> 10) & 31;
    const fraction = value & 1023;
    if(exponent === 31) return fraction ? NaN : sign * Infinity;
    if(exponent === 0) return sign * fraction * 2 ** -24;
    return sign * (1024 + fraction) * 2 ** (exponent - 25);
}
