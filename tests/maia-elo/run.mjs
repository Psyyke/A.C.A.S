// Runs the simulator headlessly in ONE Chromium page and writes games to data/games.jsonl.
// Usage: node tests/maia-elo/run.mjs [--elos 800,1200] [--games 6] [--plies 80] [--engines 4] [--sf 8]
//                                     [--out file] [--headed] [--timeout 900]
// Requires the `playwright` package (npm install --no-save --package-lock=false playwright).
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, startServer } from './serve.mjs';

export async function runSimulation({
    elos = '800,1200,1600,2000,2400', games = 6, plies = 80, engines = 4, temp = 1, sf = 0,
    out = join(dataDir, 'games.jsonl'), headless = true, timeoutSeconds = 900, fresh = true, onProgress
} = {}) {
    const { chromium } = await import('playwright');
    if(fresh) rmSync(out, { force: true });
    const { server, url } = await startServer({ outFile: out });
    const browser = await chromium.launch({ headless, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const query = new URLSearchParams({ elos, games, plies, engines, temp, sf });
        await page.goto(`${url}/tests/maia-elo/sim.html?${query}`);
        const started = Date.now();
        while(!await page.evaluate(() => window.done === true)) {
            if(Date.now() - started > timeoutSeconds * 1000) throw new Error('simulation timed out');
            if(errors.length) throw new Error(`page error: ${errors[0]}`);
            await onProgress?.(await page.evaluate(() => document.getElementById('log').textContent));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return { ...await page.evaluate(() => window.stats), out };
    } finally {
        await browser.close();
        server.close();
    }
}

if(process.argv[1]?.endsWith('run.mjs')) {
    const args = new Map();
    for(let index = 2; index < process.argv.length; index++) {
        if(!process.argv[index].startsWith('--')) continue;
        const next = process.argv[index + 1];
        args.set(process.argv[index].slice(2), next && !next.startsWith('--') ? next : 'true');
    }
    let last = '';
    const result = await runSimulation({
        elos: args.get('elos'), games: Number(args.get('games') ?? 6), plies: Number(args.get('plies') ?? 80),
        engines: Number(args.get('engines') ?? 4), sf: Number(args.get('sf') ?? 0), out: args.get('out') && join(process.cwd(), args.get('out')),
        headless: !args.has('headed'), timeoutSeconds: Number(args.get('timeout') ?? 900),
        onProgress: text => { if(text !== last) console.log(last = text); }
    });
    console.log(`saved ${result.saved} games (${result.failed} failed, ${result.seconds.toFixed(0)}s, ${(result.moves / result.seconds).toFixed(1)} plies/s) to ${result.out}`);
}
