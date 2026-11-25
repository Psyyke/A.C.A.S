(() => {
    const dialog = document.getElementById('serverCredits');
    const search = document.getElementById('creditsSearch');
    const list = document.getElementById('creditsList');
    const status = document.getElementById('creditsStatus');
    const retry = document.getElementById('creditsRetry');
    const t = window.serverI18n.text;
    const headings = { libraries: 'creditsLibraries', fonts: 'creditsFonts', ai: 'creditsAI' };
    let groups = [];
    let loaded = false;
    let loading = false;
    let loadError = false;

    function showStatus(key) {
        status.hidden = !key;
        status.textContent = key ? t(key) : '';
    }

    function reportError(error) {
        console.error('Could not open credits document:', error);
        toast.error(t('creditsLoadError'), 6000);
    }

    function filter() {
        const query = search.value.trim().toLocaleLowerCase();
        let matches = 0;
        for(const group of groups) {
            let visible = 0;
            for(const card of group.cards) {
                card.element.hidden = !card.searchText.includes(query);
                if(!card.element.hidden) visible++;
            }
            group.element.hidden = visible === 0;
            matches += visible;
        }
        showStatus(matches ? null : 'creditsEmpty');
    }

    function render(data) {
        if(!Array.isArray(data) || data.some(group => !Object.hasOwn(headings, group.id) || !Array.isArray(group.entries)))
            throw new Error('Invalid credits data.');
        const fragment = document.createDocumentFragment();
        const rendered = [];
        for(const group of data) {
            const section = document.createElement('section');
            section.className = 'credits-group';
            const heading = document.createElement('h3');
            heading.dataset.i18n = headings[group.id];
            section.appendChild(heading);
            const cards = [];
            for(const entry of group.entries) {
                if(typeof entry.name !== 'string' || typeof entry.license !== 'string'
                    || (typeof entry.licenseText !== 'string' && typeof entry.terms !== 'string'))
                    throw new Error('Invalid credits entry.');
                const details = document.createElement('details');
                details.className = 'credits-entry';
                const summary = document.createElement('summary');
                const name = document.createElement('span');
                name.className = 'credits-name';
                name.textContent = entry.name;
                if(entry.version) {
                    const version = document.createElement('span');
                    version.className = 'credits-version';
                    version.textContent = entry.version;
                    name.appendChild(version);
                }
                const license = document.createElement('span');
                license.className = 'credits-license';
                license.textContent = entry.license;
                summary.append(name, license);
                const body = document.createElement('div');
                body.className = 'credits-entry-body';
                if(entry.description) {
                    const description = document.createElement('p');
                    description.textContent = entry.description;
                    body.appendChild(description);
                }
                const links = document.createElement('div');
                links.className = 'credits-links';
                for(const [url, label] of [[entry.source, 'creditsSource'], [entry.terms, 'creditsTerms']]) {
                    if(!url) continue;
                    const link = document.createElement('a');
                    link.href = url;
                    link.dataset.i18n = label;
                    link.addEventListener('click', event => {
                        event.preventDefault();
                        window.electronAPI.openExternal(link.href).catch(reportError);
                    });
                    links.appendChild(link);
                }
                if(entry.chromiumNotices) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.i18n = 'creditsChromium';
                    button.addEventListener('click', () => window.electronAPI.openChromiumNotices().catch(reportError));
                    links.appendChild(button);
                }
                body.appendChild(links);
                if(entry.licenseText) {
                    const text = document.createElement('pre');
                    text.textContent = entry.licenseText;
                    body.appendChild(text);
                }
                details.append(summary, body);
                section.appendChild(details);
                cards.push({ element: details,
                    searchText: [entry.name, entry.version, entry.license, entry.description].filter(Boolean).join(' ').toLocaleLowerCase() });
            }
            fragment.appendChild(section);
            rendered.push({ element: section, cards });
        }
        list.replaceChildren(fragment);
        groups = rendered;
        window.serverI18n.translate(dialog);
    }

    async function load() {
        loading = true;
        loadError = false;
        retry.hidden = true;
        search.disabled = true;
        showStatus('working');
        try {
            render(await window.electronAPI.getCredits());
            loaded = true;
            search.disabled = false;
            filter();
            if(dialog.open) search.focus();
        } catch(error) {
            console.error('Could not load credits:', error);
            loadError = true;
            showStatus('creditsLoadError');
            retry.hidden = false;
        } finally {
            loading = false;
        }
    }

    document.getElementById('openCredits').addEventListener('click', () => {
        if(!dialog.open) dialog.showModal();
        if(!loaded && !loading) void load();
        else if(loaded) search.focus();
    });
    document.getElementById('closeCredits').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if(event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if(event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    retry.addEventListener('click', () => { if(!loading) void load(); });
    search.addEventListener('input', filter);
    document.addEventListener('server-language-changed', () => {
        if(loaded) filter();
        else if(loadError) showStatus('creditsLoadError');
        else if(loading) showStatus('working');
    });
})();
