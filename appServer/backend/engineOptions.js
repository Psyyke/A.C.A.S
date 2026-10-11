export function parseSetOption(command) {
    const tokens = command.trim().split(/\s+/);
    if(tokens[0] !== 'setoption') return null;

    const nameIndex = tokens.indexOf('name');
    const valueIndex = tokens.indexOf('value');
    if(nameIndex === -1) return null;

    const hasValue = valueIndex > nameIndex;
    const name = tokens.slice(nameIndex + 1, hasValue ? valueIndex : undefined).join(' ').trim();
    if(!name) return null;

    const valueTokens = hasValue ? tokens.slice(valueIndex + 1) : [];
    // Accept the extra "value" token sent by older clients.
    if(valueTokens[0] === 'value') valueTokens.shift();

    let value = valueTokens.join(' ').trim();
    if(!valueTokens.length || value === 'true') value = true;
    else if(value === 'false') value = false;
    else if(!isNaN(value)) value = Number(value);
    else {
        value = value.replace('<empty>', '');
        if(value.trim().toLowerCase() === 'value') return null;
    }

    return { name, value };
}

export function formatSetOption(name, value) {
    if(typeof value === 'string') value = value.replace('<empty>', '');
    return `setoption name ${name} value ${value}`;
}
