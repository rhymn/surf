const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerAudioSignaling } = require('../audio-signaling');

const setup = () => {
    const events = [];
    const users = {};
    const io = {
        sockets: { sockets: new Map() },
        to: target => ({ emit: (event, payload) => events.push({ target, event, payload }) })
    };
    const connect = (id, room = 'chat:room') => {
        const handlers = new Map();
        const socket = {
            id, data: {},
            on: (event, handler) => handlers.set(event, handler),
            emit: (event, payload) => events.push({ target: id, event, payload }),
            receive: (event, payload) => handlers.get(event)(payload)
        };
        io.sockets.sockets.set(id, socket);
        users[id] = id;
        registerAudioSignaling(io, socket, room, users);
        return socket;
    };
    const join = socket => {
        let result;
        socket.receive('audio:join', response => { result = response; });
        return result;
    };
    return { events, connect, join };
};

test('joining returns only opted-in peers from the same room', () => {
    const { connect, join } = setup();
    const first = connect('first');
    connect('silent');
    join(connect('outsider', 'chat:other'));
    assert.deepEqual(join(first), { peers: [] });
    assert.deepEqual(join(connect('second')), { peers: [{ peerId: 'first', username: 'first' }] });
});

test('signals require both peers to be in the same active call', () => {
    const { events, connect, join } = setup();
    const sender = connect('sender');
    const receiver = connect('receiver');
    const outsider = connect('outsider', 'chat:other');
    const signal = targetPeerId => ({ targetPeerId, description: { type: 'offer', sdp: 'audio' } });
    join(receiver);
    join(outsider);
    sender.receive('audio:signal', signal(receiver.id));
    join(sender);
    sender.receive('audio:signal', signal(outsider.id));
    sender.receive('audio:signal', null);
    sender.receive('audio:signal', { targetPeerId: receiver.id, description: { type: 'invalid', sdp: 'audio' } });
    assert.equal(events.filter(event => event.event === 'audio:signal').length, 0);
    sender.receive('audio:signal', signal(receiver.id));
    sender.receive('audio:signal', { targetPeerId: receiver.id, candidate: { candidate: 'ice' } });
    assert.equal(events.filter(event => event.event === 'audio:signal').length, 2);
    receiver.receive('audio:leave');
    sender.receive('audio:signal', signal(receiver.id));
    assert.equal(events.filter(event => event.event === 'audio:signal').length, 2);
});

test('leave and disconnect remove peers and are idempotent', () => {
    for (const eventName of ['audio:leave', 'disconnect']) {
        const { events, connect, join } = setup();
        const first = connect('first');
        join(first);
        first.receive(eventName);
        first.receive(eventName);
        assert.equal(events.filter(event => event.event === 'audio:peer-left').length, 1);
        assert.deepEqual(join(connect('second')), { peers: [] });
    }
});

test('mesh calls are limited to six participants', () => {
    const { connect, join } = setup();
    for (let index = 0; index < 6; index++) assert.ok(!join(connect(`peer${index}`)).error);
    const extra = connect('extra');
    assert.match(join(extra).error, /full/);
    assert.equal(extra.data.inAudioCall, false);
});