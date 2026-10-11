const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const setup = ({ candidates = [] } = {}) => {
    const rows = new Map();
    const titles = new Map();
    const members = new Map();
    const sockets = new Map();
    const events = [];
    let connectionHandler;
    let nextId = 1;
    let failing = false;
    const routes = new Map();
    const activeRooms = new Map();
    const app = { use() {}, get: (route, handler) => routes.set(route, handler), post: (route, handler) => routes.set(`POST ${route}`, handler) };
    const database = {
        saveParticipant: async (room, userId, username) => { members.set(`${room}:${userId}`, { room, userId, username }); },
        getChatSummaries: async rooms => {
            if (failing) throw new Error('Database unavailable');
            return rooms.map(room => ({ room, title: titles.get(room) || '',
                participants: Array.from(members.values()).filter(member => member.room === room)
                    .map(({ userId, username }) => ({ userId, username })) }));
        },
        reserveRoom: async room => {
            if (failing) throw new Error('Database unavailable');
            if (titles.has(room) || Array.from(rows.values()).some(row => row.room === room)) return null;
            titles.set(room, '');
            return { room };
        },
        getRoomTitle: async room => titles.get(room) || '',
        setRoomTitle: async (room, title) => {
            if (failing) throw new Error('Database unavailable');
            titles.set(room, title);
            return { title };
        },
        getMessages: async room => Array.from(rows.values()).filter(row => row.room === room),
        saveMessage: async (room, username, userid, message) => {
            if (failing) throw new Error('Database unavailable');
            const saved = { id: nextId++, room, username, userid, message, edited: false, removed: false };
            rows.set(saved.id, saved);
            return saved;
        },
        editMessage: async (room, userid, id, message) => {
            if (failing) throw new Error('Database unavailable');
            const row = rows.get(id);
            if (!row || row.removed || row.room !== room || row.userid !== userid) return null;
            const edited = { ...row, message, edited: true };
            rows.set(id, edited);
            return edited;
        },
        deleteMessage: async (room, userid, id) => {
            if (failing) throw new Error('Database unavailable');
            const row = rows.get(id);
            if (!row || row.removed || row.room !== room || row.userid !== userid) return null;
            rows.set(id, { ...row, message: '', removed: true });
            return { id };
        }
    };
    const dependencies = {
        express: Object.assign(() => app, { static() {} }),
        http: { createServer: () => ({ listen() {} }) },
        'socket.io': () => ({
            sockets: { adapter: { rooms: activeRooms }, sockets },
            on: (event, handler) => { connectionHandler = handler; },
            to: target => ({ emit: (event, payload) => events.push({ target, event, payload }) })
        }),
        './db': database,
        'node:crypto': { randomInt: () => Number.parseInt(candidates.shift() || '0000', 36) },
        './audio-signaling': { registerAudioSignaling: (io, socket, room) => { socket.data.chatRoom = room; } },
        'body-parser': { json() {} }
    };
    runInNewContext(readFileSync(join(__dirname, '../server.js'), 'utf8'), {
        __dirname: join(__dirname, '..'),
        require: name => dependencies[name], process: { env: {} }, console: { log() {}, error() {}, warn() {} }
    });
    const connect = (userId, room = 'room') => {
        const handlers = new Map();
        const socket = {
            id: userId, data: {}, handshake: { auth: { room, userId } },
            join() {}, emit: (event, payload) => {
                if (event === 'roomTitle') events.push({ target: userId, event, payload });
            }, disconnect() {},
            on: (event, handler) => handlers.set(event, handler)
        };
        sockets.set(userId, socket);
        connectionHandler(socket);
        return async (event, payload) => {
            let result;
            await handlers.get(event)(payload, reply => { result = reply; });
            return result;
        };
    };
    return { rows, titles, events, connect, routes, activeRooms, sockets, members, fail: () => { failing = true; } };
};

test('saved messages use socket identity and carry IDs; owners can delete after reconnecting', async () => {
    const state = setup();
    const owner = state.connect('owner');
    await owner('message', { username: 'Alice', userid: 'forged', message: 'Hello' });
    const event = state.events.find(event => event.event === 'message');
    assert.equal(event.payload.id, 1);
    assert.equal(event.payload.userid, 'owner');
    assert.equal(event.target, 'chat:room');
    const result = await state.connect('owner')('deleteMessage', 1);
    assert.equal(result.error, undefined);
    assert.equal(state.rows.size, 1);
    assert.equal(state.rows.get(1).removed, true);
    assert.equal(state.rows.get(1).message, '');
    assert.equal(state.events.at(-1).event, 'messageDeleted');
    assert.equal(state.events.at(-1).payload.id, 1);
});

test('other users and other rooms cannot delete a message', async () => {
    const state = setup();
    await state.connect('owner')('message', { username: 'Alice', message: 'Hello' });
    for (const remove of [state.connect('other'), state.connect('owner', 'elsewhere')]) {
        assert.match((await remove('deleteMessage', 1)).error, /not yours/);
    }
    assert.equal(state.rows.size, 1);
    assert.equal(state.events.filter(event => event.event === 'messageDeleted').length, 0);
});

test('invalid IDs and missing identities cannot delete messages', async () => {
    const state = setup();
    for (const id of [null, -1, 0, '1', 1.5, {}]) {
        assert.ok((await state.connect('owner')('deleteMessage', id)).error);
    }
    assert.ok((await state.connect(undefined)('deleteMessage', 1)).error);
    assert.equal(state.events.filter(event => event.event !== 'roomTitle').length, 0);
});

test('database failures do not broadcast phantom messages or deletions', async () => {
    const state = setup();
    const owner = state.connect('owner');
    state.fail();
    assert.match((await owner('message', { username: 'Alice', message: 'Hello' })).error, /saved/);
    assert.match((await owner('deleteMessage', 1)).error, /deleted/);
    assert.equal(state.events.filter(event => event.event !== 'roomTitle').length, 0);
});

test('storage persists edited and removed states with room and ownership predicates', async () => {
    const calls = [];
    const database = {
        none: async sql => {
            assert.match(sql, /ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT FALSE/);
            assert.match(sql, /ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT FALSE/);
            assert.match(sql, /CREATE TABLE IF NOT EXISTS chat_rooms/);
        },
        one: async (sql, values) => { calls.push({ sql, values }); return { id: 3 }; },
        oneOrNone: async (sql, values) => { calls.push({ sql, values }); return { id: 3 }; }
    };
    const context = {
        require: () => () => () => database,
        process: { env: { DATABASE_URL: 'postgresql://localhost/test' } },
        console: { log() {}, error() {} }, module: { exports: {} }
    };
    runInNewContext(readFileSync(join(__dirname, '../db.js'), 'utf8'), context);
    const storage = context.module.exports;
    assert.equal((await storage.saveMessage('room', 'Alice', 'owner', 'Hello')).id, 3);
    assert.match(calls[0].sql, /RETURNING \*/);
    await storage.deleteMessage('room', 'owner', 3);
    assert.match(calls[1].sql, /SET message = '', removed = TRUE/);
    assert.match(calls[1].sql, /WHERE id = \$1 AND room = \$2 AND userid = \$3 AND removed = FALSE RETURNING id/);
    assert.deepEqual(Array.from(calls[1].values), [3, 'room', 'owner']);
    await storage.editMessage('room', 'owner', 3, 'Updated');
    assert.match(calls[2].sql, /UPDATE messages SET message = \$4, edited = TRUE WHERE id = \$1 AND room = \$2 AND userid = \$3 AND removed = FALSE RETURNING \*/);
    assert.deepEqual(Array.from(calls[2].values), [3, 'room', 'owner', 'Updated']);
    await storage.setRoomTitle('room', 'Weekend plans');
    assert.match(calls[3].sql, /ON CONFLICT \(room\) DO UPDATE SET title = EXCLUDED.title RETURNING title/);
    assert.deepEqual(Array.from(calls[3].values), ['room', 'Weekend plans']);
    await storage.getRoomTitle('room');
    assert.equal(calls[4].sql, 'SELECT title FROM chat_rooms WHERE room = $1');
    assert.deepEqual(Array.from(calls[4].values), ['room']);
    await storage.reserveRoom('abcd');
    assert.match(calls[5].sql, /WHERE NOT EXISTS \(SELECT 1 FROM messages WHERE room = \$1\) ON CONFLICT \(room\) DO NOTHING RETURNING room/);
    assert.deepEqual(Array.from(calls[5].values), ['abcd']);
});

test('owners can edit saved messages after reconnecting without changing identity or position', async () => {
    const state = setup();
    await state.connect('owner')('message', { username: 'Alice', message: 'Original' });
    const original = { ...state.rows.get(1) };
    const owner = state.connect('owner');
    assert.equal((await owner('editMessage', { id: 1, message: 'Updated' })).error, undefined);
    assert.deepEqual(state.rows.get(1), { ...original, message: 'Updated', edited: true });
    assert.equal(state.events.at(-1).event, 'messageEdited');
    assert.equal(state.events.at(-1).target, 'chat:room');
    assert.equal(state.events.at(-1).payload.message, 'Updated');
    assert.equal(state.events.at(-1).payload.edited, true);
    await owner('deleteMessage', 1);
    assert.equal(state.rows.get(1).removed, true);
    assert.equal(state.rows.get(1).message, '');
    assert.match((await owner('deleteMessage', 1)).error, /not found/);
    assert.match((await owner('editMessage', { id: 1, message: 'Too late' })).error, /not found/);
});

test('edits reject other users, rooms, invalid IDs, and empty text', async () => {
    const state = setup();
    await state.connect('owner')('message', { username: 'Alice', message: 'Original' });
    for (const edit of [state.connect('other'), state.connect('owner', 'elsewhere')]) {
        assert.match((await edit('editMessage', { id: 1, message: 'Updated' })).error, /not yours/);
    }
    const owner = state.connect('owner');
    for (const payload of [null, {}, { id: '1', message: 'Updated' }, { id: -1, message: 'Updated' },
        { id: 1, message: '' }, { id: 1, message: '  ' }, { id: 1, message: null }]) {
        assert.ok((await owner('editMessage', payload)).error);
    }
    assert.ok((await state.connect(undefined)('editMessage', { id: 1, message: 'Updated' })).error);
    assert.equal(state.rows.get(1).message, 'Original');
    assert.equal(state.events.filter(event => event.event === 'messageEdited').length, 0);
});

test('failed edits leave the stored message unchanged and do not broadcast', async () => {
    const state = setup();
    const owner = state.connect('owner');
    await owner('message', { username: 'Alice', message: 'Original' });
    state.fail();
    assert.match((await owner('editMessage', { id: 1, message: 'Updated' })).error, /could not be edited/);
    assert.equal(state.rows.get(1).message, 'Original');
    assert.equal(state.events.filter(event => event.event === 'messageEdited').length, 0);
});

test('room titles are shared, persisted, and isolated by room', async () => {
    const state = setup();
    const first = state.connect('first');
    assert.equal((await first('setRoomTitle', '  Weekend plans  ')).error, undefined);
    assert.equal(state.titles.get('room'), 'Weekend plans');
    const update = state.events.find(event => event.target === 'chat:room' && event.event === 'roomTitle');
    assert.equal(update.payload.title, 'Weekend plans');
    state.connect('second');
    state.connect('outsider', 'other');
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(state.events.some(event => event.target === 'second' && event.payload.title === 'Weekend plans'));
    assert.ok(state.events.some(event => event.target === 'outsider' && event.payload.title === ''));
    assert.equal((await state.connect('second')('setRoomTitle', '')).error, undefined);
    assert.equal(state.titles.get('room'), '');
});

test('invalid titles and database errors do not broadcast updates', async () => {
    const state = setup();
    const first = state.connect('first');
    for (const title of [null, {}, 'x'.repeat(121)]) {
        assert.ok((await first('setRoomTitle', title)).error);
    }
    state.fail();
    assert.match((await first('setRoomTitle', 'Weekend plans')).error, /could not be saved/);
    assert.equal(state.titles.size, 0);
    assert.equal(state.events.filter(event => event.target === 'chat:room').length, 0);
});

test('new room IDs have exactly four characters and skip stored, historical, and active rooms', async () => {
    const state = setup({ candidates: ['aaaa', 'bbbb', 'cccc', '000d'] });
    state.titles.set('aaaa', 'Existing');
    state.rows.set(1, { room: 'bbbb' });
    state.activeRooms.set('chat:cccc', new Set(['connected']));
    let destination;
    await state.routes.get('/random')({}, { redirect: value => { destination = value; } });
    assert.equal(destination, '/000d');
    assert.match(destination, /^\/[a-z0-9]{4}$/);
    assert.equal(state.titles.has('000d'), true);
});

test('room generation returns a retryable error on repeated collisions or database failure', async () => {
    for (const failure of [false, true]) {
        const state = setup();
        state.titles.set('0000', 'Existing');
        if (failure) state.fail();
        let code;
        let message;
        await state.routes.get('/random')({}, {
            redirect: () => assert.fail('Must not redirect to an existing room'),
            status: value => { code = value; return { send: value => { message = value; } }; }
        });
        assert.equal(code, 503);
        assert.match(message, /Try again/);
    }
});

test('home route is separate from rooms and summaries return only requested chats', async () => {
    const state = setup();
    let file;
    state.routes.get('/')({}, { sendFile: value => { file = value; } });
    assert.match(file, /public\/home.html$/);
    state.titles.set('aaaa', 'First chat');
    state.titles.set('bbbb', 'Other chat');
    let result;
    await state.routes.get('POST /chats')({ body: { rooms: ['aaaa', 'aaaa'] } }, {
        set: () => ({ json: value => { result = value; } })
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].room, 'aaaa');
    assert.equal(result[0].title, 'First chat');
});

test('invalid summary requests are rejected', async () => {
    for (const rooms of [undefined, 'aaaa', ['/other'], [null], Array(201).fill('aaaa')]) {
        const state = setup();
        let code;
        await state.routes.get('POST /chats')({ body: { rooms } }, {
            status: value => { code = value; return { json() {} }; }
        });
        assert.equal(code, 400);
    }
});

test('visitors are persisted without sending messages and online peers are deduplicated by identity', async () => {
    const state = setup();
    const visitor = state.connect('alice', 'aaaa');
    await visitor('newUser', 'Alice');
    state.connect('bob', 'bbbb');
    await state.connect('offline', 'aaaa')('newUser', 'Offline visitor');
    state.sockets.delete('offline');
    const alice = state.sockets.get('alice');
    state.sockets.set('second-tab', { id: 'alice', data: alice.data });
    let chats;
    await state.routes.get('POST /chats')({ body: { rooms: ['aaaa'] } }, {
        set: () => ({ json: value => { chats = value; } })
    });
    assert.equal(state.rows.size, 0);
    assert.equal(chats[0].participants.length, 2);
    assert.equal(chats[0].participants.find(person => person.userId === 'alice').online, true);
    assert.equal(chats[0].participants.find(person => person.userId === 'offline').online, false);
    assert.equal(chats[0].participants.some(person => person.userId === 'bob'), false);
});

test('summary storage requests only known room IDs and includes visitor and message history', async () => {
    const calls = [];
    const context = {
        require: () => () => () => ({
            none: async (sql, values) => { if (values) calls.push({ sql, values }); },
            any: async (sql, values) => {
                calls.push({ sql, values });
                return sql.startsWith('SELECT room, title') ? [{ room: 'aaaa', title: 'Weekend' }]
                    : sql.includes('COUNT(*)') ? [{ room: 'aaaa', message_count: 12 }]
                    : [{ room: 'aaaa', userid: 'alice', username: 'Alice' }];
            }
        }),
        process: { env: { DATABASE_URL: 'postgresql://localhost/test' } },
        console: { log() {}, error() {} }, module: { exports: {} }
    };
    runInNewContext(readFileSync(join(__dirname, '../db.js'), 'utf8'), context);
    const chats = await context.module.exports.getChatSummaries(['aaaa', 'bbbb']);
    assert.equal(chats[0].title, 'Weekend');
    assert.equal(chats[0].participants[0].username, 'Alice');
    assert.equal(chats[1].participants.length, 0);
    assert.equal(chats[0].messageCount, 12);
    assert.equal(chats[1].messageCount, 0);
    assert.match(calls[1].sql, /DISTINCT ON \(room, userid\)/);
    assert.match(calls[1].sql, /FROM chat_participants WHERE room = ANY\(\$1::text\[\]\)/);
    assert.match(calls[1].sql, /FROM messages WHERE room = ANY\(\$1::text\[\]\)/);
    assert.match(calls[2].sql, /COUNT\(\*\)::integer AS message_count/);
    assert.match(calls[2].sql, /room = ANY\(\$1::text\[\]\) AND removed = FALSE GROUP BY room/);
    assert.deepEqual(Array.from(calls[2].values[0]), ['aaaa', 'bbbb']);
    await context.module.exports.saveParticipant('aaaa', 'alice', 'New name');
    assert.match(calls[3].sql, /ON CONFLICT \(room, userid\) DO UPDATE SET username/);
    assert.deepEqual(Array.from(calls[3].values), ['aaaa', 'alice', 'New name']);
});