import { featureText } from '../misc/featureTranslations.js';
import { backgroundTextureInput, customBackgroundNameInput, customBackgroundLauncherBtn,
    customBackgroundRemoveBtn, bookFileNameInput, bookFileRemoveBtn } from './elementDeclarations.js';

export const appearanceText = (key, fallback, values) => featureText('appearance', key, fallback, values);

export function initializeAppearanceTranslations() {
    function translate() {
        document.querySelectorAll('[data-appearance-text]').forEach(element => {
            element.dataset.appearanceFallback ??= element.textContent;
            const label = appearanceText(element.dataset.appearanceText, element.dataset.appearanceFallback);
            if(element.textContent !== label) element.textContent = label;
        });

        const labels = typeof TRANS_OBJ === 'undefined' ? {} : TRANS_OBJ?.appearance?.textures ?? {};
        document.querySelectorAll('.background-texture-picker .dropdown-item').forEach(item => {
            const labelNode = [...item.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

            if(!labelNode) return;

            item.dataset.appearanceFallback ??= labelNode.textContent.trim();

            const key = item.dataset.value.replace(/-texture$/, '');
            const label = labels[key] ?? item.dataset.appearanceFallback;

            // Translate only the label, never replace the CSS preview's markup.
            if(labelNode.textContent !== label) labelNode.textContent = label;
        });

        if(backgroundTextureInput) backgroundTextureInput.placeholder = labels.chess ?? 'Chess';

        const setAttribute = (element, attribute, key, fallback) => {
            if(element) element.setAttribute(attribute, appearanceText(key, fallback));
        };

        setAttribute(customBackgroundNameInput, 'placeholder', 'noImage', 'No image selected');
        setAttribute(customBackgroundNameInput, 'aria-label', 'chooseImage', 'Choose a background image');
        setAttribute(customBackgroundLauncherBtn, 'title', 'customImage', 'Custom Background Image');
        setAttribute(customBackgroundLauncherBtn, 'aria-label', 'customImage', 'Custom Background Image');
        setAttribute(bookFileNameInput, 'placeholder', 'noBook', 'No book loaded');
        setAttribute(bookFileNameInput, 'aria-label', 'chooseBook', 'Choose an opening book');

        for(const [element, key, fallback] of [
            [customBackgroundRemoveBtn, 'removeImage', 'Remove image'],
            [bookFileRemoveBtn, 'removeBook', 'Remove opening book']
        ]) {
            setAttribute(element, 'title', key, fallback);
            setAttribute(element, 'aria-label', key, fallback);
        }
    }

    document.addEventListener('acas-translations-updated', translate);
    translate();
}