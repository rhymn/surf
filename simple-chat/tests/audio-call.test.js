const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../public/audio-call.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

const setup = ({ getUserMedia, secure = true, joinError, permission, savedNotifications = false, registrationError } = {}) => {
    const elements = new Map();
    const handlers = new Map();
    const emitted = [];
    const notifications = [];
    const storage = new Map(savedNotifications ? [['callNotifications', 'true']] : []);
    let permissionRequests = 0;
    const registration = {
        showNotification: async (title, options) => {
            notifications.push({ title, options, closed: false, close() { this.closed = true; } });
        },
        getNotifications: async ({ tag }) => notifications.filter(notification => !notification.closed && notification.options.tag === tag)
    };
    const notificationApi = permission ? {
        permission,
        requestPermission: async () => { permissionRequests++; return notificationApi.permission; }
    } : undefined;
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
        window: {
            isSecureContext: secure, RTCPeerConnection: function() {}, addEventListener() {},
            Notification: notificationApi,
            location: { origin: 'https://chat.example', pathname: '/room' }
        },
        localStorage: {
            getItem: key => storage.get(key),
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        navigator: {
            serviceWorker: {
                register: async () => { if (registrationError) throw new Error('Registration failed'); return registration; },
                ready: Promise.resolve(registration)
            },
            mediaDevices: { getUserMedia: async constraints => {
            requests++;
            assert.equal(constraints.audio, true);
            assert.equal(constraints.video, false);
            return getUserMedia ? getUserMedia() : stream;
        } } },
        document: { getElementById: element },
        lucide: { createIcons() {} },
        fetch: async () => ({ ok: true, json: async () => ({ iceServers: [] }) })
    });
    return { element, socket, emitted, stream, track, notifications, storage,
        requests: () => requests, permissionRequests: () => permissionRequests };
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

test('call notifications require explicit opt-in and do not activate the microphone', async () => {
    const state = setup({ permission: 'granted' });
    state.socket.receive('audio:participants', [{ peerId: 'caller', username: 'Alice' }]);
    await settle();
    assert.equal(state.notifications.length, 0);
    assert.equal(state.permissionRequests(), 0);
    await state.element('call-notifications').click();
    await settle();
    assert.equal(state.permissionRequests(), 1);
    assert.equal(state.requests(), 0);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, 'Incoming audio call');
    assert.equal(state.notifications[0].options.body, 'Alice started a call.');
    assert.equal(state.notifications[0].options.data.url, 'https://chat.example/room');
    assert.equal(state.element('call-notifications').getAttribute('aria-pressed'), 'true');
});

test('participant updates do not repeat alerts; ending and restarting a call does', async () => {
    const state = setup({ permission: 'granted', savedNotifications: true });
    const caller = { peerId: 'caller', username: 'Alice' };
    state.socket.receive('audio:participants', [caller]);
    state.socket.receive('audio:participants', [caller, { peerId: 'second' }]);
    state.socket.receive('audio:participants', [caller]);
    await settle();
    assert.equal(state.notifications.length, 1);
    state.socket.receive('audio:participants', []);
    await settle();
    assert.equal(state.notifications[0].closed, true);
    state.socket.receive('audio:participants', [caller]);
    await settle();
    assert.equal(state.notifications.length, 2);
});

test('joining or disabling notifications dismisses an incoming alert', async () => {
    for (const action of ['join-call', 'call-notifications']) {
        const state = setup({ permission: 'granted', savedNotifications: true });
        state.socket.receive('audio:participants', [{ peerId: 'caller' }]);
        await settle();
        await state.element(action).click();
        await settle();
        assert.equal(state.notifications[0].closed, true);
        if (action === 'call-notifications') {
            assert.equal(state.storage.has('callNotifications'), false);
            assert.equal(state.requests(), 0);
        }
    }
});

test('calls that end before notification registration finishes do not leave a stale alert', async () => {
    const state = setup({ permission: 'granted', savedNotifications: true });
    state.socket.receive('audio:participants', [{ peerId: 'caller' }]);
    state.socket.receive('audio:participants', []);
    await settle();
    assert.equal(state.notifications.length, 0);
});

test('denied permissions and registration failures do not break calling', async () => {
    for (const options of [{ permission: 'denied' }, { permission: 'granted', registrationError: true }]) {
        const state = setup(options);
        await state.element('call-notifications').click();
        assert.equal(state.storage.has('callNotifications'), false);
        assert.equal(state.notifications.length, 0);
        if (options.permission === 'denied') {
            assert.match(state.element('call-notifications').title, /blocked in browser settings/);
        }
        await state.element('join-call').click();
        assert.equal(state.requests(), 1);
        assert.equal(state.element('audio-controls').hidden, false);
    }
});

test('notification clicks focus the matching room or open it, never an external URL', async () => {
    const workerSource = readFileSync(join(__dirname, '../public/service-worker.js'), 'utf8');
    for (const existing of [true, false]) {
        const handlers = new Map();
        const actions = [];
        const lifecycle = [];
        runInNewContext(workerSource, {
            URL, console: { log() {} },
            self: {
                location: { origin: 'https://chat.example' },
                addEventListener: (event, handler) => handlers.set(event, handler),
                skipWaiting: async () => lifecycle.push('installed')
            },
            clients: {
                claim: async () => lifecycle.push('activated'),
                matchAll: async () => existing ? [{ url: 'https://chat.example/room', focus: () => actions.push('focus') }] : [],
                openWindow: url => actions.push(url)
            }
        });
        let pending;
        for (const eventName of ['install', 'activate']) {
            handlers.get(eventName)({ waitUntil: promise => { pending = promise; } });
            await pending;
        }
        assert.deepEqual(lifecycle, ['installed', 'activated']);
        handlers.get('notificationclick')({
            notification: { data: { url: 'https://chat.example/room' }, close() {} },
            waitUntil: promise => { pending = promise; }
        });
        await pending;
        assert.deepEqual(actions, [existing ? 'focus' : 'https://chat.example/room']);
        handlers.get('notificationclick')({
            notification: { data: { url: 'https://outside.example/room' }, close() {} },
            waitUntil: () => assert.fail('External notification URL must not open')
        });
        assert.equal(actions.length, 1);
    }
});