import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownPlain, spokenText } from '../formatting.js';

test('markdown markers are removed from plain text', () => {
    assert.equal(markdownPlain('Open **Move Detail** and *relax*.'), 'Open Move Detail and relax.');
});

test('speech reads moves, castling and evals like a person', () => {
    const spoken = spokenText('**Rxe5** wins. Then O-O at +0.4.');
    assert.match(spoken, /Rook takes E 5/);
    assert.match(spoken, /Castle kingside/);
    assert.match(spoken, /plus 0\.4/);
    assert.doesNotMatch(spoken, /\*/);
});

test('speech pronounces the app name without changing its displayed spelling', () => {
    const text = 'A.C.A.S helps. Ask a.c.a.s, too.';
    assert.equal(markdownPlain(text), text);
    assert.equal(spokenText(text), 'A-CAS helps. Ask A-CAS, too.');
    assert.equal(spokenText('A.C.A.S.'), 'A-CAS.');
    assert.equal(spokenText('A.C.A.S.’s good.'), "A-CAS's good.");
    assert.equal(spokenText("A.C.A.S.'s settings."), "A-CAS's settings.");
    assert.equal(spokenText('A.C.A.Suffix'), 'A.C.A.Suffix.');
});
