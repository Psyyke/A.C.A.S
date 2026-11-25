import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export function createStudyServer({ root, mounts = {}, files = {}, json = {} }) {
    return createServer(async (request, response) => {
        response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        try {
            const path = new URL(request.url, 'http://localhost').pathname;
            if(path === '/') {
                response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Pena v2 isolated evaluation</title>');
                return;
            }
            if(Object.hasOwn(json, path)) {
                response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(json[path]));
                return;
            }
            let target = files[path];
            if(!target) {
                const prefix = Object.keys(mounts).sort((a, b) => b.length - a.length).find(prefix => path.startsWith(prefix));
                const base = resolve(prefix ? mounts[prefix] : root);
                target = resolve(base, '.' + decodeURIComponent(prefix ? path.slice(prefix.length - 1) : path));
                if(!target.startsWith(base.endsWith(sep) ? base : base + sep)) throw new Error('Invalid file path.');
            }
            const info = await stat(target);
            if(!info.isFile()) throw new Error('Expected a file.');
            response.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml',
                '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                '.wasm': 'application/wasm' }[extname(target)] || 'application/octet-stream', 'Content-Length': info.size });
            const stream = createReadStream(target);
            stream.on('error', error => response.destroy(error));
            stream.pipe(response);
        } catch(error) { response.writeHead(404).end(error.message); }
    });
}
