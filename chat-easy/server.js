const pgp = require('pg-promise')();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

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

// Function to generate a random position within the virtual area
function getRandomPosition() {
    return {
        x: Math.random() * virtualWidth,
        y: Math.random() * virtualHeight
    };
}

// Generate random positions for trees
const virtualWidth = 3000; // Virtual area width
const virtualHeight = 3000; // Virtual area height
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
const monsters = [];
for (let i = 0; i < numMonsters; i++) {
    monsters.push({
        x: Math.random() * virtualWidth,
        y: Math.random() * virtualHeight
    });
}

app.use(express.static('public'));

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected');
    const userColor = getRandomColor();
    const startPosition = getRandomPosition();
    socket.emit('assignColor', userColor);
    socket.emit('initializeTrees', trees);
    socket.emit('initializeMonsters', monsters);
    socket.emit('setVirtualDimensions', { virtualWidth, virtualHeight });
    socket.emit('setStartPosition', startPosition);

    socket.on('sendCoordinates', async (data) => {
        // console.log('Coordinates received:', data);

        // Update coordinates in the database
        // await updateCoordinatesInDatabase(data.x, data.y);

        // Broadcast the coordinates and color to all connected clients
        socket.broadcast.emit('updateCoordinates', { id: socket.id, x: data.x, y: data.y, color: data.color });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
        socket.broadcast.emit('removeUser', socket.id);
    });
});

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});