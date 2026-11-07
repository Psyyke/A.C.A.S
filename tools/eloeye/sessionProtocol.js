export const channelName = 'acas-eloeye-sessions-v2';
export const heartbeatMs = 1000;
export const sessionExpiryMs = 10000;

export class TimeoutError extends Error {
    constructor(what) {
        super(`${what} timed out`);
        this.name = 'TimeoutError';
    }
}

export const placementOf = fen => String(fen).split(' ')[0].replace(/\[.*\]/, '').replace(/~/g, '');

// Only fully revealed current own moves are eligible. Multiple reply lines can
// share one root move; keep its primary metadata independently for each profile.
export function revealedHints(markings) {
    const groups = new Map();
    for(const marking of markings) {
        if(marking?.category !== 'move' || marking.isOpponent || marking.isFuture) continue;
        const { from, to, playerPromotion, selection, shapeType, shapeSquare } = marking;
        if(!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) continue;
        const key = JSON.stringify([from, to, playerPromotion || '', marking.profileID ?? selection?.profile ?? '']);
        const group = groups.get(key) || {
            move: [from, to, playerPromotion || null], arrow: false, squares: new Set(), sources: new Map()
        };
        if(selection && typeof selection.profile === 'string') {
            const previous = group.sources.get(selection.profile);
            if(!previous || (selection.best === true && previous.best !== true) ||
                (selection.best === previous.best && selection.rank < previous.rank))
                group.sources.set(selection.profile, selection);
        }
        if(shapeType === 'arrow') group.arrow = true;
        else if(typeof shapeSquare === 'string') group.squares.add(shapeSquare);
        groups.set(key, group);
    }
    const all = [...groups.values()];
    const full = group => group.arrow || group.move.slice(0, 2).every(square => group.squares.has(square));
    return {
        moves: [...new Map(all.filter(full).map(group => [JSON.stringify(group.move), group.move])).values()],
        candidates: all.filter(full).flatMap(group =>
            [...group.sources.values()].map(source => ({ move: group.move, ...source }))),
        partial: all.some(group => !full(group))
    };
}
