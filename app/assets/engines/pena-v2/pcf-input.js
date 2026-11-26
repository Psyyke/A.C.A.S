import { qwenAdapterPrompt } from './adapter-input.js';
import { inklingLayout, inklingLayoutName, inklingPrompt } from './inkling-layout.js';
import { groundedCoachingBudget } from './models.js';
import { parseQuestionMoves } from './questions.js';
import { buildPcfEvidence, selectPcfEvidence, encodePcfDraft, decodePcf, renderPcfTeacher } from './pcf-evidence.js';
import { pcfBinPropMotifs } from './binprop-full.js';
import { pastTopic } from './timeline.js';
import { englishBoard, englishBoardLayout } from './english-board.js';
import { historyNotes } from './thought-time.js';
import { englishStrategy } from './english-strategy.js';

const binKey = pcfBinPropMotifs.map(motif => motif.code).join(' ');
const legend = 'PCF/3: -=known empty; ?=unknown; ~=not applicable; 0/1=false/true. C=current; V=conditional; H=recorded history. '
    + 'In compact lists each item is preceded by !; the expanded view below shows the same items separated by commas. '
    + 'SAME in L or A reuses the complete G list for that piece; SAME in V reuses the named prior first-move relation record. '
    + 'F=id,scope,parent,move,turn,player,rights,ep,legalEP,halfmove,fullmove,check,mate,stalemate. '
    + 'K=frame coverage mode,totalPieces,includedPieces,completeGroups; full/history include all pieces, while delta includes all transition D rows and only affected R rows; history omits groups not listed. '
    + 'R=square,piece,entity,inEnemy,inFriend,outEnemy,outFriend; cite a current piece row as C.square. G=square,geometricControls; L=square,actualTurnLegalMoves. '
    + 'Trailing omitted relation cells are known empty, not unknown. '
    + 'U=legalMove,captureSquare,promotion,castle,check,mate; U lists every legal move with any of those special effects. '
    + 'C=square,actualTurnLegalCaptures,localExchangeGain in ordinary piece points; ~=not applicable. '
    + 'Local exchange assumes captures continue on one square and either side may stop; it is not a search result, legal continuation proof or positional evaluation. '
    + 'In complete C groups unlisted same-side pieces and kings are not applicable, and unlisted enemy pieces have no legal capture and zero gain. '
    + 'A=square,pawnConstrainedControls,ownKingFileOffset,ownKingRankOffset,enemyKingFileOffset,enemyKingRankOffset. '
    + 'P=square,passed,isolated,doubled,promotionSquare,promotionRanks,frontOccupant,pawnDefenders; cite current pawn row as C.pawn.square. '
    + 'J=pawn1,pawn2,fileOffset,rankOffset,sameColor,firstAttacksSecond,secondAttacksFirst. '
    + 'S=square,whiteControls,blackControls,whitePawnControls,blackPawnControls. X=slider,df,dr,empty,blocker. '
    + 'N=pinOrSkewer,slider,front,back,frontLegalMoves. '
    + 'B=color,pawnStructure,pawnPressure,defensiveDuties,kingZonePressure,advancedControl,advancedStopped,developedMinors,centralControls. '
    + `BINS=color and 30 binary predicates in this order: ${pcfBinPropMotifs.map(motif => `${motif.code}=${motif.name}`).join('; ')}. `
    + 'In compact BINS rows only true mnemonic codes are listed; unlisted codes are false. '
    + 'Historical R/G/P/B/BINS groups may start with BASE C: inherit that complete current group, DROP removes a named inherited row, explicit rows replace or add historical values, and ORDER specifies row order only. '
    + 'BCHANGE=beforeFrame,color,becameTrue,becameFalse,and current-minus-before deltas for pawnStructure,pawnPressure,defensiveDuties,kingZonePressure,advancedControl,developedMinors,centralControls. '
    + 'These labels identify heuristic threshold tests, not claims that captures are winning, threats are safe, outcomes forced or reasons proved. '
    + 'BINLINE=source,line,equal-ply horizon,perspective,and the 30 predicates at that sampled endpoint; identical continuation samples are deduplicated. '
    + 'BINCOMP=source,preferred,alternative,plies,perspective,positiveSamples,negativeSamples,positiveTrueCounts,negativeFalseCounts,fitCodes in the same order. '
    + 'Counts and fit codes have one digit per predicate; fit codes 0,1,2,3,4,5,6 mean 0,1/4,1/3,1/2,2/3,3/4,1. '
    + 'Support fit=min(positive true rate,negative false rate); code 6 is a strict contrast. These are heuristic fit statistics, not causal engine explanations or calibrated confidence. '
    + 'E=id,source,path,preferred,valueKind,rootSideValue,visits,prior,budget(nodes for lc0; depth for stockfish); '
    + 'Q=id,move,MaiaChoiceProbability,selfElo,opponentElo. '
    + 'REPLY=id,parentMove,replyMove,rank,preferred,childTurn,visits,prior,childSideQ,nodes,optionsAvailable,optionsOmitted,continuation. '
    + 'REPLY is a separate actual LC0 search after the parent move; Q is from that child side to move, not the root player. '
    + 'H=id,predicate,subject,values: explicit question-bound facts. absence values=color,type,actualOccupant; '
    + 'location=piece; defense=enemyAttackers,friendlyDefenders; mobility=applicable,legalMoves; controls=controlledSquares,occupiedTargets; '
    + 'pins=slider.front.back.pinType; blockers=df:dr:clearSquares:nearestBlocker; material=white,black,difference; '
    + 'status=turn,check,mate,stalemate,drawScope; king-geometry=blackKing,fileDistance,rankDistance,kingDistance,opposition,between,intervening,occupants; '
    + 'move-effects=move,moved,captured,materialDelta,check,mate; unavailable=reason. '
    + 'W=id,kind,source,preferredIds,alternativeIds,plies,whitePreferred,whiteAlternative,blackPreferred,blackAlternative. '
    + 'W witnesses are relations shared by every sampled line in each group; empty means no shared witness, not no individual witnesses. '
    + 'Legacy contrast cards are omitted if their rounded threshold disagrees with the exact upstream predicate. '
    + 'Z=id,line,ply,move,effects on sampled conditional continuations. '
    + 'Effect prefixes action,check,mate,capture,promotion,attack,defend,lost,ray,pinadd,pinremove,center name exactly those scoped changes; they do not assert safety or forced play. '
    + 'MORE repeats the immediately preceding attack, defend, center or ray source within the same Z record. '
    + 'CHECK and MATE following an action SAN denote its + and # suffixes. '
    + 'V=id,square,piece,entity,enemyTargets,enemyAttackers,friendlyDefenders,next,check,mate,stalemate,legalMoves,legalCaptures: complete moved-piece relations after the first conditional move only, not the live board. '
    + 'Y=occurrences,threefoldThreshold,halfmoves,fiftyMoveThreshold,priorPositions,missingEarlierHistory,LC0priorHorizon. '
    + 'M=source,preferredIds,alternativeIds,plies,metric,color,preferredMin,preferredMax,alternativeMin,alternativeMax,differenceMin,differenceMax,bounded. '
    + 'M metrics ps/pawnStructure pp/pawnPressure dd/defensiveDuties kz/kingZonePressure ac/advancedControl dm/developedMinors cc/centralControls. '
    + 'T=parent,move,actor,from,to,captureSquare,capturedEntity,promotion,movedPieces(entity.from.to); D=change,relation,actor,from,to,target. '
    + 'T/D in C describe the actually played last move from the mandatory previous historical frame; T/D in V remain conditional. '
    + 'O=historySupplied,historyComputed,historyIncluded,historyComplete,conditionalAvailable,conditionalIncluded,sourceReferencesAvailable,sourceReferencesOmitted,requestedHistoryMoves,matchedHistoryMoves,requestedHistoryFrames,requestedHistoryFramesIncluded,sourceConditionalFrames,sharedConditionalFrames,plyFactsAvailable,plyFactsIncluded,comparisonGroupsAvailable,comparisonGroupsIncluded,replyParentsSearched,replyOptionsAvailable,replyOptionsIncluded,binaryComparisonsAvailable,binaryComparisonsIncluded. '
    + 'Identical conditional paths shared across sources use one frame; source-specific line and score references remain distinct. '
    + 'Entities persist across known replay; historical prefix may be incomplete. Geometric relations include pinned pieces and do not prove legal/safe captures. '
    + 'B/M are scoped heuristics, not engine reasons; bounded advanced control is a threshold-stopped subtotal. '
    + 'E values are source-specific; Q is human-choice likelihood, not strength or winning probability. V lines are sampled, not played or forced. '
    + 'In compact S rows four digits represent counts 0-9; two digits mean both pawn counts are zero; WIDE gives four separate counts when any exceeds 9. '
    + 'A king offsets and J rank offsets use fixed two-digit values 00-14 for -7..7; J file offset is one digit 0 or 1. '
    + 'Unlisted squares in a complete S group have four known zero control counts. '
    + 'Unlisted slider directions in a complete X group contain no on-board empty squares or blocker. '
    + 'P/J flag characters are individual booleans, and M ranges are a single value or min:max.';

function historyIndexesFor(question, history) {
    const indexes = new Set();
    for(let index = Math.max(0, history.length - 2); index < history.length; index++) indexes.add(index);
    const requests = [...question.matchAll(/\bmove\s+(\d{1,3})(?:\s*(\.{1,3}|black|white))?|\b(\d{1,3})(\.{1,3})/gi)]
        .map(match => ({ number: Number(match[1] || match[3]), side: (match[2] || match[4] || '').toLowerCase() }));
    if(!requests.length && /\b(?:last|previous)\s+move\b/i.test(question)) requests.push({ last: true });
    const requiredIndexes = new Set();
    let matchedMoves = 0;
    for(const request of requests) {
        let matched = false;
        for(const [index, fen] of history.entries()) {
            const fields = fen.split(' '), side = request.side === '...' || request.side === 'black' ? 'b'
                : request.side === '.' || request.side === 'white' ? 'w' : null;
            if(request.last ? index === history.length - 1 : Number(fields[5]) === request.number && (!side || fields[1] === side)) {
                matched = true; requiredIndexes.add(index);
                if(!request.last && index + 1 < history.length) requiredIndexes.add(index + 1);
            }
        }
        if(matched) matchedMoves++;
    }
    for(const index of requiredIndexes) indexes.add(index);
    return { indexes: [...indexes].sort((a, b) => a - b),
        request: { requestedMoves: requests.length, matchedMoves, requiredIndexes: [...requiredIndexes].sort((a, b) => a - b) } };
}

// The original notes, engine lines and question binding, without the source board encoding.
function evidenceHeader(input) {
    const messages = input.messages, last = messages.at(-1), suffix = `\n\nPlayer question: ${input.question}`;
    if(last?.role !== 'user' || !last.content.endsWith(suffix)) throw new Error('Unexpected PCF source input envelope.');
    if(input.legacyReferenceIds.some(id => /^C\.[a-h][1-8]$/.test(id)))
        throw new Error('PCF cannot replace an original compatibility definition with the same current-piece citation.');
    const text = last.content.slice(0, -suffix.length), marker = '\nSAVED V1:';
    const at = text.indexOf(marker), prefix = at < 0 ? text : text.slice(0, at);
    let legacy = '';
    if(at >= 0) {
        const tail = text.slice(at);
        const end = tail.search(/\n(?:\[S\.[LA]\d+\] FIRST |ENGINES:)/);
        if(end < 0) throw new Error('PCF could not isolate the original compatibility evidence.');
        legacy = tail.slice(0, end);
    }
    const definitions = new Set([...legacy.matchAll(/^\[([^\]\n]+)\]/gm)].map(match => match[1]));
    if(input.legacyReferenceIds.some(id => !definitions.has(id))) throw new Error('PCF is missing an original compatibility citation.');
    const binding = prefix.split('\n').filter(line => /^(?:CURRENT question-subject|Question subject)/.test(line)).join('\n');
    return { header: `Verified evidence:${legacy}${binding ? `\n${binding}` : ''}`, suffix };
}

const withContent = (messages, content) => {
    const result = messages.map((message, index) => index === messages.length - 1 ? { ...message, content } : { ...message });
    if(result.some(message => /(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+/.test(message.content)))
        throw new Error('PCF model messages cannot contain a raw FEN board; use the recorded board and a normal question.');
    return result;
};

function messageWithPcf(input, pcf, { teacher = false } = {}) {
    const { header, suffix } = evidenceHeader(input);
    const expanded = teacher ? renderPcfTeacher(pcf) : pcf;
    const guidance = teacher ? legend : `C=now V=if H=past. Attacks!=safe PV!=forced O=omitted BINS absent=0.${pcf.includes('\n@BCHANGE ') ? ' BASE C inherits current group; DROP removes; rows override past values. T/D C=last played. BCHANGE=now-minus-before.' : ''}${pcf.includes('\n@BINLINE ') ? ` BIN=${binKey}.` : ''}`;
    return withContent(input.messages, `${header}\n${guidance}\n${expanded}${suffix}`);
}

/** The same notes and engine lines as PCF, with the board written as plain English sentences per piece. */
export function englishCoachingInput(input, { playerColor, history = [], inkling = false, extraNotes = '', strategy = false } = {}) {
    const { header, suffix } = evidenceHeader(input);
    const root = input.frames.find(frame => frame.id === 'root');
    const board = englishBoard(root.fen, { playerColor, previousFen: history.at(-1) || null });
    const past = historyNotes(input.question, history, root.fen);
    const notes = [strategy ? englishStrategy(root.fen) : '', past, extraNotes].filter(Boolean).join('\n');
    const flat = withContent(input.messages, `${header}\nC=now V=if H=past. Board facts below are exact.\n${board}${notes ? `\n${notes}` : ''}${suffix}`);
    const defined = new Set(input.legacyReferenceIds);
    return Object.freeze({ ...input, schema: 'pena-v2-english-coaching-input/1', packing: inkling ? `${englishBoardLayout}+${inklingLayoutName}` : englishBoardLayout,
        messages: Object.freeze((inkling ? inklingLayout(flat) : flat).map(Object.freeze)),
        references: Object.freeze(input.references.filter(ref => defined.has(ref.id))),
        pcf: Object.freeze({ promptTokens: null }) });
}

/** Exact token-budgeted PCF, preserving original reference definitions. */
export function pcfCoachingInput(input, { playerColor, history = [], tokenCount, fixedSelection = null, replyEvidence = null,
    serializePrompt = null, plain = false, inkling = false, include = {},
    maxPromptTokens = groundedCoachingBudget.contextTokens - groundedCoachingBudget.maxNewTokens - 1 } = {}) {
    serializePrompt ??= inkling ? inklingPrompt : qwenAdapterPrompt;
    if(typeof tokenCount !== 'function' || typeof serializePrompt !== 'function' || !Number.isSafeInteger(maxPromptTokens) || maxPromptTokens < 1)
        throw new Error('PCF requires the actual model tokenizer and a positive prompt budget.');
    const historySelection = historyIndexesFor(input.question, history);
    if(fixedSelection !== null) {
        if(!Array.isArray(fixedSelection.conditionalFrames) || !Array.isArray(fixedSelection.historicalFrames)
            || !Array.isArray(fixedSelection.plyRefs) || !Array.isArray(fixedSelection.comparisonKeys) || !Array.isArray(fixedSelection.replyRefs)
            || fixedSelection.historicalFrames.some(id => !/^H[1-9]\d*$/.test(id))) throw new Error('Invalid fixed PCF frame selection.');
        for(const id of fixedSelection.historicalFrames) historySelection.indexes.push(Number(id.slice(1)) - 1);
        historySelection.indexes = [...new Set(historySelection.indexes)].sort((a, b) => a - b);
    }
    const bank = buildPcfEvidence(input, { playerColor, history, historyIndexes: historySelection.indexes,
        historyRequest: historySelection.request, replyEvidence });
    const current = bank.frames.find(frame => frame.id === 'C');
    const rootFen = input.frames.find(frame => frame.id === 'root').fen;
    const requestedMoves = new Set(parseQuestionMoves(input.question, rootFen).filter(item => !item.opponent)
        .map(item => item.move.from + item.move.to + (item.move.promotion || '')));
    const conditionals = bank.frames.filter(frame => frame.kind === 'conditional');
    const immediate = conditionals.filter(frame => frame.parent === 'C').sort((a, b) => {
        const moveA = a.rows.find(row => row.kind === 'F').values[3], moveB = b.rows.find(row => row.kind === 'F').values[3];
        return Number(requestedMoves.has(moveB)) - Number(requestedMoves.has(moveA));
    });
    const deeper = conditionals.filter(frame => frame.parent !== 'C');
    const historyFrames = [...bank.historyFrames].sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1)));
    const historicalQuestion = pastTopic(input.question);
    const requiredHistory = new Set(historySelection.request.requiredIndexes.map(index => `H${index + 1}`));
    if(bank.previousFrame) requiredHistory.add(bank.previousFrame);
    const optionalHistory = historyFrames.filter(frame => !requiredHistory.has(frame.id));
    const wantsLc0 = /\b(?:lc0|leela)\b/i.test(input.question);
    const plyRows = [...bank.plyRows].sort((a, b) => Number(wantsLc0 && b.values[1].startsWith('LC'))
        - Number(wantsLc0 && a.values[1].startsWith('LC')) || Number(a.values[3]) - Number(b.values[3]));
    const binaryComparisons = bank.comparisonGroups.filter(group => group.kind === 'binprop').map(group => ({ kind: 'comparison', key: group.key }));
    const metricComparisons = bank.comparisonGroups.filter(group => group.kind !== 'binprop').map(group => ({ kind: 'comparison', key: group.key }));
    const firstPly = plyRows.filter(row => row.values[3] === '1');
    const principalPly = plyRows.filter(row => ['L1', 'LC1'].includes(row.values[2]) && ['2', '3'].includes(row.values[3]));
    const primaryLine = wantsLc0 ? 'LC1' : 'L1';
    const primaryPly = plyRows.filter(row => row.values[2] === primaryLine && Number(row.values[3]) <= 3);
    const primaryIds = new Set(primaryPly.map(row => row.values[1]));
    const secondaryFirst = firstPly.filter(row => !primaryIds.has(row.values[1]));
    const otherPrincipal = principalPly.filter(row => !primaryIds.has(row.values[1]));
    const principalIds = new Set([...primaryPly, ...otherPrincipal].map(row => row.values[1]));
    const laterPly = plyRows.filter(row => row.values[3] !== '1' && !principalIds.has(row.values[1]));
    const askedEnginePly = wantsLc0 ? laterPly.filter(row => row.values[1].startsWith('LC')) : [];
    const otherLaterPly = laterPly.filter(row => !askedEnginePly.includes(row));
    const replyRows = [...bank.replyRows].sort((a, b) => Number(b.values[5]) - Number(a.values[5]) || Number(a.values[4]) - Number(b.values[4]));
    // Optional evidence the player switched off. The current board and previous position always stay.
    const switchFor = { Z: 'lines', REPLY: 'replies', comparison: 'comparisons', conditional: 'whatIf', history: 'history' };
    const allowed = frame => include[switchFor[frame.kind]] !== false;
    const candidates = (historicalQuestion ? [...optionalHistory, ...primaryPly, ...replyRows, ...secondaryFirst, ...otherPrincipal,
        ...askedEnginePly, ...binaryComparisons, ...otherLaterPly, ...metricComparisons, ...immediate, ...deeper]
        : [...primaryPly, ...replyRows, ...secondaryFirst, ...otherPrincipal, ...askedEnginePly, ...binaryComparisons,
            ...otherLaterPly, ...metricComparisons, ...immediate, ...optionalHistory, ...deeper]).filter(allowed);
    let selectedConditional = fixedSelection ? [...fixedSelection.conditionalFrames] : [];
    if(fixedSelection && bank.previousFrame && !fixedSelection.historicalFrames.includes(bank.previousFrame))
        throw new Error('Fixed PCF selection must include the immediately previous position.');
    let selectedHistory = fixedSelection ? [...fixedSelection.historicalFrames] : bank.previousFrame ? [bank.previousFrame] : [];
    let selectedPly = fixedSelection ? [...fixedSelection.plyRefs] : [];
    let selectedComparisons = fixedSelection ? [...fixedSelection.comparisonKeys] : [];
    let selectedReplies = fixedSelection ? [...fixedSelection.replyRefs] : [];
    const assemble = (conditionalFrames, historicalFrames, plyRefs, comparisonKeys, replyRefs) => {
        const selection = selectPcfEvidence(bank, { conditionalFrames, historicalFrames, plyRefs, comparisonKeys, replyRefs });
        const text = encodePcfDraft(selection, { plain: plain || inkling }), flat = messageWithPcf(input, text);
        const messages = inkling ? inklingLayout(flat) : flat;
        const promptTokens = tokenCount(serializePrompt(messages));
        if(!Number.isSafeInteger(promptTokens) || promptTokens < 0) throw new Error('The PCF tokenizer returned an invalid token count.');
        return { selection, text, messages, promptTokens };
    };
    let chosen = assemble(selectedConditional, selectedHistory, selectedPly, selectedComparisons, selectedReplies);
    if(chosen.promptTokens > maxPromptTokens)
        throw new Error(`Mandatory PCF current-board evidence needs ${chosen.promptTokens} prompt tokens; limit ${maxPromptTokens}. This includes the previous position when recorded. No evidence was silently truncated.`);
    if(!fixedSelection && requiredHistory.size && include.history !== false) {
        const history = historyFrames.filter(frame => requiredHistory.has(frame.id)).map(frame => frame.id);
        const requested = assemble(selectedConditional, history, selectedPly, selectedComparisons, selectedReplies);
        if(requested.promptTokens <= maxPromptTokens) { selectedHistory = history; chosen = requested; }
    }
    for(const frame of fixedSelection ? [] : candidates) {
        if(frame.kind === 'conditional' && frame.parent !== current.id && !selectedConditional.includes(frame.parent)) continue;
        const conditional = frame.kind === 'conditional' ? [...selectedConditional, frame.id] : selectedConditional;
        const historical = frame.kind === 'history' ? [...new Set([...selectedHistory, frame.id])] : selectedHistory;
        const ply = frame.kind === 'Z' ? [...selectedPly, frame.values[1]] : selectedPly;
        const compared = frame.kind === 'comparison' ? [...selectedComparisons, frame.key] : selectedComparisons;
        const replies = frame.kind === 'REPLY' ? [...selectedReplies, frame.values[1]] : selectedReplies;
        const candidate = assemble(conditional, historical, ply, compared, replies);
        if(candidate.promptTokens <= maxPromptTokens) {
            selectedConditional = conditional; selectedHistory = historical; selectedPly = ply; selectedComparisons = compared; selectedReplies = replies; chosen = candidate;
        }
    }
    if(JSON.stringify(decodePcf(chosen.text)) !== JSON.stringify(chosen.selection))
        throw new Error('Final PCF serialization does not round-trip to its selected evidence.');
    const teacherMessages = messageWithPcf(input, chosen.text, { teacher: true });
    const defined = new Set(input.legacyReferenceIds);
    for(const row of chosen.selection.rows) {
        if(row.values[0] !== 'C') continue;
        if(row.kind === 'F') defined.add('C.status');
        if(row.kind === 'I') defined.add('C.material');
        if(row.kind === 'Y') defined.add('C.history');
        if(row.kind === 'R') defined.add(`C.${row.values[1]}`);
        if(row.kind === 'P') defined.add(`C.pawn.${row.values[1]}`);
        if(['E', 'Q', 'H', 'W', 'Z', 'V', 'REPLY'].includes(row.kind)) defined.add(row.values[1]);
    }
    return Object.freeze({ ...input, schema: 'pena-v2-pcf-coaching-input/3', packing: inkling ? `pena-pcf/3p+${inklingLayoutName}` : plain ? 'pena-pcf/3p' : 'pena-pcf/3',
        messages: Object.freeze(chosen.messages.map(Object.freeze)), teacherMessages: Object.freeze(teacherMessages.map(Object.freeze)),
        references: Object.freeze([...input.references, ...bank.replyReferences].filter(ref => defined.has(ref.id))),
        pcf: Object.freeze({ text: chosen.text, selection: chosen.selection,
            selectedFrames: Object.freeze({ conditionalFrames: Object.freeze(selectedConditional), historicalFrames: Object.freeze(selectedHistory),
                plyRefs: Object.freeze(selectedPly), comparisonKeys: Object.freeze(selectedComparisons), replyRefs: Object.freeze(selectedReplies) }),
            promptTokens: chosen.promptTokens, maxPromptTokens }),
        limitation: 'Geometric features are not capture-safety proofs; selected lines are not forced. The base model has not learned PCF; adaptation and full-corpus qualification remain independent gates.' });
}
