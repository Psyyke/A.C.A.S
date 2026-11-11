import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { chromium } from 'playwright';
import { startServer, repoRoot } from '../../../tests/maia-elo/serve.mjs';

const directory = resolve(process.argv[2] || 'temp\\doppelmaia-transformer-workflow');
const path = relative(repoRoot, directory).split(sep).join('/');
if(path.startsWith('..')) throw new Error('Workflow output must be under the repository root.');
const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.on('console', message => console.log(message.text()));
    page.on('pageerror', error => console.error(error));
    page.on('crash', () => console.error('The browser renderer crashed during the full training workflow.'));
    const workflowStarted = performance.now();
    await page.goto(`${url}/tools/doppelmaia/`);
    const downloaded = page.waitForEvent('download', { timeout: 1800000 });
    const [report, download] = await Promise.all([page.evaluate(async path => {
        const response = await fetch(`/${path}/workflow.json`);
        if(!response.ok) throw new Error(`Workflow fixture failed with HTTP ${response.status}`);
        const data = await response.json();
        const worker = new Worker('./maia3-trainer-worker.js', { type: 'module' });
        try {
            return await new Promise((resolve, reject) => {
                worker.onerror = event => reject(new Error(event.message));
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error') reject(new Error(`${data.message}\n${data.stack}`));
                    if(data.type === 'epoch') console.log('Full workflow epoch', JSON.stringify(data.point));
                    if(data.type === 'stage') console.log(data.stage);
                    if(data.type === 'complete') {
                        const anchor = document.createElement('a');
                        anchor.href = URL.createObjectURL(new Blob([data.weights]));
                        anchor.download = 'browser.onnx';
                        anchor.click();
                        resolve(data.report);
                    }
                };
                worker.postMessage({ ...data, type: 'train' });
            });
        } finally { worker.terminate(); }
    }, path), downloaded]);
    await download.saveAs(join(directory, 'browser.onnx'));
    report.workflowWallMilliseconds = performance.now() - workflowStarted;
    report.workflowTimingScope = 'Local tool page load through verified model download. Excludes PGN import and browser launch.';
    await writeFile(join(directory, 'browser-report.json'), JSON.stringify(report, null, 2));
    const expected = JSON.parse(await readFile(join(directory, 'cuda-report.json'), 'utf8'));
    const difference = {
        selectedEpoch: { browser: report.bestEpoch, cuda: expected.bestEpoch },
        selectedCEDifference: Math.abs(report.exportedObjectiveLoss - expected.exportedObjectiveLoss),
        heldOutAgreementDifference: Math.abs(report.exportedMetrics.accuracy - expected.exportedMetrics.accuracy),
        browserMilliseconds: report.trainingMilliseconds, cudaSeconds: expected.seconds,
        browserWorkflowMilliseconds: report.workflowWallMilliseconds,
        epochs: report.history.map(point => ({
            epoch: point.epoch,
            trainingCE: Math.abs(point.trainLoss - expected.history[point.epoch].trainLoss),
            validationCE: Math.abs(point.validationLoss - expected.history[point.epoch].validationLoss),
            validationAgreement: Math.abs(point.validationAccuracy - expected.history[point.epoch].validationAccuracy)
        }))
    };
    await writeFile(join(directory, 'workflow-parity.json'), JSON.stringify(difference, null, 2));
    console.log(JSON.stringify(difference, null, 2));
    assert.equal(report.trainableParameters, 22409728);
    assert.equal(report.exportVerified, true);
    assert.equal(report.bestEpoch, expected.bestEpoch, 'Different validation checkpoint selected');
    assert.ok(difference.selectedCEDifference < 0.02, 'Full workflow selected CE differs');
    assert.ok(difference.heldOutAgreementDifference < 0.03, 'Full workflow held out move agreement differs');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
