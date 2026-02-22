const pgp = require('pg-promise')();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const SOCKET_EVENTS = require('./public/socket-events.js');
const {
    WORLD_OBJECT_TYPES,
    DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS
} = require('./public/world-object-definitions.js');

const DEFAULT_PORT = 4000;
const DATABASE_CONNECTION_URL = 'postgres://username:password@localhost:5432/mydatabase';
const UPDATE_COORDINATES_QUERY = 'UPDATE coordinates SET x = $1, y = $2 WHERE id = 1';
const HEX_COLOR_CHARS = '0123456789ABCDEF';
const HEX_BASE = 16;
const HEX_COLOR_LENGTH = 6;
const VIRTUAL_WIDTH = 1600;
const VIRTUAL_HEIGHT = 1600;
const MOVEMENT_BASE_STEP = 2;
const MOVEMENT_TICKS_PER_SECOND = 30;
const MOVEMENT_BOOST_MULTIPLIER = 2;
const RULE_BORDER_COLLISION_ENDS_GAME = true;
const RULE_PLAYER_COLLISION_ENDS_GAME = true;
const RULE_SNAKE_SEGMENT_SIZE = 6;
const RULE_SNAKE_HEAD_SIZE_MULTIPLIER = 2;
const RULE_PLAYER_COLLISION_SIZE = 6;
const DEFAULT_BOT_COUNT = 3;
const DEFAULT_BOT_MOVE_INTERVAL_MS = 200;
const DEFAULT_BOT_STEP = 4;
const DEFAULT_BOT_DIRECTION_CHANGE_CHANCE = 0.2;
const MAX_SPAWN_ATTEMPTS = 500;
const INITIAL_TREE_COUNT = 30;
const INITIAL_MONSTER_COUNT = 20;
const INITIAL_CLOUD_COUNT = 8;
const INITIAL_THORN_COUNT = 10;
const INITIAL_USER_SCORE = 0;
const INITIAL_USER_LENGTH = 100;
const PUBLIC_DIRECTORY = 'public';
const WORLD_OBJECT_TYPE_DEFINITIONS = JSON.parse(JSON.stringify(DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS));

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || DEFAULT_PORT;

const BOT_COUNT = Math.max(0, Number.parseInt(process.env.BOT_COUNT ?? `${DEFAULT_BOT_COUNT}`, 10));
const BOT_MOVE_INTERVAL_MS = Math.max(16, Number.parseInt(process.env.BOT_MOVE_INTERVAL_MS ?? `${DEFAULT_BOT_MOVE_INTERVAL_MS}`, 10));
const BOT_STEP = Math.max(1, Number.parseInt(process.env.BOT_STEP ?? `${DEFAULT_BOT_STEP}`, 10));
const BOT_DIRECTION_CHANGE_CHANCE = Math.min(
    1,
    Math.max(0, Number.parseFloat(process.env.BOT_DIRECTION_CHANGE_CHANCE ?? `${DEFAULT_BOT_DIRECTION_CHANGE_CHANCE}`))
);

const database = pgp(DATABASE_CONNECTION_URL);

async function updateCoordinatesInDatabase(x, y) {
    try {
        await database.none(UPDATE_COORDINATES_QUERY, [x, y]);
        console.log('Coordinates updated in the database');
    } catch (error) {
        console.error('Error updating coordinates in the database:', error);
    }
}

function getRandomColor() {
    let color = '#';
    for (let i = 0; i < HEX_COLOR_LENGTH; i++) {
        color += HEX_COLOR_CHARS[Math.floor(Math.random() * HEX_BASE)];
    }
    return color;
}


const boardWidth = VIRTUAL_WIDTH;
const boardHeight = VIRTUAL_HEIGHT;

const getRandomPosition = (width, height, size = RULE_SNAKE_SEGMENT_SIZE) => {
    const maxX = Math.max(0, width - size);
    const maxY = Math.max(0, height - size);
    return {
        x: Math.floor(Math.random() * (maxX + 1)),
        y: Math.floor(Math.random() * (maxY + 1))
    };
}

const rectanglesOverlap = (firstRect, secondRect) => {
    return (
        firstRect.x < secondRect.x + secondRect.width &&
        firstRect.x + firstRect.width > secondRect.x &&
        firstRect.y < secondRect.y + secondRect.height &&
        firstRect.y + firstRect.height > secondRect.y
    );
};

const getCollisionInsetForObject = (worldObject) => {
    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject.type];
    if (!objectDefinition) {
        return 0;
    }

    const maxInset = Math.max(0, Math.floor((objectDefinition.size - 1) / 2));
    return Math.max(0, Math.min(objectDefinition.collisionInset, maxInset));
};

const getWorldObjectRect = (worldObject, padding = 0) => {
    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject.type];
    const collisionInset = getCollisionInsetForObject(worldObject);
    const insetSize = objectDefinition.size - collisionInset * 2;

    return {
        x: worldObject.x + collisionInset - padding,
        y: worldObject.y + collisionInset - padding,
        width: insetSize + padding * 2,
        height: insetSize + padding * 2
    };
};

let worldObjects = {};
let nextWorldObjectId = 1;

const addWorldObject = (type, position) => {
    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[type];
    if (!objectDefinition) {
        return null;
    }

    const worldObjectId = `${type}-${nextWorldObjectId}`;
    nextWorldObjectId += 1;

    const objectPosition = position ?? getRandomPosition(boardWidth, boardHeight, objectDefinition.size);
    worldObjects[worldObjectId] = {
        id: worldObjectId,
        type,
        x: objectPosition.x,
        y: objectPosition.y
    };

    return worldObjects[worldObjectId];
};

const collidesWithBlockingObject = (position, padding = 0) => {
    const snakeRect = {
        x: position.x - padding,
        y: position.y - padding,
        width: RULE_SNAKE_SEGMENT_SIZE + padding * 2,
        height: RULE_SNAKE_SEGMENT_SIZE + padding * 2
    };

    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject.type];

        if (!objectDefinition.blocksSpawn) {
            continue;
        }

        const worldObjectRect = getWorldObjectRect(worldObject, objectDefinition.spawnPadding);
        if (rectanglesOverlap(snakeRect, worldObjectRect)) {
            return true;
        }
    }

    return false;
};

const getSafeStartPosition = (width, height) => {
    const maxX = Math.max(0, width - RULE_SNAKE_SEGMENT_SIZE);
    const maxY = Math.max(0, height - RULE_SNAKE_SEGMENT_SIZE);

    for (let i = 0; i < MAX_SPAWN_ATTEMPTS; i++) {
        const candidate = {
            x: Math.floor(Math.random() * (maxX + 1)),
            y: Math.floor(Math.random() * (maxY + 1))
        };

        if (!collidesWithBlockingObject(candidate)) {
            return candidate;
        }
    }

    const scanStep = Math.max(1, RULE_SNAKE_SEGMENT_SIZE);
    for (let y = 0; y <= maxY; y += scanStep) {
        for (let x = 0; x <= maxX; x += scanStep) {
            const candidate = { x, y };
            if (!collidesWithBlockingObject(candidate)) {
                return candidate;
            }
        }
    }

    return { x: 0, y: 0 };
};

for (let i = 0; i < INITIAL_TREE_COUNT; i++) {
    addWorldObject(WORLD_OBJECT_TYPES.TREE);
}

for (let i = 0; i < INITIAL_MONSTER_COUNT; i++) {
    addWorldObject(WORLD_OBJECT_TYPES.MONSTER);
}

for (let i = 0; i < INITIAL_CLOUD_COUNT; i++) {
    addWorldObject(WORLD_OBJECT_TYPES.CLOUD);
}

for (let i = 0; i < INITIAL_THORN_COUNT; i++) {
    addWorldObject(WORLD_OBJECT_TYPES.THORN);
}

let connectedUsers = {};
let botStateById = {};

app.use(express.static(PUBLIC_DIRECTORY));

const appendMonsterCoordinates = (coordinatesList) => {
    for (let i = 0; i < coordinatesList.length; i++) {
        addWorldObject(WORLD_OBJECT_TYPES.MONSTER, coordinatesList[i]);
    }
}

const BOT_DIRECTIONS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
];

const getRandomBotDirection = () => {
    const directionIndex = Math.floor(Math.random() * BOT_DIRECTIONS.length);
    return BOT_DIRECTIONS[directionIndex];
};

const clampPosition = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
};

const getSnakeHitbox = (position) => {
    return {
        x: position.x,
        y: position.y,
        width: RULE_SNAKE_SEGMENT_SIZE,
        height: RULE_SNAKE_SEGMENT_SIZE
    };
};

const getCollidedWorldObjectId = (position) => {
    const snakeHitbox = getSnakeHitbox(position);

    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        const worldObjectRect = getWorldObjectRect(worldObject);
        if (rectanglesOverlap(snakeHitbox, worldObjectRect)) {
            return worldObjectId;
        }
    }

    return null;
};

const resetBotUser = (botId) => {
    const botUser = connectedUsers[botId];
    const botState = botStateById[botId];
    if (!botUser || !botState) {
        return;
    }

    botUser.coordinates = getSafeStartPosition(boardWidth, boardHeight);
    botUser.score = INITIAL_USER_SCORE;
    botUser.l = INITIAL_USER_LENGTH;
    botState.direction = getRandomBotDirection();
};

const applyWorldObjectHitForBot = (botId, worldObjectId) => {
    const botUser = connectedUsers[botId];
    const worldObject = worldObjects[worldObjectId];
    if (!botUser || !worldObject) {
        return { usersChanged: false, worldObjectsChanged: false };
    }

    const worldObjectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject.type];
    if (!worldObjectDefinition) {
        return { usersChanged: false, worldObjectsChanged: false };
    }

    if (worldObjectDefinition.effects.instantLose) {
        resetBotUser(botId);
        return { usersChanged: true, worldObjectsChanged: false };
    }

    botUser.score += worldObjectDefinition.effects.scoreDelta;
    botUser.l += worldObjectDefinition.effects.growthDelta;

    if (worldObjectDefinition.removeOnHit) {
        delete worldObjects[worldObjectId];
        return { usersChanged: true, worldObjectsChanged: true };
    }

    return { usersChanged: true, worldObjectsChanged: false };
};

const botCollidesWithAnotherPlayer = (botId, botPosition) => {
    for (const userId in connectedUsers) {
        if (userId === botId) {
            continue;
        }

        const otherUser = connectedUsers[userId];
        if (!otherUser) {
            continue;
        }

        if (
            botPosition.x >= otherUser.coordinates.x &&
            botPosition.x <= otherUser.coordinates.x + RULE_PLAYER_COLLISION_SIZE &&
            botPosition.y >= otherUser.coordinates.y &&
            botPosition.y <= otherUser.coordinates.y + RULE_PLAYER_COLLISION_SIZE
        ) {
            return true;
        }
    }

    return false;
};

const initializeBots = () => {
    for (let index = 0; index < BOT_COUNT; index++) {
        const botId = `bot-${index + 1}`;
        const startPosition = getSafeStartPosition(boardWidth, boardHeight);

        connectedUsers[botId] = {
            id: botId,
            coordinates: startPosition,
            color: getRandomColor(),
            score: INITIAL_USER_SCORE,
            l: INITIAL_USER_LENGTH
        };

        botStateById[botId] = {
            direction: getRandomBotDirection()
        };
    }
};

const updateBotPositions = () => {
    let usersChanged = false;
    let worldObjectsChanged = false;
    const maxX = Math.max(0, boardWidth - RULE_SNAKE_SEGMENT_SIZE);
    const maxY = Math.max(0, boardHeight - RULE_SNAKE_SEGMENT_SIZE);

    for (const botId in botStateById) {
        const botUser = connectedUsers[botId];
        const botState = botStateById[botId];

        if (!botUser || !botState) {
            continue;
        }

        if (Math.random() < BOT_DIRECTION_CHANGE_CHANCE) {
            botState.direction = getRandomBotDirection();
        }

        const currentPosition = botUser.coordinates;
        const candidatePosition = {
            x: currentPosition.x + botState.direction.x * BOT_STEP,
            y: currentPosition.y + botState.direction.y * BOT_STEP
        };

        const outOfBounds =
            candidatePosition.x < 0 ||
            candidatePosition.x > maxX ||
            candidatePosition.y < 0 ||
            candidatePosition.y > maxY;

        if (outOfBounds) {
            let foundAlternative = false;

            for (let attempt = 0; attempt < BOT_DIRECTIONS.length; attempt++) {
                const alternateDirection = getRandomBotDirection();
                const alternatePosition = {
                    x: currentPosition.x + alternateDirection.x * BOT_STEP,
                    y: currentPosition.y + alternateDirection.y * BOT_STEP
                };

                const alternateOutOfBounds =
                    alternatePosition.x < 0 ||
                    alternatePosition.x > maxX ||
                    alternatePosition.y < 0 ||
                    alternatePosition.y > maxY;

                if (!alternateOutOfBounds) {
                    botState.direction = alternateDirection;
                    botUser.coordinates = alternatePosition;
                    usersChanged = true;
                    foundAlternative = true;
                    break;
                }
            }

            if (!foundAlternative) {
                botUser.coordinates = {
                    x: clampPosition(currentPosition.x, 0, maxX),
                    y: clampPosition(currentPosition.y, 0, maxY)
                };
            }

            if (botCollidesWithAnotherPlayer(botId, botUser.coordinates)) {
                resetBotUser(botId);
                usersChanged = true;
            }

            const collidedWorldObjectId = getCollidedWorldObjectId(botUser.coordinates);
            if (collidedWorldObjectId) {
                const result = applyWorldObjectHitForBot(botId, collidedWorldObjectId);
                usersChanged = usersChanged || result.usersChanged;
                worldObjectsChanged = worldObjectsChanged || result.worldObjectsChanged;
            }

            continue;
        }

        botUser.coordinates = {
            x: clampPosition(candidatePosition.x, 0, maxX),
            y: clampPosition(candidatePosition.y, 0, maxY)
        };
        usersChanged = true;

        if (botCollidesWithAnotherPlayer(botId, botUser.coordinates)) {
            resetBotUser(botId);
            usersChanged = true;
            continue;
        }

        const collidedWorldObjectId = getCollidedWorldObjectId(botUser.coordinates);
        if (collidedWorldObjectId) {
            const result = applyWorldObjectHitForBot(botId, collidedWorldObjectId);
            usersChanged = usersChanged || result.usersChanged;
            worldObjectsChanged = worldObjectsChanged || result.worldObjectsChanged;
        }
    }

    if (worldObjectsChanged) {
        broadcastWorldObjects();
    }

    if (usersChanged) {
        broadcastUsers();
    }
};

const getWorldObjectDefinitionsForClient = () => {
    const worldObjectDefinitions = {};

    for (const type in WORLD_OBJECT_TYPE_DEFINITIONS) {
        const typeDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[type];
        worldObjectDefinitions[type] = {
            size: typeDefinition.size,
            collisionInset: typeDefinition.collisionInset,
            removeOnHit: typeDefinition.removeOnHit,
            effects: {
                instantLose: typeDefinition.effects.instantLose,
                growthDelta: typeDefinition.effects.growthDelta,
                scoreDelta: typeDefinition.effects.scoreDelta
            }
        };
    }

    return worldObjectDefinitions;
};

const broadcastWorldObjects = () => {
    io.emit(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, worldObjects);
};


io.on('connection', (socket) => {
    console.log('A user connected');
    const userColor = getRandomColor();
    const startPosition = getSafeStartPosition(boardWidth, boardHeight);

    connectedUsers[socket.id] = {
        id: socket.id,
        coordinates: startPosition,
        color: userColor,
        score: INITIAL_USER_SCORE,
        l: INITIAL_USER_LENGTH
    };

    console.log('world objects', Object.keys(worldObjects).length)

    socket.emit(SOCKET_EVENTS.ASSIGN_COLOR, userColor);
    socket.emit(SOCKET_EVENTS.SET_WORLD_OBJECT_DEFINITIONS, getWorldObjectDefinitionsForClient());
    socket.emit(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, worldObjects);
    socket.emit(SOCKET_EVENTS.SET_MOVEMENT_CONFIG, {
        baseStep: MOVEMENT_BASE_STEP,
        ticksPerSecond: MOVEMENT_TICKS_PER_SECOND,
        boostMultiplier: MOVEMENT_BOOST_MULTIPLIER
    });
    socket.emit(SOCKET_EVENTS.SET_GAME_RULES, {
        borderCollisionEndsGame: RULE_BORDER_COLLISION_ENDS_GAME,
        playerCollisionEndsGame: RULE_PLAYER_COLLISION_ENDS_GAME,
        snakeSegmentSize: RULE_SNAKE_SEGMENT_SIZE,
        snakeHeadSizeMultiplier: RULE_SNAKE_HEAD_SIZE_MULTIPLIER,
        playerCollisionSize: RULE_PLAYER_COLLISION_SIZE,
        worldObjectsEnabled: true
    });
    socket.emit(SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, { virtualWidth: boardWidth, virtualHeight: boardHeight });
    socket.emit(SOCKET_EVENTS.SET_START_POSITION, startPosition);

    broadcastUsers();

    socket.on(SOCKET_EVENTS.TURNED_INTO_MONSTERS, ({coordinates}) => {
        console.log('We hit another snake');
        appendMonsterCoordinates(coordinates);
        broadcastWorldObjects();
    });

    socket.on(SOCKET_EVENTS.WORLD_OBJECT_HIT, (worldObjectId) => {
        const worldObject = worldObjects[worldObjectId];
        if (!worldObject) {
            return;
        }

        const worldObjectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject.type];
        if (!worldObjectDefinition) {
            return;
        }

        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].score += worldObjectDefinition.effects.scoreDelta;
        }

        if (worldObjectDefinition.removeOnHit) {
            delete worldObjects[worldObjectId];
            broadcastWorldObjects();
        }

        broadcastUsers();
    });

    socket.on(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, (headUpdate) => {
        socket.broadcast.emit(SOCKET_EVENTS.UPDATE_COORDINATES_OF_HEAD, {id: socket.id, coordinatesOfHead: {x: headUpdate.x, y: headUpdate.y, l: headUpdate.l} });

        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].coordinates = {x: headUpdate.x, y: headUpdate.y};
            connectedUsers[socket.id].l = headUpdate.l;
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');

        if (connectedUsers[socket.id]) {
            delete connectedUsers[socket.id];
        }
        broadcastUsers();

    });
});

const broadcastUsers = () => {
    io.emit(SOCKET_EVENTS.UPDATE_USERS, connectedUsers);
}

initializeBots();
setInterval(updateBotPositions, BOT_MOVE_INTERVAL_MS);

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});