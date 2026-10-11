const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, registerAccounts } = require('../accounts');

const setup = () => {
    const routes = new Map();
    const accounts = new Map();
    const sessions = new Map();
    let socketMiddleware;
    const sockets = new Map();
    registerAccounts({
        app: { get: (url, handler) => routes.set(url, handler), post: (url, handler) => routes.set(url, handler) },
        io: { sockets: { sockets }, use: handler => { socketMiddleware = handler; } },
        storage: {
            getAccountRooms: async () => ['existinglongroom'],
            createAccount: async data => {
                if (accounts.has(data.login)) throw Object.assign(new Error('Duplicate'), { code: '23505' });
                const account = { ...data, password_hash: data.passwordHash };
                accounts.set(account.login, account); return account;
            },
            getAccountByLogin: async login => accounts.get(login),
            saveAccountSession: async (hash, id, expiry) => sessions.set(hash, { id, expiry }),
            deleteAccountSession: async hash => sessions.delete(hash),
            renewAccountSession: async (hash, expiry) => {
                const session = sessions.get(hash);
                if (!session || session.expiry <= new Date()) return null;
                session.expiry = expiry;
                return { account_id: session.id };
            },
            getAccountSession: async hash => {
                const session = sessions.get(hash);
                return session && session.expiry > new Date() ? Array.from(accounts.values()).find(account => account.id === session.id) : null;
            },
            updateAccount: async (id, username, email) => {
                const account = Array.from(accounts.values()).find(account => account.id === id);
                Object.assign(account, { username, email }); return account;
            }
        }
    });
    const call = async (path, body, token, origin = 'https://chat.example') => {
        const response = { code: 200, headers: {}, set() { return this; },
            status(code) { this.code = code; return this; }, json(data) { this.body = data; },
            cookie(name, value, options) { this.token = value; this.options = options; }, clearCookie() { this.cleared = true; } };
        await routes.get(path)({ body, headers: { host: 'chat.example', origin, cookie: token ? `chat_session=${token}` : '' }, ip: 'test', secure: true }, response);
        return response;
    };
    return { call, accounts, sessions, sockets, middleware: () => socketMiddleware };
};
const registration = { login: 'Alice', username: 'Alice', password: 'a long test password' };

test('passwords use salted hashes and reject incorrect passwords', async () => {
    const hash = await hashPassword(registration.password);
    assert.notEqual(hash, await hashPassword(registration.password));
    assert.ok(await verifyPassword(registration.password, hash));
    assert.equal(await verifyPassword('wrong', hash), false);
    assert.equal(await verifyPassword('wrong', 'invalid'), false);
});

test('guests need no account; registration needs no email and returns a secure session', async () => {
    const state = setup();
    assert.equal((await state.call('/auth/me')).body.account, null);
    const result = await state.call('/auth/register', registration);
    assert.equal(result.code, 200);
    assert.match(result.body.account.id, /^account:/);
    assert.equal(result.body.account.email, '');
    assert.equal(result.body.account.login, 'alice');
    assert.deepEqual(result.body.rooms, ['existinglongroom']);
    assert.equal(result.body.account.password_hash, undefined);
    assert.equal(result.options.httpOnly, true);
    assert.equal(result.options.secure, true);
    assert.equal(result.options.sameSite, 'strict');
    assert.equal(result.options.maxAge, 180 * 86400000);
    assert.equal(state.sessions.has(result.token), false);
    assert.equal((await state.call('/auth/me', null, result.token)).body.account.id, result.body.account.id);
});

test('login accepts the password, rotates sessions and logout revokes sockets', async () => {
    const state = setup();
    const registered = await state.call('/auth/register', registration);
    assert.equal((await state.call('/auth/login', { login: 'ALICE', password: 'wrong' })).code, 401);
    const loggedIn = await state.call('/auth/login', { login: 'ALICE', password: registration.password }, registered.token);
    assert.notEqual(loggedIn.token, registered.token);
    assert.equal((await state.call('/auth/me', null, registered.token)).body.account, null);
    let disconnected = false;
    const crypto = require('node:crypto');
    state.sockets.set('peer', { data: { sessionHash: crypto.createHash('sha256').update(loggedIn.token).digest('hex') },
        disconnect: () => { disconnected = true; } });
    const logout = await state.call('/auth/logout', null, loggedIn.token);
    assert.equal(logout.cleared, true);
    assert.equal(disconnected, true);
    assert.equal((await state.call('/auth/me', null, loggedIn.token)).body.account, null);
});

test('registration validates optional email, short passwords and duplicate login names', async () => {
    const state = setup();
    assert.equal((await state.call('/auth/register', { ...registration, password: 'short' })).code, 400);
    assert.equal((await state.call('/auth/register', { ...registration, email: 'invalid' })).code, 400);
    assert.equal((await state.call('/auth/register', { ...registration, email: 'alice@example.com' })).code, 200);
    assert.equal((await state.call('/auth/register', registration)).code, 409);
});

test('cross-origin changes are rejected and login attempts are limited', async () => {
    const state = setup();
    assert.equal((await state.call('/auth/register', registration, null, 'https://outside.example')).code, 403);
    assert.equal((await state.call('/auth/register', registration, null, 'http://chat.example')).code, 403);
    for (let attempt = 0; attempt < 20; attempt++) {
        assert.equal((await state.call('/auth/login', { login: 'Alice' })).code, 400);
    }
    assert.equal((await state.call('/auth/login', registration)).code, 429);
});

test('authenticated socket identity comes from the session, not the client claim', async () => {
    const state = setup();
    const result = await state.call('/auth/register', registration);
    const socket = { data: {}, handshake: { headers: { cookie: `chat_session=${result.token}` }, auth: { userId: result.body.account.id } },
        use: handler => { socket.guard = handler; }, disconnect: () => { socket.disconnected = true; } };
    let error;
    await state.middleware()(socket, value => { error = value; });
    assert.equal(error, undefined);
    assert.equal(socket.data.account.id, result.body.account.id);
    await state.call('/auth/logout', null, result.token);
    let proceeded = false;
    await socket.guard([], () => { proceeded = true; });
    assert.equal(proceeded, false);
    assert.equal(socket.disconnected, true);
    const impostor = { data: {}, handshake: { headers: {}, auth: { userId: result.body.account.id } } };
    await state.middleware()(impostor, value => { error = value; });
    assert.ok(error);
    const guest = { data: {}, handshake: { headers: {}, auth: { userId: 'legacyguest' } } };
    await state.middleware()(guest, value => { error = value; });
    assert.equal(error, undefined);
    assert.equal(guest.data.account, null);
});

test('expired sessions cannot be used and profile updates require login', async () => {
    const state = setup();
    assert.equal((await state.call('/auth/profile', { username: 'New name' })).code, 401);
    const registered = await state.call('/auth/register', registration);
    const updated = await state.call('/auth/profile', { username: 'New name', email: '' }, registered.token);
    assert.equal(updated.body.account.username, 'New name');
    assert.equal(updated.body.account.email, '');
    for (const session of state.sessions.values()) session.expiry = new Date(0);
    assert.equal((await state.call('/auth/me', null, registered.token)).body.account, null);
    assert.equal((await state.call('/auth/profile', { username: 'Other' }, registered.token)).code, 401);
});

test('account storage is additive and uses parameterized, expiring sessions without rewriting messages', async () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { runInNewContext } = require('node:vm');
    const calls = [];
    const database = {
        none: async (sql, values) => { calls.push({ sql, values }); },
        one: async (sql, values) => { calls.push({ sql, values }); return { id: 'account:test' }; },
        oneOrNone: async (sql, values) => { calls.push({ sql, values }); return null; },
        any: async (sql, values) => { calls.push({ sql, values }); return [{ room: 'legacyroom' }]; }
    };
    const context = { module: { exports: {} }, process: { env: { DATABASE_URL: 'postgresql://localhost/test' } },
        console: { log() {}, error() {} }, require: () => () => () => database };
    runInNewContext(readFileSync(join(__dirname, '../db.js'), 'utf8'), context);
    const storage = context.module.exports;
    const expiry = new Date(Date.now() + 1000);
    await storage.createAccount({ id: 'account:test', login: 'alice', username: 'Alice', email: null, passwordHash: 'hash' });
    await storage.saveAccountSession('token-hash', 'account:test', expiry);
    await storage.getAccountSession('token-hash');
    const rooms = await storage.getAccountRooms('account:test');
    assert.match(calls[0].sql, /CREATE TABLE IF NOT EXISTS chat_accounts/);
    assert.match(calls[0].sql, /email TEXT,/);
    assert.match(calls[0].sql, /CREATE TABLE IF NOT EXISTS chat_account_sessions/);
    assert.doesNotMatch(calls[0].sql, /UPDATE messages|DROP TABLE/);
    assert.deepEqual(Array.from(calls[1].values), ['account:test', 'alice', 'Alice', null, 'hash']);
    assert.deepEqual(Array.from(calls[2].values), ['token-hash', 'account:test', expiry]);
    assert.match(calls[3].sql, /sessions.token_hash = \$1 AND sessions.expires_at > NOW\(\)/);
    assert.equal(rooms[0], 'legacyroom');
    assert.deepEqual(Array.from(calls[4].values), ['account:test']);
});

test('profile bootstrap preserves legacy guest storage and trusts only the server account identity', async () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { runInNewContext } = require('node:vm');
    const source = readFileSync(join(__dirname, '../public/profile.js'), 'utf8');
    for (const account of [null, { id: 'account:verified', login: 'alice', username: 'Verified name', email: '' }]) {
        const storage = new Map([['userId', 'olderguestid'], ['username', 'Legacy name'], ['groups', 'olderlongroom']]);
        const profile = runInNewContext(`${source}\nchatProfile;`, {
            localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
            crypto: { randomUUID: () => assert.fail('Existing identities must not be replaced') },
            AbortSignal: { timeout() {} },
            fetch: async () => ({ ok: true, json: async () => ({ account, rooms: account ? ['newroom'] : [] }) }),
            window: { addEventListener() {} },
            document: { addEventListener() {} }, setInterval() {}
        });
        await profile.ready;
        assert.equal(profile.getUserId(), account?.id || 'olderguestid');
        assert.equal(profile.getUsername(), account?.username || 'Legacy name');
        assert.equal(profile.isLoggedIn(), Boolean(account));
        assert.equal(storage.get('userId'), 'olderguestid');
        assert.equal(storage.get('username'), 'Legacy name');
        assert.ok(storage.get('groups').split(',').includes('olderlongroom'));
        assert.equal(storage.get('groups').split(',').includes('newroom'), Boolean(account));
        assert.equal(storage.has('password'), false);
        assert.equal(storage.has('session'), false);
    }
});

test('returning to the site renews the same device session without requiring a password', async () => {
    const state = setup();
    const registered = await state.call('/auth/register', registration);
    const session = Array.from(state.sessions.values())[0];
    session.expiry = new Date(Date.now() + 1000);
    const result = await state.call('/auth/me', null, registered.token);
    assert.equal(result.token, registered.token);
    assert.equal(result.body.account.id, registered.body.account.id);
    assert.equal(result.options.maxAge, 180 * 86400000);
    assert.ok(session.expiry > new Date(Date.now() + 179 * 86400000));
    assert.equal(state.sessions.size, 1);
    await state.call('/auth/logout', null, registered.token);
    assert.equal((await state.call('/auth/me', null, registered.token)).body.account, null);
    assert.equal(state.sessions.size, 0);
});

test('renewal cannot revive sessions that expired or were revoked during the request', async () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { runInNewContext } = require('node:vm');
    let query;
    const context = { module: { exports: {} }, process: { env: { DATABASE_URL: 'postgresql://localhost/test' } },
        console: { log() {}, error() {} }, require: () => () => () => ({ none: async () => {},
            oneOrNone: async (sql, values) => { query = { sql, values }; return null; } }) };
    runInNewContext(readFileSync(join(__dirname, '../db.js'), 'utf8'), context);
    const result = await context.module.exports.renewAccountSession('token-hash', new Date());
    assert.equal(result, null);
    assert.match(query.sql, /WHERE token_hash = \$1 AND expires_at > NOW\(\) RETURNING account_id/);
    assert.equal(query.values[0], 'token-hash');
});

test('visible active profiles renew periodically and survive temporary service failures', async () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { runInNewContext } = require('node:vm');
    const storage = new Map([['userId', 'guest'], ['username', 'Guest'], ['groups', 'oldroom']]);
    const events = new Map();
    const document = { hidden: false, addEventListener: (name, handler) => events.set(name, handler) };
    let now = 0;
    let requests = 0;
    let unavailable = false;
    let expired = false;
    let reloaded = false;
    const profile = runInNewContext(`${readFileSync(join(__dirname, '../public/profile.js'), 'utf8')}\nchatProfile;`, {
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        crypto: {}, AbortSignal: { timeout() {} }, document,
        Date: class extends Date { static now() { return now; } },
        setInterval() {},
        window: { addEventListener: (name, handler) => events.set(name, handler), location: { reload: () => { reloaded = true; } } },
        fetch: async () => {
            requests++;
            return { ok: !unavailable, json: async () => ({ account: expired ? null : { id: 'account:alice', username: 'Alice' }, rooms: [] }) };
        }
    });
    await profile.ready;
    await events.get('focus')();
    assert.equal(requests, 1);
    now = 6 * 60 * 60 * 1000 + 1;
    document.hidden = true;
    await events.get('visibilitychange')();
    assert.equal(requests, 1);
    document.hidden = false;
    unavailable = true;
    await events.get('focus')();
    assert.equal(profile.isLoggedIn(), true);
    assert.equal(reloaded, false);
    unavailable = false;
    await events.get('focus')();
    assert.equal(requests, 3);
    assert.equal(profile.getUserId(), 'account:alice');
    expired = true;
    now += 6 * 60 * 60 * 1000 + 1;
    await events.get('focus')();
    assert.equal(reloaded, true);
    assert.equal(storage.get('userId'), 'guest');
});

test('guest and legacy sockets stay guests even when this browser has an account cookie', async () => {
    const state = setup();
    const registered = await state.call('/auth/register', registration);
    for (const auth of [undefined, { room: 'olderroom', userId: 'legacyguest' }]) {
        const socket = { data: {}, handshake: { auth, headers: { cookie: `chat_session=${registered.token}` } } };
        let error;
        await state.middleware()(socket, value => { error = value; });
        assert.equal(error, undefined);
        assert.equal(socket.data.account, null);
    }
    const forged = { data: {}, handshake: { headers: { cookie: `chat_session=${registered.token}` }, auth: { userId: 'account:someone-else' } } };
    let error;
    await state.middleware()(forged, value => { error = value; });
    assert.ok(error);
});

test('profile startup never trims or rewrites legacy chat lists', async () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { runInNewContext } = require('node:vm');
    const source = readFileSync(join(__dirname, '../public/profile.js'), 'utf8');
    const legacyGroups = `,${Array.from({ length: 240 }, (_, index) => `olderroom${index}`).join(',')},olderroom0,`;
    for (const rooms of [[], ['newroom', 'olderroom0', 'newroom']]) {
        const storage = new Map([['userId', 'legacy'], ['username', 'Legacy name'], ['groups', legacyGroups]]);
        const profile = runInNewContext(`${source}\nchatProfile;`, {
            localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
            crypto: {}, AbortSignal: { timeout() {} }, setInterval() {},
            document: { addEventListener() {} }, window: { addEventListener() {} },
            fetch: async () => ({ ok: true, json: async () => ({ account: null, rooms }) })
        });
        await profile.ready;
        assert.equal(storage.get('groups'), rooms.length ? `${legacyGroups}newroom` : legacyGroups);
        assert.equal(profile.getUserId(), 'legacy');
    }
});

test('guest profiles and stored preferences survive missing or temporarily unavailable account endpoints', async () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { runInNewContext } = require('node:vm');
    for (const unavailable of [false, true]) {
        const original = [['userId', 'legacyguest'], ['username', 'Legacy user'], ['groups', ',oldroom,oldroom,'],
            ['dictationLanguage', 'sv-SE'], ['readMessages', '{"oldroom":3}'], ['showTyping:legacyguest', 'false']];
        const storage = new Map(original);
        const profile = runInNewContext(`${readFileSync(join(__dirname, '../public/profile.js'), 'utf8')}\nchatProfile;`, {
            localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
            crypto: {}, AbortSignal: { timeout() {} }, setInterval() {},
            document: { addEventListener() {} }, window: { addEventListener() {} },
            fetch: async () => {
                if (unavailable) throw new Error('Service unavailable');
                return { ok: false, status: 404 };
            }
        });
        await profile.ready;
        assert.equal(profile.getUserId(), 'legacyguest');
        assert.equal(profile.getUsername(), 'Legacy user');
        assert.equal(profile.isLoggedIn(), false);
        assert.deepEqual(Array.from(storage.entries()), original);
    }
});