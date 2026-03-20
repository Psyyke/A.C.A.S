export function doesDropdownItemExist(dropdownInputElem, itemValue) {
    return dropdownInputElem.parentElement.querySelector(`*[data-value="${itemValue}"`) ? true : false;
}

export function addDropdownItem(dropdownElem, itemValue, itemText) {
    const listContainerElem = dropdownElem.querySelector('.dropdown-list-container');

    const itemElem = document.createElement('div');
        itemElem.classList.add('dropdown-item');
        itemElem.dataset.value = itemValue;
        itemElem.innerText = itemText ? itemText : itemValue;

    listContainerElem.appendChild(itemElem);

    return itemElem;
}

function removeDropdownItem(dropdownElem, itemValue, newValue) {
    const dropdownItem = dropdownElem.querySelector(`*[data-value="${itemValue}"]`);
    const dropdownInput = dropdownElem.querySelector('input[data-default-value]');

    dropdownInput.value = newValue || dropdownInput.dataset.defaultValue;

    dropdownItem?.remove();

    dropdownInput.dispatchEvent(new Event('change'));
}

export function initializeDropdown(dropdownElem) {
    const inputElem = dropdownElem.querySelector('input');
    const iconElem = dropdownElem.querySelector('.dropdown-icon');
    const listContainerElem = dropdownElem.querySelector('.dropdown-list-container');

    function updateDropdown(showAll) {
        const listItems = [...listContainerElem.querySelectorAll('.dropdown-item')]
            .filter(x => x?.dataset?.value);

        const optionsArr = listItems.map(elem => elem.dataset.value?.toLowerCase() || "");
        
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
            if(options.includes(elem.dataset.value?.toLowerCase()) 
            || options.includes(elem.dataset.value)) {
                elem.classList.remove('hidden');
            } else {
                elem.classList.add('hidden');
            }
        });

        listItems
            .filter(elem => !elem.getAttribute('onclick-set'))
            .forEach(elem => {
                elem.addEventListener('click', e => {
                    inputElem.value = elem.dataset.value;

                    const updatedListItems = [...listContainerElem.querySelectorAll('.dropdown-item')]
                        .filter(x => x?.dataset?.value);

                    const selectedClass ='selected-list-item';
                    updatedListItems.forEach(x => x.classList.remove(selectedClass));
                    elem.classList.add(selectedClass);

                    setTimeout(() => {
                        inputElem.dispatchEvent(new Event('change'));

                        updateDropdown(true);
                    }, 100);
                });

                elem.setAttribute('onclick-set', true);
            });
    }

    inputElem.addEventListener('input', () => updateDropdown(false));
    iconElem.addEventListener('click', () => updateDropdown(true));

    updateDropdown(true);

    new MutationObserver(() => updateDropdown(true))
        .observe(listContainerElem, { childList: true, subtree: true });
}

export function initializeDropdowns() {
    const dropdownInputElems = [...document.querySelectorAll('.dropdown-input')];
    dropdownInputElems.forEach(elem => initializeDropdown(elem));
}