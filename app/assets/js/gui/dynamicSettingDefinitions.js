// Categorical Y coordinates are stable indices into persisted values, not strings to interpolate.
import { dynamicText as text } from '../misc/featureTranslations.js';
export function describeSettingInput(input, parseBounds) {
    if(!input || input.dataset.noProfile) return null;
    if(input.getAttribute('additional-type') === 'dropdown' || input.tagName === 'SELECT') {
        const items = input.tagName === 'SELECT' ? [...input.options]
            : [...(input.closest('.dropdown-input')?.querySelectorAll('.dropdown-item[data-value]') ?? [])];
        const options = [];
        const seen = new Set();
        items.forEach(item => {
            if(item.classList.contains('force-hidden') || item.classList.contains('requires-sab') || item.disabled) return;
            const value = input.tagName === 'SELECT' ? item.value : item.dataset.value;
            if(value === undefined || seen.has(value)) return;
            seen.add(value);
            const label = [...item.childNodes].filter(node => node.nodeType === 3)
                .map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim() || value || text('none', 'None');
            options.push({ value, label });
        });
        if(!options.length) return null;
        return { min: 0, max: options.length, type: 'dropdown', categorical: true, input,
            values: [null, ...options.map(option => option.value)], labels: [text('savedDefault', 'Saved default'), ...options.map(option => option.label)] };
    }
    if(input.type === 'checkbox') return { min: 0, max: 1, boolean: true, type: 'boolean', input };
    const bounds = input.dataset.between ? parseBounds(input.dataset.between) : null;
    if(bounds?.every(Number.isFinite) && bounds[1] >= bounds[0]) {
        const decimal = input.step === 'any' || Number(input.step) > 0 && Number(input.step) < 1
            || bounds.some(value => !Number.isInteger(value))
            || input.dataset.dynamicValueType === 'number' && !input.dataset.spin
            || Number.isFinite(Number(input.dataset.defaultValue)) && !Number.isInteger(Number(input.dataset.defaultValue));
        return { min: bounds[0], max: bounds[1], decimal, type: 'number', input };
    }
    const textfield = input.tagName === 'TEXTAREA' || ['text', 'textfield', 'number'].includes(input.type);
    if(!textfield) return null;
    const defaultValue = input.dataset.defaultValue ?? input.value ?? '';
    const numericDefault = String(defaultValue).trim() !== '' && Number.isFinite(Number(defaultValue));
    if(input.type === 'number' || input.dataset.spin || input.dataset.dynamicValueType === 'number'
        || numericDefault && input.dataset.dynamicValueType !== 'text') {
        // Missing limits are not a reason to exclude a setting. These are value
        // constraints, not graph viewport limits; null is safe to persist as JSON.
        const numberAttribute = name => input.hasAttribute(name) && input.getAttribute(name).trim() !== ''
            && Number.isFinite(Number(input.getAttribute(name))) ? Number(input.getAttribute(name)) : null;
        return { min: numberAttribute('min'), max: numberAttribute('max'),
            decimal: !input.dataset.spin || input.step === 'any' || Number(input.step) > 0 && Number(input.step) < 1,
            type: 'number', input };
    }
    if(input.dataset.key?.startsWith('DYNAMIC_')) {
        return { min: 0, max: 0, type: 'text', text: true, categorical: true, input,
            values: [null], labels: [text('savedDefault', 'Saved default')] };
    }
    return null;
}

export function categoricalCurveDefinition(definition, curve) {
    if(!definition?.categorical || !Array.isArray(curve?.values)) return definition;
    const values = [...curve.values];
    // New choices append; reordering or removing dropdown items must not change old points.
    definition.values.forEach(value => { if(!values.includes(value)) values.push(value); });
    const labels = values.map(value => {
        const index = definition.values.indexOf(value);
        return index < 0 ? definition.text ? textValueLabel(value)
            : text('unavailable', '{value} (unavailable)', { value }) : definition.labels[index];
    });
    return { ...definition, values, labels, min: 0, max: values.length - 1 };
}

export function alignCategoricalCurves(lines, definition) {
    const values = [...definition.values];
    lines.forEach(line => line.curve.values.forEach(value => { if(!values.includes(value)) values.push(value); }));
    lines.forEach(line => {
        const oldValues = line.curve.values;
        line.curve.points = line.curve.points.map(point => ({ ...point, y: values.indexOf(oldValues[point.y]) }));
        line.curve.values = [...values];
        line.curve.minY = 0;
        line.curve.maxY = values.length - 1;
    });
}

export function textValueLabel(value) {
    return value === '' ? text('emptyText', '(empty text)') : String(value);
}

export function coercePointY(value, definition) {
    return Math.max(definition.min ?? -Infinity,
        Math.min(definition.max ?? Infinity, definition.decimal ? value : Math.round(value)));
}