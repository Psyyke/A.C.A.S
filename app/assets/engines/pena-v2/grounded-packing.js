const relationDictionary = 'V4 relation dictionary: w/b=White/Black; P/N/B/R/Q/K=piece type; @=square. '
    + 'enemyTargets is outgoing geometric attack; attackers is incoming enemy attack; defenders is incoming friendly defense. '
    + 'S rows are COMPLETE for the listed moved pieces. NONE means empty, N/A means the piece is not on move. '
    + 'check describes the actual side to move in that labelled frame. Geometric targets do NOT establish legal or safe captures. '
    + 'CURRENT C.square columns are piece|incoming enemy attackers|friendly defenders|outgoing enemy targets. '
    + 'Relation cells are squares resolved by the complete CURRENT ledger, not moves. All three relation lists are COMPLETE. '
    + '+attack/+defend/+control are gained geometry; -attack is lost geometry, not a legal capture or safe win.';

const phrases = [
    [relationDictionary, 'RELATIONS: w/b=White/Black; P/N/B/R/Q/K=piece types; @=square. '
        + 'C.square=piece|incoming enemy attackers|friendly defenders|outgoing enemy targets; all lists COMPLETE, squares resolved by CURRENT ledger, not moves. '
        + 'S/LC.S=COMPLETE occupied relations of ALL moved pieces after FIRST conditional move only, not leaf/live. '
        + 'NONE=empty; N/A=not on move; check=actual side-to-move check. '
        + '+attack/+defend/+control=gained geometry; -attack=lost geometry. Geometry!=legal/safe capture or forced win.'],
    ['CURRENT and CONDITIONAL facts are labelled separately; a supplied continuation does not update the live board.',
        'CURRENT!=CONDITIONAL; supplied continuation not played.'],
    ['Rules facts are exact for their labelled board. Geometric attacks/defenses include pinned pieces and do not establish safe captures. Engine estimates and human-choice probabilities have separate meanings. Previous assistant messages are not chess evidence.',
        'RULES: exact labelled-board geometry, including pins, not capture safety. Engine values!=human choice. Prior assistant text!=chess evidence.'],
    ['Saved v1 definitions below retain their original Stockfish/context provenance, not fresh LC0. Legacy IDs mean these definitions. An annotation is not a forced-outcome proof. Semantic/visual compatibility remains separately audited.',
        'SAVED V1: original Stockfish/context definitions, not fresh LC0. Legacy IDs bind here; annotations!=forced proof. Semantic/visual audit separate.'],
    ['NEW ENGINE CONTEXT: w/b=White/Black. LC*=current LC0 search, not the saved Stockfish L/A definitions. N=actual visits, P=network move prior, Q=bounded root-side searched value. None is calibrated confidence or an explanation. IF lines are legal sampled continuations, not forced or played. MC*=Maia human choice, not strength/win probability.',
        'ENGINES: LC*=current LC0, not saved Stockfish L/A. N=actual visits; P=network move prior; Q=bounded root-side searched value, not calibrated confidence/reasons. IF=legal sampled PV, not forced/played. MC*=Maia human choice, not strength/win odds. Elo=self/opponent model conditions, not observed ratings.'],
    ['No draw probability or moves-left prediction is inferred from placeholder search fields without declared network heads.',
        'Draw/moves-left unavailable without declared network heads; placeholders!=predictions.'],
    ['Bounded engine estimate, not material or a statement of the engine\'s internal reason.',
        'Bounded engine estimate!=material/internal reason.']
];

function transform(text, unpack) {
    let legacy = false;
    const states = new Map();
    return text.split('\n').map(line => {
        const start = line.startsWith(unpack ? 'SAVED V1:' : 'Saved v1 definitions below');
        if(/^\[(?:S\.|LC\d)/.test(line) || line.startsWith(unpack ? 'ENGINES:' : 'NEW ENGINE CONTEXT:')) legacy = false;
        if(legacy) return line;
        let result = line;
        if(unpack) {
            const state = result.match(/^\[([^\]]+)\] FIRST [A-Z]+\d+: (.*?)( Exact first-move changes:.*)?$/);
            if(state) {
                const alias = state[2].match(/^sameRelations=([^ ]+)$/);
                if(alias) {
                    if(!states.has(alias[1])) throw new Error('Unknown complete-relation alias.');
                    result = result.replace(state[2], states.get(alias[1]));
                }
                states.set(state[1], alias ? states.get(alias[1]) : state[2]);
            }
            result = result.replace(/^(\[S\.([LA]\d+)\]) FIRST \2: /,
                '$1 CONDITIONAL $2 first move, not played. Complete occupied relations of ALL moved pieces: ')
                .replace(/^(\[(LC\d+)\.S\]) FIRST \2: /,
                    '$1 IF $2, after FIRST move only, not the leaf/live board. Complete occupied relations of ALL moved pieces: ')
                .replace(/(legal(?:Moves|Captures)=)N\/A(?=;| Exact| \||$)/g, '$1N/A(other-side-to-move)')
                .replace(/^(\[MC\d+\] Maia-3 [wb]:.*), P=([^,]+), Elo=(\d+\/\d+)\.$/,
                    '$1, human-choice P=$2, configured self/opponent Elo=$3. These are model conditions, not observed player ratings.')
                .replace(/^OmittedEffects=(\d+); omission!=false; unknown=evals\/unsearched alternatives\/longer PVs\. Cite defined IDs with exact actor\/relation\/frame\.$/,
                    'Other exact effects omitted: $1. Omitted is not false. Unknown evaluations, unsearched alternatives and longer continuations remain unknown. Cite only defined IDs, with their actual actor, relation and frame.');
            for(const [long, short] of [...phrases].reverse()) result = result.replaceAll(short, long);
        } else {
            for(const [long, short] of phrases) result = result.replaceAll(long, short);
            result = result.replace(/^(\[S\.([LA]\d+)\]) CONDITIONAL \2 first move, not played\. Complete occupied relations of ALL moved pieces: /, '$1 FIRST $2: ')
                .replace(/^(\[(LC\d+)\.S\]) IF \2, after FIRST move only, not the leaf\/live board\. Complete occupied relations of ALL moved pieces: /, '$1 FIRST $2: ')
                .replaceAll('N/A(other-side-to-move)', 'N/A')
                .replace(/^(\[MC\d+\] Maia-3 [wb]:.*), human-choice P=([^,]+), configured self\/opponent Elo=(\d+\/\d+)\. These are model conditions, not observed player ratings\.$/,
                    '$1, P=$2, Elo=$3.')
                .replace(/^Other exact effects omitted: (\d+)\. Omitted is not false\. Unknown evaluations, unsearched alternatives and longer continuations remain unknown\. Cite only defined IDs, with their actual actor, relation and frame\.$/,
                    'OmittedEffects=$1; omission!=false; unknown=evals/unsearched alternatives/longer PVs. Cite defined IDs with exact actor/relation/frame.');
            const state = result.match(/^\[([^\]]+)\] FIRST [A-Z]+\d+: (.*?)( Exact first-move changes:.*)?$/);
            if(state) {
                const same = [...states].find(([, payload]) => payload === state[2]);
                if(same) result = result.replace(state[2], `sameRelations=${same[0]}`);
                states.set(state[1], state[2]);
            }
        }
        if(start) legacy = true;
        return result;
    }).join('\n');
}

export function unpackGroundedEvidence(text) { return transform(text, true); }

export function packGroundedEvidence(text) {
    const packed = transform(text, false);
    if(unpackGroundedEvidence(packed) !== text) throw new Error('Grounded evidence packing is not lossless.');
    return packed;
}

export function packGroundedMessages(messages, question) {
    const last = messages.at(-1), suffix = `\n\nPlayer question: ${question}`;
    if(last?.role !== 'user' || !last.content.startsWith('Verified evidence:\n') || !last.content.endsWith(suffix))
        throw new Error('Unexpected grounded evidence envelope.');
    const content = packGroundedEvidence(last.content.slice(0, -suffix.length)) + suffix;
    return messages.map((message, index) => index === messages.length - 1 ? { ...message, content } : { ...message });
}
