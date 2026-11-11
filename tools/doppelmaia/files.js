export function downloadLink(anchor, blob, name) {
    if(anchor.dataset.objectUrl) URL.revokeObjectURL(anchor.dataset.objectUrl);
    const url = URL.createObjectURL(blob);
    anchor.dataset.objectUrl = url;
    anchor.href = url; anchor.download = name; anchor.hidden = false;
}
export function clearDownload(anchor) {
    if(anchor.dataset.objectUrl) URL.revokeObjectURL(anchor.dataset.objectUrl);
    delete anchor.dataset.objectUrl;
    anchor.removeAttribute('href'); anchor.hidden = true;
}
export function datasetSummary(dataset) {
    return `"${dataset.player}". ${dataset.train.gameIds.length} training games (${dataset.train.samples.length} positions), `
        + `${dataset.validation.gameIds.length} validation games (${dataset.validation.samples.length} positions).`;
}
export function limitTrainingDataset(dataset, limit) {
    if(!Number.isInteger(limit) || limit < 2) throw new Error('Use a position limit of at least two.');
    const trainCount = dataset.train.samples.length, validationCount = dataset.validation.samples.length;
    if(!trainCount || !validationCount) throw new Error('Training needs both training and validation positions.');
    if(trainCount + validationCount <= limit) return dataset;
    const trainLimit = Math.min(trainCount, Math.max(1, limit - validationCount,
        Math.min(limit - 1, Math.round(limit * trainCount / (trainCount + validationCount)))));
    const select = (split, count) => {
        const samples = Array.from({ length: count }, (_, index) =>
            split.samples[Math.floor((index + 0.5) * split.samples.length / count)]);
        const used = new Set(samples.map(sample => sample.gameId));
        const gameIds = split.gameIds.filter(id => used.has(id));
        const indices = new Map(gameIds.map((id, index) => [id, index]));
        return { ...split, gameIds, samples: samples.map(sample => ({
            ...sample, gameIndex: indices.get(sample.gameId)
        })) };
    };
    return { ...dataset, options: { ...dataset.options, maxPositions: limit },
        train: select(dataset.train, trainLimit), validation: select(dataset.validation, limit - trainLimit) };
}
export function validationSummary(report) {
    const checks = [
        ['familiarValidation', 'Familiar positions'],
        ['novelValidation', 'New positions'],
        ['openingValidation', 'Opening positions']
    ].flatMap(([key, label]) => {
        const check = report[key];
        if(!check || !Number.isInteger(check.positions) || check.positions < 1 || !Number.isFinite(check.accuracy)) return [];
        return [`${label} matched your moves ${(check.accuracy * 100).toFixed(1)}% of the time across ${check.positions} positions.`];
    });
    if(report.repertoire?.positions > 0) checks.unshift(report.repertoire.strength > 0
        ? `Your model includes ${report.repertoire.positions} learned opening positions.`
        : 'The opening memory did not improve validation, so it was left off.');
    if(checks.length) checks.push('These checks measure move imitation, not playing strength.');
    return checks.join(' ');
}
export function baselineAccuracy(samples) {
    if(!samples.length) return undefined;
    return samples.reduce((correct, sample) =>
        correct + Number(sample.base.indexOf(Math.max(...sample.base)) === sample.target), 0) / samples.length;
}
export function overfittingNote(history) {
    const detected = history?.some((point, index) => {
        const previous = history[index - 1];
        return previous && [point.trainLoss, point.validationLoss, point.validationAccuracy,
            previous.trainLoss, previous.validationLoss, previous.validationAccuracy].every(Number.isFinite)
            && point.trainLoss < previous.trainLoss && point.validationLoss > previous.validationLoss
            && point.validationAccuracy < previous.validationAccuracy;
    });
    return detected
        ? 'Training improved while validation got worse, which may indicate overfitting. Try a lower learning rate and compare the results. The exported model uses the checkpoint with the lowest validation loss.'
        : '';
}
export function validationPhase(sample) {
    if(Number.isInteger(sample.ply) && sample.ply < 24) return 'opening';
    const board = (sample.fen || sample.history?.[0])?.split(' ')[0];
    if(!board) throw new Error('Cannot measure game phase without a board position.');
    return (board.match(/[prnbqk]/gi) || []).length <= 10 ? 'endgame' : 'middlegame';
}
export function resultComparisons(report) {
    const overall = report.exportedMetrics;
    const baseline = report.history?.find(point => point.epoch === 0);
    return [
        ['All validation positions', overall, report.baselineAccuracy ?? baseline?.validationAccuracy],
        ['Familiar positions', report.familiarValidation, report.familiarValidation?.baselineAccuracy],
        ['New positions', report.novelValidation, report.novelValidation?.baselineAccuracy],
        ['Opening positions', report.openingValidation, report.openingValidation?.baselineAccuracy],
        ['Middlegame positions', report.middlegameValidation, report.middlegameValidation?.baselineAccuracy],
        ['Endgame positions', report.endgameValidation, report.endgameValidation?.baselineAccuracy]
    ].map(([label, measured, original]) => {
        const available = measured && Number.isFinite(original) && Number.isFinite(measured.accuracy)
            && measured.positions !== 0;
        return { label,
            original: available ? original : null, trained: available ? measured.accuracy : null };
    });
}
export function detectImport(text, name) {
    text = text.replace(/^\uFEFF/, '').trim();
    if(!text) throw new Error(`${name} is empty. Choose a game export with moves.`);
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const pgnStart = text.replace(/^(?:\s*\{[^}]*\}|\s*;[^\n]*(?:\n|$))*/, '').trimStart();
    const looksPgn = /^\[\w+\s+"/.test(pgnStart) || /^\d+\.(?:\.\.)?\s*[KQRBNa-hO]/.test(pgnStart);
    if(/^[{[]/.test(text) && !looksPgn) {
        let value;
        try { value = JSON.parse(text); }
        catch {
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            try {
                if(lines.length < 2) throw new Error();
                value = lines.map(line => JSON.parse(line));
            } catch { throw new Error(`${name} contains broken JSON. Export the games again with moves included.`); }
        }
        if(object(value) && ['version', 'train', 'validation'].some(key => key in value))
            return { kind: 'dataset', dataset: value };
        const entries = Array.isArray(value) ? value : object(value) && Array.isArray(value.games) ? value.games : [value];
        if(!entries.length || entries.some(entry => !object(entry) ||
            !(typeof entry.pgn === 'string' || typeof entry.moves === 'string')))
            throw new Error(`${name} has no supported game records. Use a Chess.com or Lichess game export with moves, not a profile or archive list.`);
        return { kind: 'games', file: { name: `${name}.json`, text: JSON.stringify(entries) } };
    }
    if(!/\b(?:\d+\.(?:\.\.)?\s*)?(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O)(?:[+#?!]|\s|$)/.test(text))
        throw new Error(`${name} is not a supported game export. Choose PGN, Chess.com JSON or Lichess JSON and NDJSON with moves.`);
    return { kind: 'games', file: { name: `${name}.pgn`, text } };
}
export function workerClient(url) {
    const worker = new Worker(url, { type: 'module' }), pending = new Map();
    let id = 0, failed;
    const fail = message => {
        failed = new Error(message);
        for(const { reject } of pending.values()) reject(failed);
        pending.clear(); worker.terminate();
    };
    worker.onerror = event => fail(event.message || 'Dataset worker could not start.');
    worker.onmessageerror = () => fail('Dataset worker returned an unreadable message.');
    worker.onmessage = ({ data }) => {
        const entry = pending.get(data.id);
        if(!entry) return;
        if(data.type === 'progress') {
            entry.onProgress?.(data);
            return;
        }
        pending.delete(data.id);
        data.error ? entry.reject(new Error(data.error)) : entry.resolve(data);
    };
    return (data, onProgress) => {
        if(failed) return Promise.reject(failed);
        return new Promise((resolve, reject) => {
            const request = ++id;
            pending.set(request, { resolve, reject, onProgress });
            worker.postMessage({ ...data, id: request });
        });
    };
}
