import {
    activityLog,
    isActivityLoggingEnabled,
    setActivityLoggingEnabled
} from '../misc/activityLog.js';
import { featureText } from '../misc/featureTranslations.js';

let initialized = false;
const PANEL_STORAGE_KEY = 'acas.activity-log.panel';
const PRECISE_TIME_STORAGE_KEY = 'acas.activity-log.precise-time';
const FILTER_STORAGE_KEY = 'acas.activity-log.filters';
const reportStorageError = console.error.bind(console);
let panelStorageErrorReported = false;
let preciseTimestamps = false;
const text = (key, fallback, values) => featureText('activityLog', key, fallback, values);
const typeLabel = type => (typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ)?.activityLog?.types?.[type]
    ?? (type === 'session-start' ? 'Session start' : type.replaceAll('-', ' '));
const externalEngineTag = engineId => typeof document === 'undefined' ? '' :
    [...document.querySelectorAll('#external-engine-dropdown .dropdown-item')]
        .find(item => item.dataset.value === engineId)
        ?.querySelector('.engine-type-tag.list-tag')?.textContent?.trim() || '';
const isExternalEngineId = value => /^[a-f\d]{64}$/i.test(value || '');
const engineLabelForEntry = entry => entry.engineId
    ? entry.engine || externalEngineTag(entry.engineId) || 'External engine'
    : isExternalEngineId(entry.engine)
        ? externalEngineTag(entry.engine) || 'External engine'
        : entry.engine || '';
const formatLogTime = (timestamp, type, precise) => {
    const date = new Date(timestamp);
    if(!precise) return type === 'session-start' ? date.toLocaleString() : date.toLocaleTimeString();
    const seconds = new Intl.DateTimeFormat(undefined, { second: '2-digit' })
        .formatToParts(date)
        .find(part => part.type === 'second')?.value;
    return `${seconds}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};
export function formatLogForClipboard(entries) {
    const sites = new Set();
    const engines = new Set();
    const instanceLabels = new Map();
    entries.forEach(entry => {
        const site = entry.site || (entry.type === 'instance'
            ? entry.message.match(/^Instance created for (.+)\.$/)?.[1]
            : '');
        const legacyExternalId = !entry.engineId && isExternalEngineId(entry.engine) ? entry.engine : '';
        const engineId = entry.engineId || legacyExternalId;
        const engineTag = engineId ? engineLabelForEntry(entry) : '';
        const engine = engineTag || entry.engine || (entry.type === 'engine'
            ? entry.message.match(/^Loading (.+?)(?: \(attempt \d+\))?$/)?.[1]
                || entry.message.match(/^(.+?) ready for a new game\.?$/)?.[1]
            : '');
        if(entry.instanceID && !instanceLabels.has(entry.instanceID)) {
            instanceLabels.set(entry.instanceID, instanceLabels.size + 1);
        }
        if(site) sites.add(site);
        if(engineId) engines.add(`${engineId} (${engine})`);
        else if(engine) engines.add(engine);
    });
    const summary = [
        sites.size && `Sites: ${[...sites].join(', ')}`,
        engines.size && `Engines: ${[...engines].join(', ')}`
    ].filter(Boolean);
    const sections = entries.map(entry => {
        const date = new Date(entry.timestamp);
        const timestamp = `${date.toLocaleString()}.${String(date.getMilliseconds()).padStart(3, '0')}`;
        const context = [
            entry.instanceID && String(instanceLabels.get(entry.instanceID)),
            entry.profile,
            engineLabelForEntry(entry),
            entry.site
        ].filter(Boolean).join(', ');
        const heading = [
            `[${timestamp}]`,
            `[${typeLabel(entry.type)}]`,
            context ? `[${context}]` : ''
        ].filter(Boolean).join(' ');
        const message = entry.message.split(/\r?\n/).map(line => `    ${line}`).join('\n');
        return `${heading}\n${message}`;
    });
    return [
        `A.C.A.S Activity Log (${entries.length} entries)`,
        ...summary,
        ...sections
    ].join('\n\n');
}

export function filterLogEntries(entries, type = 'all', query = '') {
    const searchTerms = query.split(',').map(term => term.trim().toLowerCase()).filter(Boolean);
    return entries.filter(entry => {
        if(type !== 'all' && entry.type !== type) return false;
        if(!searchTerms.length) return true;
        const date = new Date(entry.timestamp);
        const searchableText = [
            entry.type, typeLabel(entry.type), entry.message,
            entry.instanceID && `${text('instance', 'Instance')} ${entry.instanceID}`,
            entry.profile, entry.engine, entry.site,
            date.toLocaleTimeString(), date.toLocaleString()
        ].filter(Boolean).join(' ').toLowerCase();
        return searchTerms.some(term => searchableText.includes(term));
    });
}

export function createLogRow(entry, previousEntry) {
    const row = document.createElement('div');
    row.className = 'activity-log-entry';
    if(previousEntry && entry.timestamp - previousEntry.timestamp > 300) {
        row.classList.add('has-time-gap');
    }
    row.dataset.id = entry.id;
    row.dataset.type = entry.type;
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'activity-log-summary';
    summary.setAttribute('aria-expanded', 'false');
    const time = document.createElement('time');
    time.className = 'activity-log-date';
    const date = new Date(entry.timestamp);
    time.dateTime = date.toISOString();
    time.dataset.timestamp = String(entry.timestamp);
    time.textContent = formatLogTime(entry.timestamp, entry.type, preciseTimestamps);
    time.title = date.toLocaleString();
    const engine = document.createElement('span');
    engine.className = 'activity-log-engine';
    engine.textContent = engineLabelForEntry(entry);
    engine.hidden = !engine.textContent;
    const category = document.createElement('span');
    category.className = 'activity-log-category';
    category.textContent = typeLabel(entry.type);
    const message = document.createElement('span');
    message.className = 'activity-log-message';
    message.textContent = entry.message;
    const disclosure = document.createElement('span');
    disclosure.className = 'activity-log-disclosure';
    disclosure.setAttribute('aria-hidden', 'true');
    disclosure.textContent = '›';

    const meta = document.createElement('div');
    meta.className = 'activity-log-meta';
    meta.id = `activity-log-meta-${entry.id}`;
    meta.hidden = true;
    summary.setAttribute('aria-controls', meta.id);
    meta.appendChild(category);
    if(entry.instanceID || entry.profile || entry.engine || entry.site) {
        const context = document.createElement('span');
        context.className = 'activity-log-context';
        context.textContent = [
            entry.instanceID && `${text('instance', 'Instance')}: ${entry.instanceID}`,
            entry.profile && `${text('profile', 'Profile')}: ${entry.profile}`,
            engineLabelForEntry(entry) && `Engine: ${engineLabelForEntry(entry)}`,
            entry.site && `Site: ${entry.site}`
        ].filter(Boolean).join('\n');
        summary.title = context.textContent;
        meta.appendChild(context);
    }
    const fullMessage = document.createElement('pre');
    fullMessage.className = 'activity-log-full-message';
    fullMessage.textContent = entry.message;
    meta.appendChild(fullMessage);
    summary.onclick = () => {
        const expanded = summary.getAttribute('aria-expanded') !== 'true';
        summary.setAttribute('aria-expanded', String(expanded));
        summary.classList.toggle('is-expanded', expanded);
        meta.hidden = !expanded;
    };
    summary.append(time, engine, message, disclosure);
    row.append(summary, meta);
    return row;
}

export function initializeActivityLog() {
    const dialog = document.getElementById('log-floaty');
    const list = document.getElementById('activity-log-entries');
    const status = document.getElementById('activity-log-status');
    const clear = document.getElementById('activity-log-clear');
    const copy = document.getElementById('activity-log-copy');
    const timeToggle = document.getElementById('activity-log-time-toggle');
    const loggingToggle = document.getElementById('activity-log-toggle');
    const filter = document.getElementById('activity-log-filter');
    const search = document.getElementById('activity-log-search');
    if(initialized || !dialog || !list || !status || !clear || !copy || !timeToggle
        || !loggingToggle || !filter || !search) return;
    initialized = true;
    try {
        const savedFilters = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || 'null');
        if(savedFilters && typeof savedFilters === 'object') {
            if([...filter.options].some(option => option.value === savedFilters.type)) {
                filter.value = savedFilters.type;
            }
            if(typeof savedFilters.query === 'string') search.value = savedFilters.query;
        }
    } catch(error) {
        console.error('Activity log filters could not be restored.', error);
    }
    try {
        preciseTimestamps = localStorage.getItem(PRECISE_TIME_STORAGE_KEY) === 'true';
    } catch(error) {
        console.error('Activity log time format could not be restored.', error);
    }
    const updateTimeDisplay = () => {
        timeToggle.setAttribute('aria-pressed', String(preciseTimestamps));
        const label = text(
            preciseTimestamps ? 'hideMilliseconds' : 'showMilliseconds',
            preciseTimestamps ? 'Hide milliseconds' : 'Show milliseconds'
        );
        timeToggle.setAttribute('aria-label', label);
        timeToggle.title = label;
        list.querySelectorAll('.activity-log-date').forEach(time => {
            const row = time.closest('.activity-log-entry');
            time.textContent = formatLogTime(Number(time.dataset.timestamp), row.dataset.type, preciseTimestamps);
        });
    };
    timeToggle.onclick = () => {
        preciseTimestamps = !preciseTimestamps;
        try {
            localStorage.setItem(PRECISE_TIME_STORAGE_KEY, String(preciseTimestamps));
        } catch(error) {
            console.error('Activity log time format could not be saved.', error);
        }
        updateTimeDisplay();
    };
    updateTimeDisplay();
    const updateLoggingToggle = () => {
        const enabled = isActivityLoggingEnabled();
        const label = enabled
            ? text('disableLogging', 'Activity logging is on — click to disable')
            : text('enableLogging', 'Activity logging is OFF — click to enable');
        loggingToggle.setAttribute('aria-pressed', String(enabled));
        loggingToggle.setAttribute('aria-label', label);
        loggingToggle.title = label;
    };
    loggingToggle.onclick = () => {
        setActivityLoggingEnabled(!isActivityLoggingEnabled());
        updateLoggingToggle();
        render();
    };
    updateLoggingToggle();
    const header = dialog.querySelector('.floaty-header');
    const desktopPanel = window.matchMedia('(min-width: 768px) and (any-pointer: fine)');
    let drag = null;
    let resizeDrag = null;
    let panelSaveTimer = null;
    const reportPanelStorageError = error => {
        if(panelStorageErrorReported) return;
        panelStorageErrorReported = true;
        reportStorageError('Activity log panel settings could not be saved.', error);
    };
    const persistPanelGeometry = rect => {
        if(!desktopPanel.matches) return;
        try {
            localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            }));
        } catch(error) {
            reportPanelStorageError(error);
        }
    };
    const savePanelGeometry = () => {
        if(dialog.open) persistPanelGeometry(dialog.getBoundingClientRect());
    };
    const schedulePanelSave = () => {
        if(!dialog.open) return;
        const rect = dialog.getBoundingClientRect();
        if(panelSaveTimer !== null) clearTimeout(panelSaveTimer);
        panelSaveTimer = setTimeout(() => {
            panelSaveTimer = null;
            persistPanelGeometry(rect);
        }, 150);
    };
    const restorePanelGeometry = () => {
        if(!desktopPanel.matches) return;
        try {
            const saved = JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) || 'null');
            if(!saved || !['left', 'top', 'width', 'height'].every(key => Number.isFinite(saved[key]))) return;
            const width = Math.max(360, Math.min(saved.width, window.innerWidth - 24));
            const height = Math.max(260, Math.min(saved.height, window.innerHeight - 24));
            const left = Math.max(0, Math.min(saved.left, window.innerWidth - width));
            const top = Math.max(0, Math.min(saved.top, window.innerHeight - height));
            dialog.classList.add('is-dragged');
            dialog.style.width = `${width}px`;
            dialog.style.height = `${height}px`;
            dialog.style.left = `${left}px`;
            dialog.style.top = `${top}px`;
        } catch(error) {
            reportPanelStorageError(error);
        }
    };
    if(dialog.open) restorePanelGeometry();
    ['left', 'right'].forEach(corner => {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = `activity-log-resize-handle activity-log-resize-${corner}`;
        handle.setAttribute('aria-label', `Resize activity log from bottom ${corner}`);
        handle.title = `Resize from bottom ${corner}`;
        handle.addEventListener('pointerdown', event => {
            if(!desktopPanel.matches || event.button !== 0 || !dialog.open) return;
            const rect = dialog.getBoundingClientRect();
            dialog.classList.add('is-dragged');
            dialog.style.left = `${rect.left}px`;
            dialog.style.top = `${rect.top}px`;
            resizeDrag = {
                corner,
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
            event.preventDefault();
            event.stopPropagation();
        });
        handle.addEventListener('keydown', event => {
            if(!desktopPanel.matches || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            const rect = dialog.getBoundingClientRect();
            dialog.classList.add('is-dragged');
            dialog.style.left = `${rect.left}px`;
            dialog.style.top = `${rect.top}px`;
            const direction = corner === 'left' ? -1 : 1;
            const step = event.shiftKey ? 40 : 12;
            if(event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                const delta = event.key === 'ArrowRight' ? step : -step;
                const maxWidth = corner === 'left' ? rect.right - 24 : window.innerWidth - rect.left - 24;
                const width = Math.max(360, Math.min(maxWidth, rect.width + delta * direction));
                if(corner === 'left') dialog.style.left = `${rect.right - width}px`;
                dialog.style.width = `${width}px`;
            } else {
                const delta = event.key === 'ArrowDown' ? step : -step;
                dialog.style.height = `${Math.max(260, Math.min(window.innerHeight - rect.top - 24, rect.height + delta))}px`;
            }
            event.preventDefault();
            savePanelGeometry();
        });
        dialog.appendChild(handle);
    });
    if(header) header.addEventListener('pointerdown', event => {
        if(!desktopPanel.matches || event.button !== 0
            || event.target.closest('button, input, select, summary, label, a')) return;
        const rect = dialog.getBoundingClientRect();
        dialog.classList.add('is-dragged');
        dialog.style.left = `${rect.left}px`;
        dialog.style.top = `${rect.top}px`;
        drag = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: rect.left,
            top: rect.top
        };
        event.preventDefault();
    });
    window.addEventListener('pointermove', event => {
        if(resizeDrag && event.pointerId === resizeDrag.pointerId) {
            if(!desktopPanel.matches || !dialog.open) {
                resizeDrag = null;
                return;
            }
            const deltaX = event.clientX - resizeDrag.x;
            const deltaY = event.clientY - resizeDrag.y;
            const maxHeight = Math.max(260, window.innerHeight - resizeDrag.top - 24);
            dialog.style.height = `${Math.max(260, Math.min(maxHeight, resizeDrag.height + deltaY))}px`;
            if(resizeDrag.corner === 'right') {
                const maxWidth = Math.max(360, window.innerWidth - resizeDrag.left - 24);
                dialog.style.width = `${Math.max(360, Math.min(maxWidth, resizeDrag.width + deltaX))}px`;
            } else {
                const right = resizeDrag.left + resizeDrag.width;
                const left = Math.max(0, Math.min(right - 360, resizeDrag.left + deltaX));
                dialog.style.left = `${left}px`;
                dialog.style.width = `${right - left}px`;
            }
            return;
        }
        if(!drag || event.pointerId !== drag.pointerId) return;
        if(!desktopPanel.matches || !dialog.open) {
            drag = null;
            return;
        }
        const rect = dialog.getBoundingClientRect();
        const left = drag.left + event.clientX - drag.x;
        const top = drag.top + event.clientY - drag.y;
        dialog.style.left = `${Math.max(0, Math.min(left, window.innerWidth - rect.width))}px`;
        dialog.style.top = `${Math.max(0, Math.min(top, window.innerHeight - rect.height))}px`;
    });
    const stopDragging = event => {
        if(resizeDrag?.pointerId === event.pointerId) {
            resizeDrag = null;
            savePanelGeometry();
        }
        if(drag?.pointerId === event.pointerId) {
            drag = null;
            savePanelGeometry();
        }
    };
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('blur', () => {
        drag = null;
        resizeDrag = null;
    });
    window.addEventListener('resize', () => {
        if(!desktopPanel.matches) {
            dialog.classList.remove('is-dragged');
            ['left', 'top', 'width', 'height'].forEach(property => dialog.style.removeProperty(property));
            return;
        }
        if(!dialog.open) return;
        const rect = dialog.getBoundingClientRect();
        dialog.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
        dialog.style.top = `${Math.max(0, Math.min(rect.top, window.innerHeight - rect.height))}px`;
        schedulePanelSave();
    });
    if(typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(schedulePanelSave).observe(dialog);
    }
    let pendingRender = null;
    let lastRenderedId = 0;
    const render = () => {
        if(pendingRender !== null) clearTimeout(pendingRender);
        pendingRender = null;
        if(!dialog.open) return;
        const entries = activityLog.getEntries();
        const visible = filterLogEntries(entries, filter.value, search.value);
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
        while(list.firstElementChild && (!visible.length || Number(list.firstElementChild.dataset.id) < visible[0].id)) {
            list.firstElementChild.remove();
        }
        const fresh = visible.filter(entry => entry.id > lastRenderedId);
        const fragment = document.createDocumentFragment();
        const firstFreshIndex = visible.findIndex(entry => entry.id > lastRenderedId);
        let previousEntry = firstFreshIndex > 0 ? visible[firstFreshIndex - 1] : undefined;
        fresh.forEach(entry => {
            fragment.appendChild(createLogRow(entry, previousEntry));
            previousEntry = entry;
        });
        list.appendChild(fragment);
        if(visible.length) lastRenderedId = visible.at(-1).id;
        status.textContent = `${visible.length}/${entries.length}`;
        clear.disabled = !entries.length;
        if(atBottom) list.scrollTop = list.scrollHeight;
    };
    const scheduleRender = () => {
        // Batch output and do no DOM work while the log floaty is closed.
        if(dialog.open && pendingRender === null) pendingRender = setTimeout(render, 100);
    };
    activityLog.subscribe(scheduleRender);
    new MutationObserver(() => {
        if(dialog.open) restorePanelGeometry();
        scheduleRender();
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    clear.onclick = () => { activityLog.clear(); render(); };
    copy.onclick = async () => {
        const entries = filterLogEntries(activityLog.getEntries(), filter.value, search.value);
        const originalTitle = text('copyLog', 'Copy visible log entries');
        try {
            await navigator.clipboard.writeText(formatLogForClipboard(entries));
            copy.title = text('copiedLog', 'Copied');
            status.textContent = `Copied ${entries.length} entries`;
            setTimeout(() => {
                copy.title = originalTitle;
                render();
            }, 1500);
        } catch(error) {
            console.error('Activity log could not be copied to the clipboard.', error);
            status.textContent = `Copy failed: ${error.message}`;
        }
    };
    const resetVisibleEntries = () => {
        list.replaceChildren();
        lastRenderedId = 0;
        render();
    };
    const saveFilters = () => {
        try {
            localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
                type: filter.value,
                query: search.value
            }));
        } catch(error) {
            console.error('Activity log filters could not be saved.', error);
        }
    };
    filter.onchange = () => {
        saveFilters();
        resetVisibleEntries();
    };
    search.oninput = () => {
        saveFilters();
        resetVisibleEntries();
    };
    const translateUI = () => {
        dialog.setAttribute('aria-label', text('title', 'Activity Log'));
        updateTimeDisplay();
        updateLoggingToggle();
        const filterToggle = dialog.querySelector('.activity-log-filters summary');
        filterToggle.setAttribute('aria-label', text('filter', 'Filter activity by type'));
        filterToggle.title = text('filter', 'Filter activity by type');
        dialog.querySelector('.activity-log-filter-label span').textContent = text('show', 'Show');
        dialog.querySelector('.activity-log-search-label span').textContent = text('search', 'Search');
        search.placeholder = text('searchPlaceholder', 'Search log entries...');
        clear.setAttribute('aria-label', text('clear', 'Clear log'));
        clear.title = text('clear', 'Clear log');
        copy.setAttribute('aria-label', text('copyLog', 'Copy visible log entries'));
        copy.title = text('copyLog', 'Copy visible log entries');
        filter.setAttribute('aria-label', text('filter', 'Filter activity by type'));
        search.setAttribute('aria-label', text('search', 'Search'));
        [...filter.options].forEach(option => {
            option.textContent = option.value === 'all' ? text('all', 'All activity') : typeLabel(option.value);
        });
        const launcher = document.querySelector('.activity-log-launcher .open-floaty-btn');
        launcher.title = text('title', 'Activity Log');
        launcher.setAttribute('aria-label', text('title', 'Activity Log'));
        const close = dialog.querySelector('.floaty-close-btn');
        close.setAttribute('aria-label', text('close', 'Close activity log'));
        close.title = text('close', 'Close activity log');
        list.setAttribute('aria-label', text('title', 'Activity Log'));
        status.textContent = '0/0';
        list.replaceChildren();
        lastRenderedId = 0;
        render();
    };
    document.addEventListener('acas-translations-updated', translateUI);
    translateUI();
}