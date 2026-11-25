import { groundedCoachingInput } from './engine-coaching-input.js';
import { rebuildCoachingNotes } from './conversation.js';
export { rebuildCoachingNotes } from './conversation.js';

export function recordToCoachingArguments({ record, asked = [], fen, history, playerColor, question, conversation = [], legacyEvidence }) {
    if(record?.fen !== fen) throw new Error('Live source record does not match its board.');
    const lines = (record.engine?.lines || []).slice(0, 2).map((line, index) => ({ ...line, id: `L${index + 1}` }));
    for(const [index, line] of asked.entries()) {
        if(lines.length >= 4) break;
        if(line.pv?.length && line.pv[0] === line.uci) lines.push({ ...line, id: line.inputAlias || `A${index + 1}` });
    }
    const source = record.engine.depth === 0 && lines.length === 0 ? { kind: 'legal-analysis-only' }
        : { kind: 'saved-stockfish-analysis', depth: record.engine.depth,
            ...(lines.some(line => line.id === 'L1') ? { preferredLineId: 'L1' } : {}) };
    const evaluations = lines.filter(line => Number.isSafeInteger(line.score?.cp)
        || Number.isSafeInteger(line.score?.mate) && line.score.mate !== 0).map(line => ({ lineId: line.id,
        perspective: 'root-side-to-move', score: Number.isSafeInteger(line.score.mate) && line.score.mate !== 0
            ? { kind: 'mate', value: line.score.mate } : { kind: 'cp', value: line.score.cp } }));
    return { fen, history, playerColor, question, conversation, maxPlies: 6,
        continuations: lines.filter(line => line.pv?.length).map(line => ({ id: line.id, moves: line.pv.slice(0, 6) })),
        source, evaluations, legacyEvidence };
}

export async function compileAppCoachingSource(snapshot) {
    const prepared = rebuildCoachingNotes(snapshot);
    const sourcePromptSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(prepared.prompt)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const { fen, history = [], playerColor, question, asked = [] } = prepared.notesSnapshot;
    const args = recordToCoachingArguments({ record: prepared.record, asked, fen, history, playerColor, question,
        conversation: prepared.history.map(({ player, pena }) => ({ player, pena })),
        legacyEvidence: { kind: 'saved-v1-factsheet', fen, sourcePromptSha256, text: prepared.sheet.text } });
    return { args, prepared, notesSource: 'shared-live-producer' };
}

export async function liveSourceArguments({ prepared, fen, history, playerColor, question }) {
    const snapshot = prepared?.notesSnapshot;
    if(!snapshot || snapshot.fen !== fen || snapshot.playerColor !== playerColor || snapshot.question !== question
        || JSON.stringify(snapshot.history || []) !== JSON.stringify(history || []))
        throw new Error('Live coaching requires its exact current structured source snapshot.');
    const rebuilt = await compileAppCoachingSource(snapshot);
    if(prepared.sheet.text !== rebuilt.prepared.sheet.text || prepared.prompt !== rebuilt.prepared.prompt)
        throw new Error('Prepared GUI notes differ from the shared live producer.');
    return rebuilt.args;
}

export async function liveCoachingInput(args) {
    return groundedCoachingInput({ ...await liveSourceArguments(args), engineEvidence: args.engineEvidence });
}
