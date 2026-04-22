const MODEL_STORAGE_KEY = 'maia-three-model';

function isCompatibleModelCache(modelData, modelUrl, modelVersion) {
	return modelData.version === modelVersion && modelData.url === modelUrl;
}

export class MaiaModelStorage {
	constructor() {
		this.dbName = 'MaiaModels';
		this.storeName = 'models';
		this.version = 1;
		this.db = null;
	}

	async openDB() {
		if(this.db) return this.db;

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onerror = () => reject(request.error);

			request.onsuccess = () => {
				this.db = request.result;
				resolve(request.result);
			};

			request.onupgradeneeded = (event) => {
				const db = event.target.result;
				if(!db.objectStoreNames.contains(this.storeName)) {
					const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
					store.createIndex('timestamp', 'timestamp', { unique: false });
				}
			};
		});
	}

	async storeModel(modelUrl, modelVersion, buffer) {
		try {
			const db = await this.openDB();
			const transaction = db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);

			const modelData = {
				id: MODEL_STORAGE_KEY,
				url: modelUrl,
				version: modelVersion,
				data: new Blob([buffer]),
				timestamp: Date.now(),
				size: buffer.byteLength
			};

			await new Promise((resolve, reject) => {
				const request = store.put(modelData);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});

			console.log('Maia model stored in IndexedDB');
		}catch(error) {
			console.error('Failed to store model in IndexedDB:', error);
			throw error;
		}
	}

	async getModel(modelUrl, modelVersion) {
		console.log('Storage: getModel called with URL:', modelUrl);

		try {
			const db = await this.openDB();
			const transaction = db.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);

			const modelData = await new Promise((resolve, reject) => {
				const request = store.get(MODEL_STORAGE_KEY);

				request.onsuccess = () => resolve(request.result || null);
				request.onerror = () => reject(request.error);
			});

			if(!modelData) {
				console.log('Storage: no cached model (expected on first run)');
				return null;
			}

			if(!isCompatibleModelCache(modelData, modelUrl, modelVersion)) {
				console.log('Storage: cached model incompatible, clearing');

				await this.deleteModel();
				return null;
			}

			const buffer = await modelData.data.arrayBuffer();

			console.log('Storage: model loaded, size:', buffer.byteLength);

			return buffer;
		}catch(error) {
			console.error('Storage: IndexedDB operation failed:', error);
			return null;
		}
	}

	async deleteModel() {
		try {
			const db = await this.openDB();
			const transaction = db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);

			await new Promise((resolve, reject) => {
				const request = store.delete(MODEL_STORAGE_KEY);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		}catch(error) {
			console.error('Failed to delete model from IndexedDB:', error);
		}
	}

	async getStorageInfo() {
		try {
			const supported = 'indexedDB' in window;
			if(!supported) return { supported: false };

			let quota;
			let usage;

			if('storage' in navigator && 'estimate' in navigator.storage) {
				const estimate = await navigator.storage.estimate();
				quota = estimate.quota;
				usage = estimate.usage;
			}

			const db = await this.openDB();
			const transaction = db.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);

			const modelData = await new Promise((resolve, reject) => {
				const request = store.get(MODEL_STORAGE_KEY);
				request.onsuccess = () => resolve(request.result || null);
				request.onerror = () => reject(request.error);
			});

			return {
				supported: true,
				quota,
				usage,
				modelSize: modelData ? modelData.size : undefined,
				modelTimestamp: modelData ? modelData.timestamp : undefined
			};
		}catch(error) {
			console.error('Failed to get storage info:', error);
			return { supported: false };
		}
	}

	async requestPersistentStorage() {
		try {
			if('storage' in navigator && 'persist' in navigator.storage) {
				const isPersistent = await navigator.storage.persist();

				console.log(
					isPersistent
						? 'Persistent storage granted'
						: 'Persistent storage denied'
				);

				return isPersistent;
			}
			return false;
		} catch(error) {
			console.error('Failed to request persistent storage:', error);
			return false;
		}
	}

	async clearAllStorage() {
		try {
			await this.deleteModel();
			console.log('Maia storage cleared');
		} catch(error) {
			console.warn('Failed to clear storage:', error);
		}
	}
}

export default MaiaModelStorage;