import { Chess } from '../libraries/chessjs/chess.js';
import Stockfish from './stockfish.js';
import { defaultOptions, optionLines, setOption } from './options.js';
import { readPosition, readGo, readInfo } from './protocol.js';
import { blendMoves, objectiveRoot } from './blend.js';
import { moveFeatures } from './personality.js';
import { createSeed, individualStyle, isValidSeed } from './identity.js';

export default class FusionEngine {
    constructor(emit, onError, identitySeed) {
        this.emit = emit;
        this.onError = onError;
        this.options = defaultOptions();
        this.identitySeed = isValidSeed(identitySeed) ? identitySeed : createSeed();
        this.board = new Chess();
        this.position = 'position startpos';
        this.positionValid = true;
        this.current = null;
        this.backendSearch = null;
        this.backendQueue = Promise.resolve();
        this.newGame = true;
        this.stockfishOptions = new Map();
        this.closed = false;
        this.stockfish = new Stockfish(line => this.receiveStockfish(line), error => this.fail(error));

        // Loading Maia must not delay the UCI option list or block stop commands.
        this.neural = import('./Neural/neural.js').then(async ({ default: Neural }) => {
            if(this.closed) return null;
            const neural = new Neural(message => this.report(message));
            this.neuralEngine = neural;
            await neural.ready;
            return neural;
        }).catch(error => {
            this.neuralError = error;
            this.report(`Maia 3 initialization unavailable; suggestions paused: ${error.message}`);
            return null;
        });
    }

    report(message) {
        if(!this.closed) this.emit(`info string Fusion: ${String(message).replace(/[\r\n]+/g, ' ')}`);
    }

    identify() {
        this.emit('id name A.C.A.S Fusion (Maia 3 + Stockfish 18 Lite Single)');
        this.emit('id author A.C.A.S; Maia by CSSLab; Stockfish developers');
        optionLines().forEach(line => this.emit(line));
        this.emit('uciok');
    }

    command(line) {
        if(this.closed || typeof line !== 'string') return;
        line = line.trim();
        const command = line.split(/\s+/)[0];

        try {
            switch(command) {
                case 'uci':
                    this.identify();
                    break;
                case 'isready':
                    Promise.all([this.stockfish.ready, this.neural]).then(() => {
                        if(!this.closed) return this.stockfish.synchronize();
                    })
                        .then(() => { if(!this.closed) this.emit('readyok'); })
                        .catch(error => this.fail(error));
                    break;
                case 'setoption':
                    this.configure(line);
                    break;
                case 'position': {
                    const board = readPosition(line);
                    this.stop();
                    this.board = board;
                    this.position = line;
                    this.positionValid = true;
                    break;
                }
                case 'ucinewgame':
                    this.stop();
                    this.board.reset();
                    this.position = 'position startpos';
                    this.positionValid = true;
                    this.newGame = true;
                    this.neuralEngine?.clear();
                    break;
                case 'go':
                    this.go(line);
                    break;
                case 'stop':
                    this.stop();
                    break;
                case 'ponderhit':
                    if(this.current?.ponder) {
                        this.current.ponder = false;
                        if(this.backendSearch === this.current) this.stockfish.send('ponderhit');
                        else this.current.command = this.current.command.replace(/\bponder\b\s*/, '');
                        this.finishWhenReady(this.current);
                    }
                    break;
                case 'd':
                    this.emit(`Fen: ${this.board.fen()}`);
                    break;
                case 'quit':
                    this.dispose();
                    break;
            }
        } catch(error) {
            if(command === 'position') {
                this.stop();
                this.positionValid = false;
            }
            this.report(error.message);
            if(command === 'go') this.emit('bestmove (none)');
        }
    }

    configure(line) {
        // Generic app options must not weaken the objective search: Fusion uses
        // its human policy rather than Stockfish's skill-level random weakening.
        if(/^setoption\s+name\s+ACAS_LearningMode\s+value\s+/i.test(line)) {
            this.learningMode = /\btrue$/i.test(line);
            return;
        }
        if(/^setoption\s+name\s+UCI_Chess960\s+value\s+true$/i.test(line)) {
            this.report('Chess960 is not supported by the Maia 3 tokenizer; use a Stockfish engine for Chess960.');
            return;
        }

        const name = setOption(this.options, line);
        if(name === 'Clear Hash') {
            this.stop();
            this.neuralEngine?.clear();
            this.backendQueue = this.backendQueue.then(async () => {
                await this.stockfish.ready;
                if(!this.closed) this.stockfish.send('setoption name Clear Hash');
            }).catch(error => this.fail(error));
        }
    }

    go(command) {
        this.stop();
        if(!this.positionValid) {
            this.emit('bestmove (none)');
            return;
        }
        const parsed = readGo(command, this.board);
        const options = { ...this.options };

        // Learning mode can disable sampling, but must not bypass the human policy.
        if(this.learningMode) options.Randomness = 0;

        const search = {
            ...parsed, options, fen: this.board.fen(), position: this.position,
            startedAt: performance.now(), candidates: new Map(), frame: new Map(),
            frameDepth: -1, policy: null, neuralDone: false, neuralError: null,
            stockDone: false, finished: false
        };
        search.identitySeed = options['Random Seed'] || this.identitySeed;
        search.personalStyle = individualStyle(search.identitySeed, options['Personal Variation']);
        search.multiPV = Math.min(search.legal.size, Math.max(options.MultiPV,
            options['Stockfish Weight'] === 0 ? search.legal.size : options['Candidate Moves']));
        this.current = search;

        if(!search.legal.size) {
            if(!this.board.moves().length) {
                const score = this.board.in_checkmate() ? 'mate 0' : 'cp 0';
                this.emit(`info depth 0 score ${score} nodes 0 time 0`);
            }
            this.finish(search);
            return;
        }

        search.features = moveFeatures(search.fen, search.legal);
        this.neural.then(neural => {
            if(!search.finished && !this.closed) {
                if(!neural) throw this.neuralError || new Error('Maia 3 is unavailable');
                return neural.evaluate(search.fen, options.UCI_Elo, options.Enemy_Elo,
                    () => this.current === search && !search.finished && !search.stopped && !this.closed);
            }
        }).then(result => {
            if(search.finished || this.closed) return;
            if(!result?.policy) throw new Error('Maia did not supply a human move policy');
            search.policy = result.policy;
            search.neuralDone = true;
            this.publish(search);
            this.finishWhenReady(search);
        }).catch(error => {
            if(search.finished || this.closed) return;
            search.neuralError = error;
            this.report(`Maia recovery exhausted; no engine-only suggestion will be emitted: ${error.message}`);
            search.neuralDone = true;
            if(this.backendSearch === search && !search.stockDone) this.stop(search);
            else this.finish(search);
        });

        // Drain the old bestmove before sending another position/go to Stockfish.
        this.backendQueue = this.backendQueue.then(() => this.runStockfish(search))
            .catch(error => this.fail(error));
    }

    async runStockfish(search) {
        await this.stockfish.ready;
        if(search.finished || this.closed) return;

        for(const name of ['Hash', 'Move Overhead', 'UCI_ShowWDL']) {
            if(this.stockfishOptions.get(name) !== search.options[name]) {
                this.stockfish.send(`setoption name ${name} value ${search.options[name]}`);
                this.stockfishOptions.set(name, search.options[name]);
            }
        }
        this.stockfish.send(`setoption name MultiPV value ${search.multiPV}`);
        if(this.newGame) {
            this.stockfish.send('ucinewgame');
            this.newGame = false;
        }
        await this.stockfish.synchronize();
        if(search.finished || this.closed) return;

        const drained = new Promise(resolve => search.resolveBackend = resolve);
        this.backendSearch = search;
        this.stockfish.send(search.position);
        this.stockfish.send(search.command);
        return drained;
    }

    receiveStockfish(line) {
        const search = this.backendSearch;
        if(!search) return;

        if(line.startsWith('bestmove ')) {
            search.stockDone = true;
            clearTimeout(search.stopTimer);
            this.backendSearch = null;
            search.resolveBackend();

            if(search.finished) return;
            if(!search.candidates.size) {
                search.candidates = new Map([...search.frame.values()].map(candidate => [candidate.move, candidate]));
            }
            this.finishWhenReady(search);
            return;
        }

        if(search.finished) return;
        const info = readInfo(line);
        if(!info || !search.legal.has(info.move)) return;
        const depth = info.depth || 0;
        if(depth < search.frameDepth) return;
        if(depth > search.frameDepth) {
            search.frameDepth = depth;
            search.frame.clear();
        }
        search.frame.set(info.multipv || 1, info);
        search.nodes = info.nodes;
        search.nps = info.nps;

        // Publish coherent MultiPV iterations, not a mix of unrelated depths.
        if(search.frame.size >= search.multiPV) {
            search.candidates = new Map([...search.frame.values()].map(candidate => [candidate.move, candidate]));
            this.publish(search);
        }
    }

    finishWhenReady(search) {
        if(search.finished || !search.stockDone || (search.ponder && !search.stopped)) return;
        if(search.neuralDone || search.stopped) {
            this.finish(search);
        } else if(!search.neuralTimer) {
            const remaining = search.movetime === null ? Infinity
                : Math.max(0, search.movetime - (performance.now() - search.startedAt));
            const wait = search.clockLimited ? 0 : Math.min(search.options['Maia Wait'], remaining);

            search.neuralTimer = setTimeout(() => {
                search.neuralError = new Error('Maia wait limit reached');
                this.report('Maia wait limit reached; cancelling the suggestion rather than using raw Stockfish.');
                this.finish(search);
            }, wait);
        }
    }

    ranked(search, sample) {
        return blendMoves(search, sample);
    }

    publish(search, ranked = this.ranked(search, false)) {
        if(search.finished || this.current !== search || this.closed) return;

        const root = objectiveRoot(search);
        const rootScore = root?.mate != null ? ` rootmate ${root.mate}`
            : root?.cp != null ? ` rootcp ${root.cp}` : '';
        const rootWdl = search.options.UCI_ShowWDL && root?.wdl ? ` rootwdl ${root.wdl}` : '';
        const rootDetails = root ? `${rootScore}${rootWdl} rootmove ${root.move} rootpv ${root.pv.join(' ')}` : '';
        if(root && !ranked.length) {
            // Objective analysis remains available without implying a human move.
            const score = root.mate != null ? `mate ${root.mate}` : `cp ${root.cp}`;
            const wdl = search.options.UCI_ShowWDL && root.wdl ? ` wdl ${root.wdl}` : '';
            this.emit(`info depth ${root.depth || 0} score ${score}${rootDetails}${wdl}`
                + ` nodes ${search.nodes || 0} time ${Math.max(0, Math.round(performance.now() - search.startedAt))}`);
        }
        for(let index = 0; index < Math.min(search.options.MultiPV, ranked.length); index++) {
            const candidate = ranked[index];
            const score = candidate.mate != null ? ` score mate ${candidate.mate}`
                : candidate.cp != null ? ` score cp ${candidate.cp}` : '';
            const wdl = search.options.UCI_ShowWDL && candidate.wdl ? ` wdl ${candidate.wdl}` : '';
            this.emit(`info depth ${candidate.depth || 0} seldepth ${candidate.seldepth || candidate.depth || 0}`
                + ` multipv ${index + 1}${score}${rootDetails}${wdl}`
                + ` nodes ${search.nodes || 0} nps ${search.nps || 0}`
                + ` time ${Math.max(0, Math.round(performance.now() - search.startedAt))}`
                + ` pv ${candidate.pv.join(' ')} prob ${((candidate.probability || 0) * 100).toFixed(2)}`);
        }
    }

    finish(search) {
        if(search.finished) return;
        clearTimeout(search.neuralTimer);

        if(!search.candidates.size && search.frame.size) {
            search.candidates = new Map([...search.frame.values()].map(candidate => [candidate.move, candidate]));
        }
        const ranked = this.ranked(search, true);
        if(ranked[0]?.maiaFallback) {
            this.report('No mixed candidate qualified; using Maia policy with personality and personal variation. '
                + 'Stockfish selection penalties and tactical safety are bypassed for this suggestion.');
        }
        if(search.legal.size && !ranked.length) {
            const reason = search.neuralError?.message || (search.policy
                ? 'Maia supplied no valid probability for an allowed legal move'
                : search.stopped ? 'Search stopped before a Maia policy was available'
                    : 'No valid Maia policy was available');
            this.report(`error: ${reason}. No move suggested; raw Stockfish is never substituted.`);
        }
        this.publish(search, ranked);
        search.finished = true;
        if(this.current === search) this.current = null;

        const best = ranked[0];
        const ponder = best?.pv[1] ? ` ponder ${best.pv[1]}` : '';
        this.emit(`bestmove ${best?.move || '(none)'}${ponder}`);
    }

    stop(search = this.current) {
        if(!search || search.stopped) return;
        search.stopped = true;

        if(this.backendSearch === search && !search.stockDone) {
            this.stockfish.send('stop');
            search.stopTimer = setTimeout(() => {
                if(this.backendSearch === search) this.fail(new Error('Stockfish did not stop'));
            }, 5000);
            return;
        }
        // No live Stockfish search: only an existing Maia policy may yield a move.
        this.finish(search);
    }

    fail(error) {
        if(this.closed) return;
        this.dispose();
        this.onError(error);
    }

    dispose() {
        if(this.closed) return;
        this.closed = true;
        clearTimeout(this.current?.neuralTimer);
        clearTimeout(this.backendSearch?.stopTimer);
        this.stockfish.dispose();
        this.backendSearch?.resolveBackend();
        this.neuralEngine?.dispose();
    }
}