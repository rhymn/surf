const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/:groupName', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
    // res.send(`Welcome to group: ${req.params.groupName}`);
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

    // Handle new user
    socket.on('newUser', (userName) => {
        users[socket.id] = userName;
        io.to(room).emit('message', `${userName} joined the chat`);
    });

    // Handle chat messages
    socket.on('message', (msg) => {
        console.log(`Message received: ${msg}`);
        io.to(room).emit('message', msg);
    });

    socket.on('disconnect', () => {
        const userName = users[socket.id];
        delete users[socket.id];
        io.to(room).emit('message', `${userName} left the chat`);
        console.log('A user disconnected');
    });
});

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});