function GET_NICE_PATH(path, limit = 60) {
    if(!path) return path;

    const lastSeparatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    let dirPath = lastSeparatorIndex === -1 ? path : path.substring(0, lastSeparatorIndex);

    if(dirPath.length <= limit) {
        return dirPath;
    }

    const truncated = dirPath.slice(-limit);
    const firstSeparatorIndex = truncated.search(/[/\\]/);

    if(firstSeparatorIndex !== -1 && firstSeparatorIndex < limit - 5) {
        return '...' + truncated.substring(firstSeparatorIndex);
    }

    return '...' + truncated;
}