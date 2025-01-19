const pgp = require('pg-promise')();
const databaseUrl = process.env.DATABASE_URL || 'postgresql://private_il06_user:XmeLpBF41nXXiB6SQeEiXehcrOTlzVRq@dpg-cu6en456l47c73c0fr6g-a.frankfurt-postgres.render.com/private_il06' + '?ssl=true';
const db = pgp(databaseUrl);

// Create messages table if it doesn't exist
db.none(`
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room TEXT NOT NULL,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
`).then(console.log('Messages table created'))
.catch(error => {
    console.error('Error creating messages table:', error);
});

function saveMessage(room, username, message) {
    return db.none('INSERT INTO messages(room, username, message) VALUES($1, $2, $3)', [room, username, message]);
}

function getMessages(room) {
    return db.any('SELECT * FROM messages WHERE room = $1 ORDER BY timestamp ASC', [room]);
}

module.exports = {
    saveMessage,
    getMessages
};
