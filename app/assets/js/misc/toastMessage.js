const toast = {
    'create': (type, icon, content, duration) => {
        const intervalRate = 100;
        const toastTotalDuration = duration;
        let toastContainer = document.querySelector('#acas-toast-container');
        let fadeTime = 500;
        let elapsedTime = 0;
        let isHovered = false;
        let loadingSpinnerInterval;

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
        closeBtn.innerText = `X`;
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

        const customTimeout = setInterval(() => {
            if(!document.body.contains(toastElem)) {
                clearInterval(customTimeout);
                clearInterval(loadingSpinnerInterval);
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