// Rebuilds knowledge.js from the usage guide and help page.
// Run from anywhere: node app/assets/engines/pena-v2/build-knowledge.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const MAX_CHARS = 750;
const FOOTER = new Set(['Explore', 'Chess tools', 'Project']);
const SKIP = new Set(['Common questions']);

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = text => text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&(\w+|#39);/g, (whole, name) => entities[name] ?? whole);

const plain = html => decode(html.replace(/<br\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, '').replace(/\s+/g, ' ').trim();
// Headings keep only their words, so emoji and icons are dropped.
const headingText = html => plain(html).replace(/^[^\p{L}\p{N}(]+/u, '').trim();
const ended = text => /[.!?:)"]$/.test(text) ? text : `${text}.`;

function blocks(html) {
    const main = html.slice(html.indexOf('<main'), html.lastIndexOf('</main>'));
    const cleaned = main
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|nav|svg|button|template)\b[\s\S]*?<\/\1>/gi, '');
    const out = [];
    // Text between two block tags is one block, so nested list items stay separate.
    const boundary = /<(\/?)(h[1-6]|li|p|ul|ol|td|th|tr|table|dt|dd|dl|summary|details|figcaption|figure|div|section|article|header|footer|blockquote)\b[^>]*>/gi;
    let last = 0, kind = '', heading = 0;
    const flush = end => {
        const text = heading ? headingText(cleaned.slice(last, end)) : plain(cleaned.slice(last, end));
        if(text) out.push({ level: heading, text: kind === 'li' && !heading ? ended(text) : text });
    };
    for(const match of cleaned.matchAll(boundary)) {
        flush(match.index);
        last = match.index + match[0].length;
        const tag = match[2].toLowerCase();
        const closing = match[1] === '/';
        if(/^h[1-4]$/.test(tag)) heading = closing ? 0 : Number(tag[1]);
        if(!heading) kind = closing ? '' : tag;
    }
    return out;
}

function sections(html, page) {
    const result = [];
    let h2 = '', h3 = '', current = null, stopped = false;
    const open = title => { current = { page, title, parts: [] }; result.push(current); };
    for(const block of blocks(html)) {
        if(block.level === 1) { current = null; continue; }
        if(block.level === 2) {
            if(FOOTER.has(block.text)) { stopped = true; current = null; continue; }
            stopped = false;
            h2 = block.text; h3 = '';
            if(SKIP.has(h2)) current = null; else open(h2);
            continue;
        }
        if(stopped) continue;
        if(block.level === 3) {
            h3 = block.text;
            open(h2 === 'Settings' ? h3 : `${h2}, ${h3}`);
            continue;
        }
        if(block.level === 4) {
            const parent = h3 || h2;
            const shared = parent.split(/\s+/).find(word => word.length > 3 && block.text.includes(word));
            open(shared ? block.text : `${parent}, ${block.text}`);
            continue;
        }
        current?.parts.push(block.text);
    }
    return result.filter(section => section.parts.length);
}

function chunks(text) {
    const sentences = text.match(/[^.!?]+(?:[.!?]+["')]?|$)\s*/g) || [text];
    const out = [];
    let piece = '';
    for(const sentence of sentences) {
        if(piece && piece.length + sentence.length > MAX_CHARS) { out.push(piece.trim()); piece = ''; }
        piece += sentence;
    }
    if(piece.trim()) out.push(piece.trim());
    return out;
}

const pages = [['usage guide', 'usage/index.html'], ['help page', 'troubleshoot/index.html']];
const knowledge = [];
for(const [page, file] of pages) {
    for(const section of sections(readFileSync(join(root, file), 'utf8'), page)) {
        chunks(section.parts.join(' ')).forEach((text, index) => {
            knowledge.push({ page, title: section.title, part: index + 1, text });
        });
    }
}

const target = join(here, 'knowledge.js');
writeFileSync(target, `// Generated from usage/index.html and troubleshoot/index.html by build-knowledge.mjs. Do not edit by hand.\nexport const knowledge = ${JSON.stringify(knowledge, null, 1)};\n`);
console.log(`Wrote ${knowledge.length} chunks to ${target}`);
