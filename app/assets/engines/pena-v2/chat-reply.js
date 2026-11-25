import { Chess } from '../libraries/chessjs/chess.js';
import { checkReply, displayText } from './conversation.js';
import { checkSentence } from './grounding.js';
import { variationFrames, moveMentions } from './teacher.js';
import { chatPrompt, isMoveEvent } from './chat.js';
import { TeachingContext } from './teaching-context.js';

const types = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' };
const opposite = color => color === 'w' ? 'b' : 'w';
const bare = san => san.replace(/[+#]/g, '');

function captureLedger(line) {
    const counts = { w: {}, b: {} }, events = [];
    for(const frame of line) {
        const board = new Chess(frame.beforeFen);
        const move = board.move({ from: frame.from, to: frame.to, promotion: frame.promotion || 'q' });
        if(!move || move.promotion) return null;
        if(move.captured) {
            counts[move.color][move.captured] = (counts[move.color][move.captured] || 0) + 1;
            const piece = Object.keys(types).find(name => types[name] === move.captured);
            events.push(`${move.color === 'w' ? 'White' : 'Black'} captures ${move.color === 'w' ? 'Black' : 'White'} ${piece} with ${move.san}`);
        }
    }
    return { counts, events };
}

function exchangeIssue(sentence, context, playerColor) {
    const claims = [...sentence.text.matchAll(/\b(you(?:'ve| have)?|white(?: has)?|black(?: has)?)\s+(?:just\s+)?(trade[ds]?|won|wins?)\s+([^.!?]+?)\s+for\s+([^.!?]+)/gi)];
    for(const match of sentence.text.matchAll(/\b(you(?:'ve| have)?|white(?: has)?|black(?: has)?)\s+(?:just\s+)?(taken|captured|won)\s+([^.!?]+)/gi))
        if(!/\bfor\b/i.test(match[3])) claims.push([match[0], match[1], 'won', match[3], '']);
    for(const match of sentence.text.matchAll(/\b(?:that|this|it)\s+costs?\s+(you|white|black)\s+([^.!?]+?)\s+for\s+([^.!?]+)/gi))
        claims.push([match[0], match[1], 'traded', match[2], match[3]]);
    for(const match of sentence.text.matchAll(/\b(you|white|black)\s+avoid(?:s)?\s+giving up\s+([^.!?]+?)\s+for\s+([^.!?]+)/gi))
        claims.push([match[0], match[1], 'traded', match[2], match[3]]);
    for(const match of sentence.text.matchAll(/\b(you(?:'ve| have)?|white(?: has)?|black(?: has)?)\s+(?:given up|gave up|sacrificed|lost)\s+([^.!?]+?)\s+for\s+([^.!?]+)/gi))
        claims.push([match[0], match[1], 'traded', match[2], match[3]]);
    if(!claims.length) return '';
    const frames = variationFrames(context + sentence.text, sentence.analysisFen);
    const current = frames.filter(frame => frame.branch === frames.at(-1)?.branch && !frame.recap);
    const lines = current.length ? [current] : sentence.citations.flatMap(({ fact }) =>
        fact.alternative && sentence.analysisFen === fact.alternative.fen ? [fact.alternative.line] : fact.line?.length ? [fact.line] : []);
    const ledgers = lines.map(captureLedger).filter(Boolean).map(value => value.counts);
    const counts = text => {
        const result = {};
        for(const match of text.matchAll(/\b(?:(a|an|one|two|three|[1-8])\s+)?(pawn|knight|bishop|rook|queen)s?\b/gi)) {
            const count = { two: 2, three: 3 }[match[1]?.toLowerCase()] || Number(match[1]) || 1;
            const type = types[match[2].toLowerCase()];
            result[type] = (result[type] || 0) + count;
        }
        return result;
    };
    for(const claim of claims) {
        const color = /^you/i.test(claim[1]) ? playerColor : claim[1][0].toLowerCase();
        if(!color) continue;
        const first = counts(claim[3]), second = counts(claim[4]);
        if(!Object.keys(first).length) continue;
        const wins = /^win|^won/i.test(claim[2]);
        const gains = wins ? first : second, losses = wins ? second : first;
        if(!ledgers.some(value => Object.entries(gains).every(([type, count]) => (value[color][type] || 0) >= count)
            && Object.entries(losses).every(([type, count]) => (value[opposite(color)][type] || 0) >= count)))
            return 'The claimed material exchange does not occur in the legal continuation. Omit it or describe the actual captures.';
    }
    return '';
}

function claimIssue(sentence, context, sheet, player = '') {
    if(/\b(?:[a-h][1-8][- ])?(?:rook|knight)(?:'s|s')\s+diagonals?\b/i.test(sentence.text))
        return 'Rooks move on ranks and files, bishops on diagonals; do not invent a diagonal for a rook or another non-diagonal piece.';
    const legal = new Set(new Chess(sheet.fen).moves().map(bare));
    const played = sheet.byId?.M?.line?.[0]?.san;
    if(played && (isMoveEvent(player) || /\b(?:played|was|last move)\b/i.test(player)
        || /\bwas(?:n't| not)?\s+(?:a\s+)?(?:legal|illegal)\b/i.test(sentence.text))) legal.add(bare(played));
    for(const mention of moveMentions(sentence.text)) {
        if(typeof mention.input !== 'string' || !legal.has(bare(mention.input))) continue;
        if(/^\s+(?:(?:is|was)(?:n't| not)\s+(?:a\s+)?legal|(?:is|was)\s+illegal)\b/i.test(sentence.text.slice(mention.end)))
            return `${mention.input} is a verified legal move${played && bare(played) === bare(mention.input) ? ' on the previous board, already played by the player' : ''}. Do not call it illegal.`;
    }
    const color = sheet.playerColor;
    if(color) {
        const names = { w: 'White', b: 'Black' };
        const owned = sentence.text.replace(/\b(your|their|opponent's)\s+(?=(?:pawn|knight|bishop|rook|queen|king)\s+(?:on|at)\s+[a-h][1-8])/gi,
            (_, owner) => names[owner.toLowerCase() === 'your' ? color : opposite(color)] + ' ');
        if(owned !== sentence.text) {
            const result = checkSentence(owned, sentence.analysisFen, { context, rootColor: sheet.playerColor });
            if(result.status === 'contradicted') return result.reason;
        }
    }
    if(/\b(?:defended|protected|guarded|supported|attacked) by\b/i.test(sentence.text)) {
        const offset = context.length;
        const model = new TeachingContext(context + sentence.text, sentence.analysisFen, { rootColor: color });
        for(const relation of sentence.text.matchAll(/\b(?:is|are|remains?|stays?)\s+(not\s+)?(?:well\s+)?(defended|protected|guarded|supported|attacked) by\s+/gi)) {
            const target = model.results.findLast(result => result.end <= offset + relation.index && result.entities.length === 1);
            const source = model.results.find(result => result.index >= offset + relation.index + relation[0].length);
            if(!target || !source || !/^\s*$/.test(model.text.slice(offset + relation.index + relation[0].length, source.index))) continue;
            if(target.index < offset && !/^\s*(?:it|that piece)\s*$/i.test(sentence.text.slice(0, relation.index))) continue;
            const victim = target.entities[0];
            const expectedSide = relation[2].toLowerCase() === 'attacked' ? opposite(victim.color) : victim.color;
            const resolved = model.resolve({ ...source, owner: source.owner || (expectedSide === 'w' ? 'white' : 'black') });
            if(resolved.status !== 'resolved' || resolved.entities.length !== 1) continue;
            const defender = resolved.entities[0];
            const holds = defender.color === expectedSide
                && model.facts(defender.fen).attackers(victim.square, defender.color).includes(defender.square);
            if(holds === Boolean(relation[1])) return `The stated ${relation[2].toLowerCase()}-by relation from ${defender.square} to ${victim.square} contradicts the discussed board.`;
        }
    }
    for(const { fact } of sentence.citations) {
        if(fact.kind !== 'asked move' || !fact.line?.length) continue;
        const move = fact.line[0].san;
        if(!sentence.text.startsWith(move + ' ') && !sentence.text.startsWith(bare(move) + ' ')) continue;
        const expected = fact.text.match(/is rated ([^(,]+)/)?.[1].trim().toLowerCase();
        const bad = /\b(?:mistake|blunder|catastrophic)\b/;
        const good = /\b(?:best|excellent|good)\b/;
        const verdict = sentence.text.slice(move.length).split(/[,.;]/)[0].toLowerCase();
        if(expected && (bad.test(expected) && /\b(?:fine|playable|good|excellent|less precise)\b/.test(verdict)
            || good.test(expected) && bad.test(verdict))) return `The supplied move rating is ${expected}, not the rating stated here.`;
    }
    const moves = moveMentions(sentence.text);
    let count = moves.length;
    for(let index = 1; index < moves.length; index++) {
        if(/^[\s,]*(?:then\s+)?$/i.test(sentence.text.slice(moves[index - 1].end, moves[index].index))) continue;
        count = index;
        break;
    }
    const consecutive = moves.slice(0, count);
    const continuation = sentence.text.slice(0, consecutive.at(-1)?.end || 0);
    const historicalComparison = /\b(?:was|would have been)\s+(?:the\s+)?(?:more precise|better|best|engine choice)\b/i.test(sentence.text);
    if(/^After\b/.test(sentence.text) && consecutive.length >= 2 && !historicalComparison
        && variationFrames(continuation, sentence.analysisFen).incomplete) {
        const starts = sentence.citations.flatMap(({ fact }) => [...(fact.line || []), ...(fact.alternative?.line || [])]);
        // Models often omit the first move of a cited line. A legal suffix is fine; a missing reply is not.
        const legalSuffix = starts.some(frame => {
            const replay = variationFrames(continuation, frame.beforeFen);
            return !replay.incomplete && replay.length >= 2;
        });
        if(!legalSuffix) return 'The stated continuation cannot be legally replayed. Use the supplied move order or omit the variation.';
    }
    return exchangeIssue(sentence, context, color);
}

export function assessChatReply(raw, sheet, options = {}) {
    const initial = checkReply(raw, sheet, options);
    const kept = [], removed = [...initial.removed];
    let context = '';
    for(const sentence of initial.sentences) {
        const reason = claimIssue(sentence, context, sheet, options.player);
        if(reason) removed.push({ sentence: sentence.text, reason });
        else {
            const concise = conciseReply(sentence, options.player);
            if(concise.reason) removed.push({ sentence: sentence.text, reason: concise.reason });
            if(concise.tagged) { kept.push(concise.tagged); context += displayText(concise.tagged) + ' '; }
        }
    }

    function conciseReply(sentence, player = '') {
        const generalAdvice = /^\(.*\)$/.test(player) || /\b(?:what (?:should|can|do) (?:i|we)|what (?:to (?:do|play)|now)|best (?:move|thing)|any (?:advice|hints?|tips?)|suggest (?:a )?move)\b/i.test(player);
        const wantsLine = /\b(?:line|variation|continuation|calculate|after|then|reply|respond|if)\b/i.test(player);
        if(generalAdvice && !wantsLine && (/\b(?:line|variation) (?:continues|goes)|\bcontinue with\b/i.test(sentence.text)
            || moveMentions(sentence.text).length > 2 || /^(?:all|both)\b[^.!?]*\b(?:playable|fine|good)\b/i.test(sentence.text)))
            return { tagged: '', reason: 'Give one immediate recommendation and its reason, not an unsolicited continuation or list of moves.' };
        const wantsEval = /\b(?:eval\w*|equal|better|worse|winning|losing|ahead|behind|advantage|material|score|how (?:am i|are we)|(?:how|is) [^.!?]*\bposition|how (?:bad|good) is (?:it|this)|assess\w*)\b/i.test(player);
        if(!player || wantsEval) return { tagged: sentence.tagged };
        const personalVerdict = /I(?:['\u2019]d| would)?\s+(?:rate|assess|evaluate|call|consider|judge)\s+(?:it|this(?: position)?|the position)\s+(?:as\s+)?(?:(?:about|roughly|approximately|pretty|still|now|completely|perfectly)\s+)*(?:equal|balanced)\b/i;
        const personalTail = new RegExp(',?\\s+(?:and\\s+)?' + personalVerdict.source
            + '(?=\\s*(?:\\[[^\\]]+\\]\\s*)*[.!?])', 'i');
        const withoutPersonalTail = sentence.tagged.replace(personalTail, '');
        if(withoutPersonalTail !== sentence.tagged) return { tagged: withoutPersonalTail };
        if(new RegExp('^' + personalVerdict.source + '(?:[.!?]|$)', 'i').test(sentence.text))
            return { tagged: '', reason: 'Skip the generic position verdict unless the player asks for an evaluation; answer the actual question instead.' };
        const tail = /,?\s+(?:and |with )(?:(?:the )?position (?:(?:is|remains|stays|still) )?(?:still )?|an? )(?:about |roughly |slightly )?(?:equal|balanced)(?: position)?(?: (?:now|as well))?(?=\s*(?:\[[^\]]+\]\s*)*[.!?])/i;
        const tagged = sentence.tagged.replace(tail, '');
        if(tagged !== sentence.tagged) return { tagged };
        if(/^(?:(?:the |your )?position (?:is|remains|stays)|(?:you(?:'re| are)|we(?:'re| are))|(?:all|both)\b[^.!?]*\bposition)\s+(?:still |now |about |roughly |slightly )*(?:equal|balanced)\b/i.test(sentence.text)
            || /^(?:all|both)\b[^.!?]*\bposition (?:is|remains|stays)\s+(?:about |roughly )?(?:equal|balanced)\b/i.test(sentence.text))
            return { tagged: '', reason: 'Skip the generic position verdict unless the player asks for an evaluation; explain the immediate idea instead.' };
        return { tagged };
    }
    const checked = checkReply(kept.join(' '), sheet, options);
    checked.removed = [...removed, ...checked.removed];
    return checked;
}

export function repairChatPrompt(prepared, issues, { tokenCount, context = 2304, maxTokens = 240 } = {}) {
    const corrections = issues.slice(0, 4).map(issue => `- ${issue.reason}: ${issue.sentence.slice(0, 180)}`).join('\n');
    const captures = prepared.sheet.facts.flatMap(fact => {
        const ledger = fact.line?.length ? captureLedger(fact.line) : null;
        return ledger?.events.length ? [`[${fact.id}] capture audit: ${ledger.events.join('; ')}.`] : [];
    }).slice(0, 3).join('\n');
    const notes = prepared.sheet.text + '\n\nReply correction, not new board facts:\n' + corrections
        + (captures ? '\nLegally replayed captures, do not add other captured pieces:\n' + captures : '')
        + '\nAnswer the player\'s latest question directly in one or two sentences. Use the supplied notes and cite their tags. '
        + 'Do not repeat an unsupported claim or invent an exchange. Leave uncertain details out.';
    let history = prepared.history.slice(-4);
    let prompt = chatPrompt(notes, history, prepared.player);
    while(history.length && tokenCount(prompt) + maxTokens > context) {
        history = history.slice(1);
        prompt = chatPrompt(notes, history, prepared.player);
    }

    return tokenCount(prompt) + maxTokens > context ? null : prompt;
}

function missingExplanation(text, question) {
    return /\b(?:why|purpose|point|important|importance)\b/i.test(question || '')
        && !/\b(?:because|so that|so (?:you|it|your)|to (?:attack|defend|protect|control|open|prevent|stop|develop|create|keep|gain)|open\w*|allow\w*|giv\w*|prevent\w*|stop\w*|remov\w*|protect\w*|guard\w*|control\w*|develop\w*|attack\w*|block\w*|support\w*|restrict\w*)\b/i.test(text)
        && !/\b(?:don't know|cannot tell|can't tell|uncertain|inconclusive|not enough)\b/i.test(text);
}

// Rejected drafts are never streamed or remembered. Cancellation is distinct from the local deadline.
export async function answerChat(runtime, fen, boardHistory, prepared, { signal, budgetMs = 8000, maxAttempts = 3, maxTokens = 240 } = {}) {
    if(!(budgetMs > 0) || !Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('Invalid Pena reply budget.');
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal?.throwIfAborted();
    signal?.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(() => controller.abort(new DOMException('Pena reply time budget reached.', 'TimeoutError')), budgetMs);
    const options = { record: prepared.record, player: prepared.player, history: prepared.history };
    const attempts = [];
    let prompt = prepared.prompt, best = null;
    try {
        for(let index = 0; index < maxAttempts && prompt; index++) {
            let answer;
            try {
                answer = await runtime.chat(fen, boardHistory, prompt, { signal: controller.signal, maxTokens,
                    temperature: index === 0 ? 0 : 0.35, topK: 20, topP: 0.9 });
                controller.signal.throwIfAborted();
            } catch(error) {
                signal?.throwIfAborted();
                if(controller.signal.aborted && controller.signal.reason?.name === 'TimeoutError') break;
                throw error;
            }
            const checked = assessChatReply(answer.raw, prepared.sheet, options);
            const issues = [...checked.removed];
            const incomplete = checked.text.trim() && missingExplanation(checked.text, prepared.player);
            if(incomplete) issues.push({ sentence: checked.text,
                reason: 'The player asked why. Explain the practical purpose from the notes, not just a move, rating or reassurance.' });
            if(answer.finishReason !== 'stop') issues.push({ sentence: displayText(answer.raw).slice(-180), reason: 'Reply hit the token limit. Be shorter.' });
            attempts.push({ raw: answer.raw, finishReason: answer.finishReason, removed: issues });
            // A clean non-answer must not displace a surviving explanation of the player's question.
            if(answer.finishReason === 'stop' && checked.text.trim() && (!best || Number(incomplete) < Number(best.incomplete)
                || Boolean(incomplete) === Boolean(best.incomplete) && issues.length < best.issues.length))
                best = { ...answer, checked, issues, incomplete };
            if(best && !best.issues.length) break;
            prompt = repairChatPrompt(prepared, issues.length ? issues : [{ sentence: '', reason: 'No supported answer survived. Answer only from the notes.' }],
                { tokenCount: text => runtime.tokenCount(text), context: runtime.manifest.context, maxTokens });
        }
        signal?.throwIfAborted();
        return { raw: best?.checked.tagged || '', tokens: best?.tokens || 0, finishReason: best?.finishReason || 'withheld',
            quality: { attempts, selectedRaw: best?.raw || '', removed: best?.checked.removed || attempts.at(-1)?.removed || [],
                status: !best ? 'withheld' : best.issues.length ? 'filtered' : 'screened' } };
    } finally {
        clearTimeout(deadline);
        signal?.removeEventListener('abort', cancel);
    }
}
