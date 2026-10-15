import { featureText } from '../misc/featureTranslations.js';

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

        const textureInput = document.querySelector('input[data-key="backgroundTextureClass"]');
        if(textureInput) textureInput.placeholder = labels.chess ?? 'Chess';

        const setAttribute = (selector, attribute, key, fallback) => {
            const element = document.querySelector(selector);
            if(element) element.setAttribute(attribute, appearanceText(key, fallback));
        };
        setAttribute('#custom-background-name', 'placeholder', 'noImage', 'No image selected');
        setAttribute('#custom-background-name', 'aria-label', 'chooseImage', 'Choose a background image');
        setAttribute('.open-floaty-btn[aria-controls="custom-background-floaty"]', 'title', 'customImage', 'Custom Background Image');
        setAttribute('.open-floaty-btn[aria-controls="custom-background-floaty"]', 'aria-label', 'customImage', 'Custom Background Image');
        setAttribute('#book-file-name', 'placeholder', 'noBook', 'No book loaded');
        setAttribute('#book-file-name', 'aria-label', 'chooseBook', 'Choose an opening book');
        for(const [selector, key, fallback] of [
            ['#custom-background-remove', 'removeImage', 'Remove image'],
            ['#book-file-remove', 'removeBook', 'Remove opening book']
        ]) {
            setAttribute(selector, 'title', key, fallback);
            setAttribute(selector, 'aria-label', key, fallback);
        }
    }

    document.addEventListener('acas-translations-updated', translate);
    translate();
}