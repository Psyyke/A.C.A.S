import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../../tests/maia-elo/serve.mjs';
import { validateDataset } from '../data.js';

const [input, output] = process.argv.slice(2);
if(!input || !output) throw new Error('Usage: node tools\\doppelmaia\\experiments\\benchmark.mjs DATASET.json REPORT.json');
const dataset = validateDataset(JSON.parse(await readFile(resolve(input), 'utf8')));
const provider = process.env.PERSONAL_MAIA_PROVIDER || 'wasm';
const epochs = Number(process.env.MAIA3_EPOCHS || 10);
const goal = process.env.MAIA3_GOAL || 'imitate';
if(process.env.MAIA3_RANDOM_TARGETS === '1') {
    let seed = 42;
    for(const sample of dataset.train.samples) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        sample.move = sample.legalMoves[seed % sample.legalMoves.length];
    }
}
const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
let browser;
try {
    browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    const page = await browser.newPage();
    page.on('console', message => { if(message.text().startsWith('Benchmark:')) console.log(message.text()); });
    await page.goto(`${url}/tools/doppelmaia/`);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'), null, { timeout: 30000 });
    const modelDownload = process.env.MAIA3_MODEL_OUT ? page.waitForEvent('download', { timeout: 600000 }) : undefined;
    const training = page.evaluate(async ({ dataset, provider, epochs, goal, exportModel }) => {
        const worker = new Worker('./maia3-trainer-worker.js', { type: 'module' });
        try {
            return await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Benchmark exceeded ten minutes.')), 600000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'stage') console.log('Benchmark:', data.stage);
                    if(data.type === 'epoch') console.log('Benchmark:', JSON.stringify(data.point));
                    if(data.type === 'error') { clearTimeout(timer); reject(new Error(`${data.message}\n${data.stack}`)); }
                    if(data.type === 'complete') {
                        clearTimeout(timer);
                        if(exportModel) {
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(new Blob([data.weights]));
                            link.download = 'personalized-maia3.onnx'; link.click();
                        }
                        resolve({ ...data.report, exportedBytes: data.weights.byteLength });
                    }
                };
                worker.postMessage({ type: 'train', dataset, provider, elo: 1500, goal,
                    opening: '1. e4 e5 2. Nf3 Nc6', squares: 'd4 e4',
                    options: { epochs, learningRate: 0.005, batchSize: 32, patience: 5 } });
            });
        } finally { worker.terminate(); }
    }, { dataset, provider, epochs, goal, exportModel: Boolean(process.env.MAIA3_MODEL_OUT) });
    const [report, downloaded] = await Promise.all([training, modelDownload]);
    if(downloaded) await downloaded.saveAs(resolve(process.env.MAIA3_MODEL_OUT));
    report.randomizedTrainingTargets = process.env.MAIA3_RANDOM_TARGETS === '1';
    report.dataset = { trainGames: dataset.train.gameIds.length, validationGames: dataset.validation.gameIds.length };
    report.warning = 'Quality depends on the supplied data. Synthetic games and known opening replay do not establish human imitation or playing strength.';
    await writeFile(resolve(output), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ provider, goal, positions: report.trainPositions + report.validationPositions,
        featureMs: report.featureMilliseconds, trainMs: report.trainingMilliseconds,
        baseline: report.history[0], exported: report.exportedMetrics, bestEpoch: report.bestEpoch }));
} finally {
    if(browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
