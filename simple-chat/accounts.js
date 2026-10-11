const { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const cookie = require('cookie');

const deriveKey = promisify(scrypt);
const sessionCookie = 'chat_session';
const sessionDays = 180;

const hashPassword = async (password, salt = randomBytes(16).toString('hex')) => {
    const key = await deriveKey(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
    return `scrypt$${salt}$${key.toString('hex')}`;
};

const verifyPassword = async (password, encoded) => {
    const [algorithm, salt, expected] = (encoded || '').split('$');
    if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
    const actual = (await hashPassword(password, salt)).split('$')[2];
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
};

const publicAccount = account => ({ id: account.id, login: account.login, username: account.username, email: account.email || '' });
const tokenHash = token => createHash('sha256').update(token).digest('hex');

const registerAccounts = ({ app, io, storage }) => {
    const attempts = new Map();
    let hashing = 0;
    const tokenFrom = headers => {
        const token = cookie.parse(headers?.cookie || '')[sessionCookie];
        return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
    };
    const resolve = async headers => {
        const token = tokenFrom(headers);
        return token ? storage.getAccountSession(tokenHash(token)) : null;
    };
    const sameOrigin = req => {
        try {
            const origin = new URL(req.headers.origin);
            return origin.host === req.headers.host && origin.protocol === (cookieOptions(req).secure ? 'https:' : 'http:');
        } catch { return false; }
    };
    const cookieOptions = req => ({
        httpOnly: true, sameSite: 'strict', path: '/',
        secure: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || req.secure
    });
    const limited = req => {
        const now = Date.now();
        for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
        const keys = [`ip:${req.ip}`, `login:${String(req.body?.login || '').toLowerCase()}`];
        if (attempts.size > 10000 || hashing >= 4 || keys.some(key => (attempts.get(key)?.count || 0) >= (key.startsWith('ip:') ? 100 : 20))) return true;
        for (const key of keys) {
            const attempt = attempts.get(key) || { count: 0, until: now + 10 * 60 * 1000 };
            attempt.count++;
            attempts.set(key, attempt);
        }
        return false;
    };
    const endSession = async headers => {
        const token = tokenFrom(headers);
        if (!token) return;
        const hash = tokenHash(token);
        await storage.deleteAccountSession(hash);
        for (const socket of io.sockets.sockets.values()) {
            if (socket.data.sessionHash === hash) socket.disconnect(true);
        }
    };
    const startSession = async (req, res, account) => {
        await endSession(req.headers);
        const token = randomBytes(32).toString('hex');
        await storage.saveAccountSession(tokenHash(token), account.id, new Date(Date.now() + sessionDays * 86400000));
        res.cookie(sessionCookie, token, { ...cookieOptions(req), maxAge: sessionDays * 86400000 });
        res.json({ account: publicAccount(account), rooms: await storage.getAccountRooms(account.id) });
    };
    const route = handler => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!sameOrigin(req)) {
            res.status(403).json({ error: 'Account requests must come from this site.' });
            return;
        }
        try { await handler(req, res); }
        catch (error) {
            if (error.code === '23505') res.status(409).json({ error: 'That login name is already taken.' });
            else {
                console.error('Account operation failed:', error.code || error.name);
                res.status(503).json({ error: 'Account service unavailable. Try again.' });
            }
        }
    };
    const validPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 256;
    const validProfile = body => typeof body.username === 'string' && body.username.trim().length > 0 && body.username.trim().length <= 100 &&
        (body.email === undefined || body.email === '' || (typeof body.email === 'string' && body.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)));

    app.get('/auth/me', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const account = await resolve(req.headers);
            if (account) {
                const token = tokenFrom(req.headers);
                const renewed = await storage.renewAccountSession(tokenHash(token), new Date(Date.now() + sessionDays * 86400000));
                if (!renewed) {
                    res.clearCookie(sessionCookie, cookieOptions(req));
                    res.json({ account: null, rooms: [] });
                    return;
                }
                res.cookie(sessionCookie, token, { ...cookieOptions(req), maxAge: sessionDays * 86400000 });
            }
            res.json({ account: account ? publicAccount(account) : null, rooms: account ? await storage.getAccountRooms(account.id) : [] });
        } catch { res.status(503).json({ error: 'Account service unavailable. Try again.' }); }
    });

    app.post('/auth/register', route(async (req, res) => {
        const body = req.body || {};
        if (limited(req)) { res.status(429).json({ error: 'Too many attempts. Try again later.' }); return; }
        if (typeof body.login !== 'string' || !/^[a-zA-Z0-9_]{3,32}$/.test(body.login) || !validPassword(body.password) || !validProfile(body)) {
            res.status(400).json({ error: 'Use a 3-32 character login name, a display name, and a password of 12-256 characters. Email is optional.' });
            return;
        }
        hashing++;
        let hash;
        try { hash = await hashPassword(body.password); } finally { hashing--; }
        const account = await storage.createAccount({ id: `account:${randomUUID()}`, login: body.login.toLowerCase(),
            username: body.username.trim(), email: body.email?.trim() || null, passwordHash: hash });
        await startSession(req, res, account);
    }));

    app.post('/auth/login', route(async (req, res) => {
        const { login, password } = req.body || {};
        if (limited(req)) { res.status(429).json({ error: 'Too many attempts. Try again later.' }); return; }
        if (typeof login !== 'string' || login.length > 32 || typeof password !== 'string' || password.length > 256) {
            res.status(400).json({ error: 'Enter your login name and password.' }); return;
        }
        const account = await storage.getAccountByLogin(login.toLowerCase());
        if (hashing >= 4) { res.status(429).json({ error: 'Too many attempts. Try again later.' }); return; }
        hashing++;
        let verified = false;
        try {
            if (account) verified = await verifyPassword(password, account.password_hash);
            else await hashPassword(password, '0'.repeat(32));
        } finally { hashing--; }
        if (!verified) { res.status(401).json({ error: 'Incorrect login name or password.' }); return; }
        await startSession(req, res, account);
    }));

    app.post('/auth/logout', route(async (req, res) => {
        await endSession(req.headers);
        res.clearCookie(sessionCookie, cookieOptions(req));
        res.json({ account: null });
    }));

    app.post('/auth/profile', route(async (req, res) => {
        const account = await resolve(req.headers);
        if (!account) { res.status(401).json({ error: 'Log in to update your account.' }); return; }
        if (!validProfile(req.body || {})) { res.status(400).json({ error: 'Enter a display name and a valid optional email.' }); return; }
        const updated = await storage.updateAccount(account.id, req.body.username.trim(), req.body.email?.trim() || null);
        for (const socket of io.sockets.sockets.values()) {
            if (socket.data.account?.id === account.id) socket.disconnect(true);
        }
        res.json({ account: publicAccount(updated) });
    }));

    io.use(async (socket, next) => {
        try {
            const requestedId = socket.handshake.auth?.userId;
            const requestsAccount = typeof requestedId === 'string' && requestedId.startsWith('account:');
            const account = requestsAccount ? await resolve(socket.handshake.headers) : null;
            if (requestsAccount && (!account || account.id !== requestedId)) {
                next(new Error('Log in to use this account.')); return;
            }
            socket.data.account = account ? publicAccount(account) : null;
            if (account) {
                socket.data.sessionHash = tokenHash(tokenFrom(socket.handshake.headers));
                socket.use(async (packet, proceed) => {
                    try {
                        const current = await resolve(socket.handshake.headers);
                        if (!current || current.id !== account.id) { socket.disconnect(true); return; }
                        proceed();
                    } catch { proceed(new Error('Account session unavailable')); }
                });
            }
            next();
        } catch { next(new Error('Account session unavailable')); }
    });
    return { resolve };
};

module.exports = { hashPassword, verifyPassword, registerAccounts };