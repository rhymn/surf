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

module.exports = {
    saveMessage,
    deleteMessage,
    editMessage,
    getMessages
};
