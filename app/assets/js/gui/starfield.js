export function initializeStarfield() {
    const container = document.querySelector('#acas-instance-container');
    if(!container || container.querySelector('.starfield-animation')) return;

    const layer = document.createElement('div');
    layer.className = 'starfield-animation';
    layer.setAttribute('aria-hidden', 'true');

    const createStar = (parent, x, y, index, brightness = 0.7, size = 1.5) => {
        const star = document.createElement('span');
        star.className = 'starfield-star';
        star.style.left = `${x}%`;
        star.style.top = `${y}%`;
        star.style.width = star.style.height = `${size}px`;
        star.style.backgroundColor = `rgb(220 232 255 / ${brightness})`;
        star.style.setProperty('--starfield-period', `${4 + (index * 1.37) % 5}s`);
        star.style.setProperty('--starfield-delay', `${-index * 2.19}s`);
        parent.appendChild(star);
    };

    // Repeatable scatter; no timers or per-frame JavaScript work.
    let seed = 1977;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    for(let index = 0; index < 48; index++) {
        createStar(layer, 2 + random() * 96, 2 + random() * 96, index,
            0.8 + random() * 0.2, 1.5 + random() * 1.1);
    }

    // The Plough, with no guide lines. Alcor is the faint companion to Mizar.
    const dipper = document.createElement('div');
    dipper.className = 'starfield-dipper';
    const stars = [
        [6, 29],   // Alkaid
        [25, 23],  // Mizar
        [42, 36],  // Alioth
        [58, 48],  // Megrez
        [64, 79],  // Phecda
        [89, 70],  // Merak
        [86, 28],  // Dubhe
        [26, 20]   // Alcor
    ];
    stars.forEach(([x, y], index) => {
        const isAlcor = index === 7;
        createStar(dipper, x, y, index + 48, isAlcor ? 0.34 : 0.75,
            isAlcor ? 1 : 1.8);
    });
    layer.appendChild(dipper);
    container.prepend(layer);
}