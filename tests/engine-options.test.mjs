import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSetOption, formatSetOption } from '../appServer/backend/engineOptions.js';

const options = [
    ['setoption name Hash value 256', 'Hash', 256],
    ['  setoption  name  Skill Level  value  12  ', 'Skill Level', 12],
    ['setoption name UCI_Chess960 value true', 'UCI_Chess960', true],
    ['setoption name UCI_LimitStrength value false', 'UCI_LimitStrength', false],
    ['setoption name Clear Hash', 'Clear Hash', true],
    ['setoption name Clear Hash value', 'Clear Hash', true],
    ['setoption name Style value Very Aggressive', 'Style', 'Very Aggressive'],
    ['setoption name EvalFile value /models/large-net.nnue', 'EvalFile', '/models/large-net.nnue'],
    ['setoption name BookFile value <empty>', 'BookFile', ''],
    ['setoption name Hash value value 128', 'Hash', 128],
    ['setoption name Contempt value -12', 'Contempt', -12],
    ['setoption name Temperature value 0.75', 'Temperature', 0.75],
    ['setoption name Threads value 0', 'Threads', 0]
];

for(const [command, name, value] of options) {
    test(`parses ${command.trim()}`, () => {
        assert.deepEqual(parseSetOption(command), { name, value });
    });
}

test('ignores non-option and malformed commands', () => {
    for(const command of ['', 'uci', 'go depth 12', 'setoptions name Hash value 128',
        'setoption Hash 128', 'setoption name', 'setoption name value 128',
        'setoption name Hash value value value']) {
        assert.equal(parseSetOption(command), null, command);
    }
});

test('saved options retain their wire values when replayed', () => {
    for(const [, name, value] of options) {
        const wire = formatSetOption(name, value);
        assert.equal(wire, `setoption name ${name} value ${value}`);
        // The protocol uses <empty> to distinguish an empty string from a button.
        if(value !== '') assert.deepEqual(parseSetOption(wire), { name, value });
    }
    assert.equal(formatSetOption('BookFile', '<empty>'), 'setoption name BookFile value ');
});
