// Adds independent concept targets from the frozen board facts cited by real replies.
// Usage: node tests\pena-concept-targets.mjs corpus.jsonl annotated.jsonl
import { readFile, writeFile } from 'node:fs/promises';
import { Chess, SQUARES } from '../../libraries/chessjs/chess.js';
import { sourceSentences } from '../commentary.js';
import { moveMentions } from '../teacher.js';

const [input, output] = process.argv.slice(2);
if(!input || !output) throw new Error('Provide the source corpus and annotated output path.');
const patterns = {
    pin: /\bpin(?:s|ned|ning)?\b/gi,
    hanging: /\b(?:hanging|undefended|unprotected|loose)\b/gi,
    'passed pawn': /\bpassed(?:[- ]pawns?)?\b/gi,
    'isolated pawn': /\bisolated(?:[- ]pawns?)?\b/gi,
    'doubled pawns': /\bdoubled(?:[- ]pawns?)?\b/gi,
    'backward pawn': /\bbackward(?:[- ]pawns?)?\b/gi,
    'bishop pair': /\b(?:bishop pair|pair of bishops)\b/gi,
    development: /\b(?:develop\w*|at home|asleep|undeveloped)\b/gi,
    'king safety': /\b(?:king safety|king(?:'s)? (?:position|cover|shelter)|(?:un)?castl\w*)\b/gi,
    'open file': /\bopen (?:[a-h][- ]?)?file\b/gi,
    'half-open file': /\b(?:half|semi)[- ]open (?:[a-h][- ]?)?file\b/gi,
    'pawn majority': /\bpawn majority\b/gi,
    'pawn chain': /\bpawn chain\b/gi
};
const totals = {}, rejected = {};
const items = (await readFile(input, 'utf8')).trim().split('\n').map(JSON.parse);
for(const item of items) {
    const facts = new Map();
    const board = new Chess(item.fen);
    for(const line of item.evidence.split('\n')) {
        const parsed = line.match(/^\[(F\d+)\] ([^(]+) \((?:you|opponent)\): (White|Black)\b(.*)$/);
        if(!parsed) continue;
        const [, id, kind, colorWord, body] = parsed;
        const color = colorWord[0].toLowerCase();
        const named = [...body.matchAll(/\b[a-h][1-8]\b/g)].map(match => match[0]);
        let targets = [];
        if(kind === 'pin') targets = named.slice(1, 2);
        else if(['hanging', 'passed pawn', 'isolated pawn', 'backward pawn'].includes(kind)) targets = named.slice(0, 1);
        else if(kind === 'doubled pawns' || kind === 'pawn chain') {
            targets = (body.split(/\b(?:protect|the base|on the same)\b/i)[0].match(/\b[a-h][1-8]\b/g) || []);
        } else if(kind === 'bishop pair') targets = SQUARES.filter(square => board.get(square)?.color === color && board.get(square)?.type === 'b');
        else if(kind === 'development') targets = named;
        else if(kind === 'king safety') {
            const king = named[0];
            if(king) targets = SQUARES.filter(square => Math.abs(square.charCodeAt(0) - king.charCodeAt(0)) <= 1
                && Math.abs(Number(square[1]) - Number(king[1])) <= 1);
        } else if(kind === 'open file' || kind === 'half-open file') {
            const file = body.match(/\b([a-h])-file\b/)?.[1];
            if(file) targets = SQUARES.filter(square => square[0] === file);
        } else if(kind === 'pawn majority') {
            const wing = /queenside/.test(body) ? 'abcd' : /kingside/.test(body) ? 'efgh' : '';
            targets = SQUARES.filter(square => wing.includes(square[0]) && board.get(square)?.type === 'p' && board.get(square)?.color === color);
        }
        if(!targets.length) continue;
        const geometric = ['king safety', 'open file', 'half-open file'].includes(kind);
        if(!geometric && targets.some(square => !board.get(square))) continue;
        facts.set(id, { kind, targets, color });
    }
    const tags = [];
    let plain = '', end = 0;
    for(const match of item.originalAnswer.matchAll(/[ \t]*\[([^\]\n]+)\]/g)) {
        plain += item.originalAnswer.slice(end, match.index);
        tags.push({ at: plain.length, id: match[1] });
        end = match.index + match[0].length;
    }
    plain += item.originalAnswer.slice(end);
    const leading = plain.length - plain.trimStart().length;
    if(plain.trim() !== item.text) throw new Error(`Evidence-tag offsets disagree for ${item.id}.`);
    tags.forEach(tag => { tag.at -= leading; });
    for(const sentence of sourceSentences(item.text)) {
        // Frozen F facts describe the root, not every subset or consequence of a proposed move.
        if(moveMentions(item.text.slice(0, sentence.index + sentence.text.length)).length
            || /\b(?:after|once|if|would|could|in that line|earlier|back then)\b/i.test(sentence.text)) continue;
        for(const [kind, pattern] of Object.entries(patterns)) for(const match of sentence.text.matchAll(pattern)) {
            const index = sentence.index + match.index;
            if(/\b(?:not|never|no|isn't|aren't|can't)\s+(?:\w+\s+){0,3}$/i.test(item.text.slice(0, index))) continue;
            // A sentence-level fact citation is an oracle only when it identifies one distinct target.
            const candidates = tags.filter(tag => tag.at >= index && tag.at <= sentence.index + sentence.text.length + 1)
                .map(tag => facts.get(tag.id)).filter(fact => fact?.kind === kind);
            const distinct = [...new Map(candidates.map(fact => [JSON.stringify(fact.targets), fact])).values()];
            if(distinct.length !== 1) { rejected[kind] = (rejected[kind] || 0) + 1; continue; }
            const fact = distinct[0];
            if(kind === 'development' && !/\b(?:minor pieces|pieces at home|four|three|all|development)\b/i.test(sentence.text)) continue;
            item.expected ||= [];
            item.expected.push({ kind: 'concept', concept: kind, index, phrase: match[0],
                targetSquares: fact.targets, positionFen: item.fen });
            totals[kind] = (totals[kind] || 0) + 1;
        }
    }
}
await writeFile(output, items.map(item => JSON.stringify(item)).join('\n') + '\n');
console.log(JSON.stringify({ responses: items.length, annotated: totals, withoutUniqueFrozenFact: rejected }));
