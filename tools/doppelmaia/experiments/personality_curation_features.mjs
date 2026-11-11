import { readFile, writeFile } from 'node:fs/promises';
import { personalityFeatures, personalityTraits } from '../personality.js';

const [input, output] = process.argv.slice(2);
if(!input || !output) throw new Error('Provide reconstructed rollout groups and a signature output file.');
const data = JSON.parse(await readFile(input, 'utf8'));
for(const profile of data.profiles) {
    for(const game of profile.games) {
        if(!game.moves.length) throw new Error(`No recorded moves in ${profile.id} game ${game.index}.`);
        const signature = new Float64Array(personalityTraits.length);
        for(const row of game.moves) {
            const values = personalityFeatures({ ...row, legalMoves: [row.move] })[0];
            values.forEach((value, i) => { signature[i] += value / game.moves.length; });
        }
        game.positions = game.moves.length;
        game.signature = Array.from(signature);
        delete game.moves;
    }
}
await writeFile(output, JSON.stringify(data));
