import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

test('Pena ships runtime assets without training, build dependencies or loose test scripts', () => {
    for(const entry of readdirSync(root, { withFileTypes: true })) {
        assert.equal(entry.isSymbolicLink(), false, entry.name);
        if(entry.isDirectory()) assert.ok(['vendor', 'tests'].includes(entry.name), entry.name);
        else assert.ok(/(?:\.js|\.css|\.txt)$/.test(entry.name)
            || ['.gitignore', '.htaccess', 'package.json', 'build-knowledge.mjs', 'silero-vad-LICENSE', 'NOTICE'].includes(entry.name), entry.name);
    }
    assert.equal(JSON.parse(readFileSync(new URL('package.json', root))).dependencies, undefined);
    for(const file of ['tokenizer.js', 'tokenizers-LICENSE', 'wllama.js', 'wllama.wasm', 'wllama-LICENSE', 'llama-cpp-LICENSE', 'recognition-worker.js', 'vad-worker.js',
        'ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.wasm', 'onnxruntime-web-LICENSE',
        'zonos3/engine.js', 'zonos3/worker.js', 'zonos3/codec-worker.js', 'zonos3/frame.js', 'zonos3/frame.html', 'zonos3/LICENSE',
        'zonos3/NOTICE', 'zonos3/third_party/licenses/fusealign-multilingual-Apache-2.0.txt',
        'zonos3/third_party/licenses/z-speech-alignment-MIT.txt', 'zonos3/gpu-oom.patch'])
        assert.ok(existsSync(new URL(`vendor/${file}`, root)), file);
});

test('live entry points and worker assets resolve without the retired folder or Desktop tooling', () => {
    const visited = new Set();
    function visit(url) {
        if(visited.has(url.href)) return;
        visited.add(url.href);
        assert.ok(existsSync(url), fileURLToPath(url));
        assert.doesNotMatch(url.href, /\/pena\/|\/Users\/|\/tools\/pena-v2\/|\/tests\//i);
        if(!url.href.endsWith('.js') || url.href.includes('/vendor/')) return;
        const source = readFileSync(url, 'utf8');
        if(url.href.startsWith(root.href)) assert.doesNotMatch(source, /['"`][A-Za-z]:[\\/]|file:\/\/|Pena-chat|tools-dev\/pena/);
        for(const [, path] of source.matchAll(/(?:from\s*|import\s*\(\s*|new URL\(\s*)['"](\.[^'"]+)['"]/g)) {
            const target = new URL(path, url);
            visit(target);
        }
    }
    for(const name of ['service.js', 'migrate.js', 'app-settings.js', 'app-worker.js', 'voice-worker.js']) visit(new URL(name, root));
});
