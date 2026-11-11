import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';

export const DATASET_VERSION = 1;
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const STANDARD = new Set(['standard', 'chess', 'normal', 'from position', 'fromposition']);
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const identity = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const uci = move => move.from + move.to + (move.promotion || '');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function board(fen) {
    const chess = new Chess();
    assert(typeof fen === 'string' && chess.load(fen), 'Invalid starting FEN');
    const placement = chess.fen().split(' ')[0];
    assert((placement.match(/K/g) || []).length === 1 &&
        (placement.match(/k/g) || []).length === 1, 'FEN must contain both kings');
    assert(!/[pP]/.test(placement.split('/')[0] + placement.split('/')[7]),
        'FEN contains an unpromoted pawn on a promotion rank');
    return chess;
}

function hash(text) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619);
        b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return (a >>> 0).toString(16).padStart(8, '0') +
        (b >>> 0).toString(16).padStart(8, '0');
}

function aliases(...values) {
    return [...new Map(values.filter(value => identity(value))
        .map(value => [identity(value), value.trim()])).values()];
}

// Tokenize before replay: chess.js's PGN loader accepts moves after a result marker.
function pgnRecords(text) {
    const records = [];
    let current = { headers: {}, tokens: [] }, i = 0;
    const finish = () => {
        if (Object.keys(current.headers).length || current.tokens.length || current.error)
            records.push(current);
        current = { headers: {}, tokens: [] };
    };
    while (i < text.length) {
        const char = text[i];
        if (/\s/.test(char) || char === '\uFEFF') { i++; continue; }
        if (char === ';' || (char === '%' && (i === 0 || text[i - 1] === '\n'))) {
            const end = text.indexOf('\n', i);
            i = end < 0 ? text.length : end + 1;
            continue;
        }
        if (char === '{' || char === '(') {
            const close = char === '{' ? '}' : ')';
            let depth = 1;
            i++;
            while (i < text.length && depth) {
                if (char === '(' && text[i] === '{') {
                    const end = text.indexOf('}', i + 1);
                    if (end < 0) { i = text.length; break; }
                    i = end + 1;
                    continue;
                }
                if (char === '(' && text[i] === ';') {
                    const end = text.indexOf('\n', i + 1);
                    i = end < 0 ? text.length : end + 1;
                    continue;
                }
                if (char === '(' && text[i] === '(') depth++;
                if (text[i] === close) depth--;
                i++;
            }
            if (depth) current.error = 'Unterminated PGN comment or variation';
            continue;
        }
        if (char === '[') {
            if (current.tokens.length) finish();
            const match = /^\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*\]/.exec(text.slice(i));
            if (!match) {
                current.error = 'Malformed PGN header';
                const end = text.indexOf('\n', i);
                i = end < 0 ? text.length : end + 1;
            } else {
                current.headers[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
                i += match[0].length;
            }
            continue;
        }
        const match = /^[^\s{}()[\];]+/.exec(text.slice(i));
        if (!match) { current.error = 'Unexpected PGN delimiter'; i++; continue; }
        i += match[0].length;
        const token = match[0].replace(/^\d+\.(?:\.\.)?/, '')
            .replace(/^\.\.\./, '').replace(/\$\d+/g, '');
        if (!token) continue;
        if (RESULTS.has(token)) { current.result = token; finish(); }
        else current.tokens.push(token);
    }
    finish();
    return records;
}

function normalize(record, metadata = {}) {
    assert(!record.error, record.error);
    const headers = record.headers;
    const variant = metadata.rules ?? metadata.variant ?? headers.Variant ?? 'standard';
    const variantName = object(variant) ? variant.key : variant;
    assert(typeof variantName === 'string' && STANDARD.has(identity(variantName)),
        `Unsupported variant: ${String(variantName)}`);
    assert(headers.SetUp !== '1' || typeof headers.FEN === 'string', 'SetUp requires a FEN header');
    const startFen = metadata.initialFen ?? headers.FEN ?? new Chess().fen();
    const chess = board(startFen);
    const canonicalFen = chess.fen();
    if (metadata.initialFen !== undefined && headers.FEN !== undefined)
        assert(board(headers.FEN).fen() === canonicalFen, 'Conflicting starting FENs');
    assert(record.tokens.length > 0, 'Game has no moves');
    const moves = [];
    for (const token of record.tokens) {
        const move = UCI.test(token)
            ? chess.move({ from: token.slice(0, 2), to: token.slice(2, 4), promotion: token[4] })
            : chess.move(token.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O'));
        assert(move, `Invalid move at ply ${moves.length + 1}: ${token}`);
        moves.push(uci(move));
    }
    if (headers.Result !== undefined) assert(RESULTS.has(headers.Result), 'Invalid PGN result');
    assert(!record.result || !headers.Result || record.result === headers.Result,
        'PGN header and movetext results disagree');
    const white = metadata.white?.username ?? metadata.players?.white?.user?.name ??
        metadata.players?.white?.user?.id ?? headers.White ?? '';
    const black = metadata.black?.username ?? metadata.players?.black?.user?.name ??
        metadata.players?.black?.user?.id ?? headers.Black ?? '';
    assert(typeof white === 'string' && typeof black === 'string', 'Invalid player names');
    assert(metadata.winner === undefined || ['white', 'black'].includes(metadata.winner),
        'Invalid winner');
    const result = record.result ?? headers.Result ??
        (metadata.winner === 'white' ? '1-0' : metadata.winner === 'black' ? '0-1' :
            ['draw', 'stalemate'].includes(metadata.status) ? '1/2-1/2' : undefined);
    const canonical = canonicalFen + '\n' + moves.join(' ');
    const game = {
        id: 'game-' + hash(canonical),
        white: white.trim(), black: black.trim(),
        whiteAliases: aliases(white, metadata.players?.white?.user?.id, headers.White),
        blackAliases: aliases(black, metadata.players?.black?.user?.id, headers.Black),
        startFen: canonicalFen, moves
    };
    if (result && result !== '*') game.result = result;
    for (const color of ['white', 'black']) {
        const rating = metadata[color]?.rating ?? metadata.players?.[color]?.rating ??
            headers[color === 'white' ? 'WhiteElo' : 'BlackElo'];
        if ((typeof rating === 'number' || typeof rating === 'string') &&
            String(rating).trim() && Number.isFinite(Number(rating)) && Number(rating) > 0)
            game[color + 'Elo'] = Number(rating);
    }
    if (typeof metadata.id === 'string') game.sourceId = metadata.id;
    return { game, canonical };
}

/**
 * Parse local file text only. Diagnostics contain {file, entry, status, message, gameId?}.
 * games use canonical startFen and UCI moves; players is a case-insensitive display-name list.
 */
export function parseGameFiles(files, onProgress) {
    assert(Array.isArray(files), 'Files must be an array');
    const games = [], diagnostics = [], seen = new Map(), players = new Map();
    const accept = (record, metadata, file, entry) => {
        try {
            const { game, canonical } = normalize(record, metadata);
            const previous = seen.get(canonical);
            if (previous) {
                // Preserve aliases from different exports without counting the game twice.
                for (const color of ['white', 'black']) {
                    previous[color + 'Aliases'] = aliases(...previous[color + 'Aliases'], ...game[color + 'Aliases']);
                    if (previous[color + 'Elo'] === undefined && game[color + 'Elo'] !== undefined)
                        previous[color + 'Elo'] = game[color + 'Elo'];
                }
                if (!previous.result && game.result) previous.result = game.result;
                if (!previous.white) previous.white = game.white;
                if (!previous.black) previous.black = game.black;
                diagnostics.push({ file, entry, status: 'duplicate', message: 'Identical moves and starting position', gameId: previous.id });
                return;
            }
            seen.set(canonical, game);
            games.push(game);
            diagnostics.push({ file, entry, status: 'accepted', message: 'Game imported', gameId: game.id });
        } catch (error) {
            diagnostics.push({ file, entry, status: 'rejected', message: error.message });
        }
    };
    for (const [fileIndex, file] of files.entries()) {
        const name = typeof file?.name === 'string' ? file.name : `file-${fileIndex + 1}`;
        if (typeof file?.text !== 'string' || !file.text.trim()) {
            diagnostics.push({ file: name, entry: 1, status: 'rejected', message: 'File is empty or has no text' });
            continue;
        }
        const text = file.text.replace(/^\uFEFF/, '').trim();
        const json = !/\.pgn$/i.test(name) && (/\.(?:json|jsonl|ndjson)$/i.test(name) ||
            /^[{[]/.test(text) && !/^\[\w+\s+"/.test(text));
        if (!json) {
            const records = pgnRecords(text);
            records.forEach((record, index) => {
                accept(record, {}, name, index + 1);
                onProgress?.(fileIndex + (index + 1) / records.length, files.length);
            });
            if (!records.length)
                diagnostics.push({ file: name, entry: 1, status: 'rejected', message: 'File contains no games' });
            continue;
        }
        let entries;
        try {
            const parsed = JSON.parse(text);
            entries = Array.isArray(parsed) ? parsed :
                object(parsed) && Array.isArray(parsed.games) ? parsed.games : [parsed];
        } catch {
            entries = text.split(/\r?\n/).filter(line => line.trim()).map(line => {
                try { return JSON.parse(line); } catch { return null; }
            });
        }
        entries.forEach((entry, index) => {
            try {
                assert(object(entry), 'Malformed JSON game entry');
                assert(typeof entry.pgn === 'string' || typeof entry.moves === 'string',
                    'JSON game requires pgn or SAN moves');
                const records = pgnRecords(entry.pgn ?? entry.moves);
                assert(records.length === 1, 'JSON game must contain exactly one game');
                accept(records[0], entry, name, index + 1);
            } catch (error) {
                diagnostics.push({ file: name, entry: index + 1, status: 'rejected', message: error.message });
            }
            onProgress?.(fileIndex + (index + 1) / entries.length, files.length);
        });
    }
    for (const game of games) {
        for (const name of [game.white, game.black])
            if (identity(name) && !players.has(identity(name))) players.set(identity(name), name);
    }
    const gameCounts = new Map();
    for (const game of games) {
        const names = new Set([game.white, game.black, ...game.whiteAliases, ...game.blackAliases].map(identity));
        for (const name of names) gameCounts.set(name, (gameCounts.get(name) || 0) + 1);
    }
    const sortedPlayers = [...players.values()].sort((a, b) => identity(a).localeCompare(identity(b)));
    const recommendedPlayer = sortedPlayers.reduce((best, name) =>
        (gameCounts.get(identity(name)) || 0) > (gameCounts.get(identity(best)) || 0) ? name : best, '');
    onProgress?.(files.length, files.length);
    return { games, players: sortedPlayers, recommendedPlayer, diagnostics };
}

function integer(value, name, minimum = 0) {
    assert(Number.isSafeInteger(value) && value >= minimum, `Invalid ${name}`);
    return value;
}

function repetitionKey(chess) {
    const fields = chess.fen().split(' ').slice(0, 4);
    // An uncapturable en-passant square does not distinguish repeated positions.
    if (fields[3] !== '-' && !chess.moves({ verbose: true }).some(move => move.flags.includes('e')))
        fields[3] = '-';
    return fields.join(' ');
}

function* gameSamples(game, target, config, gameIndex) {
    const chess = board(game.startFen), history = [], repetitions = [], occurrences = new Map();
    for (let ply = 0; ply < game.moves.length; ply++) {
        const key = repetitionKey(chess);
        const previous = occurrences.get(key) || 0;
        occurrences.set(key, previous + 1);
        history.unshift(chess.fen());
        repetitions.unshift(previous > 0 ? 1 : 0);
        if (history.length > 8) { history.pop(); repetitions.pop(); }
        const color = chess.turn();
        const names = color === 'w' ? [game.white, ...game.whiteAliases] : [game.black, ...game.blackAliases];
        if (ply >= config.skipFirstPlies && names.some(name => identity(name) === target)) {
            const sample = {
                gameId: game.id, gameIndex, ply, color, fen: chess.fen(), history: [...history],
                repetitions: [...repetitions],
                move: game.moves[ply], legalMoves: chess.moves({ verbose: true }).map(uci).sort()
            };
            if (game.result) sample.result = game.result;
            yield sample;
        }
        const move = game.moves[ply];
        assert(chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }),
            'Invalid canonical move');
    }
}

function spreadSamples(samples, limit, offset) {
    if(samples.length <= limit) return samples;
    if(!limit) return [];
    if(limit === 1) return [samples[Math.floor(offset * samples.length)]];
    const opening = samples.filter(sample => sample.ply < 24), later = samples.filter(sample => sample.ply >= 24);
    let early = Math.min(opening.length, Math.max(1, Math.round(limit * 0.3)));
    const late = Math.min(later.length, limit - early);
    early = Math.min(opening.length, limit - late);
    const pick = (pool, count) => Array.from({ length: count }, (_, i) =>
        pool[count === 1 ? Math.floor(offset * pool.length) : Math.round(i * (pool.length - 1) / (count - 1))]);
    const selected = [...pick(opening, early), ...pick(later, late)].sort((a, b) => a.ply - b.ply);
    const start = Math.floor(offset * selected.length);
    return [...selected.slice(start), ...selected.slice(0, start)];
}

/**
 * train/validation each contain {gameIds, samples}. Samples contain current-first
 * history and binary repetitions (up to 8), fen, move (UCI), legalMoves (UCI),
 * color, zero-based ply, gameId, gameIndex (within the split),
 * and optional absolute PGN result. Splitting is by game before sampling.
 */
export function buildDataset(games, player, options = {}, onProgress) {
    assert(Array.isArray(games), 'Games must be an array');
    const target = identity(player);
    assert(target, 'Select a player');
    const config = {
        validationFraction: options.validationFraction ?? 0.2,
        seed: options.seed ?? 42,
        maxPositions: options.maxPositions ?? 6000,
        skipFirstPlies: options.skipFirstPlies ?? 0,
        maxPerGame: options.maxPerGame ?? 200
    };
    assert(Number.isFinite(config.validationFraction) && config.validationFraction >= 0 &&
        config.validationFraction <= 1, 'Invalid validationFraction');
    integer(config.seed, 'seed');
    for (const key of ['maxPositions', 'skipFirstPlies', 'maxPerGame']) integer(config[key], key);
    const unique = new Map();
    let checked = 0, sampled = 0;
    for (const game of games) {
        assert(object(game) && Array.isArray(game.moves) && game.moves.every(move => typeof move === 'string' && UCI.test(move)),
            'Invalid canonical game');
        const normalized = normalize({ headers: {}, tokens: game.moves }, {
            initialFen: game.startFen, white: { username: game.white }, black: { username: game.black }
        }).game;
        assert(game.id === normalized.id, 'Canonical game ID does not match moves');
        assert(game.result === undefined || RESULTS.has(game.result) && game.result !== '*', 'Invalid game result');
        for (const color of ['white', 'black'])
            assert(Array.isArray(game[color + 'Aliases']) && game[color + 'Aliases'].every(name => typeof name === 'string'),
                'Invalid player aliases');
        if ([...game.whiteAliases, ...game.blackAliases, game.white, game.black].some(name => identity(name) === target))
            unique.set(game.id, game);
        onProgress?.(++checked, games.length * 2);
    }
    const selected = [...unique.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    let state = config.seed >>> 0;
    for (let i = selected.length - 1; i > 0; i--) {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        const j = ((value ^ value >>> 14) >>> 0) % (i + 1);
        [selected[i], selected[j]] = [selected[j], selected[i]];
    }
    let count = Math.floor(selected.length * config.validationFraction);
    if (selected.length > 1 && config.validationFraction > 0 && config.validationFraction < 1)
        count = Math.max(1, Math.min(selected.length - 1, count));
    const dataset = {
        version: DATASET_VERSION, player: target, options: config,
        train: { gameIds: [], samples: [] }, validation: { gameIds: [], samples: [] }
    };
    const ratings = selected.flatMap(game => ['white', 'black'].flatMap(color =>
        [game[color], ...game[color + 'Aliases']].some(name => identity(name) === target)
            && Number.isFinite(game[color + 'Elo']) && game[color + 'Elo'] > 0 ? [game[color + 'Elo']] : []));
    if (ratings.length) dataset.playerElo = Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
    dataset.gameRatings = Object.fromEntries(selected.flatMap(game => {
        const color = ['white', 'black'].find(color =>
            [game[color], ...game[color + 'Aliases']].some(name => identity(name) === target));
        const rating = game[color + 'Elo'];
        return Number.isFinite(rating) && rating > 0 ? [[game.id, rating]] : [];
    }));
    const partitions = { validation: selected.slice(0, count), train: selected.slice(count) };
    // Reserve each partition a proportional budget so a global cap cannot starve validation.
    const validationBudget = selected.length ? Math.round(config.maxPositions * count / selected.length) : 0;
    for (const partition of ['validation', 'train']) {
        const budget = partition === 'validation' ? validationBudget : config.maxPositions - validationBudget;
        const output = dataset[partition];
        output.gameIds = partitions[partition].map(game => game.id);
        const quota = Math.max(1, Math.ceil(budget / Math.max(1, partitions[partition].length)));
        let active = partitions[partition].map((game, index) => {
            const pool = [...gameSamples(game, target, config, index)];
            const offset = ((parseInt(game.id.slice(-8), 16) ^ config.seed) >>> 0) / 0x100000000;
            const first = spreadSamples(pool, Math.min(config.maxPerGame, quota), offset);
            const chosen = new Set(first.map(sample => sample.ply));
            const rest = spreadSamples(pool.filter(sample => !chosen.has(sample.ply)), config.maxPerGame - first.length, offset);
            onProgress?.(games.length + ++sampled, games.length + selected.length);
            return [...first, ...rest][Symbol.iterator]();
        });
        while (active.length && output.samples.length < budget) {
            const next = [];
            for (const iterator of active) {
                if (output.samples.length >= budget) break;
                const item = iterator.next();
                if (!item.done) { output.samples.push(item.value); next.push(iterator); }
            }
            active = next;
        }
    }
    onProgress?.(1, 1);
    return dataset;
}

/** Validate an untrusted JSON dataset before passing it to a trainer; throws on error. */
export function validateDataset(dataset, onProgress) {
    assert(object(dataset) && dataset.version === DATASET_VERSION, 'Unsupported dataset version');
    assert(typeof dataset.player === 'string' && identity(dataset.player), 'Invalid dataset player');
    assert(dataset.playerElo === undefined || Number.isSafeInteger(dataset.playerElo) && dataset.playerElo > 0,
        'Invalid dataset player Elo');
    assert(dataset.gameRatings === undefined || object(dataset.gameRatings)
        && Object.entries(dataset.gameRatings).every(([id, rating]) =>
            /^game-[a-f0-9]{16}$/.test(id) && Number.isFinite(rating) && rating > 0), 'Invalid game ratings');
    const owners = new Set();
    const total = ['train', 'validation'].reduce((sum, key) =>
        sum + (Array.isArray(dataset[key]?.samples) ? dataset[key].samples.length : 0), 0);
    let checked = 0;
    for (const partition of ['train', 'validation']) {
        const split = dataset[partition];
        assert(object(split) && Array.isArray(split.gameIds) && Array.isArray(split.samples), 'Invalid dataset split');
        const ids = new Set();
        for (const id of split.gameIds) {
            assert(typeof id === 'string' && /^game-[a-f0-9]{16}$/.test(id) && !owners.has(id), 'Duplicate or invalid game ID');
            owners.add(id);
            ids.add(id);
        }
        const positions = new Set();
        for (const sample of split.samples) {
            assert(object(sample) && ids.has(sample.gameId), 'Sample has no game in its split');
            integer(sample.ply, 'sample ply');
            integer(sample.gameIndex, 'sample gameIndex');
            assert(split.gameIds[sample.gameIndex] === sample.gameId, 'Invalid sample gameIndex');
            const key = sample.gameId + ':' + sample.ply;
            assert(!positions.has(key), 'Duplicate sample');
            positions.add(key);
            assert(Array.isArray(sample.history) && sample.history.length >= 1 && sample.history.length <= 8 &&
                sample.history[0] === sample.fen && sample.history.length === Math.min(sample.ply + 1, 8),
            'Invalid sample history');
            assert(Array.isArray(sample.repetitions) && sample.repetitions.length === sample.history.length &&
                sample.repetitions.every(value => value === 0 || value === 1), 'Invalid sample repetitions');
            const chess = board(sample.fen);
            assert(sample.color === chess.turn(), 'Invalid sample color');
            for (const fen of sample.history) board(fen);
            // Validate historical continuity, not just individually well-formed positions.
            for (let i = sample.history.length - 1; i > 0; i--) {
                const previous = board(sample.history[i]);
                const next = sample.history[i - 1];
                const possible = previous.moves({ verbose: true }).some(move => {
                    previous.move(move);
                    const matches = previous.fen() === next;
                    previous.undo();
                    return matches;
                });
                assert(possible, 'Discontinuous sample history');
            }
            const legal = chess.moves({ verbose: true }).map(uci).sort();
            assert(Array.isArray(sample.legalMoves) && sample.legalMoves.length === legal.length &&
                [...sample.legalMoves].sort().every((move, index) => move === legal[index]),
            'Invalid legal moves');
            assert(typeof sample.move === 'string' && legal.includes(sample.move), 'Invalid played move');
            assert(sample.result === undefined || RESULTS.has(sample.result) && sample.result !== '*', 'Invalid sample result');
            onProgress?.(++checked, total);
        }
    }
    return dataset;
}
