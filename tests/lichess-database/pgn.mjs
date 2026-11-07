import { createReadStream } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { decompressZstd } from './zstd.mjs';

const results = new Set(['1-0', '0-1', '1/2-1/2', '*']);

// Incremental lexer: chunk boundaries may split UTF-8, tags, SAN, or comments.
export async function* parsePgn(chunks, { maxGameChars = 2 * 1024 * 1024 } = {}) {
    let headers = {}, moves = [], token = '', tag = '', chars = 0;
    let brace = false, lineComment = false, variation = 0, inTag = false;
    let quote = false, escape = false, lineStart = true;
    const decoder = new StringDecoder('utf8');
    function finishToken() {
        const value = token;
        token = '';
        if(!value) return null;
        if(/^\$\d+$/.test(value) || /^[!?]+$/.test(value)) return null;
        if(results.has(value)) {
            const game = { headers, moves, result: value };
            headers = {}; moves = []; chars = 0;
            return game;
        }
        const san = value.replace(/^\d+\.(?:\.\.)?/, '');
        if(!san || /^\.+$/.test(san)) return null;
        if(results.has(san)) {
            const game = { headers, moves, result: san };
            headers = {}; moves = []; chars = 0;
            return game;
        }
        moves.push(san);
        return null;
    }
    async function* decoded() {
        for await(const chunk of chunks) {
            yield typeof chunk === 'string' ? decoder.write(Buffer.from(chunk)) : decoder.write(chunk);
        }
        yield decoder.end();
    }
    for await(const text of decoded()) {
        for(const char of text) {
            if(++chars > maxGameChars) throw new Error(`PGN game exceeds ${maxGameChars} characters`);
            if(lineComment) {
                if(char === '\n' || char === '\r') { lineComment = false; lineStart = true; }
                continue;
            }
            if(brace) {
                if(char === '}') brace = false;
                continue;
            }
            if(inTag) {
                if(tag.length > 16384) throw new Error('PGN tag exceeds 16 KiB');
                if(char === ']' && !quote) {
                    const match = /^\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\["\\])*)"\s*$/.exec(tag);
                    if(!match) throw new Error(`Malformed PGN tag: ${tag.slice(0, 100)}`);
                    headers[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
                    tag = ''; inTag = false;
                    continue;
                }
                tag += char;
                if(escape) escape = false;
                else if(char === '\\' && quote) escape = true;
                else if(char === '"') quote = !quote;
                continue;
            }
            if(char === '\uFEFF') continue;
            if(char === ';' || (char === '%' && lineStart)) {
                if(!variation) { const game = finishToken(); if(game) yield game; }
                lineComment = true;
                continue;
            }
            if(char === '{') {
                if(!variation) { const game = finishToken(); if(game) yield game; }
                brace = true;
                continue;
            }
            if(char === '(') {
                if(!variation) { const game = finishToken(); if(game) yield game; }
                if(++variation > 128) throw new Error('PGN variation nesting exceeds 128');
                continue;
            }
            if(char === ')') {
                if(!variation) throw new Error('Unmatched PGN variation close');
                variation--;
                continue;
            }
            if(variation) continue;
            if(char === '[') {
                const game = finishToken();
                if(game) yield game;
                if(moves.length) throw new Error('New PGN headers before a game result');
                inTag = true; tag = ''; quote = false; escape = false;
                continue;
            }
            if(/\s/.test(char)) {
                const game = finishToken();
                if(game) yield game;
                if(char === '\r' || char === '\n') lineStart = true;
                continue;
            }
            if(char === '$' && token) {
                const game = finishToken();
                if(game) yield game;
            }
            lineStart = false;
            token += char;
            if(token.length > 256) throw new Error('PGN movetext token exceeds 256 characters');
        }
    }
    if(inTag || brace || variation) throw new Error('Truncated PGN tag, comment or variation');
    const game = finishToken();
    if(game) yield game;
    if(moves.length || Object.keys(headers).length) throw new Error('Truncated PGN game: missing result');
}

export async function* readPgn(file, options) {
    const input = createReadStream(file, { highWaterMark: 1024 * 1024 });
    try {
        yield* parsePgn(/\.zst$/i.test(file) ? decompressZstd(input) : input, options);
    } finally {
        input.destroy();
    }
}
