const floatyBackgroundObservers = new WeakMap();

function observeFloatyDropdown(list) {
    const dialog = list.closest('dialog');
    const container = dialog?.querySelector(':scope > .floaty-container');
    if(!container) return;

    let observer = floatyBackgroundObservers.get(dialog);
    if(!observer) {
        observer = new ResizeObserver(entries => {
            if(!dialog.isConnected) {
                observer.disconnect();
                floatyBackgroundObservers.delete(dialog);
                return;
            }
            entries.forEach(entry => {
                if(entry.target !== container && !entry.target.isConnected) observer.unobserve(entry.target);
            });
            const bottom = container.getBoundingClientRect().bottom;
            const overflow = [...container.querySelectorAll('.dropdown-list-container')]
                .filter(dropdown => dropdown.closest('dialog') === dialog && dropdown.getClientRects().length)
                .reduce((extra, dropdown) => Math.max(extra, dropdown.getBoundingClientRect().bottom - bottom), 0);
            if(overflow > 0) container.style.setProperty('--floaty-dropdown-overflow', `${Math.ceil(overflow)}px`);
            else container.style.removeProperty('--floaty-dropdown-overflow');
        });
        observer.observe(container);
        floatyBackgroundObservers.set(dialog, observer);
    }
    observer.observe(list);
}

function initializeFloatyDropdown(list, input) {
    const dialog = list.closest('dialog');
    if(!dialog || list.closest('.dropdown-input-special')) return;
    if(typeof list.showPopover !== 'function') {
        observeFloatyDropdown(list);
        return;
    }

    const trigger = list.parentElement;
    list.setAttribute('popover', 'manual');
    let hoverTimer;
    const observer = new ResizeObserver(position);

    function position() {
        if(!list.matches(':popover-open')) return;
        if(!dialog.open || !trigger.isConnected || !list.children.length) return close();
        const bounds = trigger.getBoundingClientRect();
        const edge = 8;
        if(bounds.bottom <= 0 || bounds.top >= innerHeight) return close();
        list.style.setProperty('--dropdown-min-width', `${Math.min(bounds.width, innerWidth - edge * 2)}px`);
        const below = Math.max(0, innerHeight - bounds.bottom - edge);
        const above = Math.max(0, bounds.top - edge);
        const borders = list.offsetHeight - list.clientHeight;
        const height = Math.min(300, list.scrollHeight + borders);
        const upward = height > below && above > below;
        const available = upward ? above : below;
        list.style.setProperty('--dropdown-max-height', `${available}px`);
        const width = list.getBoundingClientRect().width;
        const left = getComputedStyle(trigger).direction === 'rtl' ? bounds.right - width : bounds.left;
        list.style.setProperty('--dropdown-x', `${Math.max(edge, Math.min(left, innerWidth - width - edge))}px`);
        list.style.setProperty('--dropdown-y', `${upward ? bounds.top - Math.min(height, available) : bounds.bottom}px`);
    }

    function outside(event) {
        if(!trigger.contains(event.target)) close();
    }

    function close() {
        clearTimeout(hoverTimer);
        if(list.matches(':popover-open')) list.hidePopover();
        observer.disconnect();
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        document.removeEventListener('pointerdown', outside, true);
    }

    function open() {
        clearTimeout(hoverTimer);
        if(input.disabled || !dialog.open || !list.isConnected || !list.children.length) return;
        if(!list.matches(':popover-open')) list.showPopover();
        position();
        if(!list.matches(':popover-open')) return;
        observer.observe(trigger);
        observer.observe(list);
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        document.addEventListener('pointerdown', outside, true);
    }

    trigger.addEventListener('pointerenter', event => {
        if(event.pointerType !== 'touch') hoverTimer = setTimeout(open, 250);
    });
    trigger.addEventListener('pointerleave', event => {
        if(event.pointerType !== 'touch') close();
    });
    trigger.addEventListener('click', event => {
        if(!list.contains(event.target)) open();
    });
    list.addEventListener('click', event => {
        if(event.target.closest('.dropdown-item[data-value]')) close();
    });
    dialog.addEventListener('keydown', event => {
        if(event.key === 'Escape' && list.matches(':popover-open')) {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    }, true);
    dialog.addEventListener('close', close);
    list.addEventListener('toggle', event => {
        if(event.newState === 'closed') close();
    });
}

export function doesDropdownItemExist(dropdownInputElem, itemValue) {
    const cleanedItemValue = CSS.escape(String(itemValue));

    if(cleanedItemValue === '') return false;

    const selector = `*[data-value=${cleanedItemValue}]`;

    return dropdownInputElem.parentElement.querySelector(selector) ? true : false;
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
    // Engine option dropdowns are initialized before they are attached.
    requestAnimationFrame(() => initializeFloatyDropdown(listContainerElem, inputElem));

    function updateDropdown(showAll) {
        const listItems = [...listContainerElem.querySelectorAll('.dropdown-item')]
            .filter(x => x?.dataset?.value);

        const optionsArr = listItems.map(elem => elem.dataset.value?.toLowerCase() || "");
        
        // Not pretty code and could be simpler
        const filterStr = inputElem.value.toLowerCase().trim();
        const words = filterStr.split(/\s+/);
        const filteredOptions = optionsArr.filter((option, index) =>
            words.every(word => {
                const lowerCaseWord = word.toLowerCase();
                return `${option} ${listItems[index].textContent.toLowerCase()}`.includes(lowerCaseWord);
            })
        );
            
        const options = showAll ? optionsArr : filteredOptions;
        const selectedClass = 'selected-list-item';
        const currentValue = inputElem.value?.toLowerCase()?.trim();

        listItems.forEach(elem => {
            const elemValue = elem.dataset.value?.toLowerCase();
            
            if(options.includes(elemValue) || options.includes(elem.dataset.value)) {
                elem.classList.remove('hidden');
            } else {
                elem.classList.add('hidden');
            }

            if(currentValue && elemValue === currentValue) {
                elem.classList.add(selectedClass);
            } else {
                elem.classList.remove(selectedClass);
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
    inputElem.addEventListener('acas-value-set', () => updateDropdown(true));
    iconElem.addEventListener('click', () => updateDropdown(true));

    updateDropdown(true);

    new MutationObserver(() => updateDropdown(true))
        .observe(listContainerElem, { childList: true, subtree: true });
}

export function initializeDropdowns() {
    const dropdownInputElems = [...document.querySelectorAll('.dropdown-input')];
    dropdownInputElems.forEach(elem => initializeDropdown(elem));
}