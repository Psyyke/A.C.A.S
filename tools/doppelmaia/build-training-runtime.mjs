import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = join(root, 'training-runtime');
await mkdir(output, { recursive: true });
await build({
    entryPoints: [join(root, 'training-runtime-entry.js')],
    outfile: join(output, 'tfjs-webgpu.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'linked'
});
