import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium, firefox } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const weights = resolve(root, 'app', 'assets', 'lc0-nets', 'maia-1100.pb');

test('converter page works with service-worker isolation and reports failures', { timeout: 180000 }, async () => {
    let missingRuntime = false;
    let serverIsolation = false;
    const server = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`);
        if(!file.startsWith(root + sep)) return res.writeHead(403).end();
        if(missingRuntime && path.endsWith('/dist/lc0.wasm')) return res.writeHead(404).end('Missing runtime');
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
            '.css': 'text/css', '.wasm': 'application/wasm' };
        try {
            const data = await readFile(file);
            const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream',
                'Cache-Control': 'no-store' };
            if(serverIsolation) {
                headers['Cross-Origin-Opener-Policy'] = 'same-origin';
                headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
            }
            res.writeHead(200, headers).end(data);
        } catch(error) {
            if(error.code === 'ENOENT') res.writeHead(404).end('Not found');
            else res.writeHead(500).end(String(error));
        }
    });
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    let browser;
    try {
        browser = await (process.env.LC0_TEST_BROWSER_ENGINE === 'firefox' ? firefox : chromium).launch();
        const page = await browser.newPage({ acceptDownloads: true });
        await page.goto(`http://127.0.0.1:${server.address().port}/tools/leela2onnx/`);
        assert.equal(await page.title(), 'Leela to ONNX Web / A.C.A.S');
        assert.equal(await page.locator('h1').innerText(), 'Leela to ONNX Web');
        assert.equal(await page.locator('.elo-heading p').innerText(), 'Convert Lc0 weights to ONNX right in your browser.');
        const description = await page.locator('meta[name="description"]').getAttribute('content');
        assert.ok(description.length < 160);
        assert.equal(await page.locator('meta[property="og:description"]').getAttribute('content'), description);
        assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'),
            await page.locator('link[rel="canonical"]').getAttribute('href'));
        await page.getByText('Ready.', { exact: true }).waitFor({ timeout: 30000 }).catch(async error => {
            throw new Error(`${error.message}\nStatus: ${await page.locator('#status').textContent()}`);
        });
        assert.equal(await page.evaluate(() => crossOriginIsolated), true);
        assert.equal(await page.locator('#precision').inputValue(), 'f32');
        assert.match(await page.locator('.elo-guide').textContent(), /Both Float16 options can change evaluations and policy outputs/);
        await page.setViewportSize({ width: 375, height: 800 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page should not overflow horizontally');
        assert.equal(await page.locator('#weights').isVisible(), false);
        const chooser = page.waitForEvent('filechooser');
        await page.locator('#choose-weights').click();
        await (await chooser).setFiles([]);
        await page.locator('#convert').click();
        assert.match(await page.locator('#status').textContent(), /Choose a nonempty/);

        await page.locator('#weights').setInputFiles({ name: 'broken.pb', mimeType: 'application/octet-stream',
            buffer: Buffer.from([1, 2, 3, 4]) });
        assert.equal(await page.locator('#weights-name').textContent(), 'broken.pb');
        await page.locator('#convert').click();
        await page.locator('#status[data-error="true"]').waitFor({ timeout: 30000 });
        assert.match(await page.locator('#status').textContent(), /conversion failed/i);
        assert.equal(await page.locator('#diagnostics').evaluate(element => element.open), true);
        assert.notEqual(await page.locator('#log').textContent(), '');

        if(process.env.LC0_TEST_EMBEDDED_WEIGHTS) {
            await page.locator('#weights').setInputFiles(resolve(process.env.LC0_TEST_EMBEDDED_WEIGHTS));
            await page.locator('#precision').selectOption('f16-mixed');
            await page.locator('#convert').click();
            await page.locator('#status[data-error="true"]').waitFor({ timeout: 30000 });
            assert.match(await page.locator('#status').textContent(), /original weights, not embedded ONNX/);
            assert.equal(await page.locator('#download').isHidden(), true);
        }

        let float32Size, float32Model;
        const baseline = {};
        const compressed = gzipSync(await readFile(weights));
        for(const [precision, input] of [
            ['f32', weights],
            ['f32', { name: 'maia-1100.pb.gz', mimeType: 'application/gzip', buffer: compressed }],
            ['f32', { name: 'maia-1100.gz', mimeType: 'application/gzip', buffer: compressed }],
            ['f16-mixed', weights], ['f16', weights]
        ]) {
            await page.locator('#weights').setInputFiles(input);
            await page.locator('#precision').selectOption(precision);
            assert.equal(await page.locator('#download').isHidden(), true);
            await page.locator('#convert').click();
            await page.getByText('Conversion complete.', { exact: true }).waitFor({ timeout: 60000 }).catch(async error => {
                throw new Error(`${error.message}\nStatus: ${await page.locator('#status').textContent()}\nDetails: ${await page.locator('#log').textContent()}`);
            });
            assert.ok(!(await page.locator('#log').textContent()).includes('\x1b'), 'Converter logs must not contain terminal escapes');
            const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
            assert.equal(download.suggestedFilename(), 'maia-1100.onnx');
            const chunks = [];
            for await(const chunk of await download.createReadStream()) chunks.push(chunk);
            const bytes = Buffer.concat(chunks);
            const size = bytes.length;
            assert.ok(size > 100000, `Expected a nonempty ${precision} ONNX model, got ${size} bytes`);
            if(precision === 'f32') {
                if(float32Model) assert.deepEqual(bytes, float32Model, 'Compressed and plain weights should convert identically');
                float32Size = size;
                float32Model = bytes;
            }
            if(precision === 'f16-mixed') assert.ok(size < float32Size * 0.6, 'Mixed model should retain compact half weights');
            if(precision !== 'f16') {
                const outputs = await page.evaluate(async () => {
                    const ort = await import('./runtime/dist/ort.webgpu.bundle.min.mjs');
                    ort.env.wasm.wasmPaths = new URL('./runtime/dist/', location.href).href;
                    ort.env.wasm.numThreads = 1;
                    const model = await (await fetch(document.querySelector('#download').href)).arrayBuffer();
                    const session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
                    try {
                        const input = new ort.Tensor('float32', new Float32Array(112 * 64), [1, 112, 8, 8]);
                        const results = await session.run({ '/input/planes': input });
                        return Object.fromEntries(Object.entries(results).map(([name, tensor]) =>
                            [name, { dims: tensor.dims, finite: tensor.data.every(Number.isFinite), values: Array.from(tensor.data) }]));
                    } finally {
                        await session.release();
                    }
                });
                for(const [name, columns] of [['/output/policy', 1858], ['/output/wdl', 3]]) {
                    assert.deepEqual(outputs[name].dims, [1, columns]);
                    assert.equal(outputs[name].finite, true);
                    if(precision === 'f32') baseline[name] = outputs[name].values;
                    else assert.ok(outputs[name].values.every((value, i) =>
                        Math.abs(value - baseline[name][i]) <= (name === '/output/policy' ? 0.2 : 0.01)),
                    `Downloaded mixed model differs from float32: ${name}`);
                }
            }
        }

        await page.locator('#convert').click();
        await page.locator('#cancel').click();
        assert.equal(await page.locator('#status').textContent(), 'Conversion cancelled.');
        assert.equal(await page.locator('#download').isHidden(), true);
        assert.equal(await page.locator('#convert').isEnabled(), true);

        missingRuntime = true;
        await page.locator('#convert').click();
        await page.locator('#status[data-error="true"]').waitFor({ timeout: 60000 });
        assert.match(await page.locator('#status').textContent(), /failed|abort|wasm/i);

        missingRuntime = false;
        serverIsolation = true;
        const isolatedContext = await browser.newContext();
        const isolatedPage = await isolatedContext.newPage();
        await isolatedPage.goto(`http://127.0.0.1:${server.address().port}/tools/leela2onnx/`);
        await isolatedPage.getByText('Ready.', { exact: true }).waitFor({ timeout: 30000 });
        await isolatedPage.locator('#weights').setInputFiles(weights);
        await isolatedPage.locator('#convert').click();
        await isolatedPage.getByText('Conversion complete.', { exact: true }).waitFor({ timeout: 60000 });
        await isolatedContext.close();
    } finally {
        if(browser) await browser.close();
        await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    }
});
