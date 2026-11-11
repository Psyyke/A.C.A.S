import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const work = resolve(process.env.LC0_BUILD_DIR || join(root, 'build'));
const source = join(work, 'source');
const build = join(work, 'wasm');
const revision = 'fd71a2d921b689c5f479d3227c3806c8e272d9c5';
const emsdk = process.env.EMSDK;
const maxMemory = process.env.LC0_MAX_MEMORY;
if(maxMemory !== undefined && maxMemory !== '4GB')
    throw new Error('LC0_MAX_MEMORY must be 4GB or unset.');
if(!emsdk) throw new Error('Activate Emscripten 4.0.21 before running this build.');
const ortRoot = join(root, 'node_modules', 'onnxruntime-web');
const ortManifest = join(ortRoot, 'package.json');
if(!existsSync(ortManifest) || JSON.parse(readFileSync(ortManifest, 'utf8')).version !== '1.31.1')
    throw new Error('Run npm ci --prefix app\\assets\\engines\\lc0 to install the pinned ONNX Runtime.');
const emdir = join(emsdk, 'upstream', 'emscripten');
const emVersion = JSON.parse(readFileSync(join(emdir, 'emscripten-version.txt'), 'utf8'));
if(emVersion !== '4.0.21') throw new Error(`Expected Emscripten 4.0.21, found ${emVersion}.`);

async function downloadVerified(url, expectedHash) {
    const response = await fetch(url);
    if(!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = createHash('sha256').update(bytes).digest('hex');
    if(hash !== expectedHash) throw new Error(`Unexpected SHA-256 for ${url}: ${hash}`);
    return bytes;
}

function run(command, args, options = {}) {
    console.log(`> ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { stdio: 'inherit', ...options });
    if(result.error) throw result.error;
    if(result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
}

mkdirSync(work, { recursive: true });
if(!existsSync(source)) {
    run('git', ['clone', '--depth', '1', '--branch', 'v0.32.1', '--no-checkout', 'https://github.com/LeelaChessZero/lc0.git', source]);
    run('git', ['checkout', '--detach', revision], { cwd: source });
    run('git', ['submodule', 'update', '--init', '--recursive'], { cwd: source });
}
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' });
if(head.status !== 0 || head.stdout.trim() !== revision)
    throw new Error(`Expected Lc0 revision ${revision} in ${source}`);
const submodule = spawnSync('git', ['submodule', 'status', '--recursive'], { cwd: source, encoding: 'utf8' });
if(submodule.status !== 0 || submodule.stdout.split(/\r?\n/).some(line => line && line[0] !== ' '))
    throw new Error('Lc0 submodules are missing or do not match the pinned revision.');

const patches = new Map([
    ['meson.build', [[
        "  'src/neural/backends/network_check.cc',",
        "  'src/neural/backends/network_browser.cc',\n  'src/neural/backends/network_check.cc',"
    ]]],
    ['src/engine_loop.cc', [
        ['#include "engine.h"', '#include "browser_bridge.h"\n#include "engine.h"'],
        ['while (std::getline(std::cin, line)) {', 'while (ReadBrowserCommand(&line)) {']
    ]],
    ['src/search/classic/node.h', [[
        '#if defined(__i386__) || (defined(__arm__) && !defined(__aarch64__))',
        '#if defined(__wasm32__) || defined(__i386__) || (defined(__arm__) && !defined(__aarch64__))'
    ]]],
    ['src/neural/network_legacy.h', [
        ['explicit BaseWeights(const pblczero::Weights& weights);',
            'explicit BaseWeights(const pblczero::Weights& weights, bool lazy_encoder = false);'],
        ['explicit MultiHeadWeights(const pblczero::Weights& weights);',
            'explicit MultiHeadWeights(const pblczero::Weights& weights, bool lazy_encoder = false);']
    ]],
    ['src/neural/network_legacy.cc', [
        ['BaseWeights::BaseWeights(const pblczero::Weights& weights)',
            'BaseWeights::BaseWeights(const pblczero::Weights& weights, bool lazy_encoder)'],
        ['  for (const auto& enc : weights.encoder()) {\n    encoder.emplace_back(enc);\n  }',
            '  if (!lazy_encoder) {\n    for (const auto& enc : weights.encoder()) {\n      encoder.emplace_back(enc);\n    }\n  }'],
        ['MultiHeadWeights::MultiHeadWeights(const pblczero::Weights& weights)\n    : BaseWeights(weights),',
            'MultiHeadWeights::MultiHeadWeights(const pblczero::Weights& weights, bool lazy_encoder)\n    : BaseWeights(weights, lazy_encoder),']
    ]],
    ['src/neural/onnx/converter.cc', [
        ['#include "neural/onnx/converter.h"',
            '#include "neural/onnx/converter.h"\n#include "neural/onnx/float16_storage.h"'],
        ['    std::initializer_list<int> order) {\n  switch (options_.data_type) {',
            '    std::initializer_list<int> order) {\n  if (options_.fp16_weights) {\n    return std::make_unique<Float16OnnxWeightsAdapter>(weights, dims, order);\n  }\n  switch (options_.data_type) {'],
        ['  MultiHeadWeights weights(src_.weights());',
            '  if (options_.fp16_weights && options_.data_type != WeightsToOnnxConverterOptions::DataType::kFloat32)\n    throw Exception("Float16 weight storage requires float32 computation.");\n  MultiHeadWeights weights(src_.weights(), true);'],
        ['    flow = MakeEncoderLayer(\n        builder, weights.encoder[i], embedding_size, weights.encoder_head_count,',
            '    MultiHeadWeights::EncoderLayer layer(src_.weights().encoder(i));\n    flow = MakeEncoderLayer(\n        builder, layer, embedding_size, weights.encoder_head_count,'],
        ['  onnx->set_model(builder.OutputAsString());',
            '  if (options_.fp16_weights) PromoteFloat16Weights(builder.mutable_proto());\n  onnx->set_model(builder.OutputAsString());']
    ]],
    ['src/neural/onnx/builder.h', [[
        '  const pblczero::ModelProto& as_proto() const { return model_; }',
        '  const pblczero::ModelProto& as_proto() const { return model_; }\n  pblczero::ModelProto* mutable_proto() { return &model_; }'
    ]]],
    ['src/neural/onnx/converter.h', [[
        '  DataType data_type = DataType::kFloat32;',
        '  DataType data_type = DataType::kFloat32;\n  bool fp16_weights = false;'
    ]]],
    ['src/tools/leela2onnx.cc', [
        ['const OptionId kOnnxDataTypeId{"onnx-data-type", "",',
            'const OptionId kOnnxFp16WeightsId{"onnx-fp16-weights", "",\n    "Store weights in float16 with float32 computation."};\nconst OptionId kOnnxDataTypeId{"onnx-data-type", "",'],
        ['  options->Add<BoolOption>(kHloAllowPartialResultId);',
            '  options->Add<BoolOption>(kHloAllowPartialResultId);\n  options->Add<BoolOption>(kOnnxFp16WeightsId) = false;'],
        ['    onnx_options.ir = dict.Get<int>(kOnnxIrId);',
            '    onnx_options.ir = dict.Get<int>(kOnnxIrId);\n    onnx_options.fp16_weights = dict.Get<bool>(kOnnxFp16WeightsId);'],
        ['    COUT << "The leela network already has ONNX network embedded, extracting.";',
            '    if (dict.Get<bool>(kOnnxFp16WeightsId))\n      throw Exception("Float16 weight storage requires original weights, not embedded ONNX.");\n    COUT << "The leela network already has ONNX network embedded, extracting.";']
    ]],
    ['src/tools/onnx2leela.cc', [['#include <fstream>', '#include <fstream>\n#include <iterator>']]]
]);
for(const [file, replacements] of patches) {
    const original = spawnSync('git', ['show', `HEAD:${file}`], { cwd: source, encoding: 'utf8' });
    if(original.status !== 0) throw new Error(`Cannot read pinned source ${file}`);
    let patched = original.stdout;
    for(const [before, after] of replacements) {
        const index = patched.indexOf(before);
        if(index < 0 || patched.indexOf(before, index + before.length) !== -1)
            throw new Error(`Unexpected pinned source: ${file}`);
        patched = patched.slice(0, index) + after + patched.slice(index + before.length);
    }
    const filename = join(source, ...file.split('/'));
    const current = readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
    if(current !== original.stdout && current !== patched)
        throw new Error(`Unexpected modifications to ${filename}`);
    if(current !== patched) writeFileSync(filename, patched);
}
const status = spawnSync('git', ['diff', '--name-only'], { cwd: source, encoding: 'utf8' });
if(status.status !== 0 || status.stdout.split(/\r?\n/).some(file => file && !patches.has(file)))
    throw new Error('Unexpected modifications in the Lc0 source checkout.');
copyFileSync(join(root, 'bridge.h'), join(source, 'src', 'browser_bridge.h'));
copyFileSync(join(root, 'network_browser.cc'), join(source, 'src', 'neural', 'backends', 'network_browser.cc'));
copyFileSync(join(root, 'float16_storage.h'), join(source, 'src', 'neural', 'onnx', 'float16_storage.h'));

const ext = process.platform === 'win32' ? '.bat' : '';
const compiler = name => join(emdir, name + ext).replaceAll('\\', '/');
const quote = value => `'${value.replaceAll("'", "\\'")}'`;
const cross = `[binaries]
c = ${quote(compiler('emcc'))}
cpp = ${quote(compiler('em++'))}
ar = ${quote(compiler('emar'))}
strip = ${quote(compiler('emstrip'))}

[host_machine]
system = 'emscripten'
cpu_family = 'wasm32'
cpu = 'wasm32'
endian = 'little'

[built-in options]
c_args = ['-pthread', '-msimd128']
cpp_args = ['-pthread', '-msimd128', '-fexceptions']
c_link_args = ['-pthread', '-sUSE_ZLIB=1']
cpp_link_args = ['-O3', '-pthread', '-fexceptions', '-sUSE_ZLIB=1', '-sALLOW_MEMORY_GROWTH=1', ${maxMemory ? "'-sMAXIMUM_MEMORY=4GB', " : ''}'-sPROXY_TO_PTHREAD=1', '-sPTHREAD_POOL_SIZE=8', '-sSTACK_SIZE=5242880', '-sDEFAULT_PTHREAD_STACK_SIZE=5242880', '-sEXIT_RUNTIME=1', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sFORCE_FILESYSTEM=1', '-sEXPORTED_FUNCTIONS=["_main","_malloc","_free"]', '-sEXPORTED_RUNTIME_METHODS=["FS","ccall"]']
`;
const crossFile = join(work, 'emscripten.ini');
const options = [
    '--buildtype=release', '-Dgtest=false', '-Dnative_arch=false', '-Dpopcnt=false',
    '-Df16c=false', '-Dispc=false', '-Dopenblas=false', '-Dplain_cuda=false',
    '-Donnx=false', '-Ddefault_backend=eigen'
];
if(!existsSync(join(build, 'build.ninja'))) {
    writeFileSync(crossFile, cross);
    run('meson', ['setup', build, source, '--cross-file', crossFile, ...options]);
    writeFileSync(join(work, 'configuration.json'), JSON.stringify({ cross, options }));
} else {
    const configPath = join(work, 'configuration.json');
    const expected = JSON.stringify({ cross, options });
    if(!existsSync(configPath) || readFileSync(configPath, 'utf8') !== expected
        || !existsSync(crossFile) || readFileSync(crossFile, 'utf8') !== cross)
        throw new Error(`Build configuration changed. Choose a fresh LC0_BUILD_DIR instead of reusing ${work}.`);
}
run('meson', ['compile', '-C', build]);
const noticeBase = 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.31.1';
const notices = await Promise.all([
    ['LICENSE', 'ONNXRUNTIME-LICENSE', '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c'],
    ['ThirdPartyNotices.txt', 'ONNXRUNTIME-THIRD-PARTY-NOTICES.txt', '143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3']
].map(async ([name, output, hash]) => [output, await downloadVerified(`${noticeBase}/${name}`, hash)]));
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
for(const name of ['lc0.js', 'lc0.wasm']) copyFileSync(join(build, name), join(dist, name));
const ort = join(ortRoot, 'dist');
for(const name of ['ort.webgpu.bundle.min.mjs', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'])
    copyFileSync(join(ort, name), join(dist, name));
copyFileSync(join(source, 'COPYING'), join(dist, 'LC0-COPYING'));
for(const [output, bytes] of notices) writeFileSync(join(dist, output), bytes);
writeFileSync(join(dist, 'build-info.json'), JSON.stringify({
    lc0Revision: revision, emscripten: emVersion, onnxruntimeWeb: '1.31.1',
    maximumMemory: maxMemory || '2GB', float16WeightStorage: true
}, null, 2) + '\n');
console.log(`Built experimental Lc0 runtime in ${dist}.`);
