import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../tools/doppelmaia/personalized-maia.js', import.meta.url), 'utf8');

function clock() {
    let now = 0;
    const timer = {};
    const context = vm.createContext({
        performance: { now: () => now },
        Date,
        $: selector => selector === '#epochs' ? { value: '4' } : timer,
        history: [],
        drawLearningChart() {},
        log() {},
        source: 'games',
        startedAt: 0,
        completed: false
    });
    vm.runInContext(source.slice(source.indexOf('let epochTimingStart'), source.indexOf('let dataBusy')), context);
    vm.runInContext(source.slice(source.indexOf('function measured('), source.indexOf("$('#base-weights').addEventListener")), context);
    return {
        at(value) { now = value; },
        run(code) { return vm.runInContext(code, context); },
        timer
    };
}

const point = epoch => `measured({ epoch: ${epoch}, trainLoss: 1, validationLoss: 1, trainAccuracy: 0.5, validationAccuracy: 0.5 })`;

test('finish estimate appears on the first batch and adapts before the first epoch ends', () => {
    const time = clock();
    time.run('updateTrainingClock()');
    assert.match(time.timer.textContent, /Estimating/);
    time.run('startEvaluation()');
    time.at(2000);
    time.run(point(0));
    time.at(3000);
    time.run('updateBatchEstimate({ epoch: 1, processed: 10, total: 100 })');
    assert.equal(time.run('estimatedTrainingEnd'), 50000);
    assert.match(time.timer.textContent, /^~/);
    time.at(3500);
    time.run('updateBatchEstimate({ epoch: 1, processed: 20, total: 100 })');
    assert.equal(time.run('estimatedTrainingEnd'), 40000);
});

test('evaluation time is counted separately and estimates continue across epochs', () => {
    const time = clock();
    time.run('startEvaluation()');
    time.at(2000);
    time.run(point(0));
    time.at(12000);
    time.run('updateBatchEstimate({ epoch: 1, processed: 100, total: 100 }); startEvaluation()');
    assert.equal(time.run('trainingMilliseconds'), 10000);
    time.at(15000);
    time.run(point(1));
    assert.equal(time.run('estimatedTrainingEnd'), 54000);
    time.at(20000);
    time.run('updateBatchEstimate({ epoch: 2, processed: 50, total: 100 })');
    assert.equal(time.run('estimatedTrainingEnd'), 54000);
    time.at(45000);
    time.run('updateBatchEstimate({ epoch: 4, processed: 100, total: 100 })');
    assert.equal(time.run('estimatedTrainingEnd'), 48000);
});

test('worker progress messages update the estimate without waiting for an epoch', () => {
    assert.match(source, /data\.type === 'batch'\) \{\s*updateBatchEstimate\(data\)/);
    assert.match(source, /data\.type === 'evaluation'\) \{\s*startEvaluation\(\)/);
    assert.match(source, /batchTimingStart = undefined; trainingMilliseconds = 0;/);
});
