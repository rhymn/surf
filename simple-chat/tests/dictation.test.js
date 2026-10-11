const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../public/dictation.js'), 'utf8');

const setup = ({ supported = true, secure = true, prefixed = false, startError = false,
    savedLanguage, browserLanguage = 'sv-SE', displayNames = true } = {}) => {
    const elements = new Map();
    const events = new Map();
    const sessions = [];
    const storage = new Map(savedLanguage ? [['dictationLanguage', savedLanguage]] : []);
    const element = id => {
        if (!elements.has(id)) {
            const attributes = new Map();
            elements.set(id, {
                value: '', hidden: false, disabled: false,
                options: ['', 'sv-SE', 'en-US', 'en-GB'].map(value => ({ value })),
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
        navigator: { language: browserLanguage },
        Intl: displayNames ? Intl : {},
        localStorage: {
            getItem: key => storage.get(key),
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        document: { getElementById: element, addEventListener: (event, handler) => events.set(event, handler) },
        lucide: { createIcons() {} }
    };
    const controller = runInNewContext(`${source}\ninitializeDictation();`, context);
    const result = (session, texts, resultIndex = 0) => session.onresult({
        resultIndex,
        results: texts.map(text => Object.assign([{ transcript: typeof text === 'string' ? text : text.text }],
            { isFinal: typeof text === 'string' || text.final === true }))
    });
    return { element, sessions, controller, result, storage, event: (name, payload) => events.get(name)(payload) };
};

test('dictation starts only on click, preserves drafts and appends final text once', () => {
    const state = setup();
    assert.equal(state.sessions.length, 0);
    state.element('message-input').value = 'Draft';
    state.element('dictate-message').click();
    const session = state.sessions[0];
    assert.equal(session.lang, 'sv-SE');
    assert.equal(session.interimResults, true);
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

test('interim text streams into the draft and is replaced rather than duplicated', () => {
    const state = setup();
    state.element('message-input').value = 'Draft';
    state.element('dictate-message').click();
    const session = state.sessions[0];
    state.result(session, [{ text: 'He' }]);
    assert.equal(state.element('message-input').value, 'Draft He');
    state.result(session, [{ text: 'Hej igen' }]);
    assert.equal(state.element('message-input').value, 'Draft Hej igen');
    state.result(session, ['Hej', { text: 'hur ar' }]);
    assert.equal(state.element('message-input').value, 'Draft Hej hur ar');
    state.result(session, ['Hej', 'hur ar det'], 1);
    state.result(session, ['Hej', 'hur ar det'], 1);
    assert.equal(state.element('message-input').value, 'Draft Hej hur ar det');
});

test('retracted interim results disappear without removing final text or the original draft', () => {
    const state = setup();
    state.element('message-input').value = 'Draft ';
    state.element('dictate-message').click();
    const session = state.sessions[0];
    state.result(session, ['Hej', { text: 'maybe' }]);
    state.result(session, ['Hej'], 1);
    assert.equal(state.element('message-input').value, 'Draft Hej');
    state.controller.stop();
    state.result(session, ['Late']);
    assert.equal(state.element('message-input').value, 'Draft Hej');
});

test('manual editing aborts dictation and preserves the visible text against late results', () => {
    for (const notifyInput of [true, false]) {
        const state = setup();
        state.element('dictate-message').click();
        const session = state.sessions[0];
        state.result(session, [{ text: 'Tentative' }]);
        state.element('message-input').value = 'Manually corrected';
        if (notifyInput) state.element('message-input').input();
        state.result(session, ['Recognized']);
        assert.equal(session.aborted, true);
        assert.equal(state.element('message-input').value, 'Manually corrected');
    }
});

test('saved Swedish selection overrides an English browser language', () => {
    const state = setup({ savedLanguage: 'sv-SE', browserLanguage: 'en-US' });
    assert.equal(state.element('dictation-language').value, 'sv-SE');
    state.element('dictate-message').click();
    assert.equal(state.sessions[0].lang, 'sv-SE');
    assert.equal(state.element('dictation-language').options[1].textContent, 'Swedish (Sweden)');
});

test('changing language saves the choice and stops active dictation without clearing the draft', () => {
    const state = setup({ browserLanguage: 'en-US' });
    state.element('message-input').value = 'Keep draft';
    state.element('dictate-message').click();
    state.element('dictation-language').value = 'sv-SE';
    state.element('dictation-language').change();
    assert.equal(state.storage.get('dictationLanguage'), 'sv-SE');
    assert.equal(state.sessions[0].aborted, true);
    assert.equal(state.element('message-input').value, 'Keep draft');
    state.element('dictate-message').click();
    assert.equal(state.sessions[1].lang, 'sv-SE');
    state.element('dictation-language').value = '';
    state.element('dictation-language').change();
    assert.equal(state.storage.has('dictationLanguage'), false);
    state.element('dictate-message').click();
    assert.equal(state.sessions[2].lang, 'en-US');
});

test('invalid saved languages fall back to the browser and labels work without DisplayNames', () => {
    const state = setup({ savedLanguage: 'invalid', displayNames: false });
    assert.equal(state.element('dictation-language').value, '');
    state.element('dictate-message').click();
    assert.equal(state.sessions[0].lang, 'sv-SE');
});