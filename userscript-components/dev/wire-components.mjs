// Wire components or replace their publication URLs. No runtime fallbacks.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dynamicSource = readFileSync(new URL('../DynamicSettings.js', import.meta.url), 'utf8');

function requireUrl(value) {
    const url = new URL(value);
    if(url.protocol !== 'https:' || url.hostname !== 'update.greasyfork.org' ||
        !/^\/scripts\/\d+\/.+\.js$/.test(url.pathname) || url.username || url.password ||
        url.hash || /\s/.test(value)) throw new Error('Expected an HTTPS Greasy Fork library .js URL');
    return url.href;
}

export function wireDynamicSettings(source, dynamicUrl) {
    dynamicUrl = requireUrl(dynamicUrl);
    const startText = 'const DynamicSettingsCore = (() => {';
    const endText = '(async () => { try { await LOAD_LEGACY_GM_SUPPORT();';
    const start = source.indexOf(startText), end = source.indexOf(endText, start);
    if(start < 0 || end < start || source.indexOf(startText, start + 1) !== -1)
        throw new Error('Missing or ambiguous inline dynamic core anchor');
    const normalize = text => text.replace(/\r/g, '').split('\n').filter(line => line.trim()).join('\n');
    if(normalize(source.slice(start, end)) !==
        normalize(dynamicSource.slice(dynamicSource.indexOf(startText))))
        throw new Error('Inline dynamic core differs from the shared component; refusing to remove it');
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const headerEnd = '// ==/UserScript==';
    if(source.split(headerEnd).length !== 2) throw new Error('Missing userscript metadata end');
    return (source.slice(0, start) + source.slice(end)).replace(headerEnd, () =>
        `// @require     ${dynamicUrl}${eol}${headerEnd}`);
}

export function wireComponents(source, { boardUrl, dynamicUrl }) {
    boardUrl = requireUrl(boardUrl);
    if(dynamicUrl) {
        dynamicUrl = requireUrl(dynamicUrl);
        if(boardUrl === dynamicUrl) throw new Error('The components need distinct library URLs');
        source = wireDynamicSettings(source, dynamicUrl);
    } else if(source.includes('const DynamicSettingsCore = (() => {')) {
        throw new Error('Publish and wire DynamicSettings first, or supply --dynamic-url');
    } else if(!/^\/\/ @require\s+https:\/\/update\.greasyfork\.org\/scripts\/\d+\/.*DynamicSettings.*\.js(?:\?\S*)?\s*$/m.test(source)) {
        throw new Error('Missing published DynamicSettings @require');
    }
    const boardRequire = /^\/\/ @require\s+https:\/\/update\.greasyfork\.org\/scripts\/\d+\/[^\r\n]*BoardChangeParser[^\r\n]*\.js(?:\?[^\r\n]*)?/gm;
    const existing = [...source.matchAll(boardRequire)];
    if(existing.length) {
        if(existing.length !== 1 || !source.includes('const boardChangeParser = new BoardChangeParser({') ||
            /^function (?:fenToBoard|boardToFen|getMissedFen)\(/m.test(source))
            throw new Error('Invalid or ambiguous board component wiring');
        return source.replace(boardRequire, () => `// @require     ${boardUrl}`);
    }
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    let code = source.replace(/\r\n/g, '\n');
    function replaceBlock(startText, endText, replacement) {
        const start = code.indexOf(startText), end = code.indexOf(endText, start);
        if(start < 0 || end < start || code.indexOf(startText, start + 1) !== -1)
            throw new Error(`Missing or ambiguous source anchor: ${startText}`);
        const block = code.slice(start, end);
        code = code.slice(0, start) + replacement + code.slice(end);
        return block;
    }
    const block = replaceBlock('function fenToBoard(basicFen) {',
        '// Which castling rights can still exist', `const boardChangeParser = new BoardChangeParser({
    getBoardChangesObjTemplate,
    getFenPieceColor
});

function getBoardChanges(lastBasicFen, newBasicFen, turn, context) {
    return boardChangeParser.getBoardChanges(lastBasicFen, newBasicFen, turn, context);
}

`);
    const names = [...block.matchAll(/^function (\w+)\(/gm)].map(match => match[1]);
    if(names.join(',') !== 'fenToBoard,boardToFen,getBoardChanges,getMissedFen')
        throw new Error('Unexpected declarations in the parser block; refusing to remove them');
    const call = 'const boardChanges = getBoardChanges(lastAllowedFen, currentBasicFen, lastTurn);';
    if(code.split(call).length !== 2) throw new Error('Board validity call site changed');
    code = code.replace(call, `const boardChanges = getBoardChanges(lastAllowedFen, currentBasicFen, lastTurn, {
        castlingRights: history[0]?.castlingRights,
        enPassantTarget: history[0]?.movedPiece ? history[0].enPassantTarget : undefined,
        lastMoveSquares: getSiteData('lastMoveSquares'),
        conservative: domain === 'lichess.org',
        variant: getSiteData('chessVariant'),
        currentTurn: getSiteData('turn')
    });`);
    const takeback = 'function removeTakeback(history) {\n    // Todo\n    return history;\n}';
    if(code.split(takeback).length !== 2) throw new Error('Takeback helper anchor changed');
    code = code.replace(takeback, `function removeTakeback(history, observation) {
    return boardChangeParser.reconcileHistory(history, observation).history;
}`);
    const observationAnchor = '    const lastTurn = history[0]?.turn;\n';
    if(code.split(observationAnchor).length !== 2) throw new Error('History observation anchor changed');
    code = code.replace(observationAnchor, `${observationAnchor}
    const observedPly = getSiteData('ply');
    const observedTurn = getSiteData('turn');
    const reconciled = removeTakeback(history, { basicFen: currentBasicFen, ply: observedPly, turn: observedTurn });
    if(reconciled !== history) {
        Object.assign(gameState, reconciled[0]);
        gameState.lostCastlingRights = ['K', 'Q', 'k', 'q']
            .filter(right => !reconciled[0].castlingRights?.includes(right));
        gameStateHistory.set(reconciled);
        lastAllowedFen = currentBasicFen;
        lastRejectedFen = '';
        await processBoardPosition();
        return;
    }
`);
    const stateAnchor = '    const stateObj = {\n';
    if(code.split(stateAnchor).length !== 2) throw new Error('Game state anchor changed');
    code = code.replace(stateAnchor, `${stateAnchor}        observedPly: forceFen && previousState ? undefined : getSiteData('ply'),\n`);
    const adapter = "addSupportedChessSite('lichess.org', {\n";
    if(code.split(adapter).length !== 2) throw new Error('Lichess adapter anchor changed');
    code = code.replace(adapter, `${adapter}    'lastMoveSquares': obj => {
        const squares = [...(getBoardElem()?.querySelectorAll('square.last-move') || [])]
            .map(element => getChessgroundCoordsFromPiece(element))
            .map(coords => BoardCoordinates.isIndex(coords, [8, 8]) ? BoardCoordinates.toChess(coords) : null);
        return squares.length === 2 && squares.every(Boolean) && squares[0] !== squares[1] ? squares : null;
    },
`);
    const headerEnd = '// ==/UserScript==';
    if(code.split(headerEnd).length !== 2) throw new Error('Missing userscript metadata end');
    code = code.replace(headerEnd, () =>
        `// @require     ${boardUrl}\n${headerEnd}`);
    return code.replace(/\n/g, eol);
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = process.argv.slice(2);
        const options = {};
        if(!args.length || args.length % 2) throw new Error('Supply --dynamic-url <url> and/or --board-url <url>');
        for(let i = 0; i < args.length; i += 2) {
            const key = args[i] === '--dynamic-url' ? 'dynamicUrl' : args[i] === '--board-url' ? 'boardUrl' : null;
            if(!key || options[key]) throw new Error(`Unknown or repeated option: ${args[i]}`);
            options[key] = args[i + 1];
        }
        const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'acas.user.js');
        const source = readFileSync(sourcePath, 'utf8');
        const code = options.boardUrl ? wireComponents(source, options) : wireDynamicSettings(source, options.dynamicUrl);
        writeFileSync(sourcePath, code);
        console.log('Wired published components. Rebuild the debug userscript to use the identical @requires.');
    } catch(error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
