import { preprocess, mirrorFenIfNecessary, mirrorMove, allPossibleMovesReversed, parseSetOption, parseGo, parsePosition } from './utils.js';

import * as ort from '../../libraries/onnxruntime-web/ort.wasm.bundle.min.js';
import { Chess } from '../../libraries/chessjs/chess.js';

export default class Neural {
	constructor(modelUrl) {
		this.modelUrl = modelUrl;
		this.ChessLib = Chess;
		this.board = new Chess();
		this.ready = false;
		this.listen = () => null;
		this.options = { history: [], multipv: 1 };

		this.init();
	}

	async init() {
		const buffer = await this.getCachedModel(this.modelUrl);

		console.log(buffer, this.modelUrl);

		this.model = await ort.InferenceSession.create(buffer, {
			executionProviders: ['webgpu', 'wasm'],
			webgpu: {
				devicePreference: 'high-performance',
				pipelineHint: 'fastest'
			},
			wasm: {
				threads: navigator.hardwareConcurrency || 4,
				simd: true
			}
		});
		this.ready = true;
	}

	async uci(line) {
		const tokens = line.split(/\s+/);
		const cmd = tokens[0];

		switch (cmd) {
			case 'uci':
				this.listen('id name Fusion Alpha');
				this.listen('id author Haka (Thanks to the Lc0-, Maia- & Stockfish developers!)');
				this.listen('uciok');
				break;
	
			case 'isready':
				this.listen('readyok');
				break;
	
			case 'ucinewgame':
				this.board.reset();
				break;
	
			case 'setoption':
				const option = parseSetOption(line);
	
				if(!option) break;
				if(option.name === 'MultiPV') this.options.multipv = parseInt(option.value);

				break;
	
			case 'position':
				const { fen, moves } = parsePosition(line);
				
				if(fen !== 'startpos') {
					this.board.load(mirrorFenIfNecessary(fen));
				} else {
					this.board.reset();
				}
		
				for(const move of moves) {
					this.board.move({
						from: move.slice(0, 2),
						to: move.slice(2, 4),
						promotion: 'q'
					});
				}

				break;

			case 'd':
				this.listen(`Fen: ${this.board.fen()}`);
				break;
	
			case 'go':
				const { nodes, history, searchMoves } = parseGo(line);

				if(history === 'none') this.options.history = [];
				else if(history) this.options.history = history;

				const output = await this.evaluate(searchMoves);

				this.listen({ 'fen': this.board.fen(), 'policy': output.policy });

				break;
		}
	}

	async getCachedModel(url) {
		const cache = await caches.open('fusion-neural-model');
		let res = await cache.match(url);
		if(res) return res.arrayBuffer();

		res = await fetch(url);
		if(!res.ok) throw new Error('Failed to fetch model');

		await cache.put(url, res.clone());
		return res.arrayBuffer();
	}

	async evaluate(searchMoves, forcedFen) {
		const fen = forcedFen || this.board.fen();
		const { boardInput, legalMoves } =
			preprocess(fen, this.options.history, this.ChessLib);

		const feeds = {
			'/input/planes': new ort.Tensor('float32', boardInput, [1, 112, 8, 8])
		};

		const neuralOut = await this.model.run(feeds);

		return this.processOutputs(fen, neuralOut, legalMoves, searchMoves);
	}

	processOutputs(fen, neuralOut, legalMoves, searchMoves) {
		const policyTensor = neuralOut['/output/policy']?.cpuData;
		const wdlTensor = neuralOut['/output/wdl']?.cpuData;

		let winProb = wdlTensor
			? wdlTensor[0] + 0.5 * wdlTensor[1]
			: 0.5;
		winProb = Math.min(Math.max(winProb, 0), 1);

		const blackFlag = fen.split(' ')[1] === 'b';

		const legalIdx = [...legalMoves.entries()]
			.filter(([_, v]) => v > 0)
			.map(([i]) => i);

		const moves = legalIdx.map(i =>
			blackFlag
				? mirrorMove(allPossibleMovesReversed[i])
				: allPossibleMovesReversed[i]
		);

		const temp = 1.61;
		const legalLogits = legalIdx.map(i => policyTensor[i]);
		const maxLogit = Math.max(...legalLogits);

		const expLogits = legalLogits.map(l =>
			Math.exp((l - maxLogit) / temp)
		);
		const sumExp = expLogits.reduce((a, b) => a + b, 0);

		let policyEntries = moves.map((m, i) => [
			m,
			expLogits[i] / sumExp
		]);

		if (searchMoves) {
			policyEntries = policyEntries.filter(([key]) =>
				searchMoves.some(sm => key.startsWith(sm[0] + sm[1]))
			);
		}

		// sort best policy first
		policyEntries.sort((a, b) => b[1] - a[1]);

		return {
			policy: policyEntries,
			value: Math.round(winProb * 10000) / 10000
		};
	}
}