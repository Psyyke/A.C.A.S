import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

test('selected Maia 3 runtime reaches actual inference after changes and reloads', { timeout: 240000 }, async () => {
    const gpu = process.env.MAIA3_RUNTIME_GPU === '1';
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const providers = [];
    const source = await readFile(new URL('../app/assets/engines/Maia3/maiaWorker.js', import.meta.url), 'utf8');
    const marker = 'result = await session.run(feeds);';
    assert.ok(source.includes(marker));
    const serve = server.listeners('request')[0];
    server.removeListener('request', serve);
    server.on('request', (request, response) => {
        const requestUrl = new URL(request.url, url);
        if(requestUrl.pathname === '/__maia-runtime-probe') {
            providers.push({ provider: requestUrl.searchParams.get('provider'),
                submissions: Number(requestUrl.searchParams.get('submissions')) });
            response.writeHead(204).end();
        } else if(requestUrl.pathname === '/app/assets/engines/Maia3/maiaWorker.js') {
            response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cross-Origin-Resource-Policy': 'same-origin',
                'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
            const probe = `
                let testGpuSubmissions = 0;
                if(typeof GPUQueue !== 'undefined') {
                    const submit = GPUQueue.prototype.submit;
                    GPUQueue.prototype.submit = function(...args) {
                        testGpuSubmissions++;
                        return submit.apply(this, args);
                    };
                }
            `;
            response.end(probe + source.replace(marker, `const before = testGpuSubmissions;
                ${marker}
                fetch('/__maia-runtime-probe?provider=' + provider + '&submissions=' + (testGpuSubmissions - before));`));
        } else serve(request, response);
    });
    const browser = await chromium.launch({
        executablePath: process.env.LC0_TEST_BROWSER,
        args: gpu ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] : []
    });
    try {
        const context = await browser.newContext();
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        const page = await context.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        if(gpu) assert.ok(await page.evaluate(async () => navigator.gpu && await navigator.gpu.requestAdapter()),
            'WebGPU test requires an available adapter');
        const id = await page.evaluate(async () => {
            const { float32Maia3 } = await import('./maia3-model.js');
            const { savePersonalModel } = await import('/app/assets/engines/Maia3/personal-models.js');
            const response = await fetch('/app/assets/engines/Maia3/model/maia3_simplified.onnx');
            if(!response.ok) throw new Error(`Could not load Maia model: ${response.status}`);
            const bytes = float32Maia3(new Uint8Array(await response.arrayBuffer()));
            return savePersonalModel(new File([bytes], 'runtime-test.onnx'));
        });
        await page.evaluate(id => {
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: {
                    engineEnabled: true, chessEngine: 'maia3', maia3Model: id, maia3Provider: 'wasm',
                    displayMovesOnExternalSite: true, onlyCalculateOwnTurn: false
                } }
            } }));
        }, id);
        const userscript = (await buildUserscript())
            .replace("'hosts': { 'prod': 'acaschess.com', 'dev': 'localhost' }",
                `'hosts': { 'prod': '${new URL(url).host}', 'dev': '${new URL(url).host}' }`)
            .replace("'devPath': '/A.C.A.S/'", "'devPath': '/app/'");
        await page.addInitScript(userscript);
        await page.goto(`${url}/app/`);
        const board = await context.newPage();
        await board.route('**/runtime-board', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="mount"></div><script type="module">
            import { BoardSession } from '/tools/eloeye/boardSession.js';
            window.board = new BoardSession(document.getElementById('mount'));
            window.board.setPosition({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', turn: 'w' });
            </script>` }));
        await board.goto(`${url}/runtime-board`);
        const waitForInference = async (provider, start) => {
            await page.waitForFunction(provider => {
                const profile = window.AcasInstances?.[0]?.instance?.pV?.default;
                return profile?.engineSettingsReady && profile.maia3Provider === provider;
            }, provider, { timeout: 60000 });
            await assertEventually(() => providers.slice(start).some(result => result.provider === provider
                && (provider === 'webgpu' ? result.submissions > 0 : result.submissions === 0)), 60000,
                async () => `No ${provider} inference observed: ${JSON.stringify(providers)}; board: ${
                    JSON.stringify(await board.evaluate(() => ({ error: window.board.error?.message, hints: window.board.hints })))}`
            );
        };
        await waitForInference('wasm', 0);
        for(const provider of gpu ? ['webgpu', 'wasm'] : ['wasm']) {
            if(provider !== 'wasm' || gpu) {
                await page.locator('#maia3-models .open-floaty-btn').click();
                await page.locator('#maia3-models [data-provider]').locator('..').locator('.dropdown-icon').click();
                const start = providers.length;
                await page.locator(`#maia3-models .dropdown-item[data-value="${provider}"]`).click();
                await waitForInference(provider, start);
                await page.locator('#maia3-weights-floaty .floaty-close-btn').click();
            }
            const start = providers.length;
            await page.reload();
            await waitForInference(provider, start);
        }
        await board.close();
    } finally {
        await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

async function assertEventually(check, timeout, message) {
    const deadline = Date.now() + timeout;
    while(!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if(!check()) assert.fail(await message());
}
