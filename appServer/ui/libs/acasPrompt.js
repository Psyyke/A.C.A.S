window.AcasPrompt = (function() {
    const dialog = document.createElement('dialog');

    dialog.classList.add('prompt-dialog');
    dialog.setAttribute('aria-labelledby', 'acas-message');
    dialog.innerHTML = `
        <form method="dialog">
            <label id="acas-message" for="acas-input"></label>
            <input type="text" id="acas-input" style="width: 90%; margin-bottom: 1em;" required />
            <menu style="display:flex; justify-content:flex-end; gap: 0.5em;">
                <button id="acas-cancel" class="acas-fancy-button" style="display: none; padding: 8px 15px;" type="button">Cancel</button>
                <button id="acas-ok" class="acas-fancy-button" style="padding: 8px 15px;" type="submit" value="confirm">OK</button>
            </menu>
        </form>
    `;

    document.body.appendChild(dialog);

    const messageElem = dialog.querySelector('#acas-message');
    const inputElem = dialog.querySelector('#acas-input');
    const cancelBtn = dialog.querySelector('#acas-cancel');
    const okBtn = dialog.querySelector('#acas-ok');

    cancelBtn.addEventListener('click', () => dialog.close('cancel'));
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        dialog.close('cancel');
    });

    function showDialog(message, defaultValue, { showCancel = false, confirmation = false, confirmLabel = 'OK' } = {}) {
        if(dialog.open) return Promise.resolve(null);

        return new Promise(function(resolve) {
            function handleClose() {
                const confirmed = dialog.returnValue === 'confirm';

                dialog.removeEventListener('close', handleClose);
                resolve(confirmed ? inputElem.value : null);
            }

            messageElem.textContent = message;
            inputElem.value = defaultValue || '';
            inputElem.hidden = confirmation;
            inputElem.required = !confirmation;
            cancelBtn.style.display = showCancel ? '' : 'none';
            okBtn.textContent = confirmLabel;
            dialog.returnValue = '';

            if(confirmation) messageElem.removeAttribute('for');
            else messageElem.setAttribute('for', 'acas-input');

            dialog.addEventListener('close', handleClose);
            dialog.showModal();

            if(confirmation) {
                cancelBtn.focus();
            } else {
                inputElem.focus();
                inputElem.select();
            }
        });
    }

    return {
        prompt: function(message, defaultValue, options) {
            return showDialog(message, defaultValue, options);
        },
        confirm: async function(message, confirmLabel = 'OK') {
            const result = await showDialog(message, '', { showCancel: true, confirmation: true, confirmLabel });

            return result !== null;
        }
    };
})();