import test from 'node:test';
import assert from 'node:assert/strict';
import { appTopics, appNotes, searchKnowledge, profileSummary, unsupportedNumbers } from '../appnotes.js';
import { PenaConversation, chatSheet, checkReply } from '../conversation.js';
import { knowledge } from '../knowledge.js';

const italian = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
const snapshot = {
    profiles: [profileSummary('Default', { chessEngine: 'maia3', engineElo: 1500, engineEnemyElo: 1400, moveSuggestionAmount: 2, learningMode: true,
        dynamicSettings: { engineElo: { enabled: true, variable: 'evaluation' } } }, true)],
    others: ['Blitz'],
    pena: {},
    match: { site: 'lichess.org', color: 'b', fen: italian }
};
const fakeEngine = () => ({
    lines: async (fen, { multipv }) => [{ move: 'g8f6', pv: ['g8f6'], depth: 12, score: { cp: -20, mate: null } }].slice(0, multipv),
    compare: () => ({ label: 'Best Move', reason: 'Top choice.' })
});

test('app notes only wake up for questions about A.C.A.S, the site or the match', () => {
    for(const message of ['what does the engine think', 'what are my options here', 'how do I attack the king', 'is my opponent threatening',
        'my attack is not working', 'hi pena', 'why is Nf3 good']) {
        assert.deepEqual(appTopics(message), { app: false, match: false }, message);
    }
    for(const message of ['how do I make the engine weaker', 'Pena is not talking', 'why is pena so quiet', 'what elo is my profile set to'])
        assert.ok(appTopics(message).app, message);
    for(const message of ['how much time do I have', 'who is my opponent', 'what site am I on']) assert.ok(appTopics(message).match, message);
    assert.equal(appNotes('why is Nf3 good', snapshot).text, '');
});

test('app notes find the guide section a question needs', () => {
    const title = query => searchKnowledge(query)[0]?.chunk.title;
    assert.match(title('how do I make the engine weaker'), /Engine Elo/);
    assert.match(title('pena needs webgpu?'), /Pena/);
    assert.match(title('how do I set up dynamic settings'), /Dynamic Settings/);
    assert.match(title('why is the floating panel not showing'), /Floating Panel/);
    assert.deepEqual(searchKnowledge('hello there'), []);
});

test('app notes describe the setup, admit what is unknown and carry over to short follow ups', () => {
    const first = appNotes('how do I make the engine weaker', snapshot);
    assert.match(first.notes.S1.text, /Profile "Default" is running with Maia 3 at Engine Elo 1500 and Opponent Elo 1400/);
    assert.match(first.notes.S1.text, /Engine Elo follows Evaluation/);
    assert.match(first.notes.S3.text, /Don't give away moves off/);
    assert.doesNotMatch(first.notes.S3.text, /Explanation (?:Brief|Dynamic|Full)/);
    assert.ok(first.notes.U1 && !first.notes.G1);
    const previous = { topics: first.topics, usage: first.usage };
    const next = appNotes('ok and then what?', snapshot, { previous });
    assert.ok(next.topics.carried && next.notes.U1);
    assert.equal(appNotes('how do I turn it off?', snapshot, { previous }).notes.U1.text, first.notes.U1.text);
    assert.equal(appNotes('Nxe5 then?', snapshot, { previous: { topics: first.topics, usage: first.usage } }).text, '');
    assert.equal(appNotes('and what about this position?', snapshot, { previous: { topics: first.topics, usage: first.usage } }).text, '');
    const clock = appNotes('how much time do I have left', snapshot);
    assert.match(clock.notes.G1.text, /lichess\.org, you play Black/);
    assert.match(clock.notes.G2.text, /can't see the clock/);
    assert.ok(!clock.notes.S1);
});

test('numbers about the setup must come from the cited notes unless Pena is suggesting', () => {
    const { notes } = appNotes('what elo is my profile set to', snapshot);
    assert.deepEqual(unsupportedNumbers('Your Engine Elo is 1700 [S1].', notes), ['1700']);
    assert.deepEqual(unsupportedNumbers('Your Engine Elo is 1500 [S1].', notes), []);
    assert.deepEqual(unsupportedNumbers('Try 1200 instead [S1].', notes), []);
    const record = { fen: italian, engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'b', app: appNotes('what elo is my profile set to', snapshot) });
    const result = checkReply('Engine Elo is 1500 right now [S1]. Opponent Elo is 1900 [S1]. Drop it to 1200 if it feels too strong [S1].', sheet, { record });
    assert.equal(result.text, 'Engine Elo is 1500 right now. Drop it to 1200 if it feels too strong.');
    assert.match(result.removed[0].reason, /unsupported numbers 1900/);
});

test('the conversation only reads the app snapshot when the player asks about the app', async () => {
    let reads = 0;
    const read = async () => (reads++, snapshot);
    const chat = new PenaConversation({ engine: fakeEngine(), tokenCount: text => text.length / 4 });
    const plain = await chat.prepare('what is the plan here?', { fen: italian, playerColor: 'b', snapshot: read });
    assert.equal(reads, 0);
    assert.ok(!plain.prompt.includes('App notes, the player'));
    const asked = await chat.prepare('what elo is my profile set to?', { fen: italian, playerColor: 'b', snapshot: read });
    assert.equal(reads, 1);
    assert.ok(asked.prompt.includes('[S1] Profile "Default"'));
    chat.remember(asked, 'It is at 1500 [S1].');
    const follow = await chat.prepare('and the other one?', { fen: italian, playerColor: 'b', snapshot: read });
    assert.equal(reads, 2);
    assert.ok(follow.prompt.includes('App notes, the player'));
});


test('Pena treats a guide setting name as an app question without the app name', () => {
    assert.equal(appTopics('what does move detail do').app, true);
    assert.equal(appTopics('is material balance important here').app, false);
    assert.match(appNotes('what does move detail do', { pena: {} }).text, /Move Detail and Filter Shown Pieces/);
});
