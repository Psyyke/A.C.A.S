const ns = 'http://www.w3.org/2000/svg';
function node(name, attributes, content) {
    const result = document.createElementNS(ns, name);
    for(const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
    if(content !== undefined) result.textContent = content;
    return result;
}
export function drawLearningChart(svg, points, accuracy = false) {
    svg.setAttribute('viewBox', '0 0 640 250');
    svg.replaceChildren();
    if(!points.length) {
        svg.append(node('text', { x: 320, y: 120, 'text-anchor': 'middle', fill: '#4f6881', 'font-size': 14 }, 'Measurements appear after the baseline evaluation'));
        return;
    }
    const keys = accuracy ? ['trainAccuracy', 'validationAccuracy'] : ['trainLoss', 'validationLoss'];
    const max = accuracy ? 1 : Math.max(0.1, ...points.flatMap(point => keys.map(key => point[key]))) * 1.1;
    const left = 46, right = 624, top = 14, bottom = 216;
    const x = epoch => left + (right - left) * epoch / Math.max(1, points.at(-1).epoch);
    const y = value => bottom - (bottom - top) * value / max;
    for(let i = 0; i <= 4; i++) {
        const value = max * i / 4, height = y(value);
        svg.append(node('line', { x1: left, x2: right, y1: height, y2: height, stroke: '#dde5e4' }));
        svg.append(node('text', { x: left - 6, y: height + 4, 'text-anchor': 'end', fill: '#4f6881', 'font-size': 12 },
            accuracy ? `${Math.round(value * 100)}%` : value.toFixed(2)));
    }
    const every = Math.max(1, Math.ceil(points.at(-1).epoch / 6));
    for(const point of points.filter(point => point.epoch % every === 0 || point === points.at(-1)))
        svg.append(node('text', { x: x(point.epoch), y: 236, 'text-anchor': 'middle', fill: '#4f6881', 'font-size': 12 }, point.epoch));
    keys.forEach((key, index) => {
        const color = index ? '#b16a32' : '#527783';
        svg.append(node('polyline', { points: points.map(point => `${x(point.epoch)},${y(point[key])}`).join(' '),
            fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...(index ? { 'stroke-dasharray': '6 3' } : {}) }));
        for(const point of points) {
            const circle = node('circle', { cx: x(point.epoch), cy: y(point[key]), r: 3, fill: color });
            circle.append(node('title', {}, `Epoch ${point.epoch}, ${index ? 'validation' : 'training'}: ${point[key].toFixed(4)}`));
            svg.append(circle);
        }
    });
}

export function showTrainingBoard(board, fen, move) {
    const placement = fen.split(' ')[0];
    const squares = [];
    let i = 0;
    for(const char of placement) {
        if(char === '/') continue;
        const pieces = /\d/.test(char) ? Array(Number(char)).fill(null) : [char];
        for(const piece of pieces) {
            const square = document.createElement('div'), coord = String.fromCharCode(97 + i % 8) + (8 - (i >> 3));
            square.className = `maia-square${((i >> 3) + i % 8) % 2 ? ' dark' : ''}${move?.includes(coord) ? ' target' : ''}`;
            if(piece) {
                const image = document.createElement('img'), color = piece === piece.toUpperCase() ? 'w' : 'b';
                image.src = new URL(`../../assets/images/pieces/staunty/${color}${piece.toUpperCase()}.svg`, import.meta.url).href;
                image.alt = ''; square.append(image);
            }
            squares.push(square); i++;
        }
    }
    board.replaceChildren(...squares);
    board.setAttribute('aria-label', `Processed position. Played move ${move || ''}. ${fen}`);
}
