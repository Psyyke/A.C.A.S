import { parentPort, workerData } from 'node:worker_threads';
import { analyzeGames } from './analyze.mjs';

parentPort.on('message', games => {
    try { parentPort.postMessage({ stats: analyzeGames(games, workerData) }); }
    catch(error) { parentPort.postMessage({ error: error.stack || error.message }); }
});
