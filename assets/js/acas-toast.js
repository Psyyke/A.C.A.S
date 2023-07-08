const toast = {
    'create': (type, icon, content, duration) => {
        let toastContainer = document.querySelector('#acas-toast-container');
        let fadeTime = 500;

        if(!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'acas-toast-container';

            document.body.appendChild(toastContainer);
        }

        const toastElem = document.createElement('div');
            toastElem.classList.add('acas-toast');
            toastElem.style = `
                -webkit-animation: fadein ${fadeTime / 1000}s, fadeout ${fadeTime / 1000}s ${duration / 1000}s forwards;
                animation: fadein ${fadeTime / 1000}s, fadeout ${fadeTime / 1000}s ${duration / 1000}s forwards;
            `;

        const closeBtn = document.createElement('div');
            closeBtn.classList.add(`acas-toast-${type}`);
            closeBtn.classList.add('acas-toast-close-btn');
            closeBtn.innerText = `x`;
            closeBtn.onclick = () => toastElem.remove();

        const iconElem = document.createElement('div');
            iconElem.classList.add('acas-toast-icon');

        const emojiRegex = /\p{Emoji}/u;

        if(emojiRegex.test(icon)) {
            // emoji
            iconElem.innerText = icon;
        } else {
            // icon
            iconElem.classList.add(icon);
        }

        const contentElem = document.createElement('div');
            contentElem.classList.add('acas-toast-content');
            contentElem.innerText = content;

        toastElem.appendChild(closeBtn);
        toastElem.appendChild(iconElem);
        toastElem.appendChild(contentElem);

        toastContainer.prepend(toastElem);

        setTimeout(() => toastElem.remove(), duration + fadeTime);
    },
    'success': (content, duration) => toast.create('success', '👍', content, duration),
    'message': (content, duration) => toast.create('message', '🗿', content, duration),
    'warning': (content, duration) => toast.create('warning', '😐', content, duration),
    'error': (content, duration) => toast.create('error', '💀', content, duration)
};