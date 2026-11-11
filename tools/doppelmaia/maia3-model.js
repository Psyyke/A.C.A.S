import { fields, field, get, join, replace } from './weights.js';
import { repertoireProjection } from './repertoire.js';

export const adapterSize = 64;
export const moveCount = 4352;
const encoder = new TextEncoder(), decoder = new TextDecoder();
const text = value => decoder.decode(value);
const string = (id, value) => field(id, encoder.encode(value));
const float32 = values => new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
const featureInput = '/model/last_ln/LayerNormalization_output_0';

export function halfToFloat(bits) {
    const sign = bits & 0x8000 ? -1 : 1, exponent = (bits >> 10) & 31, fraction = bits & 1023;
    return sign * (exponent === 31 ? fraction ? NaN : Infinity
        : exponent ? 2 ** (exponent - 15) * (1 + fraction / 1024) : 2 ** -14 * fraction / 1024);
}

function floatTensor(bytes) {
    if(get(bytes, 2) !== 10) return bytes;
    const raw = get(bytes, 9);
    if(!raw || raw.length % 2) throw new Error('Unsupported Maia 3 float16 tensor encoding.');
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const values = Float32Array.from({ length: raw.length / 2 }, (_, i) => halfToFloat(view.getUint16(i * 2, true)));
    if(values.some(value => !Number.isFinite(value))) throw new Error('Maia 3 contains non-finite model weights.');
    return replace(bytes, new Map([[2, field(2, 1, 0)], [9, field(9, float32(values))]]));
}

function floatValueInfo(bytes) {
    const type = get(bytes, 2), tensor = type && get(type, 1);
    if(!tensor || get(tensor, 1) !== 10) return bytes;
    return replace(bytes, new Map([[2, field(2, replace(type,
        new Map([[1, field(1, replace(tensor, new Map([[1, field(1, 1, 0)]])))]])))]]));
}

export function float32Maia3(bytes) {
    const graph = get(bytes, 7);
    if(!graph) throw new Error('Maia 3 model has no ONNX graph.');
    const converted = fields(graph).map(item => {
        if(item.id === 5) return field(5, floatTensor(item.value));
        if([11, 12, 13].includes(item.id)) return field(item.id, floatValueInfo(item.value));
        if(item.id !== 1) return item.raw;
        return field(1, join(fields(item.value).map(part => {
            if(part.id !== 5) return part.raw;
            let attribute = part.value;
            if(text(get(attribute, 1)) === 'to' && get(attribute, 3) === 10)
                attribute = replace(attribute, new Map([[3, field(3, 1, 0)]]));
            if(get(attribute, 5))
                attribute = replace(attribute, new Map([[5, field(5, floatTensor(get(attribute, 5)))]]));
            return field(5, attribute);
        })));
    });
    return replace(bytes, new Map([[7, field(7, join(converted))]]));
}

export function historyMaia3(bytes) {
    const graph = fields(get(bytes, 7));
    const tile = graph.find(item => item.id === 1 && text(get(item.value, 3)) === '/Tile'
        && text(get(item.value, 4)) === 'Tile');
    if(!tile) throw new Error('Expected the bundled Maia 3 repeated-board wrapper.');
    const inputs = fields(tile.value).filter(part => part.id === 1).map(part => text(part.value));
    const output = text(get(tile.value, 2));
    const widths = new Set(['tokens', inputs[0], 'tokens_cast_to_/Shape']);
    const widen = value => {
        const type = get(value, 2), tensor = get(type, 1), dimensions = fields(get(tensor, 2));
        if(dimensions.length !== 3 || get(dimensions[2].value, 1) !== 12)
            throw new Error('Unsupported Maia 3 token dimensions.');
        dimensions[2] = { raw: field(1, field(1, 96, 0)) };
        const expanded = replace(tensor, new Map([[2, field(2, join(dimensions.map(part => part.raw)))]]));
        return replace(value, new Map([[2, field(2, replace(type, new Map([[1, field(1, expanded)]])))]]));
    };
    const used = new Set(graph.filter(item => item.id === 1 && item !== tile)
        .flatMap(item => fields(item.value).filter(part => part.id === 1).map(part => text(part.value))));
    const converted = graph.flatMap(item => {
        if(item === tile || item.id === 13 && text(get(item.value, 1)) === output
            || item.id === 5 && text(get(item.value, 8)) === inputs[1] && !used.has(inputs[1])) return [];
        if([11, 13].includes(item.id) && widths.has(text(get(item.value, 1))))
            return [field(item.id, widen(item.value))];
        if(item.id !== 1) return [item.raw];
        return [field(1, join(fields(item.value).map(part =>
            part.id === 1 && text(part.value) === output ? string(1, inputs[0]) : part.raw)))];
    });
    const model = replace(bytes, new Map([[7, field(7, join(converted))]]));
    return join([model, field(14, join([string(1, 'acas.maia3.history'),
        string(2, '8:oldest-first:per-frame-turn:earliest-padding')]))]);
}

function valueInfo(name, width) {
    const dimension = value => field(1, typeof value === 'string' ? string(2, value) : field(1, value, 0));
    return join([string(1, name), field(2, field(1, join([
        field(1, 1, 0), field(2, join([dimension('batch_size'), dimension(width)]))
    ])))]);
}

function tensor(name, dims, values) {
    return field(5, join([...dims.map(dim => field(1, dim, 0)), field(2, 1, 0),
        string(8, name), field(9, float32(values))]));
}

function node(op, inputs, output, attributes = []) {
    return field(1, join([...inputs.map(input => string(1, input)), string(2, output),
        string(3, output), string(4, op), ...attributes.map(attribute => field(5, attribute))]));
}

const intAttribute = (name, value) => join([string(1, name), field(3, value, 0), field(20, 2, 0)]);
const intsAttribute = (name, values) => join([string(1, name), ...values.map(value => field(8, value, 0)), field(20, 7, 0)]);
const intTensor = (name, values) => field(5, join([field(1, values.length, 0), field(2, 7, 0),
    string(8, name), field(9, new Uint8Array(BigInt64Array.from(values, BigInt).buffer))]));

export function projection() {
    let seed = 42;
    return Float32Array.from({ length: 512 * adapterSize }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return (seed & 0x80000000 ? 1 : -1) / Math.sqrt(512);
    });
}

// Keep the shipped model as the only download. Float32 also works on GPUs without shader-f16.
export function prepareMaia3(bytes, featureSize = adapterSize) {
    if(![64, 512].includes(featureSize)) throw new Error('Unsupported Maia 3 feature size.');
    bytes = float32Maia3(bytes);
    const graph = get(bytes, 7);
    if(!graph) throw new Error('Maia 3 model has no ONNX graph.');
    let foundFeature = false, foundPolicy = false;
    const graphFields = fields(graph);
    const converted = graphFields.map(item => {
        if(item.id !== 1) return item.raw;
        const parts = fields(item.value).map(part => {
            if(part.id === 2) {
                const name = text(part.value);
                if(name === featureInput) foundFeature = true;
                if(name === 'logits_move') { foundPolicy = true; return string(2, 'acas_base_logits'); }
            }
            return part.raw;
        });
        return field(1, join(parts));
    });
    if(!foundFeature || !foundPolicy) throw new Error('Unsupported Maia 3 architecture. Expected the bundled 512-feature model.');
    const graphBytes = join([...converted.filter((_, i) => !(graphFields[i].id === 12
        && text(get(graphFields[i].value, 1)) === 'logits_move')),
        ...(featureSize === 64 ? [
            tensor('acas_projection', [512, adapterSize], projection()),
            node('MatMul', [featureInput, 'acas_projection'], 'acas_projected')
        ] : []),
        node('Tanh', [featureSize === 64 ? 'acas_projected' : featureInput], 'acas_features'),
        field(12, valueInfo('acas_base_logits', moveCount)), field(12, valueInfo('acas_features', featureSize))]);
    return replace(bytes, new Map([[7, field(7, graphBytes)]]));
}

export function exportMaia3(prepared, matrix, bias, repertoire = [], repertoireStrength = 0) {
    const featureSize = matrix.length / moveCount;
    if(![64, 512].includes(featureSize) || bias.length !== moveCount
        || matrix.some(value => !Number.isFinite(value)) || bias.some(value => !Number.isFinite(value)))
        throw new Error('Invalid Maia 3 adapter weights.');
    if(!Array.isArray(repertoire) || repertoire.length > 128 || !Number.isFinite(repertoireStrength)
        || repertoireStrength < 0 || repertoireStrength > 1 || repertoire.some(entry =>
            entry.signature?.length !== 16 || entry.delta?.length !== moveCount
            || Array.from(entry.signature).some(value => !Number.isInteger(value) || value < 0 || value > 28560)
            || Array.from(entry.delta).some(value => !Number.isFinite(value) || Math.abs(value) > 4)))
        throw new Error('Invalid personal opening repertoire.');
    if(new Set(repertoire.map(entry => Array.from(entry.signature).join(','))).size !== repertoire.length)
        throw new Error('Duplicate personal opening position.');
    const hasRepertoire = repertoire.length > 0 && repertoireStrength > 0;
    const graph = join([...fields(get(prepared, 7)).filter(item => item.id !== 12
        || !['acas_features', 'acas_base_logits'].includes(text(get(item.value, 1)))).map(item => item.raw),
        tensor('acas_adapter_weight', [featureSize, moveCount], matrix),
        tensor('acas_adapter_bias', [moveCount], bias),
        node('MatMul', ['acas_features', 'acas_adapter_weight'], 'acas_residual'),
        node('Add', ['acas_residual', 'acas_adapter_bias'], 'acas_shift'),
        node('Add', ['acas_base_logits', 'acas_shift'], hasRepertoire ? 'acas_personal_logits' : 'logits_move'),
        ...(hasRepertoire ? [
            intTensor('acas_flat_shape', [0, 768]), intTensor('acas_board_axis', [1]),
            tensor('acas_board_projection', [768, 16], repertoireProjection()),
            tensor('acas_repertoire_boards', [1, repertoire.length, 16], Float32Array.from(repertoire.flatMap(entry => [...entry.signature]))),
            tensor('acas_repertoire_deltas', [repertoire.length, moveCount],
                Float32Array.from(repertoire.flatMap(entry => Array.from(entry.delta, value => value * repertoireStrength)))),
            node('Reshape', ['tokens', 'acas_flat_shape'], 'acas_flat_board'),
            node('MatMul', ['acas_flat_board', 'acas_board_projection'], 'acas_board_signature'),
            node('Unsqueeze', ['acas_board_signature', 'acas_board_axis'], 'acas_board_for_comparison'),
            node('Equal', ['acas_board_for_comparison', 'acas_repertoire_boards'], 'acas_board_equal'),
            node('Cast', ['acas_board_equal'], 'acas_board_equal_float', [intAttribute('to', 1)]),
            node('ReduceMin', ['acas_board_equal_float'], 'acas_board_match', [intsAttribute('axes', [2]), intAttribute('keepdims', 0)]),
            node('MatMul', ['acas_board_match', 'acas_repertoire_deltas'], 'acas_opening_delta'),
            node('Add', ['acas_personal_logits', 'acas_opening_delta'], 'logits_move')
        ] : []),
        field(12, valueInfo('logits_move', moveCount))]);
    return replace(prepared, new Map([[7, field(7, graph)]]));
}
