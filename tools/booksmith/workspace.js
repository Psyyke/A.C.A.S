const modes = ['priority', 'blend', 'equal'];
const orientations = ['white', 'black'];
const positionKey = /^[0-9a-f]{16}$/;
const moveCode = /^[a-h][1-8][a-h][1-8][nbrq]?$/;

export function validateWorkspace(stack) {
    if(!stack || !modes.includes(stack.mode) || !orientations.includes(stack.orientation)
        || !Array.isArray(stack.layers) || !stack.layers.length) throw new Error('Invalid workspace settings');
    const ids = new Set();
    for(const layer of stack.layers) {
        if(!layer || typeof layer.id !== 'string' || !/^[a-z0-9_-]+$/i.test(layer.id) || ids.has(layer.id)
            || typeof layer.name !== 'string' || typeof layer.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(layer.color)
            || typeof layer.enabled !== 'boolean' || !(layer.book instanceof Map)) throw new Error('Invalid workspace book');
        ids.add(layer.id);
        for(const [key, moves] of layer.book) {
            if(typeof key !== 'string' || !positionKey.test(key) || !(moves instanceof Map) || !moves.size)
                throw new Error('Invalid workspace position');
            for(const [code, weight] of moves) {
                if(typeof code !== 'string' || !moveCode.test(code)
                    || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 100)
                    throw new Error('Invalid workspace move or weight');
            }
        }
    }
    if(!ids.has(stack.active)) throw new Error('Invalid selected book');
    return stack;
}

export function writeWorkspace(stack) {
    validateWorkspace(stack);
    return JSON.stringify({
        format: 'acas-booksmith', version: 1,
        mode: stack.mode, orientation: stack.orientation, active: stack.active,
        layers: stack.layers.map(({ id, name, color, enabled, book }) => ({
            id, name, color, enabled,
            positions: [...book].map(([key, moves]) => [key, [...moves]])
        }))
    });
}

export function readWorkspace(text) {
    const data = JSON.parse(text);
    if(data?.format !== 'acas-booksmith' || data.version !== 1 || !Array.isArray(data.layers))
        throw new Error('Not a supported BookSmith workspace');
    const layers = data.layers.map(layer => {
        if(!layer || !Array.isArray(layer.positions)) throw new Error('Invalid workspace book');
        const book = new Map();
        for(const position of layer.positions) {
            if(!Array.isArray(position) || position.length !== 2 || !Array.isArray(position[1]) || book.has(position[0]))
                throw new Error('Invalid or repeated workspace position');
            const moves = new Map();
            for(const entry of position[1]) {
                if(!Array.isArray(entry) || entry.length !== 2 || moves.has(entry[0]))
                    throw new Error('Invalid or repeated workspace move');
                moves.set(entry[0], entry[1]);
            }
            book.set(position[0], moves);
        }
        return { id: layer.id, name: layer.name, color: layer.color, enabled: layer.enabled, book };
    });
    return validateWorkspace({ mode: data.mode, orientation: data.orientation, active: data.active, layers });
}
