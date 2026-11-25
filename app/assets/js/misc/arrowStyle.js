export function getArrowStyle(type, fill, opacity) {
    const base = (color, alpha) => [
        'stroke: rgb(0 0 0 / 50%);',
        'stroke-width: 0.5%;',
        'stroke-linejoin: round;',
        `fill: ${fill ?? color};`,
        `opacity: ${opacity ?? alpha};`
    ].join('\n');
    switch(type) {
        case 'best': return base('limegreen', 0.9);
        case 'secondary': return base('dodgerblue', 0.7);
        case 'opponent': return base('crimson', 0.3);
        case 'book': return base('#00d4ff', 0.75);
        case 'future': return [
            'stroke: rgb(0 0 0 / 40%);',
            'stroke-width: 0.3%;',
            'stroke-linejoin: round;',
            'stroke-dasharray: 2;',
            'fill: rgb(255 255 255 / 20%);',
            `opacity: ${opacity};`
        ].join('\n');
    }
}

export function moveArrowConfig(type, color, opacity, scale = 1) {
    return { style: getArrowStyle(type, color, opacity), lineWidth: 30 * scale,
        arrowheadWidth: 80 * scale, arrowheadHeight: 60 * scale, startOffset: 30 };
}
