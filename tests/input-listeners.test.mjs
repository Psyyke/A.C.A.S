import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const implementations = [
    ['app', '../app/assets/js/globals.js', 'CREATE_INPUT_LISTENER'],
    ['userscript', '../acas.user.js', 'createInputListener']
];

test('keybinds ignore editable controls without changing normal or pointer shortcuts', async t => {
    const browser = await chromium.launch();
    t.after(() => browser.close());

    for(const [name, path, functionName] of implementations) {
        const source = await readFile(new URL(path, import.meta.url), 'utf8');
        const start = source.indexOf(`function ${functionName}(`);
        const end = source.indexOf('\n}', start);
        assert.ok(start >= 0 && end > start, `${name} listener is present`);
        const declaration = source.slice(start, end + 2);
        const page = await browser.newPage();
        try {
            const result = await page.evaluate(({ declaration, functionName }) => {
                const activeInputListeners = [], ACTIVE_INPUT_LISTENERS = [];
                const create = new Function('document', 'activeInputListeners', 'ACTIVE_INPUT_LISTENERS', 'runUserscriptTask',
                    `${declaration}\nreturn ${functionName};`)(
                        document, activeInputListeners, ACTIVE_INPUT_LISTENERS, callback => callback());
                let keys = 0, pointer = 0;
                create('keyboard', 'KeyA', () => keys++);
                create('pointer', 'InteractDoubleClick', () => pointer++);

                const controls = ['input', 'textarea', 'select'].map(tag => document.createElement(tag));
                const number = document.createElement('input');
                number.type = 'number';
                controls.push(number);
                const editable = document.createElement('div');
                editable.contentEditable = 'true';
                const child = document.createElement('span');
                editable.appendChild(child);
                const shadowHost = document.createElement('div');
                const shadowInput = document.createElement('input');
                shadowHost.attachShadow({ mode: 'open' }).appendChild(shadowInput);
                document.body.append(...controls, editable, shadowHost);
                controls.push(child, shadowInput);

                const defaults = controls.map(control => {
                    const event = new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, code: 'KeyA' });
                    control.dispatchEvent(event);
                    return event.defaultPrevented;
                });
                const whileEditing = keys;
                document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'KeyB' }));
                document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'KeyA' }));
                controls[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                return { whileEditing, keys, pointer, defaults };
            }, { declaration, functionName });
            assert.equal(result.whileEditing, 0, name);
            assert.equal(result.keys, 1, name);
            assert.equal(result.pointer, 1, name);
            assert.ok(result.defaults.every(prevented => !prevented), name);
        } finally {
            await page.close();
        }
    }
});
