export function parseSetOption(command, engineOptions) {
    if(typeof command !== 'string') return null;

    const tokens = command.trim().split(/\s+/);

    if(tokens[0] !== 'setoption') return null;

    const nameIndex = tokens.indexOf('name');
    const valueIndex = tokens.indexOf('value', nameIndex + 1);

    if(nameIndex === -1) return null;

    const hasValue = valueIndex > nameIndex;
    const name = tokens.slice(nameIndex + 1, hasValue ? valueIndex : undefined).join(' ').trim();

    if(!name) return null;
    if(!hasValue) return { name, value: null }; // A button, not an empty string or true.

    const valueTokens = tokens.slice(valueIndex + 1);

    // Accept the extra "value" token sent by older clients.
    if(valueTokens[0] === 'value') valueTokens.shift();

    let value = valueTokens.join(' ').trim();

    if(value === '<empty>') value = '';
    if(value.toLowerCase() === 'value') return null;

    const option = engineOptions?.get(name);
    const shouldParseTypedValue = value !== ''
        && (!engineOptions || option?.type === 'check' || option?.type === 'spin');

    // Preserve string options verbatim, including numeric-looking paths and names.
    // Before the handshake there is no type information, so keep the wire text.
    if(shouldParseTypedValue) {
        if(value === 'true') value = true;
        else if(value === 'false') value = false;
        else if(Number.isFinite(Number(value))) value = Number(value);
    }

    return { name, value };
}

export function formatSetOption(name, value) {
    if(value == null) return `setoption name ${name}`;
    if(value === '<empty>') value = '';

    return `setoption name ${name} value ${value}`;
}

export function parseUciOption(line) {
    const prefix = 'option name ';

    if(!line.startsWith(prefix)) return null;

    const tokens = line.slice(prefix.length).trim().split(/\s+/);
    const typeIndex = tokens.indexOf('type');

    if(typeIndex < 1 || !tokens[typeIndex + 1]) return null;

    const defaultIndex = tokens.indexOf('default', typeIndex + 2);
    const option = {
        name: tokens.slice(0, typeIndex).join(' '),
        type: tokens[typeIndex + 1],
        hasDefault: defaultIndex !== -1
    };

    if(!option.name || !option.hasDefault) return option;

    const defaultEndIndex = tokens.findIndex((token, index) =>
        index > defaultIndex && ['min', 'max', 'var'].includes(token));

    option.defaultValue = tokens.slice(defaultIndex + 1,
        defaultEndIndex === -1 ? undefined : defaultEndIndex).join(' ');
    if(option.defaultValue === '<empty>') option.defaultValue = '';

    return option;
}

export function isDefaultUciOptionValue(value, option) {
    if(!option?.hasDefault) return false;
    if(option.type === 'check') return String(value).toLowerCase() === String(option.defaultValue).toLowerCase();
    if(option.type === 'spin') return Number(value) === Number(option.defaultValue);

    const isNumericString = option.type === 'string' && String(value).trim() !== ''
        && option.defaultValue.trim() !== '' && Number.isFinite(Number(value))
        && Number.isFinite(Number(option.defaultValue));

    // Lc0 exposes numbers as string options; the GUI can store 0.33 for 0.330000.
    if(isNumericString)
        return Number(value) === Number(option.defaultValue);

    return String(value === '<empty>' ? '' : value) === option.defaultValue;
}

export function isValidSavedUciOptionValue(value, option) {
    if(!option || option.type === 'button' || value == null) return false;

    const isTextValue = typeof value === 'string';
    const isNumericValue = typeof value === 'number' && Number.isFinite(value);
    const isIntegerValue = typeof value !== 'boolean' && String(value).trim() !== ''
        && Number.isInteger(Number(value));

    // Old versions turned empty string values into booleans. Never replay those
    // as file paths, backend arguments or numeric strings such as Lc0 Contempt.
    if(option.type === 'string' || option.type === 'combo')
        return isTextValue || isNumericValue;
    if(option.type === 'check') return /^(true|false)$/i.test(String(value));
    if(option.type === 'spin') return isIntegerValue;

    return false;
}

export function getSavedUciOptionsToReplay(savedOptions, engineOptions) {
    return Object.entries(savedOptions ?? {}).filter(([name, value]) => {
        const option = engineOptions.get(name);

        return isValidSavedUciOptionValue(value, option) && !isDefaultUciOptionValue(value, option);
    });
}
