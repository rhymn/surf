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

const getRandomPosition = (virtualWidth, virtualHeight) => {
    return {
        x: Math.floor(Math.random() * virtualWidth),
        y: Math.floor(Math.random() * virtualHeight)
    };
}

// Generate random positions for monsters
const numMonsters = 20;
const monsters = {};
for (let i = 0; i < numMonsters; i++) {
    monsters[i] = getRandomPosition(virtualWidth, virtualHeight);
}

let users = {};

app.use(express.static('public'));

const addMonsters = (coordinates) => {
    const nextMonsterPos = Object.keys(monsters).length;

    for (let i = 0; i < coordinates.length; i++) {
        monsters[nextMonsterPos+i] = coordinates[i];
    }
}


// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected');
    const userColor = getRandomColor();
    const startPosition = getRandomPosition(virtualWidth, virtualHeight);

    users[socket.id] = {
        id: socket.id,
        coordinates: startPosition,
        color: userColor,
        score: 0,
        l: 1
    };

    console.log('monsters', Object.keys(monsters).length)

    socket.emit('assignColor', userColor);
    socket.emit('initializeTrees', trees);
    socket.emit('initializeMonsters', monsters);
    socket.emit('setVirtualDimensions', { virtualWidth, virtualHeight });
    socket.emit('setStartPosition', startPosition);

    sendUsers(socket);

    socket.on('iTurnedIntoMonsters', async ({coordinates}) => {
        console.log('We hit another snake');
        addMonsters(coordinates);
        io.emit('initializeMonsters', monsters);
    });

    socket.on('monsterEaten', async (monsterId) => {
        console.log('Monster eaten:', monsterId);
        io.emit('removeMonster', monsterId);

        delete monsters[monsterId];

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
    io.emit('updateUsers', users);
}

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});