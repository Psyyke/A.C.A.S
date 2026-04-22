import Maia from './maia.js';
import { parseGo } from './utils.js';

class MaiaEngine {
  constructor(options = {}) {
		this.ready = false;
		this.options = {
			eloSelf: 1500,
			eloOppo: 1500,
			multipv: 1
		};

		this.currentFen = 'startpos';
		this.listen = options.onMessage || ((msg) => console.log(msg));

		this.maia = new Maia({
			model: options.model || './model/maia3_simplified.onnx',
			modelVersion: options.modelVersion || '3',

			setStatus: (status) => {
				this.status = status;
				if(status === 'ready') {
					this.ready = true;
				}
				if(options.onStatus) options.onStatus(status);
			},

			setProgress: (progress) => {
				this.progress = progress;
				if(options.onProgress) options.onProgress(progress);
			},

			setError: (error) => {
				this.error = error;
				if(options.onError) options.onError(error);
			}
		});
	}

	async uci(line) {
		const tokens = line.trim().split(/\s+/);
		const cmd = tokens[0];

		switch(cmd) {
			case 'uci':
				this.listen('id name Maia 3');
				this.listen('id author CSSLab (+ A.C.A.S Developers)');
				this.listen('uciok');
				break;

			case 'isready':
				if(!this.ready) await this.init();
				this.listen('readyok');
				break;

			case 'ucinewgame':
				this.currentFen = 'startpos';
				break;

			case 'setoption':
				if(line.includes('UCI_Elo')) {
					const val = parseInt(line.split('value')[1]);
					if(!isNaN(val)) this.options.eloSelf = val;
				}

                if(line.includes('Enemy_Elo')) {
					const val = parseInt(line.split('value')[1]);
					if(!isNaN(val)) this.options.eloOppo = val;
				}

				if(line.includes('MultiPV')) {
					const val = parseInt(line.split('value')[1]);
					if(!isNaN(val)) this.options.multipv = val;
				}
                
				break;

			case 'position':
				if(line.includes('startpos')) {
					this.currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
				} else if(line.includes('fen')) {
					const parts = line.split('fen ');
					this.currentFen = parts[1].split(' moves')[0];
				}
				break;

			case 'go': {
				if(!this.ready) await this.init();

				const { nodes, history, searchMoves } = parseGo(line);

				const fen = this.currentFen === 'startpos'
					? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
					: this.currentFen;

                const isPlayerBlack = fen.split(' ')[1] === 'b';
				const result = await this.evaluate(fen, this.options.eloSelf, this.options.eloOppo);

				let moves = Object.keys(result.policy);

				if(searchMoves) {
					const set = new Set(searchMoves);
					moves = moves.filter(m => set.has(m));
				}

				if(moves.length === 0) return;

				for(let i = 0; i < Math.min(this.options.multipv, moves.length); i++) {
					const move = moves[i];
					const moveProb = (result.policy[move] * 100).toFixed(2);
                    const winProb = Math.max(0.0001, Math.min(0.9999, result.value));
                    const cp = Math.round(400 * Math.log10(1 / winProb - 1)) * (isPlayerBlack ? 1 : -1);
                    
					this.listen(
						`info depth 1 seldepth 1 multipv ${i + 1} score cp ${cp} pv ${move} prob ${moveProb}`
					);
				}

				this.listen(`bestmove ${moves[0]}`);
				break;
			}

			case 'd':
				this.listen(`Current FEN: ${this.currentFen}`);
				break;
		}
	}

	async init() {
		if(!this.ready) {
			await this.download();
		}
	}

	async download() {
		return this.maia.downloadModel();
	}

	async evaluate(fen, eloSelf = 1500, eloOpp = 1500) {
		if(!this.ready) {
			await this.download();
		}
		return await this.maia.evaluateMaia3(fen, eloSelf, eloOpp);
	}

	async bestMove(fen, eloSelf = 1500, eloOpp = 1500) {
		const result = await this.evaluate(fen, eloSelf, eloOpp);
		return Object.keys(result.policy)[0];
	}

	async evaluateBatch(fens, eloSelfs, eloOpps) {
		if(!this.ready) {
			await this.download();
		}
		return await this.maia.batchEvaluateMaia3(fens, eloSelfs, eloOpps);
	}

	getStatus() {
		return {
			ready: this.ready,
			status: this.status,
			progress: this.progress,
			error: this.error
		};
	}

	async getStorageInfo() {
		return await this.maia.getStorageInfo();
	}

	async clearStorage() {
		return await this.maia.clearStorage();
	}
}

export default MaiaEngine;