import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import CaptureExchange from '../../js/misc/captureExchange.js';
import { penaVisualsChanged } from './variation.js';
import { literalChessText } from './glossary.js';
import { moveArrowConfig } from '../../js/misc/arrowStyle.js';
import { withTurn } from './factsheet.js';

const pieceTypes = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
let teachingRevision = Date.now();

export function moveMentions(text) {
    const tokens = /\b(?:[KQRBN])?([a-h][1-8])(?:\s*(?:-|to|\u2192|(?:takes|captures)\s+(?:(?:white|black)\s+)?(?:king|queen|rook|bishop|knight|pawn))\s*|(?=[a-h]))([a-h][1-8])([qrbn])?\b|\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[O0]-[O0](?:-[O0])?[+#]?)(?![a-zA-Z0-9])|(?:\b(?:play|push|move|suggests?|option:|line:|continues|\d+\.(?:\.\.)?)|(?<![\w.])\.\.\.)\s*([a-h][1-8](?:=[QRBN])?[+#]?)(?![a-zA-Z0-9-])|\b([a-h][1-8](?:=[QRBN])?[+#]?)\b|\b[Cc]astl(?:e|es|ing)\s+(?:on (?:the )?)?(king|queen)side\b/g;
    const mentions = [];
    for(const match of text.matchAll(tokens)) {
        const before = text.slice(0, match.index), after = text.slice(match.index + match[0].length);
        // "c2-d3-e4 chain" and "your c5, d6, e7 chain" name pawns, not a move.
        if(/^-[a-h][1-8]/.test(after) || /[a-h][1-8]-$/.test(before)) continue;
        if((match[1] || match[5]) && (/^(?:,?\s*(?:and\s+)?[a-h][1-8]\b)*,?\s*(?:pawn\s+)?(?:chain|pawns|squares|structure|complex|duo|triangle|wedge)\b/i.test(after)
            || /\b(?:chain|pawns on|squares)\s+(?:[a-h][1-8],?\s+(?:and\s+)?)*$/i.test(before))) continue;
        const moveContext = /\b(?:move|play|push|reply|advance|break)(?: is| with| the)*\s*$/i.test(before)
            || /\b(?:king|queen|rook|bishop|knight|pawn)\s*$/i.test(before)
            || /^\s+(?:move|push|advance|break|development)\b/i.test(after) || /^[KQRBN]/.test(match[0]);
        const wholeLine = match[1] && (match[1][0] === match[2][0] && Math.abs(Number(match[1][1]) - Number(match[2][1])) === 7
            || match[1][1] === match[2][1] && Math.abs(match[1].charCodeAt(0) - match[2].charCodeAt(0)) === 7);
        if(wholeLine && !moveContext && /\b(?:the|along|or|and|on|across|down|up)\s*$/i.test(before)) continue;
        if(match[1] && (/^\s*[- ]?(?:diagonal|file|rank)\b/i.test(after)
            || !moveContext && /\b(?:the|along|diagonal|file|rank)\s*(?:(?:open|semi-open|closed|long|short|same|entire)\s+)*$/i.test(before))) continue;
        const previous = mentions.at(-1);
        const rootPawnMove = match[5] && (/=[QRBN]/.test(match[5])
            || moveOwner(before, 'w') && !/^\s*[- ]?(?:king|queen|rook|bishop|knight|pawn|square|file|rank)\b/i.test(after)
            || /\b(?:(?:best(?: available)?|decisive|recommended|winning|only reasonable|only legal) (?:move|candidate)(?: is)?|recommends?|play|push)\s*$/i.test(before)
            || /\b(?:repl(?:y|ies)|responds?|answers?|continu(?:e|es)|recaptures?|advances?|tries|try)(?:\s+with)?\s*$/i.test(before)
            || /\b(?:(?:reply|response|continuation|move|alternative|candidate)(?: is|:)?|(?:continues?|responds?|replies|follows)(?: with)?|then|after)\s*$/i.test(before)
            || /(?:^|[.!?]\s+)\s*$/.test(before)
                && /^(?:\s*[,;.!?]|\s*$|\s+(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h][1-8])\b|\s+is (?:the |a )?(?:best|recommended|natural|good) move\b)/.test(after));
        const namedMove = match[5] && before.match(/\b(king|queen|rook|bishop|knight|pawn)\s+(?:moves?|retreats?|returns?|goes?|repositions?)\s+to\s*$/i);
        if(match[5] && !rootPawnMove && !namedMove && (!previous || !/^[\s,]*(?:then\s*)?$/.test(text.slice(previous.end, match.index)))) continue;
        mentions.push({
            index: match.index + (match[4] ? match[0].lastIndexOf(match[4]) : 0), end: match.index + match[0].length,
            input: match[1] ? { from: match[1], to: match[2], promotion: match[3] || 'q' }
                : match[6] ? match[6] === 'king' ? 'O-O' : 'O-O-O'
                    : namedMove ? (pieceTypes[namedMove[1].toLowerCase()] === 'p' ? '' : pieceTypes[namedMove[1].toLowerCase()].toUpperCase()) + match[5]
                        : (match[4] || match[5] || match[0]).replace(/0/g, 'O')
        });
    }
    return mentions;
}

// A plan word only governs moves in its own clause. "preparing to castle, the player should castle with O-O" is a real move.
export const planClause = /\b(?:prepar\w*|plan\w*|intend\w*|eventual\w*|aim\w*|threat\w*)\b[^.!?,;]*$/i;

export function isPlannedMove(text, mention) {
    return planClause.test(text.slice(0, mention.index).replaceAll('...', ''))
        || /^\s*(?:\(plan\)\s*)?(?:break|advance|push|plan)\b/i.test(text.slice(mention.end));
}

export function moveOwner(prefix, root) {
    const numbered = prefix.match(/(?:^|[\s,(])\d+\.(\.\.)?\s*$|(?<!\.)\.\.\.\s*$/);
    if(numbered) return numbered[1] || /^\.\.\./.test(numbered[0].trim()) ? 'b' : 'w';
    const named = prefix.match(/\b(white|black|opponent|enemy|player|you|your|they|their)(?:['\u2019]s)?\s*(?:(?:can|could|would|may|might|should|will|then|also|instead|strongest|best|natural|main|likely|possible|next|just|now|still|really|is|are|'s|'re)\s+)*(?:(?:move|reply|response|idea|plan|continuation|threat|choice|option)\s+(?:is\s+|would be\s+|was\s+)?)?(?:(?:wants?|would like|likes?|hopes?|aims?|plans?|planning|threatens?|threatening|prepares?|preparing|intends?|ready|needs?|gets?|going)\s+(?:to\s+)?(?:(?:play|push|go for|answer with|meet (?:it|that|this) with)\s+)?)?(?:(?:plays?|played|tries|try|repl(?:y|ies|ied)|responds?|answers?|answered|pushe?s?|retreats?|recaptures?|castles?)(?:\s+with)?\s*)?$/i);
    const owner = named?.[1].toLowerCase();
    const stepping = !owner && prefix.match(/\b(white|black|opponent|player|you|your)(?:['\u2019]s)?\s+(?:king\s+)?(?:can|could|should|may|might)\s+(?:step|walk|move)\s+(?:towards?\s+(?:the\s+)?(?:cent(?:er|re)|king[ -]?side|queen[ -]?side)\s+)?with\s*$/i)?.[1].toLowerCase();
    if(stepping) return /^(white|black)$/.test(stepping) ? stepping[0]
        : !root ? null : stepping === 'opponent' ? root === 'w' ? 'b' : 'w' : root;
    return owner && (/^(white|black)$/.test(owner) ? owner[0]
        : !root ? null : /opponent|enemy|they|their/.test(owner) ? root === 'w' ? 'b' : 'w' : root);
}

export function plannedMoves(text, fen, { includeIdeas = false, rootColor, frames = variationFrames(text, fen, { rootColor }) } = {}) {
    const board = new Chess(fen);
    const plans = [];
    for(const mention of moveMentions(text)) {
        const prefix = text.slice(Math.max(0, mention.index - 100), mention.index);
        const explicit = isPlannedMove(text, mention);
        if(!explicit && !includeIdeas) continue;
        if(frames.some(frame => frame.index === mention.index)) continue;
        const idea = frames.ideas?.find(frame => frame.index === mention.index);
        if(explicit && idea) {
            plans.push({ ...mention, from: idea.from, to: idea.to, piece: idea.piece, color: idea.color, beforeFen: idea.beforeFen,
                kind: 'plan', label: 'Plan, not a legal-move claim' });
            continue;
        }
        // Plans made later in a line use the board of that line.
        const paragraph = text.lastIndexOf('\n\n', mention.index);
        const line = frames.findLast(frame => frame.end <= mention.index && frame.index >= paragraph);
        const position = line ? new Chess(line.fen) : board;
        const side = moveOwner(prefix, rootColor || board.turn()) || position.turn();
        let from, to;
        if(typeof mention.input === 'object') ({ from, to } = mention.input);
        else {
            if(!explicit) continue;
            const target = mention.input.match(/^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])(?:=[QRBN])?[+#]?$/);
            if(!target) continue;
            to = target[4];
            const kind = target[1]?.toLowerCase() || 'p';
            const candidates = SQUARES.filter(square => {
                const piece = position.get(square);
                if(piece?.type !== kind || piece.color !== side || target[2] && square[0] !== target[2]
                    || target[3] && square[1] !== target[3]) return false;
                const dx = Math.abs(to.charCodeAt(0) - square.charCodeAt(0)), dy = Math.abs(Number(to[1]) - Number(square[1]));
                return kind === 'n' ? dx * dy === 2 : kind === 'b' ? dx === dy : kind === 'r' ? dx === 0 || dy === 0
                    : kind === 'q' ? dx === dy || dx === 0 || dy === 0 : kind === 'k' ? Math.max(dx, dy) === 1
                        : dx === 0 && dy <= 2 && (Number(to[1]) - Number(square[1])) * (side === 'w' ? 1 : -1) > 0;
            });
            if(candidates.length !== 1) continue;
            from = candidates[0];
        }
        const piece = position.get(from);
        const named = prefix.match(/\b(?:(white|black)\s+)?(king|queen|rook|bishop|knight|pawn)\s*$/i);
        if(!piece || named && (piece.type !== pieceTypes[named[2].toLowerCase()]
            || named[1] && piece.color !== named[1][0].toLowerCase())) continue;
        const dx = Math.abs(to.charCodeAt(0) - from.charCodeAt(0)), dy = Math.abs(Number(to[1]) - Number(from[1]));
        const geometry = { b: dx === dy, r: dx === 0 || dy === 0, q: dx === dy || dx === 0 || dy === 0,
            n: dx * dy === 2, k: Math.max(dx, dy) === 1, p: dx === 0 && dy <= 2
                && (Number(to[1]) - Number(from[1])) * (piece.color === 'w' ? 1 : -1) > 0 };
        if(from === to || !geometry[piece.type]) continue;
        plans.push({ ...mention, from, to, piece: piece.type, color: piece.color, beforeFen: position.fen(), kind: 'plan',
            label: explicit ? 'Plan, not a legal-move claim' : 'Idea, not a legal-move claim' });
    }
    return plans;
}

export function normalizeNotation(text, fen) {
    const frames = variationFrames(text, fen);
    const plans = plannedMoves(text, fen);
    const replacements = [];
    for(const mention of moveMentions(text)) {
        if(typeof mention.input !== 'object') continue;
        const frame = frames.find(frame => frame.index === mention.index);
        const plan = plans.find(plan => plan.index === mention.index);
        if(!frame && !plan) continue;
        const before = text.slice(0, mention.index);
        const prefix = before.match(/(?:\b\d+\.(?:\.\.)?\s*|\.\.\.\s*)?(?:(?:white|black)\s+)?(?:king|queen|rook|bishop|knight|pawn)\s*$/i);
        const piece = frame ? new Chess(frame.beforeFen).get(frame.from) : null;
        const name = prefix?.[0].match(/(king|queen|rook|bishop|knight|pawn)/i)?.[1].toLowerCase();
        if(piece && name && piece.type !== pieceTypes[name]) continue;
        const namedColor = prefix?.[0].match(/\b(white|black)\b/i)?.[1][0].toLowerCase();
        if(piece && namedColor && namedColor !== piece.color) continue;
        const planned = !frame && /^\s*\(plan\)/i.test(text.slice(mention.end));
        // Black plans keep the "...e5" convention. White ones drop stray dots like "preparing...Bc1-e3".
        const dots = !frame && plan.color === 'b' && !/\.\.\.\s*$/.test(before) ? '...' : '';
        replacements.push({ start: mention.index - (prefix?.[0].length || 0), end: mention.end,
            text: frame?.san || `${dots}${plan.piece === 'p' ? '' : plan.piece.toUpperCase()}${plan.from}-${plan.to}${planned ? '' : ' (plan)'}` });
    }
    for(const replacement of replacements.reverse()) {
        const head = text.slice(0, replacement.start);
        text = head + (/[A-Za-z,]$/.test(head) ? ' ' : '') + replacement.text + text.slice(replacement.end).replace(/^[+#]/, '');
    }
    return text.replace(/([a-z])\.\.\.(?=[a-hKQRBN])/g, '$1 ...');
}

function tryMove(board, input) {
    try { return board.move(input); } catch { return null; }
}

export function variationFrames(text, fen, { rootColor, beforeFen: previousFen, lines = [], evidence = [], history = [] } = {}) {
    let board = new Chess(fen);
    const root = new Chess(fen), rootFen = root.fen();
    const placement = position => position.split(' ').slice(0, 2).join(' ');
    // Older boards of this game, oldest first. Quick moves can be missing, so only exact replays count.
    const past = [...new Set([...history, previousFen].filter(position => typeof position === 'string'
        && new Chess().validate_fen(position).valid && placement(position) !== placement(rootFen)))];
    const frames = [];
    Object.defineProperty(frames, 'unresolved', { value: [] });
    // Legal threats and plans keep their own board but stay out of the line, so they still read as plans.
    Object.defineProperty(frames, 'ideas', { value: [] });
    let blocked = false;
    let branch = 1;
    let end = 0;
    for(const mention of moveMentions(text)) {
        const gap = text.slice(end, mention.index);
        const restart = /\n\s*\n/.test(gap)
            || /\b(?:while|whereas)\s+(?:white|black|opponent|player|you|your)(?:['\u2019]s)?\b/i.test(gap)
            || /\bwhereas\b|\b(?:more|less|better|worse|cleaner|stronger|weaker|safer)\s+(?:\w+\s+)?than\b/i.test(gap.split(/[,;]/).at(-1))
            || /\b(?:alternative|instead|candidate|rather than|superior to|inferior to|compared (?:with|to)|unlike|legal option|illustrative legal|evaluator line|Pena suggests|(?:best(?: available)?|decisive|recommended|winning|only reasonable|only legal) move)\b[^.!?]*$/i
                .test(gap.split(/[,;]/).at(-1).replace(/\b\d+\.(?:\.\.)?|\.\.\./g, ''))
            || /(?:^|[.!?])\s*Play\s*$/.test(gap)
            || blocked && /[.!?]\s+/.test(gap);
        if(restart) { board = new Chess(fen); blocked = false; if(frames.length) branch++; }
        let color = moveOwner(gap, rootColor);
        const after = text.slice(mention.end, mention.end + 60);
        // "Ng6 challenging your knight" is the other side's idea.
        const victim = !color && after.match(/^\s*(?:,\s*)?(?:challenging|poking at|hitting|attacking|chasing|harassing|kicking|trapping|forking|pinning)\s+(your|white['\u2019]s|black['\u2019]s)\b/i)?.[1].toLowerCase();
        if(victim) color = victim === 'your' ? rootColor && (rootColor === 'w' ? 'b' : 'w') : victim[0] === 'w' ? 'b' : 'w';
        if(!color) color = gap.match(/\b(white|black)\b(?!['\u2019]s)(?:(?!\b(?:you|your|white|black|they|i|we)\b)[^.!?;,])*\bwith\s*$/i)?.[1][0].toLowerCase() || null;
        end = mention.end;
        let recap = false;
        if(isPlannedMove(text, mention)) {
            const past = previousFen && !planClause.test(text.slice(0, mention.index).replaceAll('...', ''))
                && /\b(?:your|last|just played|played)\b/i.test(gap);
            const previous = past && new Chess(previousFen);
            const move = previous && previous.move(mention.input);
            if(!move || previous.fen() !== new Chess(fen).fen()) {
                // A threat or plan is a one-move idea. A legal one gets its own frame and leaves the line alone.
                const clause = gap.split(/[.!?]\s+/).at(-1);
                const positions = [];
                const defended = /\b(?:against|stop\w*|prevent\w*|avoid\w*|dodg\w*|parry\w*|neutraliz\w*)\b[^.!?]*\bthreat\w*\b/i.test(gap);
                if(!defended && !/[.!?]\s+/.test(gap) && placement(board.fen()) !== placement(rootFen) && !blocked) positions.push(board.fen());
                positions.push(rootFen);
                for(const position of positions) {
                    const turn = position.split(' ')[1];
                    const sides = color ? [color] : [turn, turn === 'w' ? 'b' : 'w'];
                    for(const side of sides) {
                        const start = side === turn ? position : withTurn(position, side);
                        const trial = new Chess(start);
                        if(side !== turn && (new Chess(position).in_check() || trial.in_check())) continue;
                        const idea = tryMove(trial, mention.input);
                        if(!idea) continue;
                        frames.ideas.push({ ...mention, from: idea.from, to: idea.to, promotion: idea.promotion || '',
                            san: idea.san, color: idea.color, piece: idea.piece, captured: idea.captured,
                            capturedSquare: idea.captured ? idea.flags.includes('e') ? idea.to[0] + idea.from[1] : idea.to : null,
                            kind: /threat/i.test(clause) ? 'threat' : 'plan', beforeFen: start, fen: trial.fen() });
                        positions.length = 0;
                        break;
                    }
                }
                continue;
            }
            board = new Chess(previousFen);
            blocked = false;
            branch++;
            recap = true;
        }
        // A broken line can't host its next move, but that move can still be a root idea or a real past move.
        let primary = !blocked;
        let kind = recap ? 'historical' : board.fen() === new Chess(fen).fen() ? 'current'
            : frames.at(-1)?.kind === 'hypothetical' ? 'hypothetical' : 'continuation';
        const candidates = lines.flat().filter(frame => (!color || new Chess(frame.beforeFen).turn() === color)
            && (typeof mention.input === 'string' ? frame.san.replace(/[+#]/g, '') === mention.input.replace(/[+#]/g, '')
                : frame.from === mention.input.from && frame.to === mention.input.to));
        if(candidates.length && new Set(candidates.map(frame => frame.beforeFen)).size === 1
            && board.fen() !== candidates[0].beforeFen) {
            board = new Chess(candidates[0].beforeFen);
            kind = 'cited';
            branch++;
        }
        if(primary && color && color !== board.turn()) {
            const hypothetical = new Chess(withTurn(board.fen(), color));
            // A turn-switched threat is illustrative, never permission to ignore check.
            if(!board.in_check() && !hypothetical.in_check()) {
                board = hypothetical;
                kind = 'hypothetical';
                if(frames.length) branch++;
            } else primary = false;
        }
        // Narrated history ("arises after 1.e4 e5") is skipped for its own sentence only, so it can't hide later claims.
        const sentence = text.slice(0, mention.index).split(/[.!?]\s+(?=[A-Z])/).at(-1);
        if(/\b(?:arises after|arose after|reached after|was played|position after)\b/i.test(sentence)) continue;
        if(/^\s*Your\s*$/i.test(sentence) && /^\s+(?:moves?|captures?|takes?)\b/i.test(text.slice(mention.end))
            || /^\s*Your\s+\S+\s+(?:moves?|captures?|takes?)\b/i.test(sentence)) continue;
        let beforeFen = board.fen();
        let move = null;
        // A move that is being prevented describes the existing threat, not a reply played after the defence.
        const prevented = /\b(?:stops?|prevent\w*|avoid\w*|dodg\w*|parr(?:y|ies)|neutraliz\w*)\s+(?:the\s+(?:threat\s+of\s+)?)?$/i.test(gap);
        if(primary && prevented && placement(board.fen()) !== placement(rootFen) && !root.in_check()) {
            for(const side of color ? [color] : [board.turn(), board.turn() === 'w' ? 'b' : 'w']) {
                const start = side === root.turn() ? rootFen : withTurn(rootFen, side);
                const trial = new Chess(start);
                if(trial.in_check()) continue;
                move = tryMove(trial, mention.input);
                if(move) { board = trial; beforeFen = start; kind = 'hypothetical'; branch++; break; }
            }
        }
        // "Nf6 develops..." or "I'd play h5" starts a fresh claim about the live position.
        const subject = /(?:^|[.!?]\s+)$/.test(gap) && !/(?<![a-h\d])\d+\.(?:\.\.)?\s*$/.test(gap)
            && /^\s*(?:(?:just|simply|really|also|only|actually|immediately)\s+)?(?:,|and\b|or\b|is\b|was\b|would\b|also\b|does|doesn't|isn't|can\b|could\b|might\b|may\b|should\b|will\b|has\b|had\b|[a-z]+s\b)/i.test(text.slice(mention.end))
            && !/^\s*(?:then|and then)\b/i.test(text.slice(mention.end));
        const recommend = /\bI(?:'d|\s+would|\s+will|'ll)?\s+(?:play|go (?:for|with)|choose|pick|recommend|prefer|start with|suggest)\s*$/i.test(gap);
        if(!move && primary && (subject || recommend) && placement(board.fen()) !== placement(rootFen) && (!color || color === root.turn())) {
            const trial = new Chess(rootFen);
            move = tryMove(trial, mention.input);
            if(move) { board = trial; beforeFen = rootFen; kind = 'current'; branch++; }
        }
        // "Rxd4 or Bxd4" and "Bg7 or Bf8" are two choices from one board.
        const sibling = frames.at(-1);
        if(!move && primary && sibling && !/[.!?]\s+/.test(gap) && /^[\s,]*(?:either\s+)?(?:,\s*)?or\s+(?:even\s+|maybe\s+|perhaps\s+|simply\s+|just\s+)?(?:(?:to|with|via|on)\s+)?(?:(?:a|the|your|their)\s+)?(?:\w+\s+){0,2}?$/i.test(gap)
            && (!color || color === sibling.color)) {
            const trial = new Chess(sibling.beforeFen);
            move = tryMove(trial, mention.input);
            if(move) { board = trial; beforeFen = sibling.beforeFen; kind = 'alternative'; branch++; }
        }
        // "Qxd4 ... then Nf3" skipped a reply from the engine line it is reading, so that line's board is the real one.
        const prior = frames.at(-1);
        if(!move && primary && prior && !restart && evidence.length && !/[.!?]\s+/.test(gap)
            && !/\b(?:or|also|same|too|instead|either|whereas|rather|over|playable|fine|equal)\b/i.test(gap)) {
            const plain = san => san.replace(/[+#!?]/g, '');
            const same = (frame, other) => placement(frame.beforeFen) === placement(other.beforeFen) && plain(frame.san) === plain(other.san);
            for(const line of evidence) {
                const at = line.findIndex(frame => same(frame, prior));
                const next = at < 0 ? -1 : line.findIndex((frame, index) => index > at + 1 && index <= at + 4
                    && (typeof mention.input === 'string' ? plain(frame.san) === plain(mention.input)
                        : frame.from === mention.input.from && frame.to === mention.input.to));
                if(next < 0 || placement(line[next].beforeFen) === placement(board.fen())) continue;
                const trial = new Chess(line[next].beforeFen);
                move = tryMove(trial, mention.input);
                if(move) { board = trial; beforeFen = line[next].beforeFen; kind = 'cited'; break; }
            }
        }
        // "2...Nc6" names its own board, so it can't be played on a board with another move number.
        const numbered = gap.match(/(?<![a-h\d])(\d+)\.(\.\.)?\s*$/);
        const numberFits = !numbered || Number(board.fen().split(' ')[5]) === Number(numbered[1])
            && (!numbered[2] || board.turn() === 'b');
        if(!move && primary && numberFits) move = tryMove(board, mention.input);
        if(!move && previousFen) {
            const previous = new Chess(previousFen);
            const played = previous.move(mention.input);
            if(played && previous.fen() === new Chess(fen).fen()) {
                move = played; board = previous; beforeFen = previousFen; kind = 'historical'; branch++;
            }
        }
        const alternativeClause = /\b(?:though|also|or|same for|fine too|just as good)\b/i.test(gap)
            && !/\b(?:then|after|following|reply|respond)\b/i.test(gap);
        if(!move && (/[.!?]\s*$/.test(gap) || alternativeClause) && !/(?<![a-h\d])\d+\.(?:\.\.)?\s*$/.test(gap)) {
            const alternative = new Chess(fen);
            move = alternative.move(mention.input);
            if(move) { board = alternative; beforeFen = fen; kind = 'alternative'; branch++; }
        }
        const previous = frames.at(-1);
        if(!move && previous && /(?:^|[.!?])\s*After\s*$/i.test(gap)
            && (mention.input === previous.san || typeof mention.input === 'object'
                && mention.input.from === previous.from && mention.input.to === previous.to)) {
            frames.push({ ...previous, ...mention, recap: true });
            continue;
        }
        // A move reaction can recap the move already on the board, before giving a real reply.
        if(!move && /(?:^|[.!?])\s*After\s*$/i.test(gap)) {
            const destination = typeof mention.input === 'object' ? mention.input.to
                : mention.input.match(/([a-h][1-8])(?:=[QRBN])?[+#]?$/)?.[1];
            const piece = destination && board.get(destination);
            if(piece && piece.color !== board.turn()) continue;
        }
        if(!move) {
            const clause = gap.split(/[.!?]\s+/).at(-1);
            const number = Number(gap.match(/(?<![a-h\d])(\d+)\.(?:\.\.)?\s*$/)?.[1] || text.slice(mention.end).match(/^\s+on move (\d+)\b/i)?.[1]) || 0;
            const fits = position => (!color || position.split(' ')[1] === color)
                && (!number || Number(position.split(' ')[5]) === number);
            const options = [];
            // The engine and threat lines Pena was shown fill in moves the prose skipped, when only one board fits.
            const plain = san => san.replace(/[+#!?]/g, '');
            const known = evidence.flat().filter(frame => fits(frame.beforeFen) && (typeof mention.input === 'string'
                ? plain(frame.san) === plain(mention.input) : frame.from === mention.input.from && frame.to === mention.input.to));
            if(known.length && new Set(known.map(frame => placement(frame.beforeFen))).size === 1) {
                const trial = new Chess(known[0].beforeFen);
                move = tryMove(trial, mention.input);
                if(move) { board = trial; beforeFen = known[0].beforeFen; kind = 'cited'; branch++; }
            }
            // "Qg3 and Rf1 are fine too" offers Rf1 from the same board as Qg3.
            if(!move && primary && previous?.branch === branch && !/\b(?:then|after\w*|following|followed|repl\w*|respond\w*|answer\w*|recaptur\w*|meets?|when)\b/i.test(clause))
                options.push([previous.beforeFen, 'alternative']);
            for(const [position, label] of options.splice(0)) {
                const trial = new Chess(position);
                move = fits(position) && tryMove(trial, mention.input);
                if(move) { board = trial; beforeFen = position; kind = label; branch++; break; }
            }
            // "Ke7 and Kd6" or "Bc4+, then Re5+" skips the other side's reply inside one sentence.
            if(!move && primary && previous && !/[.!?]\s+/.test(gap) && board.turn() !== previous.color && (!color || color === previous.color)) {
                const replies = board.in_check() ? board.moves().slice(0, 60) : [null];
                for(const reply of replies) {
                    const trial = new Chess(reply ? board.fen() : withTurn(board.fen(), previous.color));
                    if(reply) trial.move(reply);
                    else if(trial.in_check()) break;
                    const start = trial.fen();
                    move = tryMove(trial, mention.input);
                    if(move) { board = trial; beforeFen = start; kind = 'continuation'; break; }
                }
            }
            // Right after a broken move in the same sentence, the next one belongs to that broken line.
            const broken = blocked && !/[.!?]\s+/.test(gap);
            if(!move && !broken) options.push([rootFen, 'alternative']);
            if(!move && !broken && !root.in_check()) options.push([withTurn(rootFen, root.turn() === 'w' ? 'b' : 'w'), 'hypothetical']);
            // "Kf1 was the better try" is an alternative to the move that was really played.
            if(!move && past.length && /\b(?:better|instead|should have|could have|would have|was the|missed)\b/i.test(clause + text.slice(mention.end, mention.end + 40)))
                options.push([past.at(-1), 'historical']);
            for(const [position, label] of options) {
                if(!fits(position)) continue;
                const trial = new Chess(position);
                if(label === 'hypothetical' && trial.in_check()) continue;
                move = tryMove(trial, mention.input);
                if(move) { board = trial; beforeFen = position; kind = label; branch++; break; }
            }
            // Past moves need the exact board they were played on. A numbered move may be a better
            // alternative on that board, otherwise only the move that really followed counts.
            for(let index = past.length - 1; !move && index >= 0; index--) {
                if(!fits(past[index]) || !number && !color && !/\b(?:was|were|had|played|earlier|last|ago|previous)\b/i.test(clause + text.slice(mention.end, mention.end + 40))) continue;
                const trial = new Chess(past[index]);
                const played = tryMove(trial, mention.input);
                const next = past[index + 1] || rootFen;
                if(played && (number || placement(trial.fen()) === placement(next))) {
                    move = played; board = trial; beforeFen = past[index]; kind = 'historical'; branch++;
                }
            }
        }
        if(!move) {
            frames.unresolved.push({ ...mention, status: 'unsupported', reason: 'No legal move in the discussed position.' });
            blocked = true;
            continue;
        }
        blocked = false;
        frames.push({ ...mention, branch, from: move.from, to: move.to, promotion: move.promotion || '',
            san: move.san, color: move.color, piece: move.piece, captured: move.captured,
            capturedSquare: move.captured ? move.flags.includes('e') ? move.to[0] + move.from[1] : move.to : null,
            kind, beforeFen, fen: board.fen() });
    }
    frames.incomplete = blocked;
    return frames;
}

// Labels sit on the middle of what they name. The offset from the nearest square is in whole squares.
export function labelPlacement(squares) {
    const file = squares.reduce((sum, square) => sum + square.charCodeAt(0), 0) / squares.length;
    const rank = squares.reduce((sum, square) => sum + Number(square[1]), 0) / squares.length;
    const distance = square => (square.charCodeAt(0) - file) ** 2 + (Number(square[1]) - rank) ** 2;
    const anchor = squares.reduce((best, square) => distance(square) < distance(best) ? square : best);
    return { anchor, offset: [file - anchor.charCodeAt(0), rank - Number(anchor[1])] };
}

export function boardRegions(text, fen, { focus = null, color = null } = {}) {
    text = literalChessText(text);
    const board = new Chess(fen);
    color ??= board.get(focus)?.color || board.turn();
    const regions = [];
    const add = (label, squares) => {
        if(!squares.length || regions.some(region => region.label === label)) return;
        regions.push({ label, squares, anchor: labelPlacement(squares).anchor });
    };
    if(/\bqueen[ -]?side\b/i.test(text)) add('Queenside', SQUARES.filter(square => square[0] <= 'd'));
    if(/\bking[ -]?side\b/i.test(text)) add('Kingside', SQUARES.filter(square => square[0] >= 'e'));
    if(/\b(?:extended|broad) cent(?:er|re)\b/i.test(text))
        add('Extended center', SQUARES.filter(square => /[c-f][3-6]/.test(square)));
    else if(/\bcent(?:er|re|ral)\b/i.test(text)) add('Center', ['d4', 'e4', 'd5', 'e5']);
    for(const match of text.matchAll(/\b([a-h])[- ]file\b|\bfile\s+([a-h])\b/gi)) {
        const file = (match[1] || match[2]).toLowerCase();
        add(`${file}-file`, SQUARES.filter(square => square[0] === file));
    }
    for(const match of text.matchAll(/\b([1-8])(?:st|nd|rd|th)?[- ]rank\b|\brank\s+([1-8])\b/gi)) {
        const rank = match[1] || match[2];
        add(`Rank ${rank}`, SQUARES.filter(square => square[1] === rank));
    }
    const ranks = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8' };
    for(const match of text.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth)[- ]rank\b/gi))
        add(`Rank ${ranks[match[1].toLowerCase()]}`, SQUARES.filter(square => square[1] === ranks[match[1].toLowerCase()]));
    for(const match of text.matchAll(/\b([a-h][1-8])\s*[-\u2013]\s*([a-h][1-8])\b/g)) {
        const [from, to] = match.slice(1);
        const dx = to.charCodeAt(0) - from.charCodeAt(0), dy = Number(to[1]) - Number(from[1]);
        if(dx === 0 && Math.abs(dy) === 7) {
            add(`${from[0]}-file`, SQUARES.filter(square => square[0] === from[0]));
            continue;
        }
        if(dy === 0 && Math.abs(dx) === 7) {
            add(`Rank ${from[1]}`, SQUARES.filter(square => square[1] === from[1]));
            continue;
        }
        if(Math.abs(dx) !== Math.abs(dy) || Math.abs(dx) < 2) continue;
        add(`${from}-${to}`, Array.from({ length: Math.abs(dx) + 1 }, (_, step) =>
            String.fromCharCode(from.charCodeAt(0) + step * Math.sign(dx)) + (Number(from[1]) + step * Math.sign(dy))));
    }
    for(const color of ['light', 'dark']) {
        if(new RegExp(`\\b${color}[- ]squares?\\b`, 'i').test(text))
            add(`${color} squares`, SQUARES.filter(square =>
                (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === (color === 'dark' ? 1 : 0)));
    }
    if(/\bback rank\b/i.test(text)) {
        const side = /\bwhite\b/i.test(text) ? 'w' : /\bblack\b/i.test(text) ? 'b' : color;
        add('Back rank', SQUARES.filter(square => square[1] === (side === 'w' ? '1' : '8')));
    }
    if(/\b(?:long|light[- ]squared?|dark[- ]squared?) diagonals?\b/i.test(text)) {
        const named = /\b(?:on|from)\s+([a-h][1-8])\b/i.exec(text)?.[1];
        const bishop = named || (board.get(focus)?.type === 'b' ? focus : null);
        const parity = bishop ? (bishop.charCodeAt(0) - 97 + Number(bishop[1])) % 2
            : /\bdark/i.test(text) ? 1 : /\blight/i.test(text) ? 0 : null;
        if(parity === null || parity === 1)
            add('Long diagonal a1-h8', SQUARES.filter(square => square.charCodeAt(0) - 96 === Number(square[1])));
        if(parity === null || parity === 0)
            add('Long diagonal h1-a8', SQUARES.filter(square => square.charCodeAt(0) - 96 + Number(square[1]) === 9));
    } else if(/\bdiagonal\b/i.test(text) && !regions.some(region => /^[a-h][1-8]-/.test(region.label))) {
        const named = /\b([a-h][1-8])[- ](?:bishop|queen|rook|knight|king|pawn)\b/i.exec(text)?.[1]
            || /\b(?:on|from)\s+([a-h][1-8])\b/i.exec(text)?.[1];
        const square = named || (['b', 'q'].includes(board.get(focus)?.type) ? focus : null);
        if(square && (!named || !board.get(square) || ['b', 'q'].includes(board.get(square)?.type))) {
            for(const sign of [-1, 1]) {
                const line = SQUARES.filter(target => Number(target[1]) - Number(square[1])
                    === sign * (target.charCodeAt(0) - square.charCodeAt(0)));
                if(line.length > 2) add(`Diagonal ${line[0]}-${line.at(-1)}`, line);
            }
        }
    }
    const king = SQUARES.find(square => board.get(square)?.type === 'k' && board.get(square)?.color === color);
    if(king && /\b(?:king safety|secur\w* (?:the |your )?king|king (?:safe|expos\w*|shelter)|castl\w*)\b/i.test(text)) {
        add('King shelter', SQUARES.filter(square => Math.abs(square.charCodeAt(0) - king.charCodeAt(0)) <= 1
            && Math.abs(Number(square[1]) - Number(king[1])) <= 1));
    }
    if(/\b(?:(?:un)?develop\w*|active (?:piece|bishop|knight)|piece activity)\b/i.test(text)) {
        const minorFocus = ['b', 'n'].includes(board.get(focus)?.type) && board.get(focus).color === color ? focus : null;
        const squares = SQUARES.filter(square => {
            const piece = board.get(square);
            return piece?.color === color && ['b', 'n'].includes(piece.type)
                && (minorFocus ? square === minorFocus : square[1] === (color === 'w' ? '1' : '8'));
        });
        const namedPiece = text.match(/\b(knight|bishop)s?\b/i)?.[1].toLowerCase();
        add(minorFocus && namedPiece ? `${color === 'w' ? 'White' : 'Black'} ${namedPiece}: ${minorFocus}`
            : /undeveloped/i.test(text) || !minorFocus ? 'Pieces to develop'
                : minorFocus[1] === (color === 'w' ? '1' : '8') ? 'Piece to develop' : 'Active piece', squares);
    }
    if(/\b(?:connect\w* (?:the )?rooks|rook (?:coordination|battery)|doubl\w* (?:the )?rooks)\b/i.test(text)) {
        add('Rooks working together', SQUARES.filter(square => board.get(square)?.type === 'r' && board.get(square)?.color === color));
    }
    if(/\b(?:pawn (?:chain|structure)|connected pawns)\b/i.test(text)) {
        const pawns = SQUARES.filter(square => board.get(square)?.type === 'p' && board.get(square)?.color === color);
        add('Pawn structure', pawns);
    }
    if(/\b(?:outpost|blockad\w*|central (?:square|outpost)|space advantage)\b/i.test(text)) {
        if(focus) add(`Key square ${focus}`, [focus]);
        else if(/\bcentral (?:space|square)\b/i.test(text))
            add('Central space', ['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5']);
    }
    return regions;
}

export function moveArrows(frame) {
    const arrows = [[frame.from, frame.to]];
    if(/^O-O/.test(frame.san)) {
        const rank = frame.from[1], kingside = frame.to[0] === 'g';
        arrows.push([(kingside ? 'h' : 'a') + rank, (kingside ? 'f' : 'd') + rank]);
    }
    return arrows;
}

export function boardReferences(text, fen, context = text) {
    const offset = context.endsWith(text) ? context.length - text.length : 0;
    const allFrames = variationFrames(context, fen);
    const frames = allFrames.filter(frame => frame.index >= offset);
    const discussed = allFrames.at(-1);
    const discussedFen = discussed?.fen || fen;
    const squares = new Set([...text.matchAll(/\b[a-h][1-8]\b/g)].map(match => match[0]));
    const moves = [];
    for(const move of frames) {
        const arrows = moveArrows(move);
        moves.push(...arrows);
        arrows.flat().forEach(square => squares.add(square));
    }
    // A bare piece name is only useful if it identifies one current piece.
    for(const match of text.matchAll(/\b(?:(white|black)\s+)?(king|queen|rook|bishop|knight|pawn)\b/gi)) {
        const type = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }[match[2].toLowerCase()];
        const color = { white: 'w', black: 'b' }[match[1]?.toLowerCase()];
        const original = new Chess(discussedFen);
        const candidates = SQUARES.filter(square => {
            const piece = original.get(square);
            return piece?.type === type && (!color || piece.color === color);
        });
        if(candidates.length === 1) squares.add(candidates[0]);
    }
    const relations = [];
    if(/\b(?:attack\w*|defend\w*|protect\w*|fork\w*|pin\w*|hanging|undefended)\b/i.test(text)) {
        const position = new CaptureExchange(discussedFen);
        for(const target of squares) {
            const index = (8 - Number(target[1])) * 8 + target.charCodeAt(0) - 97;
            for(const color of ['w', 'b']) {
                for(const source of position.attackersTo(index, color)) {
                    const from = 'abcdefgh'[source % 8] + (8 - Math.floor(source / 8));
                    relations.push([from, target]);
                }
            }
        }
    }
    return { squares: [...squares].slice(0, 12), moves: moves.slice(0, 8), frames,
        regions: boardRegions(text, discussedFen, { focus: discussed?.to,
            color: discussed ? new Chess(discussed.beforeFen).turn() : null }), relations: relations.slice(0, 6) };
}

export class PenaTeacher {
    constructor(instance, profile = 'default') {
        this.instance = instance;
        this.profile = profile;
        this.elements = [];
        this.markings = [];
    }

    clear(external = true) {
        clearTimeout(this.persistentTimer);
        this.persistentTimer = null;
        clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
        for(const marking of this.markings) clearTimeout(marking.timer);
        const owned = new Set(this.elements);
        this.elements.forEach(element => element.remove());
        if(this.drawer) this.drawer.addedShapes = this.drawer.addedShapes.filter(shape => !owned.has(shape.element));
        this.elements = [];
        this.markings = [];
        if(external) {
            this.send([], this.instance.currentFen, 0);
            penaVisualsChanged(this.instance);
        }
    }

    fade() {
        if(this.fadeTimer || !this.markings.length) return;
        for(const marking of this.markings) {
            clearTimeout(marking.timer);
            marking.element?.animate?.([{ opacity: 0 }], { duration: 180, fill: 'forwards' });
            marking.shape.expiresAt = Math.min(marking.shape.expiresAt, Date.now() + 180);
            marking.shape.fadeAt = Date.now();
            marking.shape.persistent = false;
        }
        clearTimeout(this.persistentTimer);
        this.publish(this.instance.currentFen);
        penaVisualsChanged(this.instance);
        this.fadeTimer = setTimeout(() => this.clear(), 180);
    }

    send(shapes, fen, duration) {
        const revision = this.revision = ++teachingRevision;
        const send = this.instance.CommLink?.commands?.renderVisualsToSite;
        if(!send) return;
        const expiresAt = Date.now() + duration;
        Promise.resolve(shapes.length ? this.instance.getConfigValue('displayMovesOnExternalSite', this.profile) : false)
            .then(enabled => {
                if(this.revision !== revision) return;
                const current = this.instance.currentFen === fen && !this.instance.instanceClosed
                    && !(typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE);
                const entries = enabled && current && Date.now() < expiresAt ? shapes : [];
                const metadata = { profileID: this.profile, category: 'pena-teaching', positionFen: fen,
                    teachingRevision: revision, expiresAt };
                return send(entries.length ? entries.map(shape => ({ ...metadata, ...shape })) : [metadata]);
            }).catch(error => console.error('[Pena external teaching]', error));
    }

    show(text, fen, { context = text, fullAdvice = false, duration = 1600, references = null, line = null, persistent = false } = {}) {
        if(this.fadeTimer) this.clear();
        if((typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE) || this.instance.currentFen !== fen) {
            this.clear();
            return;
        }
        const frames = line?.frames || (fullAdvice ? variationFrames(context, fen) : []);
        const future = line ? frames[line.index] : frames.at(-1);
        // Learning mode can show an earlier position on the GUI board, so live cues go to Pena's own board.
        const reviewing = !future && this.instance.displayFen && this.instance.displayFen !== fen;
        const drawer = (future || reviewing) && this.showVariation
            ? this.showVariation(future ? frames : [], line ? line.index : frames.length - 1, Boolean(line?.before)) : this.instance.BoardDrawer;
        if(drawer?.terminated) { this.clear(); return; }
        const orientation = drawer?.orientation || this.instance.boardState?.boardOrientation || 'w';
        const position = `${future ? line?.before ? future.beforeFen : future.fen : fen}|${orientation}`;
        if(this.drawer !== drawer || this.position !== position) this.clear();
        this.drawer = drawer;
        this.position = position;
        if(future && frames.incomplete && !line) return;
        const { squares, regions, relations, frames: referencedFrames, moves } = references || boardReferences(text, fen, context);
        const plans = references?.plans || plannedMoves(text, future?.fen || fen, { includeIdeas: true })
            .filter(plan => !referencedFrames.some(frame => frame.from === plan.from && frame.to === plan.to));
        const added = [];
        const draw = (shapeType, shapeSquare, shapeConfig) => {
            const key = JSON.stringify([shapeType, shapeSquare,
                shapeType === 'text' ? shapeConfig.text : shapeConfig.style]);
            const existing = this.markings.find(marking => marking.key === key);
            if(existing) {
                clearTimeout(existing.timer);
                existing.animation?.cancel?.();
                existing.shape.expiresAt = Date.now() + duration;
                existing.shape.fadeAt = persistent ? null : Date.now() + duration * 0.8;
                existing.persistent = existing.shape.persistent = persistent;
                if(!persistent) existing.animation = existing.element?.animate?.(
                    [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration, fill: 'forwards' });
                added.push(existing);
                if(shapeType !== 'text') {
                    existing.shape.teachingPulse++;
                    existing.element?.animate?.([{ strokeOpacity: 0.4 }, { strokeOpacity: 1 }, { strokeOpacity: 0.4 }],
                        { duration: 320 });
                }
                return;
            }
            if(shapeType === 'text') {
                const [x = 0, y = 0] = shapeConfig.position || [];
                const occupied = this.markings.filter(marking => marking.shape.shapeType === 'text'
                    && marking.shape.shapeSquare === shapeSquare).map(marking => marking.shape.shapeConfig.position || [0, 0]);
                let offset = y;
                while(occupied.some(([otherX, otherY]) => Math.abs(otherX - x) < 1 && Math.abs(otherY - offset) < 0.5))
                    offset += 0.6;
                shapeConfig = { ...shapeConfig, position: [x, offset] };
            }
            const element = drawer?.createShape(shapeType, shapeSquare, shapeConfig);
            if(element || !drawer) {
                const shape = { shapeType, shapeSquare, shapeConfig, teachingID: ++teachingRevision,
                    teachingPulse: 0, expiresAt: Date.now() + duration, persistent,
                    fadeAt: persistent ? null : Date.now() + duration * 0.8 };
                const marking = { key, element, shape, drawer, external: !future, persistent };
                added.push(marking);
                this.markings.push(marking);
                if(element) this.elements.push(element);
                if(!persistent) marking.animation = element?.animate?.([{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
                    { duration, fill: 'forwards' });
            }
        };
        for(const region of regions) {
            const color = region.color || (region.label === 'Queenside' ? '#b197fc' : '#74c0fc');
            const broad = region.squares.length > 16;
            for(const square of region.squares) {
                draw('rectangle', square, { style: `fill:${color}; fill-opacity:${broad ? 0.45 : 0.6}; stroke:${color}; stroke-opacity:0.9; stroke-width:2px;` });
            }
            const { anchor, offset } = labelPlacement(region.squares);
            // Drawer offsets are in half squares and ignore orientation, so flip them for Black.
            const [dx, dy] = offset.map(value => value * 2 * (orientation === 'b' ? -1 : 1));
            draw('text', anchor, {
                text: region.label + ({ Kingside: ' (e-h)', Queenside: ' (a-d)' }[region.label] || ''),
                size: 1.25, position: [dx, dy],
                style: 'fill:#fff; stroke:#191919; stroke-width:2px; paint-order:stroke; font-weight:600;'
            });
        }
        const style = 'fill:#ffd166; fill-opacity:0.7; stroke:#fff; stroke-width:0.5%; rx:5px; ry:5px;';
        for(const square of squares) {
            draw('rectangle', square, { style });
        }
        for(const move of moves) {
            const frame = referencedFrames.find(frame => moveArrows(frame).some(arrow => arrow[0] === move[0] && arrow[1] === move[1]));
            const illustrative = !line && frame && frame.beforeFen !== new Chess(fen).fen();
            draw('arrow', move, moveArrowConfig(illustrative ? 'future' : 'best', '#ffd166', 0.85));
            if(illustrative) draw('text', move[1], { text: `Line: ${frame.san}`, size: 1.2, position: [0, 0.6],
                style: 'fill:#fff; stroke:#191919; stroke-width:1px; paint-order:stroke;' });
        }
        for(const plan of plans) {
            draw('arrow', [plan.from, plan.to], moveArrowConfig('future', null, 0.85));
            draw('text', plan.to, { text: plan.label.startsWith('Idea') ? 'Idea' : 'Plan', size: 1.2, position: [0, 0.6],
                style: 'fill:#fff; stroke:#191919; stroke-width:1px; paint-order:stroke;' });
        }
        for(const relation of relations) {
            draw('arrow', [relation[0], relation[1]], moveArrowConfig('future', null, 0.85));
        }
        if(added.length && !persistent) {
            for(const marking of added) {
                marking.timer = setTimeout(() => {
                    marking.element?.remove();
                    if(drawer) drawer.addedShapes = drawer.addedShapes.filter(shape => shape.element !== marking.element);
                    this.markings = this.markings.filter(item => item !== marking);
                    this.elements = this.elements.filter(element => element !== marking.element);
                    this.publish(fen);
                    penaVisualsChanged(this.instance);
                }, duration);
            }
        }
        if(persistent) {
            clearTimeout(this.persistentTimer);
            const renew = () => {
                if(this.instance.currentFen !== fen || this.instance.instanceClosed || this.drawer?.terminated
                    || typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE) {
                    this.clear();
                    return;
                }
                for(const marking of this.markings.filter(item => item.persistent)) marking.shape.expiresAt = Date.now() + 3000;
                this.publish(fen);
                penaVisualsChanged(this.instance);
                this.persistentTimer = setTimeout(renew, 1000);
            };
            renew();
        } else this.publish(fen);
        penaVisualsChanged(this.instance);
    }

    publish(fen) {
        const shapes = this.markings.filter(marking => marking.external && marking.shape.expiresAt > Date.now())
            .map(marking => marking.shape);
        const duration = Math.max(0, ...shapes.map(shape => shape.expiresAt - Date.now()));
        this.send(shapes, fen, duration);
    }

    delayFor(fen) {
        if(this.drawer?.terminated || this.position?.split('|')[0] === fen) return 0;
        return Math.max(0, ...this.markings.filter(marking => !marking.persistent).map(marking => marking.shape.expiresAt - Date.now()));
    }
}
