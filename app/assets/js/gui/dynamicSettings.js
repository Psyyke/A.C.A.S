import { clamp, fittedViewport, fittedCurveViewport, zoomAxis, panAxis, axisDomain, tickValues, formatTick, formatSettingValue, graphProfileStyle, moveCurvePoint, insertionX, modifierAxes, settingDisplayName, filterGraphLines, shouldCollapseVariableTabs, setInterpolationLockVisibility } from './dynamicGraph.js';
import { getOwnedSettingInput, describeDynamicSetting, createDynamicSettingShortcut, updateDynamicSettingShortcut, restoreDynamicSettingShortcutFocus } from './dynamicSettingShortcuts.js';
import { describeSettingInput, categoricalCurveDefinition, alignCategoricalCurves, coercePointY } from './dynamicSettingDefinitions.js';
import { otherVariableLines, createVariableLinks, confirmLineRemoval } from './dynamicSettingActions.js';
import { logActivity } from '../misc/activityLog.js';
import { dynamicText as text, dynamicVariableLabel } from '../misc/featureTranslations.js';

const core = AppDynamicSettingsCore;
const STORAGE_KEY = DYNAMIC_SETTINGS_STORAGE_KEY;
const graph = document.querySelector('#dynamic-settings-graph');
const svgNS = 'http://www.w3.org/2000/svg';
const plot = { left: 48, top: 22, right: 986, bottom: 460 };

const ui = Object.fromEntries([
    'dynamic-variable-select', 'dynamic-fullscreen-toggle',
    'dynamic-add-setting', 'dynamic-add-line',
    'dynamic-interpolation', 'dynamic-interpolation-lock', 'dynamic-interpolation-status', 'dynamic-delete-point', 'dynamic-delete-line',
    'dynamic-zoom-in', 'dynamic-zoom-out', 'dynamic-fit-graph',
    'dynamic-current-values', 'dynamic-lines-list', 'dynamic-add-point',
    'dynamic-variable-control', 'dynamic-variable-compact',
    'dynamic-point-x', 'dynamic-point-y', 'dynamic-point-status', 'dynamic-point-choice',
    'dynamic-point-text-control', 'dynamic-point-text', 'dynamic-apply-text'
].map(id => [id, document.getElementById(id)]));

let curves = [];
let selectedLineId = '';
let selectedPointIndex = -1;
let variable = 'pieceCount';
let viewport = fittedViewport();
let drag = null;
let currentVariableValue = null;
let currentContext = {};
let previewInstanceID = null;
let profileInfo = [];
const pointers = new Map();
let pendingSaves = Promise.resolve();
let initialized = false;
let loadVersion = 0;
let legendSignature = '';
let fitted = true;
let legendSelectedId = '';
let settingChosen = false;
let shortcutOpener = null;

const lineId = line => `${line.profile}\u0000${line.key}`;
const profileKey = name => GET_PROFILE_STORAGE_KEY(name);
const dynamicSettingsChannel = new BroadcastChannel(GUI_BROADCAST_NAME);
const variableLabel = key => dynamicVariableLabel(key, core.variables[key]?.label ?? key);

function translateUI() {
    const dialog = document.getElementById('dynamic-settings-floaty');
    [
        ['.title h1', 'title', 'Dynamic Settings'],
        ['.title p', 'subtitle', 'Graph editor · shape settings as the game changes'],
        ['#dynamic-add-line', 'addLine', '＋ Line'],
        ['#dynamic-delete-line', 'removeLine', 'Remove line'],
        ['#dynamic-add-point', 'addPoint', '＋ Point'],
        ['#dynamic-delete-point', 'deletePoint', 'Delete point'],
        ['#dynamic-apply-text', 'useText', 'Use text'],
        ['#dynamic-point-text-control label', 'textLabel', 'Text'],
        ['.dynamic-field-label', 'curve', 'Curve'],
        ['#dynamic-interpolation option[value=""]', 'selectLine', 'Select line'],
        ['#dynamic-interpolation option[value="step"]', 'step', 'Step'],
        ['#dynamic-interpolation option[value="linear"]', 'linear', 'Linear'],
        ['#dynamic-interpolation option[value="smooth"]', 'smooth', 'Smooth']
    ].forEach(([selector, key, fallback]) => { dialog.querySelector(selector).textContent = text(key, fallback); });
    Object.keys(core.variables).forEach(key => {
        const label = variableLabel(key);
        dialog.querySelector(`#dynamic-tab-${key} span`).textContent = label;
        ui['dynamic-variable-compact'].querySelector(`option[value="${key}"]`).textContent = label;
    });
    [
        ['.floaty-close-btn', 'close', 'Close graph editor'],
        ['#dynamic-variable-select', 'variable', 'Graph variable'],
        ['#dynamic-variable-compact', 'variable', 'Graph variable'],
        ['#dynamic-interpolation', 'curve', 'Curve'],
        ['#dynamic-zoom-in', 'zoomIn', 'Zoom in'],
        ['#dynamic-zoom-out', 'zoomOut', 'Zoom out'],
        ['#dynamic-fit-graph', 'fit', 'Fit graph'],
        ['.dynamic-point-inspector', 'coordinates', 'Selected point coordinates'],
        ['#dynamic-point-x', 'pointX', 'Selected point X value'],
        ['#dynamic-point-y', 'pointY', 'Selected point Y value'],
        ['#dynamic-point-choice', 'pointY', 'Selected point Y value'],
        ['#dynamic-point-text', 'pointText', 'Custom text for selected point'],
        ['#dynamic-settings-graph', 'title', 'Dynamic Settings']
    ].forEach(([selector, key, fallback]) => { dialog.querySelector(selector).setAttribute('aria-label', text(key, fallback)); });
    const evaluationHint = text('evaluationHint', 'Your advantage: negative means losing, zero means equal, positive means winning. Uses the latest completed primary evaluation.');
    dialog.querySelector('#dynamic-tab-evaluation').title = evaluationHint;
    ui['dynamic-variable-compact'].title = variable === 'evaluation' ? evaluationHint : '';
    ui['dynamic-fit-graph'].title = text('fitHint', 'Fit both axes with space around the line');
    ui['dynamic-point-text'].placeholder = text('customText', 'Custom text');
    ui['dynamic-apply-text'].title = text('useTextHint', 'Use this exact text at the selected point. Empty text is allowed.');
    graph.setAttribute('aria-description', text('graphHint', 'Drag points to move them, drag empty space to pan, pinch or scroll to zoom. Arrow keys move a selected point by the current scale; Shift moves it by ten steps. Delete removes the selected point.'));
    const fullscreen = dialog.classList.contains('is-graph-fullscreen');
    ui['dynamic-fullscreen-toggle'].setAttribute('aria-label', text(fullscreen ? 'exitFullscreen' : 'fullscreen', fullscreen ? 'Exit fullscreen graph' : 'Fullscreen graph'));
    ui['dynamic-fullscreen-toggle'].title = ui['dynamic-fullscreen-toggle'].getAttribute('aria-label');
    curves.forEach(line => { line.label = settingLabel(line.key); });
    legendSignature = '';
    fillAddSettingOptions();
    syncSelectedLine();
    updateVariableLayout();
    render();
    refreshSettingShortcuts();
}

function getSettingDefinition(key) {
    const input = [...document.querySelectorAll('input[data-key],textarea[data-key],select[data-key]')]
        .find(elem => elem.dataset.key === key);
    const definition = describeSettingInput(input, PARSE_MINMAX_FROM_STR);
    const line = curves.find(line => line.key === key && lineId(line) === selectedLineId)
        ?? curves.find(line => line.key === key);
    return categoricalCurveDefinition(definition, line?.curve);
}

function getSettingKeys() {
    return [...new Set([...document.querySelectorAll('input[data-key],textarea[data-key],select[data-key]')]
        .map(input => input.dataset.key)
        .filter(key => key && getSettingDefinition(key)))];
}

function refreshSettingShortcuts(event) {
    const activeProfile = GET_HUMAN_READABLE_PROFILE_NAME(SETTING_FILTER_OBJ.profileID);
    const changedInput = event?.target;
    const container = changedInput?.closest?.('.custom-input');
    const buttons = container
        ? [...container.querySelectorAll('.dynamic-setting-shortcut')].filter(button => button.dataset.key === changedInput.dataset.key)
        : document.querySelectorAll('.dynamic-setting-shortcut');
    buttons.forEach(button => {
        const key = button.dataset.key;
        const line = curves.find(item => item.profile === activeProfile && item.key === key);
        const input = getOwnedSettingInput(button.closest('.custom-input'));
        const rawBase = input?.type === 'checkbox' ? input.checked : input?.value;
        const definition = getSettingDefinition(key);
        const base = definition?.text && rawBase != null ? rawBase
            : rawBase === '' || rawBase == null ? settingBase(activeProfile, key) : VAR_TO_CORRECT_TYPE(rawBase);
        const settingName = settingLabel(key);
        const contexts = previewContexts();
        const state = describeDynamicSetting(core, base, line?.curve, currentContext, settingName);
        if(contexts.length > 1 && line) {
            const states = contexts.map(({ instanceID, context }, index) => ({
                instanceName: document.querySelector(`.dropdown-item[data-instance-id="${instanceID}"] .dropdown-item-title`)?.textContent || `${text('instance', 'Instance')} ${index + 1}`,
                state: describeDynamicSetting(core, base, line.curve, context, settingName) }));
            state.overridden = states.some(item => item.state.overridden);
            state.displayValue = states.map(item => `${item.instanceName}: ${item.state.displayValue}`).join(' · ');
            state.description = states.map(item => `${item.instanceName}: ${item.state.description}`).join(' ');
        }
        updateDynamicSettingShortcut(button, state, settingName);
    });
}

async function openSettingCurve(key, button, keyboardActivated) {
    shortcutOpener = { button, keyboardActivated };
    // Mark this as an explicit choice before loadCurves rebuilds the picker.
    settingChosen = true;
    ui['dynamic-add-setting'].value = key;
    await loadCurves();
    ui['dynamic-add-setting'].value = key;
    selectSetting();
    const dialog = document.getElementById('dynamic-settings-floaty');
    if(!dialog.open) {
        dialog.showModal();
        document.body.style.overflow = 'hidden';
    }
    if(dialog.open) ui['dynamic-add-setting'].focus({ preventScroll: true });
}

function initializeSettingShortcuts() {
    document.querySelectorAll('#main-setting-panel .custom-input').forEach(container => {
        if(container.closest('#dynamic-settings-floaty')) return;
        const input = getOwnedSettingInput(container);
        const key = input?.dataset.key;
        if(!key || !getSettingDefinition(key)) return;
        const button = createDynamicSettingShortcut(container, input, openSettingCurve);
        if(!button) return;
        input.addEventListener('input', refreshSettingShortcuts);
        input.addEventListener('change', refreshSettingShortcuts);
        input.addEventListener('acas-value-set', refreshSettingShortcuts);
    });
    refreshSettingShortcuts();
}

function filteredLines() {
    return filterGraphLines(curves, variable, ui['dynamic-add-setting'].value);
}

function visibleLines() {
    return filterGraphLines(curves, variable, ui['dynamic-add-setting'].value, true);
}

function lineStyle(line) {
    return graphProfileStyle(profileInfo.findIndex(profile => profile.name === line.profile));
}

function graphDomain() {
    const definition = core?.variables?.[variable];
    const min = Number(definition?.min ?? 0);
    const max = Number(definition?.max ?? 32);
    return { ...axisDomain(viewport.x, min, max), absoluteMin: min, absoluteMax: max };
}

function selectedLine() {
    return filteredLines().find(line => lineId(line) === selectedLineId);
}

function yBounds(line) {
    const definition = getSettingDefinition(line?.key ?? ui['dynamic-add-setting'].value);
    // A finite coordinate reference is independent of optional value constraints.
    // Keep it stable during dragging, even when a point moves beyond this range.
    const min = definition?.min ?? (definition?.max != null ? definition.max - 1 : 0);
    const max = definition?.max ?? min + 1;
    return { min, max: max > min ? max : min + 1 };
}

function yDomain(line) {
    const bounds = yBounds(line);
    return axisDomain(viewport.y, bounds.min, bounds.max);
}

function fitGraphViewport() {
    // Step, linear and monotone smooth curves stay within their point bounds.
    // Hidden profiles and live-position markers must not expand the fitted view.
    const definition = getSettingDefinition(ui['dynamic-add-setting'].value);
    return fittedCurveViewport(visibleLines().flatMap(line => line.curve.points),
        core.variables[variable], yBounds(), Boolean(definition?.boolean),
        Boolean(definition?.decimal || definition?.type === 'number' && (definition.min == null || definition.max == null)));
}

function zoomViewportAxis(axis, view, factor, anchor) {
    const bounds = axis === 'x' ? core.variables[variable] : yBounds();
    // Allow tight fits even for settings whose full domain spans millions of values.
    const definition = axis === 'y' && getSettingDefinition(ui['dynamic-add-setting'].value);
    const decimal = definition?.decimal;
    const minimumSpan = decimal ? 1e-12 / (bounds.max - bounds.min || 1)
        : Math.min(1 / 64, 1 / (bounds.max - bounds.min || 1));
    const unbounded = definition?.type === 'number' && (definition.min == null || definition.max == null);
    return zoomAxis(view, factor, anchor, minimumSpan, unbounded ? Number.MAX_VALUE : Math.max(16, view.span));
}

function snapStep(domain, decimal = false) {
    // Use finer increments as the visible axis range shrinks with zoom.
    const extent = (domain.max - domain.min) / (decimal ? 100 : 10);
    return 10 ** Math.floor(Math.log10(Math.max(decimal ? 1e-12 : 1, extent)));
}

function selectLine(line, pointIndex = -1) {
    selectedLineId = line ? lineId(line) : '';
    selectedPointIndex = pointIndex;
    // Profiles of the same setting share a scale; selecting one must not refit it.
    syncSelectedLine();
    render();
}

function ensureSelection() {
    const activeProfile = GET_HUMAN_READABLE_PROFILE_NAME(SETTING_FILTER_OBJ.profileID);
    const activeProfileLine = filteredLines().find(line => line.profile === activeProfile);
    const line = activeProfileLine ?? (selectedLine() ? null : visibleLines()[0] ?? filteredLines()[0]);
    if(line) {
        selectedLineId = lineId(line);
        selectedPointIndex = -1;
    } else if(!selectedLine()) {
        selectedLineId = '';
        selectedPointIndex = -1;
    }
}

function selectVariable(nextVariable) {
    if(!core.variables[nextVariable]) return;
    variable = nextVariable;
    fitted = true;
    viewport = fittedViewport();
    selectedPointIndex = -1;
    currentVariableValue = core.getVariableValue(variable, currentContext);
    ui['dynamic-variable-select'].querySelectorAll('[role="tab"]').forEach(tab => {
        const active = tab.dataset.variable === variable;
        tab.setAttribute('aria-selected', String(active));
        tab.classList.toggle('selected-tab-item', active);
        tab.tabIndex = active ? 0 : -1;
    });
    ui['dynamic-variable-compact'].value = variable;
    ui['dynamic-variable-compact'].title = variable === 'evaluation'
        ? text('evaluationHint', 'Your advantage: negative is losing, zero is equal, positive is winning. Latest completed primary evaluation.') : '';
    document.getElementById('dynamic-graph-panel').setAttribute('aria-labelledby', `dynamic-tab-${variable}`);
    updateVariableLayout();
    ensureSelection();
    viewport = fitGraphViewport();
    syncSelectedLine();
    render();
}

function selectSetting() {
    settingChosen = true;
    selectedLineId = '';
    selectedPointIndex = -1;
    updateAddSettingTitle();
    const key = ui['dynamic-add-setting'].value;
    const existing = curves.filter(line => line.key === key);
    const activeProfile = GET_HUMAN_READABLE_PROFILE_NAME(SETTING_FILTER_OBJ.profileID);
    const activeProfileLine = existing.find(line => line.profile === activeProfile);
    // Open an existing graph when this setting has no curves on the current tab.
    // This never rewrites the variable stored on any profile's curve.
    const nextVariable = activeProfileLine?.curve.variable ?? (existing.some(line => line.curve.variable === variable) ? variable
        : existing[0]?.curve.variable ?? variable);
    selectVariable(nextVariable);
    const preferredLine = activeProfileLine ?? existing.find(line => line.curve.variable === nextVariable);
    if(preferredLine) selectLine(preferredLine);
    refreshSettingShortcuts();
}

function createSvg(tag, attrs = {}, text = '') {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
    if(text) element.textContent = text;
    return element;
}

function settingBase(profileName, key) {
    const profile = profileInfo.find(item => item.name === profileName);
    const value = profile?.config?.[key];
    const definition = getSettingDefinition(key);
    const fallback = definition?.input.dataset.defaultValue ?? 0;
    return definition?.text ? String(value ?? fallback) : value ?? VAR_TO_CORRECT_TYPE(fallback);
}

function lineValue(line) {
    const base = settingBase(line.profile, line.key);
    const context = currentContext;
    return core?.resolveValue(base, line.curve, context) ?? base;
}

function previewContexts() {
    const instanceID = SETTING_FILTER_OBJ.instanceID;
    return core.getContexts().filter(item => instanceID == null || String(instanceID) === item.instanceID);
}

function pointLabel(line, y) {
    const definition = categoricalCurveDefinition(getSettingDefinition(line.key), line.curve);
    return definition?.categorical ? definition.labels[y] ?? String(y) : String(y);
}

function render() {
    if(!graph || !core) return;
    graph.replaceChildren();
    const domain = graphDomain();
    const height = plot.bottom - plot.top;
    const activeLine = selectedLine();
    const activeY = yDomain(activeLine);
    // Only reserve enough space for the actual numeric labels, never a vertical caption.
    const compact = graph.getBoundingClientRect().width < 600;
    const axisDefinition = getSettingDefinition(ui['dynamic-add-setting'].value);
    const booleanAxis = Boolean(axisDefinition?.boolean);
    const yTicks = axisDefinition?.categorical ? axisDefinition.values.map((_, index) => index).filter(value => value >= activeY.min && value <= activeY.max)
        : booleanAxis ? [0, 1].filter(value => value >= activeY.min && value <= activeY.max)
        : tickValues(activeY.min, activeY.max, 5, !axisDefinition?.decimal);
    [axisDefinition?.min, axisDefinition?.max].filter(Number.isFinite).forEach(value => {
        if(value >= activeY.min && value <= activeY.max && !yTicks.includes(value)
            && viewport.y.span >= 1) yTicks.push(value);
    });
    yTicks.sort((a, b) => a - b);
    const tickLabel = value => axisDefinition?.categorical ? axisDefinition.labels[value] : formatTick(value);
    const widestTick = Math.max(1, ...yTicks.map(value => tickLabel(value).length));
    // Do not move the coordinate origin underneath an active drag/pinch.
    // Match the label truncation padding so four-digit values fit without an ellipsis.
    if(!pointers.size) plot.left = clamp(widestTick * (compact ? 6 : 7) + 12, compact ? 28 : 32,
        axisDefinition?.categorical ? Math.min(compact ? 135 : 210, graph.getBoundingClientRect().width * 0.36) : compact ? 66 : 78);
    const width = plot.right - plot.left;
    const xToPixel = x => plot.left + (x - domain.min) / (domain.max - domain.min || 1) * width;
    const yToPixel = (y, range) => plot.bottom - (y - range.min) / (range.max - range.min) * height;
    const defs = createSvg('defs');
    const clip = createSvg('clipPath', { id: 'dynamic-plot-clip' });
    clip.appendChild(createSvg('rect', { x: plot.left, y: plot.top, width, height }));
    defs.appendChild(clip);
    graph.appendChild(defs);
    graph.appendChild(createSvg('rect', { x: plot.left, y: plot.top, width, height, class: 'dynamic-plot-bg' }));

    const xTicks = tickValues(domain.min, domain.max, compact ? 4 : 8, true)
        .filter(value => variable !== 'pieceCount' || value >= 0 && value <= 32);
    if(variable === 'pieceCount' && domain.min <= 32 && domain.max >= 32 && !xTicks.includes(32)) xTicks.push(32);
    xTicks.sort((a, b) => a - b).forEach(value => {
        const x = xToPixel(value);
        graph.appendChild(createSvg('line', { x1: x, y1: plot.top, x2: x, y2: plot.bottom, class: 'dynamic-grid-line' }));
        const label = variable === 'evaluation' ? (value === 0 ? text('equal', 'Equal (0 cp)').split(/[（(]/)[0].trim() : `${value > 0 ? '+' : ''}${formatTick(value)}`) : formatTick(value);
        graph.appendChild(createSvg('text', { x, y: plot.bottom + 22, class: 'dynamic-axis-label', 'text-anchor': 'middle' }, label));
    });
    let lastTickY = Infinity;
    yTicks.forEach(value => {
        const y = yToPixel(value, activeY);
        if(Math.abs(y - lastTickY) < 16) return;
        lastTickY = y;
        graph.appendChild(createSvg('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, class: 'dynamic-grid-line' }));
        const fullLabel = tickLabel(value);
        const maxLength = Math.max(3, Math.floor((plot.left - 12) / (compact ? 6 : 7)));
        const label = createSvg('text', { x: plot.left - 6, y: y + 4, class: 'dynamic-axis-label', 'text-anchor': 'end' },
            fullLabel.length > maxLength ? `${fullLabel.slice(0, maxLength - 1)}…` : fullLabel);
        label.appendChild(createSvg('title', {}, fullLabel));
        graph.appendChild(label);
    });
    if(activeY.min !== 0) graph.appendChild(createSvg('line', { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, class: 'dynamic-axis' }));
    if(domain.min !== 0) graph.appendChild(createSvg('line', { x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.bottom, class: 'dynamic-axis' }));
    if(domain.min <= 0 && domain.max >= 0) {
        const x = xToPixel(0);
        graph.appendChild(createSvg('line', { x1: x, y1: plot.top, x2: x, y2: plot.bottom, class: 'dynamic-zero-line' }));
    }
    if(activeY.min <= 0 && activeY.max >= 0) {
        const y = yToPixel(0, activeY);
        graph.appendChild(createSvg('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, class: 'dynamic-zero-line' }));
    }
    graph.appendChild(createSvg('text', { x: plot.left + width / 2, y: graph.viewBox.baseVal.height - 5, class: 'dynamic-axis-title', 'text-anchor': 'middle' }, variableLabel(variable)));
    const axisTitle = settingLabel(ui['dynamic-add-setting'].value) || text('chooseSetting', 'Setting value');
    const maxTitleLength = Math.max(8, Math.floor(width * 0.55 / 7));
    const yTitle = createSvg('text', { x: plot.left + 4, y: 14, class: 'dynamic-axis-title' }, axisTitle.length > maxTitleLength ? `${axisTitle.slice(0, maxTitleLength - 1)}…` : axisTitle);
    yTitle.appendChild(createSvg('title', {}, axisTitle));
    graph.appendChild(yTitle);
    const layer = createSvg('g', { 'clip-path': 'url(#dynamic-plot-clip)' });
    graph.appendChild(layer);

    const touch = window.matchMedia('(pointer: coarse)').matches;
    // All profiles share this setting's Y domain. Keep the selected handles on top.
    visibleLines().sort((a, b) => Number(a === activeLine) - Number(b === activeLine)).forEach(line => {
        const definition = getSettingDefinition(line.key);
        if(!definition) return;
        const range = activeY;
        const points = line.curve.points;
        if(!points.length) return;
        const start = line.curve.outsideRange === 'default' ? Math.max(domain.min, points[0].x) : domain.min;
        const end = line.curve.outsideRange === 'default' ? Math.min(domain.max, points.at(-1).x) : domain.max;
        let path = '';
        if(start <= end && line.curve.interpolation === 'step') {
            // Draw transitions at their exact integer X, even between sampled pixels.
            const startY = core.evaluateCurve({ ...line.curve, enabled: true }, start);
            path = `M ${xToPixel(start)} ${yToPixel(startY, range)}`;
            points.filter(point => point.x > start && point.x <= end).forEach(point => {
                path += ` H ${xToPixel(point.x)} V ${yToPixel(point.y, range)}`;
            });
            path += ` H ${xToPixel(end)}`;
        } else if(start <= end) {
            const samples = Math.max(2, Math.ceil(width / 5));
            for(let i = 0; i <= samples; i++) {
                const x = start + (end - start) * i / samples;
                const y = core.evaluateCurve({ ...line.curve, enabled: true }, x);
                if(y === null) continue;
                const px = xToPixel(x), py = yToPixel(y, range);
                path += `${path ? ' L' : 'M'} ${px} ${py}`;
            }
        }
        const { color, dashArray } = lineStyle(line);
        const active = line === activeLine;
        if(active) layer.appendChild(createSvg('path', { d: path, class: 'dynamic-curve-highlight', stroke: color, 'stroke-dasharray': dashArray }));
        const curvePath = createSvg('path', { d: path, class: `dynamic-curve-line${active ? ' is-active' : ''}`, stroke: color, 'stroke-dasharray': dashArray, 'data-line-id': lineId(line), opacity: active ? 1 : 0.4 });
        curvePath.appendChild(createSvg('title', {}, `${GET_HUMAN_READABLE_PROFILE_NAME(line.profile)} · ${line.label}`));
        layer.appendChild(curvePath);
        points.forEach((point, pointIndex) => {
            const selected = selectedLineId === lineId(line) && selectedPointIndex === pointIndex;
            const circle = createSvg('circle', {
                cx: xToPixel(point.x), cy: yToPixel(point.y, range), r: selected ? 9 : active ? 7 : 5,
                class: `dynamic-curve-point${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}`, fill: color, opacity: active ? 1 : 0.5, 'data-line-id': lineId(line), 'data-point-index': pointIndex
            });
            layer.appendChild(createSvg('circle', {
                cx: xToPixel(point.x), cy: yToPixel(point.y, range), r: touch ? 22 : 15,
                class: 'dynamic-curve-point dynamic-curve-hit', fill: 'transparent',
                'data-line-id': lineId(line), 'data-point-index': pointIndex
            }));
            circle.appendChild(createSvg('title', {}, `(${point.x}, ${pointLabel(line, point.y)})`));
            layer.appendChild(circle);
        });
    });

    previewContexts().forEach(({ instanceID, context }, index) => {
        const value = core.getVariableValue(variable, context);
        if(value === null) return;
        const x = xToPixel(value);
        const marker = createSvg('g', { 'data-instance-id': instanceID, class: 'dynamic-instance-marker' });
        const title = `${text('instance', 'Instance')} ${instanceID} · ${variableLabel(variable)}: ${value}`;
        marker.appendChild(createSvg('title', {}, title));
        marker.appendChild(createSvg('line', { x1: x, y1: plot.top, x2: x, y2: plot.bottom,
            class: 'dynamic-current-line', 'stroke-dasharray': `${3 + index % 4} ${4 + index % 3}` }));
        marker.appendChild(createSvg('circle', { cx: x, cy: plot.top + 7 + index * 14, r: 5, class: 'dynamic-current-marker' }));
        layer.appendChild(marker);
    });

    const point = activeLine?.curve.points[selectedPointIndex];
    if(point) {
        const px = xToPixel(point.x), py = yToPixel(point.y, activeY);
        const label = `(${point.x}, ${pointLabel(activeLine, point.y)})`;
        const labelWidth = Math.min(width - 8, label.length * 7.2 + 18);
        if(px >= plot.left && px <= plot.right && py >= plot.top && py <= plot.bottom) {
            const x = clamp(px + 14, plot.left + 4, plot.right - labelWidth - 4);
            const y = clamp(py - 36, plot.top + 4, plot.bottom - 30);
            const tooltip = createSvg('g', { class: 'dynamic-point-tooltip' });
            tooltip.appendChild(createSvg('rect', { x, y, width: labelWidth, height: 28, rx: 5 }));
            const text = createSvg('text', {
                x: x + labelWidth / 2, y: y + 14,
                'text-anchor': 'middle', 'dominant-baseline': 'central'
            }, label);
            if(label.length * 7.2 > labelWidth - 18) {
                text.setAttribute('textLength', labelWidth - 18);
                text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
            }
            tooltip.appendChild(text);
            graph.appendChild(tooltip);
        }
    }
    updatePointInspector();
    updateSettingToolbar();
    renderCurrentValues();
    renderLinesList();
}

function renderCurrentValues() {
    const overlay = ui['dynamic-current-values'];
    overlay.replaceChildren();
    previewContexts().forEach(({ instanceID, context }) => {
        const current = core.getVariableValue(variable, context);
        if(current === null) return;
        const value = document.createElement('span');
        const formatted = variable !== 'evaluation' ? String(current) : current === 0 ? text('equal', 'Equal (0 cp)')
            : `${current > 0 ? TRANS_OBJ?.winning ?? 'Winning' : TRANS_OBJ?.losing ?? 'Losing'} (${current > 0 ? '+' : ''}${current} cp)`;
        value.textContent = `${variableLabel(variable)}: ${formatted}`;
        value.title = `${text('instance', 'Instance')} ${instanceID}`;
        overlay.appendChild(value);
    });
    overlay.hidden = !overlay.childElementCount;
}

function renderLinesList() {
    const lines = filteredLines();
    const signature = JSON.stringify([selectedLineId, variable, ui['dynamic-add-setting'].value,
        lines.map(line => [lineId(line), line.label, line.curve.enabled, lineStyle(line)]),
        otherVariableLines(curves, ui['dynamic-add-setting'].value, variable).map(line => [lineId(line), line.curve.variable])]);
    if(signature === legendSignature) {
        lines.forEach(line => {
            const value = [...ui['dynamic-lines-list'].querySelectorAll('.dynamic-line-value')].find(element => element.dataset.lineId === lineId(line));
            if(value) value.textContent = displayLineValue(line);
        });
        return;
    }
    legendSignature = signature;
    const scrollLeft = ui['dynamic-lines-list'].scrollLeft;
    const scrollTop = ui['dynamic-lines-list'].scrollTop;
    const focusedId = document.activeElement?.closest('.dynamic-line-row')?.dataset.lineId;
    const focusedVisibility = document.activeElement?.type === 'checkbox';
    ui['dynamic-lines-list'].replaceChildren();
    lines.forEach(line => {
        const id = lineId(line);
        const row = document.createElement('div');
        row.className = 'dynamic-line-row';
        row.dataset.lineId = id;
        row.classList.toggle('is-selected', lineId(line) === selectedLineId);
        row.classList.toggle('is-hidden', !visibleLines().includes(line));
        const { color, dashArray } = lineStyle(line);
        row.style.setProperty('--line-color', color);
        const visibility = document.createElement('label');
        visibility.className = 'dynamic-line-visibility';
        visibility.title = text('visibility', 'Show and apply this curve, or hide and disable it');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(line.curve.enabled);
        checkbox.setAttribute('aria-label', text('enableLine', 'Enable and show {setting} from {profile}', { setting: line.label, profile: GET_HUMAN_READABLE_PROFILE_NAME(line.profile) }));
        checkbox.onchange = () => {
            line.curve.enabled = checkbox.checked;
            if(id === selectedLineId) selectedPointIndex = -1;
            ensureSelection();
            if(fitted) viewport = fitGraphViewport();
            syncSelectedLine();
            saveLine(line);
        };
        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'dynamic-line-select';
        select.setAttribute('aria-pressed', String(id === selectedLineId));
        select.setAttribute('aria-label', text(id === selectedLineId ? 'selectedLine' : 'chooseLine', id === selectedLineId ? 'Selected: {setting}, {profile}' : 'Select {setting}, {profile}', { setting: line.label, profile: GET_HUMAN_READABLE_PROFILE_NAME(line.profile) }));
        select.title = `${GET_HUMAN_READABLE_PROFILE_NAME(line.profile)} · ${line.label} · ${line.key}`;
        const swatch = createSvg('svg', { class: 'dynamic-line-swatch', viewBox: '0 0 48 8', 'aria-hidden': 'true', focusable: 'false' });
        swatch.appendChild(createSvg('line', { x1: 0, y1: 4, x2: 48, y2: 4,
            stroke: color, 'stroke-width': 3, 'stroke-dasharray': dashArray }));
        const name = document.createElement('span');
        name.className = 'dynamic-line-name';
        name.textContent = GET_HUMAN_READABLE_PROFILE_NAME(line.profile);
        select.append(swatch, name);
        select.onclick = () => {
            // Selecting a disabled curve must never silently apply it again.
            selectLine(line);
        };
        const value = document.createElement('span');
        value.className = 'dynamic-line-value';
        value.dataset.lineId = id;
        value.textContent = displayLineValue(line);
        value.title = text('currentValue', 'Current {setting} value', { setting: line.label });
        visibility.appendChild(checkbox);
        row.append(visibility, select, value);
        ui['dynamic-lines-list'].appendChild(row);
    });
    if(!lines.length) {
        const empty = document.createElement('span');
        empty.className = 'dynamic-legend-empty';
        const existing = otherVariableLines(curves, ui['dynamic-add-setting'].value, variable);
        empty.textContent = existing.length
            ? text('otherVariable', 'No profile lines for {variable}. Existing curves use ', { variable: variableLabel(variable) })
            : text('noLines', 'No profile lines yet. Select a setting, then ＋ Line.');
        createVariableLinks(existing, core.variables, key => {
            selectVariable(key);
            const activeProfile = GET_HUMAN_READABLE_PROFILE_NAME(SETTING_FILTER_OBJ.profileID);
            const line = existing.find(line => line.curve.variable === key && line.profile === activeProfile)
                ?? existing.find(line => line.curve.variable === key);
            if(line) selectLine(line);
        }).forEach((button, index) => {
            if(index) empty.append(', ');
            empty.appendChild(button);
        });
        ui['dynamic-lines-list'].appendChild(empty);
    }
    ui['dynamic-lines-list'].scrollLeft = scrollLeft;
    ui['dynamic-lines-list'].scrollTop = scrollTop;
    const rows = [...ui['dynamic-lines-list'].querySelectorAll('.dynamic-line-row')];
    if(focusedId) {
        rows.find(row => row.dataset.lineId === focusedId)?.querySelector(focusedVisibility ? 'input' : 'button')?.focus({ preventScroll: true });
    }
    if(legendSelectedId !== selectedLineId) {
        legendSelectedId = selectedLineId;
        rows.find(row => row.dataset.lineId === selectedLineId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
}

function displayLineValue(line) {
    if(!line.curve.enabled) return '—';
    const contexts = previewContexts();
    const base = settingBase(line.profile, line.key);
    return contexts.length ? contexts.map(({ instanceID, context }, index) => {
        const instanceName = document.querySelector(`.dropdown-item[data-instance-id="${instanceID}"] .dropdown-item-title`)?.textContent || `${text('instance', 'Instance')} ${index + 1}`;
        return `${contexts.length > 1 ? instanceName + ': ' : ''}${formatSettingValue(GET_HUMAN_READABLE_PROFILE_NAME(core.resolveValue(base, line.curve, context)))}`;
    }).join(' · ')
        : formatSettingValue(GET_HUMAN_READABLE_PROFILE_NAME(lineValue(line)));
}

function updateAddSettingTitle() {
    const key = ui['dynamic-add-setting'].value;
    ui['dynamic-add-setting'].title = `${settingDisplayName(key)} · ${key}`;
    const activeProfile = GET_HUMAN_READABLE_PROFILE_NAME(SETTING_FILTER_OBJ.profileID);
    const existing = curves.find(line => line.key === key && line.profile === activeProfile);
    ui['dynamic-add-line'].disabled = !activeProfile || !getSettingDefinition(key) || Boolean(existing);
    ui['dynamic-add-line'].title = existing
        ? text('existingCurve', 'One curve per setting/profile prevents conflicts. Existing curve uses {variable}.', { variable: variableLabel(existing.curve.variable) })
        : text('addForProfile', 'Add {setting} for {profile}', { setting: settingLabel(key), profile: GET_HUMAN_READABLE_PROFILE_NAME(activeProfile) });
}

function updateVariableLayout() {
    const container = ui['dynamic-variable-control'];
    if(!container.clientWidth) return;
    const tabs = ui['dynamic-variable-select'];
    const compact = ui['dynamic-variable-compact'];
    const wasCollapsed = tabs.hidden;
    const tabFocused = tabs.contains(document.activeElement);
    const compactFocused = document.activeElement === compact;
    // Measure intrinsic tab widths even when the compact selector is showing.
    tabs.classList.add('is-measuring');
    tabs.hidden = false;
    const width = [...tabs.querySelectorAll('[role="tab"]')].reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0);
    const mobile = window.matchMedia('(max-width: 700px), (pointer: coarse) and (max-width: 1100px)').matches;
    const collapsed = shouldCollapseVariableTabs(mobile, width, container.clientWidth);
    tabs.hidden = collapsed;
    compact.hidden = !collapsed;
    tabs.classList.remove('is-measuring');
    if(collapsed && tabFocused) compact.focus({ preventScroll: true });
    if(!collapsed && compactFocused) tabs.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    if(!collapsed && wasCollapsed) tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function syncSelectedLine() {
    const line = selectedLine();
    if(line) {
        ui['dynamic-interpolation'].value = line.curve.interpolation ?? 'linear';
    } else ui['dynamic-interpolation'].value = '';
    const disabled = !line;
    ['dynamic-interpolation', 'dynamic-delete-line']
        .forEach(id => { ui[id].disabled = disabled; });
    const definition = line && getSettingDefinition(line.key);
    const boolean = Boolean(definition?.boolean || definition?.categorical);
    ui['dynamic-add-point'].disabled = disabled || !line.curve.enabled;
    ui['dynamic-add-point'].title = disabled ? text('selectLine', 'Select a line first') : !line.curve.enabled ? text('enableFirst', 'Enable this line in the legend to add a point') : text('addValuePointHint', 'Add a point to the selected line');
    ui['dynamic-interpolation'].disabled = disabled || boolean;
    ui['dynamic-interpolation'].title = boolean ? text('stepLocked', 'Step is locked for this setting.') : disabled ? text('selectLine', 'Select a line first') : text('editing', 'Editing {setting} from {profile}.', { setting: line.label, profile: GET_HUMAN_READABLE_PROFILE_NAME(line.profile) });
    if(boolean) ui['dynamic-interpolation'].value = 'step';
    setInterpolationLockVisibility(ui['dynamic-interpolation-lock'], boolean);
    ui['dynamic-interpolation-status'].textContent = definition?.text
        ? text('textStepHint', 'Text changes at each point. Select a saved choice or enter custom text and choose Use text; labels are not interpolated.')
        : boolean ? text('stepLocked', 'Step is locked for this setting.') : disabled ? text('selectLine', 'Select a line to edit its curve.') : text('editing', 'Editing {setting} from {profile}.', { setting: line.label, profile: GET_HUMAN_READABLE_PROFILE_NAME(line.profile) });
    ui['dynamic-interpolation'].closest('label').classList.toggle('is-locked', ui['dynamic-interpolation'].disabled);
    ui['dynamic-interpolation'].closest('label').title = ui['dynamic-interpolation'].title;
    ui['dynamic-delete-line'].title = disabled ? text('selectLine', 'Select a line first') : text('removeFromProfile', 'Remove {setting} from {profile}', { setting: line.label, profile: GET_HUMAN_READABLE_PROFILE_NAME(line.profile) });
    updatePointInspector();
}

function updatePointInspector() {
    const line = selectedLine();
    const point = line?.curve.points[selectedPointIndex];
    const definition = line && getSettingDefinition(line.key);
    const categorical = Boolean(definition?.categorical);
    ui['dynamic-point-y'].hidden = categorical;
    ui['dynamic-point-choice'].hidden = !categorical;
    ui['dynamic-point-choice'].disabled = !point;
    ui['dynamic-point-text-control'].hidden = !definition?.text;
    ui['dynamic-point-text'].disabled = !point;
    ui['dynamic-apply-text'].disabled = !point;
    const textPoint = point ? `${lineId(line)}\u0000${selectedPointIndex}` : '';
    if(ui['dynamic-point-text'].dataset.point !== textPoint || document.activeElement !== ui['dynamic-point-text']) {
        ui['dynamic-point-text'].value = point && definition?.text ? definition.values[point.y] ?? '' : '';
        ui['dynamic-point-text'].dataset.point = textPoint;
        ui['dynamic-point-text'].setCustomValidity('');
    }
    if(categorical) {
        const choices = ui['dynamic-point-choice'];
        const signature = JSON.stringify([definition.values, definition.labels]);
        if(choices.dataset.signature !== signature) {
            choices.replaceChildren(...definition.labels.map((label, index) => new Option(label, index)));
            choices.dataset.signature = signature;
        }
        choices.value = point ? point.y : '';
    }
    ui['dynamic-delete-point'].disabled = !point;
    ['x', 'y'].forEach(axis => {
        const input = ui[`dynamic-point-${axis}`];
        input.disabled = !point;
        const bounds = axis === 'x' ? core.variables[variable] : definition;
        input.min = bounds?.min ?? '';
        input.max = bounds?.max ?? '';
        input.step = axis === 'y' && definition?.decimal ? 'any' : '1';
        if(document.activeElement !== input) input.value = point ? point[axis] : '';
    });
    ui['dynamic-point-status'].textContent = point
        ? text('point', 'Point {number}', { number: selectedPointIndex + 1 })
        : text('selectPoint', 'Select a point to edit its coordinates.');
}

async function loadCurves() {
    const version = ++loadVersion;
    await pendingSaves;
    const instanceID = SETTING_FILTER_OBJ.instanceID;
    const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey);
    if(version !== loadVersion || instanceID !== SETTING_FILTER_OBJ.instanceID) return;
    currentContext = core.getContext(instanceID ?? previewInstanceID);
    currentVariableValue = core.getVariableValue(variable, currentContext);
    const globalProfiles = config?.global?.profiles ?? {};
    const instanceProfiles = instanceID
        ? config?.instance?.[instanceID]?.profiles ?? {}
        : {};
    const allKeys = new Set([...Object.keys(globalProfiles), ...Object.keys(instanceProfiles)]);
    // GET_PROFILES resolves curves for the live context. The editor needs raw defaults.
    profileInfo = [...allKeys].map(key => ({
        name: GET_HUMAN_READABLE_PROFILE_NAME(key),
        config: { ...globalProfiles[key], ...instanceProfiles[key] }
    }));
    // Rebind legend handlers to the freshly loaded line objects, even when
    // labels and enable states have not changed since the previous load.
    legendSignature = '';
    curves = [];
    allKeys.forEach(key => {
        const name = GET_HUMAN_READABLE_PROFILE_NAME(key);
        const curveData = { ...(globalProfiles[key]?.[STORAGE_KEY] ?? {}), ...(instanceProfiles[key]?.[STORAGE_KEY] ?? {}) };
        Object.entries(curveData).forEach(([settingKey, curve]) => {
            const definition = getSettingDefinition(settingKey);
            if(!definition || !curve || !Array.isArray(curve.points) || !core.variables[curve.variable]) return;
            const dropdown = categoricalCurveDefinition(definition, curve);
            const normalized = core.normalizeCurve({ ...curve, boolean: Boolean(definition.boolean),
                decimal: Boolean(definition.decimal), text: Boolean(definition.text),
                ...(dropdown.categorical ? { values: dropdown.values } : {}), minY: dropdown.min, maxY: dropdown.max });
            const points = normalized.points;
            if(!points.length) return;
            curves.push({
                profile: name,
                key: settingKey,
                label: settingLabel(settingKey),
                curve: {
                    ...normalized, points
                }
            });
        });
    });
    [...new Set(curves.map(line => line.key))].forEach(key => {
        const definition = getSettingDefinition(key);
        if(definition?.categorical) alignCategoricalCurves(curves.filter(line => line.key === key), definition);
    });
    selectedPointIndex = -1;
    const hadChosenSetting = settingChosen;
    fillAddSettingOptions();
    if(!hadChosenSetting) {
        // On first load open a saved setting graph instead of an unrelated empty one.
        selectSetting();
        refreshSettingShortcuts();
        return;
    }
    ensureSelection();
    // Reloading storage must not undo a user's zoom/pan on either axis.
    if(fitted) {
        viewport = fitGraphViewport();
    }
    syncSelectedLine();
    render();
    refreshSettingShortcuts();
}

function settingLabel(key) {
    const definition = getSettingDefinition(key);
    const translated = FULL_TRANS_OBJ?.configTranslations?.[key]?.[0];
    const title = translated || definition?.input.closest('.custom-input')?.querySelector('.input-title')?.textContent?.trim() || '';
    const duplicateTitle = title && [...document.querySelectorAll('input[data-key]')].some(input =>
        input.dataset.key !== key && (FULL_TRANS_OBJ?.configTranslations?.[input.dataset.key]?.[0]
            ?? input.closest('.custom-input')?.querySelector('.input-title')?.textContent?.trim()) === title);
    return settingDisplayName(key, duplicateTitle ? '' : title);
}

function fillAddSettingOptions() {
    const keys = getSettingKeys();
    const priorAddSetting = settingChosen ? ui['dynamic-add-setting'].value : '';
    ui['dynamic-add-setting'].replaceChildren();
    keys.forEach(key => {
        const dynamicExternalSetting = /^DYNAMIC_([A-F\d]{32,})_(.+)$/i.exec(key);
        const engineName = dynamicExternalSetting
            ? GET_HUMAN_READABLE_EXTERNAL_ENGINE_NAME(dynamicExternalSetting[1]) : '';
        const settingName = dynamicExternalSetting
            ? settingDisplayName(dynamicExternalSetting[2]) : settingDisplayName(key);
        const label = `${dynamicExternalSetting ? 'Dynamic ' : ''}${engineName ? `${engineName} ` : ''}${settingName}`;
        const option = new Option(label, key);
        option.title = key;
        ui['dynamic-add-setting'].appendChild(option);
    });
    const key = keys.includes(priorAddSetting) ? priorAddSetting : curves.find(line => line.curve.variable === variable)?.key ?? curves[0]?.key ?? keys[0];
    if(key) ui['dynamic-add-setting'].value = key;
    updateAddSettingTitle();
}

function updateSettingToolbar() {
    const label = settingLabel(ui['dynamic-add-setting'].value) || text('chooseSetting', 'Choose a setting');
    ui['dynamic-lines-list'].setAttribute('aria-label', text('profileLines', '{setting} profile lines', { setting: label }));
    updateAddSettingTitle();
}

function setGraphFullscreen(fullscreen) {
    const dialog = document.getElementById('dynamic-settings-floaty');
    // Use a viewport-sized graph mode rather than the browser Fullscreen API,
    // so it also works in mobile browsers and inside the modal dialog.
    if(drag?.kind === 'point' && drag.changed) {
        const line = selectedLine();
        if(line) saveLine(line);
    }
    const ids = [...pointers.keys()];
    pointers.clear();
    drag = null;
    ids.forEach(id => { if(graph.hasPointerCapture(id)) graph.releasePointerCapture(id); });
    graph.classList.remove('is-panning');
    dialog.classList.toggle('is-graph-fullscreen', fullscreen);
    if(fullscreen) {
        document.querySelector('#dynamic-settings-floaty .dynamic-settings-body').scrollTop = 0;
        document.getElementById('dynamic-graph-panel').scrollTop = 0;
    }
    const button = ui['dynamic-fullscreen-toggle'];
    button.setAttribute('aria-pressed', String(fullscreen));
    button.setAttribute('aria-label', text(fullscreen ? 'exitFullscreen' : 'fullscreen', fullscreen ? 'Exit fullscreen graph' : 'Fullscreen graph'));
    button.title = button.getAttribute('aria-label') + (fullscreen ? ' (Escape)' : '');
    button.querySelector('path').setAttribute('d', fullscreen
        ? 'M4 8h4V4m12 4h-4V4M8 16H4v4m12-4h4v4'
        : 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4');
    // Keep zoom, pan, selected line and point intact while resizing the plot.
    requestAnimationFrame(() => {
        updateVariableLayout();
        resizeGraph();
    });
}

function queueSave(write) {
    pendingSaves = pendingSaves.then(write).catch(error => {
        console.error('Could not save dynamic settings:', error);
        toast.error(text('saveError', 'Could not save the graph. Please check your userscript connection.'), 8000);
    });
    return pendingSaves;
}

function saveLine(line) {
    ++loadVersion;
    const instanceID = SETTING_FILTER_OBJ.instanceID;
    const definition = getSettingDefinition(line.key);
    if(!definition || !line.curve.points.length) return pendingSaves;
    line.curve = core.normalizeCurve({ ...line.curve, boolean: Boolean(definition.boolean),
        decimal: Boolean(definition.decimal), text: Boolean(definition.text),
        ...(definition.categorical ? { values: definition.values } : {}),
        outsideRange: 'default', resetAtStart: line.key === 'chessEngine', minY: definition.min, maxY: definition.max });
    const snapshot = structuredClone(line);
    render();
    refreshSettingShortcuts();
    return queueSave(async () => {
        const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey) ?? {};
        const key = profileKey(snapshot.profile);
        const path = instanceID ? ['instance', instanceID, 'profiles', key] : ['global', 'profiles', key];
        INIT_NESTED_OBJECT(config, [...path, STORAGE_KEY]);
        const target = path.reduce((object, part) => object[part], config);
        target[STORAGE_KEY][snapshot.key] = snapshot.curve;
        await USERSCRIPT.setValue(USERSCRIPT_SHARED_VARS.gmConfigKey, config);
        logActivity('dynamic-change', `Saved ${snapshot.label} curve: ${JSON.stringify(snapshot.curve)}`, {
            instanceID, profile: snapshot.profile
        });
        dynamicSettingsChannel.postMessage({ type: 'dynamicSettingsChange', data: {
            key: snapshot.key, profile: snapshot.profile, variable: snapshot.curve.variable, instanceID
        } });
    });
}

function addLine() {
    const profile = GET_HUMAN_READABLE_PROFILE_NAME(SETTING_FILTER_OBJ.profileID);
    const key = ui['dynamic-add-setting'].value;
    const definition = getSettingDefinition(key);
    if(!profile || !key || !definition) return;
    settingChosen = true;
    let line = curves.find(item => item.profile === profile && item.key === key);
    if(line) {
        toast.warning(text('existingCurve', 'This setting already has a curve using {variable}. Edit or remove it before choosing another variable.', { variable: variableLabel(line.curve.variable) }), 5000);
        selectVariable(line.curve.variable);
        selectLine(line);
        return;
    }
    const rawBase = Number(settingBase(profile, key));
    const base = definition.categorical ? 0 : coercePointY(Number.isFinite(rawBase) ? rawBase : 0, definition);
    line = {
        profile, key, label: settingLabel(key),
        curve: {
            enabled: true,
            boolean: Boolean(definition.boolean),
            decimal: Boolean(definition.decimal), text: Boolean(definition.text),
            ...(definition.categorical ? { values: definition.values } : {}),
            outsideRange: 'default', resetAtStart: key === 'chessEngine',
            variable,
            interpolation: definition.boolean || definition.categorical ? 'step' : 'linear',
            minY: definition.min, maxY: definition.max,
            points: [
                { x: core.variables[variable].min, y: base },
                { x: core.variables[variable].max, y: base }
            ]
        }
    };
    curves.push(line);
    // An existing setting has one curve. Selecting it must not silently change its variable.
    selectVariable(line.curve.variable);
    selectLine(line);
    saveLine(line);
}

function resizeGraph() {
    const rect = graph.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    graph.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    plot.right = rect.width - 12;
    plot.top = 22;
    plot.bottom = Math.max(plot.top + 20, rect.height - 40);
    render();
}

function eventPosition(event) {
    const point = graph.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = graph.getScreenCTM();
    const position = matrix ? point.matrixTransform(matrix.inverse()) : point;
    return {
        x: (position.x - plot.left) / (plot.right - plot.left),
        y: 1 - (position.y - plot.top) / (plot.bottom - plot.top),
        viewX: position.x, viewY: position.y
    };
}

function zoomGraph(factor, anchor = { x: 0.5, y: 0.5 }, axes = ['x', 'y']) {
    fitted = false;
    axes.forEach(axis => {
        viewport[axis] = zoomViewportAxis(axis, viewport[axis], factor, clamp(anchor[axis], 0, 1));
    });
    render();
}

function setPointPosition(x, y) {
    const line = selectedLine();
    const definition = getSettingDefinition(line?.key);
    if(!definition || !line.curve.points[selectedPointIndex] || !Number.isFinite(x) || !Number.isFinite(y)) return;
    y = coercePointY(y, definition);
    const domain = graphDomain();
    ++loadVersion;
    selectedPointIndex = moveCurvePoint(line.curve.points, selectedPointIndex, x, y, domain.absoluteMin, domain.absoluteMax, definition.decimal);
    render();
}

function applyPointText() {
    const line = selectedLine();
    const point = line?.curve.points[selectedPointIndex];
    const definition = line && getSettingDefinition(line.key);
    if(!point || !definition?.text) return;
    ++loadVersion;
    const value = ui['dynamic-point-text'].value;
    const valid = !/[<>\r\n\u0000]/.test(value) && value !== 'value';
    ui['dynamic-point-text'].setCustomValidity(valid ? '' : text('invalidEngineText', 'This engine option cannot contain angle brackets or control characters, or be the reserved word "value".'));
    if(!valid) { ui['dynamic-point-text'].reportValidity(); return; }
    line.curve.values = [...definition.values];
    if(!line.curve.values.includes(value)) line.curve.values.push(value);
    point.y = line.curve.values.indexOf(value);
    const lines = curves.filter(item => item.key === line.key);
    // Every profile needs the same label coordinates. Reindex other profiles by
    // their saved text, never by the newly inserted label's numeric position.
    alignCategoricalCurves(lines, getSettingDefinition(line.key));
    viewport = fitGraphViewport();
    fitted = true;
    lines.forEach(item => saveLine(item));
    syncSelectedLine();
    render();
}

function addPoint() {
    const line = selectedLine();
    if(!line?.curve.enabled) return;
    const domain = graphDomain();
    const min = Math.max(domain.absoluteMin, domain.min);
    const max = Math.min(domain.absoluteMax, domain.max);
    // Insert into the largest available integer gap; background clicks never add points.
    const x = insertionX(line.curve.points, min, max);
    if(x === null) return;
    const definition = getSettingDefinition(line.key);
    const y = coercePointY(core.evaluateCurve({ ...line.curve, enabled: true }, x)
        ?? (definition.categorical ? 0 : Number(settingBase(line.profile, line.key))), definition);
    const point = { x, y };
    line.curve.points.push(point);
    line.curve.points.sort((a, b) => a.x - b.x);
    selectedPointIndex = line.curve.points.indexOf(point);
    saveLine(line);
    graph.focus({ preventScroll: true });
}

function deletePoint() {
    const line = selectedLine();
    if(!line || !line.curve.points[selectedPointIndex]) return;
    if(line.curve.points.length === 1) {
        ui['dynamic-delete-line'].click();
        return;
    }
    line.curve.points.splice(selectedPointIndex, 1);
    selectedPointIndex = Math.min(selectedPointIndex, line.curve.points.length - 1);
    saveLine(line);
}

function pinchGeometry() {
    const [first, second] = [...pointers.values()];
    return {
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        distance: Math.max(1, Math.hypot(first.viewX - second.viewX, first.viewY - second.viewY))
    };
}

function beginPinch() {
    if(drag?.kind === 'point' && drag.changed) {
        const line = selectedLine();
        if(line) saveLine(line);
    }
    drag = { kind: 'pinch', ...pinchGeometry(), viewport: structuredClone(viewport), axes: ['x', 'y'] };
}

function onGraphPointerDown(event) {
    if(event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    graph.focus({ preventScroll: true });
    const position = eventPosition(event);
    pointers.set(event.pointerId, position);
    graph.setPointerCapture(event.pointerId);
    if(pointers.size >= 2) {
        beginPinch();
        return;
    }
    const point = event.target.closest?.('.dynamic-curve-point');
    if(point && event.button !== 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const line = visibleLines().find(item => lineId(item) === point.dataset.lineId);
        selectLine(line, Number(point.dataset.pointIndex));
        drag = { kind: 'point', pointerId: event.pointerId, changed: false };
        return;
    }
    const path = event.target.closest?.('.dynamic-curve-line');
    if(path) selectLine(visibleLines().find(item => lineId(item) === path.dataset.lineId));
    else {
        selectedPointIndex = -1;
        render();
    }
    drag = { kind: 'pan', start: position, viewport: structuredClone(viewport), axes: modifierAxes(event), pointerId: event.pointerId };
    graph.classList.add('is-panning');
}

function onGraphPointerMove(event) {
    if(!pointers.has(event.pointerId) || !drag) return;
    event.preventDefault();
    const position = eventPosition(event);
    pointers.set(event.pointerId, position);
    if(drag.kind === 'pinch') {
        fitted = false;
        const geometry = pinchGeometry();
        drag.axes.forEach(axis => {
            const zoomed = zoomViewportAxis(axis, drag.viewport[axis], geometry.distance / drag.distance, drag.center[axis]);
            viewport[axis] = panAxis(zoomed, geometry.center[axis] - drag.center[axis]);
        });
    } else if(drag.pointerId === event.pointerId && drag.kind === 'pan') {
        fitted = false;
        drag.axes.forEach(axis => {
            viewport[axis] = panAxis(drag.viewport[axis], position[axis] - drag.start[axis]);
        });
    } else if(drag.pointerId === event.pointerId && drag.kind === 'point') {
        const line = selectedLine();
        if(!line) return;
        const x = graphDomain(), y = yDomain(line);
        const definition = getSettingDefinition(line.key);
        const stepX = snapStep(x), stepY = definition.boolean || definition.categorical ? 1 : snapStep(y, definition.decimal);
        setPointPosition(
            Math.round((x.min + position.x * (x.max - x.min)) / stepX) * stepX,
            Number((Math.round((y.min + position.y * (y.max - y.min)) / stepY) * stepY).toPrecision(12))
        );
        drag.changed = true;
        return;
    }
    render();
}

function onGraphPointerUp(event) {
    if(!pointers.has(event.pointerId)) return;
    if(drag?.kind === 'point' && drag.pointerId === event.pointerId && drag.changed) {
        const line = selectedLine();
        if(line) saveLine(line);
    }
    pointers.delete(event.pointerId);
    if(graph.hasPointerCapture(event.pointerId)) graph.releasePointerCapture(event.pointerId);
    if(pointers.size >= 2) beginPinch();
    else if(pointers.size === 1) {
        const [pointerId, position] = [...pointers.entries()][0];
        drag = { kind: 'pan', start: position, viewport: structuredClone(viewport), axes: ['x', 'y'], pointerId };
    } else {
        drag = null;
        graph.classList.remove('is-panning');
        render();
    }
}

function onGraphKeyDown(event) {
    if(event.target !== graph) return;
    const line = selectedLine();
    const point = line?.curve.points[selectedPointIndex];
    if(!point) return;
    if(event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deletePoint();
        return;
    }
    if(!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? 10 : 1;
    const definition = getSettingDefinition(line.key);
    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const dy = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
    setPointPosition(point.x + dx * multiplier * snapStep(graphDomain()),
        Number((point.y + dy * (definition.boolean || definition.categorical ? 1 : multiplier * snapStep(yDomain(line), definition.decimal))).toPrecision(12)));
    saveLine(line);
}

function initialize() {
    if(!graph || !core || initialized) return;
    initialized = true;
    const tabs = [...ui['dynamic-variable-select'].querySelectorAll('[role="tab"]')];
    tabs.forEach((tab, index) => {
        tab.onclick = () => selectVariable(tab.dataset.variable);
        tab.onkeydown = event => {
            let next = index;
            if(event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if(event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if(event.key === 'Home') next = 0;
            else if(event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault();
            selectVariable(tabs[next].dataset.variable);
            tabs[next].focus();
        };
    });
    ui['dynamic-variable-compact'].onchange = () => selectVariable(ui['dynamic-variable-compact'].value);
    new ResizeObserver(updateVariableLayout).observe(ui['dynamic-variable-control']);
    document.fonts?.ready.then(updateVariableLayout);
    window.addEventListener('resize', updateVariableLayout);
    ui['dynamic-add-line'].onclick = addLine;
    ui['dynamic-add-setting'].onchange = selectSetting;
    ui['dynamic-fullscreen-toggle'].onclick = () => {
        const dialog = document.getElementById('dynamic-settings-floaty');
        setGraphFullscreen(!dialog.classList.contains('is-graph-fullscreen'));
    };
    ui['dynamic-interpolation'].onchange = () => {
        const line = selectedLine();
        const definition = line && getSettingDefinition(line.key);
        if(line) { line.curve.interpolation = definition.boolean || definition.categorical ? 'step' : ui['dynamic-interpolation'].value; saveLine(line); }
    };
    ui['dynamic-add-point'].onclick = addPoint;
    ui['dynamic-delete-point'].onclick = deletePoint;
    ui['dynamic-apply-text'].onclick = applyPointText;
    ui['dynamic-point-text'].oninput = () => ui['dynamic-point-text'].setCustomValidity('');
    ui['dynamic-point-text'].onkeydown = event => {
        if(event.key === 'Enter' && !event.isComposing) { event.preventDefault(); applyPointText(); }
    };
    ui['dynamic-point-choice'].onchange = () => {
        const line = selectedLine();
        const point = line?.curve.points[selectedPointIndex];
        if(!point) return;
        setPointPosition(point.x, Number(ui['dynamic-point-choice'].value));
        saveLine(line);
    };
    ['x', 'y'].forEach(axis => {
        const input = ui[`dynamic-point-${axis}`];
        input.oninput = () => {
            const point = selectedLine()?.curve.points[selectedPointIndex];
            if(!point || input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
            setPointPosition(axis === 'x' ? input.valueAsNumber : point.x, axis === 'y' ? input.valueAsNumber : point.y);
            // Allow incomplete numeric text while typing. Only integer settings
            // snap Y; continuous settings retain the entered fractional value.
        };
        input.onchange = () => {
            const line = selectedLine();
            const point = line?.curve.points[selectedPointIndex];
            if(!point) return;
            input.value = point[axis];
            const domain = axis === 'x' ? graphDomain() : yDomain(line);
            if(point[axis] < domain.min || point[axis] > domain.max) {
                viewport = fitGraphViewport();
                fitted = true;
            }
            saveLine(line);
        };
    });
    ui['dynamic-delete-line'].onclick = async () => {
        const line = selectedLine();
        if(!confirmLineRemoval(line)) return;
        ++loadVersion;
        const instanceID = SETTING_FILTER_OBJ.instanceID;
        curves = curves.filter(item => item !== line);
        selectedPointIndex = -1;
        ensureSelection();
        syncSelectedLine();
        render();
        refreshSettingShortcuts();
        await queueSave(async () => {
            const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey) ?? {};
            const storageKey = profileKey(line.profile);
            let profileObj = instanceID
                ? config?.instance?.[instanceID]?.profiles?.[storageKey]
                : config?.global?.profiles?.[storageKey];
            if(instanceID && config?.global?.profiles?.[storageKey]?.[STORAGE_KEY]?.[line.key]) {
                // An empty disabled override prevents a removed inherited curve reappearing.
                INIT_NESTED_OBJECT(config, ['instance', instanceID, 'profiles', storageKey, STORAGE_KEY]);
                profileObj = config.instance[instanceID].profiles[storageKey];
                profileObj[STORAGE_KEY][line.key] = { ...line.curve, enabled: false, points: [] };
            } else if(profileObj?.[STORAGE_KEY]) delete profileObj[STORAGE_KEY][line.key];
            await USERSCRIPT.setValue(USERSCRIPT_SHARED_VARS.gmConfigKey, config);
            logActivity('dynamic-change', `Removed ${line.label} curve; saved default will be reapplied to active instances.`, {
                instanceID, profile: line.profile
            });
            dynamicSettingsChannel.postMessage({ type: 'dynamicSettingsChange', data: { key: line.key, profile: line.profile, instanceID } });
        });
        await loadCurves();
    };
    ui['dynamic-zoom-in'].onclick = () => zoomGraph(1.25);
    ui['dynamic-zoom-out'].onclick = () => zoomGraph(1 / 1.25);
    ui['dynamic-fit-graph'].onclick = () => {
        fitted = true;
        viewport = fitGraphViewport();
        render();
    };
    graph.addEventListener('wheel', event => {
        event.preventDefault();
        const position = eventPosition(event);
        const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? graph.clientHeight : 1);
        zoomGraph(Math.exp(clamp(-delta * 0.002, -1, 1)), position, modifierAxes(event));
    }, { passive: false });
    graph.addEventListener('pointerdown', onGraphPointerDown);
    graph.addEventListener('pointermove', onGraphPointerMove);
    graph.addEventListener('pointerup', onGraphPointerUp);
    graph.addEventListener('pointercancel', onGraphPointerUp);
    graph.addEventListener('lostpointercapture', onGraphPointerUp);
    graph.addEventListener('keydown', onGraphKeyDown);
    const dialog = document.getElementById('dynamic-settings-floaty');
    dialog.addEventListener('cancel', event => {
        if(!dialog.classList.contains('is-graph-fullscreen')) return;
        event.preventDefault();
        setGraphFullscreen(false);
        ui['dynamic-fullscreen-toggle'].focus({ preventScroll: true });
    });
    const onOpen = () => {
        if(!dialog.open) return;
        updateVariableLayout();
        currentContext = core.getContext(SETTING_FILTER_OBJ.instanceID ?? previewInstanceID);
        currentVariableValue = core.getVariableValue(variable, currentContext);
        resizeGraph();
        loadCurves();
    };
    // Attribute observation also works in browsers without dialog toggle events.
    new MutationObserver(onOpen).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('close', () => {
        const line = selectedLine();
        if(line && drag?.kind === 'point' && drag.changed) saveLine(line);
        const ids = [...pointers.keys()];
        pointers.clear();
        drag = null;
        ids.forEach(id => { if(graph.hasPointerCapture(id)) graph.releasePointerCapture(id); });
        graph.classList.remove('is-panning');
        setGraphFullscreen(false);
        if(shortcutOpener) {
            restoreDynamicSettingShortcutFocus(shortcutOpener.button, shortcutOpener.keyboardActivated);
        }
        shortcutOpener = null;
    });
    new ResizeObserver(resizeGraph).observe(graph);
    const settingsNavbar = document.getElementById('settings-navbar');
    if(settingsNavbar) new MutationObserver(() => loadCurves()).observe(settingsNavbar, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class']
    });
    document.addEventListener('acas-settings-updated', () => {
        initializeSettingShortcuts();
        if(!drag) loadCurves();
    });
    dynamicSettingsChannel.addEventListener('message', event => {
        if(event.data?.type === 'dynamicVariableUpdate') {
            updatePreviewContext(event.data.data?.instanceID, event.data.data?.context);
        }
        if(event.data?.type === 'dynamicInstanceClosed') removeDynamicSettingsContext(event.data.data?.instanceID, false);
        if(event.data?.type === 'dynamicSettingsChange') loadCurves();
        if(event.data?.type === 'profilesChanged') {
            if(!drag) loadCurves();
        }
        if(event.data?.type === 'settingSave') {
            if(event.data.data?.key === 'chessEngineProfile' || (dialog.open && !drag)) loadCurves();
            else refreshSettingShortcuts();
        }
    });
    currentContext = core.getContext(SETTING_FILTER_OBJ.instanceID);
    currentVariableValue = core.getVariableValue(variable, currentContext);
    fillAddSettingOptions();
    selectVariable(variable);
    initializeSettingShortcuts();
    loadCurves();
    document.addEventListener('acas-translations-updated', translateUI);
    translateUI();
}

function updatePreviewContext(instanceID, context) {
    if(!context || typeof context !== 'object') return;
    core.setContext(instanceID, context);
    const selectedInstanceID = SETTING_FILTER_OBJ.instanceID;
    if(selectedInstanceID && String(instanceID) !== String(selectedInstanceID)) return;

    previewInstanceID = instanceID;
    currentContext = core.getContext(instanceID);
    currentVariableValue = core.getVariableValue(variable, currentContext);
    if(initialized) { render(); refreshSettingShortcuts(); }
}

function setDynamicSettingsContext(instanceID, fen, state = {}) {
    if(!fen) return;
    const context = {
        ...core.getContextFromFen(fen),
        ...(Object.hasOwn(state, 'evaluation') ? { evaluation: state.evaluation } : {})
    };
    const previous = core.getContext(instanceID);
    if(Object.entries(context).every(([key, value]) => Object.is(previous[key], value))) return;
    updatePreviewContext(instanceID, context);
    dynamicSettingsChannel.postMessage({ type: 'dynamicVariableUpdate', data: { instanceID, context } });
}

function removeDynamicSettingsContext(instanceID, broadcast = true) {
    core.removeContext(instanceID);
    if(String(previewInstanceID) === String(instanceID)) {
        previewInstanceID = core.getContexts()[0]?.instanceID ?? null;
        currentContext = core.getContext(previewInstanceID);
    }
    if(initialized) { render(); refreshSettingShortcuts(); }
    if(broadcast) dynamicSettingsChannel.postMessage({ type: 'dynamicInstanceClosed', data: { instanceID } });
}

export { initialize as initializeDynamicSettings, setDynamicSettingsContext, removeDynamicSettingsContext };