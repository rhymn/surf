const pgp = require('pg-promise')();
const databaseUrl = process.env.DATABASE_URL || 'postgresql://private_il06_user:XmeLpBF41nXXiB6SQeEiXehcrOTlzVRq@dpg-cu6en456l47c73c0fr6g-a.frankfurt-postgres.render.com/private_il06' + '?ssl=true';
const db = pgp(databaseUrl);

function dropTable() {
    db.none('DROP TABLE messages')
    .then(console.log('Table dropped'))
    .catch(error => {
        console.error('Error dropping table:', error);
    });
}

// dropTable();

// Create messages table if it doesn't exist
const ready = db.none(`
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room TEXT NOT NULL,
        username TEXT NOT NULL,
        userid TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS chat_rooms (
        room TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS chat_participants (
        room TEXT NOT NULL,
        userid TEXT NOT NULL,
        username TEXT NOT NULL,
        PRIMARY KEY (room, userid)
    );
`);
ready.catch(error => {
    console.error('Error creating messages table:', error);
});


async function saveMessage(room, username, userId, message) {
    await ready;
    return db.one('INSERT INTO messages(room, username, userid, message) VALUES($1, $2, $3, $4) RETURNING *', [room, username, userId, message]);
}

async function deleteMessage(room, userId, messageId) {
    await ready;
    return db.oneOrNone('UPDATE messages SET message = \'\', removed = TRUE WHERE id = $1 AND room = $2 AND userid = $3 AND removed = FALSE RETURNING id', [messageId, room, userId]);
}

async function editMessage(room, userId, messageId, message) {
    await ready;
    return db.oneOrNone('UPDATE messages SET message = $4, edited = TRUE WHERE id = $1 AND room = $2 AND userid = $3 AND removed = FALSE RETURNING *', [messageId, room, userId, message]);
}

async function getMessages(room) {
    await ready;
    return db.any('SELECT * FROM messages WHERE room = $1 ORDER BY timestamp ASC', [room]);
}

async function getRoomTitle(room) {
    await ready;
    const saved = await db.oneOrNone('SELECT title FROM chat_rooms WHERE room = $1', [room]);
    return saved?.title || '';
}

async function setRoomTitle(room, title) {
    await ready;
    return db.one('INSERT INTO chat_rooms(room, title) VALUES($1, $2) ON CONFLICT (room) DO UPDATE SET title = EXCLUDED.title RETURNING title', [room, title]);
}

async function reserveRoom(room) {
    await ready;
    return db.oneOrNone('INSERT INTO chat_rooms(room) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM messages WHERE room = $1) ON CONFLICT (room) DO NOTHING RETURNING room', [room]);
}

async function saveParticipant(room, userId, username) {
    await ready;
    return db.none('INSERT INTO chat_participants(room, userid, username) VALUES($1, $2, $3) ON CONFLICT (room, userid) DO UPDATE SET username = EXCLUDED.username', [room, userId, username]);
}

async function getChatSummaries(rooms, userId = '', readThrough = {}) {
    await ready;
    const titles = await db.any('SELECT room, title FROM chat_rooms WHERE room = ANY($1::text[])', [rooms]);
    const participants = await db.any(`
        SELECT DISTINCT ON (room, userid) room, userid, username FROM (
            SELECT room, userid, username, 0 AS priority, NULL::timestamptz AS timestamp
            FROM chat_participants WHERE room = ANY($1::text[])
            UNION ALL
            SELECT room, userid, username, 1 AS priority, timestamp
            FROM messages WHERE room = ANY($1::text[])
        ) AS participants ORDER BY room, userid, priority, timestamp DESC
    `, [rooms]);
    const counts = await db.any('SELECT room, COUNT(*)::integer AS message_count FROM messages WHERE room = ANY($1::text[]) AND removed = FALSE GROUP BY room', [rooms]);
    const unread = await db.any(`
        SELECT messages.room, COUNT(*)::integer AS unread_count
        FROM messages JOIN unnest($1::text[], $3::bigint[]) AS cursors(room, last_read)
        ON messages.room = cursors.room
        WHERE messages.id > cursors.last_read AND messages.userid <> $2 AND messages.removed = FALSE
        GROUP BY messages.room
    `, [rooms, userId, rooms.map(room => readThrough[room] || 0)]);
    return rooms.map(room => ({
        room,
        title: titles.find(chat => chat.room === room)?.title || '',
        messageCount: counts.find(chat => chat.room === room)?.message_count || 0,
        unreadCount: unread.find(chat => chat.room === room)?.unread_count || 0,
        participants: participants.filter(participant => participant.room === room)
            .map(({ userid, username }) => ({ userId: userid, username }))
    }));
}

module.exports = {
    saveMessage,
    deleteMessage,
    editMessage,
    getMessages,
    getRoomTitle,
    setRoomTitle,
    reserveRoom,
    saveParticipant,
    getChatSummaries
};
