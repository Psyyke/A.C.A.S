// Panel shortcuts describe runtime overrides without ever changing an input's value.
import { formatSettingValue } from './dynamicGraph.js';
import { dynamicText as text, dynamicVariableLabel } from '../misc/featureTranslations.js';

export function getOwnedSettingInput(container) {
    return [...container.querySelectorAll('input[data-key],textarea[data-key],select[data-key]')]
        .find(input => input.closest('.custom-input') === container) ?? null;
}

export function describeDynamicSetting(core, base, curve, context, name) {
    const format = formatSettingValue;
    const variableName = core.variables[curve?.variable]
        ? dynamicVariableLabel(curve.variable, core.variables[curve.variable].label) : null;
    const enabled = Boolean(curve?.enabled && variableName && core.normalizePoints(curve.points).length);
    const variableValue = enabled ? core.getVariableValue(curve.variable, context) : null;
    const result = variableValue === null ? null : core.evaluateCurve(curve, variableValue);
    const usesSavedChoice = result !== null && Array.isArray(curve?.values) && curve.values[Math.round(result)] == null;
    const overridden = result !== null && !usesSavedChoice
        && !(curve.resetAtStart && (context?.gameStart || Number(context?.moveNumber) === 1));
    const effectiveValue = overridden ? core.resolveValue(base, curve, context) : base;
    const status = overridden
        ? text('override', 'Dynamic override active: {value} ({variable}: {position}).', {
            value: format(effectiveValue), variable: variableName, position: format(variableValue) })
        : enabled ? variableValue === null ? text('waiting', 'Dynamic curve enabled · waiting for {variable}.', { variable: variableName })
            : text('defaultActive', 'Dynamic curve enabled · using the saved default here.')
        : curve ? text('disabled', 'Dynamic curve disabled.') : text('noCurve', 'No dynamic curve enabled.');
    const description = `${name} · ${status} ${text('description', 'Saved value: {value}. The input keeps this editable value; it is used when no curve applies. Open dynamic settings to edit the curve.', { value: format(base) })}`;
    return { enabled, overridden, effectiveValue, displayValue: format(effectiveValue), description };
}

export function createDynamicSettingShortcut(container, input, openSetting) {
    const title = [...container.querySelectorAll('.input-title')]
        .find(element => element.closest('.custom-input') === container);
    if(!title || title.parentElement.classList.contains('dynamic-setting-title-row')) return null;

    const copy = title.parentElement;
    if(copy !== container) copy.classList.add('dynamic-setting-copy');
    const row = document.createElement('div');
    row.className = 'dynamic-setting-title-row';
    title.replaceWith(row);
    row.appendChild(title);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dynamic-setting-shortcut';
    button.dataset.key = input.dataset.key;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'dynamic-settings-floaty');
    // A monochrome curve stays legible across platforms, unlike an emoji glyph.
    button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3 19h18M5 17c5 0 3-10 8-10s3 5 6 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        openSetting(input.dataset.key, button, event.detail === 0);
    };

    const liveValue = document.createElement('span');
    liveValue.className = 'dynamic-setting-live-value';
    liveValue.setAttribute('role', 'tooltip');
    liveValue.hidden = true;
    // The button's accessible description already includes the live value.
    liveValue.setAttribute('aria-hidden', 'true');
    row.append(button, liveValue);
    return button;
}

export function restoreDynamicSettingShortcutFocus(button, keyboardActivated) {
    if(!button?.isConnected) return;
    if(keyboardActivated) {
        button.focus({ preventScroll: true });
    } else if(button.ownerDocument.activeElement === button) {
        // Dialogs may restore focus automatically. Pointer clicks must not leave
        // the setting's :focus-within reveal active after the editor closes.
        button.blur();
    }
}

export function updateDynamicSettingShortcut(button, state, name) {
    const container = button.closest('.custom-input');
    button.classList.toggle('is-dynamic', state.enabled);
    button.classList.toggle('is-overridden', state.overridden);
    container.classList.toggle('has-dynamic-override', state.overridden);
    const liveValue = button.parentElement.querySelector('.dynamic-setting-live-value');
    liveValue.hidden = !state.overridden;
    liveValue.textContent = state.overridden ? state.displayValue : '';
    button.setAttribute('aria-description', state.description);
    button.setAttribute('aria-label', text('openSetting', 'Open dynamic settings for {setting}', { setting: name }));
}