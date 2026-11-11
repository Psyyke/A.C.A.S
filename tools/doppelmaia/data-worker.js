import { parseGameFiles, buildDataset, validateDataset } from './data.js';
let games;
self.onmessage = ({ data }) => {
    try {
        let lastProgress = 0;
        const progress = (current, total) => {
            const now = performance.now();
            if(current !== total && now - lastProgress < 50) return;
            lastProgress = now;
            self.postMessage({ id: data.id, type: 'progress', current, total });
        };
        if(data.type === 'parse') {
            const parsed = parseGameFiles(data.files, progress);
            games = parsed.games;
            self.postMessage({ id: data.id, players: parsed.players, recommendedPlayer: parsed.recommendedPlayer, diagnostics: parsed.diagnostics, count: games.length });
        } else if(data.type === 'prepare') {
            if(!games?.length) throw new Error('Read game files before preparing a dataset.');
            self.postMessage({ id: data.id, dataset: buildDataset(games, data.player, data.options, progress) });
        } else if(data.type === 'validate') {
            self.postMessage({ id: data.id, dataset: validateDataset(data.dataset, progress) });
        } else throw new Error('Unknown dataset operation.');
    } catch(error) { self.postMessage({ id: data.id, error: error.message || String(error) }); }
};
