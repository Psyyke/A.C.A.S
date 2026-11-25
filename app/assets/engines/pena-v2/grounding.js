import { Chess } from '../libraries/chessjs/chess.js';
import CaptureExchange from '../../js/misc/captureExchange.js';
import { moveMentions, normalizeNotation, isPlannedMove, plannedMoves, variationFrames } from './teacher.js';
import { pickProblem, problemText } from './safety.js';
import { Facts } from './concepts.js';

const types = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
const squareIndex = square => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
const recommendation = /\b(?:(?:best(?: available)?|decisive|recommended|winning|only reasonable|only legal) (?:move|candidate)|best practical (?:try|resource)|most resilient defense|best defense|recommend(?:s|ed)?|should play)\b/i;
const pieceWord = '(?:pawn|knight|bishop|rook|queen|king)';
const rawMove = new RegExp(`(?:\\b\\d+\\.(?:\\.\\.)?\\s*|\\.\\.\\.\\s*)?\\b(white|black) (${pieceWord}) ([a-h][1-8])(?:-([a-h][1-8])| takes (?:(?:white|black) )?${pieceWord} ([a-h][1-8]))([qrbn])?\\b([+#])?`, 'gi');

export function compactExplanation(text) {
    return text
        .replace(/\b(?:The )?(?:best(?: available)?|decisive|recommended|winning|only reasonable) (?:move|candidate) is\s+(?:\d+\.(?:\.\.)?\s*)?/gi, '')
        .replace(/\b(?:The player's |The |Your )?(?:best practical (?:try|resource)|most resilient defense|best defense) is\s+(?:\d+\.(?:\.\.)?\s*)?/gi, '')
        .replace(/^Play\s+(?=[KQRBN][a-h1-8x]|O-O|[a-h][1-8]|castle\b)/i, '')
        .replace(/\bThe strategic task for the player is to\b/g, 'The aim is to')
        .replace(/\bThe player should (?:then )?(?:continue with|respond(?: with)?|play)\b/g, 'Continue with')
        .replace(/\bThe player's most (?:resilient|accurate|active|purposeful) (?:continuation|response) is\b/g, 'Continue with')
        .replace(/\bThe opponent's most (?:precise|accurate|natural|purposeful) (?:reply|continuation) is\b/g, 'One reply is')
        .replace(/\bthe opponent's most (?:precise|accurate|natural|purposeful) reply\b/g, 'a possible reply')
        .replace(/\bThe player's (?:\w+ )?(?:best |most \w+ )?(?:reply|response|continuation|follow-up|move) is\b/g, 'Continue with')
        .replace(/\bThe player should (?:then )?continue\b/g, 'Continue with')
        .replace(/\bThe opponent's (?:\w+ )?(?:best |most \w+ )?(?:reply|response|continuation|follow-up|move) is\b/g, 'One reply is')
        .replace(/\bThe opponent (?:should |will |can |may )?(?:then )?(?:play|plays|respond with|responds with|reply with|replies with|continue with|continues with)\b/g, 'Then comes')
        .replace(/\bdeveloping the last minor piece\b/gi, 'developing a minor piece')
        .replace(/\bto a (?:strong )?central square (?:that|which) prepares\b/gi, 'toward the center and preparing')
        .replace(/\b([Nn]o|[Aa]ny|[Ee]very) the opponent (piece|pawn)/g, '$1 enemy $2')
        .replace(/\b([Nn]o|[Aa]ny|[Ee]very) the player (piece|pawn)/g, '$1 friendly $2')
        .replace(/^The player (?:is )?to move in a position where\s+/, 'Here, ')
        .replace(/\bthe ((?:(?:open|semi-open|closed|same|entire) )?)([a-h])([18])-\2([18])\b(?!\s+(?:diagonal|file|rank))/gi,
            (match, adjective, file, from, to) => from === to ? match : `the ${adjective}${file}-file`)
        .replace(/\bthe a([1-8])-h\1\b(?!\s+(?:diagonal|file|rank))/gi,
            (_, rank) => `the ${rank}${['st', 'nd', 'rd'][Number(rank) - 1] || 'th'} rank`)
        .replace(/(?<![\w-])a([1-8])-h\1\b(?![\w-]|\s+(?:diagonal|file|rank))/g,
            (_, rank) => `the ${rank}${['st', 'nd', 'rd'][Number(rank) - 1] || 'th'} rank`)
        .replace(/(?<![\w-])([a-h])(?:1-\1(?:8)|8-\1(?:1))\b(?![\w-]|\s+(?:diagonal|file|rank))/g, 'the $1-file')
        .replace(/\bthe the\b/gi, 'the')
        .replace(/\b([a-h])[18]-\1[18]-(pawns?)\b/gi, '$1-$2')
        .replace(/\bthe ((?:long |same |open )?)([a-h])([1-8])-([a-h])([1-8])\b(?![\w-]|\s+(?:diagonal|file|rank))/gi,
            (match, adjective, f1, r1, f2, r2) => Math.abs(f1.charCodeAt(0) - f2.charCodeAt(0)) === Math.abs(r1 - r2)
                ? `${match} diagonal` : match)
        .replace(/\b(?:in this position|in the current position),?\s*/gi, '')
        .replace(/\s+([,!?]|\.(?!\.))/g, '$1').replace(/[ \t]+/g, ' ').trim();
}

export function checkSentence(text, fen, { context = '', rootColor } = {}) {
    const root = new Chess();
    if(!root.load(fen)) throw new Error('Cannot check Pena prose without a valid position.');
    const combined = context + text;
    const offset = context.length;
    const allFrames = variationFrames(combined, fen, { rootColor });
    const frames = allFrames.filter(frame => frame.index >= offset);
    const reject = reason => ({ status: 'contradicted', reason, text: '', hasMoves: frames.length > 0,
        rejectedLine: recommendation.test(text) });
    const plans = plannedMoves(combined, fen, { rootColor, frames: allFrames }).filter(plan => plan.index >= offset);
    const main = recommendation.test(text) && frames.some(frame => frame.beforeFen === root.fen());
    const warnings = /\b(?:do not|don't|never|avoid|cannot|can't|shouldn't)\s+(?:play|push|move|capture)?/i.test(text);
    const unresolvedContext = variationFrames(context, fen, { rootColor }).incomplete && !/\n\s*\n\s*$/.test(context)
        && !frames.some(frame => frame.beforeFen === root.fen());
    const boardAt = index => {
        const paragraph = combined.lastIndexOf('\n\n', index);
        const frame = allFrames.findLast(frame => frame.end <= index && frame.index >= paragraph);
        return new Chess(frame?.fen || fen);
    };
    const hypothetical = index => unresolvedContext
        || /\b(?:if|would|could|will|eventually|after|prepar\w*|plan\w*|threaten\w*)\b[^.!?]*$/i
            .test(text.slice(0, index).replace(/\b\d+\.(?:\.\.)?|\.\.\./g, ''));
    // Pena sees the position, not the game score, so narrated history is invented and confuses beginners.
    if(/\b(?:arises (?:after|from)|arose (?:after|from)|reached after|position after \d+\.)/i.test(text))
        return reject('The claimed game history is not something Pena can see.');
    if(/\balready captured\b/i.test(text) && root.fen() === new Chess().fen())
        return reject('The claimed game history precedes the initial position.');
    // A move replayed earlier in this line makes the board concrete, even inside "after ..." clauses.
    const replayed = index => allFrames.some(frame => frame.end <= offset + index && frame.index >= combined.lastIndexOf('\n\n', offset + index));

    const claims = [...text.matchAll(/\b(?:(white|black)\s+)?(pawn|knight|bishop|rook|queen|king)\s+(?:(is|is not|lands|sits|stands|remains|ends up)\s+)?(?:on|at)\s+([a-h][1-8])\b/gi)];
    for(const claim of claims) {
        const preceding = allFrames.findLast(frame => frame.end <= offset + claim.index);
        const futurePlan = preceding && /\b(?:if|would|could|will|eventually|prepar\w*|plan\w*|intend\w*|aim\w*|threaten\w*)\b/i
            .test(combined.slice(preceding.end, offset + claim.index));
        if(hypothetical(claim.index) && (!replayed(claim.index) || futurePlan)) continue;
        const prefix = text.slice(0, claim.index);
        const former = /\b(?:captur(?:es|ing)|tak(?:es|ing)|remov(?:es|ing)|eliminat(?:es|ing)) (?:(?:the|a|your|their|opponent's) )?$/i.test(prefix)
            || /\b(?:remov(?:es|ing)|eliminat(?:es|ing)) (?:the )?(?:immediate )?(?:threat|attack|pressure) (?:to|on|against) (?:the )?$/i.test(prefix);
        const prior = former && allFrames.findLast(frame => frame.end <= offset + claim.index);
        const piece = (prior ? new Chess(prior.beforeFen) : boardAt(offset + claim.index)).get(claim[4]);
        const matches = piece?.type === types[claim[2].toLowerCase()]
            && (!claim[1] || piece.color === claim[1][0].toLowerCase());
        if(Boolean(matches) === (claim[3]?.toLowerCase() === 'is not'))
            return reject(`Piece placement on ${claim[4]} contradicts the position being discussed.`);
    }
    // Drop only the false clause ("d4, challenging the center and establishing a duo on d4 and e4") so the useful part survives.
    const repairClause = (index, reason) => {
        const before = text.slice(0, index);
        const start = Math.max(before.lastIndexOf(','), before.search(/\s+and\s+(?!.*\s+and\s+)[^,]*$/));
        const stop = text.slice(index).search(/[,;.!?](?:\s|$)/);
        const repaired = start > 0 && (text.slice(0, start) + (stop < 0 ? '.' : text.slice(index + stop)))
            .replace(/,\s*([.!?])/, '$1');
        if(!repaired || repaired.split(/\s+/).length < 2) return reject(reason);
        const result = checkSentence(repaired, fen, { context, rootColor });
        let remainder = result.text;
        for(const move of moveMentions(remainder).reverse())
            remainder = remainder.slice(0, move.index) + remainder.slice(move.end);
        if(/^(?:After|If|When)[\s,]*(?:with\b.*)?[.!?]$/i.test(remainder))
            return reject(reason);
        return { ...result, repairs: [...(result.repairs || []), { source: text, reason }] };
    };
    const subjectColor = index => {
        const subject = [...text.slice(0, index).matchAll(/\b(player|opponent)(?:'s)?\b|\b(white|black)\b/gi)].at(-1);
        return subject?.[2] ? subject[2][0].toLowerCase()
            : subject ? subject[1].toLowerCase() === 'player' ? root.turn() : root.turn() === 'w' ? 'b' : 'w' : null;
    };
    const counts = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
    const ranks = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };
    for(const claim of text.matchAll(/\b(?:placing|activating|centralizing|bringing|moving|transferring|putting|repositioning|infiltrating) the (rook|queen|knight|bishop|king|pawn) (?:on|to|onto) the (first|second|third|fourth|fifth|sixth|seventh|eighth|[1-8](?:st|nd|rd|th)) rank\b/gi)) {
        const frame = frames.findLast(frame => frame.end <= offset + claim.index);
        if(!frame || hypothetical(claim.index)
            || new Chess(frame.beforeFen).get(frame.from)?.type !== types[claim[1].toLowerCase()]) continue;
        const actual = Number(frame.to[1]);
        const claimed = ranks[claim[2].toLowerCase()] || Number(claim[2][0]);
        if(claimed === actual) continue;
        const index = claim.index + claim[0].lastIndexOf(claim[2]);
        const corrected = `${actual}${['st', 'nd', 'rd'][actual - 1] || 'th'}`;
        const result = checkSentence(text.slice(0, index) + corrected + text.slice(index + claim[2].length), fen, { context, rootColor });
        return { ...result, repairs: [...(result.repairs || []),
            { source: text, reason: 'The named destination rank was corrected to the replayed move.' }] };
    }
    for(const claim of text.matchAll(/\bmaterial is (?:equal|balanced)\b|\b(?:(one|two|three|an?) )?extra (?:(white|black) )?(pawn|knight|bishop|rook|queen)s?\b|\bbishop pair\b/gi)) {
        if(unresolvedContext || hypothetical(claim.index) && !replayed(claim.index)) continue;
        const facts = new Facts(boardAt(offset + claim.index).fen());
        const color = claim[2]?.[0].toLowerCase() || subjectColor(claim.index);
        if(/^material/i.test(claim[0])) {
            const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
            const balance = facts.pieces.reduce((sum, piece) => sum + values[piece.type] * (piece.color === 'w' ? 1 : -1), 0);
            if(balance) return reject('The claimed material balance contradicts the pieces on the board.');
        } else if(color && /bishop pair/i.test(claim[0])) {
            const bishops = facts.find('b', color);
            if(bishops.length < 2) return repairClause(claim.index, 'The claimed bishop pair is not on the board.');
        } else if(color && claim[3]) {
            const own = facts.find(types[claim[3].toLowerCase()], color).length;
            const enemy = facts.find(types[claim[3].toLowerCase()], color === 'w' ? 'b' : 'w').length;
            if(own - enemy !== (counts[claim[1]?.toLowerCase()] || 1))
                return repairClause(claim.index, 'The claimed extra material contradicts the piece count.');
        }
    }
    const inventory = text.match(/\bboth sides (?:retain(?:ing)?|have|with)\s+(.+)/i);
    if(inventory && !hypothetical(inventory.index)) {
        const facts = new Facts(boardAt(offset + inventory.index).fen());
        for(const count of inventory[1].matchAll(/\b(one|two|three|four|five|six|seven|eight|\d+) (pawns?|knights?|bishops?|rooks?|queens?)\b/gi)) {
            const number = counts[count[1].toLowerCase()] || Number(count[1]);
            const type = types[count[2].toLowerCase().replace(/s$/, '')];
            if(['w', 'b'].some(color => facts.find(type, color).length !== number))
                return reject('The claimed piece inventory contradicts the board.');
        }
    }
    const holdings = text.match(/\b(?:the )?(player|opponent|white|black) (?:has|holds|retains|commands) (?:(?:a |an )?(?:[a-z]+ ){0,2}material (?:advantage|edge|deficit) with )?(.+)/i);
    if(holdings && !unresolvedContext && (!hypothetical(holdings.index) || replayed(holdings.index))) {
        const owner = holdings[1].toLowerCase();
        const color = owner === 'player' ? root.turn() : owner === 'opponent' ? root.turn() === 'w' ? 'b' : 'w' : owner[0];
        const lists = holdings[2].split(/\s+against\s+/, 2);
        for(let index = 0; index < lists.length; index++) {
            let list = lists[index].replace(/^(?:the )?(?:player's|opponent's)\s+/, '');
            const side = index ? color === 'w' ? 'b' : 'w' : color;
            const facts = new Facts(boardAt(offset + holdings.index).fen());
            while(list) {
                const item = list.match(/^(?:(an?|one|two|three|four|five|six|seven|eight|\d+|lone|bare) )?(?:(white|black) )?(pawn|knight|bishop|rook|queen|king)(s)?\b/i);
                if(!item) break;
                const number = /^\d+$/.test(item[1] || '') ? Number(item[1])
                    : counts[item[1]?.toLowerCase()] || (item[4] && !item[1] ? null : 1);
                const tail = list.slice(item[0].length);
                if(item[3].toLowerCase() === 'pawn' && /^\s+(?:chain|majority|structure|break)\b/i.test(tail)) break;
                // "Black has a rook on a8" places one rook, it does not say Black has only one.
                const placed = /^an?$/i.test(item[1] || '') && /^\s+on\s+[a-h][1-8]\b/i.test(tail);
                if(number !== null && !placed && facts.find(types[item[3].toLowerCase()], item[2]?.[0].toLowerCase() || side).length !== number)
                    return reject('The stated material inventory contradicts the board.');
                const separator = tail.match(/^\s*(?:,\s*(?:and\s+)?|and\s+)/);
                if(!separator) break;
                list = tail.slice(separator[0].length);
            }
        }
    }
    for(const claim of text.matchAll(/\b(?:bishop|rook|queen) on ([a-h][1-8]) (?:(?:is|remains) (?:active|well-placed),?\s+)?(pins|pinning) (?:the )?(?:(?:white|black) )?(?:pawn|knight|bishop|rook|queen) on ([a-h][1-8]) to (?:the )?(?:(white|black) )?(rook|queen|king)(?: on ([a-h][1-8]))?\b/gi)) {
        if(hypothetical(claim.index)) continue;
        const facts = new Facts(boardAt(offset + claim.index).fen());
        if(facts.lines().some(line => line.kind === 'pin' && line.slider === claim[1] && line.front === claim[3]
            && (!claim[6] || line.back === claim[6])
            && facts.board.get(line.back)?.type === types[claim[5].toLowerCase()]
            && (!claim[4] || facts.board.get(line.back)?.color === claim[4][0].toLowerCase()))) continue;
        if(claim[2].toLowerCase() === 'pinning') {
            const start = claim.index + claim[0].indexOf(claim[2]) - 1;
            const result = checkSentence(text.slice(0, start).replace(/,\s*$/, '') + text.slice(claim.index + claim[0].length), fen, { context, rootColor });
            return { ...result, repairs: [...(result.repairs || []),
                { source: text, reason: 'The named pin has blocked or impossible geometry.' }] };
        } else {
            return repairClause(claim.index, 'The named pin has blocked or impossible geometry.');
        }
    }
    for(const claim of text.matchAll(/\b([a-h][1-8]) is (?:controlled|attacked|defended|protected|covered) by (?:the )?(?:(white|black) )?(pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])\b/gi)) {
        if(hypothetical(claim.index)) continue;
        const facts = new Facts(boardAt(offset + claim.index).fen());
        const piece = facts.board.get(claim[4]);
        if(!piece || piece.type !== types[claim[3].toLowerCase()]
            || claim[2] && piece.color !== claim[2][0].toLowerCase()
            || !facts.attackers(claim[1], piece.color).includes(claim[4]))
            return repairClause(claim.index, 'The claimed square coverage has blocked or impossible geometry.');
    }
    for(const claim of text.matchAll(/\bpassed (?:(white|black) )?pawn(?: on ([a-h][1-8]))?\b/gi)) {
        if(hypothetical(claim.index) && !replayed(claim.index) || /\bnot (?:a |the )?$/.test(text.slice(0, claim.index))) continue;
        const board = boardAt(offset + claim.index);
        const frame = frames.findLast(frame => frame.end <= offset + claim.index);
        if(!claim[2] && hypothetical(claim.index)) continue;
        const square = claim[2] || frame?.to;
        if(!square) continue;
        const pawn = board.get(square);
        if(pawn?.type !== 'p') continue;
        if(!new Facts(board.fen()).passed({ ...pawn, square }))
            return repairClause(claim.index, 'The claimed passed pawn still has an opposing pawn ahead on its file or an adjacent file.');
    }
    for(const claim of text.matchAll(/\bpawn (?:duo|chain|pair|cent(?:er|re)|majority)\s+on\s+([a-h][1-8]),?\s+(?:and\s+)?([a-h][1-8])\b/gi)) {
        if(hypothetical(claim.index) && !replayed(claim.index)) continue;
        const board = boardAt(offset + claim.index);
        const [first, second] = [board.get(claim[1]), board.get(claim[2])];
        const chain = /\bchain\b/i.test(claim[0]);
        if(first?.type !== 'p' || second?.type !== 'p' || first.color !== second.color
            || chain && (Math.abs(claim[1].charCodeAt(0) - claim[2].charCodeAt(0)) !== 1
                || Math.abs(Number(claim[1][1]) - Number(claim[2][1])) !== 1))
            return repairClause(claim.index, 'The named pawn structure is not on the board.');
    }
    const turn = /^(White|Black) (?:is to move|to move)[.!]?$/i.exec(text);
    if(turn && !unresolvedContext && turn[1][0].toLowerCase() !== boardAt(offset).turn())
        return reject('The claimed side to move is wrong.');

    for(const mention of moveMentions(combined).filter(mention => mention.index >= offset)) {
        const frame = frames.find(frame => frame.index === mention.index);
        const prefix = combined.slice(0, mention.index);
        if(!frame && boardAt(mention.index).in_checkmate())
            return { ...reject('No reply is legal after checkmate.'), rejectedLine: true };
        if(warnings || isPlannedMove(combined, mention)) continue;
        const checkSuffix = combined.slice(mention.index, mention.end).match(/[+#]$/)?.[0]
            || combined.slice(mention.end).match(/^[+#]/)?.[0];
        if(frame && checkSuffix && !(checkSuffix === '#' ? frame.san.endsWith('#') : /[+#]$/.test(frame.san)))
            return reject('The move notation claims a check or mate that does not occur.');
        if(frame && typeof mention.input === 'object') {
            const named = prefix.match(/\b(?:(white|black)\s+)?(pawn|knight|bishop|rook|queen|king)\s*$/i);
            const board = new Chess(frame.beforeFen);
            const piece = board.get(frame.from);
            if(named && (piece.type !== types[named[2].toLowerCase()]
                || named[1] && piece.color !== named[1][0].toLowerCase()))
                return reject('The named moving piece does not match the board.');
            const capture = combined.slice(mention.index, mention.end)
                .match(/\b(?:takes|captures)\s+(?:(white|black)\s+)?(pawn|knight|bishop|rook|queen|king)/i);
            const move = board.move(mention.input);
            if(capture && (move.captured !== types[capture[2].toLowerCase()]
                || capture[1] && capture[1][0].toLowerCase() === move.color))
                return reject('The named captured piece does not match the legal move.');
        }
        const assertion = prefix.replace(/\b\d+\.(?:\.\.)?|\.\.\./g, '');
        const explicit = recommendation.test(text.slice(0, mention.end - offset))
            || /\b(?:reply|response|continuation|then|plays?|responds?|continues?)(?: is| with)?\s*(?:(?:white|black)\s+)?(?:pawn|knight|bishop|rook|queen|king)?\s*$/i.test(assertion);
        const uncertain = /\b(?:if|would|could|might|may|before|later|subsequently|threat\w*)\b[^.!?]*$/i.test(assertion);
        if(!frame && !plans.some(plan => plan.index === mention.index) && explicit && !uncertain
            && (!unresolvedContext || recommendation.test(text)))
            return reject('An explicitly asserted move cannot be replayed in this line.');
    }

    const attacks = /\b(attack(?:s|ing)?|defend(?:s|ing)?|protect(?:s|ing)?|control(?:s|ling)?|support(?:s|ing)?|reinforc(?:es|ing)|eye(?:s|ing)?|target(?:s|ing)?|pressur(?:es|ing))\s+(?:the )?(?:(?:(?:white|black|enemy|opponent's|own) )?(?:pawn|knight|bishop|rook|queen|king) on )?([a-h][1-8])\b(?:\s+(?:pawn|knight|bishop|rook|queen|king)\b)?(?:\s+and\s+([a-h][1-8])\b)?/gi;
    const pieceTypeNames = /\b(pawn|knight|bishop|rook|queen|king)s?\b/gi;
    for(const attack of text.matchAll(attacks)) {
        if(hypothetical(attack.index)) continue;
        const prefix = text.slice(0, attack.index);
        const named = prefix.match(/\b(?:(white|black)\s+)?(pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])\s*(?:(?:directly|immediately)\s*)?$/i);
        const frame = frames.findLast(frame => frame.end <= offset + attack.index);
        const gap = frame ? combined.slice(frame.end, offset + attack.index) : '';
        const movedType = frame && new Chess(frame.beforeFen).get(frame.from)?.type;
        // The moved piece stays the subject across trailing clauses like ", activating the bishop ... where it eyes X and supports Y".
        const subject = frame && !/[.!?;]/.test(gap) && !/\b[a-h][1-8]\b/.test(gap.replace(/\b[a-h][1-8]-[a-h][1-8]\b/g, ''))
            && [...gap.matchAll(pieceTypeNames)].every(name => types[name[1].toLowerCase()] === movedType)
            && (/^[,\s]*(?:where it|which|it)?\s*(?:(?:directly|immediately|simultaneously)\s*)?$/i.test(gap)
                || /^\s*,/.test(gap) && /\b(?:it|which|where it|that)\b/i.test(gap));
        if(!named && !subject) continue;
        const board = boardAt(offset + attack.index);
        const from = named?.[3] || frame.to;
        const piece = board.get(from);
        if(!piece) continue;
        const position = new CaptureExchange(board.fen());
        if(attack.slice(2).filter(Boolean).some(target =>
            !position.attackersTo(squareIndex(target), piece.color).includes(squareIndex(from)))) {
            const claim = attack[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const repairs = [
                [new RegExp(`,\\s*${claim}\\s+and\\s+`, 'i'), ', '],
                [new RegExp(`\\b(where it|which|it|that)\\s+(?:can\\s+)?${claim}[^,.!?;]*?\\s+and\\s+`, 'i'), '$1 '],
                [new RegExp(`(?:,?\\s+and|,)\\s+(?:(?:which|where it|it|that)\\s+)?(?:can\\s+)?${claim}[^,.!?;]*`, 'i'), ''],
                [new RegExp(`\\s+(?:where it|which|that)\\s+(?:can\\s+)?${claim}[^,.!?;]*`, 'i'), '']
            ];
            for(const [clause, replacement] of repairs) {
                const repaired = text.replace(clause, replacement);
                if(repaired !== text && repaired.trim()) {
                    const result = checkSentence(repaired, fen, { context, rootColor });
                    return { ...result, repairs: [...(result.repairs || []),
                        { source: text, reason: 'An immediate attack has blocked or impossible geometry.' }] };
                }
            }
            return reject('An immediate attack has blocked or impossible geometry.');
        }
    }
    for(const effect of text.matchAll(/\b(?:giv(?:es|ing)|deliver(?:s|ing)) (?:immediate )?(checkmate|check)\b|\b(?:capturing|captures) (?:the |a )?(?:(white|black) )?(pawn|knight|bishop|rook|queen)\b/gi)) {
        if(hypothetical(effect.index)) continue;
        const frame = frames.findLast(frame => frame.end <= offset + effect.index);
        if(!frame) continue;
        const board = new Chess(frame.beforeFen);
        const move = board.move({ from: frame.from, to: frame.to, promotion: frame.promotion || 'q' });
        if(effect[1] && !(effect[1].toLowerCase() === 'checkmate' ? board.in_checkmate() : board.in_check()))
            return reject('The claimed immediate check or mate does not occur.');
        if(effect[3] && (move.captured !== types[effect[3].toLowerCase()]
            || effect[2] && effect[2][0].toLowerCase() === move.color))
            return reject('The claimed immediate capture does not occur.');
    }

    let normalized = normalizeNotation(combined, fen).slice(normalizeNotation(context, fen).length);
    const onlyReply = /\bonly legal (?:response|reply|move|candidate) is\s*(?:\d+\.(?:\.\.)?\s*)?(?:(?:white|black)\s+)?(?:(?:pawn|knight|bishop|rook|queen|king)\s+)?$/i;
    for(const frame of frames) {
        if(onlyReply.test(combined.slice(0, frame.index)) && new Chess(frame.beforeFen).moves().length > 1)
            normalized = normalized.replace(/\bonly legal (?:response|reply|move|candidate) is\b/i, 'possible reply is');
    }
    // Unreplayed ideas keep coordinates and a plan label, never invented legal SAN.
    const leftovers = [...normalized.matchAll(rawMove)];
    if(leftovers.length > 1) return reject('A move sequence here could not be replayed on the board.');
    const exact = !unresolvedContext && (turn
        || /^(?:The )?(?:white|black) (?:pawn|knight|bishop|rook|queen|king) is (?:not )?(?:on|at) [a-h][1-8][.!]?$/i.test(text));
    const mainFrame = frames.find(frame => frame.beforeFen === root.fen()
        && recommendation.test(text.slice(0, frame.index - offset)));
    const mainUci = mainFrame ? mainFrame.from + mainFrame.to + mainFrame.promotion : null;
    // The model sometimes recommends a move that simply hangs material, so swap in a safe one and say why.
    const blunder = main && mainUci && pickProblem(fen, mainUci, {
        mentioned: allFrames.filter(frame => frame.beforeFen === root.fen()).map(frame => frame.from + frame.to + frame.promotion)
    });
    if(blunder) return {
        status: 'unchecked', reason: 'Pena\'s pick drops material, so a safe alternative replaces it.',
        text: problemText(blunder), main, mainMove: blunder.alternative.uci, blunder,
        hasMoves: true, contextual: false, unresolvedContinuation: false, alternative: false, tactical: true
    };
    return {
        status: exact ? 'verified' : 'unchecked',
        reason: exact ? 'Checked against the discussed position.'
            : 'Original reasoning retained. No detected contradiction is not proof of strategic correctness.',
        text: compactExplanation(normalized.replace(rawMove, (_, color, piece, from, to, target, promotion, check, index) =>
            `${/[A-Za-z,]$/.test(normalized.slice(0, index)) ? ' ' : ''}${piece.toLowerCase() === 'pawn' ? '' : types[piece.toLowerCase()].toUpperCase()}${from}-${to || target}${promotion ? '=' + promotion.toUpperCase() : ''} (plan)`)), main,
        mainMove: mainUci,
        hasMoves: frames.length > 0,
        contextual: !frames.some(frame => frame.beforeFen === root.fen()) && boardAt(offset).fen() !== root.fen(),
        unresolvedContinuation: unresolvedContext,
        alternative: frames.some(frame => frame.beforeFen === root.fen())
            && /\b(?:alternative|candidate|other promising moves?|another (?:promising )?move)\b/i.test(text),
        tactical: frames.some(frame => /[x+#=]/.test(frame.san))
    };
}
