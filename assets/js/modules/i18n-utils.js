// i18n-utils.js
// Internationalization helpers for language dropdowns and translation loading in A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used by the GUI for language selection and translation.

// i18n utility functions for A.C.A.S

/**
 * Get the path to a flag image for a language code.
 * @param {string} languageCode
 * @returns {string}
 */
export function getFlagPath(languageCode) {
    return `../assets/images/flags/${languageCode}.svg`;
}

/**
 * Set up the language dropdown with available languages and event listeners.
 * @param {HTMLElement} dropdownElem
 * @param {string} currentLang
 * @param {Array} availableLanguages
 * @param {Function} load
 */
export function setLanguageDropdown(dropdownElem, currentLang, availableLanguages, load) {
    if (dropdownElem.dataset.initialized) return;
    dropdownElem.dataset.initialized = "true";
    const listContainer = dropdownElem.querySelector('.dropdown-list-container');
    const selectedFlagImg = listContainer.parentElement.querySelector('img');
    selectedFlagImg.src = getFlagPath(currentLang);
    if (listContainer) {
        availableLanguages.forEach(x => {
            const languageCode = x[0];
            const languageSearchTerm = x[1];
            const svgPath = getFlagPath(languageCode);
            const dropdownItem = document.createElement('div');
            dropdownItem.classList.add('dropdown-item');
            dropdownItem.dataset.value = languageSearchTerm;
            dropdownItem.title = languageSearchTerm + ` (${languageCode})`;
            dropdownItem.innerHTML = `<img>`;
            dropdownItem.querySelector('img').src = svgPath;
            listContainer.appendChild(dropdownItem);
            dropdownItem.onclick = function() {
                localStorage.setItem('selectedLanguage', languageCode);
                selectedFlagImg.src = svgPath;
                load(languageCode, true);
            };
        });
    }
}
