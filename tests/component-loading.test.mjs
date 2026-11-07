import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { wireComponents, wireDynamicSettings } from '../userscript-components/dev/wire-components.mjs';

const source = readFileSync(new URL('../acas.user.js', import.meta.url), 'utf8');
const dynamic = readFileSync(new URL('../userscript-components/DynamicSettings.js', import.meta.url), 'utf8');
const board = readFileSync(new URL('../userscript-components/BoardChangeParser.js', import.meta.url), 'utf8');
const urls = {
    boardUrl: 'https://update.greasyfork.org/scripts/2/BoardChangeParser.js'
};
const dynamicUrl = 'https://update.greasyfork.org/scripts/604137/1988721/DynamicSettingsjs.js';
const requires = text => text.split(/\r?\n/).filter(line => /^\/\/ @require\s/.test(line));

const bodyAnchor = '(async () => { try { await LOAD_LEGACY_GM_SUPPORT();';
const inlineFixture = source.replace(/^\/\/ @require\s+.*DynamicSettings.*\r?\n/m, '')
    .replace(bodyAnchor, () => `${dynamic.slice(dynamic.indexOf('const DynamicSettingsCore ='))}\n${bodyAnchor}`);

test('production delegates parsing and takebacks to one component with injected shared helpers', () => {
    assert.equal(requires(source).filter(line => /BoardChangeParser/.test(line)).length, 1);
    assert.doesNotMatch(source, /^function (?:fenToBoard|boardToFen|getMissedFen)\(/m);
    assert.match(source, /return boardChangeParser\.getBoardChanges\(/);
    assert.match(source, /return boardChangeParser\.reconcileHistory\(/);
    assert.match(source, /conservative: domain === 'lichess.org'/);
    assert.equal((source.match(/new BoardChangeParser\(/g) || []).length, 1);
    const updated = wireComponents(source, urls);
    assert.deepEqual(requires(updated).filter(line => !line.includes('BoardChangeParser')),
        requires(source).filter(line => !line.includes('BoardChangeParser')));
    assert.equal(updated.replace(urls.boardUrl, 'BOARD_URL'),
        source.replace(/https:\/\/update\.greasyfork\.org\/scripts\/\d+\/(?:\d+\/)?BoardChangeParser(?:js)?\.js/, 'BOARD_URL'));
});

test('published DynamicSettingsCore replaces the inline copy and keeps sandbox-local state', () => {
    assert.doesNotMatch(source, /const DynamicSettingsCore =/);
    assert.equal(requires(source).filter(line => line.endsWith(dynamicUrl)).length, 1);
    const context = vm.createContext({});
    for(const name of ['window', 'unsafeWindow', 'document', 'console', 'fetch', 'GM', 'setInterval'])
        Object.defineProperty(context, name, { get() { assert.fail(`Core accessed ${name}`); } });
    vm.runInContext(dynamic, context);
    assert.equal(Object.hasOwn(context, 'DynamicSettingsCore'), false);
    const core = vm.runInContext('DynamicSettingsCore', context);
    assert.ok(Object.isFrozen(core));
    assert.equal(core.resolveValue(5, null, {}), 5);
    core.setContext('test', { pieceCount: 12 });
    assert.equal(core.getContext('test').pieceCount, 12);
});

test('dynamic publication can be wired independently without changing the board component', () => {
    const wired = wireDynamicSettings(inlineFixture, dynamicUrl);
    assert.doesNotMatch(wired, /const DynamicSettingsCore =/);
    assert.match(wired, /new BoardChangeParser/);
    assert.equal(requires(wired).filter(line => line.endsWith(dynamicUrl)).length, 1);
    assert.equal(requires(wired).length, requires(source).length);
    assert.doesNotThrow(() => new Function(`${dynamic}\n${board}\n${wired}`));
    assert.throws(() => wireDynamicSettings(wired, dynamicUrl), /anchor/);
    assert.throws(() => wireDynamicSettings(inlineFixture.replace('const DynamicSettingsCore = (() => {',
        'const DynamicSettingsCore = (() => {\nconst unexpected = 1;'), dynamicUrl), /differs/);
    const both = wireComponents(inlineFixture, { ...urls, dynamicUrl });
    assert.doesNotMatch(both, /const DynamicSettingsCore =|function getMissedFen\(/);
    assert.doesNotThrow(() => new Function(`${dynamic}\n${board}\n${both}`));
});

test('staged publication removes inline duplicates, injects shared helpers and compiles', () => {
    for(const text of [source.replace(/\r\n/g, '\n'), source.replace(/\r?\n/g, '\r\n')]) {
        const wired = wireComponents(text, urls);
        assert.ok(requires(wired).some(line => line.endsWith(dynamicUrl)));
        assert.ok(requires(wired).some(line => line.endsWith(urls.boardUrl)));
        assert.doesNotMatch(wired, /const DynamicSettingsCore =|function getMissedFen\(|function fenToBoard\(/);
        assert.match(wired, /new BoardChangeParser\(\{\s+getBoardChangesObjTemplate,\s+getFenPieceColor/);
        assert.match(wired, /castlingRights: history\[0\]\?\.castlingRights/);
        assert.match(wired, /variant: getSiteData\('chessVariant'\)/);
        assert.doesNotThrow(() => new Function(`${dynamic}\n${board}\n${wired}`));
        if(text.includes('\r\n')) assert.doesNotMatch(wired, /(?<!\r)\n/);
        assert.equal(wireComponents(wired, urls), wired);
    }
});

test('publication refuses bad URLs, missing anchors and unexpected declarations without writing', () => {
    for(const url of ['http://update.greasyfork.org/scripts/1/a.js', 'https://example.com/a.js',
        'https://user:password@update.greasyfork.org/scripts/1/a.js', 'not-a-url']) {
        assert.throws(() => wireComponents(source, { ...urls, boardUrl: url }));
    }
    assert.throws(() => wireComponents(inlineFixture, { dynamicUrl, boardUrl: dynamicUrl }), /distinct/);
    assert.throws(() => wireComponents(source.replace('const boardChangeParser = new BoardChangeParser({',
        'const unexpected = new BoardChangeParser({'), urls), /wiring/);
    assert.throws(() => wireComponents(`${source}\nfunction getMissedFen() {}`, urls), /wiring/);
    assert.throws(() => wireComponents(inlineFixture, urls), /DynamicSettings first/);
    assert.throws(() => wireComponents(source.replace(/^\/\/ @require\s+.*DynamicSettings.*\r?\n/m, ''), urls),
        /Missing published DynamicSettings/);
});

test('debug builder preserves all production @requires verbatim and does not replace the parser', () => {
    execFileSync(process.execPath, [fileURLToPath(new URL('../userscript-components/dev/build-test-userscript.mjs', import.meta.url))], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8'
    });
    const debug = readFileSync(new URL('../acas.user.test.js', import.meta.url), 'utf8');
    assert.deepEqual(requires(debug), requires(source));
    assert.equal(debug.includes('function getMissedFen('), source.includes('function getMissedFen('));
    assert.doesNotThrow(() => new Function(debug));
});
