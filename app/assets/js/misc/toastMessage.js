const activeToasts = new Map();

const toast = {
    'create': (type, icon, content, duration, note) => {
        const intervalRate = 100;
        // "instance" toasts are intentionally persistent; everything else defaults to 5s
        // so a missing duration doesn't leave the toast on screen forever (NaN comparison).
        if(duration === undefined && type !== 'instance') duration = 5000;
        const toastTotalDuration = duration;
        let toastContainer = document.querySelector('#acas-toast-container');
        let fadeTime = 500;
        let elapsedTime = 0;
        let isHovered = false;
        let isFading = false;
        let loadingSpinnerInterval;

        // Identical toasts merge into one with a counter instead of stacking up.
        // Persistent instance toasts only close once every merged instance has released it.
        const isInstanceToast = type === 'instance';
        const toastKey = JSON.stringify([type, icon, content, note]);
        const existing = activeToasts.get(toastKey);
        if(existing && !existing.isFading() && document.body.contains(existing.elem)) {
            existing.bump();
            return { 'close': existing.close };
        }

        if(!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'acas-toast-container';
            document.body.appendChild(toastContainer);
        }

        const toastElem = document.createElement('div');
        toastElem.classList.add('acas-toast');
        toastElem.style = `
            -webkit-animation: fadein ${fadeTime / 1000}s forwards;
            animation: fadein ${fadeTime / 1000}s forwards;
        `;

        function triggerFadeOut() {
            isFading = true;
            toastElem.style.animation = `fadeout ${fadeTime / 1000}s forwards`;
            setTimeout(() => toastElem.remove(), fadeTime);
        }

        const toastTopContainer = document.createElement('div');
        toastTopContainer.classList.add('acas-toast-top-container');

        const toastBottomContainer = document.createElement('div');
        toastBottomContainer.classList.add('acas-toast-bottom-container');

        const progressBarElem = document.createElement('div');
        progressBarElem.classList.add('acas-toast-progress-bar');

        const closeBtn = document.createElement('div');
        closeBtn.classList.add(`acas-toast-${type}`);
        closeBtn.classList.add('acas-toast-close-btn');
        closeBtn.innerHTML = '✕';
        closeBtn.onclick = () => toastElem.remove();

        const iconElem = document.createElement('div');
        iconElem.classList.add('acas-toast-icon');
        const emojiRegex = /\p{Emoji}/u;

        if(emojiRegex.test(icon)) {
            iconElem.innerText = icon;
        } else {
            iconElem.classList.add(icon);
        }

        const contentElem = document.createElement('div');
        contentElem.classList.add('acas-toast-content');
        contentElem.innerText = content;

        if(note) {
            const noteElem = document.createElement('small');
            noteElem.style = 'opacity: 0.8;';
            noteElem.innerText = `\n${note}`;
            contentElem.appendChild(noteElem);
        }

        toastElem.appendChild(toastTopContainer);
        toastElem.appendChild(toastBottomContainer);

        toastTopContainer.appendChild(closeBtn);
        toastTopContainer.appendChild(iconElem);
        toastTopContainer.appendChild(contentElem);

        toastBottomContainer.appendChild(progressBarElem);

        toastElem.addEventListener('mouseenter', () => {
            isHovered = true;
        });
        toastElem.addEventListener('mouseleave', () => {
            isHovered = false;
        });

        const customTimeout = setInterval(() => {
            if(!document.body.contains(toastElem)) {
                clearInterval(customTimeout);
                clearInterval(loadingSpinnerInterval);
                if(toastKey && activeToasts.get(toastKey)?.elem === toastElem) activeToasts.delete(toastKey);
                return;
            }

            if(isHovered) return;

            if(toastTotalDuration + fadeTime <= elapsedTime) {
                clearInterval(customTimeout);
                clearInterval(loadingSpinnerInterval);
                triggerFadeOut();
            } else {
                elapsedTime += intervalRate;
                const progressPercent = `${Math.ceil(elapsedTime/toastTotalDuration * 100)}%`;
                progressBarElem.style.width = progressPercent;
            }
        }, intervalRate);

        if(type === 'instance') {
            const spinner = ['🕛','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚'];
            let spinnerIndex = 0;
            let elapsed = 0;
            
            loadingSpinnerInterval = setInterval(() => {
                if(!document.body.contains(toastElem)) {
                    clearInterval(loadingSpinnerInterval);
                    return;
                }
                iconElem.innerText = spinner[spinnerIndex];
                spinnerIndex = (spinnerIndex + 1) % spinner.length;
                elapsed += 200;

                if(elapsed === (200 * 40)) {
                    const sMsg = TRANS_OBJ?.dependingOnNetworkSpeed ?? 'Depending on your network speed, it might take a while for the engine to load...';
                    const small = document.createElement('small');
                          small.style = 'opacity: 0.8;';
                          small.innerText = `\n(${sMsg})`;

                    closeBtn.style.backgroundColor = 'rgb(255 149 41)';

                    contentElem.appendChild(small);
                }
            }, 200);
        }

        toastContainer.prepend(toastElem);

        if(toastKey) {
            let count = 1;
            let countElem;
            const showCount = () => {
                if(count < 2) return countElem?.remove(), countElem = null;
                if(!countElem) {
                    countElem = document.createElement('div');
                    countElem.classList.add('acas-toast-count');
                    toastTopContainer.appendChild(countElem);
                }
                countElem.innerText = `×${count}`;
            };
            const release = () => {
                if(--count > 0) return showCount();
                triggerFadeOut();
            };
            const close = isInstanceToast ? release : triggerFadeOut;

            activeToasts.set(toastKey, {
                elem: toastElem,
                close,
                isFading: () => isFading,
                bump: () => {
                    count++;
                    showCount();
                    if(isInstanceToast) return;
                    elapsedTime = 0;
                    progressBarElem.style.width = '0%';
                }
            });

            return { close };
        }

        return { 'close': triggerFadeOut };
    },
    'success': (content, duration) => toast.create('success', '👍', content, duration),
    'message': (content, duration) => toast.create('message', '🗿', content, duration),
    'warning': (content, duration, note) => toast.create('warning', '😐', content, duration, note),
    'error': (content, duration) => toast.create('error', '💀', content, duration),
    'instance': (content, duration) => toast.create('instance', '🕛', content, duration)
};