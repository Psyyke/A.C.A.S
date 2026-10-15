import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSetOption, formatSetOption, parseUciOption, isDefaultUciOptionValue }
    from '../appServer/backend/engineOptions.js';

const options = [
    ['setoption name Hash value 256', 'Hash', 256],
    ['  setoption  name  Skill Level  value  12  ', 'Skill Level', 12],
    ['setoption name UCI_Chess960 value true', 'UCI_Chess960', true],
    ['setoption name UCI_LimitStrength value false', 'UCI_LimitStrength', false],
    ['setoption name Clear Hash', 'Clear Hash', null],
    ['setoption name Clear Hash value', 'Clear Hash', ''],
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
        const expected = value === null ? `setoption name ${name}` : `setoption name ${name} value ${value}`;

        assert.equal(wire, expected);
        assert.deepEqual(parseSetOption(wire), { name, value });
    }
    assert.equal(formatSetOption('BookFile', '<empty>'), 'setoption name BookFile value ');
});

test('parses UCI option defaults and compares according to their declared type', () => {
    const contempt = parseUciOption('option name Contempt type string default true');
    assert.deepEqual(contempt, {
        name: 'Contempt', type: 'string', hasDefault: true, defaultValue: 'true'
    });
    assert.equal(isDefaultUciOptionValue(true, contempt), true);

    const threads = parseUciOption('option name Threads type spin default 50 min 0 max 128');
    assert.equal(isDefaultUciOptionValue('50', threads), true);
    assert.equal(isDefaultUciOptionValue('48', threads), false);

    const showWdl = parseUciOption('option name UCI_ShowWDL type check default true');
    assert.equal(isDefaultUciOptionValue(true, showWdl), true);

    assert.deepEqual(parseUciOption('uciok'), null);
});

test('does not replay LC0 values that only duplicate advertised defaults', async () => {
    const { getSavedUciOptionsToReplay } = await import('../appServer/backend/engineOptions.js');
    const defaults = [
        'LogFile', 'SyzygyPath', 'Contempt', 'UCI_Opponent', 'UCI_ShowWDL', 'BackendOptions'
    ].map(name => [`option name ${name} type string default true`, name])
        .map(([line, name]) => [name, parseUciOption(line)]);
    defaults.push(['Threads', parseUciOption('option name Threads type spin default 50 min 0 max 128')]);

    const replay = getSavedUciOptionsToReplay({
        LogFile: true,
        SyzygyPath: true,
        Contempt: true,
        UCI_Opponent: true,
        UCI_ShowWDL: true,
        BackendOptions: true,
        Threads: 50,
        MultiPV: 2
    }, new Map(defaults));

    assert.deepEqual(replay, []);
});
