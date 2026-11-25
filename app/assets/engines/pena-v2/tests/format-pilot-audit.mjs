import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import { decodePcf } from '../pcf-evidence.js';
import { compactPredicateVector, renderReadableMessage } from '../readable-evidence.js';
import { pcfBinPropMotifs } from '../binprop-full.js';
import { compactHistoryRelations, compactHistorySquares, selectQuestionEvidence } from '../question-evidence-pilot.js';

const [dataset, countArg = '10'] = process.argv.slice(2);
const count = Number(countArg);
if(!dataset || !Number.isSafeInteger(count) || count < 1 || count > 100)
    throw new Error('Usage: node format-pilot-audit.mjs DATASET.jsonl [samples per train/validation split, 1-100]');

const samples = { train: [], validation: [] };
for await (const line of createInterface({ input: createReadStream(dataset), crlfDelay: Infinity })) {
    const row = JSON.parse(line);
    if(!Object.hasOwn(samples, row.split)) continue;
    const hash = createHash('sha256').update(row.id).digest('hex');
    const candidates = samples[row.split];
    if(candidates.length < count || hash < candidates.at(-1).hash) {
        candidates.push({ hash, row });
        candidates.sort((a, b) => a.hash.localeCompare(b.hash));
        if(candidates.length > count) candidates.pop();
    }
}
const refs = text => new Set([...text.matchAll(/\[([^\]\r\n]+)\]/g)].map(match => match[1]));
const pieceNames = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const comparisonMetrics = {
    'pawn structure': 'ps', 'pawn pressure': 'pp', 'defensive duties': 'dd',
    'king zone pressure': 'kz', 'advanced control': 'ac', 'developed minors': 'dm', 'central controls': 'cc'
};
function readComparisons(text) {
    const lines = text.split('\n'), rows = [];
    for(let i = 0; i < lines.length; i++) {
        if(!lines[i].startsWith('M comparison C: ')) continue;
        const group = lines[i].slice('M comparison C: '.length).split('\t');
        assert.equal(group.length, 4);
        assert.equal(lines[++i], 'metric\tcolor\tpreferred range\talternative range\tdifference range\tbounded');
        while(i + 1 < lines.length) {
            const fields = lines[i + 1].split('\t'), metric = comparisonMetrics[fields[0]];
            if(!metric) break;
            assert.equal(fields.length, 6);
            const expand = value => {
                const parts = value.split('..');
                assert.ok(parts.length <= 2);
                return parts.length === 1 ? [parts[0], parts[0]] : parts;
            };
            rows.push(['C', ...group, metric, fields[1], ...expand(fields[2]), ...expand(fields[3]),
                ...expand(fields[4]), fields[5]]);
            i++;
        }
    }
    return rows;
}
function restoreVector(encoded, binary) {
    if(!encoded.startsWith('all ')) return encoded;
    const [baseline, exceptions] = encoded.slice(4).split(' except ');
    const values = Array(pcfBinPropMotifs.length).fill(baseline);
    if(exceptions) for(const entry of exceptions.split(', ')) {
        const divider = entry.lastIndexOf('=');
        const index = pcfBinPropMotifs.findIndex(motif => motif.name === entry.slice(0, divider));
        if(index < 0 || divider < 0) throw new Error('Invalid named predicate exception.');
        values[index] = entry.slice(divider + 1);
    }
    return values.join(binary ? '' : ',');
}
const report = [];
for(const split of Object.keys(samples)) {
    if(samples[split].length !== count) throw new Error(`Not enough ${split} examples.`);
    for(const { row } of samples[split]) {
        const messages = row.messages;
        const last = messages.at(-1).content;
        const questionAt = last.lastIndexOf('\n\nPlayer question: ');
        if(questionAt < 0 || last.indexOf('PCF/3') < 0) throw new Error(`Missing evidence envelope in ${row.id}.`);
        const question = last.slice(questionAt + '\n\nPlayer question: '.length);
        const pcf = last.slice(last.indexOf('PCF/3'), questionAt);
        const original = decodePcf(pcf);
        const selection = selectQuestionEvidence(original, { question, fen: row.fen, priorMessages: messages.slice(0, -1) });
        const current = rows => rows.filter(item => item.values[0] === 'C' && ['R', 'BINS'].includes(item.kind));
        assert.deepEqual(current(selection.rows), current(original.rows), `Current relations or BinProps changed in ${row.id}.`);
        assert.equal(current(selection.rows).filter(item => item.kind === 'BINS').length, 2);
        const currentPieces = original.rows.filter(item => item.kind === 'R' && item.values[0] === 'C');
        const historyIds = new Set(selection.rows.filter(item => item.kind === 'R' && item.values[0].startsWith('H')).map(item => item.values[0]));
        for(const historyId of historyIds) {
            const pieces = selection.rows.filter(item => item.kind === 'R' && item.values[0] === historyId);
            const delta = compactHistoryRelations(currentPieces, pieces);
            const restored = new Map(currentPieces.filter(item => !delta.absent.includes(item.values[3]))
                .map(item => [item.values[3], [historyId, ...item.values.slice(1)]]));
            for(const changed of delta.changed) restored.set(changed.values[3], changed.values);
            const sorted = items => items.sort((a, b) => a[3].localeCompare(b[3]));
            assert.deepEqual(sorted([...restored.values()]), sorted(pieces.map(item => item.values)), `History changed in ${row.id}.`);
            for(const kind of ['G', 'P']) {
                const currentRows = selection.rows.filter(item => item.kind === kind && item.values[0] === 'C');
                const historyRows = selection.rows.filter(item => item.kind === kind && item.values[0] === historyId);
                if(!historyRows.length) continue;
                const squareDelta = compactHistorySquares(currentRows, historyRows, kind);
                const squareRestored = new Map(currentRows.filter(item => !squareDelta.absent.includes(item.values[1]))
                    .map(item => [item.values[1], [historyId, ...item.values.slice(1)]]));
                for(const changed of squareDelta.changed) squareRestored.set(changed.values[1], changed.values);
                const sortedSquares = items => items.sort((a, b) => a[1].localeCompare(b[1]));
                assert.deepEqual(sortedSquares([...squareRestored.values()]), sortedSquares(historyRows.map(item => item.values)), `History ${kind} changed in ${row.id}.`);
            }
        }
        for(const item of selection.rows) {
            const vectors = item.kind === 'BINLINE' ? [[5, true]]
                : item.kind === 'BINCOMP' ? [[8, false], [9, false], [10, false], [11, false], [12, true]] : [];
            for(const [index, binary] of vectors) {
                const value = item.values[index];
                assert.equal(restoreVector(compactPredicateVector(value, binary), binary), value, `Comparison vector changed in ${row.id}.`);
            }
        }
        const rendered = renderReadableMessage(last, { format: 'question-focused', fen: row.fen, priorMessages: messages.slice(0, -1) });
        assert.deepEqual(readComparisons(rendered),
            selection.rows.filter(item => item.kind === 'M' && item.values[0] === 'C').map(item => item.values),
            `Comparison records changed in ${row.id}.`);
        const renderedLines = new Set(rendered.split('\n'));
        for(const piece of currentPieces) {
            const [, square, type, entity, ...relations] = piece.values;
            const line = [`[C.${square}]`, type[0] === 'w' ? 'White' : 'Black', pieceNames[type[1]], entity,
                ...relations.map(value => value.replace(/,/g, ' '))].join('\t');
            assert.ok(renderedLines.has(line), `Current piece record is missing in ${row.id}: ${square}.`);
        }
        const bins = current(selection.rows).filter(item => item.kind === 'BINS');
        const white = bins.find(item => item.values[1] === 'w'), black = bins.find(item => item.values[1] === 'b');
        assert.ok(white && black, `BinProp perspectives missing in ${row.id}.`);
        for(let i = 0; i < pcfBinPropMotifs.length; i++) {
            assert.ok(renderedLines.has(`${pcfBinPropMotifs[i].name}: ${white.values[i + 2]}/${black.values[i + 2]}`),
                `BinProp ${i + 1} missing in ${row.id}.`);
        }
        const expandedOriginal = renderReadableMessage(last, { format: 'compact' });
        const before = refs([...messages.slice(0, -1).map(message => message.content), expandedOriginal].join('\n'));
        const after = refs([...messages.slice(0, -1).map(message => message.content), rendered].join('\n'));
        const target = refs(row.answer);
        report.push({
            split, id: row.id, question, omitted: selection.omitted, askedMoves: selection.askedMoves,
            missingMoves: selection.missingMoves, derivedMoves: selection.derivedMoves, unresolved: selection.unresolved,
            targetReferencesNotInOriginal: [...target].filter(ref => !before.has(ref)),
            targetReferencesLost: [...target].filter(ref => before.has(ref) && !after.has(ref)),
            originalMessages: messages,
            focusedMessages: [...messages.slice(0, -1), { ...messages.at(-1), content: rendered }]
        });
    }
}
console.log(JSON.stringify({ schema: 'pena-question-evidence-pilot-audit/1', sampling: 'lowest SHA-256 of row ID per split', report }));
