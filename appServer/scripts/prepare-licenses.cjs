const { readFile, readdir, mkdir, writeFile, copyFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const approvedLicenses = new Set(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '(MIT OR CC0-1.0)']);
const noticeName = /^(licen[sc]e|copying|notice)([._-]|$)/i;

async function findFile(directory, name) {
    const entries = await readdir(directory, { withFileTypes: true });
    if(entries.some(entry => entry.isFile() && entry.name === name)) return path.join(directory, name);
    for(const entry of entries) {
        if(entry.isDirectory()) {
            const found = await findFile(path.join(directory, entry.name), name);
            if(found) return found;
        }
    }
    return null;
}

async function prepareLicenses(appDir = path.resolve(__dirname, '..')) {
    const lock = JSON.parse(await readFile(path.join(appDir, 'package-lock.json'), 'utf8'));
    const sections = [];
    const libraries = [];
    const licenseTexts = {};
    async function append(title, file) {
        sections.push(`${title}\n${'='.repeat(title.length)}\n\n${await readFile(file, 'utf8')}`);
    }
    await append('Third-party components and download terms', path.join(appDir, 'licenses', 'README.txt'));
    await append('Font copyright notices and SIL OFL 1.1', path.join(appDir, 'ui', 'fonts', 'OFL.txt'));
    for(const name of (await readdir(path.join(appDir, 'licenses'))).sort()) {
        if(name.endsWith('-LICENSE.txt')) {
            const file = path.join(appDir, 'licenses', name);
            await append(name, file);
            licenseTexts[name] = await readFile(file, 'utf8');
        }
    }
    for(const name of ['Bootstrap-Icons-LICENSE.txt', 'Inkling-LICENSE.txt', 'llama.cpp-LICENSE.txt',
        'llama-b12633-win-cpu-dependencies-LICENSE.txt']) {
        if(!licenseTexts[name]) throw new Error(`Missing component licence: ${name}`);
    }
    for(const [location, dependency] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
        if(!location || dependency.dev) continue;
        if(!approvedLicenses.has(dependency.license))
            throw new Error(`Review the licence of ${location}: ${dependency.license}`);
        const directory = path.join(appDir, location);
        const installed = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
        if(installed.version !== dependency.version || installed.license !== dependency.license)
            throw new Error(`Installed metadata differs from package-lock.json: ${location}. Run npm ci.`);
        const notices = (await readdir(directory, { withFileTypes: true }))
            .filter(entry => entry.isFile() && noticeName.test(entry.name)).map(entry => entry.name).sort();
        if(!notices.some(name => /^(licen[sc]e|copying)([._-]|$)/i.test(name)))
            throw new Error(`No licence text found for ${location}`);
        const texts = [];
        for(const notice of notices) {
            await append(`${installed.name} ${installed.version} (${location}/${notice})`, path.join(directory, notice));
            texts.push(await readFile(path.join(directory, notice), 'utf8'));
        }
        const licenseText = texts.join('\n\n');
        if(!libraries.some(entry => entry.name === installed.name && entry.version === installed.version
            && entry.licenseText === licenseText)) {
            libraries.push({ name: installed.name, version: installed.version, license: installed.license,
                description: installed.description || '', source: `https://www.npmjs.com/package/${installed.name}`,
                licenseText });
        }
    }
    const electronDist = path.join(appDir, 'node_modules', 'electron', 'dist');
    const electronLicense = await findFile(electronDist, 'LICENSE');
    const chromiumLicense = await findFile(electronDist, 'LICENSES.chromium.html');
    if(!electronLicense || !chromiumLicense) throw new Error('Electron distribution licence files are missing.');
    await append('Electron', electronLicense);
    sections.push('Electron dependency notices are provided in the accompanying LICENSES.chromium.html.\n');
    const pkg = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8'));
    const gpl = await readFile(path.join(appDir, 'LICENSE'), 'utf8');
    const electron = JSON.parse(await readFile(path.join(appDir, 'node_modules', 'electron', 'package.json'), 'utf8'));
    libraries.unshift(
        { name: 'A.C.A.S', version: pkg.version, license: 'GPL-3.0', description: pkg.description,
            source: 'https://github.com/Psyyke/A.C.A.S', licenseText: gpl },
        { name: 'UniversalBoardDrawer', license: 'GPL-3.0', description: 'Chessboard arrows by Haka.',
            source: 'https://github.com/Hakorr/UniversalBoardDrawer', licenseText: gpl },
        { name: 'Electron', version: electron.version, license: 'MIT', description: 'Desktop application framework.',
            source: 'https://github.com/electron/electron', licenseText: await readFile(electronLicense, 'utf8'),
            chromiumNotices: true }
    );
    const ofl = await readFile(path.join(appDir, 'ui', 'fonts', 'OFL.txt'), 'utf8');
    const fonts = [
        ['Mona Sans', 'https://github.com/github/mona-sans'],
        ['IBM Plex Sans', 'https://github.com/IBM/plex'],
        ['Rubik', 'https://github.com/googlefonts/rubik'],
        ['Whisper', 'https://github.com/googlefonts/whisper']
    ].map(([name, source]) => ({ name, source, license: 'OFL-1.1', licenseText: ofl }));
    fonts.push({ name: 'Bootstrap Icons', version: '1.10.5', license: 'MIT',
        source: 'https://github.com/twbs/icons', licenseText: licenseTexts['Bootstrap-Icons-LICENSE.txt'] });
    const { PENA_RELEASE } = await import(pathToFileURL(path.join(appDir, 'backend', 'aiSetup.js')).href);
    const cudaVersions = [...new Set(Object.values(PENA_RELEASE.builds)
        .flatMap(build => build.files.map(file => /cuda-(\d+\.\d+)/.exec(file.name)?.[1]).filter(Boolean)))];
    const ai = [
        { name: 'llama.cpp', version: PENA_RELEASE.runtimeTag, license: 'MIT',
            source: `https://github.com/ggml-org/llama.cpp/tree/${PENA_RELEASE.runtimeTag}`,
            licenseText: [licenseTexts['llama.cpp-LICENSE.txt'],
                licenseTexts['llama-b12633-win-cpu-dependencies-LICENSE.txt']].join('\n\n') },
        { name: PENA_RELEASE.model.name, license: 'Apache-2.0',
            description: 'Inkling 2 Mini by Thinking Machines Lab, GGUF by AtomicChat.',
            source: PENA_RELEASE.model.url.replace('/resolve/', '/blob/'),
            terms: 'https://thinkingmachines.ai/model-acceptable-use-policy/',
            licenseText: licenseTexts['Inkling-LICENSE.txt'] },
        { name: 'NVIDIA CUDA', version: cudaVersions.join(' / '), license: 'NVIDIA',
            source: 'https://developer.nvidia.com/cuda-toolkit',
            terms: 'https://docs.nvidia.com/cuda/eula/index.html' }
    ];
    if(PENA_RELEASE.lora) ai.push({
        name: 'Pena chess LoRA', license: 'GPL-3.0 (Pena contribution)',
        description: 'Chess-coaching adapter by Haka, including OpenUncensored\'s refusal-removal edit. Requires the matching plain Inkling base.',
        source: PENA_RELEASE.lora.url.replace('/resolve/', '/blob/'),
        terms: 'https://thinkingmachines.ai/model-acceptable-use-policy/',
        licenseText: `${gpl}\n\nUpstream Inkling Apache-2.0\n\n${licenseTexts['Inkling-LICENSE.txt']}`
    });
    const credits = [{ id: 'libraries', entries: libraries }, { id: 'fonts', entries: fonts }, { id: 'ai', entries: ai }];
    const output = path.join(appDir, '.licenses');
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'THIRD-PARTY-NOTICES.txt'), sections.join('\n\n'));
    await writeFile(path.join(output, 'credits.json'), JSON.stringify(credits));
    await copyFile(electronLicense, path.join(output, 'LICENSE.electron.txt'));
    await copyFile(chromiumLicense, path.join(output, 'LICENSES.chromium.html'));
    return output;
}

module.exports = async context => prepareLicenses(context.appDir);
module.exports.prepareLicenses = prepareLicenses;

if(require.main === module) {
    prepareLicenses().catch(error => {
        console.error('Could not prepare third-party licence notices:', error);
        process.exitCode = 1;
    });
}
