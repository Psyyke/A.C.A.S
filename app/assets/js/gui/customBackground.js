import { appearanceText as text } from './appearanceTranslations.js';

const DATABASE_NAME = 'A.C.A.S-backgrounds';
const STORE_NAME = 'images';
const IMAGE_KEY = 'custom-background';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
let databasePromise;
let activeImageUrl = null;
let statusKey = null;
let imageName = '';

function openDatabase() {
    if(!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    databasePromise = null;
                };
                resolve(database);
            };
            request.onerror = () => reject(request.error);
        }).catch(error => {
            databasePromise = null;
            throw error;
        });
    }

    return databasePromise;
}

async function accessStoredImage(action, record) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, action === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = action === 'get' ? store.get(IMAGE_KEY)
            : action === 'put' ? store.put(record, IMAGE_KEY) : store.delete(IMAGE_KEY);

        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error || request.error);
        transaction.onabort = () => reject(transaction.error || new Error('Image storage was cancelled.'));
    });
}

function applyImageUrl(url) {
    if(url) document.body.style.setProperty('--custom-background-image', `url(${JSON.stringify(url)})`);
    else document.body.style.removeProperty('--custom-background-image');

    if(activeImageUrl) URL.revokeObjectURL(activeImageUrl);
    activeImageUrl = url;
}

function updateStatus(key = null) {
    statusKey = key;
    const status = document.querySelector('#custom-background-status');
    const fallback = key === 'loadingImage' ? 'Loading saved image…'
        : key === 'imageUnavailable' ? 'Saved image unavailable. Choose an image to try again.' : '';
    if(status) status.textContent = key ? text(key, fallback) : '';
    const name = document.querySelector('#custom-background-name');
    if(name) {
        name.value = imageName;
        name.title = imageName || text('chooseImage', 'Choose a background image');
    }
}

function setBusy(isBusy) {
    const upload = document.querySelector('#custom-background-name');
    const remove = document.querySelector('#custom-background-remove');
    const file = document.querySelector('#custom-background-file');
    if(upload) upload.disabled = isBusy;
    if(remove) remove.disabled = isBusy || !activeImageUrl;
    if(file) file.disabled = isBusy;
}

function validateImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.naturalWidth && image.naturalHeight
            ? resolve() : reject(new Error(text('invalidImage', 'This image could not be read.')));
        image.onerror = () => reject(new Error(text('invalidImage', 'This image could not be read.')));
        image.src = url;
    });
}

export function updateCustomBackgroundControls(textureClass) {
    const isCustomImage = textureClass === 'custom-image-texture';
    document.querySelector('#custom-background-controls')
        ?.classList.toggle('hidden', !isCustomImage);
    document.querySelector('.open-floaty-btn[aria-controls="custom-background-floaty"]')
        ?.classList.toggle('hidden', !isCustomImage);
    const dialog = document.querySelector('#custom-background-floaty');
    if(!isCustomImage && dialog?.open) dialog.close();
}

export function setCustomBackgroundBlur(value) {
    const number = Number(value);
    const blur = Number.isFinite(number) ? Math.max(0, Math.min(40, number)) : 0;
    document.body.style.setProperty('--custom-background-blur', `${blur}px`);

    const input = document.querySelector('#custom-background-blur');
    if(input) {
        input.value = blur;
        input.dispatchEvent(new Event('acas-value-set'));
        input.setAttribute('aria-valuetext', text('blurValue', '{value} pixels', { value: blur }));
    }
}

export async function clearCustomBackgroundImage() {
    await accessStoredImage('delete');
    applyImageUrl(null);
    imageName = '';
    updateStatus();
    setBusy(false);
}

export async function initializeCustomBackground() {
    const fileInput = document.querySelector('#custom-background-file');
    const upload = document.querySelector('#custom-background-name');
    const remove = document.querySelector('#custom-background-remove');
    if(!fileInput || !upload || !remove) return;

    const textureInput = document.querySelector('input[data-key="backgroundTextureClass"]');
    const dialog = document.querySelector('#custom-background-floaty');
    const launcher = document.querySelector('.open-floaty-btn[aria-controls="custom-background-floaty"]');
    // Open only for an explicit selection, not on startup or settings refreshes.
    textureInput?.addEventListener('change', () => {
        updateCustomBackgroundControls(textureInput.value);
        if(textureInput.value === 'custom-image-texture' && dialog && !dialog.open) launcher?.click();
    });
    updateCustomBackgroundControls(textureInput?.value);

    setBusy(true);
    updateStatus('loadingImage');

    document.addEventListener('acas-translations-updated', () => {
        updateStatus(statusKey);
        setCustomBackgroundBlur(document.querySelector('#custom-background-blur')?.value ?? 0);
    });

    upload.addEventListener('click', () => fileInput.click());
    upload.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if(!file) return;

        let nextUrl;
        setBusy(true);

        try {
            if(!IMAGE_TYPES.has(file.type)) throw new Error(text('imageType', 'Choose a PNG, JPEG, WebP, GIF or AVIF image.'));
            if(file.size > MAX_IMAGE_SIZE) throw new Error(text('imageSize', 'The image must be 10 MB or smaller.'));

            nextUrl = URL.createObjectURL(file);
            await validateImage(nextUrl);
            await accessStoredImage('put', { file, name: file.name });
            applyImageUrl(nextUrl);
            nextUrl = null;
            imageName = file.name;
            updateStatus();
        } catch(error) {
            console.error('Failed to save custom background:', error);
            const validationMessages = [
                text('imageType', 'Choose a PNG, JPEG, WebP, GIF or AVIF image.'),
                text('imageSize', 'The image must be 10 MB or smaller.'),
                text('invalidImage', 'This image could not be read.')
            ];
            toast.error(validationMessages.includes(error.message) ? error.message
                : text('imageSaveFailed', 'Could not save the background image. Storage may be unavailable or full.'), 7000);
        } finally {
            if(nextUrl) URL.revokeObjectURL(nextUrl);
            setBusy(false);
        }
    });

    remove.addEventListener('click', async () => {
        setBusy(true);
        try {
            await clearCustomBackgroundImage();
        } catch(error) {
            console.error('Failed to remove custom background:', error);
            toast.error(text('imageRemoveFailed', 'Could not remove the saved background image.'), 5000);
        } finally {
            setBusy(false);
        }
    });

    try {
        const record = await accessStoredImage('get');
        if(record?.file instanceof Blob && IMAGE_TYPES.has(record.file.type)) {
            const url = URL.createObjectURL(record.file);
            try {
                await validateImage(url);
                applyImageUrl(url);
                imageName = record.name || text('customImage', 'Custom Background Image');
                updateStatus();
            } catch(error) {
                URL.revokeObjectURL(url);
                throw error;
            }
        } else {
            updateStatus();
        }
    } catch(error) {
        console.error('Failed to restore custom background:', error);
        updateStatus('imageUnavailable');
    } finally {
        setBusy(false);
    }
}