// Feature UI shares the site's TRANS_OBJ and English fallbacks.
export function featureText(feature, key, fallback, values = {}) {
    const translations = typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ;
    return (translations?.[feature]?.[key] ?? fallback)
        .replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

export function dynamicText(key, fallback, values) {
    return featureText('dynamicSettings', key, fallback, values);
}

export function dynamicVariableLabel(key, fallback) {
    return dynamicText(key, fallback);
}