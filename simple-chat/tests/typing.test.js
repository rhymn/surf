const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const setup = ({ showTyping } = {}) => {
    const elements = new Map();
    const events = new Map();
    const handlers = new Map();
    const timers = new Map();
    const sent = [];
    const storage = new Map(showTyping === undefined ? [] : [['showTyping:self', String(showTyping)]]);
    const document = { hidden: false,
        getElementById: id => {
            if (!elements.has(id)) {
                const listeners = new Map();
                elements.set(id, { value: '', hidden: true, textContent: '',
                    addEventListener: (event, handler) => listeners.set(event, handler),
                    fire: event => listeners.get(event)() });
            }
            return elements.get(id);
        }, addEventListener: (event, handler) => events.set(event, handler)
    };
    const socket = { connected: true,
        emit: (event, active) => sent.push({ event, active }),
        on: (event, handler) => handlers.set(event, handler) };
    runInNewContext(`${readFileSync(join(__dirname, '../public/typing.js'), 'utf8')}\ninitializeTyping(socket);`, {
        socket, document, getUserId: () => 'self',
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        window: { addEventListener: (event, handler) => events.set(event, handler) },
        setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id; },
        clearTimeout: id => timers.delete(id)
    });
    return { document, socket, elements, events, handlers, timers, sent, storage };
};

test('typing and dictation announce activity, throttle keystrokes and stop on idle or submit', () => {
    for (const event of ['input', 'dictation-input']) {
        const state = setup();
        const input = state.elements.get('message-input');
        input.value = 'Draft';
        input.fire(event);
        input.fire(event);
        assert.equal(state.sent.length, 1);
        assert.equal(state.sent[0].active, true);
        const timer = Array.from(state.timers.values())[0];
        assert.equal(timer.delay, 1800);
        timer.callback();
        assert.equal(state.sent.at(-1).active, false);
        input.fire(event);
        state.elements.get('chat-form').fire('submit');
        assert.equal(state.sent.at(-1).active, false);
    }
});

test('clearing drafts, blurring, or hiding the page stops broadcasting', () => {
    for (const reason of ['empty', 'blur', 'hidden']) {
        const state = setup();
        const input = state.elements.get('message-input');
        input.value = 'Draft';
        input.fire('input');
        if (reason === 'empty') { input.value = ''; input.fire('input'); }
        else if (reason === 'blur') input.fire('blur');
        else { state.document.hidden = true; state.events.get('visibilitychange')(); }
        assert.equal(state.sent.at(-1).active, false);
    }
});

test('remote typing deduplicates multiple tabs, ignores self, and expires', () => {
    const state = setup();
    const typing = state.handlers.get('typing');
    typing({ peerId: 'selftab', userId: 'self', username: 'Me', active: true });
    assert.equal(state.elements.get('typing-status').textContent, '');
    typing({ peerId: 'alice1', userId: 'alice', username: 'Alice', active: true });
    typing({ peerId: 'alice2', userId: 'alice', username: 'Alice', active: true });
    typing({ peerId: 'bob', userId: 'bob', username: 'Bob', active: true });
    assert.equal(state.elements.get('typing-status').textContent, 'Alice and Bob are typing...');
    typing({ peerId: 'alice1', userId: 'alice', active: false });
    assert.match(state.elements.get('typing-status').textContent, /Alice/);
    for (const timer of state.timers.values()) timer.callback();
    assert.equal(state.elements.get('typing-status').hidden, true);
});

test('disconnect clears received indicators and does not buffer stop events', () => {
    const state = setup();
    state.handlers.get('typing')({ peerId: 'alice', userId: 'alice', username: 'Alice', active: true });
    const input = state.elements.get('message-input');
    input.value = 'Draft'; input.fire('input');
    state.socket.connected = false;
    state.handlers.get('disconnect')();
    assert.equal(state.elements.get('typing-status').hidden, true);
    assert.equal(state.timers.size, 0);
    assert.equal(state.sent.length, 1);
});

test('typing sharing defaults to enabled and restores the saved profile preference', () => {
    assert.equal(setup().elements.get('show-typing').checked, true);
    assert.equal(setup({ showTyping: true }).elements.get('show-typing').checked, true);
    assert.equal(setup({ showTyping: false }).elements.get('show-typing').checked, false);
});

test('disabled sharing blocks typing and dictation but still shows other people writing', () => {
    const state = setup({ showTyping: false });
    const input = state.elements.get('message-input');
    input.value = 'Private draft';
    input.fire('input');
    input.fire('dictation-input');
    assert.equal(state.sent.length, 0);
    state.handlers.get('typing')({ peerId: 'alice', userId: 'alice', username: 'Alice', active: true });
    assert.equal(state.elements.get('typing-status').textContent, 'Alice is typing...');
});

test('turning off sharing clears an active indicator and saves it across rooms', () => {
    const state = setup();
    const input = state.elements.get('message-input');
    input.value = 'Draft';
    input.fire('input');
    const toggle = state.elements.get('show-typing');
    toggle.checked = false;
    toggle.fire('change');
    assert.equal(state.sent.at(-1).active, false);
    assert.equal(state.timers.size, 0);
    assert.equal(state.storage.get('showTyping:self'), 'false');
    input.fire('input');
    assert.equal(state.sent.length, 2);
    toggle.checked = true;
    toggle.fire('change');
    assert.equal(state.sent.length, 2);
    input.fire('input');
    assert.equal(state.sent.at(-1).active, true);
    assert.equal(state.storage.get('showTyping:self'), 'true');
});

test('profile settings synchronize across tabs without affecting other profiles', () => {
    const state = setup();
    const input = state.elements.get('message-input');
    input.value = 'Draft'; input.fire('input');
    state.storage.set('showTyping:other', 'false');
    state.events.get('storage')({ key: 'showTyping:other' });
    assert.equal(state.sent.length, 1);
    assert.equal(state.elements.get('show-typing').checked, true);
    state.storage.set('showTyping:self', 'false');
    state.events.get('storage')({ key: 'showTyping:self' });
    assert.equal(state.sent.at(-1).active, false);
    assert.equal(state.elements.get('show-typing').checked, false);
    state.storage.clear();
    state.events.get('storage')({ key: null });
    assert.equal(state.elements.get('show-typing').checked, true);
});