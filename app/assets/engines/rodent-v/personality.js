import { textFileContents } from '../text-files.js';

const numericOptions = {
    hash: [1, 256], threads: [1, 1], 'move overhead': [0, 5000], uci_elo: [800, 3000],
    multipv: [1, 500], hceweight: [0, 256], nnueweight: [0, 256], nnuescale: [10, 2000],
    likesclosed: [-256, 256], kingtropism: [-256, 256], forwardness: [-256, 256],
    horizontalmirroring: [0, 1]
};
const checkOptions = new Set(['uci_chess960', 'uci_limitstrength', 'ownbook']);
const fileOptions = { nnuepath: 'nets/', mainbook: 'books/', guidebook: 'books/' };

export function parsePersonality(value, assets) {
    const text = textFileContents(value, 'PersonalityFile');
    const options = new Map();
    for(const [index, raw] of text.split('\n').entries()) {
        const line = raw.trim();
        if(!line || /^[;#]/.test(line)) continue;
        const match = /^setoption\s+name\s+(.+?)\s+value\s+(.+)$/i.exec(line);
        const error = message => new Error(`PersonalityFile line ${index + 1}: ${message}`);
        if(!match) throw error('expected setoption name ... value ..., not a file path.');
        let name = match[1].toLowerCase();
        let value = match[2].trim();
        if(name === 'mainbookpath') name = 'mainbook';
        if(name === 'guidebookpath') name = 'guidebook';
        const range = numericOptions[name] ?? (/^(own|opp)(material|pst|mobility|safety|pawns|passers|threats|other)$/.test(name) ? [0, 500] : null);
        if(range) {
            const number = Number(value);
            if(!/^-?\d+$/.test(value) || !Number.isSafeInteger(number) || number < range[0] || number > range[1])
                throw error(`${name} must be an integer from ${range[0]} to ${range[1]}.`);
        } else if(checkOptions.has(name)) {
            if(!/^(true|false)$/i.test(value)) throw error(`${name} must be true or false.`);
            value = value.toLowerCase();
        } else if(Object.hasOwn(fileOptions, name)) {
            if(!value.startsWith(fileOptions[name]) || !Object.hasOwn(assets, value))
                throw error(`${name} must name a bundled ${fileOptions[name]} resource. External disk paths are unavailable.`);
        } else {
            throw error(`unsupported option "${match[1]}". Only engine settings belong in this file.`);
        }
        options.set(name, { value, line: `setoption name ${name} value ${value}` });
    }
    return options;
}
