const initializedRanges = new WeakSet();

export function initializeRangeInput(input) {
    if(input.type !== 'range' || initializedRanges.has(input)) return;
    initializedRanges.add(input);

    const output = [...(input.closest('.range-control')?.querySelectorAll('output') ?? [])]
        .find(element => !element.htmlFor.length || [...element.htmlFor].includes(input.id));
    const valueLabel = output ? document.createElement('span') : null;
    if(valueLabel) {
        valueLabel.className = 'range-value';
        output.replaceChildren(valueLabel);
    }

    function update() {
        const min = input.min === '' ? 0 : Number(input.min);
        const max = input.max === '' ? 100 : Number(input.max);
        const value = Number(input.value);
        const progress = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
        input.style.setProperty('--range-progress', `${progress * 100}%`);
        if(!output) return;

        const decimalPlaces = number => {
            const [coefficient, exponent = '0'] = String(number).toLowerCase().split('e');
            return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
        };
        const requestedPrecision = Number(input.dataset.rangePrecision ?? 6);
        const freePrecision = Number.isFinite(requestedPrecision) ? Math.max(0, Math.floor(requestedPrecision)) : 6;
        const precision = Math.min(20, Math.max(decimalPlaces(min), decimalPlaces(max),
            input.step === 'any' ? freePrecision : decimalPlaces(input.step || 1)));
        const unit = input.dataset.rangeUnit ? ` ${input.dataset.rangeUnit}` : '';
        const format = number => number.toFixed(precision);
        valueLabel.textContent = `${format(value)}${unit}`;

        // Overlay an invisible worst-case label in the same grid cell. Unlike
        // measuring a hidden dialog in pixels, this also follows loaded fonts.
        const widestNumber = Math.max(Math.abs(min), Math.abs(max)).toFixed(precision).replace(/\d/g, '8');
        output.dataset.rangeReserve = `${min < 0 ? '-' : ''}${widestNumber}${unit}`;
    }

    input.addEventListener('input', update);
    input.addEventListener('change', update);
    input.addEventListener('acas-value-set', update);
    new MutationObserver(update).observe(input, {
        attributes: true, attributeFilter: ['min', 'max', 'step', 'data-range-unit', 'data-range-precision']
    });
    update();
}