import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { personalityFeatures, personalityScores, personalityCandidates } from '../personality.js';

const [study] = process.argv.slice(2);
if(!study) throw new Error('Provide the completed personality study directory.');
const report = JSON.parse(await readFile(join(study, 'personality-rollouts.json'), 'utf8'));
for(const profile of report.profiles) {
    const config = personalityCandidates.find(row => row.id === profile.id);
    if(!config) throw new Error(`Unknown rollout personality ${profile.id}.`);
    const moves = JSON.parse(await readFile(join(study, `${profile.id}-rollout-moves.json`), 'utf8'));
    for(const control of [false, true]) {
        const group = moves.filter(move => move.control === control);
        let expected = 0, base = 0, actual = 0;
        for(const move of group) {
            const scores = personalityScores(personalityFeatures(move), config);
            expected += scores.reduce((sum, score, i) => sum + score * move.personal[i], 0);
            base += scores.reduce((sum, score, i) => sum + score * move.base[i], 0);
            actual += scores[move.legalMoves.indexOf(move.move)];
        }
        profile[control ? 'baseVisitedBoards' : 'personalVisitedBoards'] = {
            positions: group.length, expectedScore: expected / group.length,
            baseExpectedScore: base / group.length, actualChosenScore: actual / group.length
        };
    }
    console.log(profile.id, 'own board expected score change',
        (profile.personalVisitedBoards.expectedScore - profile.personalVisitedBoards.baseExpectedScore).toFixed(4));
}
await writeFile(join(study, 'personality-rollouts.json'), JSON.stringify(report, null, 2));
