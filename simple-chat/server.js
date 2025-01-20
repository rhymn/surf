const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { saveMessage, getMessages } = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

// const verbs = [
//     'ask', 'buy', 'cook', 'dance', 'eat', 'fly', 'give', 'help', 'invite', 'jump', 'kick', 'laugh', 'move', 'notice', 'open', 'play', 'quit', 'read', 'sing', 'talk', 'use', 'visit', 'walk', 'x-ray', 'yawn', 'zip',
//     'admire', 'build', 'create', 'draw', 'enjoy', 'fix', 'grow', 'hope', 'imagine', 'join', 'know', 'learn', 'make', 'need', 'observe', 'paint', 'question', 'run', 'smile', 'think', 'understand', 'value', 'write', 'xerox', 'yell', 'zoom',
//     'arrange', 'bake', 'clean', 'discover', 'explore', 'find', 'gather', 'hear', 'identify', 'jump', 'keep', 'listen', 'measure', 'notice', 'organize', 'plan', 'quote', 'record', 'share', 'travel', 'use', 'view', 'watch', 'x-ray', 'yawn', 'zip'
// ]

// const nouns = [
//     'Apple', 'Banana', 'Carrot', 'Dog', 'Elephant', 'Flower', 'Giraffe', 'House', 'Iceberg', 'Jacket', 'Kite', 'Lion', 'Monkey', 'Notebook', 'Orange', 'Pencil', 'Queen', 'Rabbit', 'Sun', 'Tree', 'Umbrella', 'Violin', 'Watch', 'Xylophone', 'Yacht', 'Zebra',
//     'Ant', 'Ball', 'Cat', 'Desk', 'Egg', 'Fish', 'Goat', 'Hat', 'Igloo', 'Juice', 'Kangaroo', 'Lamp', 'Mountain', 'Nest', 'Owl', 'Pizza', 'Quilt', 'Ring', 'Star', 'Table', 'Unicorn', 'Vase', 'Window', 'X-ray', 'Yogurt', 'Zoo',
//     'Airplane', 'Book', 'Chair', 'Door', 'Engine', 'Forest', 'Garden', 'Horse', 'Island', 'Jungle', 'Key', 'Leaf', 'Moon', 'Nose', 'Ocean', 'Piano', 'Quiver', 'Road', 'Stone', 'Telephone', 'Universe', 'Volcano', 'Whale', 'Xenon', 'Yard', 'Zipper'
// ];

// const adjectives = [
//     'angry', 'big', 'cold', 'dark', 'easy', 'fast', 'good', 'happy', 'important', 'jolly', 'kind', 'loud', 'modern', 'nice', 'old', 'pretty', 'quick', 'red', 'small', 'tall', 'ugly', 'vast', 'warm', 'young', 'zany',
//     'active', 'brave', 'calm', 'delightful', 'eager', 'fancy', 'gentle', 'honest', 'intelligent', 'joyful', 'keen', 'lazy', 'mysterious', 'nervous', 'obedient', 'proud', 'quiet', 'rich', 'strong', 'thoughtful', 'unique', 'victorious', 'witty', 'xenial', 'youthful', 'zealous',
//     'amazing', 'beautiful', 'charming', 'diligent', 'enthusiastic', 'friendly', 'graceful', 'humble', 'inventive', 'jovial', 'knowledgeable', 'lovely', 'magnificent', 'neat', 'optimistic', 'patient', 'quick-witted', 'reliable', 'sincere', 'trustworthy', 'understanding', 'vibrant', 'wise', 'xenodochial', 'yummy', 'zestful'
// ];

// const adverbs = [
//     'abruptly', 'boldly', 'carefully', 'diligently', 'eagerly', 'faithfully', 'gracefully', 'happily', 'immediately', 'jovially', 'kindly', 'lazily', 'merrily', 'nervously', 'obediently', 'patiently', 'quickly', 'rapidly', 'silently', 'thoughtfully', 'urgently', 'vividly', 'warmly', 'xenophobically', 'yearly', 'zealously',
//     'accidentally', 'briskly', 'cheerfully', 'deliberately', 'easily', 'fiercely', 'gently', 'honestly', 'innocently', 'jubilantly', 'knowingly', 'lightly', 'mysteriously', 'neatly', 'officially', 'promptly', 'quietly', 'recklessly', 'safely', 'tenderly', 'unexpectedly', 'vaguely', 'wildly', 'xeroxically', 'youthfully', 'zestfully',
//     'angrily', 'bravely', 'courageously', 'dramatically', 'enthusiastically', 'frankly', 'generously', 'hungrily', 'intelligently', 'joyfully', 'keenly', 'loudly', 'mournfully', 'naturally', 'openly', 'politely', 'quick-wittedly', 'reluctantly', 'sharply', 'triumphantly', 'unbelievably', 'victoriously', 'wisely', 'xenogenetically', 'yawningly', 'zealously'
// ];

// const getRandomName = () => {
//     const verb = verbs[Math.floor(Math.random() * verbs.length)];
//     const noun = nouns[Math.floor(Math.random() * nouns.length)];
//     const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
//     const adverb = adverbs[Math.floor(Math.random() * adverbs.length)];
//     return `${verb}-${adjective}-${noun}-${adverb}`;
// }

// console.log(getRandomName());

app.use(express.static('public'));

app.get('/random', (req, res) => {
    // Redirect to a new random room/group
    const groupName = Math.random().toString(36).substring(5);
    res.redirect(`/${groupName}`);
});

const isRealGroupName = (groupName) => {
    return /^[a-z0-9]+$/.test(groupName);
}

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