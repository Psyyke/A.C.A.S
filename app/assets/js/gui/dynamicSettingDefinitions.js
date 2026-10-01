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
    if(bounds?.every(Number.isFinite) && Math.floor(bounds[1]) > Math.ceil(bounds[0]))
        return { min: Math.ceil(bounds[0]), max: Math.floor(bounds[1]), type: 'number', input };
    return null;
}

export function categoricalCurveDefinition(definition, curve) {
    if(!definition?.categorical || !Array.isArray(curve?.values)) return definition;
    const values = [...curve.values];
    // New choices append; reordering or removing dropdown items must not change old points.
    definition.values.forEach(value => { if(!values.includes(value)) values.push(value); });
    const labels = values.map(value => {
        const index = definition.values.indexOf(value);
        return index < 0 ? text('unavailable', '{value} (unavailable)', { value }) : definition.labels[index];
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