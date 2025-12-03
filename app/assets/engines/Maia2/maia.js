import * as ort from '../../../../assets/libraries/onnxruntime-web/ort.wasm.bundle.min.js';
import { preprocess, mirrorMove, allPossibleMovesReversed, parseSetOption, parsePosition, policyToUciLines } from './utils.js';

export default class Maia {
	constructor(modelUrl, ChessLib, board) {
		this.modelUrl = modelUrl;
		this.ChessLib = ChessLib;
		this.board = board;
		this.ready = false;
		this.listen = () => null;
		this.options = { eloSelf: 1500, eloOppo: 1500, multipv: 2 };

		this.init();
	}

	async init() {
		const buffer = await this.getCachedModel(this.modelUrl);
		this.model = await ort.InferenceSession.create(buffer);
		this.ready = true;
	}

	async uci(line) {
		const tokens = line.split(/\s+/);
		const cmd = tokens[0];

		switch (cmd) {
			case 'uci':
				this.listen('id name Maia 2');
				this.listen('id author CSSLab (+ A.C.A.S Developers)');
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
				if(option.name === 'UCI_Elo') {
					this.options.eloSelf = parseInt(option.value);
					this.options.eloOppo = parseInt(option.value);
				}
				if(option.name === 'MultiPV') this.options.multipv = parseInt(option.value);

				break;
	
			case 'position':
				const { fen, moves } = parsePosition(line);
				
				if(fen !== 'startpos') {
					this.board.load(fen);
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
				const calculatedFen = this.board.fen();
				const processedOutputs = await this.evaluate();

				policyToUciLines(calculatedFen, processedOutputs, this.options.multipv).forEach(line => this.listen(line));

				break;
		}
	}

	async getCachedModel(url) {
		const cache = await caches.open('maia-model');
		let res = await cache.match(url);
		if(res) return res.arrayBuffer();

		res = await fetch(url);
		if(!res.ok) throw new Error('Failed to fetch model');

		await cache.put(url, res.clone());
		return res.arrayBuffer();
	}

	async evaluate(forcedFen) {
		const fen = forcedFen || this.board.fen();
		const { boardInput, legalMoves, eloSelfCategory, eloOppoCategory } =
			preprocess(fen, this.options.eloSelf, this.options.eloOppo, this.ChessLib);

		const feeds = {
			boards: new ort.Tensor('float32', boardInput, [1,18,8,8]),
			elo_self: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloSelfCategory)])),
			elo_oppo: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloOppoCategory)]))
		};

		const { logits_maia, logits_value } = await this.model.run(feeds);

		return this.processOutputs(fen, logits_maia, logits_value, legalMoves);
	}

	processOutputs(fen, logits_maia, logits_value, legalMoves) {
		const logits = logits_maia.data;
		let winProb = Math.min(Math.max(logits_value.data[0]/2 + 0.5, 0), 1);
		const blackFlag = fen.split(' ')[1]==='b';
		if(blackFlag) winProb = 1 - winProb;

		const legalIdx = [...legalMoves.entries()]
			.filter(([i, v]) => v > 0)
			.map(([i]) => i);

		const moves = legalIdx.map(i =>
			blackFlag ? mirrorMove(allPossibleMovesReversed[i]) : allPossibleMovesReversed[i]
		);

		const legalLogits = legalIdx.map(i => logits[i]);
		const maxLogit = Math.max(...legalLogits);
		const expLogits = legalLogits.map(l => Math.exp(l - maxLogit));
		const sumExp = expLogits.reduce((a, b) => a + b, 0);

		const policy = {};
		moves.forEach((m, i) => policy[m] = expLogits[i] / sumExp);

		return { policy, value: Math.round(winProb * 10000) / 10000 };
	}
}