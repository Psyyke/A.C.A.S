export function textFileContents(value, name) {
    if(typeof value !== 'string') throw new Error(`${name}: expected text-file contents.`);
    if(value.includes('\0')) throw new Error(`${name}: NUL bytes are not allowed in a text file.`);
    if(new TextEncoder().encode(value).length > 65536) throw new Error(`${name}: text files are limited to 64 KiB.`);
    return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function lc0ConfigContents(value) {
    const text = textFileContents(value, 'ConfigFile');
    for(const [index, raw] of text.split('\n').entries()) {
        const line = raw.trim();
        if(!line || line.startsWith('#')) continue;
        const match = /^(?:--)?([a-z][a-z0-9-]*)(?:=.*)?$/i.exec(line);
        if(!match) throw new Error(`ConfigFile line ${index + 1}: use one --option=value per line, not a file path.`);
        if(['config', 'weights', 'backend', 'logfile', 'syzygy-path'].includes(match[1].toLowerCase()))
            throw new Error(`ConfigFile line ${index + 1}: ${match[1]} is managed by the app or needs files unavailable in this browser.`);
    }
    return text;
}

export function fairyVariantContents(value) {
    const text = textFileContents(value, 'VariantPath');
    const names = [];
    for(const [index, raw] of text.split('\n').entries()) {
        const line = raw.trim();
        if(!line || /^[#;]/.test(line)) continue;
        const section = /^\[([a-z][a-z0-9_-]*)(?::[a-z][a-z0-9_-]*)?\]$/i.exec(line);
        if(section) {
            names.push(section[1]);
        } else if(!names.length || !/^[a-z][a-z0-9_]*\s*=.*$/i.test(line)) {
            throw new Error(`VariantPath line ${index + 1}: paste an INI variant definition, not a file path.`);
        }
    }
    if(text.trim() && !names.length) throw new Error('VariantPath: no [variant:base] section found.');
    if(new Set(names).size !== names.length) throw new Error('VariantPath: duplicate variant sections.');
    return { text, names };
}
