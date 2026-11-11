// Lc0 proto2 wire fields, pinned to the schema documented in README.md.
export function fields(bytes) {
    const result = [];
    let offset = 0;
    const varint = () => {
        const start = offset;
        let value = 0, scale = 1;
        for(let i = 0; i < 10; i++) {
            if(offset >= bytes.length) throw new Error('Truncated protobuf integer.');
            const byte = bytes[offset++];
            value += (byte & 127) * scale;
            if(!(byte & 128)) {
                if(!Number.isSafeInteger(value)) {
                    let exact = 0n;
                    for(let j = start; j < offset; j++)
                        exact |= BigInt(bytes[j] & 127) << BigInt((j - start) * 7);
                    value = Number(BigInt.asIntN(64, exact));
                    if(!Number.isSafeInteger(value)) throw new Error('Protobuf integer exceeds safe limits.');
                }
                return value;
            }
            scale *= 128;
        }
        throw new Error('Unsupported protobuf integer.');
    };
    while(offset < bytes.length) {
        const start = offset, tag = varint(), id = Math.floor(tag / 8), wire = tag & 7;
        if(!id) throw new Error('Invalid protobuf field.');
        let value;
        if(wire === 0) value = varint();
        else {
            const length = wire === 2 ? varint() : wire === 5 ? 4 : wire === 1 ? 8 : -1;
            if(length < 0 || offset + length > bytes.length) throw new Error('Invalid protobuf field length or encoding.');
            value = bytes.subarray(offset, offset + length);
            offset += length;
        }
        result.push({ id, wire, value, raw: bytes.subarray(start, offset) });
    }
    return result;
}

function integer(value) {
    const bytes = [];
    do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)); } while(value);
    return Uint8Array.from(bytes);
}
export function join(parts) {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for(const part of parts) { result.set(part, offset); offset += part.length; }
    return result;
}
export function field(id, value, wire = 2) {
    return join([integer(id * 8 + wire), ...(wire === 2 ? [integer(value.length)] : []),
        wire === 0 ? integer(value) : value]);
}
export function replace(bytes, replacements) {
    const remaining = new Map(replacements);
    return join([...fields(bytes).flatMap(item => {
        if(!remaining.has(item.id)) return [item.raw];
        const value = remaining.get(item.id);
        remaining.delete(item.id);
        return value === null ? [] : [value];
    }), ...remaining.values()].filter(Boolean));
}
export const get = (bytes, id) => fields(bytes).find(item => item.id === id)?.value;
const float = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(0, true);
const floatBytes = value => { const result = new Uint8Array(4); new DataView(result.buffer).setFloat32(0, value, true); return result; };

export async function unpackWeights(buffer) {
    let bytes = new Uint8Array(buffer);
    const limit = 64 * 1024 * 1024;
    if(bytes.length > limit) throw new Error('Weights exceed the 64 MB original Maia limit.');
    if(bytes[0] === 31 && bytes[1] === 139) {
        const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const parts = [];
        let size = 0;
        try {
            while(true) {
                const { done, value } = await reader.read();
                if(done) break;
                size += value.length;
                if(size > limit) {
                    await reader.cancel();
                    throw new Error('Decompressed weights exceed the 64 MB original Maia limit.');
                }
                parts.push(value);
            }
        } finally { reader.releaseLock(); }
        bytes = join(parts);
    }
    const magic = get(bytes, 1);
    if(!(magic instanceof Uint8Array) || new DataView(magic.buffer, magic.byteOffset, 4).getUint32(0, true) !== 0x1c0)
        throw new Error('This is not an Lc0 weights file.');
    return bytes;
}

export function decodeLayer(bytes) {
    if(!bytes) throw new Error('Missing Lc0 weight layer.');
    const minBytes = get(bytes, 1), maxBytes = get(bytes, 2), params = get(bytes, 3);
    if(minBytes?.length !== 4 || maxBytes?.length !== 4) throw new Error('Missing LINEAR16 weight range.');
    const min = float(minBytes), max = float(maxBytes);
    if(!Number.isFinite(min) || !Number.isFinite(max) || max < min || !params || params.length % 2)
        throw new Error('Invalid LINEAR16 weight layer.');
    const data = new DataView(params.buffer, params.byteOffset, params.byteLength);
    return Float32Array.from({ length: params.length / 2 },
        (_, i) => min + data.getUint16(i * 2, true) * (max - min) / 65535);
}

export function encodeLayer(values) {
    let min = Infinity, max = -Infinity;
    for(const value of values) {
        if(!Number.isFinite(value)) throw new Error('Training produced a non-finite weight.');
        min = Math.min(min, value); max = Math.max(max, value);
    }
    if(!values.length) throw new Error('Cannot export an empty weight layer.');
    const params = new Uint8Array(values.length * 2), view = new DataView(params.buffer);
    for(let i = 0; i < values.length; i++)
        view.setUint16(i * 2, max === min ? 0 : Math.round((values[i] - min) / (max - min) * 65535), true);
    return join([field(1, floatBytes(min), 5), field(2, floatBytes(max), 5), field(3, params)]);
}

export function readPolicy(bytes) {
    const format = get(bytes, 4), net = format && get(format, 2);
    if(!format || get(format, 1) !== 1 || !net || get(net, 1) !== 1 || get(net, 4) !== 2)
        throw new Error('Use LINEAR16 Lc0 weights with classical 112-plane inputs and a convolutional policy head, such as original Maia. Attention, Maia 2 and Maia 3 models are not supported.');
    const weights = get(bytes, 10);
    if(!weights || !get(weights, 11) || get(weights, 45))
        throw new Error('This trainer supports single convolutional-policy Lc0 networks only.');
    const policy = get(weights, 3);
    if(!policy || fields(policy).some(item => item.id > 2))
        throw new Error('Expected a final policy convolution without batch normalization.');
    const matrix = decodeLayer(get(policy, 1)), bias = decodeLayer(get(policy, 2));
    if(bias.length !== 80 || matrix.length % (80 * 9))
        throw new Error('Unexpected Maia policy dimensions.');
    const channels = matrix.length / (80 * 9);
    if(channels < 1 || channels > 256) throw new Error('Maia policy channel count is outside supported limits.');
    return { matrix, bias, channels, features: channels * 64 };
}

export function writePolicy(bytes, matrix, bias) {
    const original = readPolicy(bytes);
    if(matrix.length !== original.matrix.length || bias.length !== original.bias.length)
        throw new Error('Trained policy dimensions do not match the source network.');
    const policy = replace(get(get(bytes, 10), 3), new Map([
        [1, field(1, encodeLayer(matrix))], [2, field(2, encodeLayer(bias))]
    ]));
    const weights = replace(get(bytes, 10), new Map([[3, field(3, policy)]]));
    // Drop stale upstream training statistics, retaining all network and license fields.
    return replace(bytes, new Map([[10, field(10, weights)], [5, null]]));
}

const text = bytes => new TextDecoder().decode(bytes);
const utf8 = value => new TextEncoder().encode(value);

export function featureModel(model, features) {
    const graph = get(model, 7);
    if(!graph) throw new Error('Lc0 converter returned an ONNX file without a graph.');
    const nodes = fields(graph).filter(item => item.id === 1).map(item => ({ bytes: item.value,
        inputs: fields(item.value).filter(part => part.id === 1).map(part => text(part.value)),
        outputs: fields(item.value).filter(part => part.id === 2).map(part => text(part.value)),
        op: text(get(item.value, 4)) }));
    const head = nodes.find(node => node.op === 'Conv' && node.outputs.includes('/policy/conv2'));
    if(!head) throw new Error('Unsupported converted policy head. Expected the original Maia final convolution.');
    const mapping = fields(graph).find(item => item.id === 5 && text(get(item.value, 8)) === '/const/mapping_table');
    const raw = mapping && get(mapping.value, 9);
    if(!raw || raw.length !== 1858 * 4) throw new Error('Missing Lc0 policy mapping table.');
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const policyMap = Int32Array.from({ length: 1858 }, (_, i) => view.getInt32(i * 4, true));
    if(new Set(policyMap).size !== 1858 || policyMap.some(value => value < 0 || value >= 80 * 64))
        throw new Error('Invalid Lc0 convolutional policy mapping.');
    const output = head.inputs[0], required = new Set([output]), retained = [];
    for(const node of [...nodes].reverse()) {
        if(!node.outputs.some(name => required.has(name))) continue;
        retained.unshift(node.bytes);
        node.inputs.forEach(name => required.add(name));
    }
    const dims = join([field(1, field(2, utf8('batch'))),
        ...[features / 64, 8, 8].map(size => field(1, field(1, size, 0)))]);
    const tensor = join([field(1, 1, 0), field(2, dims)]);
    const info = join([field(1, utf8(output)), field(2, field(1, tensor))]);
    const pruned = join([
        ...fields(graph).filter(item => ![1, 12].includes(item.id)
            && (item.id !== 5 || required.has(text(get(item.value, 8))))).map(item => item.raw),
        ...retained.map(node => field(1, node)), field(12, info)
    ]);
    return { model: replace(model, new Map([[7, field(7, pruned)]])), output, policyMap };
}
