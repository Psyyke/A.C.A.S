(() => {
    let snow, reducedMotion;
    let disabled = false;

    function disableSnow(error) {
        disabled = true;
        console.warn('[A.C.A.S] Snowfall disabled after an error:', error);
        try {
            reducedMotion?.removeEventListener('change', updateSnow);
            document.removeEventListener('visibilitychange', updateSnow);
            snow?.remove();
            snow = null;
        } catch(cleanupError) {
            console.warn('[A.C.A.S] Could not clean up snowfall:', cleanupError);
        }
    }

    function updateSnow() {
        if(disabled) return;
        try {
            renderSnow();
        } catch(error) {
            disableSnow(error);
        }
    }

    function renderSnow() {
        if(reducedMotion.matches) {
            snow?.remove();
            snow = null;
            return;
        }
        if(!snow) {
            snow = document.createElement('div');
            snow.className = 'home-snow';
            snow.setAttribute('aria-hidden', 'true');
            for(let i = 0; i < 60; i++) {
                const depth = i % 3;
                const duration = 24 - depth * 6 + Math.random() * 8;
                const flake = document.createElement('span');
                flake.className = `snow-depth-${depth}`;
                flake.style.left = `${(i + Math.random()) / 60 * 100}%`;
                flake.style.setProperty('--snow-size', `${2 + depth * 3 + Math.random() * 3}px`);
                flake.style.setProperty('--snow-drift', `${40 + Math.random() * 100}px`);
                flake.style.setProperty('--snow-sway', `${8 + depth * 8 + Math.random() * 12}px`);
                flake.style.setProperty('--snow-swirl-time', `${4 + Math.random() * 5}s`);
                flake.style.setProperty('--snow-phase', `${-Math.random() * 12}s`);
                flake.style.animationDuration = `${duration}s`;
                flake.style.animationDelay = `${-Math.random() * duration}s`;
                const shape = document.createElement('i');
                if(i % 5 === 2) {
                    shape.className = 'snow-crystal';
                    flake.style.setProperty('--snow-size', `${14 + Math.random() * 8}px`);
                }
                flake.append(shape);
                snow.append(flake);
            }
            document.body.append(snow);
        }
        snow.classList.toggle('is-paused', document.hidden);
    }

    try {
        if(!document.body?.classList.contains('page-home')) return;

        const month = new Date().getMonth();
        if(!Number.isInteger(month) || month < 0 || month > 11) throw new Error('Current date is unavailable');
        if(month !== 11 && month !== 0 && month !== 1 && !new URLSearchParams(location.search).has('snow')) return;

        reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
        reducedMotion.addEventListener('change', updateSnow);
        document.addEventListener('visibilitychange', updateSnow);
        updateSnow();
    } catch(error) {
        disableSnow(error);
    }
})();
