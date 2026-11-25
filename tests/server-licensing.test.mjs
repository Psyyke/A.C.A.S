import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import licenses from '../appServer/scripts/prepare-licenses.cjs';

async function fixture(t) {
    const root = await mkdtemp(path.join(tmpdir(), 'acas-licenses-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const packages = {
        '': { name: 'test-app' },
        'node_modules/parent': { version: '1.0.0', license: 'MIT' },
        'node_modules/parent/node_modules/child': { version: '2.0.0', license: 'BSD-3-Clause' },
        'node_modules/build-only': { version: '3.0.0', license: 'unreviewed', dev: true }
    };
    async function put(file, content) {
        const target = path.join(root, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
    }
    async function saveLock() {
        await put('package-lock.json', JSON.stringify({ lockfileVersion: 3, packages }));
    }
    await saveLock();
    await put('package.json', JSON.stringify({ type: 'module', version: '1.0.0', description: 'Test application' }));
    await put('LICENSE', 'Application GPL licence');
    await put('backend/aiSetup.js', `export const PENA_RELEASE = {
        runtimeTag: 'test-runtime', builds: { cpu: { files: [{ name: 'runtime.zip' }] } },
        model: { name: 'test-model.gguf', url: 'https://huggingface.co/example/model/resolve/revision/test-model.gguf' },
        lora: { url: 'https://huggingface.co/example/pena/resolve/revision/pena-lora.gguf' }
    };`);
    for(const [location, dependency] of Object.entries(packages)) {
        if(!location || dependency.dev) continue;
        const name = location.split('/').at(-1);
        await put(`${location}/package.json`, JSON.stringify({ name, ...dependency }));
        await put(`${location}/LICENSE`, `${name} copyright, permission and disclaimer`);
        await put(`${location}/NOTICE`, `${name} additional attribution`);
    }
    await put('licenses/README.txt', 'Third-party component inventory');
    await put('licenses/Bootstrap-Icons-LICENSE.txt', 'Icon copyright and MIT permission');
    for(const name of ['Inkling', 'llama.cpp', 'llama-b12633-win-cpu-dependencies'])
        await put(`licenses/${name}-LICENSE.txt`, `${name} licence and copyright`);
    await put('ui/fonts/OFL.txt', 'Font copyright, reserved names and OFL');
    await put('node_modules/electron/package.json', JSON.stringify({ version: '1.0.0' }));
    await put('node_modules/electron/dist/LICENSE', 'Electron copyright and MIT permission');
    await put('node_modules/electron/dist/LICENSES.chromium.html', '<html>Chromium notices</html>');
    return { root, packages, put, saveLock };
}

test('notice generation preserves nested runtime licences, NOTICE files and standalone Electron notices', async t => {
    const { root } = await fixture(t);
    const output = await licenses.prepareLicenses(root);
    const combined = await readFile(path.join(output, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
    for(const location of ['node_modules/parent', 'node_modules/parent/node_modules/child']) {
        for(const name of ['LICENSE', 'NOTICE'])
            assert.ok(combined.includes(await readFile(path.join(root, location, name), 'utf8')));
    }
    assert.match(combined, /child 2\.0\.0/);
    assert.doesNotMatch(combined, /build-only/);
    for(const file of ['licenses/Bootstrap-Icons-LICENSE.txt', 'ui/fonts/OFL.txt'])
        assert.ok(combined.includes(await readFile(path.join(root, file), 'utf8')));
    for(const [installed, original] of [
        ['LICENSE.electron.txt', 'LICENSE'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']
    ]) {
        assert.deepEqual(await readFile(path.join(output, installed)),
            await readFile(path.join(root, 'node_modules', 'electron', 'dist', original)));
    }
    const credits = JSON.parse(await readFile(path.join(output, 'credits.json'), 'utf8'));
    const entries = credits.flatMap(group => group.entries);
    const child = entries.find(entry => entry.name === 'child');
    assert.equal(child.version, '2.0.0');
    assert.ok(child.licenseText.includes('child additional attribution'));
    assert.equal(entries.some(entry => entry.name === 'build-only'), false);
    assert.equal(entries.find(entry => entry.name === 'test-model.gguf').source,
        'https://huggingface.co/example/model/blob/revision/test-model.gguf');
    const pena = entries.find(entry => entry.name === 'Pena chess LoRA');
    assert.equal(pena.source, 'https://huggingface.co/example/pena/blob/revision/pena-lora.gguf');
    assert.ok(pena.licenseText.includes(await readFile(path.join(root, 'LICENSE'), 'utf8')));
    assert.ok(pena.licenseText.includes(await readFile(path.join(root, 'licenses', 'Inkling-LICENSE.txt'), 'utf8')));
    assert.match(pena.description, /plain Inkling base/);
    assert.ok(credits.find(group => group.id === 'fonts').entries.every(entry => entry.licenseText));
});

test('notice generation stops for unreviewed licences and installed/locked version mismatches', async t => {
    const { root, packages, put, saveLock } = await fixture(t);
    packages['node_modules/parent'].license = 'unreviewed';
    await saveLock();
    await assert.rejects(licenses.prepareLicenses(root), /Review the licence of node_modules\/parent/);
    packages['node_modules/parent'].license = 'MIT';
    await saveLock();
    await put('node_modules/parent/package.json', JSON.stringify({ name: 'parent', version: '1.0.1', license: 'MIT' }));
    await assert.rejects(licenses.prepareLicenses(root), /Installed metadata differs/);
});

test('notice generation stops when an attribution is present but the full licence or Chromium notices are missing', async t => {
    const { root, put } = await fixture(t);
    const license = path.join(root, 'node_modules', 'parent', 'LICENSE');
    await rm(license);
    await assert.rejects(licenses.prepareLicenses(root), /No licence text found/);
    await put('node_modules/parent/LICENSE', 'Parent copyright and permission');
    await rm(path.join(root, 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html'));
    await assert.rejects(licenses.prepareLicenses(root), /Electron distribution licence files are missing/);
});
