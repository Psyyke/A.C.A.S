// Measures how much of Pena's real prose gets a board visual during narration.
// Usage: node tests\pena-visual-coverage.mjs outputs.jsonl [--limit=N] [--samples=concept] [--assert-moves] [--assert-targets]
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { Chess } from '../../libraries/chessjs/chess.js';
import { decodeExplanation } from '../position.js';
import { CommentaryStream, sourceSentences } from '../commentary.js';
import { normalizeNotation, variationFrames, moveArrows, plannedMoves, moveMentions, moveOwner } from '../teacher.js';
import { compileTeaching } from '../narration.js';
import { markCitations, stripMarkers, sentenceCitations, citationFacts } from '../cited-evidence.js';
const SQUARE_NAMES = [...'abcdefgh'].flatMap(file => [1, 2, 3, 4, 5, 6, 7, 8].map(rank => file + rank));

const args = process.argv.slice(2);
const inputs = args.filter(arg => !arg.startsWith('--'));
const limit = Number(args.find(arg => arg.startsWith('--limit='))?.slice(8)) || Infinity;
const sampleConcept = args.find(arg => arg.startsWith('--samples='))?.slice(10);
const mode = args.find(arg => arg.startsWith('--mode='))?.slice(7);
const assertMoves = args.includes('--assert-moves');
const assertTargets = args.includes('--assert-targets');
const minimumTargets = Number(args.find(arg => arg.startsWith('--min-target-coverage='))?.split('=')[1] || 0);
// --evidence feeds the engine, threat and last-move lines from each item's evidence, like the live factsheet does.
const useEvidence = args.includes('--evidence') || args.includes('--cited');
// --cited also hands every sentence the facts it tagged, like the live grounded reply does.
const useCited = args.includes('--cited');
const sanTokens = text => [...text.matchAll(/(?:\d+\.(?:\.\.)?\s*)?((?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8])(?:=[QRBN])?[+#]?|O-O(?:-O)?)/g)].map(match => match[1]);
function playLine(fen, sans) {
    const frames = [];
    try {
        const board = new Chess(fen);
        for(const san of sans) {
            const beforeFen = board.fen();
            const move = board.move(san);
            if(!move) break;
            frames.push({ san: move.san, from: move.from, to: move.to, color: move.color, beforeFen, fen: board.fen() });
        }
    } catch {}
    return frames;
}
function evidenceSheet(item) {
    const byId = {}, references = [];
    if(!item.evidence) return { sheet: { byId }, input: { references } };
    const turn = new Chess(item.fen).turn();
    for(const row of item.evidence.split('\n')) {
        const [, id, body] = row.match(/^\[([^\]]+)\]\s*(.*)$/) || [];
        if(!id) continue;
        let line = [];
        if(/^[LAR]\d$/.test(id)) line = playLine(item.fen, sanTokens(body.match(/\bline\s+([^,]+?)(?:,|\.?$)/)?.[1] || ''));
        else if(id === 'T') line = playLine(item.fen.split(' ').map((field, index) => index === 1 ? turn === 'w' ? 'b' : 'w' : index === 3 ? '-' : field).join(' '), sanTokens(body.match(/would play\s+(\S+?)[,.]?\s/)?.[1] || ''));
        else if(id === 'M' && item.beforeFen) line = playLine(item.beforeFen, sanTokens(body.match(/with the line\s+([^,]+?)(?:,|\.?$)/)?.[1] || ''));
        else if(/^LC\d+$/.test(id)) references.push({ id, kind: 'lc0-line', data: { moves: body.split(' ')[1]?.split(',') || [] } });
        else if(/^MC\d+$/.test(id)) references.push({ id, kind: 'maia-choice', data: { move: body.split(' ')[0] } });
        if(line.length) byId[id] = { id, line };
    }
    return { sheet: { byId }, input: { references } };
}
function evidenceLines(item) {
    if(!useEvidence) return [];
    return Object.values(evidenceSheet(item).sheet.byId).map(fact => fact.line).filter(line => line.length);
}
// Per sentence, the facts the model itself tagged, resolved the way the live reply resolves them.
function sentenceCitationMap(item, body) {
    if(!useCited || !item.originalAnswer) return new Map();
    const { marked, ids } = markCitations(item.originalAnswer, id => /^[A-Z]/.test(id));
    const { clean, marks } = stripMarkers(marked, ids);
    if(clean.trim() !== body.trim()) return new Map();
    const evidence = item.sheetCache ||= evidenceSheet(item);
    return new Map(sentenceCitations(clean, marks).map(sentence =>
        [sentence.index, citationFacts(sentence.ids, { ...evidence, fen: item.fen })]));
}
if(mode && !['brief', 'dynamic', 'original'].includes(mode)) throw new Error('Unknown commentary mode.');
if(!inputs.length) throw new Error('Usage: node tests\\pena-visual-coverage.mjs outputs.jsonl [--limit=N] [--samples=concept]');

const piece = '(?:king|queen|rook|bishop|knight|pawn)';
const concepts = {
    'square': /\b[a-h][1-8]\b/g,
    'piece': new RegExp(`\\b${piece}\\b`, 'gi'),
    'plural pieces': new RegExp(`\\b${piece}s\\b`, 'gi'),
    'square-colored bishop': /\b(?:light|dark)[- ]squared? bishop\b/gi,
    'diagonal': /\b(?:[a-h][1-8]-[a-h][1-8]|(?:long |light[- ]squared? |dark[- ]squared? )?diagonals?)\b/gi,
    'file': /\b(?:(?:half-)?open (?:[a-h][- ])?files?|[a-h][- ]file|semi-open file)\b/gi,
    'rank': /\b(?:[1-8](?:st|nd|rd|th)[- ]rank|(?:second|seventh|back|first|eighth) rank)\b/gi,
    'wing or center': /\b(?:queen[ -]?side|king[ -]?side|cent(?:er|re|ral))\b/gi,
    'king safety': /\b(?:king safety|king(?:'s)? (?:shelter|position|cover)|expos\w+ king|castl\w+)\b/gi,
    'tactic': /\b(?:fork\w*|pin\w*|skewer\w*|discover\w* (?:attack|check)|battery|double attack|mating net|back[- ]rank mate)\b/gi,
    'threat': /\b(?:threat\w*|hanging|undefended|unprotected|loose)\b/gi,
    'pawn feature': /\b(?:passed|isolated|doubled|backward|weak|connected|advanced)[- ]pawns?\b|\bpawn[- ](?:chain|structure|majority|storm|break|islands?)\b/gi,
    'weak square': /\b(?:weak|key|critical|strong) (?:square|outpost|point)s?\b|\boutposts?\b/gi,
    'promotion': /\bpromot\w*\b|\bqueening square\b/gi,
    'trade': /(?<!\bin )\b(?:trad(?:e[sd]?|ing)|exchang\w*|simplif\w*)\b/gi,
    'development': /\b(?:develop\w*|undeveloped|connect\w* (?:the )?rooks)\b/gi
};
Object.assign(concepts, {
    'defensive duties': /\b(?:overload\w*|overwork\w*|defensive duties|tied down)\b/gi,
    'mobility or trap': /\b(?:trapped|restricted|passive|immobile|mobility|nowhere to go)\b/gi,
    'infiltration': /\b(?:infiltrat\w*|penetrat\w*)\b/gi,
    'x-ray': /\bx[- ]?ray\w*\b/gi,
    'material': /\b(?:material (?:edge|advantage|imbalance|balance)|extra (?:piece|pawn)|up (?:a|an|two) (?:rook|piece|pawn))\b/gi,
    'king activity': /\b(?:king activity|active king|king centralization)\b/gi,
    'color complex': /\b(?:(?:light|dark)[- ]square weaknesses|weak (?:color|colour) complex|permanent holes?)\b/gi,
    'forcing resources': /\b(?:forcing (?:moves|resources)|checking initiative|capture targets)\b/gi
});

const stats = Object.fromEntries(Object.keys(concepts).map(name => [name, { mentions: 0, covered: 0 }]));
stats['move notation'] = { mentions: 0, covered: 0 };
const uncovered = new Map();
const samples = [];
let cases = 0, sentences = 0, cuedSentences = 0;
let resolvedMoves = 0, resolvedPlans = 0;
let exactTargets = 0, correctTargets = 0;
const byKind = {};
const byOccurrence = { first: { total: 0, correct: 0 }, later: { total: 0, correct: 0 } };
const failures = new Map();
const resolutions = new Map();
const owners = Object.fromEntries(['player', 'opponent', 'unknown'].map(side => [side, { mentions: 0, covered: 0 }]));
const canonical = values => values.map(value => JSON.stringify(value)).sort();
const stop = new Set('the a an of to and on in its it is with for that this which as by at be from while where can more his her their player opponent player\'s opponent\'s white black move moves continues plays reply best'.split(' '));

for(const input of inputs) {
    const lines = createInterface({ input: createReadStream(resolve(input)), crlfDelay: Infinity });
    for await(const line of lines) {
        if(!line.trim() || cases >= limit) continue;
        const item = JSON.parse(line);
        cases++;
        const turn = new Chess(item.fen).turn();
        const decoded = item.text ?? decodeExplanation(item.raw, turn);
        const body = item.text ?? (mode ? new CommentaryStream({ fen: item.fen, mode, you: true })
            .update(decoded, true, { truncated: item.finishReason === 'length' }).text
            : normalizeNotation(decoded.replace(/^ANALYSIS:\s*/, ''), item.fen));
        let targetCount = 0;
        const cited = sentenceCitationMap(item, body);
        for(const sentence of sourceSentences(body)) {
            const text = sentence.text;
            if(!text) continue;
            const context = body.slice(0, sentence.index + text.length);
            const citations = cited.get(sentence.index) || item.citations || [];
            let compiled;
            try { compiled = compileTeaching(text, item.fen, context, { rootColor: item.playerColor, beforeFen: item.beforeFen,
                evidenceLines: item.lines ||= evidenceLines(item),
                citations, antecedent: item.antecedent || '', question: item.question || '' }); }
            catch(error) { throw new Error(`Teaching cues failed for ${item.fen}: ${text}`, { cause: error }); }
            const { cues, mentions } = compiled;
            for(const mention of mentions) {
                const key = `${mention.kind}: ${mention.status}`;
                resolutions.set(key, (resolutions.get(key) || 0) + 1);
            }
            for(const expected of [...(item.expected || [])].sort((a, b) =>
                (a.index ?? body.indexOf(a.phrase)) - (b.index ?? body.indexOf(b.phrase)))) {
                const index = expected.index ?? body.indexOf(expected.phrase);
                assert.ok(index >= 0, `Annotated phrase not found: ${expected.phrase}`);
                if(index < sentence.index || index >= sentence.index + text.length) continue;
                const start = index - sentence.index, end = start + expected.phrase.length;
                const cue = cues.find(cue => cue.index <= start && cue.end >= end);
                // A plan cue draws its arrow on its own board too, so it counts like a move frame.
                const planned = cue && !cue.references.moves.length && cue.references.plans.length
                    ? { ...cue, references: { ...cue.references, moves: cue.references.plans.map(plan => [plan.from, plan.to]), frames: cue.references.plans } } : null;
                const shown = planned || cue;
                const actual = {
                    squares: cue?.references.squares || [],
                    moves: (shown?.references.moves || []).map(pair => [...pair]),
                    relations: (cue?.references.relations || []).map(pair => [...pair]),
                    regionSquares: [...new Set((cue?.references.regions || []).flatMap(region => region.squares))]
                };
                const placement = fen => fen?.split(' ').slice(0, 2).join(' ');
                // "contains": the named target must be drawn, and any extra square must be the other end of a drawn relation or move.
                const explained = new Set([...actual.relations.flat(), ...actual.moves.flat(), ...actual.regionSquares]);
                const correct = (expected.targetSquares
                    ? expected.targetSquares.every(square => [...actual.squares, ...actual.regionSquares, ...actual.relations.flat()].includes(square))
                        && (!expected.positionFen || cue?.positionFen?.split(' ')[0] === expected.positionFen.split(' ')[0])
                    : expected.match === 'contains'
                    ? (expected.squares || []).every(square => actual.squares.includes(square))
                        && actual.squares.every(square => expected.squares.includes(square) || explained.has(square))
                    : Object.keys(actual).filter(key => expected[key] !== undefined)
                        .every(key => JSON.stringify(canonical(actual[key])) === JSON.stringify(canonical(expected[key]))))
                    && (!expected.fen || shown?.references.frames.some(frame => placement(frame.beforeFen) === placement(expected.fen)));
                const occurrence = byOccurrence[targetCount++ ? 'later' : 'first'];
                occurrence.total++;
                if(correct) occurrence.correct++;
                const kind = expected.kind || 'piece';
                exactTargets++;
                byKind[kind] ||= { total: 0, correct: 0 };
                byKind[kind].total++;
                if(correct) { correctTargets++; byKind[kind].correct++; }
                else {
                    if(kind === 'move') {
                        const reason = !actual.moves.length ? 'no arrow' : JSON.stringify(canonical(actual.moves)) === JSON.stringify(canonical(expected.moves))
                            ? 'right arrow, different board' : 'wrong arrow';
                        failures.set(reason, (failures.get(reason) || 0) + 1);
                        if(reason.startsWith('right') && shown?.references.frames.length) {
                            const grid = position => { const board = new Chess(position); return SQUARE_NAMES.map(square => JSON.stringify(board.get(square))); };
                            const want = grid(expected.fen);
                            const diff = Math.min(...shown.references.frames.map(frame => grid(frame.beforeFen).filter((piece, index) => piece !== want[index]).length));
                            const bucket = `  board diff ${diff <= 2 ? diff : diff <= 4 ? '3-4' : '5+'} squares`;
                            failures.set(bucket, (failures.get(bucket) || 0) + 1);
                        }
                        if(sampleConcept === `miss-${reason.split(' ')[0]}` && samples.length < 200)
                            samples.push({ fen: item.fen, phrase: expected.phrase, text: `${text}\n      expected ${JSON.stringify(expected.moves)} on ${expected.fen}\n      got ${JSON.stringify(actual.moves)} ${(shown?.references.frames || []).map(frame => `${frame.kind}:${frame.beforeFen}`).join(' | ')}` });
                        if(sampleConcept === 'board' && reason.startsWith('right') && samples.length < 40)
                            samples.push({ fen: item.fen, phrase: expected.phrase, text: `${text}\n      expected ${expected.fen}\n      got ${(shown?.references.frames || []).map(frame => `${frame.kind}:${frame.beforeFen}`).join(' | ') || 'no frames'}` });
                    }
                    if(sampleConcept === 'target' && samples.length < 25 || sampleConcept === `target-${kind}` && samples.length < 40)
                        samples.push({ fen: item.fen, phrase: expected.phrase, text: `${text} Expected ${JSON.stringify(expected)}; actual ${JSON.stringify(actual)}` });
                    if(assertTargets) assert.fail(`Wrong annotated target for ${expected.phrase}: ${JSON.stringify(actual)}`);
                }
            }
            if(assertMoves) {
                const offset = context.length - text.length;
                const allFrames = variationFrames(context, item.fen, { rootColor: item.playerColor, beforeFen: item.beforeFen,
                    lines: (item.citations || []).map(({ fact }) => fact.line || []) });
                const frames = allFrames.filter(frame => frame.index >= offset);
                for(const frame of frames) {
                    assert.ok(cues.some(cue => cue.references.frames.some(reference =>
                        reference.index === frame.index && reference.beforeFen === frame.beforeFen)
                        && moveArrows(frame).every(([from, to]) => cue.references.moves
                            .some(arrow => arrow[0] === from && arrow[1] === to))),
                    `Missing legal move arrow for ${frame.san} in ${item.fen}: ${text}`);
                    resolvedMoves++;
                }
                for(const plan of plannedMoves(context, item.fen, { includeIdeas: true, rootColor: item.playerColor, frames: allFrames })
                    .filter(plan => plan.index >= offset && !frames.some(frame => frame.index === plan.index))) {
                    assert.ok(cues.some(cue => cue.references.plans.some(reference =>
                        reference.from === plan.from && reference.to === plan.to)),
                    `Missing plan arrow ${plan.from}-${plan.to} in ${item.fen}: ${text}`);
                    resolvedPlans++;
                }
            }
            sentences++;
            if(cues.length) cuedSentences++;
            const covered = (start, end) => cues.some(cue => cue.index < end && cue.end > start);
            for(const mention of moveMentions(text)) {
                stats['move notation'].mentions++;
                const visualized = cues.some(cue => cue.index < mention.end && cue.end > mention.index
                    && (cue.references.moves.length || cue.references.plans.length));
                if(visualized) stats['move notation'].covered++;
                else if(sampleConcept === 'move' && samples.length < 25)
                    samples.push({ fen: item.fen, phrase: text.slice(mention.index, mention.end), text });
                const frame = mentions.find(item => item.kind === 'move' && item.index === mention.index)?.frame;
                const side = frame?.color || moveOwner(context.slice(0, context.length - text.length + mention.index), item.playerColor);
                const owner = !side || !item.playerColor ? 'unknown' : side === item.playerColor ? 'player' : 'opponent';
                owners[owner].mentions++;
                if(visualized) owners[owner].covered++;
            }
            for(const [name, pattern] of Object.entries(concepts)) {
                for(const match of text.matchAll(pattern)) {
                    stats[name].mentions++;
                    if(covered(match.index, match.index + match[0].length)) stats[name].covered++;
                    else if(name === sampleConcept && samples.length < 25) samples.push({ fen: item.fen, phrase: match[0], text });
                }
            }
            const words = [...text.matchAll(/[A-Za-z][A-Za-z'-]*/g)];
            for(let size = 1; size <= 3; size++) {
                for(let index = 0; index + size <= words.length; index++) {
                    const span = words.slice(index, index + size);
                    if(span.some(word => covered(word.index, word.index + word[0].length))
                        || span.some((word, index) => index && !/^\s+$/.test(text.slice(
                            span[index - 1].index + span[index - 1][0].length, word.index)))) continue;
                    const gram = span.map(word => word[0].toLowerCase());
                    if(stop.has(gram[0]) || stop.has(gram.at(-1))) continue;
                    const key = gram.join(' ');
                    uncovered.set(key, (uncovered.get(key) || 0) + 1);
                }
            }
        }
    }
}

const percent = (part, whole) => whole ? `${(part / whole * 100).toFixed(1)}%` : 'n/a';
if(assertTargets) assert.ok(exactTargets > 0, '--assert-targets needs independently annotated expected targets.');
console.log(`Mode ${mode || 'raw normalized'}, cases ${cases}, sentences ${sentences}, sentences with at least one visual ${percent(cuedSentences, sentences)}`);
console.log(`Exact annotated targets: ${correctTargets}/${exactTargets} (${percent(correctTargets, exactTargets)}). Unannotated prose is not a precision measurement.`);
for(const [kind, result] of Object.entries(byKind)) console.log(`  ${kind}: ${result.correct}/${result.total} (${percent(result.correct, result.total)})`);
for(const [kind, result] of Object.entries(byOccurrence))
    console.log(`  ${kind} target in a reply: ${result.correct}/${result.total} (${percent(result.correct, result.total)})`);
for(const [reason, count] of failures) console.log(`    move miss, ${reason}: ${count}`);
console.log('\nResolution outcomes (unresolved references remain in the report):');
for(const [status, count] of resolutions) console.log(`  ${status}: ${count}`);
console.log('\nMove coverage by owner:');
for(const [owner, result] of Object.entries(owners)) console.log(`  ${owner}: ${result.covered}/${result.mentions} (${percent(result.covered, result.mentions)})`);
if(assertMoves) console.log(`Verified exact arrows for ${resolvedMoves} legally resolved moves and ${resolvedPlans} explicit plans or coordinate ideas.`);
console.log('\nConcept span overlap (diagnostic only, not target correctness):');
for(const [name, { mentions, covered }] of Object.entries(stats))
    console.log(`  ${name.padEnd(22)} ${String(covered).padStart(6)} / ${String(mentions).padEnd(6)} ${percent(covered, mentions)}`);
console.log('\nMost frequent uncovered phrases:');
console.log([...uncovered].filter(([key]) => key.includes(' ')).sort((a, b) => b[1] - a[1]).slice(0, 60)
    .map(([key, count]) => `  ${count}\t${key}`).join('\n'));
if(samples.length) console.log('\nUncovered samples:\n' + samples.map(sample => `  [${sample.phrase}] ${sample.text}\n    ${sample.fen}`).join('\n'));
if(minimumTargets) assert.ok(exactTargets > 0 && correctTargets / exactTargets * 100 >= minimumTargets,
    `Exact target coverage ${percent(correctTargets, exactTargets)} is below ${minimumTargets}%.`);
