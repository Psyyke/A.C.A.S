// utilities.js
// General utility functions for A.C.A.S GUI and modules.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used throughout the codebase for type conversion, input handling, and more.

// Utility functions for A.C.A.S GUI

/**
 * Convert a string value to its correct type (boolean, number, or string).
 * @param {string} val
 * @returns {boolean|number|string}
 */
export function convertToCorrectType(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (!isNaN(val) && val !== '' && val !== null) return Number(val);
  return val;
}

/**
 * Set the default value for an input element.
 * @param {HTMLElement} elem
 */
export function activateInputDefaultValue(elem) {
  if (elem.type === 'checkbox') {
    elem.checked = elem.dataset.defaultValue === 'true';
  } else {
    elem.value = elem.dataset.defaultValue;
  }
}

/**
 * Allow only number input in a field.
 * @param {Event} event
 * @returns {boolean}
 */
export function allowOnlyNumbers(event) {
  const charCode = event.which ? event.which : event.keyCode;
  if (charCode > 31 && (charCode < 48 || charCode > 57)) {
    event.preventDefault();
    return false;
  }
  return true;
}

/**
 * Update a dropdown menu with filtered options.
 * @param {Object} params
 */
export function updateDropdown({ inputElem, iconElem, listContainerElem, optionsArr, showAll, updateDropdown, listItems }) {
  // Not pretty code and could be simpler
  const filterStr = inputElem.value.toLowerCase().trim();
  const words = filterStr.split(/\s+/);
  const filteredOptions = optionsArr.filter(option =>
    words.every(word => {
      const lowerCaseWord = word.toLowerCase();
      return option.includes(lowerCaseWord);
    })
  );
  const options = showAll ? optionsArr : filteredOptions;
  listItems.forEach(elem => {
    if (options.includes(elem.dataset.value?.toLowerCase()) || options.includes(elem.dataset.value)) {
      elem.classList.remove('hidden');
    } else {
      elem.classList.add('hidden');
    }
  });
  listItems
    .filter(elem => !elem.getAttribute('onclick-set'))
    .forEach(elem => {
      elem.addEventListener('click', e => {
        inputElem.value = e.target.dataset.value;
        const selectedClass = 'selected-list-item';
        listItems.forEach(x => x.classList.remove(selectedClass));
        elem.classList.add(selectedClass);
        setTimeout(() => {
          inputElem.dispatchEvent(new Event('change'));
          updateDropdown(true);
        }, 100);
      });
      elem.setAttribute('onclick-set', true);
    });
}
