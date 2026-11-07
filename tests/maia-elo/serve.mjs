// Static file server for the repository root that also collects simulated games.
import { createServer } from 'node:http';
import { appendFileSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rigDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(rigDir, '..', '..');
export const dataDir = join(rigDir, 'data');

const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
    '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

// Resolves with { server, port, url }. Games POSTed to /save are appended to outFile (JSON lines).
export function startServer({ port = 0, outFile = join(dataDir, 'games.jsonl') } = {}) {
    mkdirSync(dirname(outFile), { recursive: true });
    const server = createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        // Cross-origin isolation enables SharedArrayBuffer, which multi-threaded wasm needs.
        // Set ISOLATE=0 to serve like a page without isolation (e.g. one that shows ads).
        if(process.env.ISOLATE !== '0') {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        }
        if(req.method === 'POST' && url.pathname === '/save') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => {
                appendFileSync(outFile, Buffer.concat(chunks).toString() + '\n');
                res.end('ok');
            });
            return;
        }
        let file = normalize(join(repoRoot, decodeURIComponent(url.pathname)));
        if(existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        if(!file.startsWith(repoRoot) || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404;
            return res.end('not found');
        }
        res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
    });
    return new Promise(resolveServer => server.listen(port, () => {
        const actual = server.address().port;
        resolveServer({ server, port: actual, url: `http://localhost:${actual}` });
    }));
}

if(process.argv[1]?.endsWith('serve.mjs')) {
    const { url } = await startServer({ port: Number(process.argv[2]) || 8765 });
    console.log(`${url}/tests/maia-elo/sim.html`);
}
