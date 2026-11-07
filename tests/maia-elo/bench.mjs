// Measures Maia 3 inference time per batch size (ms) in headless Chromium.
// Usage: node tests/maia-elo/bench.mjs
import { startServer } from './serve.mjs';

const { chromium } = await import('playwright');
const { server, url } = await startServer({ outFile: new URL('./data/bench-unused.jsonl', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
    const page = await browser.newPage();
    await page.goto(`${url}/tests/maia-elo/bench.html`);
    await page.waitForFunction(() => window.benchResult, null, { timeout: 180000 });
    console.log(JSON.stringify(await page.evaluate(() => window.benchResult), null, 1));
} finally {
    await browser.close();
    server.close();
}
