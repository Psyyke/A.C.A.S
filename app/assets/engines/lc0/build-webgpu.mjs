import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchPackedAccumulation } from './webgpu-precision-patches.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const ort = join(root, 'node_modules', 'onnxruntime-web');
const output = resolve(process.env.LC0_JSEP_BUILD_DIR || join(root, 'build', 'jsep'));
if(output === resolve(root, 'dist'))
    throw new Error('Experimental JSEP builds must not overwrite the deployed dist runtime.');
const widened = process.env.LC0_JSEP_FP32_ACCUMULATION === '1';
const halfProducts = process.env.LC0_JSEP_FP16_PRODUCTS === '1';
if(halfProducts && !widened)
    throw new Error('FP16 product probing requires FP32 accumulation.');
if(JSON.parse(await readFile(join(ort, 'package.json'), 'utf8')).version !== '1.31.1')
    throw new Error('The experimental shader build requires ONNX Runtime Web 1.31.1.');
await mkdir(output, { recursive: true });
let patched = 0;
await build({
    entryPoints: [join(ort, 'lib', 'index.ts')],
    outfile: join(output, 'ort.webgpu.bundle.min.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    external: ['node:fs/promises', 'node:fs', 'node:os', 'module', 'worker_threads'],
    plugins: widened ? [{
        name: 'checked-fp32-accumulators',
        setup(build) {
            build.onLoad({ filter: /[\\/]matmul_packed_webgpu\.ts$/ }, async ({ path }) => {
                patched++;
                return { contents: patchPackedAccumulation(await readFile(path, 'utf8'), halfProducts), loader: 'ts' };
            });
        }
    }] : [],
    define: {
        'BUILD_DEFS.DISABLE_WEBGL': 'true',
        'BUILD_DEFS.DISABLE_JSEP': 'false',
        'BUILD_DEFS.DISABLE_WEBGPU': 'true',
        'BUILD_DEFS.DISABLE_WEBNN': 'true',
        'BUILD_DEFS.DISABLE_WASM': 'false',
        'BUILD_DEFS.DISABLE_WASM_PROXY': 'true',
        'BUILD_DEFS.ENABLE_JSPI': 'false',
        'BUILD_DEFS.ENABLE_BUNDLE_WASM_JS': 'false',
        'BUILD_DEFS.IS_ESM': 'true',
        'BUILD_DEFS.ESM_IMPORT_META_URL': 'import.meta.url',
        'BUILD_DEFS.BUNDLE_FILENAME': '"ort.webgpu.bundle.min.mjs"'
    }
});
if(widened && patched !== 1) throw new Error(`Expected one patched packed kernel source, found ${patched}.`);
for(const name of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'])
    await copyFile(join(ort, 'dist', name), join(output, name));
for(const [name, hash] of [
    ['ONNXRUNTIME-LICENSE', '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c'],
    ['ONNXRUNTIME-THIRD-PARTY-NOTICES.txt', '143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3']
]) {
    const bytes = await readFile(join(root, 'dist', name));
    if(createHash('sha256').update(bytes).digest('hex') !== hash)
        throw new Error(`Unexpected ONNX Runtime notice: ${name}`);
    await writeFile(join(output, name), bytes);
}
await writeFile(join(output, 'build-info.json'), JSON.stringify({
    onnxruntimeWeb: '1.31.1', backend: 'jsep', packedFp32Accumulation: widened, halfProducts
}, null, 2) + '\n');
console.log(`Built experimental JSEP runtime in ${output}. Deployed runtime is unchanged.`);
