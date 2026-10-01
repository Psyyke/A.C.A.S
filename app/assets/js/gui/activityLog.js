import { activityLog, ACTIVITY_LOG_LIMIT } from '../misc/activityLog.js';
import { featureText } from '../misc/featureTranslations.js';

let initialized = false;
const text = (key, fallback, values) => featureText('activityLog', key, fallback, values);
const typeLabel = type => (typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ)?.activityLog?.types?.[type]
    ?? type.replaceAll('-', ' ');

export function filterLogEntries(entries, type = 'all') {
    return type === 'all' ? entries : entries.filter(entry => entry.type === type);
}

export function createLogRow(entry) {
    const row = document.createElement('div');
    row.className = 'activity-log-entry';
    row.dataset.id = entry.id;
    row.dataset.type = entry.type;
    const header = document.createElement('div');
    header.className = 'activity-log-meta';
    const time = document.createElement('time');
    const date = new Date(entry.timestamp);
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleTimeString();
    time.title = date.toLocaleString();
    const category = document.createElement('span');
    category.className = 'activity-log-category';
    category.textContent = typeLabel(entry.type);
    header.append(time, category);
    if(entry.instanceID || entry.profile) {
        const context = document.createElement('span');
        context.className = 'activity-log-context';
        context.textContent = [entry.instanceID && `${text('instance', 'Instance')} ${entry.instanceID}`, entry.profile]
            .filter(Boolean).join(' · ');
        header.appendChild(context);
    }
    const message = document.createElement('pre');
    message.textContent = entry.message;
    row.append(header, message);
    return row;
}

export function initializeActivityLog() {
    const dialog = document.getElementById('log-floaty');
    const list = document.getElementById('activity-log-entries');
    const status = document.getElementById('activity-log-status');
    const clear = document.getElementById('activity-log-clear');
    const filter = document.getElementById('activity-log-filter');
    if(initialized || !dialog || !list || !status || !clear || !filter) return;
    initialized = true;
    let pendingRender = null;
    let lastRenderedId = 0;
    const render = () => {
        if(pendingRender !== null) clearTimeout(pendingRender);
        pendingRender = null;
        if(!dialog.open) return;
        const entries = activityLog.getEntries();
        const visible = filterLogEntries(entries, filter.value);
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
        while(list.firstElementChild && (!visible.length || Number(list.firstElementChild.dataset.id) < visible[0].id)) {
            list.firstElementChild.remove();
        }
        const fresh = visible.filter(entry => entry.id > lastRenderedId);
        const fragment = document.createDocumentFragment();
        fresh.forEach(entry => fragment.appendChild(createLogRow(entry)));
        list.appendChild(fragment);
        if(visible.length) lastRenderedId = visible.at(-1).id;
        status.textContent = entries.length
            ? text('status', '{shown} shown · {total} total · latest {limit} kept this session', {
                shown: visible.length, total: entries.length, limit: ACTIVITY_LOG_LIMIT })
            : text('empty', 'No log entries yet.');
        clear.disabled = !entries.length;
        if(atBottom) list.scrollTop = list.scrollHeight;
    };
    const scheduleRender = () => {
        // Batch output and do no DOM work while the log floaty is closed.
        if(dialog.open && pendingRender === null) pendingRender = setTimeout(render, 100);
    };
    activityLog.subscribe(scheduleRender);
    new MutationObserver(scheduleRender).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    clear.onclick = () => { activityLog.clear(); render(); };
    filter.onchange = () => {
        list.replaceChildren();
        lastRenderedId = 0;
        render();
    };
    const translateUI = () => {
        document.querySelector('#activity-log-title').textContent = text('title', 'Activity Log');
        dialog.querySelector('.title p').textContent = text('subtitle', 'Engine messages, dynamic changes, warnings and errors');
        dialog.querySelector('.activity-log-filter-label span').textContent = text('show', 'Show');
        clear.textContent = text('clear', 'Clear log');
        filter.setAttribute('aria-label', text('filter', 'Filter activity by type'));
        [...filter.options].forEach(option => {
            option.textContent = option.value === 'all' ? text('all', 'All activity') : typeLabel(option.value);
        });
        const launcher = document.querySelector('.activity-log-launcher .open-floaty-btn');
        launcher.title = text('title', 'Activity Log');
        launcher.setAttribute('aria-label', text('title', 'Activity Log'));
        dialog.querySelector('.floaty-close-btn').setAttribute('aria-label', text('close', 'Close activity log'));
        list.setAttribute('aria-label', text('title', 'Activity Log'));
        status.textContent = text('empty', 'No log entries yet.');
        list.replaceChildren();
        lastRenderedId = 0;
        render();
    };
    document.addEventListener('acas-translations-updated', translateUI);
    translateUI();
}