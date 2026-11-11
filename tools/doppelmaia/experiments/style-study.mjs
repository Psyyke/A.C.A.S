import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../../tests/maia-elo/serve.mjs';
import { makeStyleStudy, randomizeTrainingLabels, summarizeStyle } from './style-data.mjs';

const output = resolve(process.argv[2] || 'temp\\doppelmaia-style-study');
const seed = Number(process.env.STYLE_SEED || 20261110);
const provider = process.env.PERSONAL_MAIA_PROVIDER || 'wasm';
const epochs = Number(process.env.MAIA3_EPOCHS || 40);
if(!Number.isSafeInteger(seed) || seed < 0 || !Number.isInteger(epochs) || epochs < 1 || epochs > 100
    || !['wasm', 'webgpu'].includes(provider)) throw new Error('Invalid style-study seed, epoch limit or provider.');
const study = makeStyleStudy({ seed });
await mkdir(output, { recursive: true });
for(const [split, text] of Object.entries(study.pgn)) await writeFile(join(output, `knightfan-${split}.pgn`), text);
await writeFile(join(output, 'knightfan-dataset.json'), JSON.stringify(study.dataset));
await writeFile(join(output, 'knightfan-test.json'), JSON.stringify(study.test));
console.log(`Prepared ${study.dataset.train.samples.length} train, ${study.dataset.validation.samples.length} validation and ${study.test.samples.length} unseen test positions.`);
const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
let browser;
try {
    browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    const page = await browser.newPage();
    page.on('console', message => { if(message.text().startsWith('Style study:')) console.log(message.text()); });
    await page.goto(`${url}/tools/doppelmaia/`);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'), null, { timeout: 30000 });
    const download = process.env.STYLE_SAVE_MODEL === '1' ? page.waitForEvent('download', { timeout: 600000 }) : undefined;
    const measurement = page.evaluate(async ({ dataset, control, testSamples, provider, epochs, saveModel }) => {
        const request = (script, message) => {
            const worker = new Worker(new URL(script, location.href), { type: 'module' });
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => finish(new Error('Style-study worker exceeded five minutes.')), 300000);
                const finish = (error, value) => {
                    clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(value);
                };
                worker.onerror = event => finish(new Error(event.message));
                worker.onmessageerror = () => finish(new Error('Could not read style-study worker response.'));
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error') finish(new Error(`${data.message}\n${data.stack}`));
                    else if(data.type === 'complete') finish(null, data);
                    else if(data.type === 'stage') console.log('Style study:', data.stage);
                    else if(data.type === 'epoch') console.log('Style study:', JSON.stringify(data.point));
                };
                worker.postMessage(message, message.weights ? [message.weights] : []);
            });
        };
        console.log('Style study:', 'Measuring untouched Maia 3 on the sealed test positions.');
        const base = (await request('./experiments/style-study-worker.js',
            { type: 'evaluate', samples: testSamples, provider })).rows;
        const results = { base, reports: {} };
        for(const [name, training] of [['trained', dataset], ['control', control]]) {
            console.log('Style study:', `Training ${name}. Test positions are not supplied to the trainer.`);
            const result = await request('./maia3-trainer-worker.js', {
                type: 'train', dataset: training, provider, elo: 1500, goal: 'imitate',
                options: { epochs, learningRate: 0.02, batchSize: 32, patience: 8 }
            });
            if(saveModel && name === 'trained') {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([result.weights]));
                link.download = 'knightfan-maia3.onnx'; link.click();
            }
            results.reports[name] = result.report;
            results[name] = (await request('./experiments/style-study-worker.js',
                { type: 'evaluate', samples: testSamples, weights: result.weights, provider })).rows;
        }
        return results;
    }, { dataset: study.dataset, control: randomizeTrainingLabels(study.dataset), testSamples: study.test.samples,
        provider, epochs, saveModel: Boolean(download) });
    const [runs, model] = await Promise.all([measurement, download]);
    if(model) await model.saveAs(join(output, 'knightfan-maia3.onnx'));
    const metrics = summarizeStyle(study.test.samples, runs.base, runs.trained, runs.control);
    const report = { design: study.design, provider, elo: 1500, epochs,
        counts: { train: study.dataset.train.samples.length, validation: study.dataset.validation.samples.length, test: study.test.samples.length },
        metrics, trainingReports: runs.reports,
        testPredictions: study.test.samples.map((sample, i) => ({
            gameId: sample.gameId, fen: sample.fen, observedMove: sample.move,
            base: runs.base[i], trained: runs.trained[i], randomLabelControl: runs.control[i]
        })),
        interpretation: 'A controlled synthetic style test, not proof of human imitation. The 95% intervals resample complete test games, not individual positions. Test positions never select epochs. No Elo or playing-strength claim.'
    };
    await writeFile(join(output, 'style-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ counts: report.counts, metrics }, null, 2));
} finally {
    if(browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
