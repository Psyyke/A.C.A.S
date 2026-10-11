import { test } from 'node:test';
import assert from 'node:assert/strict';
import CommandQueue from '../appServer/backend/commandQueue.js';

function deferred() {
    return Promise.withResolvers();
}

test('position, go and stop stay in order while another engine can start', async () => {
    const queue = new CommandQueue();
    const startup = deferred(), started = deferred();
    const events = [];
    const position = queue.run('engine-a', async () => {
        events.push('position');
        started.resolve();
        await startup.promise;
    });
    const go = queue.run('engine-a', () => events.push('go'));
    const stop = queue.run('engine-a', () => events.push('stop'));
    await queue.run('engine-b', () => events.push('other engine'));
    await started.promise;
    assert.deepEqual(events, ['position', 'other engine']);
    startup.resolve();
    await Promise.all([position, go, stop]);
    assert.deepEqual(events, ['position', 'other engine', 'go', 'stop']);
    assert.equal(queue.commands.size, 0);
});

test('closing waits for all engines and blocks subsequent commands', async () => {
    const queue = new CommandQueue();
    const a = deferred(), b = deferred(), closing = deferred(), closeStarted = deferred();
    const events = [];
    const first = queue.run('a', () => a.promise.then(() => events.push('a done')));
    const second = queue.run('b', () => b.promise.then(() => events.push('b done')));
    const close = queue.barrier(async () => {
        events.push('close');
        closeStarted.resolve();
        await closing.promise;
    });
    const later = queue.run('c', () => events.push('c'));
    a.resolve();
    await first;
    assert.deepEqual(events, ['a done']);
    b.resolve();
    await closeStarted.promise;
    assert.deepEqual(events, ['a done', 'b done', 'close']);
    closing.resolve();
    await Promise.all([second, close, later]);
    assert.deepEqual(events, ['a done', 'b done', 'close', 'c']);
});

test('successive close barriers preserve intervening commands', async () => {
    const queue = new CommandQueue();
    const events = [];
    const operations = [
        queue.run('a', () => events.push('a')),
        queue.barrier(() => events.push('close 1')),
        queue.run('a', () => events.push('b')),
        queue.barrier(() => events.push('close 2')),
        queue.run('a', () => events.push('c'))
    ];
    await Promise.all(operations);
    assert.deepEqual(events, ['a', 'close 1', 'b', 'close 2', 'c']);
});

test('a failed command is reported to its caller without blocking the engine', async () => {
    const queue = new CommandQueue();
    const error = new Error('Launch failed');
    const failed = queue.run('a', () => { throw error; });
    const next = queue.run('a', () => 'ready');
    await assert.rejects(failed, error);
    assert.equal(await next, 'ready');
    assert.equal(queue.commands.size, 0);
});

test('a rejected close does not strand later commands or another close', async () => {
    const queue = new CommandQueue();
    const error = new Error('Close failed');
    const failed = queue.barrier(() => { throw error; });
    const next = queue.run('a', () => 'ready');
    const close = queue.barrier(() => 'closed');
    await assert.rejects(failed, error);
    assert.equal(await next, 'ready');
    assert.equal(await close, 'closed');
});

test('finishing one command keeps the next queued command in the lane', async () => {
    const queue = new CommandQueue();
    const waiting = deferred(), started = deferred();
    const first = queue.run('a', () => 'first');
    const second = queue.run('a', () => { started.resolve(); return waiting.promise; });
    await first;
    await started.promise;
    assert.equal(queue.commands.size, 1);
    waiting.resolve();
    await second;
    assert.equal(queue.commands.size, 0);
});
