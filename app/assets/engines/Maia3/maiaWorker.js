/**
 * Maia3 Web Worker - runs ONNX inference off the main thread.
 *
 * Messages FROM main thread:
 *   { type: 'init', modelUrl, modelVersion }
 *   { type: 'download' }
 *   { type: 'inference', id, tokens, eloSelfs, eloOppos, batchSize }
 *
 * Messages TO main thread:
 *   { type: 'status', status }
 *   { type: 'progress', progress }
 *   { type: 'error', message, id? }
 *   { type: 'inference-result', id, logitsMove, logitsValue }
 */

import * as wasmOrt from '../libraries/onnxruntime-web/ort.wasm.bundle.min.js';
import { getPersonalModel } from './personal-models.js';
let ort = wasmOrt;
let provider = 'wasm';

const DB_NAME = 'MaiaModels';
const STORE_NAME = 'models';
const MODEL_KEY = 'maia-rapid-model';

function isCompatibleModelCache(data, expectedUrl, expectedVersion) {
	return data.url === expectedUrl && data.version === expectedVersion;
}

function openDB() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if(!db.objectStoreNames.contains(STORE_NAME))
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
		};
	});
}

async function getCachedModel(modelUrl, modelVersion) {
	const db = await openDB();
	try {
		const tx = db.transaction([STORE_NAME], 'readonly');
		const store = tx.objectStore(STORE_NAME);

		const data = await new Promise((resolve, reject) => {
			const req = store.get(MODEL_KEY);
			req.onsuccess = () => resolve(req.result || null);
			req.onerror = () => reject(req.error);
		});

		if(!data) return null;

		if(!isCompatibleModelCache(data, modelUrl, modelVersion)) {
			const rwTx = db.transaction([STORE_NAME], 'readwrite');
			rwTx.objectStore(STORE_NAME).delete(MODEL_KEY);
			return null;
		}

		return await data.data.arrayBuffer();
	} finally {
		db.close();
	}
}

async function storeModel(modelUrl, modelVersion, buffer) {
	const db = await openDB();
	try {
		const tx = db.transaction([STORE_NAME], 'readwrite');
		const store = tx.objectStore(STORE_NAME);

		await new Promise((resolve, reject) => {
			store.put({
				id: MODEL_KEY,
				url: modelUrl,
				version: modelVersion,
				data: new Blob([buffer]),
				timestamp: Date.now(),
				size: buffer.byteLength
			});
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(tx.error || new Error('Maia model cache transaction aborted'));
			tx.onerror = () => reject(tx.error || new Error('Could not cache Maia model'));
		});
	} finally {
		db.close();
	}
}

let session = null;
let modelUrl = null;
let modelVersion = null;
let tokenChannels;

async function initSession(buffer) {
	ort.env.wasm.numThreads = 1;
	session = await ort.InferenceSession.create(buffer, {
		executionProviders: [provider]
	});
	const input = session.inputMetadata.find(item => item.name === 'tokens');
	tokenChannels = input?.shape?.[2];
	if(!input?.isTensor || input.type !== 'float32' || input.shape.length !== 3 || input.shape[1] !== 64
		|| ![12, 96].includes(tokenChannels) || !session.inputNames.includes('elo_self') || !session.inputNames.includes('elo_oppo')
		|| !session.outputNames.includes('logits_move') || !session.outputNames.includes('logits_value'))
		throw new Error('The ONNX file needs supported Maia 3 board inputs, Elo inputs and policy and value outputs.');
}

self.onmessage = async (e) => {
	const msg = e.data;

	try {
		switch(msg.type) {
			case 'init': {
				modelUrl = msg.modelUrl;
				modelVersion = msg.modelVersion;
				postMessage({ type: 'status', status: 'loading' });
				if(msg.modelId) {
					if(!['wasm', 'webgpu'].includes(msg.provider || 'wasm')) throw new Error('Invalid Maia 3 inference provider.');
					provider = msg.provider || 'wasm';
					ort = await import('../lc0/dist/ort.webgpu.bundle.min.mjs');
					ort.env.wasm.wasmPaths = new URL('../lc0/dist/', import.meta.url).href;
					const model = await getPersonalModel(msg.modelId);
					await initSession(await model.file.arrayBuffer());
					if(!session.inputNames.includes('tokens') || !session.outputNames.includes('logits_move')
						|| !session.outputNames.includes('logits_value')) throw new Error('The uploaded ONNX file is not a compatible Maia 3 network.');
					postMessage({ type: 'status', status: 'ready', tokenChannels });
					break;
				}

				const buffer = await getCachedModel(modelUrl, modelVersion);

				if(buffer) {
					await initSession(buffer);
					postMessage({ type: 'status', status: 'ready', tokenChannels });
				}else{
					postMessage({ type: 'status', status: 'no-cache' });
				}
				break;
			}

			case 'download': {
				postMessage({ type: 'status', status: 'downloading' });
				postMessage({ type: 'progress', progress: 0 });

				const response = await fetch(modelUrl);
				if(!response.ok) throw new Error('Failed to fetch model');

				let buffer;

				if(response.body && typeof response.body.getReader === 'function') {
					const reader = response.body.getReader();
					const contentLength = +(response.headers.get('Content-Length') || 0);
					const chunks = [];
					let receivedLength = 0;
					let lastReportedProgress = 0;

					while(true) {
						const { done, value } = await reader.read();
						if(done) break;

						chunks.push(value);
						receivedLength += value.length;

						if(contentLength > 0) {
							const currentProgress = Math.floor((receivedLength / contentLength) * 100);
							if(currentProgress >= lastReportedProgress + 10) {
								postMessage({ type: 'progress', progress: currentProgress });
								lastReportedProgress = currentProgress;
							}
						}
					}

					buffer = new Uint8Array(receivedLength);
					let position = 0;

					for(const chunk of chunks) {
						buffer.set(chunk, position);
						position += chunk.length;
					}
					chunks.length = 0;
				}else{
					buffer = new Uint8Array(await response.arrayBuffer());
				}

				await storeModel(modelUrl, modelVersion, buffer.buffer);
				await initSession(buffer.buffer);

				postMessage({ type: 'progress', progress: 100 });
				postMessage({ type: 'status', status: 'ready', tokenChannels });
				break;
			}

			case 'inference': {
				if(!session) {
					postMessage({
						type: 'error',
						message: 'Model not initialized',
						id: msg.id
					});
					return;
				}

				const { id, tokens, eloSelfs, eloOppos, batchSize } = msg;
				if(!Number.isInteger(batchSize) || batchSize < 1 || tokens.byteLength !== batchSize * 64 * tokenChannels * 4
					|| eloSelfs.byteLength !== batchSize * 4 || eloOppos.byteLength !== batchSize * 4)
					throw new Error('Maia 3 inference inputs do not match the loaded model.');

				const feeds = {
					tokens: new ort.Tensor('float32', new Float32Array(tokens), [batchSize, 64, tokenChannels]),
					elo_self: new ort.Tensor('float32', new Float32Array(eloSelfs), [batchSize]),
					elo_oppo: new ort.Tensor('float32', new Float32Array(eloOppos), [batchSize])
				};

				let result;
				try {
					result = await session.run(feeds);

					const logitsMove = new Float32Array(result.logits_move.data);
					const logitsValue = new Float32Array(result.logits_value.data);

					postMessage(
						{
							type: 'inference-result',
							id,
							logitsMove: logitsMove.buffer,
							logitsValue: logitsValue.buffer
						},
						[logitsMove.buffer, logitsValue.buffer]
					);
				} finally {
					Object.values(feeds).forEach(tensor => tensor.dispose());
					if(result) Object.values(result).forEach(tensor => tensor.dispose());
				}
				break;
			}
		}
	} catch(err) {
		postMessage({
			type: 'error',
			message: err.message || 'Unknown worker error',
			id: msg.id
		});
	}
};