import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFloat16 } from './float16.js';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { onnx } = require(join(root, 'node_modules', 'onnxruntime-web', 'lib', 'onnxjs', 'ort-schema', 'protobuf', 'onnx.js'));

export function createHalfPartials(bytes, channels = 64) {
    if(!Number.isSafeInteger(channels) || channels < 1 || channels > 256)
        throw new Error('Partial width must be an integer from 1 to 256.');
    const model = onnx.ModelProto.decode(bytes);
    const opset = model.opsetImport.find(entry => !entry.domain);
    if(!opset || Number(opset.version) < 13)
        throw new Error('Partial convolutions require ONNX opset 13 or later for explicit Split sizes.');
    const graph = model.graph;
    if(!graph || !graph.input.length || !graph.output.length
        || [...graph.input, ...graph.output].some(value => value.type?.tensorType?.elemType !== 1))
        throw new Error('Expected an ONNX graph with float32 inputs and outputs.');
    const prefix = '/acas_half_partials/';
    if([...graph.node.flatMap(node => [...node.input, ...node.output, node.name]),
        ...graph.initializer.map(tensor => tensor.name)].some(name => name?.startsWith(prefix)))
        throw new Error('Partial convolution names already exist in the input graph.');
    const initializers = new Map(graph.initializer.map(tensor => [tensor.name, tensor]));
    const nodes = [];
    let converted = 0;
    const add = (opType, input, output, attribute = []) =>
        nodes.push(onnx.NodeProto.create({ opType, input, output, attribute, name: output[0] }));
    const integer = (name, value) => ({ name, type: 2, i: value });
    for(const node of graph.node) {
        if(node.attribute.some(attribute => attribute.g || attribute.graphs.length))
            throw new Error('Subgraphs are not supported by this experimental rewrite.');
        if(node.opType !== 'Conv') { nodes.push(node); continue; }
        if(node.domain || node.input.length < 2 || node.input.length > 3 || node.output.length !== 1
            || node.attribute.some(attribute => attribute.name === 'group' && Number(attribute.i) !== 1))
            throw new Error(`Unsupported convolution: ${node.name}`);
        const kernel = initializers.get(node.input[1]);
        const dims = kernel?.dims.map(Number);
        if(!kernel || kernel.dataType !== 1 || dims.length !== 4
            || dims.some(dim => !Number.isSafeInteger(dim) || dim < 1) || !kernel.rawData.length
            || kernel.externalData.length)
            throw new Error(`Expected an inline float32 convolution kernel: ${node.name}`);
        const [outputs, inputs, height, width] = dims;
        if(kernel.rawData.length !== outputs * inputs * height * width * 4)
            throw new Error(`Convolution kernel size mismatch: ${node.name}`);
        const data = new DataView(kernel.rawData.buffer, kernel.rawData.byteOffset, kernel.rawData.byteLength);
        const name = `${prefix}${converted++}`;
        const starts = Array.from({ length: Math.ceil(inputs / channels) }, (_, index) => index * channels);
        const sizes = starts.map(start => Math.min(channels, inputs - start));
        const sizeBytes = new Uint8Array(sizes.length * 8);
        sizes.forEach((size, index) => new DataView(sizeBytes.buffer).setBigInt64(index * 8, BigInt(size), true));
        graph.initializer.push(onnx.TensorProto.create({
            name: `${name}/sizes`, dims: [sizes.length], dataType: 7, rawData: sizeBytes
        }));
        const splits = starts.map(start => `${name}/split_${start}`);
        add('Split', [node.input[0], `${name}/sizes`], splits, [integer('axis', 1)]);
        const partials = [];
        starts.forEach((start, index) => {
            const part = `${name}/part_${start}`;
            const count = sizes[index];
            const values = new Uint8Array(outputs * count * height * width * 2);
            const view = new DataView(values.buffer);
            let offset = 0;
            for(let out = 0; out < outputs; out++) {
                for(let channel = start; channel < start + count; channel++) {
                    for(let square = 0; square < height * width; square++) {
                        const value = data.getFloat32(((out * inputs + channel) * height * width + square) * 4, true);
                        const half = encodeFloat16(value);
                        if(!Number.isFinite(value) || (half & 0x7c00) === 0x7c00)
                            throw new Error(`Non-finite or overflowing half weight: ${node.name}`);
                        view.setUint16(offset, half, true);
                        offset += 2;
                    }
                }
            }
            graph.initializer.push(onnx.TensorProto.create({
                name: `${part}/weights`, dims: [outputs, count, height, width], dataType: 10, rawData: values
            }));
            add('Cast', [splits[index]], [`${part}/input`], [integer('to', 10)]);
            add('Conv', [`${part}/input`, `${part}/weights`], [`${part}/half`], node.attribute);
            add('Cast', [`${part}/half`], [`${part}/float`], [integer('to', 1)]);
            partials.push(`${part}/float`);
        });
        while(partials.length > 1) {
            const left = partials.shift(), right = partials.shift();
            const sum = `${left}/sum`;
            add('Add', [left, right], [sum]);
            partials.push(sum);
        }
        if(node.input[2]) {
            const bias = initializers.get(node.input[2]);
            if(!bias || bias.dataType !== 1 || bias.dims.length !== 1 || Number(bias.dims[0]) !== outputs)
                throw new Error(`Expected a float32 convolution bias: ${node.name}`);
            graph.initializer.push(onnx.TensorProto.create({ ...bias, name: `${name}/bias`, dims: [1, outputs, 1, 1] }));
            add('Add', [partials[0], `${name}/bias`], node.output);
        } else {
            add('Identity', partials, node.output);
        }
    }
    if(!converted) throw new Error('No convolutions found. This probe does not support transformer-only graphs.');
    graph.node = nodes;
    const used = new Set([...nodes.flatMap(node => node.input), ...graph.output.map(value => value.name)]);
    graph.initializer = graph.initializer.filter(tensor => used.has(tensor.name));
    const error = onnx.ModelProto.verify(model);
    if(error) throw new Error(`Invalid rewritten model: ${error}`);
    return onnx.ModelProto.encode(model).finish();
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [, , input, output, width = '64'] = process.argv;
    if(!input || !output || resolve(input) === resolve(output))
        throw new Error('Usage: node half-partials.mjs input-f32.onnx output-experimental.onnx [channels]. Use different paths.');
    await writeFile(output, createHalfPartials(await readFile(input), Number(width)));
    console.log(`Created experimental FP16 convolution partials in ${output}. Not enabled in the app.`);
}
