// Handcrafted policy adjustments, not learned player embeddings or new networks.
const personality = (temperature, tolerance, style) => ({ temperature, tolerance, style });

export const personalities = {
    Balanced: personality(1, 1, {}),
    Human: personality(1.2, 1.4, {}),
    Solid: personality(0.9, 0.5, { kingSafety: 1, shelter: 0.8, rescue: 0.8, castle: 0.4 }),
    Aggressive: personality(1.1, 1.2, { check: 0.5, capture: 0.3, advance: 0.4, pawnStorm: 0.6 }),
    Positional: personality(1, 0.8, { development: 0.7, central: 0.5, shelter: 0.3, earlyQueen: -0.5 }),
    Tactical: personality(0.8, 0.6, { check: 0.7, capture: 0.4, rescue: 0.5 }),
    'Bunker Goblin': personality(0.9, 0.7, { kingSafety: 2, shelter: 2, rescue: 1.4, castle: 1, pawnStorm: -1, earlyQueen: -1 }),
    'Porcupine Accountant': personality(0.85, 0.5, { rescue: 2.2, exchange: 1.2, kingSafety: 1, shelter: 1, check: -0.3 }),
    'Paranoid Turtle': personality(1, 1.1, { kingSafety: 2.5, shelter: 2, retreat: 1.4, rescue: 2, advance: -0.5, check: -0.5 }),
    'Caffeinated Squirrel': personality(1.5, 1.4, { check: 1, development: 1, advance: 0.8, pawnStorm: 1.1, exchange: -0.4 }),
    'Queen Retirement Club': personality(0.95, 0.8, { exchange: 1.7, queenTrade: 2, kingSafety: 1, earlyQueen: -0.8 })
};

const spin = (name, value, min, max) => ({ name, type: 'spin', default: value, min, max });
const check = (name, value) => ({ name, type: 'check', default: value });

export const definitions = [
    { name: 'Personality', type: 'combo', default: 'Balanced', vars: Object.keys(personalities) },
    spin('Stockfish Weight', 60, 0, 95),
    spin('UCI_Elo', 2600, 600, 3200),
    spin('Enemy_Elo', 1500, 600, 3200),
    spin('MultiPV', 2, 1, 256),
    spin('Candidate Moves', 16, 1, 256),
    spin('Maia Temperature', 100, 25, 300),
    spin('Personality Strength', 100, 0, 200),
    spin('Human Plausibility', 50, 1, 100),
    spin('Score Window', 100, 10, 1000),
    check('Tactical Safety', true),
    spin('Max Centipawn Loss', 50, 0, 1000),
    spin('Randomness', 0, 0, 100),
    spin('Top P', 95, 1, 100),
    spin('Random Seed', 0, 0, 2147483647),
    spin('Personal Variation', 35, 0, 100),
    spin('Maia Wait', 10000, 1000, 30000),
    spin('Hash', 32, 1, 512),
    spin('Move Overhead', 10, 0, 5000),
    check('UCI_ShowWDL', true),
    { name: 'UCI_Variant', type: 'combo', default: 'chess', vars: ['chess'] },
    { name: 'Clear Hash', type: 'button' }
];

export function defaultOptions() {
    return Object.fromEntries(definitions.filter(option => option.type !== 'button')
        .map(option => [option.name, option.default]));
}

export function optionLines() {
    return definitions.map(option => {
        let line = `option name ${option.name} type ${option.type}`;
        if(option.default !== undefined) line += ` default ${option.default}`;
        if(option.min !== undefined) line += ` min ${option.min} max ${option.max}`;
        if(option.vars) line += option.vars.map(value => ` var ${value}`).join('');
        return line;
    });
}

export function setOption(options, command) {
    const match = /^setoption\s+name\s+(.+?)(?:\s+value\s+(.*))?$/i.exec(command);
    if(!match) return null;

    const option = definitions.find(item => item.name.toLowerCase() === match[1].trim().toLowerCase());
    if(!option) return null;

    let value = match[2]?.trim();
    if(option.type === 'spin') {
        if(!value || !Number.isFinite(Number(value))) return null;
        value = Math.max(option.min, Math.min(option.max, Math.round(Number(value))));
    } else if(option.type === 'check') {
        if(!/^(true|false)$/i.test(value)) return null;
        value = value.toLowerCase() === 'true';
    } else if(option.type === 'combo') {
        value = option.vars.find(item => item.toLowerCase() === value?.toLowerCase());
        if(value === undefined) return null;
    }

    if(option.type !== 'button') options[option.name] = value;
    return option.name;
}