import { Tensor } from '../libraries/onnxruntime-web/ort.wasm.bundle.min.js';

import {
	mirrorMove,
	preprocessMaia3,
	allPossibleMovesMaia3Reversed
} from './tensor.js';
import { MaiaModelStorage } from './storage.js';

class Maia {
	constructor(options) {
		this.worker = null;
		this.options = options;
		this.storage = new MaiaModelStorage();
		this.pendingInferences = new Map();
		this.pendingDownload = null;
		this.downloadPromise = null;
		this.nextRequestId = 0;

		this.initialize(options.model, options.modelVersion);
	}

	initialize(modelUrl, modelVersion) {
		this.worker = new Worker('./maiaWorker.js', { type: 'module' });

		this.worker.onmessage = (e) => {
			const msg = e.data;

			switch(msg.type) {
				case 'status':
					this.options.setStatus(msg.status);
					if(msg.status === 'ready') {
						this.options.setProgress(100);
						if(this.pendingDownload) this.pendingDownload.resolve();
						this.pendingDownload = null;
						this.downloadPromise = null;
					}
					break;

				case 'progress':
					this.options.setProgress(msg.progress);
					break;

				case 'error': {
					if(msg.id !== undefined) {
						const pending = this.pendingInferences.get(msg.id);
						if(pending) {
							pending.reject(new Error(msg.message));
							this.pendingInferences.delete(msg.id);
						}
					}else{
						this.options.setError(msg.message);
						this.options.setStatus('error');
						if(this.pendingDownload) this.pendingDownload.reject(new Error(msg.message));
						this.pendingDownload = null;
						this.downloadPromise = null;
					}
					break;
				}

				case 'inference-result': {
					const pending = this.pendingInferences.get(msg.id);
					if(pending) {
						pending.resolve({
							logitsMove: new Float32Array(msg.logitsMove),
							logitsValue: new Float32Array(msg.logitsValue)
						});
						this.pendingInferences.delete(msg.id);
					}
					break;
				}
			}
		};

		this.worker.onerror = (err) => {
			console.error('Maia worker error:', err);
			const error = new Error(err.message || 'Worker crashed');
			this.options.setError(error.message);
			this.options.setStatus('error');
			if(this.pendingDownload) this.pendingDownload.reject(error);
			this.pendingDownload = null;
			this.downloadPromise = null;
		};

		this.worker.postMessage({ type: 'init', modelUrl, modelVersion });
	}

	async downloadModel() {
		if(!this.worker) throw new Error('Worker not initialized');
		if(this.downloadPromise) return this.downloadPromise;

		this.options.setProgress(0);

		this.downloadPromise = new Promise((resolve, reject) => {
			this.pendingDownload = { resolve, reject };
			this.worker.postMessage({ type: 'download' });
		});

		return this.downloadPromise;
	}

	async getStorageInfo() {
		return await this.storage.getStorageInfo();
	}

	async clearStorage() {
		return await this.storage.clearAllStorage();
	}

	runInference(tokens, eloSelfs, eloOppos, batchSize) {
		if(!this.worker) return Promise.reject(new Error('Worker not initialized'));

		const id = this.nextRequestId++;

		return new Promise((resolve, reject) => {
			this.pendingInferences.set(id, { resolve, reject });

			this.worker.postMessage(
				{
					type: 'inference',
					id,
					tokens: tokens.buffer,
					eloSelfs: eloSelfs.buffer,
					eloOppos: eloOppos.buffer,
					batchSize
				},
				[tokens.buffer, eloSelfs.buffer, eloOppos.buffer]
			);
		});
	}

	async evaluateMaia3(board, eloSelf, eloOppo) {
		let { boardTokens, legalMoves } = preprocessMaia3(board);

		const { logitsMove, logitsValue } = await this.runInference(
			boardTokens,
			Float32Array.from([eloSelf]),
			Float32Array.from([eloOppo]),
			1
		);

		const policyTensor = new Tensor('float32', logitsMove, [logitsMove.length]);
		const valueTensor = new Tensor('float32', logitsValue, [logitsValue.length]);

		return processOutputsMaia3(board, policyTensor, valueTensor, legalMoves);
	}

	async batchEvaluateMaia3(boards, eloSelfs, eloOppos) {
		const batchSize = boards.length;
		const boardInputs = [];
		const legalMovesArr = [];

		for(let i = 0; i < batchSize; i++) {
			const { boardTokens, legalMoves } = preprocessMaia3(boards[i]);
			boardInputs.push(boardTokens);
			legalMovesArr.push(legalMoves);
		}

		const combinedTokens = new Float32Array(batchSize * 64 * 12);
		for(let i = 0; i < batchSize; i++)
			combinedTokens.set(boardInputs[i], i * 64 * 12);

		const start = performance.now();

		const { logitsMove, logitsValue } = await this.runInference(
			combinedTokens,
			Float32Array.from(eloSelfs),
			Float32Array.from(eloOppos),
			batchSize
		);

		const end = performance.now();

		const results = [];
		const moveLogitsPerItem = 4352;
		const valueLogitsPerItem = 3;

		for(let i = 0; i < batchSize; i++) {
			const moveStart = i * moveLogitsPerItem;
			const policyLogits = logitsMove.slice(moveStart, moveStart + moveLogitsPerItem);

			const policyTensor = new Tensor('float32', policyLogits, [moveLogitsPerItem]);

			const valueStart = i * valueLogitsPerItem;
			const valueLogitsSlice = logitsValue.slice(valueStart, valueStart + valueLogitsPerItem);

			const valueTensor = new Tensor('float32', valueLogitsSlice, [valueLogitsPerItem]);

			const { policy, value } = processOutputsMaia3(
				boards[i],
				policyTensor,
				valueTensor,
				legalMovesArr[i]
			);

			results.push({ policy, value });
		}

		return { result: results, time: end - start };
	}
}

function processOutputsMaia3(fen, logits_move, logits_value, legalMoves) {
	const logits = logits_move.data;
	const wdl = logits_value.data;

	const maxWdl = Math.max(wdl[0], wdl[1], wdl[2]);
	const expL = Math.exp(wdl[0] - maxWdl);
	const expD = Math.exp(wdl[1] - maxWdl);
	const expW = Math.exp(wdl[2] - maxWdl);
	const sumExp = expL + expD + expW;

	let winProb = (expW + 0.5 * expD) / sumExp;

	let black_flag = false;
	if(fen.split(' ')[1] === 'b') {
		black_flag = true;
		winProb = 1 - winProb;
	}

	winProb = Math.round(winProb * 10000) / 10000;

	const legalMoveIndices = Array.from(legalMoves)
		.map((value, index) => (value > 0 ? index : -1))
		.filter(index => index !== -1);

	const legalMovesMirrored = [];
	for(const moveIndex of legalMoveIndices) {
		let move = allPossibleMovesMaia3Reversed[moveIndex];
		if(black_flag) move = mirrorMove(move);
		legalMovesMirrored.push(move);
	}

	const legalLogits = legalMoveIndices.map(idx => logits[idx]);
	const maxLogit = Math.max(...legalLogits);
	const expLogits = legalLogits.map(logit => Math.exp(logit - maxLogit));
	const sumExpMoves = expLogits.reduce((a, b) => a + b, 0);
	const probs = expLogits.map(expLogit => expLogit / sumExpMoves);

	const moveProbs = {};
	for(let i = 0; i < legalMoveIndices.length; i++)
		moveProbs[legalMovesMirrored[i]] = probs[i];

	const sortedMoveProbs = Object.keys(moveProbs)
		.sort((a, b) => moveProbs[b] - moveProbs[a])
		.reduce((acc, key) => {
			acc[key] = moveProbs[key];
			return acc;
		}, {});

	return { policy: sortedMoveProbs, value: winProb };
}

export default Maia;