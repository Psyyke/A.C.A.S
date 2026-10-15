let grainTile = null;
let grainImage = null;
let headerGrainImage = null;

export function getBackgroundGrainTile() {
    if(grainTile) return grainTile;

    const tile = document.createElement('canvas');
    tile.width = 160;
    tile.height = 160;
    const ctx = tile.getContext('2d');
    if(!ctx) return null;

    // Generate a repeatable bitmap once, not an SVG filter on each repaint.
    const image = ctx.createImageData(tile.width, tile.height);
    let seed = 19;
    for(let index = 0; index < image.data.length; index += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const value = seed >>> 24;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 13;
    }
    ctx.putImageData(image, 0, 0);
    grainTile = tile;
    return grainTile;
}

export function initializeBackgroundGrain() {
    try {
        const tile = getBackgroundGrainTile();
        if(!tile) return;

        if(!grainImage) grainImage = `url("${tile.toDataURL('image/png')}")`;
        document.documentElement.style.setProperty('--background-grain-image', grainImage);

        // Bake a slightly softer header variant once, without live compositing.
        if(!headerGrainImage) {
            const headerTile = document.createElement('canvas');
            headerTile.width = tile.width;
            headerTile.height = tile.height;
            const ctx = headerTile.getContext('2d');
            if(!ctx) return;
            ctx.globalAlpha = 0.7;
            ctx.drawImage(tile, 0, 0);
            headerGrainImage = `url("${headerTile.toDataURL('image/png')}")`;
        }
        document.documentElement.style.setProperty('--header-background-grain-image', headerGrainImage);
    } catch(error) {
        // Grain is decorative; restricted canvas access must not block startup.
        console.warn('Could not prepare background grain:', error);
    }
}