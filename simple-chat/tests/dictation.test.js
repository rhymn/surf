const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../public/dictation.js'), 'utf8');

const setup = ({ supported = true, secure = true, prefixed = false, startError = false } = {}) => {
    const elements = new Map();
    const events = new Map();
    const sessions = [];
    const element = id => {
        if (!elements.has(id)) {
            const attributes = new Map();
            elements.set(id, {
                value: '', hidden: false, disabled: false,
                setAttribute: (key, value) => attributes.set(key, value),
                getAttribute: key => attributes.get(key),
                addEventListener: (event, handler) => { elements.get(id)[event] = handler; }
            });
        }
        return elements.get(id);
    };
    class Recognition {
        constructor() { sessions.push(this); }
        start() { if (startError) throw new Error('Unavailable'); this.onstart(); }
        stop() { this.stopped = true; }
        abort() { this.aborted = true; }
    }
    const context = {
        window: {
            isSecureContext: secure,
            [prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition']: supported ? Recognition : undefined,
            addEventListener: (event, handler) => events.set(event, handler)
        },
        navigator: { language: 'sv-SE' },
        document: { getElementById: element, addEventListener: (event, handler) => events.set(event, handler) },
        lucide: { createIcons() {} }
    };
    const controller = runInNewContext(`${source}\ninitializeDictation();`, context);
    const result = (session, texts, resultIndex = 0) => session.onresult({
        resultIndex,
        results: texts.map(text => Object.assign([{ transcript: text }], { isFinal: true }))
    });
    return { element, sessions, controller, result, event: (name, payload) => events.get(name)(payload) };
};

test('dictation starts only on click, preserves drafts and appends final text once', () => {
    const state = setup();
    assert.equal(state.sessions.length, 0);
    state.element('message-input').value = 'Draft';
    state.element('dictate-message').click();
    const session = state.sessions[0];
    assert.equal(session.lang, 'sv-SE');
    assert.equal(session.interimResults, false);
    assert.equal(state.element('dictate-message').getAttribute('aria-pressed'), 'true');
    state.result(session, ['Hej']);
    state.result(session, ['Hej', 'igen']);
    assert.equal(state.element('message-input').value, 'Draft Hej igen');
    state.element('dictate-message').click();
    assert.equal(session.stopped, true);
    state.result(session, ['Hej', 'igen', 'slut'], 2);
    session.onend();
    assert.equal(state.element('message-input').value, 'Draft Hej igen slut');
    assert.equal(state.element('dictate-message').getAttribute('aria-pressed'), 'false');
});

test('cancelled sessions cannot refill a sent draft or modify a newer session', () => {
    const state = setup();
    state.element('dictate-message').click();
    const old = state.sessions[0];
    state.controller.stop();
    assert.equal(old.aborted, true);
    state.element('message-input').value = '';
    state.result(old, ['Late text']);
    assert.equal(state.element('message-input').value, '');
    state.element('dictate-message').click();
    old.onend();
    state.result(old, ['More late text']);
    state.result(state.sessions[1], ['New text']);
    assert.equal(state.element('message-input').value, 'New text');
});

test('starting a call aborts dictation and disables it until the call ends', () => {
    const state = setup();
    state.element('dictate-message').click();
    state.event('audio-call-state', { detail: { active: true } });
    assert.equal(state.sessions[0].aborted, true);
    assert.equal(state.element('dictate-message').disabled, true);
    state.element('dictate-message').click();
    assert.equal(state.sessions.length, 1);
    state.event('audio-call-state', { detail: { active: false } });
    assert.equal(state.element('dictate-message').disabled, false);
});

test('unsupported and insecure browsers hide dictation; prefixed browsers work', () => {
    for (const options of [{ supported: false }, { secure: false }]) {
        const state = setup(options);
        assert.equal(state.element('dictate-message').hidden, true);
        state.element('dictate-message').click();
        assert.equal(state.sessions.length, 0);
    }
    const state = setup({ prefixed: true });
    state.element('dictate-message').click();
    assert.equal(state.sessions.length, 1);
});

test('permission and network errors keep draft text and reset listening state', () => {
    for (const error of ['not-allowed', 'network', 'audio-capture', 'no-speech']) {
        const state = setup();
        state.element('message-input').value = 'Keep this';
        state.element('dictate-message').click();
        state.sessions[0].onerror({ error });
        assert.equal(state.element('message-input').value, 'Keep this');
        assert.equal(state.element('dictate-message').getAttribute('aria-pressed'), 'false');
        assert.equal(state.element('dictation-status').hidden, false);
        state.sessions[0].onend();
        assert.equal(state.element('dictation-status').hidden, false);
    }
});

test('pagehide aborts recording and synchronous start errors remain retryable', () => {
    const state = setup();
    state.element('dictate-message').click();
    state.event('pagehide');
    assert.equal(state.sessions[0].aborted, true);
    const failing = setup({ startError: true });
    failing.element('dictate-message').click();
    assert.match(failing.element('dictation-status').textContent, /unavailable/);
    assert.equal(failing.element('dictate-message').getAttribute('aria-pressed'), 'false');
});