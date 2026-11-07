(() => {
    const finder = document.querySelector("#usage-finder");
    const input = finder?.querySelector("input");
    const list = finder?.querySelector(".usage-finder-list");
    const empty = finder?.querySelector(".usage-finder-empty");
    const article = document.querySelector("#main");
    const header = document.querySelector("main > header");
    const content = document.querySelector(".content");

    if (!finder || !input || !list || !article) return;

    // Words people type that the page words differently.
    const synonyms = {
        strength: ["elo", "level", "skill"],
        rating: ["elo"],
        skill: ["elo"],
        level: ["elo"],
        weak: ["elo"],
        human: ["elo", "personalities"],
        color: ["colors", "theme"],
        colour: ["colors", "theme"],
        colours: ["colors", "theme"],
        theme: ["color", "background"],
        voice: ["tts", "spoken"],
        speak: ["tts", "spoken"],
        sound: ["tts", "spoken"],
        audio: ["tts", "spoken"],
        save: ["export", "import", "backup"],
        backup: ["export", "import"],
        reset: ["export", "import"],
        profile: ["profiles"],
        hide: ["ghost", "concealment"],
        detect: ["ghost", "concealment"],
        ban: ["ghost", "concealment"],
        stealth: ["ghost", "concealment"],
        speed: ["delay", "movetime", "timing"],
        fast: ["delay", "movetime"],
        slow: ["delay", "movetime"],
        time: ["delay", "movetime"],
        timer: ["delay", "movetime"],
        arrow: ["suggestions", "moves"],
        arrows: ["suggestions", "moves"],
        hint: ["suggestions", "moves"],
        hints: ["suggestions", "moves"],
        bar: ["evaluation"],
        eval: ["evaluation"],
        server: ["external"],
        stockfish: ["engine"],
        lc0: ["engine", "weights"],
        leela: ["engine", "weights"],
        network: ["weights"],
        book: ["opening"],
        openings: ["opening"],
        language: ["languages"],
        translate: ["languages"],
        mobile: ["floating", "panel"],
        phone: ["floating", "panel"],
        popup: ["floating", "panel"],
        auto: ["automatic", "turn"],
        autoplay: ["automatic", "turn"],
        flip: ["reverse", "side"],
        black: ["reverse", "side"],
        learn: ["learning", "feedback"],
        mistake: ["feedback", "ratings"],
        blunder: ["feedback", "ratings"]
    };

    const slug = text => text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "") || "section";
    const clean = text => text.replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/g, " ").trim();
    const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const used = new Set([...document.querySelectorAll("[id]")].map(el => el.id));
    const headings = [...article.querySelectorAll("h1, h2, h3, h4")];

    headings.forEach(heading => {
        if (heading.id) return;
        let id = slug(clean(heading.textContent));
        while (used.has(id)) id += "-2";
        used.add(id);
        heading.id = id;
    });

    const levelOf = heading => Number(heading.tagName[1]);

    let hitTimer;
    const clearHits = () => {
        clearTimeout(hitTimer);
        window.CSS?.highlights?.delete("usage-hit");
    };

    // Highlights matched words in the heading and its section without touching the DOM.
    const highlightHits = (heading, words) => {
        clearHits();
        if (!words.length || !window.CSS?.highlights || typeof Highlight === "undefined") return;

        const next = headings[headings.indexOf(heading) + 1];
        const pattern = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
        const ranges = [];
        const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const afterStart = heading === node.parentElement.closest("h1,h2,h3,h4")
                || heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING;
            if (!afterStart) continue;
            if (next && (next.contains(node) || next.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
            if (node.parentElement.closest("#usage-finder")) continue;

            for (const m of node.textContent.matchAll(pattern)) {
                const range = new Range();
                range.setStart(node, m.index);
                range.setEnd(node, m.index + m[0].length);
                ranges.push(range);
            }
        }

        if (!ranges.length) return;
        CSS.highlights.set("usage-hit", new Highlight(...ranges));
        hitTimer = setTimeout(clearHits, 8000);
    };

    let settleToken = 0;

    // Resolves once smooth scrolling has stopped moving.
    const whenScrollSettled = () => new Promise(resolve => {
        let last = -1;
        let stable = 0;
        const tick = () => {
            stable = window.scrollY === last ? stable + 1 : 0;
            last = window.scrollY;
            if (stable >= 6) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });

    const goTo = async (heading, words = []) => {
        const token = ++settleToken;
        clearHits();
        heading.classList.remove("usage-flash");
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", `#${heading.id}`);

        await whenScrollSettled();
        if (token !== settleToken) return;

        void heading.offsetWidth;
        heading.classList.add("usage-flash");
        highlightHits(heading, words);
    };

    // Index every heading with the text that follows it, up to the next heading.
    const entries = headings
        .map((heading, i) => ({ heading, i }))
        .filter(({ heading }) => levelOf(heading) > 1)
        .map(({ heading, i }) => {
            const range = document.createRange();
            range.setStartAfter(heading);
            if (headings[i + 1]) range.setEndBefore(headings[i + 1]);
            else range.setEndAfter(article.lastChild);

            const level = levelOf(heading);
            const parentHeading = level === 2
                ? null
                : headings.slice(0, i).reverse().find(h => levelOf(h) === level - 1);

            return {
                heading,
                level,
                title: clean(heading.textContent),
                parent: parentHeading ? clean(parentHeading.textContent) : "",
                body: range.toString().replace(/\s+/g, " ").trim()
            };
        });

    entries.forEach(entry => {
        entry.titleLower = entry.title.toLowerCase();
        entry.parentLower = entry.parent.toLowerCase();
        entry.bodyLower = entry.body.toLowerCase();
        entry.titleWords = entry.titleLower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    });

    const iconOf = heading => (heading.textContent.match(/^\p{Extended_Pictographic}\uFE0F?/u) || ["#"])[0];

    // Chips shown while the search box is empty.
    entries.forEach(entry => {
        const link = document.createElement("a");
        link.href = `#${entry.heading.id}`;
        link.className = `usage-finder-item level-h${entry.level}`;
        link.innerHTML = `<span class="usage-finder-icon"></span><span class="usage-finder-label"></span>`;
        link.querySelector(".usage-finder-icon").textContent = iconOf(entry.heading);
        link.querySelector(".usage-finder-label").textContent = entry.title;
        link.addEventListener("click", e => {
            e.preventDefault();
            goTo(entry.heading);
        });
        list.append(link);
        entry.chip = link;
    });

    const results = document.createElement("div");
    results.className = "usage-finder-results";
    results.hidden = true;
    list.after(results);

    const withinOne = (a, b) => {
        if (Math.abs(a.length - b.length) > 1) return false;
        let i = 0, j = 0, edits = 0;
        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) { i++; j++; continue; }
            if (++edits > 1) return false;
            if (a.length > b.length) i++;
            else if (a.length < b.length) j++;
            else { i++; j++; }
        }
        return edits + (a.length - i) + (b.length - j) <= 1;
    };

    const scoreTerm = (entry, term) => {
        const options = [term, ...(synonyms[term] || [])];
        let best = 0;

        options.forEach((option, idx) => {
            const weight = idx === 0 ? 1 : 0.6;
            let score = 0;

            if (entry.titleWords.some(w => w === option)) score = 14;
            else if (entry.titleWords.some(w => w.startsWith(option))) score = 11;
            else if (entry.titleLower.includes(option)) score = 8;
            else if (entry.parentLower.includes(option)) score = 4;
            else if (entry.bodyLower.includes(option)) {
                const count = entry.bodyLower.split(option).length - 1;
                score = 2 + Math.min(count, 5) * 0.4;
            } else if (option.length >= 4 && entry.titleWords.some(w => w.length >= 4 && withinOne(w, option))) {
                score = 5;
            }

            best = Math.max(best, score * weight);
        });

        return best;
    };

    const highlight = (container, text, terms) => {
        const words = [...new Set(terms.flatMap(t => [t, ...(synonyms[t] || [])]))]
            .filter(Boolean)
            .sort((a, b) => b.length - a.length);

        if (!words.length) {
            container.textContent = text;
            return;
        }

        const regex = new RegExp(`(${words.map(escapeRegex).join("|")})`, "gi");
        text.split(regex).forEach((part, i) => {
            if (i % 2) {
                const mark = document.createElement("mark");
                mark.textContent = part;
                container.append(mark);
            } else {
                container.append(part);
            }
        });
    };

    const snippetFor = (entry, terms) => {
        const words = terms.flatMap(t => [t, ...(synonyms[t] || [])]);
        const positions = words.map(w => entry.bodyLower.indexOf(w)).filter(p => p >= 0);

        if (!positions.length) return entry.body.slice(0, 110) + (entry.body.length > 110 ? "…" : "");

        const at = Math.min(...positions);
        const start = Math.max(0, at - 45);
        const end = Math.min(entry.body.length, at + 95);

        return (start > 0 ? "…" : "") + entry.body.slice(start, end) + (end < entry.body.length ? "…" : "");
    };

    const search = () => {
        const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        const searching = terms.length > 0;

        finder.classList.toggle("is-searching", searching);
        list.hidden = searching;
        results.hidden = !searching;
        results.replaceChildren();

        if (!searching) {
            if (empty) empty.hidden = true;
            return;
        }

        const ranked = entries
            .map(entry => {
                const scores = terms.map(term => scoreTerm(entry, term));
                const matched = scores.filter(s => s > 0).length;
                // Every word has to land somewhere, except one stray word in longer queries.
                const needed = terms.length > 3 ? terms.length - 1 : terms.length;
                return { entry, matched, needed, score: scores.reduce((a, b) => a + b, 0) };
            })
            .filter(r => r.matched >= r.needed)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        if (empty) empty.hidden = ranked.length > 0;

        ranked.forEach(({ entry }) => {
            const link = document.createElement("a");
            link.href = `#${entry.heading.id}`;
            link.className = "usage-finder-result";

            const top = document.createElement("div");
            top.className = "usage-finder-result-top";
            const icon = document.createElement("span");
            icon.className = "usage-finder-icon";
            icon.textContent = iconOf(entry.heading);
            const title = document.createElement("span");
            title.className = "usage-finder-result-title";
            highlight(title, entry.title, terms);
            top.append(icon, title);

            if (entry.parent) {
                const parent = document.createElement("span");
                parent.className = "usage-finder-parent";
                parent.textContent = entry.parent;
                top.append(parent);
            }

            const snippet = document.createElement("div");
            snippet.className = "usage-finder-snippet";
            highlight(snippet, snippetFor(entry, terms), terms);

            link.append(top, snippet);
            link.addEventListener("click", e => {
                e.preventDefault();
                goTo(entry.heading, terms.flatMap(t => [t, ...(synonyms[t] || [])]));
            });
            results.append(link);
        });
    };

    input.addEventListener("input", search);
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            results.querySelector("a")?.click();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            results.querySelector("a")?.focus();
        } else if (e.key === "Escape") {
            input.value = "";
            search();
        }
    });

    results.addEventListener("keydown", e => {
        const links = [...results.querySelectorAll("a")];
        const at = links.indexOf(document.activeElement);

        if (e.key === "ArrowDown" && links[at + 1]) {
            e.preventDefault();
            links[at + 1].focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            (links[at - 1] || input).focus();
        }
    });

    search();

    // Docked bar: collapsed pill that opens on demand.
    const toggle = finder.querySelector(".usage-finder-toggle");
    const setOpen = open => {
        finder.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        if (open) input.focus();
    };
    toggle.addEventListener("click", () => setOpen(!finder.classList.contains("is-open")));
    document.addEventListener("pointerdown", e => {
        if (finder.classList.contains("is-open") && !finder.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", e => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
        if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setOpen(true);
        } else if (e.key === "Escape" && finder.classList.contains("is-open") && !input.value) {
            setOpen(false);
            toggle.focus();
        }
    });
    finder.addEventListener("click", e => {
        if (e.target.closest(".usage-finder-item, .usage-finder-result") && window.matchMedia("(max-width: 768px)").matches) {
            setOpen(false);
        }
    });

    // Sticky breadcrumb: h1 > h2 > h3 > h4 for wherever you are on the page.
    if (!header || !content) return;

    const wrap = document.createElement("div");
    wrap.className = "usage-crumbs-wrap";
    const bar = document.createElement("nav");
    bar.className = "usage-crumbs";
    bar.setAttribute("aria-label", "Current section");
    wrap.append(bar);
    content.prepend(wrap);

    const root = document.documentElement;
    const measure = () => {
        const headerH = header.offsetHeight;
        root.style.setProperty("--usage-header-h", `${headerH}px`);
        root.style.setProperty("--usage-offset", `${headerH + bar.offsetHeight + 12}px`);
    };
    measure();
    window.addEventListener("resize", measure);

    let lastKey = "";
    let ticking = false;

    const update = () => {
        ticking = false;
        const headerH = header.offsetHeight;
        const threshold = headerH + (bar.offsetHeight || 40) + 24;
        let path = [];

        headings.forEach(heading => {
            if (heading.getBoundingClientRect().top > threshold) return;
            const level = levelOf(heading);
            path = path.filter(h => levelOf(h) < level);
            path.push(heading);
        });

        const h1 = headings.find(h => levelOf(h) === 1);
        const pastTitle = h1 ? h1.getBoundingClientRect().bottom <= headerH : true;
        const visible = pastTitle && path.length > 0;
        const key = visible ? path.map(h => h.id).join(">") : "";

        wrap.classList.toggle("is-visible", visible);
        if (key === lastKey) return;
        lastKey = key;

        bar.replaceChildren();
        path.forEach(heading => {
            const crumb = document.createElement("a");
            crumb.href = `#${heading.id}`;
            crumb.textContent = clean(heading.textContent);
            crumb.addEventListener("click", e => {
                e.preventDefault();
                goTo(heading);
            });
            bar.append(crumb);
        });
        measure();
    };

    window.addEventListener("scroll", () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });
    update();
})();
