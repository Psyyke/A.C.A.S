const activeToasts = new Map();

const toast = {
    'create': (type, icon, content, duration) => {
        const intervalRate = 100;
        const toastTotalDuration = duration;
        let toastContainer = document.querySelector('#acas-toast-container');
        let fadeTime = 500;
        let elapsedTime = 0;
        let isHovered = false;
        let isFading = false;
        let loadingSpinnerInterval;

        // Identical toasts merge into one with a counter instead of stacking up.
        const toastKey = type === 'instance' ? null : JSON.stringify([type, icon, content]);
        const existing = toastKey && activeToasts.get(toastKey);
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
        closeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
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

        toastContainer.prepend(toastElem);

        if(toastKey) {
            let count = 1;
            let countElem;
            activeToasts.set(toastKey, {
                elem: toastElem,
                close: triggerFadeOut,
                isFading: () => isFading,
                bump: () => {
                    count++;
                    if(!countElem) {
                        countElem = document.createElement('div');
                        countElem.classList.add('acas-toast-count');
                        toastTopContainer.appendChild(countElem);
                    }
                    countElem.innerText = `×${count}`;
                    elapsedTime = 0;
                    progressBarElem.style.width = '0%';
                }
            });
        }

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
            loadingSpinnerInterval = setInterval(() => {
                if(!document.body.contains(toastElem)) {
                    clearInterval(loadingSpinnerInterval);
                    return;
                }
                iconElem.innerText = spinner[spinnerIndex];
                spinnerIndex = (spinnerIndex + 1) % spinner.length;
            }, 200);
        }

        return { 'close': triggerFadeOut };
    },
    'success': (content, duration) => toast.create('success', '👍', content, duration),
    'message': (content, duration) => toast.create('message', '🗿', content, duration),
    'warning': (content, duration) => toast.create('warning', '😐', content, duration),
    'error': (content, duration) => toast.create('error', '💀', content, duration),
    'instance': (content, duration) => toast.create('instance', '🕛', content, duration)
};