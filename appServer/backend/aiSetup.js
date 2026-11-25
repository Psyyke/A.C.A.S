import { EventEmitter, once } from 'node:events';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Everything Pena downloads is pinned by size and SHA-256, so a changed upstream
// file can never be run. Official llama.cpp builds run Atomic's inkling2_loop
// layout from b12633 on.
const RUNTIME_TAG = 'b12633';
const RUNTIME_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${RUNTIME_TAG}/`;
const asset = (name, bytes, sha256) => Object.freeze({ name, bytes, sha256, url: RUNTIME_BASE + name });

export const PENA_LORA = Object.freeze({
    name: 'pena-lora.gguf', bytes: 39387680,
    sha256: '7601536b68f9e7c10999daa0306a0430ce5d1fe4943ec570a7ee1918a9e992a4',
    url: 'https://huggingface.co/Hakorr/Pena/resolve/499376296cc03cb4c964bf1a148371f1150ae3f2/pena-lora.gguf'
});
// The adapter includes the refusal-removal edit, so it needs the matching plain base.
const LORA_BASE_MODEL = Object.freeze({
    name: 'Inkling-2-Mini-AD-IQ2_M.gguf', bytes: 8665091680,
    sha256: '7321d77bd62fb1b4ee620ec12e677a4b4b99668d083c1e6e350fd1c3376e29bf',
    url: 'https://huggingface.co/AtomicChat/Inkling-2-Mini-GGUF/resolve/4f0c56af7e0c242e620be6394983d245b8c3fd27/Inkling-2-Mini-AD-IQ2_M.gguf'
});

export const PENA_RELEASE = Object.freeze({
    runtimeTag: RUNTIME_TAG,
    builds: Object.freeze({
        'win32-x64-cuda13': { backend: 'cuda', files: [
            asset('llama-b12633-bin-win-cuda-13.5-x64.zip', 225649717, '5fadbb7d1f4b7e612f77c7b626c60445d5d1fc9d990425ee7f37d5f17a8c68ad'),
            asset('cudart-llama-bin-win-cuda-13.5-x64.zip', 426314199, 'c2bf4cc202bfbaaa7a0b75f5082457c3811326947bb216059b72839d844e9cba')] },
        'win32-x64-cuda12': { backend: 'cuda', files: [
            asset('llama-b12633-bin-win-cuda-12.4-x64.zip', 357973767, '8c872e7fe215dcee32465051031454699b24967bebe0c2b746c50809472be0f0'),
            asset('cudart-llama-bin-win-cuda-12.4-x64.zip', 391443627, '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6')] },
        'win32-x64-vulkan': { backend: 'vulkan', files: [
            asset('llama-b12633-bin-win-vulkan-x64.zip', 38877434, '720d59998a51423a1c50c99326a5d5358b80e89d75f8fdafc50a26479d1bad68')] },
        'win32-x64-cpu': { backend: 'cpu', files: [
            asset('llama-b12633-bin-win-cpu-x64.zip', 25038006, 'bad9fe0c1b554bcb1ce5630d66ad34a2285a8b390400513cc02f56feafd62c8e')] },
        'win32-arm64-vulkan': { backend: 'vulkan', files: [
            asset('llama-b12633-bin-win-vulkan-arm64.zip', 26557484, 'b5eea8c54353f4915f5901cf69e93f7b26db9ed38bf1a5cba24f37bd3e60875e')] },
        'win32-arm64-cpu': { backend: 'cpu', files: [
            asset('llama-b12633-bin-win-cpu-arm64.zip', 13149546, 'c37f444b153e43a9b27c5d00b78c4c300bdb2878de76ab49112f4558a245e784')] },
        'linux-x64-vulkan': { backend: 'vulkan', files: [
            asset('llama-b12633-bin-ubuntu-vulkan-x64.tar.gz', 36909894, '33223bb1f421eb4120210fc61648acf1f7ba8deece1183c63af417c80a9ff013')] },
        'linux-x64-cpu': { backend: 'cpu', files: [
            asset('llama-b12633-bin-ubuntu-x64.tar.gz', 23225608, '9c4a2c1bd1437f22831e0b56cc75329b321bac87225ffb5c83cd8d13b1f44fa2')] },
        'linux-arm64-vulkan': { backend: 'vulkan', files: [
            asset('llama-b12633-bin-ubuntu-vulkan-arm64.tar.gz', 29867556, '8968356ab4620d6fdd08c45e0a6401c2f9c862aa833d1024f87fd9c39ba5c3e6')] },
        'linux-arm64-cpu': { backend: 'cpu', files: [
            asset('llama-b12633-bin-ubuntu-arm64.tar.gz', 18750274, 'b54c26bb79eac84283c8b6f45722603a080bf1bab9ce120c932ce3945063e0a4')] },
        'darwin-arm64-metal': { backend: 'metal', files: [
            asset('llama-b12633-bin-macos-arm64.tar.gz', 16600069, '99657876053df9004753d92075813bbb3b484e79f8a402809b51d00c8c540062')] },
        'darwin-x64-cpu': { backend: 'cpu', files: [
            asset('llama-b12633-bin-macos-x64.tar.gz', 12382012, '42e69b4d89531197ec0551f288347a71856c4613e52030196486b888c82b8892')] }
    }),
    model: LORA_BASE_MODEL,
    lora: PENA_LORA
});

export function chooseRuntime({ platform, arch, nvidiaDriver = 0, preference = 'auto' }) {
    const key = backend => `${platform}-${arch}-${backend}`;
    const builds = PENA_RELEASE.builds;
    const want = preference === 'auto' ? null : preference;
    if(want) {
        if(want === 'cuda') {
            if(platform !== 'win32' || arch !== 'x64') throw new Error('Pena only downloads CUDA builds for Windows x64. Pick Vulkan, or choose your own runtime in Advanced.');
            if(nvidiaDriver >= 580) return 'win32-x64-cuda13';
            if(nvidiaDriver >= 551) return 'win32-x64-cuda12';
            throw new Error('No recent NVIDIA driver was found. Update it, or pick Vulkan in Advanced.');
        }
        if(builds[key(want)]) return key(want);
        throw new Error(`There's no ${want} build for ${platform} ${arch}. Pick another backend in Advanced.`);
    }
    if(platform === 'darwin') return arch === 'arm64' ? 'darwin-arm64-metal' : 'darwin-x64-cpu';
    if(platform === 'win32' && arch === 'x64') {
        if(nvidiaDriver >= 580) return 'win32-x64-cuda13';
        if(nvidiaDriver >= 551) return 'win32-x64-cuda12';
    }
    if(builds[key('vulkan')]) return key('vulkan');
    throw new Error(`Pena can't download a runtime for ${platform} ${arch}. Choose your own in Advanced.`);
}

function nvidiaDriverVersion() {
    return new Promise(resolve => {
        execFile('nvidia-smi', ['--query-gpu=driver_version', '--format=csv,noheader'],
            { timeout: 8000, windowsHide: true }, (error, stdout) => {
                const version = error ? 0 : parseFloat(String(stdout).split(/\r?\n/)[0]);
                resolve(Number.isFinite(version) ? version : 0);
            });
    });
}

function runTar(archive, directory) {
    // Windows ships bsdtar, which also reads zip. A Git-for-Windows GNU tar on PATH would not.
    const tar = process.platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    return new Promise((resolve, reject) => {
        execFile(tar, ['-xf', archive, '-C', directory], { windowsHide: true, maxBuffer: 1 << 20 }, error =>
            error ? reject(new Error(`Could not unpack ${path.basename(archive)}. ${error.message}`)) : resolve());
    });
}

async function findFile(directory, name) {
    for(const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
        if(entry.isFile() && entry.name === name) return path.join(entry.parentPath ?? entry.path, entry.name);
    }
    return null;
}

const gb = bytes => `${(bytes / 1e9).toFixed(1)} GB`;

function friendlyDownloadError(error, label) {
    if(error?.name === 'AbortError') return error;
    const message = String(error?.cause?.code || error?.code || error?.message || error);
    if(/ENOSPC/.test(message)) return new Error(`Ran out of disk space while downloading ${label}.`);
    if(/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|terminated|UND_ERR/i.test(message))
        return new Error(`Lost the connection while downloading ${label}. Press the button again to resume.`);
    return error instanceof Error ? error : new Error(message);
}

export class PenaSetup extends EventEmitter {
    constructor({ host, notify = () => {}, fetchFile = fetch, extract = runTar,
        detectNvidia = nvidiaDriverVersion, platform = process.platform, arch = process.arch,
        freeSpace = async directory => { const s = await statfs(directory); return s.bavail * s.bsize; },
        release = PENA_RELEASE, progressInterval = 250 } = {}) {
        super();
        this.host = host;
        this.dependencies = { notify, fetchFile, extract, detectNvidia, platform, arch, freeSpace, progressInterval };
        this.release = release;
        this.root = null;
        this.getSettings = () => ({});
        this.setAutoStart = () => {};
        this.manifest = {};
        this.progress = { busy: false, phase: 'idle', item: null, received: 0, total: 0, error: null };
        this.lastHostError = null;
        host.on('status', status => {
            if(status.error && status.error !== this.lastHostError) notify('error', `Pena: ${status.error}`, 12000);
            this.lastHostError = status.error;
            this.emit('status', this.fullStatus());
        });
    }

    async configure({ root, getSettings, setAutoStart }) {
        this.root = root;
        if(getSettings) this.getSettings = getSettings;
        if(setAutoStart) this.setAutoStart = setAutoStart;
        await mkdir(root, { recursive: true });
        try { this.manifest = JSON.parse(await readFile(this.file('installed.json'), 'utf8')) || {}; }
        catch { this.manifest = {}; }
        this.emitStatus(true);
    }

    file(...parts) { return path.join(this.root, ...parts); }

    customMode(settings = this.getSettings()) { return Boolean(settings.executablePath && settings.modelPath); }

    // Only paths this class recorded after a verified install count as installed.
    installed() {
        const { runtime, model, lora } = this.manifest;
        const wantLora = this.release.lora;
        return Boolean(runtime?.tag === this.release.runtimeTag && runtime.executable
            && model?.sha256 === this.release.model.sha256
            && (!wantLora || lora?.sha256 === wantLora.sha256));
    }

    status() {
        const settings = this.getSettings();
        const custom = this.customMode(settings);
        const { busy, phase, item, received, total, error } = this.progress;
        return {
            mode: custom ? 'custom' : 'managed',
            installed: custom || this.installed(),
            busy, phase, item, received, total, error,
            progress: total ? Math.min(1, received / total) : 0,
            downloadBytes: this.release.model.bytes + (this.release.lora?.bytes || 0),
            loraAvailable: Boolean(this.release.lora),
            runtime: this.manifest.runtime?.key || null
        };
    }

    fullStatus() { return { ...this.host.status(), setup: this.status() }; }

    emitStatus(force = false) {
        const now = Date.now();
        if(!force && now - (this.lastEmit || 0) < this.dependencies.progressInterval) return;
        this.lastEmit = now;
        this.emit('status', this.fullStatus());
    }

    setProgress(update, force = true) {
        Object.assign(this.progress, update);
        this.emitStatus(force);
    }

    async saveManifest() {
        const temporary = this.file('installed.json.tmp');
        await writeFile(temporary, JSON.stringify(this.manifest, null, 2));
        await rename(temporary, this.file('installed.json'));
    }

    // The one entry point behind every "make Pena ready" button. Downloads only
    // what is missing, then starts the server. allowDownload: false never fetches.
    run({ allowDownload = true } = {}) {
        if(this.task) return this.task;
        if(!this.root) return Promise.resolve(this.fullStatus());
        const controller = this.controller = new AbortController();
        const task = (async () => {
            const settings = this.getSettings();
            try {
                let launch = settings;
                if(!this.customMode(settings)) {
                    if(!this.installed() && !allowDownload) return this.fullStatus();
                    launch = { ...settings, ...await this.install(settings, controller.signal) };
                }
                this.setProgress({ busy: true, phase: 'starting', item: null, error: null });
                const status = await this.host.start(launch);
                if(status.state === 'ready') {
                    this.setAutoStart(true);
                    this.dependencies.notify('message', `Pena is ready (${status.model}).`, 4000);
                }
            } catch(error) {
                if(error?.name === 'AbortError' || controller.signal.aborted) {
                    this.setProgress({ error: null });
                } else {
                    this.setProgress({ error: error.message });
                    this.dependencies.notify('error', `Pena setup: ${error.message}`, 15000);
                }
            } finally {
                this.setProgress({ busy: false, phase: 'idle', item: null, received: 0, total: 0 });
            }
            return this.fullStatus();
        })();
        this.task = task;
        // Cleared afterwards because the body can finish before the assignment above.
        task.finally(() => {
            if(this.task !== task) return;
            this.task = this.controller = null;
        });
        return task;
    }

    cancel({ quiet = false } = {}) {
        if(!this.controller) return false;
        this.controller.abort();
        if(!quiet) this.dependencies.notify('message', 'Pena download paused. Press the button again to resume.', 5000);
        return true;
    }

    async stop() {
        this.cancel({ quiet: true });
        this.setAutoStart(false);
        await this.task?.catch(() => {});
        return this.host.stop();
    }

    async install(settings, signal) {
        const { release } = this;
        this.setProgress({ busy: true, phase: 'checking', item: null, error: null, received: 0, total: 0 });
        const nvidiaDriver = settings.backend === 'auto' || settings.backend === 'cuda'
            ? await this.dependencies.detectNvidia() : 0;
        const key = chooseRuntime({ platform: this.dependencies.platform, arch: this.dependencies.arch,
            nvidiaDriver, preference: settings.backend || 'auto' });
        const build = release.builds[key];
        const runtimeReady = this.manifest.runtime?.key === key && this.manifest.runtime.tag === release.runtimeTag
            && await stat(this.manifest.runtime.executable).then(s => s.isFile(), () => false);
        const modelPath = this.file('models', release.model.name);
        const modelReady = this.manifest.model?.sha256 === release.model.sha256
            && await stat(modelPath).then(s => s.size === release.model.bytes, () => false);
        const loraPath = release.lora ? this.file('models', release.lora.name) : '';
        const loraReady = !release.lora || this.manifest.lora?.sha256 === release.lora.sha256
            && await stat(loraPath).then(s => s.size === release.lora.bytes, () => false);

        const downloads = [
            ...(runtimeReady ? [] : build.files.map(file => ({ file, item: 'runtime' }))),
            ...(modelReady ? [] : [{ file: release.model, item: 'model' }]),
            ...(loraReady ? [] : [{ file: release.lora, item: 'lora' }])
        ];
        await mkdir(this.file('downloads'), { recursive: true });
        await mkdir(this.file('models'), { recursive: true });
        if(downloads.length) {
            const total = downloads.reduce((sum, { file }) => sum + file.bytes, 0);
            const unpack = runtimeReady ? 0 : build.files.reduce((sum, file) => sum + file.bytes, 0) * 2.5;
            let have = 0;
            for(const { file } of downloads)
                have += await stat(this.downloadPath(file)).then(s => s.size, () => 0);
            const free = await this.dependencies.freeSpace(this.root).catch(() => Infinity);
            const need = total - have + unpack + 512e6;
            if(free < need) throw new Error(`Pena needs about ${gb(need)} of free disk space and only ${gb(free)} is free.`);
            this.setProgress({ phase: 'downloading', received: 0, total });
            let done = 0;
            for(const { file, item } of downloads) {
                this.setProgress({ item });
                await this.download(file, signal, bytes => {
                    done += bytes;
                    this.setProgress({ received: done }, false);
                });
            }
        }

        if(!runtimeReady) {
            this.setProgress({ phase: 'unpacking', item: 'runtime' });
            const directory = this.file('runtime', `${release.runtimeTag}-${key}`);
            const temporary = `${directory}.tmp`;
            await rm(temporary, { recursive: true, force: true });
            await mkdir(temporary, { recursive: true });
            for(const file of build.files) await this.dependencies.extract(this.downloadPath(file), temporary);
            const name = this.dependencies.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
            const found = await findFile(temporary, name);
            if(!found) throw new Error('The downloaded runtime has no llama-server.');
            await rm(directory, { recursive: true, force: true });
            await rename(temporary, directory);
            const executable = path.join(directory, path.relative(temporary, found));
            if(this.dependencies.platform !== 'win32') await chmod(executable, 0o755);
            this.manifest.runtime = { key, tag: release.runtimeTag, backend: build.backend, executable };
            await this.saveManifest();
            for(const file of build.files) await rm(this.downloadPath(file), { force: true });
            for(const entry of await readdir(this.file('runtime')).catch(() => []))
                if(entry !== path.basename(directory))
                    await rm(this.file('runtime', entry), { recursive: true, force: true }).catch(() => {});
        }
        for(const [item, file, ready, target] of [['model', release.model, modelReady, modelPath],
            ['lora', release.lora, loraReady, loraPath]]) {
            if(!file || ready) continue;
            await rename(this.downloadPath(file), target);
            this.manifest[item] = { name: file.name, sha256: file.sha256 };
            await this.saveManifest();
        }
        if(!release.lora && this.manifest.lora) { delete this.manifest.lora; await this.saveManifest(); }
        const keep = new Set([release.model.name, release.lora?.name].filter(Boolean));
        for(const entry of await readdir(this.file('models')).catch(() => []))
            if(!keep.has(entry)) await rm(this.file('models', entry), { force: true }).catch(() => {});

        return { executablePath: this.manifest.runtime.executable, modelPath,
            loraPath: release.lora ? loraPath : '', backend: build.backend };
    }

    downloadPath(file) { return this.file('downloads', `${file.name}.part`); }

    // Resumable: an interrupted .part is re-hashed and continued with a Range request.
    async download(file, signal, onBytes) {
        const part = this.downloadPath(file);
        const label = file.name;
        let hash = createHash('sha256');
        let offset = await stat(part).then(s => s.size, () => 0);
        if(offset > file.bytes) { await rm(part, { force: true }); offset = 0; }
        if(offset) {
            this.setProgress({ phase: 'verifying' });
            for await (const chunk of createReadStream(part, { signal })) hash.update(chunk);
            onBytes(offset);
            this.setProgress({ phase: 'downloading' });
        }
        try {
            if(offset < file.bytes) {
                const response = await this.dependencies.fetchFile(file.url, {
                    headers: offset ? { Range: `bytes=${offset}-` } : {}, redirect: 'follow', signal });
                if(!response.ok)
                    throw new Error(`The download server answered ${response.status} for ${label}.`);
                if(offset && response.status !== 206) {
                    // The server ignored the range, so start the file over.
                    onBytes(-offset);
                    offset = 0;
                    hash = createHash('sha256');
                }
                await this.writeBody(response, part, offset ? 'a' : 'w', hash, file, offset, onBytes);
            }
        } catch(error) { throw friendlyDownloadError(error, label); }
        return this.finishDownload(file, part, hash.digest('hex'));
    }

    async writeBody(response, part, flags, hash, file, offset, onBytes) {
        if(!response.body) throw new Error(`No data arrived for ${file.name}.`);
        const output = createWriteStream(part, { flags });
        const closed = once(output, 'close');
        try {
            for await (const chunk of response.body) {
                offset += chunk.length;
                if(offset > file.bytes) throw new Error(`${file.name} is larger than expected.`);
                hash.update(chunk);
                if(!output.write(chunk)) await once(output, 'drain');
                onBytes(chunk.length);
            }
        } finally {
            output.end();
            await closed;
        }
    }

    async finishDownload(file, part, digest) {
        if(digest !== file.sha256) {
            await rm(part, { force: true });
            throw new Error(`${file.name} failed its checksum and was deleted. Press the button again to retry.`);
        }
    }
}
