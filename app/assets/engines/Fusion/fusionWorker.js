import Neural from './Neural/neural.js';
import { loadMoves } from './Neural/utils.js';

let currentFen = '';

let neuralEngine = null;
let neuralResults = [];

let factEngine = null;
let factResults = [];
let factHasBeenCalculated = false;

const factOptions = {
    'Hash': 16,
    'Threads': 2,
    'MultiPV': 20
};

const factEngineOptions = [
    `setoption name Hash value ${factOptions.Hash}`,
    `setoption name Threads value ${factOptions.Threads}`,
    `setoption name MultiPV value ${factOptions.MultiPV}`
];

function parseUCIResponse(response) {
    const keywords = ['id', 'name', 'author', 'uciok', 'readyok', 
        'bestmove', 'option', 'info', 'score', 'pv', 'mate', 'cp',
        'wdl', 'depth', 'seldepth', 'nodes', 'time', 'nps', 'tbhits',
        'currmove', 'currmovenumber', 'hashfull', 'multipv',
        'refutation', 'line', 'stop', 'ponderhit', 'ucs',
        'position', 'startpos', 'moves', 'files', 'ranks',
        'pocket', 'template', 'variant', 'ponder', 'Fen:', 'bmc'];

    const data = {};
    let currentKeyword = null;
    
    response.split(/\s+/).forEach(token => {
        if (keywords.includes(token) || token.startsWith('info')) {
            if (token.startsWith('info')) {
                return;
            }

            currentKeyword = token;
            data[currentKeyword] = '';

        } else if (currentKeyword !== null) {
            if (!isNaN(token) && !/^[rnbqkpRNBQKP\d]+$/.test(token)) {
                data[currentKeyword] = parseInt(token);
            } else if (data[currentKeyword] !== '') {
                data[currentKeyword] += ' ';
                data[currentKeyword] += token;
            } else {
                data[currentKeyword] += token;
            }
        }
    });
    
    return data;
}

function bestEngineAgreement(neuralResults, factResults, neuralWeight = 1, factWeight = 1) {
    // Map fact moves to their index for O(1) lookup
    const factIndexMap = new Map();
    for (let i = 0; i < factResults.length; i++) {
        factIndexMap.set(factResults[i], i);
    }

    const matches = [];

    for (let i = 0; i < neuralResults.length; i++) {
        const move = neuralResults[i][0];
        if (factIndexMap.has(move)) {
            const factIdx = factIndexMap.get(move);

            // Score: lower is better
            // We weight neural more heavily, so neuralIdx matters more
            const score = neuralWeight * i + factWeight * factIdx;

            matches.push({ move: neuralResults[i], score });
        }
    }

    // Sort by score (best matches first)
    matches.sort((a, b) => a.score - b.score);

    // Return only the moves
    return matches.map(m => m.move);
}

function parseStockfishOutput(line) {
    if(line.includes('bestmove')) {
        factHasBeenCalculated = true;
        attemptToProcessBestMoves();

        return;
    }

    if(!line.startsWith('info')) return;

    const parsed = parseUCIResponse(line);

    if(parsed.pv === undefined && parsed.cp === undefined) return;
    if(factResults.length >= factOptions.MultiPV)
        factResults = [];

    console.warn(line);
    // This pushes moves automatically sorted, best move is first in the array
    factResults.push(parsed.pv?.split(' ')[0]);
}

function loadStockfish(folderName = 'stockfish-17-lite-single', fileName = folderName) {
    const stockfish = new Worker(`../${folderName}/${fileName}.js`);
    let stockfish_loaded = false;

    stockfish.onmessage = async e => {
        if(!stockfish_loaded) {
            stockfish_loaded = true;

            factEngine = {
                'engine': (method, a) => stockfish[method](...a),
                'uci': msg => stockfish.postMessage(msg),
                'worker': stockfish
            };
        }

        parseStockfishOutput(e.data);
    };

    stockfish.onerror = e => {
        throw new Error(`Stockfish engine error: ${e.message}`);
    };
}

function postBestMoves(fen, bestMatchObj, multipv = 5) {
    const winPercentage = 0.5;
    const cp = Math.round(-800 * Math.log10(1 / winPercentage - 1));

    // Convert policy object to array of [move, probability] — already sorted

    console.log("Matches:",bestMatchObj); // Log moves in order

    const lines = [];

    for (let i = 0; i < Math.min(multipv, bestMatchObj.length); i++) {
        const [move, prob] = bestMatchObj[i];
        lines.push(
            `info depth 1 seldepth 1 multipv ${i + 1} score cp ${cp} nodes 1 nps 1 time 0 pv ${move}`
        );
    }

    if(bestMatchObj.length > 0)
        lines.push(`bestmove ${bestMatchObj[0][0]}`);
    else
        lines.push(`bestmove (none)`);

    lines.forEach(line => postMessage(line));
}

function resetResults() {
    neuralResults = [];
    factResults = [];
    factHasBeenCalculated = false;
}

function attemptToProcessBestMoves() {
    if(neuralResults?.length && factHasBeenCalculated) {
        const bestMoves = bestEngineAgreement(neuralResults, factResults);

        postBestMoves(null, bestMoves);

        console.log(neuralResults, factResults, bestMoves);

        resetResults();
    }
}

(async () => {
    loadStockfish();
    await loadMoves();

    const engine = new Neural('Neural/meangirl.onnx');

    while(!engine.ready) await new Promise(r => setTimeout(r, 50));
    while(!factEngine) await new Promise(r => setTimeout(r, 50));

    factEngineOptions.forEach(uciOption => factEngine.uci(uciOption));

    neuralEngine = engine;
    neuralEngine.listen = data => {
        neuralResults = data?.policy;
        attemptToProcessBestMoves();
    };
})();

onmessage = e => {
    const { method, args } = e.data;
    
    if(!neuralEngine) {
        postMessage(false);
        return;
    }

    if(neuralEngine && factEngine && method === 'acas_check_loaded') {
        postMessage(true);

        postMessage('id name Fusion - Neural Engine');
        postMessage('id author A.C.A.S');
        postMessage('uciok');

        return;
    }

    if(method === 'uci') {
        const cmd = args[0].split(' ')[0];

        switch(cmd) {
            case 'isready':
                postMessage('readyok');
                break;
            
            case 'position':
                resetResults();
                console.warn('RESET RESULTS DUE TO NEW POSITION');
                break;
                
            case 'd':
                //postMessage(`Fen: ${currentFen}`);
                break;
        }

        neuralEngine.uci(...args);

        if(!args[0]?.includes('setoption'))
            factEngine.uci(...args);
    }
};