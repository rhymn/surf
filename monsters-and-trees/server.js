const pgp = require('pg-promise')();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 4000;

// Database connection details
const db = pgp('postgres://username:password@localhost:5432/mydatabase');

// Function to update coordinates in the database
async function updateCoordinatesInDatabase(x, y) {
    try {
        await db.none('UPDATE coordinates SET x = $1, y = $2 WHERE id = 1', [x, y]);
        console.log('Coordinates updated in the database');
    } catch (error) {
        console.error('Error updating coordinates in the database:', error);
    }
}

// Function to generate a random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Function to generate a random position within the virtual area, integer
function getRandomPosition() {
    return {
        x: Math.floor(Math.random() * virtualWidth),
        y: Math.floor(Math.random() * virtualHeight)
    };
}

// Generate random positions for trees
const virtualWidth = 600; // Virtual area width
const virtualHeight = 600; // Virtual area height
const numTrees = 50;
const trees = [];
for (let i = 0; i < numTrees; i++) {
    trees.push({
        x: Math.random() * virtualWidth,
        y: Math.random() * virtualHeight
    });
}

// Generate random positions for monsters
const numMonsters = 20;
const monsters = {};
for (let i = 0; i < numMonsters; i++) {
    monsters[i] = {
        x: Math.random() * virtualWidth,
        y: Math.random() * virtualHeight
    };
}

let users = {};

app.use(express.static('public'));

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected');
    const userColor = getRandomColor();
    const startPosition = getRandomPosition();

    users[socket.id] = {
        id: socket.id,
        coordinates: startPosition,
        color: userColor,
        score: 0,
        l: 1
    };

    socket.emit('assignColor', userColor);
    socket.emit('initializeTrees', trees);
    socket.emit('initializeMonsters', monsters);
    socket.emit('setVirtualDimensions', { virtualWidth, virtualHeight });
    socket.emit('setStartPosition', startPosition);

    sendUsers(socket);

    socket.on('monsterEaten', async (monsterId) => {
        console.log('Monster eaten:', monsterId);
        io.emit('removeMonster', monsterId);

        if(users[socket.id]){
            users[socket.id].score += 1;
            // socket.emit('updateScore', users[socket.id].score);
        }
        sendUsers(socket);
    });

    socket.on('sendCoordinatesOfHead', async (data) => {
        // Update coordinates in the database
        // await updateCoordinatesInDatabase(data.x, data.y);
        socket.broadcast.emit('updateCoordinatesOfHead', {id: socket.id, coordinatesOfHead: {x: data.x, y: data.y, l: data.l} });

        if(users[socket.id]){
            users[socket.id].coordinates = {x: data.x, y: data.y};
            users[socket.id].l = data.l;
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
        // socket.broadcast.emit('removeUser', socket.id);

        if(users[socket.id]){
            delete users[socket.id];
        }
        sendUsers(socket);

    });
});

const sendUsers = (socket) => {
    console.log(users, `${Object.keys(users).length} users`)
    socket.broadcast.emit('updateUsers', users);
}

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});