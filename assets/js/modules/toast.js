// toast.js
// Toast notification system for A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used for user feedback and alerts in the GUI.

// Toast notification module for A.C.A.S

/**
 * Create and display a toast notification.
 * @param {string} type - Type of toast (e.g., 'success', 'error').
 * @param {string} icon - Icon or emoji to display.
 * @param {string} content - Message content.
 * @param {number} duration - Duration in ms.
 */
export function createToast(type, icon, content, duration) {
    let toastContainer = document.querySelector('#acas-toast-container');
    let fadeTime = 500;
    let isHovered = false;
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
    closeBtn.innerText = `x`;
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
    toastElem.addEventListener('mouseenter', () => { isHovered = true; });
    toastElem.addEventListener('mouseleave', () => { isHovered = false; });
    toastContainer.prepend(toastElem);
    const intervalRate = 100;
    const toastTotalDuration = duration;
    // ...existing code for progress bar and fade out...
    // (copy the rest of the logic as needed)
    return toastElem;
}
