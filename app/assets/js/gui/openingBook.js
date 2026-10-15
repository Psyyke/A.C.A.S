import { saveSetting } from './settings.js';
import { setInputValue } from './domInputs.js';
import { appearanceText as text } from './appearanceTranslations.js';

export function initializePolyglotBookLoader() {
    const fileInput = document.querySelector('#book-file');
    const nameInput = document.querySelector('#book-file-name');
    const remove = document.querySelector('#book-file-remove');
    if(!fileInput || !nameInput || !remove) return;

    let busy = false;
    const updateControls = () => {
        nameInput.disabled = busy;
        fileInput.disabled = busy;
        remove.disabled = busy || !nameInput.value;
        nameInput.title = nameInput.value || text('chooseBook', 'Choose an opening book');
    };
    const sameOwner = owner => Object.keys(owner).every(key => owner[key] === SETTING_FILTER_OBJ[key]);
    const reloadBooks = async () => {
        await Promise.all((window.AcasInstances ?? []).map(item => item.instance.loadOpeningBook()));
    };
    const saveBookName = async (value, owner) => {
        // Capture the profile/instance before file IO; a tab switch must not redirect it.
        const setting = nameInput.cloneNode();
        setting.value = value;
        await saveSetting(setting, true, owner);
        if(sameOwner(owner)) setInputValue(nameInput, value);
    };

    nameInput.addEventListener('acas-value-set', updateControls);
    document.addEventListener('acas-translations-updated', updateControls);
    nameInput.addEventListener('click', () => fileInput.click());
    nameInput.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        const owner = { ...SETTING_FILTER_OBJ };
        fileInput.value = '';
        if(!file) return;
        busy = true;
        updateControls();

        try {
            // Reject unreadable books before replacing an existing stored file.
            await POLYGLOT_BOOK.fromFile(file);
            await POLYGLOT_BOOK.saveToStorage(file);
            const book = await POLYGLOT_BOOK.loadFromStorage(file.name);
            if(!book) throw new Error('The selected file is not a valid Polyglot book.');
            await saveBookName(file.name, owner);
            POLY_OPENING_BOOKS.set(owner.profileID, book);
            await reloadBooks();
            toast.create('success', '📚', (TRANS_OBJ?.openingBookAdded ?? 'Added opening book: {fileName}')
                .replace('{fileName}', file.name), 2500);
        } catch(error) {
            console.error('Failed to load opening book:', error);
            toast.error(TRANS_OBJ?.openingBookSaveFailed ?? 'Failed to save opening book to storage.', 5000);
        } finally {
            busy = false;
            updateControls();
        }
    });

    remove.addEventListener('click', async () => {
        const fileName = nameInput.value;
        const owner = { ...SETTING_FILTER_OBJ };
        if(!fileName || busy) return;
        busy = true;
        updateControls();

        try {
            // Save an explicit empty override, rather than falling back to a global book.
            await saveBookName('', owner);
            POLY_OPENING_BOOKS.delete(owner.profileID);
            await reloadBooks();

            const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey);
            const isReferenced = object => object && typeof object === 'object'
                && (object.openingBookName === fileName || Object.values(object).some(isReferenced));
            if(!isReferenced(config)) await POLYGLOT_BOOK.removeFromStorage(fileName);
        } catch(error) {
            console.error('Failed to remove opening book:', error);
            toast.error(text('bookRemoveFailed', 'Could not remove the opening book.'), 5000);
        } finally {
            busy = false;
            updateControls();
        }
    });

    updateControls();
}