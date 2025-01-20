const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { saveMessage, getMessages } = require('./db');
const bodyParser = require('body-parser')

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(bodyParser.json());

app.get('/random', (req, res) => {
    // Redirect to a new random room/group
    const groupName = Math.random().toString(36).substring(5);
    res.redirect(`/${groupName}`);
});

const isRealGroupName = (groupName) => {
    return /^[a-z0-9]+$/.test(groupName);
}

app.post('/invite', (req, res) => {    
    const emails = req.body.emails;
    console.log('Inviting friends:', emails);
    res.send('Invitation sent');
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
    const path = socket.handshake.headers.referer;
    const room = path.split('/').pop() || 'default';
    socket.join(room);
    console.log(`User joined room: ${room}`);

    // Fetch and send previous messages to the new user
    getMessages(room).then(messages => {
        socket.emit('previousMessages', messages);
    }).catch(error => {
        console.error('Error fetching messages:', error);
    });

    // Handle new user
    socket.on('newUser', (userName) => {
        users[socket.id] = userName;
        // io.to(room).emit('message', `${userName} joined the chat`);
    });

    // Handle chat messages
    socket.on('message', (msg) => {
        const {username, message} = msg;
        console.log(`Message received from ${username}: ${message}`);
        io.to(room).emit('message', msg);
        saveMessage(room, username, message).catch(error => {
            console.error('Error saving message:', error);
        });
    });

    socket.on('disconnect', () => {
        const username = users[socket.id];
        delete users[socket.id];
        // io.to(room).emit('message', `${username} left the chat`);
        console.log('A user disconnected');
    });
});

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});