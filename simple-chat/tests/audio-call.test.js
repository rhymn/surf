const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../public/audio-call.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

const setup = ({ getUserMedia, secure = true, joinError } = {}) => {
    const elements = new Map();
    const handlers = new Map();
    const emitted = [];
    let requests = 0;
    const track = {
        enabled: true,
        readyState: 'live',
        stop() { this.readyState = 'ended'; },
        addEventListener() {}
    };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    const element = id => {
        if (!elements.has(id)) {
            const listeners = new Map();
            const attributes = new Map([['aria-pressed', 'false']]);
            elements.set(id, {
                hidden: false, disabled: false, textContent: '',
                addEventListener: (event, handler) => listeners.set(event, handler),
                setAttribute: (name, value) => attributes.set(name, value),
                getAttribute: name => attributes.get(name),
                click: () => listeners.get('click')()
            });
        }
        return elements.get(id);
    };
    const socket = {
        id: 'self', connected: true,
        on: (event, handler) => handlers.set(event, handler),
        emit: (event, payload) => emitted.push({ event, payload }),
        timeout: () => ({ emit: (event, callback) => {
            emitted.push({ event });
            callback(null, joinError ? { error: joinError } : { peers: [] });
        } }),
        receive: (event, payload) => handlers.get(event)(payload)
    };
    runInNewContext(`${source}\ninitializeAudioCall(socket);`, {
        socket,
        window: { isSecureContext: secure, RTCPeerConnection: function() {}, addEventListener() {} },
        navigator: { mediaDevices: { getUserMedia: async constraints => {
            requests++;
            assert.equal(constraints.audio, true);
            assert.equal(constraints.video, false);
            return getUserMedia ? getUserMedia() : stream;
        } } },
        document: { getElementById: element },
        lucide: { createIcons() {} },
        fetch: async () => ({ ok: true, json: async () => ({ iceServers: [] }) })
    });
    return { element, socket, emitted, stream, track, requests: () => requests };
};

test('microphone is opt-in; muting and hanging up release local audio', async () => {
    const state = setup();
    assert.equal(state.requests(), 0);
    await state.element('join-call').click();
    assert.equal(state.requests(), 1);
    assert.equal(state.element('join-call').hidden, true);
    state.element('mute-call').click();
    assert.equal(state.track.enabled, false);
    assert.equal(state.element('mute-call').getAttribute('aria-pressed'), 'true');
    state.element('mute-call').click();
    assert.equal(state.track.enabled, true);
    state.element('leave-call').click();
    assert.equal(state.track.readyState, 'ended');
    assert.equal(state.element('join-call').hidden, false);
    assert.equal(state.element('audio-controls').hidden, true);
    assert.equal(state.emitted.at(-1).event, 'audio:leave');
});

test('microphone permission denial leaves the call retryable', async () => {
    const state = setup({ getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } });
    await state.element('join-call').click();
    assert.equal(state.element('audio-status').textContent, 'Microphone permission denied.');
    assert.equal(state.element('join-call').hidden, false);
    assert.equal(state.emitted.some(event => event.event === 'audio:join'), false);
});

test('cancelling pending microphone permission stops the eventual stream without joining', async () => {
    let provideMicrophone;
    const state = setup({ getUserMedia: () => new Promise(resolve => { provideMicrophone = resolve; }) });
    const attempt = state.element('join-call').click();
    await settle();
    state.element('leave-call').click();
    provideMicrophone(state.stream);
    await attempt;
    assert.equal(state.track.readyState, 'ended');
    assert.equal(state.emitted.some(event => event.event === 'audio:join'), false);
    assert.equal(state.element('audio-controls').hidden, true);
});

test('disconnect ends audio and does not automatically resume on reconnect', async () => {
    const state = setup();
    await state.element('join-call').click();
    state.socket.connected = false;
    state.socket.receive('disconnect');
    assert.equal(state.track.readyState, 'ended');
    assert.equal(state.element('join-call').disabled, true);
    state.socket.connected = true;
    state.socket.receive('connect');
    assert.equal(state.element('join-call').hidden, false);
    assert.equal(state.requests(), 1);
});

test('a full call releases the microphone and reports the server error', async () => {
    const state = setup({ joinError: 'This call is full (maximum 6 people).' });
    await state.element('join-call').click();
    assert.equal(state.track.readyState, 'ended');
    assert.match(state.element('audio-status').textContent, /full/);
    assert.equal(state.element('join-call').hidden, false);
});

test('insecure pages disable calls without requesting microphone access', () => {
    const state = setup({ secure: false });
    state.socket.receive('audio:participants', [{ peerId: 'other' }]);
    assert.equal(state.element('join-call').disabled, true);
    assert.equal(state.requests(), 0);
    assert.match(state.element('audio-status').textContent, /HTTPS/);
});