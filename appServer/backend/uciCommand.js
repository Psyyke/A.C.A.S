export function validateUciCommand(command) {
    if(typeof command !== 'string') throw new Error('Command must be a string');
    if(/[\n\r&;|]/.test(command)) throw new Error('Command contains forbidden control characters');
    const maxLength = command.startsWith('position fen ') ? 262144 : 512;
    if(command.length > maxLength) throw new Error('Command too long');
}

export function parseClientMessage(message) {
    const parsed = JSON.parse(message);
    if(message.length > 4096) {
        if(parsed?.type === 'ai' && message.length <= 524288) return parsed;
        if(parsed?.type === 'screenOverlay') {
            if(message.length <= 524288) return parsed;
            const error = new Error('Overlay payload too long');
            error.overlayInstanceId = typeof parsed.msg?.instanceId === 'string'
                && parsed.msg.instanceId.length <= 128 ? parsed.msg.instanceId : '';
            throw error;
        }
        const command = parsed?.type === 'uci' ? parsed.msg?.command : null;
        if(typeof command !== 'string' || !command.startsWith('position fen ')
            || message.length - command.length > 4096 || command.length > 262144) {
            throw new Error('Command payload too long');
        }
    }
    return parsed;
}
