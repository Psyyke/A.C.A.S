import { decodePcf, encodePcf, pcfColumns } from './pcf-evidence.js';
import { pcfBinPropMotifs } from './binprop-full.js';
import { compactHistoryRelations, compactHistorySquares, selectQuestionEvidence } from './question-evidence-pilot.js';

const pieceNames = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const sideNames = { w: 'White', b: 'Black' };
const comparisonMetrics = {
    ps: 'pawn structure', pp: 'pawn pressure', dd: 'defensive duties', kz: 'king zone pressure',
    ac: 'advanced control', dm: 'developed minors', cc: 'central controls'
};
const valueText = value => value === '-' ? 'none' : value === '?' ? 'unknown' : value === '~' ? 'not applicable' : value;
const squareList = /^[a-h][1-8](?:[a-h][1-8][qrbn]?)?(?:,[a-h][1-8](?:[a-h][1-8][qrbn]?)?)+$/;
const binPropName = code => {
    const motif = pcfBinPropMotifs.find(item => item.code === code);
    if(!motif) throw new Error(`Unknown BinProp code ${code}.`);
    return motif.name;
};
const rowValues = row => row.kind === 'BCHANGE' ? row.values.map((value, index) =>
    [3, 4].includes(index) && value !== '-' ? value.split(',').map(binPropName).join(', ') : value) : row.values;
const comparisonGuidance = 'BINLINE predicate bits and BINCOMP per-predicate lists follow the same 30-name order as the current BinProps. '
    + 'BINLINE is a sampled endpoint. BINCOMP positiveTrueCounts count preferred samples with the predicate true; '
    + 'negativeFalseCounts count alternative samples with it false. supportFits are heuristic fit statistics, not causal explanations or confidence.';
const effectGuidance = 'Z effects use dot-separated fields. Pieces are w/b plus K/Q/R/B/N/P. '
    + 'action: piece,from,to,SAN (castle means the rook move); capture: captured piece,square; check/mate: affected side; promotion: new type. '
    + 'attack/defend: source piece,square,target piece,square; lost: source piece,square,target piece,current square,previous square. '
    + 'ray: slider,square,former blocker,square,newly controlled square; pinadd/pinremove: type,slider,front,back; center: piece,square,newly controlled square. '
    + 'Attacks and defenses are geometric changes in that sampled position, not legal or safe captures.';

const spatialAtom = /^(?:[a-h][1-8](?:[a-h][1-8][qrbn]?)?|[wb][PNBRQK]|@[1-9]\d*)$/;
const wireBoundary = '\nWIRE\n';

/**
 * Keep the already compact PCF tables and references. Only redundant tokenizer
 * boundary markers are removed; no field, record or geometric relation changes.
 */
export function renderCompactWireEvidence(pcf) {
    decodePcf(pcf);
    const compact = pcf.split('\n').map(line => line.split(' ').map(value =>
        value.startsWith('!') && spatialAtom.test(value.slice(1))
            ? value.slice(1) : value.replace(/\.!/g, '.')).join(' ')).join('\n');
    const output = [
        'Pena evidence compact wire/1',
        'PCF/3 tables below retain every selected fact. C=current, H=recorded history, V=conditional sample, not forced play. '
            + 'Geometric attacks/defenses include pinned pieces, not proof of legal or safe captures. '
            + '- known empty, ? unknown, ~ not applicable; 1=true, 0=false. '
            + 'Pieces w/b=White/Black, K/Q/R/B/N/P=king/queen/rook/bishop/knight/pawn. '
            + 'R=square,piece,identity,enemy attackers,friendly defenders,enemy targets,friendly targets; '
            + 'cite C.square. Trailing missing R cells are empty. G=square,geometric controls; L=square,actual-turn legal destinations. '
            + 'A=square,pawn-constrained controls,own-king file/rank offsets,enemy-king file/rank offsets; S=square,White/Black/White-pawn/Black-pawn counts. '
            + 'S two digits append two pawn zeros; unlisted complete S squares have four zeros. '
            + 'X=slider,df,dr,empty squares,nearest blocker; unlisted complete X directions have neither. '
            + 'Offsets 00..14 map in order to -7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7. '
            + 'BASE C inherits the named complete current group; DROP removes, explicit historical rows replace/add, ORDER changes order only. '
            + 'SAME L/A reuses G; SAME V reuses the named relation record; MORE repeats the preceding effect source. '
            + 'These are explicit record references, not newly calculated chess facts. '
            + 'Compact lists retain ! separators; scalar squares/pieces/identities and effect dots no longer need ! boundary markers.',
        `BINS color: all 30 predicates default false; listed codes true. ${pcfBinPropMotifs.map(motif => `${motif.code}=${motif.name}`).join('; ')}. BinProps are heuristic tests, not proven reasons.`,
        ...(pcf.includes('\n@BINLINE ') || pcf.includes('\n@BINCOMP ') ? [
            'BINLINE bits and BINCOMP counts/fits use that same 30-code order. '
                + 'Fit codes 0..6=0,1/4,1/3,1/2,2/3,3/4,1; weighted scores and strict contrasts follow PCF/3. '
                + 'Support fit=min(preferred true rate,alternative false rate), not confidence or causation.'
        ] : []),
        'WIRE',
        compact
    ].join('\n');
    // The inverse must be exact even before PCF validation, including references.
    if(restoreCompactWire(output) !== pcf) throw new Error('Ambiguous compact wire boundary transformation.');
    return output;
}

function restoreCompactWire(text) {
    if(typeof text !== 'string' || !text.startsWith('Pena evidence compact wire/1\n')
        || text.indexOf(wireBoundary) < 0 || text.indexOf(wireBoundary) !== text.lastIndexOf(wireBoundary))
        throw new Error('Unknown compact wire evidence envelope.');
    return text.slice(text.indexOf(wireBoundary) + wireBoundary.length).split('\n')
        .map(line => line.split(' ').map(value => spatialAtom.test(value) ? '!' + value
            : value.startsWith('!') ? value.replace(/\.(?=[A-Za-z0-9@?~-])/g, '.!') : value)
            .join(' ')).join('\n');
}

export function decodeCompactWireEvidence(text) {
    return decodePcf(restoreCompactWire(text));
}

/**
 * Copy-only format: all decoded records, with no question selection or spatial
 * ablation. Headers carry repeated frame fields; all relations remain explicit.
 */
export function renderLosslessCompactEvidence(pcf) {
    const selection = decodePcf(pcf);
    const output = [
        'Pena evidence compact lossless/2',
        'C=current, H=recorded history, V=conditional sample, not forced play. '
            + 'Geometric attacks and defenses include pinned pieces, not proof of legal or safe captures. '
            + 'BinProps are heuristic predicates, not proven explanations. '
            + 'Tab-separated fields; - known empty, ? unknown, ~ not applicable; 1=true, 0=false. '
            + 'Pieces: w=White, b=Black; K=king Q=queen R=rook B=bishop N=knight P=pawn. '
            + 'Square and move lists use spaces. ZERO lists explicitly give four zero S counts for each square. '
            + 'Each # legend names the fields of that record kind, in order; @ headers supply the frame. '
            + 'BINS gives all 30 named flags in legend order, separately for each color. '
            + '[frame.square] supplies the R square and its citation.',
        ...(selection.rows.some(row => ['BINLINE', 'BINCOMP'].includes(row.kind)) ? [comparisonGuidance] : []),
        ...(selection.rows.some(row => row.kind === 'Z') ? [effectGuidance] : [])
    ];
    let group = null;
    const legends = new Set();
    for(let i = 0; i < selection.rows.length; i++) {
        const row = selection.rows[i], columns = pcfColumns[row.kind];
        const framed = columns[0] === 'frame', frame = framed ? row.values[0] : '-';
        const key = `${row.kind} ${frame}`;
        if(key !== group) {
            if(!legends.has(row.kind)) {
                output.push(`#${row.kind}\t${columns.slice(framed ? 1 : 0).join('\t')}`);
                legends.add(row.kind);
            }
            output.push(`@${key}`);
            group = key;
        }
        if(row.kind === 'S' && row.values.slice(2).every(value => value === '0')) {
            const squares = [row.values[1]];
            while(selection.rows[i + 1]?.kind === 'S' && selection.rows[i + 1].values[0] === frame
                && selection.rows[i + 1].values.slice(2).every(value => value === '0'))
                squares.push(selection.rows[++i].values[1]);
            output.push(`ZERO\t${squares.join(' ')}`);
            continue;
        }
        const values = row.values.slice(framed ? 1 : 0)
            .map(value => squareList.test(value) ? value.replace(/,/g, ' ') : value);
        if(row.kind === 'R') values[0] = `[${frame}.${values[0]}]`;
        output.push((row.kind === 'R' ? '' : citation(row)) + values.join('\t'));
    }
    return output.join('\n');
}

/** Restore and validate every fact, including ordering and all zero S records. */
export function decodeLosslessCompactEvidence(text) {
    if(typeof text !== 'string' || !text.startsWith('Pena evidence compact lossless/2\n'))
        throw new Error('Unknown lossless evidence version.');
    const rows = [];
    let kind, frame, framed;
    const legends = new Set();
    for(const line of text.split('\n').slice(1)) {
        if(line.startsWith('#')) {
            const [name, ...fields] = line.slice(1).split('\t');
            const columns = pcfColumns[name];
            if(!columns || legends.has(name)
                || fields.join('\t') !== columns.slice(columns[0] === 'frame' ? 1 : 0).join('\t'))
                throw new Error('Invalid lossless evidence legend.');
            legends.add(name);
            continue;
        }
        if(line.startsWith('@')) {
            const fields = line.slice(1).split(' ');
            [kind, frame] = fields;
            const columns = pcfColumns[kind];
            framed = columns?.[0] === 'frame';
            if(!columns || !legends.has(kind) || fields.length !== 2
                || !frame || (!framed && frame !== '-'))
                throw new Error('Invalid lossless evidence header.');
            continue;
        }
        if(!kind) continue;
        if(kind === 'S' && line.startsWith('ZERO\t')) {
            const squares = line.slice(5).split(' ');
            if(squares.some(square => !/^[a-h][1-8]$/.test(square)))
                throw new Error('Invalid zero-control square list.');
            rows.push(...squares.map(square => ({ kind, values: [frame, square, '0', '0', '0', '0'] })));
            continue;
        }
        const citationPrefix = kind === 'R' ? '' : /^\[[^\]\r\n]+\] /.exec(line)?.[0] || '';
        const values = line.slice(citationPrefix.length).split('\t').map(value =>
            squareList.test(value.replace(/ /g, ',')) ? value.replace(/ /g, ',') : value);
        if(kind === 'R') {
            const match = /^\[([A-Za-z0-9]+)\.([a-h][1-8])\]$/.exec(values[0]);
            if(!match || match[1] !== frame) throw new Error('Invalid lossless piece citation.');
            values[0] = match[2];
        }
        if(framed) values.unshift(frame);
        if(kind !== 'R' && citation({ kind, values }) !== citationPrefix)
            throw new Error('Invalid lossless record citation.');
        rows.push({ kind, values });
    }
    return decodePcf(encodePcf({ schema: 'pena-pcf-selection/3', rows }));
}

export function compactPredicateVector(value, binary = false) {
    const entries = binary ? [...value] : value.split(',');
    if(entries.length !== pcfBinPropMotifs.length) throw new Error('Invalid BinProp comparison vector.');
    const counts = new Map();
    for(const entry of entries) counts.set(entry, (counts.get(entry) || 0) + 1);
    const baseline = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const exceptions = entries.flatMap((entry, index) => entry === baseline ? [] : [`${pcfBinPropMotifs[index].name}=${entry}`]);
    if(exceptions.length > 3) return value;
    return `all ${baseline}${exceptions.length ? ` except ${exceptions.join(', ')}` : ''}`;
}

function citation(row) {
    const [frame, id] = row.values;
    if(frame !== 'C') return '';
    if(row.kind === 'F') return '[C.status] ';
    if(row.kind === 'I') return '[C.material] ';
    if(row.kind === 'Y') return '[C.history] ';
    if(row.kind === 'R') return `[C.${id}] `;
    if(row.kind === 'P') return `[C.pawn.${id}] `;
    if(['E', 'Q', 'H', 'W', 'Z', 'V', 'REPLY'].includes(row.kind)) return `[${id}] `;
    return '';
}

/**
 * Experimental loss-preserving rendering of a validated PCF selection.
 * The input is the selected wire record, not a private bank or target answer.
 */
export function renderReadableEvidence(pcf) {
    const selection = decodePcf(pcf);
    const rows = selection.rows.flatMap(row => {
        const values = rowValues(row);
        if(row.kind === 'S' && values.slice(2).every(value => value === '0')) return [];
        if(row.kind === 'R') {
            const [frame, square, piece, entity, attackers, defenders, enemies, friends] = values;
            const side = sideNames[piece[0]], name = pieceNames[piece[1]];
            if(!side || !name) throw new Error(`Unknown PCF piece ${piece}.`);
            return `${citation(row)}${frame}: ${side} ${name} ${square} (${entity}); `
                + `enemy attackers: ${valueText(attackers)}; friendly defenders: ${valueText(defenders)}; `
                + `enemy pieces attacked: ${valueText(enemies)}; friendly pieces defended: ${valueText(friends)}.`;
        }
        if(row.kind === 'BINS') {
            const [frame, color, ...flags] = values;
            if(!sideNames[color] || flags.length !== pcfBinPropMotifs.length || flags.some(flag => !['0', '1'].includes(flag)))
                throw new Error('Invalid BinProp flags in readable evidence.');
            const details = pcfBinPropMotifs.map((motif, index) => `${motif.name}: ${flags[index] === '1' ? 'true' : 'false'}`);
            return `${frame}: ${sideNames[color]} perspective BinProps: ${details.join('; ')}.`;
        }
        const columns = pcfColumns[row.kind];
        if(!columns || columns.length !== values.length) throw new Error(`Invalid evidence row ${row.kind}.`);
        return `${citation(row)}${row.kind}: ${columns.map((name, index) => `${name}=${valueText(values[index])}`).join('; ')}.`;
    });
    return [
        'Pena evidence pilot/1',
        'C is the current position, H is recorded history, and V is a conditional position. '
            + 'Geometric attacks and defenses include pinned pieces and do not prove a legal or safe capture. '
            + 'Conditional lines are samples, not forced play. BinProps are heuristic tests, not proven explanations. '
            + 'In record values, none means known empty, unknown means unavailable, and not applicable is distinct from both. '
            + 'Boolean flags use 1 for true and 0 for false. Unlisted squares in the complete current S group have zero control counts for both sides and their pawns.',
        ...(selection.rows.some(row => row.kind === 'BINLINE' || row.kind === 'BINCOMP') ? [comparisonGuidance] : []),
        ...rows
    ].join('\n');
}

/**
 * Same selected facts with a field legend once per consecutive record group.
 * The grouped form is experimental and has not been qualified for inference.
 */
export function renderCompactEvidence(pcf, { profile = 'full', question, fen, priorMessages = [] } = {}) {
    if(!['full', 'spatial-ablation', 'question-focused'].includes(profile)) throw new Error('Unknown evidence pilot profile.');
    const selection = decodePcf(pcf);
    const focused = profile === 'question-focused'
        ? selectQuestionEvidence(selection, { question, fen, priorMessages }) : null;
    const selectedRows = focused ? [...focused.rows, ...focused.derived] : selection.rows;
    const omittedKinds = new Set(profile === 'spatial-ablation' ? ['A', 'J', 'S', 'X'] : []);
    const omitted = focused ? focused.omitted : Object.fromEntries([...omittedKinds].map(kind =>
        [kind, selectedRows.filter(row => row.kind === kind).length]));
    const separator = focused ? '\t' : ' | ';
    const display = values => {
        const fields = focused ? values.map(value => squareList.test(value) ? value.replace(/,/g, ' ') : value) : values.map(valueText);
        if(focused && fields.some(field => field.includes('\t') || field.includes('\n')))
            throw new Error('Question-focused evidence field contains a separator.');
        return fields.join(separator);
    };
    const currentSquareRows = selection.rows.filter(row => row.kind === 'S' && row.values[0] === 'C');
    const completeCurrentSquares = currentSquareRows.length > 0
        && currentSquareRows.every(row => selectedRows.includes(row) && !omittedKinds.has(row.kind));
    const output = [
        'Pena evidence compact pilot/1',
        'C is current, H is recorded history, V is conditional. Geometric attacks include pinned pieces and do not prove legal or safe captures. '
            + 'Conditional lines are samples, not forced. BinProps are heuristic tests, not proven explanations. '
            + (focused ? 'Fields are tab-separated, and square or move lists use spaces. - means known empty, ? unknown and ~ not applicable. '
                : 'Fields are separated by |. In record values, none means known empty, unknown means unavailable, and not applicable is distinct from both. ')
            + 'Boolean flags are 1=true and 0=false. '
            + (completeCurrentSquares
                ? 'Unlisted squares in the complete current S group have zero control counts for both sides and their pawns.'
                : 'Some spatial records are omitted in this experimental ablation. K and O describe the original selection before these omissions, not the rendered coverage.')
    ];
    if(focused) output.push('Experimental question-focused selection. O and any K records describe the original selection, not the rendered coverage. '
        + `Records omitted after selection: ${Object.entries(omitted).map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none'}. `
        + 'Omitted records are unavailable here, not false. The selection may omit facts needed by the answer.'
        + (focused.unresolved ? ' An ambiguous, illegal or opponent move was detected, so the original selection was retained.' : '')
        + (focused.missingMoves.length ? ` No conditional frame was selected for requested move(s): ${focused.missingMoves.join(', ')}.` : ''));
    if(focused?.derivedMoves.length) output.push(`Additional rule-derived conditional frame [VQ1] for ${focused.derivedMoves[0]} starts from C. `
        + 'Its complete piece relations and changed geometric attacks and defenses are calculated from chess rules. '
        + 'It is not an engine search, evaluation, prediction or proof of a safe move. Original O and K counts exclude it.');
    if(omittedKinds.size) output.push(`Omitted records: ${Object.entries(omitted).map(([kind, count]) => `${kind}=${count}`).join(', ')}. `
        + 'A: pawn-constrained controls and king offsets. J: pawn-pair geometry. S: square control counts. X: slider rays and blockers.');
    if(selectedRows.some(row => row.kind === 'BINLINE' || row.kind === 'BINCOMP')) {
        output.push(comparisonGuidance);
        if(focused) output.push('A vector written as "all value except name=value" assigns that baseline to every other named predicate.');
    }
    if(focused && selectedRows.some(row => row.kind === 'Z')) output.push(effectGuidance);
    if(focused && selectedRows.some(row => row.kind === 'M' && row.values[0] === 'C'))
        output.push('Comparison ranges are min..max, or a single value when both are equal. '
            + 'Difference ranges compare preferred minus alternative samples. '
            + 'Bounded=1 means the advanced-control scan stopped early.');
    let previousKind = null;
    const renderedHistories = new Set();
    const renderedHistoryGroups = new Set();
    const currentPieces = selectedRows.filter(row => row.kind === 'R' && row.values[0] === 'C');
    const currentBins = selectedRows.filter(row => row.kind === 'BINS' && row.values[0] === 'C');
    for(let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i], values = rowValues(row);
        if(omittedKinds.has(row.kind)) continue;
        if(row.kind === 'S' && values.slice(2).every(value => value === '0')) continue;
        if(row.kind === 'BINS' && selectedRows[i + 1]?.kind === 'BINS'
            && selectedRows[i + 1].values[0] === values[0]
            && values[1] === 'w' && selectedRows[i + 1].values[1] === 'b') {
            const black = selectedRows[++i].values;
            if(values.length !== 32 || black.length !== 32
                || [...values.slice(2), ...black.slice(2)].some(flag => !['0', '1'].includes(flag)))
                throw new Error('Invalid paired BinProp flags.');
            if(focused && values[0].startsWith('H')) {
                const currentWhite = currentBins.find(item => item.values[1] === 'w')?.values;
                const currentBlack = currentBins.find(item => item.values[1] === 'b')?.values;
                if(currentWhite && currentBlack) {
                    const changes = pcfBinPropMotifs.flatMap((motif, index) =>
                        values[index + 2] !== currentWhite[index + 2] || black[index + 2] !== currentBlack[index + 2]
                            ? [`${motif.name}: ${values[index + 2]}/${black[index + 2]}`] : []);
                    if(changes.length <= 12) {
                        output.push(`${values[0]} BinProps (White / Black): same as C${changes.length ? ` except ${changes.join(', ')}` : ', with no changes'}.`);
                        previousKind = null;
                        continue;
                    }
                }
            }
            output.push(`${values[0]} BinProps (White / Black):`);
            output.push(...pcfBinPropMotifs.map((motif, index) => focused
                ? `${motif.name}: ${values[index + 2]}/${black[index + 2]}`
                : `${motif.name}: ${values[index + 2] === '1' ? 'true' : 'false'} / ${black[index + 2] === '1' ? 'true' : 'false'}`));
            previousKind = null;
            continue;
        }
        if(row.kind === 'BINS') {
            const [frame, color, ...flags] = values;
            if(!sideNames[color] || flags.length !== pcfBinPropMotifs.length || flags.some(flag => !['0', '1'].includes(flag)))
                throw new Error('Invalid BinProp flags.');
            output.push(`${frame} BinProps (${sideNames[color]} perspective):`);
            output.push(...pcfBinPropMotifs.map((motif, index) =>
                `${motif.name}: ${focused ? flags[index] : flags[index] === '1' ? 'true' : 'false'}`));
            previousKind = null;
            continue;
        }
        if(focused && row.kind === 'Z' && values[0] === 'C' && values[1] === `${values[2]}.p${values[3]}`) {
            if(previousKind !== 'Z-short') output.push(`Sampled current continuations: [line.ply]${separator}move${separator}effects`);
            output.push(`[${values[1]}]${separator}${display(values.slice(4))}`);
            previousKind = 'Z-short';
            continue;
        }
        if(focused && row.kind === 'M' && values[0] === 'C') {
            const group = values.slice(0, 5);
            output.push(`M comparison C: ${display(group.slice(1))}`);
            output.push(`metric${separator}color${separator}preferred range${separator}alternative range${separator}difference range${separator}bounded`);
            do {
                const current = selectedRows[i].values;
                const metric = comparisonMetrics[current[5]];
                if(!metric) throw new Error(`Unknown comparison metric ${current[5]}.`);
                const range = (min, max) => min === max ? min : `${min}..${max}`;
                output.push(display([metric, current[6], range(current[7], current[8]),
                    range(current[9], current[10]), range(current[11], current[12]), current[13]]));
                const next = selectedRows[i + 1];
                if(next?.kind !== 'M' || group.some((value, index) => next.values[index] !== value)) break;
                i++;
            } while(i < selectedRows.length);
            previousKind = null;
            continue;
        }
        if(row.kind === 'R') {
            if(focused && values[0].startsWith('H')) {
                if(renderedHistories.has(values[0])) continue;
                const historyPieces = selectedRows.filter(item => item.kind === 'R' && item.values[0] === values[0]);
                const coverage = selection.rows.find(item => item.kind === 'K' && item.values[0] === values[0]);
                if(coverage?.values[1] === 'history' && Number(coverage.values[2]) === historyPieces.length
                    && Number(coverage.values[3]) === historyPieces.length) {
                    const delta = compactHistoryRelations(currentPieces, historyPieces);
                    output.push(`${values[0]} pieces: same as current by identity except below. `
                        + `Identities absent in ${values[0]}: ${delta.absent.join(',') || 'none'}. `
                        + 'Each listed piece replaces its entire current record; new identities are added.');
                    output.push(`Pieces: ${['frame', 'side', 'piece', 'square', 'identity', 'enemy attackers', 'friendly defenders', 'enemy pieces attacked', 'friendly pieces defended'].join(separator)}`);
                    for(const changed of delta.changed) {
                        const [frame, square, piece, entity, ...relations] = changed.values;
                        if(!sideNames[piece[0]] || !pieceNames[piece[1]]) throw new Error(`Unknown PCF piece ${piece}.`);
                        output.push(display([frame, sideNames[piece[0]], pieceNames[piece[1]], square, entity, ...relations]));
                    }
                    renderedHistories.add(values[0]);
                    previousKind = null;
                    continue;
                }
            }
            const [frame, square, piece, entity, ...relations] = values;
            if(!sideNames[piece[0]] || !pieceNames[piece[1]]) throw new Error(`Unknown PCF piece ${piece}.`);
            if(focused && frame === 'C') {
                if(previousKind !== 'R-current') output.push(`Current pieces: [C.square]${separator}${['side', 'piece', 'identity', 'enemy attackers', 'friendly defenders', 'enemy pieces attacked', 'friendly pieces defended'].join(separator)}`);
                output.push(`${citation(row).trim()}${separator}${display([sideNames[piece[0]], pieceNames[piece[1]], entity, ...relations])}`);
                previousKind = 'R-current';
                continue;
            }
            if(previousKind !== 'R') output.push(`Pieces: ${['frame', 'side', 'piece', 'square', 'identity', 'enemy attackers', 'friendly defenders', 'enemy pieces attacked', 'friendly pieces defended'].join(separator)}`);
            output.push(`${citation(row)}${display([frame, sideNames[piece[0]], pieceNames[piece[1]], square, entity, ...relations])}`);
        } else {
            const columns = pcfColumns[row.kind];
            if(!columns || columns.length !== values.length) throw new Error(`Invalid evidence row ${row.kind}.`);
            if(focused && ['G', 'P'].includes(row.kind) && values[0].startsWith('H')) {
                const key = `${values[0]}:${row.kind}`;
                if(renderedHistoryGroups.has(key)) continue;
                const coverage = selection.rows.find(item => item.kind === 'K' && item.values[0] === values[0]);
                const group = row.kind === 'G' ? 'controls' : 'pawn';
                if(coverage?.values[1] === 'history' && coverage.values[4].split(',').includes(group)) {
                    const historyRows = selectedRows.filter(item => item.kind === row.kind && item.values[0] === values[0]);
                    const currentRows = selectedRows.filter(item => item.kind === row.kind && item.values[0] === 'C');
                    const delta = compactHistorySquares(currentRows, historyRows, row.kind);
                    output.push(`${values[0]} ${row.kind}: same as current by square except below. `
                        + `Squares with no ${row.kind} record in ${values[0]}: ${delta.absent.join(',') || 'none'}. `
                        + 'Each listed row replaces its entire current record; new squares are added.');
                    output.push(`${row.kind}: ${columns.join(separator)}`);
                    for(const changed of delta.changed) output.push(display(changed.values));
                    renderedHistoryGroups.add(key);
                    previousKind = null;
                    continue;
                }
            }
            const formatted = values.slice();
            if(focused && row.kind === 'BINLINE') formatted[5] = compactPredicateVector(values[5], true);
            if(focused && row.kind === 'BINCOMP') {
                for(const index of [8, 9, 10, 11]) formatted[index] = compactPredicateVector(values[index]);
                formatted[12] = compactPredicateVector(values[12], true);
            }
            if(focused && columns[0] === 'frame' && values[0] === 'C') {
                if(previousKind !== `${row.kind}-current`) output.push(`Current ${row.kind}: ${columns.slice(1).join(separator)}`);
                output.push(`${citation(row)}${display(formatted.slice(1))}`);
                previousKind = `${row.kind}-current`;
                continue;
            }
            if(previousKind !== row.kind) output.push(`${row.kind}: ${columns.join(separator)}`);
            output.push(`${citation(row)}${display(formatted)}`);
        }
        previousKind = row.kind;
    }
    return output.join('\n');
}

/** Replace only the PCF payload and its wire-format guidance in a saved message. */
export function renderReadableMessage(content, { format = 'readable', fen, priorMessages = [] } = {}) {
    if(typeof content !== 'string') throw new Error('Expected an evidence message string.');
    if(!['readable', 'compact', 'compact-lossless', 'compact-wire', 'spatial-ablation', 'question-focused'].includes(format)) throw new Error('Unknown evidence pilot format.');
    const marker = '\nC=now V=if H=past.';
    const wire = '\nPCF/3\n';
    const suffix = '\n\nPlayer question: ';
    const guidanceAt = content.indexOf(marker);
    const wireAt = content.indexOf(wire, guidanceAt);
    const questionAt = content.lastIndexOf(suffix);
    if(guidanceAt < 0 || wireAt < 0 || questionAt <= wireAt
        || content.indexOf('\n', guidanceAt + 1) !== wireAt
        || content.indexOf(wire, wireAt + wire.length) !== -1)
        throw new Error('Unexpected PCF evidence message envelope.');
    const pcf = content.slice(wireAt + 1, questionAt);
    const question = content.slice(questionAt + suffix.length);
    const rendered = format === 'compact-wire' ? renderCompactWireEvidence(pcf)
        : format === 'compact-lossless' ? renderLosslessCompactEvidence(pcf)
        : format === 'readable' ? renderReadableEvidence(pcf)
        : renderCompactEvidence(pcf, { profile: format === 'compact' ? 'full' : format, question, fen, priorMessages });
    return content.slice(0, guidanceAt) + '\n' + rendered + content.slice(questionAt);
}
