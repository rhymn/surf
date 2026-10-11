const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { saveMessage, getMessages, deleteMessage, editMessage, getRoomTitle, setRoomTitle, reserveRoom, saveParticipant, getChatSummaries } = require('./db');
const { randomInt } = require('node:crypto');
const { registerAudioSignaling } = require('./audio-signaling');
const bodyParser = require('body-parser')

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

app.use(express.static('public', { index: false }));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home.html');
});

app.get('/index.html', (req, res) => res.redirect('/'));

const iceServers = (() => {
    try {
        const configured = JSON.parse(process.env.RTC_ICE_SERVERS || 'null');
        if (Array.isArray(configured) && configured.length > 0) return configured;
    } catch {
        console.warn('Ignoring invalid RTC_ICE_SERVERS configuration.');
    }
    return [{ urls: 'stun:stun.l.google.com:19302' }];
})();

app.get('/rtc-config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ iceServers });
});

app.get('/icons.js', (req, res) => {
    res.sendFile(require.resolve('lucide/dist/umd/lucide.js'));
});

app.get('/random', async (req, res) => {
    try {
        for (let attempt = 0; attempt < 20; attempt++) {
            const groupName = randomInt(36 ** 4).toString(36).padStart(4, '0');
            if (io.sockets.adapter.rooms.has(`chat:${groupName}`)) continue;
            if (await reserveRoom(groupName)) {
                res.redirect(`/${groupName}`);
                return;
            }
        }
        res.status(503).send('Unable to create a new room. Try again.');
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(503).send('Unable to create a new room. Try again.');
    }
});

const isRealGroupName = (groupName) => {
    return /^[a-z0-9]+$/.test(groupName);
}

app.post('/invite', (req, res) => {    
    const emails = req.body.emails;
    console.log('Inviting friends:', emails);
    res.send('Invitation sent');
});

app.post('/chats', async (req, res) => {
    const rooms = req.body?.rooms;
    const userId = req.body?.userId || '';
    const readThrough = req.body?.readThrough || {};
    if (!Array.isArray(rooms) || rooms.length > 200 ||
        typeof userId !== 'string' || userId.length > 128 ||
        typeof readThrough !== 'object' || Array.isArray(readThrough) ||
        Object.values(readThrough).some(id => !Number.isSafeInteger(id) || id < 0) ||
        rooms.some(room => typeof room !== 'string' || room.length > 128 || !isRealGroupName(room))) {
        res.status(400).json({ error: 'Invalid chat list.' });
        return;
    }
    try {
        const chats = await getChatSummaries([...new Set(rooms)], userId, readThrough);
        for (const chat of chats) {
            const online = new Map();
            for (const peer of io.sockets.sockets.values()) {
                if (peer.data.chatRoom === `chat:${chat.room}` && users[peer.id] && peer.data.userId) {
                    online.set(peer.data.userId, users[peer.id]);
                }
            }
            const participants = new Map(chat.participants.map(participant => [participant.userId, { ...participant, online: false }]));
            for (const [userId, username] of online) participants.set(userId, { userId, username, online: true });
            chat.participants = Array.from(participants.values());
        }
        res.set('Cache-Control', 'no-store').json(chats);
    } catch (error) {
        console.error('Error fetching chat list:', error);
        res.status(503).json({ error: 'Unable to load chats. Try again.' });
    }
});

app.get('/:groupName', (req, res) => {
    if (!isRealGroupName(req.params.groupName)){
        console.log('not real group name');
        res.redirect('/random');
    }

    else{
        res.sendFile(__dirname + '/public/index.html');        
    }
});

// Store usernames
const users = {};

io.on('connection', (socket) => {
    console.log('A user connected');

    // Join a room based on the URL path
    const groupName = socket.handshake.auth?.room;
    if (!isRealGroupName(groupName || '')) {
        socket.disconnect(true);
        return;
    }
    const room = `chat:${groupName}`;
    const userId = socket.handshake.auth?.userId;
    socket.data.userId = userId;
    let typingTimer;
    let typing = false;
    let lastTypingBroadcast = 0;
    const stopTyping = () => {
        clearTimeout(typingTimer);
        if (!typing) return;
        typing = false;
        socket.to(room).emit('typing', { peerId: socket.id, userId, username: users[socket.id], active: false });
    };
    socket.on('typing', (active) => {
        if (typeof active !== 'boolean' || !users[socket.id] || !userId) return;
        if (!active) {
            stopTyping();
            return;
        }
        if (!typing || Date.now() - lastTypingBroadcast >= 1000) {
            socket.to(room).emit('typing', { peerId: socket.id, userId, username: users[socket.id], active: true });
            lastTypingBroadcast = Date.now();
        }
        typing = true;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(stopTyping, 5000);
    });
    socket.join(room);
    console.log(`User joined room: ${room}`);

    getRoomTitle(groupName).then(title => {
        socket.emit('roomTitle', { title });
    }).catch(error => {
        console.error('Error fetching room title:', error);
    });

    socket.on('setRoomTitle', async (title, reply) => {
        if (typeof reply !== 'function') return;
        if (typeof title !== 'string' || title.trim().length > 120) {
            reply({ error: 'Title must be 120 characters or fewer.' });
            return;
        }
        try {
            const saved = await setRoomTitle(groupName, title.trim());
            io.to(room).emit('roomTitle', saved);
            reply({});
        } catch (error) {
            console.error('Error saving room title:', error);
            reply({ error: 'Title could not be saved. Try again.' });
        }
    });

    // Fetch and send previous messages to the new user
    getMessages(groupName).then(messages => {
        socket.emit('previousMessages', messages);
    }).catch(error => {
        console.error('Error fetching messages:', error);
    });

    // Handle new user
    socket.on('newUser', (userName) => {
        if (typeof userName !== 'string' || !userName.trim() || userName.length > 100 ||
            typeof userId !== 'string' || !userId || userId.length > 128) return;
        users[socket.id] = userName;
        saveParticipant(groupName, userId, userName).catch(error => {
            console.error('Error saving participant:', error);
        });
        // io.to(room).emit('message', `${userName} joined the chat`);
    });

    // Handle chat messages
    socket.on('message', async (msg, reply) => {
        stopTyping();
        if (!msg || typeof msg.message !== 'string' || !msg.message.trim() ||
            typeof msg.username !== 'string' || typeof userId !== 'string' || !userId) {
            if (typeof reply === 'function') reply({ error: 'Unable to send this message. Reload and try again.' });
            return;
        }
        try {
            const saved = await saveMessage(groupName, msg.username, userId, msg.message);
            io.to(room).emit('message', saved);
            if (typeof reply === 'function') reply({});
        } catch (error) {
            console.error('Error saving message:', error);
            if (typeof reply === 'function') reply({ error: 'Message could not be saved. Try again.' });
        }
    });

    socket.on('deleteMessage', async (messageId, reply) => {
        if (typeof reply !== 'function') return;
        if (!Number.isSafeInteger(messageId) || messageId <= 0 || typeof userId !== 'string' || !userId) {
            reply({ error: 'Unable to delete this message.' });
            return;
        }
        try {
            const deleted = await deleteMessage(groupName, userId, messageId);
            if (!deleted) {
                reply({ error: 'Message not found or not yours.' });
                return;
            }
            io.to(room).emit('messageDeleted', { id: deleted.id });
            reply({});
        } catch (error) {
            console.error('Error deleting message:', error);
            reply({ error: 'Message could not be deleted. Try again.' });
        }
    });

    socket.on('editMessage', async (payload, reply) => {
        if (typeof reply !== 'function') return;
        const { id, message } = payload || {};
        if (!Number.isSafeInteger(id) || id <= 0 || typeof userId !== 'string' || !userId ||
            typeof message !== 'string' || !message.trim()) {
            reply({ error: 'Unable to edit this message. Text cannot be empty.' });
            return;
        }
        try {
            const edited = await editMessage(groupName, userId, id, message);
            if (!edited) {
                reply({ error: 'Message not found or not yours.' });
                return;
            }
            io.to(room).emit('messageEdited', edited);
            reply({});
        } catch (error) {
            console.error('Error editing message:', error);
            reply({ error: 'Message could not be edited. Try again.' });
        }
    });

    registerAudioSignaling(io, socket, room, users);

    socket.on('disconnect', () => {
        stopTyping();
        const username = users[socket.id];
        delete users[socket.id];
        // io.to(room).emit('message', `${username} left the chat`);
        console.log('A user disconnected');
    });
});

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});