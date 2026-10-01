import { dynamicText as text, dynamicVariableLabel } from '../misc/featureTranslations.js';

export function otherVariableLines(lines, key, variable) {
    return lines.filter(line => line.key === key && line.curve.variable !== variable);
}

export function createVariableLinks(lines, variables, navigate) {
    return [...new Set(lines.map(line => line.curve.variable))].filter(key => variables[key]).map(key => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dynamic-variable-link';
        const label = dynamicVariableLabel(key, variables[key].label);
        button.textContent = `${label} ↗`;
        button.title = text('variableLink', 'Use {variable}: open the existing curves', { variable: label });
        button.onclick = () => navigate(key);
        return button;
    });
}

export function confirmLineRemoval(line, confirmRemoval = message => window.confirm(message)) {
    if(!line) return false;
    return confirmRemoval(text('removeConfirm', 'Remove the {setting} line from profile "{profile}"?\n\nThis deletes all its points and restores the saved default for this setting.', {
        setting: line.label, profile: typeof GET_HUMAN_READABLE_PROFILE_NAME === 'function'
            ? GET_HUMAN_READABLE_PROFILE_NAME(line.profile) : line.profile }));
}