const pendingKey = 'acasGhostWelcomePending';
const languageTags = {
    us: 'en', cn: 'zh', in: 'hi', arab: 'ar', bd: 'bn', jp: 'ja', vn: 'vi',
    ph: 'fil', ir: 'fa', kr: 'ko', ua: 'uk', kz: 'kk', lk: 'si', gr: 'el',
    se: 'sv', cz: 'cs', il: 'he', rs: 'sr', ge: 'ka', am: 'hy', ee: 'et'
};

function translateGhostWelcome() {
    const dialog = document.getElementById('ghost-welcome');
    const translations = typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ?.ghostWelcome;
    if(!dialog || !translations) return;

    const language = localStorage.getItem('selectedLanguage') || 'us';
    dialog.lang = languageTags[language] ?? language;
    dialog.dir = FULL_TRANS_OBJ?.textDirection ?? (['ar', 'fa', 'he'].includes(dialog.lang) ? 'rtl' : 'auto');
    dialog.setAttribute('aria-label', translations.label);
    for(const [selector, value] of [
        ['[data-ghost-welcome-intro]', translations.intro],
        ['[data-ghost-welcome-explanation]', translations.explanation],
        ['[data-ghost-welcome-settings]', translations.settings],
        ['[data-ghost-welcome-dismiss]', translations.dismiss]
    ]) {
        const element = dialog.querySelector(selector);
        if(element.textContent !== value) element.textContent = value;
    }

    const paragraph = dialog.querySelector('[data-ghost-welcome-server]');
    const link = paragraph.querySelector('a');
    const [before, after] = translations.server.split('{link}');
    if(link.textContent !== translations.link || paragraph.textContent !== before + translations.link + after) {
        link.textContent = translations.link;
        paragraph.replaceChildren(document.createTextNode(before), link, document.createTextNode(after));
    }
}

document.addEventListener('acas-translations-updated', translateGhostWelcome);

export async function prepareGhostWelcome() {
    if(await USERSCRIPT.getValue(pendingKey) !== undefined) return;

    const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey);
    await USERSCRIPT.setValue(pendingKey, config === undefined);
}

export async function showGhostWelcome(highlightSetting) {
    if(await USERSCRIPT.getValue(pendingKey) !== true) return;

    const dialog = document.getElementById('ghost-welcome');
    const ghostInput = document.querySelector('input[data-key="isUserscriptGhost"]');
    const setting = ghostInput?.closest('.custom-input');
    if(!dialog || !setting) throw new Error('Ghost Script welcome elements are missing.');
    if(dialog.open) return;

    translateGhostWelcome();
    dialog.querySelectorAll('[data-ghost-welcome-dismiss]').forEach(button => {
        button.onclick = () => dialog.close();
    });
    dialog.querySelector('[data-ghost-welcome-settings]').onclick = () => {
        dialog.close();
        highlightSetting(setting);
        ghostInput.focus({ preventScroll: true });
    };
    dialog.addEventListener('close', async () => {
        document.body.style.overflow = document.querySelector('dialog:modal') ? 'hidden' : '';
        try {
            await USERSCRIPT.setValue(pendingKey, false);
        } catch(error) {
            console.error('Could not save Ghost Script welcome dismissal:', error);
            toast.error(TRANS_OBJ?.ghostWelcome?.saveError ?? 'Could not save this tip. It may appear again next time.', 8000);
        }
    }, { once: true });

    dialog.showModal();
    document.body.style.overflow = 'hidden';
}
