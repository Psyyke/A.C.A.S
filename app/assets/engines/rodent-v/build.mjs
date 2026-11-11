import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const revision = 'b55a1d142a4254dd091ede86845b2b9ac036653e';
const goVersion = 'go1.27.4';
const go = process.env.RODENT_GO || 'go';
const build = path.join(root, 'build');
const upstream = process.env.RODENT_UPSTREAM_DIR || path.join(build, 'upstream');
const source = path.join(build, 'source');
const dist = path.join(root, 'dist');
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });
const output = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
const hash = data => createHash('sha256').update(data).digest('hex');
const copy = (from, to) => {
    mkdirSync(path.dirname(to), { recursive: true });
    if(existsSync(to)) chmodSync(to, 0o644);
    copyFileSync(from, to);
    chmodSync(to, 0o644);
};

if(!output(go, ['version']).includes(` ${goVersion} `)) throw new Error(`Build with ${goVersion}, including its matching wasm_exec.js.`);
mkdirSync(source, { recursive: true });
mkdirSync(dist, { recursive: true });
if(!existsSync(upstream)) {
    run('git', ['clone', '--no-checkout', 'https://github.com/nescitus/Rodent-V.git', upstream]);
    run('git', ['checkout', '--detach', revision], { cwd: upstream });
}
if(output('git', ['rev-parse', 'HEAD'], { cwd: upstream }) !== revision
    || output('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: upstream }))
    throw new Error(`Rodent source must be a clean checkout of ${revision}.`);

for(const name of readdirSync(upstream)) {
    if(/\.(go|s)$/.test(name) || ['go.mod', 'go.sum'].includes(name)) copy(path.join(upstream, name), path.join(source, name));
}
copy(path.join(upstream, 'nets', 'rodent_8kb_512pw_multilayer_v8.bin'),
    path.join(source, 'nets', 'rodent_8kb_512pw_multilayer_v8.bin'));
copy(path.join(root, 'browser.go'), path.join(source, 'browser.go'));

function patch(name, before, after) {
    const file = path.join(source, name);
    const text = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
    if(text.split(before).length !== 2) throw new Error(`Expected exactly one patch location in ${name}: ${before}`);
    writeFileSync(file, text.replace(before, after));
}

patch('main.go', 'func main() {', 'func nativeMain() {');
patch('uci.go', 'bufio.NewScanner(os.Stdin)', 'bufio.NewScanner(browserInput)');
patch('uci.go', 'max 1048576', 'max 256');
patch('uci.go', 'option name Threads type spin default 1 min 1 max 256',
    'option name Threads type spin default 1 min 1 max 1');
for(const [name, variable] of [['UCI_Chess960', 'useChess960'], ['UCI_LimitStrength', 'limitStrength'], ['OwnBook', 'ownBook']]) {
    patch('uci.go', `fmt.Println("option name ${name} type check default false")`,
        `fmt.Printf("option name ${name} type check default %t\\n", ${variable})`);
}
patch('uci.go', 'allocTT(mb)', 'allocTT(limitValue(mb, 1, 256))');
patch('uci.go', 'numThreads = limitValue(n, 1, 256)', 'numThreads = 1');
patch('uci.go', 'if n, err := strconv.Atoi(value); err == nil {\n\t\t\tnumThreads = 1',
    'if _, err := strconv.Atoi(value); err == nil {\n\t\t\tnumThreads = 1');
patch('uci.go', 'parseSetOption(tokens[1:])', 'browserSetOption(tokens[1:])');
patch('uci.go', `\t\t\t\tif readPersonalityFiles {
\t\t\t\t\tfmt.Println("option name PersonalityFile type string default", personalityFile)
\t\t\t\t} else {
\t\t\t\t\tfmt.Println("option name Save Personality type button")
\t\t\t\t\tfmt.Println("option name NnuePath type string default", nnuePath)
\t\t\t\t\tfmt.Println("option name MainBook type string default", mainBookPath)
\t\t\t\t\tfmt.Println("option name GuideBook type string default", guideBookPath)
\t\t\t\t}`, '\t\t\t\tbrowserPrintAssetOptions()\n\t\t\t\tprintSingleOption(NnueScale)');
patch('uci.go', '\t\t\tmove := 0\n\t\t\tif ownBook {',
    '\t\t\tbrowserSetSearchMoves(tokens[1:])\n\t\t\tmove := 0\n\t\t\tif ownBook && browserRootMoves == nil {');
patch('uci.go', '\t\t\t\t\tmaxDepth = d', '\t\t\t\t\tmaxDepth = limitValue(d, 1, maxPly-1)');
patch('search.go', 'if ss.excludeRootMove(move) {', 'if ss.excludeRootMove(move) || !browserRootMoveAllowed(move) {');
patch('search.go', '\tif ss.nodes&timeoutTestPeriod != 0 || rootDepth == 1 {',
    '\tif ss.nodes&63 == 0 {\n\t\tbrowserYield()\n\t}\n\n\tif ss.nodes&timeoutTestPeriod != 0 || rootDepth == 1 {');
for(const name of ['nnue.go', 'book.go']) {
    patch(name, 'os.ReadFile(path)', 'browserReadFile(path)');
    patch(name, '\n\t"os"', '');
}
patch('options.go', 'os.Open(path)', 'browserOpen(path)');
patch('options.go', 'parseSetOption(tokens[1:])', 'browserPresetOption(tokens[1:])');
patch('uci.go', '\t\tcase "stop":', '\t\tcase "acas_sync":\n\t\t\tbrowserSync(tokens[1])\n\n\t\tcase "stop":');
patch('nnue.go', 'func nnueLoad(path string) bool {',
    'func nnueLoad(path string) bool {\n\tbrowserValidateNetwork(path)');

// Upstream dispatch references amd64 assembly even on non-amd64 targets.
// Retain the existing scalar kernels, rather than approximating their math.
const nnueFile = path.join(source, 'nnue.go');
let nnueSource = readFileSync(nnueFile, 'utf8');
const wrappers = [...nnueSource.matchAll(/(func nnue\w+\([^\n]+\) \{)\n\tif !hasAVX2 \{\n\t\t([^\n]+Scalar[^\n]+)\n\t\treturn\n\t\}[\s\S]*?\n\}/g)];
if(wrappers.length !== 9) throw new Error('Expected nine NNUE scalar dispatch wrappers.');
for(const [whole, signature, call] of wrappers) nnueSource = nnueSource.replace(whole, `${signature}\n\t${call}\n}`);
const multilayer = [...nnueSource.matchAll(/(\t+)if hasAVX2 && nnueParams\.IsDualActivation \{\n[\s\S]*?\n\1\}/g)];
if(multilayer.length !== 2) throw new Error('Expected two multilayer AVX2 dispatch blocks.');
for(const [whole] of multilayer) nnueSource = nnueSource.replace(whole, '');
writeFileSync(nnueFile, nnueSource);

const assets = {};
const groups = {};
for(const directory of ['nets', 'books', 'personalities']) {
    groups[directory] = readdirSync(path.join(upstream, directory)).sort();
    for(const name of groups[directory]) {
        const key = `${directory}/${name}`;
        const from = path.join(upstream, directory, name);
        const data = readFileSync(from);
        assets[key] = { size: data.length, sha256: hash(data) };
        copy(from, path.join(dist, 'assets', directory, name));
    }
}
const goList = values => `[]string{${values.map(value => JSON.stringify(value)).join(',')}}`;
writeFileSync(path.join(source, 'browser_assets.go'), `package main
var browserNetworks = ${goList(groups.nets.map(name => `nets/${name}`))}
var browserBooks = ${goList(groups.books.map(name => `books/${name}`))}
var browserPersonalities = ${goList(groups.personalities.map(name => name.replace(/\.txt$/, '')))}
`);
const binaries = {};
for(const size of [512, 768]) {
    const network = size === 512 ? 'rodent_8kb_512pw_multilayer_v8.bin' : 'rodent_4kb_768hl_8ob_v2.bin';
    copy(path.join(upstream, 'nets', network), path.join(source, 'nets', network));
    writeFileSync(nnueFile, nnueSource.replace('NNUEHiddenSize     = 512', `NNUEHiddenSize     = ${size}`)
        .replace('//go:embed nets/rodent_8kb_512pw_multilayer_v8.bin', `//go:embed nets/${network}`));
    writeFileSync(path.join(source, 'browser_network.go'), `package main\nconst browserEmbeddedNetwork = "nets/${network}"\n`);
    const binary = `rodent-${size}.wasm`;
    run(go, ['build', '-buildvcs=false', '-pgo=off', '-trimpath', '-ldflags=-s -w -buildid=', '-o', path.join(dist, binary), '.'], {
        cwd: source, env: { ...process.env, GOOS: 'js', GOARCH: 'wasm', CGO_ENABLED: '0' }
    });
    binaries[size] = { file: binary, sha256: hash(readFileSync(path.join(dist, binary))) };
}
const goroot = output(go, ['env', 'GOROOT']);
copy(path.join(goroot, 'lib', 'wasm', 'wasm_exec.js'), path.join(dist, 'wasm_exec.js'));
copy(path.join(goroot, 'LICENSE'), path.join(dist, 'LICENSE-Go.txt'));
copy(path.join(upstream, 'LICENSE'), path.join(dist, 'LICENSE-Rodent.txt'));
const module = JSON.parse(output(go, ['list', '-m', '-json', 'golang.org/x/sys'], { cwd: source }));
copy(path.join(module.Dir, 'LICENSE'), path.join(dist, 'LICENSE-x-sys.txt'));
run('git', ['archive', '--format=zip', `--output=${path.join(dist, 'rodent-v-source.zip')}`, revision], { cwd: upstream });
writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify({
    repository: 'https://github.com/nescitus/Rodent-V', revision, version: '1.2.03', goVersion,
    target: 'js/wasm', threads: 1, hashMaxMB: 256,
    binaries, assets
}, null, 2) + '\n');
console.log(`Built Rodent V ${revision} with ${goVersion}.`);
