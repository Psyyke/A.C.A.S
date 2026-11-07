import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readPgn } from './pgn.mjs';
import { emptyStats, mergeStats, metrics, parserHash } from './analyze.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function optionsFromArgs(args) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
        directory: { type: 'string', default: resolve(root, 'temp', 'lichess-databases') },
        output: { type: 'string', default: resolve(root, 'temp', 'lichess-board-report.json') },
        workers: { type: 'string', default: String(Math.max(1, Math.min(4, availableParallelism() - 1))) },
        'batch-games': { type: 'string', default: '16' },
        'max-games': { type: 'string', default: '0' },
        'skip-games': { type: 'string', default: '0' },
        'sample-every': { type: 'string', default: '1' },
        examples: { type: 'string', default: '100' },
        'no-context': { type: 'boolean', default: false },
        'last-move-hints': { type: 'boolean', default: false },
        stress: { type: 'boolean', default: false },
        conservative: { type: 'boolean', default: false },
        takebacks: { type: 'boolean', default: false },
        strict: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false }
    } });
    for(const [key, min, max] of [
        ['workers', 1, 64], ['batch-games', 1, 1024], ['max-games', 0, Number.MAX_SAFE_INTEGER],
        ['skip-games', 0, Number.MAX_SAFE_INTEGER], ['sample-every', 1, Number.MAX_SAFE_INTEGER],
        ['examples', 0, 10000]
    ]) {
        values[key] = Number(values[key]);
        if(!Number.isSafeInteger(values[key]) || values[key] < min || values[key] > max)
            throw new Error(`--${key} must be an integer from ${min} to ${max}`);
    }
    return { ...values, files: positionals };
}

class Pool {
    constructor(size, options, onResult) {
        this.onResult = onResult;
        this.error = null;
        this.waiting = [];
        this.slots = Array.from({ length: size }, () => {
            const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: options });
            const slot = { worker, job: null };
            worker.on('message', message => {
                if(!slot.job) return this.fail(new Error('Unexpected corpus worker response'));
                const job = slot.job;
                slot.job = null;
                if(message.error) { this.fail(new Error(message.error)); job.reject(this.error); }
                else {
                    try {
                        this.onResult(message.stats);
                        job.resolve();
                        this.wake();
                    } catch(error) {
                        this.fail(error);
                        job.reject(this.error);
                    }
                }
            });
            worker.on('error', error => this.fail(error));
            worker.on('exit', code => {
                if(!this.stopping) this.fail(new Error(`Corpus worker exited unexpectedly (${code})`));
            });
            return slot;
        });
    }
    wake() { for(const resolve of this.waiting.splice(0)) resolve(); }
    fail(error) {
        this.error ??= error;
        for(const slot of this.slots) {
            if(slot.job) { slot.job.reject(this.error); slot.job = null; }
        }
        this.wake();
    }
    async submit(games) {
        for(;;) {
            if(this.error) throw this.error;
            const slot = this.slots.find(slot => !slot.job);
            if(slot) {
                const promise = new Promise((resolve, reject) => { slot.job = { resolve, reject }; });
                // A failed worker is propagated on the next submit/drain, not an
                // unhandled rejection while the producer is decompressing.
                promise.catch(() => {});
                slot.promise = promise;
                slot.worker.postMessage(games);
                return;
            }
            await new Promise(resolve => this.waiting.push(resolve));
        }
    }
    async drain() {
        await Promise.all(this.slots.map(slot => slot.promise));
        if(this.error) throw this.error;
    }
    async close() {
        this.stopping = true;
        await Promise.all(this.slots.map(slot => slot.worker.terminate()));
    }
}

export async function runCorpus(options, progress = () => {}) {
    // Missing download directories are input errors, not an empty successful run.
    async function directoryFiles() {
        try { return await readdir(options.directory); }
        catch(error) {
            if(error.code === 'ENOENT') throw new Error(`No database directory: ${options.directory}. Add completed .pgn.zst downloads first.`);
            throw error;
        }
    }
    const paths = options.files.length ? options.files.map(file => resolve(file))
        : (await directoryFiles()).filter(name => /\.pgn(?:\.zst)?$/i.test(name))
            .sort().map(name => resolve(options.directory, name));
    if(!paths.length) throw new Error(`No .pgn or .pgn.zst files in ${options.directory}. Completed downloads are required.`);
    if(new Set(paths).size !== paths.length) throw new Error('Duplicate input files would bias corpus metrics');
    const output = resolve(options.output);
    if(paths.includes(output)) throw new Error('Report output must not overwrite an input database');
    const inputs = [];
    for(const path of paths) {
        if(!/\.pgn(?:\.zst)?$/i.test(path)) throw new Error(`Unsupported input file: ${path}`);
        const info = await stat(path);
        if(!info.isFile() || !info.size) throw new Error(`Input is not a nonempty file: ${path}`);
        inputs.push({ path, bytes: info.size, modifiedMs: info.mtimeMs, records: 0, selected: 0, complete: false });
    }
    const stats = emptyStats(), startedAt = new Date().toISOString(), started = performance.now();
    let selected = 0, seen = 0, lastProgress = started - 5001, failure = null;
    const pool = new Pool(options.workers, {
        context: !options['no-context'], hints: options['last-move-hints'], stress: options.stress,
        conservative: options.conservative,
        takebacks: options.takebacks,
        maxExamples: options.examples
    }, result => {
        mergeStats(stats, result, options.examples);
        const now = performance.now();
        if(now - lastProgress > 5000) {
            lastProgress = now;
            progress({ games: stats.games, plies: stats.plies,
                pliesPerSecond: stats.plies * 1000 / (now - started), metrics: metrics(stats) });
        }
    });
    try {
        let batch = [], batchPlies = 0;
        for(const input of inputs) {
            for await(const game of readPgn(input.path)) {
                input.records++; seen++;
                if(seen <= options['skip-games']) continue;
                if((seen - options['skip-games'] - 1) % options['sample-every']) continue;
                selected++; input.selected++;
                batch.push({ ...game, file: input.path, record: input.records });
                batchPlies += game.moves.length;
                if(batch.length >= options['batch-games'] || batchPlies >= 4096) {
                    await pool.submit(batch);
                    batch = []; batchPlies = 0;
                }
                if(options['max-games'] && selected >= options['max-games']) break;
            }
            input.complete = !(options['max-games'] && selected >= options['max-games']);
            const after = await stat(input.path);
            if(after.size !== input.bytes || after.mtimeMs !== input.modifiedMs)
                throw new Error(`Input changed while reading (download still in progress?): ${input.path}`);
            if(options['max-games'] && selected >= options['max-games']) break;
        }
        if(batch.length) await pool.submit(batch);
        await pool.drain();
    } catch(error) {
        failure = error;
    } finally { await pool.close(); }
    const elapsedMs = performance.now() - started;
    const report = {
        schema: 1, status: failure ? 'failed' : 'complete', startedAt,
        finishedAt: new Date().toISOString(), elapsedMs, node: process.version,
        parserHash, chessJsHash: createHash('sha256')
            .update(readFileSync(new URL('../../app/assets/engines/libraries/chessjs/chess.js', import.meta.url))).digest('hex'),
        options, inputs, seen, selected, stats, metrics: metrics(stats),
        validation: {
            passed: !failure && Boolean(stats.single.total && stats.gaps.total) && !stats.invalidGames &&
                stats.single.exact === stats.single.total && !stats.gaps.illegal &&
                (!options.strict || stats.gaps.exact === stats.gaps.total),
            zeroGapError: Boolean(stats.gaps.total) && stats.gaps.exact === stats.gaps.total
        },
        stressValidation: {
            enabled: options.stress,
            passedSafetyChecks: options.stress && !failure && Boolean(stats.stress.duplicates.total) &&
                !stats.stress.duplicates.errors && !stats.stress.staleHints.illegal &&
                ['missed2', 'missed3', 'missed4'].every(key => !stats.stress[key].illegalRecovery),
            fullMultiGapRecoverySupported: false
        },
        takebackValidation: {
            enabled: options.takebacks,
            passed: options.takebacks && !failure && Boolean(stats.takebacks.confirmed) &&
                !stats.takebacks.falseTakebacks && !stats.takebacks.restorationErrors && !stats.takebacks.resumeErrors
        },
        pliesPerSecond: stats.plies * 1000 / elapsedMs,
        error: failure?.message || null,
        definitions: {
            gapRmse: 'sqrt((nonexact + unresolved) / gap count); exact intermediate board target',
            gapBoardRmse: 'sqrt(mismatched squares / (64 * gap count)); unresolved counts as 64 mismatches',
            lastMoveHints: 'Opt-in oracle-provided last-move squares: an upper-bound experiment, not live-site evidence',
            legality: 'Exact recovery is known legal from PGN; nonexact returned recoveries are replayed with chess.js',
            timing: 'parserMs excludes SAN parsing, decompression, validation, message passing and reporting',
            stress: 'missedN hides N consecutive observations (N+1 plies). Legal shorter histories are aliases, not exact recovery. Stress timings exclude oracle validation.',
            conservative: 'Opt-in candidate enumeration; PGN current side-to-move is supplied as an upper bound for available DOM turn metadata. Uniqueness is bounded to two plies, not proof of actual history.'
        }
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
    if(failure) throw new Error(`${failure.message}\nPartial failure report: ${output}`, { cause: failure });
    return report;
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const options = optionsFromArgs(process.argv.slice(2));
        if(options.help) {
            console.log(`Usage: node tests\\lichess-database\\run.mjs [file.pgn.zst ...]
  --directory <path>     Default: temp\\lichess-databases (not recursive)
  --output <path>        Default: temp\\lichess-board-report.json
  --workers <1-64>       Default: up to 4 CPU workers; one streaming decoder
  --batch-games <n>      Default: 16; bounded in-flight batches
  --max-games <n>        Default: 0 (all); limit selected records across all files
  --skip-games <n>       Default: 0; skip initial records before sampling (held-out ranges)
  --sample-every <n>     Default: 1 (all); deterministic record sampling
  --examples <n>         Default: 100 bounded failure examples in the report
  --no-context          Test snapshots without known history metadata
  --last-move-hints     Experimental ground-truth last-move hints (not a live claim)
  --stress              Test 2-4 missed observations, duplicates and stale highlights separately
  --conservative        Reject ambiguous candidates; use PGN side-to-move as DOM metadata upper bound
  --takebacks           Verify confirmed undo depths 1,2,5,all, resume and repetition preservation
  --strict              Exit nonzero for any nonexact/unresolved one-missed-ply recovery
Always exits nonzero for invalid input, single-ply errors, or illegal recoveries.`);
        } else {
            const report = await runCorpus(options, progress => console.error(JSON.stringify(progress)));
            console.log(JSON.stringify({ output: resolve(options.output), ...report.metrics,
                games: report.stats.games, plies: report.stats.plies, pliesPerSecond: report.pliesPerSecond,
                single: report.stats.single, gaps: report.stats.gaps, invalidGames: report.stats.invalidGames,
                ...(options.stress ? { stress: report.stats.stress, stressValidation: report.stressValidation } : {}) }));
            if(options.takebacks) console.log(JSON.stringify({ takebacks: report.stats.takebacks,
                validation: report.takebackValidation }));
            if(!report.validation.passed || (options.stress && !report.stressValidation.passedSafetyChecks) ||
                (options.takebacks && !report.takebackValidation.passed))
                process.exitCode = 1;
        }
    } catch(error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
