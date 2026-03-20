window.AcasPrompt = (function() {
    const dialog = document.createElement('dialog');
    dialog.classList.add('prompt-dialog');
    dialog.innerHTML = `
        <form method="dialog">
            <p id="acas-message"></p>
            <input type="text" id="acas-input" style="width: 90%; margin-bottom: 1em;" required />
            <menu style="display:flex; justify-content:flex-end; gap: 0.5em;">
                <button id="acas-cancel" class="acas-fancy-button" style="display: none; padding: 8px 15px;" type="button">Cancel</button>
                <button id="acas-ok" class="acas-fancy-button" style="padding: 8px 15px;" type="submit">OK</button>
            </menu>
        </form>
    `;

    document.body.appendChild(dialog);

    const messageElem = dialog.querySelector('#acas-message');
    const inputElem = dialog.querySelector('#acas-input');
    const cancelBtn = dialog.querySelector('#acas-cancel');

    cancelBtn.addEventListener('click', () => dialog.close('cancel'));

    return {
        prompt: function(message, defaultValue) {
            defaultValue = defaultValue || '';
            return new Promise(function(resolve) {
                messageElem.textContent = message;
                inputElem.value = defaultValue;

                function handler() {
                    dialog.removeEventListener('close', handler);
                    resolve(dialog.returnValue === 'cancel' ? null : inputElem.value);
                }

                dialog.addEventListener('close', handler);
                dialog.showModal();
                inputElem.focus();
            });
        }
    };
})();