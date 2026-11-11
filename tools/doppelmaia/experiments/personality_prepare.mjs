import { readFile, writeFile } from 'node:fs/promises';
import { parseGameFiles, buildDataset, validateDataset } from '../data.js';
import { positionSignature, signatureKey } from '../repertoire.js';
import { personalityFeatures, personalityCandidates, personalityTraits } from '../personality.js';

const [input, output, research] = process.argv.slice(2);
if(!input || !output || !research) throw new Error('Provide a local PGN, browser dataset path and research dataset path.');
const { games, diagnostics } = parseGameFiles([{ name: 'practice.pgn', text: await readFile(input, 'utf8') }]);
const rejected = diagnostics.filter(row => row.status === 'rejected');
if(rejected.some(row => row.message !== 'Game has no moves')) throw new Error(JSON.stringify(rejected.slice(0, 3)));
if(rejected.length) console.log(`Excluded ${rejected.length} source games without moves.`);
if(games.length < 200) throw new Error('Use at least 200 complete practice games.');
for(const game of games) {
    game.white = game.black = 'Practice';
    game.whiteAliases = game.blackAliases = ['Practice'];
}
const cut = Math.floor(games.length * 0.8), seen = new Set();
const main = buildDataset(games.slice(0, cut), 'Practice', { maxPositions: 3000, seed: 42 });
const test = buildDataset(games.slice(cut), 'Practice', { maxPositions: 1200, validationFraction: 0 });
const unique = samples => samples.filter(sample => {
    const key = signatureKey(positionSignature(sample.fen));
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
});
main.train.samples = unique(main.train.samples);
main.validation.samples = unique(main.validation.samples);
test.train.samples = unique(test.train.samples);
main.source = { url: 'https://database.lichess.org/', license: 'CC0', note: 'Anonymous practice positions, not a human personality or strength benchmark.' };
validateDataset(main);
validateDataset(test);
await writeFile(output, JSON.stringify(main));
const study = { dataset: main, test: test.train, traits: personalityTraits, presets: personalityCandidates, moveFeatures: {} };
for(const [split, samples] of [['train', main.train.samples], ['validation', main.validation.samples], ['test', test.train.samples]]) {
    study.moveFeatures[split] = samples.map(personalityFeatures);
    console.log(split, samples.length, 'positions', new Set(samples.map(sample => sample.gameId)).size, 'games');
}
await writeFile(research, JSON.stringify(study));
