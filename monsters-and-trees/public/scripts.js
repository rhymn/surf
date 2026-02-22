const socket = io();
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

const SPHERE_RADIUS = 12.5;
let boardWidth = 0;
let boardHeight = 0;

let movementDirection = null;
let isPaused = false;
let isGameOver = false;
let isBoostEnabled = false;

const DEFAULT_BASE_STEP = 2;
const DEFAULT_TICKS_PER_SECOND = 20;
const DEFAULT_BOOST_MULTIPLIER = 2;
let baseStep = DEFAULT_BASE_STEP;
let ticksPerSecond = DEFAULT_TICKS_PER_SECOND;
let boostMultiplier = DEFAULT_BOOST_MULTIPLIER;
let updateIntervalMs = 1000 / ticksPerSecond;
let hasMovementConfig = false;
const GAME_WORLD_OBJECT_TYPES = window.WORLD_OBJECT_TYPES;
const OBJECT_TYPE_TREE = GAME_WORLD_OBJECT_TYPES.TREE;
const OBJECT_TYPE_MONSTER = GAME_WORLD_OBJECT_TYPES.MONSTER;
const OBJECT_TYPE_CLOUD = GAME_WORLD_OBJECT_TYPES.CLOUD;
const OBJECT_TYPE_THORN = GAME_WORLD_OBJECT_TYPES.THORN;
let movementStep = baseStep;
let localSnakeColor = 'red';
const INITIAL_USER_LENGTH = 100;
const GAME_SOCKET_EVENTS = window.SOCKET_EVENTS;
let gameRules = {
    borderCollisionEndsGame: true,
    playerCollisionEndsGame: true,
    treeCollisionEndsGame: false,
    snakeSegmentSize: 10,
    snakeHeadSizeMultiplier: 2,
    playerCollisionSize: 10,
    worldObjectsEnabled: true
};

let worldObjectDefinitions = JSON.parse(JSON.stringify(window.DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS));

const rectanglesOverlap = (firstRect, secondRect) => {
    return (
        firstRect.x < secondRect.x + secondRect.width &&
        firstRect.x + firstRect.width > secondRect.x &&
        firstRect.y < secondRect.y + secondRect.height &&
        firstRect.y + firstRect.height > secondRect.y
    );
};

const treeSVG = 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <rect x="112" y="128" width="32" height="64" fill="#8B4513"/>
    <circle cx="128" cy="96" r="64" fill="#228B22"/>
</svg>
`);

const monsterSVG = 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" width="800px" height="800px" viewBox="0 0 281.25 281.25" id="svg2" version="1.1" xml:space="preserve">

        <defs id="defs4"/>

        <g id="layer1" transform="translate(7276.1064,-3697.2496)">

        <path d="m -7226.8666,3743.306 a 4.6875,4.6875 0 0 0 -4.6875,4.6875 v 25.5487 c -10.6602,19.6167 -15.338,42.3572 -13.2367,64.5886 2.0363,21.5425 10.4758,42.5851 24.8108,58.9911 21.256,24.327 54.1321,36.5952 86.1236,35.2167 21.655,-0.9332 42.9676,-7.8071 61.0859,-19.704 a 4.6875,4.6875 0 0 0 0.1941,-0.1557 4.6875,4.6875 0 0 0 0.3002,-0.2435 4.6875,4.6875 0 0 0 0.4322,-0.4321 4.6875,4.6875 0 0 0 0.249,-0.2985 4.6875,4.6875 0 0 0 0.3351,-0.5328 4.6875,4.6875 0 0 0 0.1721,-0.3168 4.6875,4.6875 0 0 0 0.2252,-0.6427 4.6875,4.6875 0 0 0 0.095,-0.3039 4.6875,4.6875 0 0 0 0.1081,-0.9668 4.6875,4.6875 0 0 0 0,-0.026 v -27.9382 a 4.6875,4.6875 0 0 0 -0.016,-0.3882 4.6875,4.6875 0 0 0 -0.8129,-2.265 4.6875,4.6875 0 0 0 -0.02,-0.029 4.6875,4.6875 0 0 0 -0.2344,-0.3058 c 7.5588,-3.6431 14.8522,-7.8355 21.8006,-12.5427 8.1183,-5.4999 15.7657,-11.6942 22.8296,-18.4955 a 4.6875,4.6875 0 0 0 0.3442,-0.3736 4.6875,4.6875 0 0 0 0.082,-0.1007 4.6875,4.6875 0 0 0 0.2875,-0.4028 4.6875,4.6875 0 0 0 0,-0.01 4.6875,4.6875 0 0 0 0.2546,-0.4615 4.6875,4.6875 0 0 0 0.035,-0.079 4.6875,4.6875 0 0 0 0.174,-0.4358 4.6875,4.6875 0 0 0 0.02,-0.055 4.6875,4.6875 0 0 0 0.1337,-0.4981 4.6875,4.6875 0 0 0 0.018,-0.095 4.6875,4.6875 0 0 0 0.06,-0.4303 4.6875,4.6875 0 0 0 0.01,-0.108 4.6875,4.6875 0 0 0 0.011,-0.4926 4.6875,4.6875 0 0 0 -0.01,-0.1062 4.6875,4.6875 0 0 0 -0.046,-0.4376 4.6875,4.6875 0 0 0 -0.013,-0.086 4.6875,4.6875 0 0 0 -0.1172,-0.5182 4.6875,4.6875 0 0 0 -0.013,-0.037 4.6875,4.6875 0 0 0 -0.1538,-0.4303 4.6875,4.6875 0 0 0 -0.049,-0.1154 4.6875,4.6875 0 0 0 -0.5182,-0.8917 4.6875,4.6875 0 0 0 -0.055,-0.073 4.6875,4.6875 0 0 0 -0.092,-0.1208 l -17.5195,-21.3062 a 4.6875,4.6875 0 0 0 -0.9173,-0.8276 4.6875,4.6875 0 0 0 -0.1282,-0.086 4.6875,4.6875 0 0 0 -2.1204,-0.7763 4.6875,4.6875 0 0 0 -0.071,0 4.6875,4.6875 0 0 0 -0.048,0 4.6875,4.6875 0 0 0 -2.2833,0.4229 4.6875,4.6875 0 0 0 -0.07,0.013 c -21.7175,10.3605 -46.8635,13.5995 -70.4974,9.0802 -28.7212,-5.4922 -55.1677,-22.664 -71.9532,-46.6077 v -32.3126 a 4.6875,4.6875 0 0 0 -0.015,-0.3864 4.6875,4.6875 0 0 0 0,-0.022 4.6875,4.6875 0 0 0 -0.02,-0.1519 4.6875,4.6875 0 0 0 -0.031,-0.2289 4.6875,4.6875 0 0 0 -0.035,-0.1703 4.6875,4.6875 0 0 0 -0.049,-0.2216 4.6875,4.6875 0 0 0 -0.048,-0.1629 4.6875,4.6875 0 0 0 -0.07,-0.2216 4.6875,4.6875 0 0 0 -0.059,-0.1483 4.6875,4.6875 0 0 0 -0.097,-0.2307 4.6875,4.6875 0 0 0 -0.059,-0.1227 4.6875,4.6875 0 0 0 -0.119,-0.227 4.6875,4.6875 0 0 0 -0.09,-0.1484 4.6875,4.6875 0 0 0 -0.1154,-0.1831 4.6875,4.6875 0 0 0 -0.1153,-0.1611 4.6875,4.6875 0 0 0 -0.1154,-0.152 4.6875,4.6875 0 0 0 -0.1227,-0.1446 4.6875,4.6875 0 0 0 -0.1629,-0.1776 4.6875,4.6875 0 0 0 -0.1117,-0.1117 4.6875,4.6875 0 0 0 -0.1557,-0.1429 4.6875,4.6875 0 0 0 -0.1519,-0.1281 4.6875,4.6875 0 0 0 -0.1575,-0.1209 4.6875,4.6875 0 0 0 -0.1703,-0.1227 4.6875,4.6875 0 0 0 -0.1575,-0.099 4.6875,4.6875 0 0 0 -0.1721,-0.1026 4.6875,4.6875 0 0 0 -0.1904,-0.099 4.6875,4.6875 0 0 0 -0.1648,-0.081 4.6875,4.6875 0 0 0 -0.1685,-0.07 4.6875,4.6875 0 0 0 -0.2215,-0.088 4.6875,4.6875 0 0 0 -0.1428,-0.044 4.6875,4.6875 0 0 0 -0.2124,-0.064 4.6875,4.6875 0 0 0 -0.2582,-0.057 4.6875,4.6875 0 0 0 -0.1319,-0.027 4.6875,4.6875 0 0 0 -0.3881,-0.051 4.6875,4.6875 0 0 0 -0.02,0 4.6875,4.6875 0 0 0 -0.3882,-0.016 z m 4.6875,9.375 h 20.4565 v 29.1339 a 4.6875,4.6875 0 0 0 0,0.01 c -0.6224,13.7605 1.9546,27.621 7.4963,40.232 11.7752,26.796 36.2044,46.2942 63.316,56.0321 16.2542,5.8381 33.6296,8.4441 50.8777,7.6758 v 20.3704 c -16.2225,10.1259 -35.1275,16.0172 -54.2303,16.8402 -29.3078,1.2629 -59.5436,-10.145 -78.6585,-32.0214 -12.915,-14.7809 -20.6773,-34.0147 -22.5384,-53.703 -1.9583,-20.7186 2.5399,-42.0823 12.6855,-60.2527 a 4.6875,4.6875 0 0 0 0.066,-0.152 4.6875,4.6875 0 0 0 0.1429,-0.3278 4.6875,4.6875 0 0 0 0.2069,-0.5914 4.6875,4.6875 0 0 0 0.084,-0.3845 4.6875,4.6875 0 0 0 0.068,-0.6024 4.6875,4.6875 0 0 0 0.026,-0.2271 z m 30.4065,43.4729 c 18.0126,20.4553 42.7903,34.8362 69.6185,39.9664 24.4351,4.6726 50.1752,1.7089 72.9346,-8.3057 l 12.4457,15.1374 c -5.7821,5.2771 -11.9416,10.1408 -18.4223,14.5312 -11.6111,7.8661 -24.2533,14.2208 -37.4908,18.8544 -11.9453,-0.6552 -23.8011,-3.0323 -35.0519,-7.0734 -25.0386,-8.9933 -47.386,-27.0461 -57.9034,-50.9802 -3.0869,-7.0246 -5.1467,-14.51 -6.1304,-22.1301 z" id="path5294" style="color:#000000;fill:#fba021;fill-opacity:1;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none"/>

        </g>

    </svg>
`);

let worldObjects = {};
const treeImage = new Image();
treeImage.src = treeSVG;
const monsterImage = new Image();
monsterImage.src = monsterSVG;

let snakeStates = {};
let localSocketId = null;
const initializeLocalSnake = () => {
    snakeStates.mySnake = {
        coordinates: [{ x: boardWidth / 2, y: boardHeight / 2 }],
        color: localSnakeColor,
        l: INITIAL_USER_LENGTH
    }
}

initializeLocalSnake();

const updateSnakeColor = (snakeId, color) => {
    if (snakeId === localSocketId) {
        return;
    }

    if (snakeStates[snakeId]) {
        snakeStates[snakeId].color = color;
    }
}

const upsertSnakeState = (snakeId, headCoordinates, length, score) => {
    if (snakeId === localSocketId) {
        return;
    }

    if (snakeId !== 'mySnake') {
        console.log('setting new coords')
    }

    if (!snakeStates[snakeId]) {
        snakeStates[snakeId] = {
            coordinates: [{
                x: headCoordinates.x,
                y: headCoordinates.y,
            }],
            color: 'black',
            l: INITIAL_USER_LENGTH,
            score: 0
        }
    }

    if (score) {
        snakeStates[snakeId].score = score;
    }

    if (length > 0) {
        snakeStates[snakeId].l = length;
    }

    snakeStates[snakeId].coordinates.unshift(headCoordinates);
    snakeStates[snakeId].coordinates.splice(snakeStates[snakeId].l);
}

const overlay = document.createElement('div');
overlay.style.position = 'absolute';
overlay.style.bottom = '10px';
overlay.style.right = '10px';
overlay.style.width = '200px';
overlay.style.height = 'auto';
overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
overlay.style.border = '1px solid black';
overlay.style.padding = '10px';
overlay.style.overflowY = 'auto';
document.body.appendChild(overlay);

function getConnectedSnakeCount() {
    return Object.keys(snakeStates).filter((key) => key !== 'mySnake' && key !== localSocketId).length
}

function getBotSnakeCount() {
    return Object.keys(snakeStates).filter((key) => key.startsWith('bot-')).length
}

function updateOverlay() {
    overlay.innerHTML = `<strong>Connected Users: ${getConnectedSnakeCount()} </strong><br>`;
    overlay.innerHTML += `<strong>Bots: ${getBotSnakeCount()} </strong><br>`;

    for (const id in snakeStates) {
        const snake = snakeStates[id];
        overlay.innerHTML += `<div style="color: ${snake.color};">

            (${snake.coordinates[0].x}, ${snake.coordinates[0].y}), ${snake.l} L
        </div>`;
    }

}

let lastHeadCoordinates = { x: 0, y: 0 };

function emitHeadCoordinates(x, y) {

    if (lastHeadCoordinates.x === x && lastHeadCoordinates.y === y) {
        return;
    }

    socket.emit(GAME_SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x, y, l: snakeStates.mySnake.l });
    lastHeadCoordinates = { x, y };
}

socket.on(GAME_SOCKET_EVENTS.CONNECT, () => localSocketId = socket.id);

socket.on(GAME_SOCKET_EVENTS.UPDATE_COORDINATES_OF_HEAD, (data) => {
    const { id, coordinatesOfHead } = data;
    upsertSnakeState(id, { x: coordinatesOfHead.x, y: coordinatesOfHead.y }, data.l, data.score);

    drawScene();
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.ASSIGN_COLOR, (color) => {
    localSnakeColor = color;
    console.log('Assigned color:', localSnakeColor);
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.SET_WORLD_OBJECT_DEFINITIONS, (objectDefinitions) => {
    worldObjectDefinitions = {
        ...worldObjectDefinitions,
        ...objectDefinitions
    };
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (nextWorldObjects) => {
    worldObjects = nextWorldObjects;
    drawScene();
});

const applyMovementConfig = ({ baseStep: configuredBaseStep, ticksPerSecond: configuredTicksPerSecond, boostMultiplier: configuredBoostMultiplier }) => {
    if (typeof configuredBaseStep === 'number' && configuredBaseStep > 0) {
        baseStep = configuredBaseStep;
    }

    if (typeof configuredTicksPerSecond === 'number' && configuredTicksPerSecond > 0) {
        ticksPerSecond = configuredTicksPerSecond;
    }

    if (typeof configuredBoostMultiplier === 'number' && configuredBoostMultiplier > 0) {
        boostMultiplier = configuredBoostMultiplier;
    }

    updateIntervalMs = 1000 / ticksPerSecond;
    movementStep = isBoostEnabled ? baseStep * boostMultiplier : baseStep;
    hasMovementConfig = true;

    if (!isPaused) {
        stop();
        start();
    }
};

socket.on(GAME_SOCKET_EVENTS.SET_MOVEMENT_CONFIG, (movementConfig) => {
    applyMovementConfig(movementConfig);
});

const applyGameRules = (rulesConfig) => {
    gameRules = {
        ...gameRules,
        ...rulesConfig
    };
};

socket.on(GAME_SOCKET_EVENTS.SET_GAME_RULES, (rulesConfig) => {
    applyGameRules(rulesConfig);
});

socket.on(GAME_SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, (data) => {
    boardWidth = data.virtualWidth;
    boardHeight = data.virtualHeight;
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.SET_START_POSITION, (position) => {
    snakeStates.mySnake.coordinates[0].x = position.x;
    snakeStates.mySnake.coordinates[0].y = position.y;
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_USERS, (users) => {
    console.log('updating users')
    for (const id in snakeStates) {
        if (id === 'mySnake') {
            continue;
        }

        if (!users[id]) {
            delete snakeStates[id];
        }
    }

    for (const id in users) {
        const user = users[id];

        upsertSnakeState(id, user.coordinates, user.l, user.score);
        updateSnakeColor(id, user.color);
    }

    updateOverlay();
});


function drawTrees() {
    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        if (worldObject.type !== OBJECT_TYPE_TREE) {
            continue;
        }

        const worldObjectDefinition = worldObjectDefinitions[worldObject.type];
        if (!worldObjectDefinition) {
            continue;
        }

        if (treeImage.complete) {
            ctx.drawImage(treeImage, worldObject.x, worldObject.y, worldObjectDefinition.size, worldObjectDefinition.size);
        }
    }
}

function drawSnake(snake) {
    ctx.fillStyle = snake.color;
    const baseSegmentSize = gameRules.snakeSegmentSize;
    const headSize = baseSegmentSize * gameRules.snakeHeadSizeMultiplier;
    const headOffset = (headSize - baseSegmentSize) / 2;


    snake.coordinates.forEach((coordinate, index) => {
        const segmentSize = index === 0
            ? headSize
            : baseSegmentSize;

        const segmentOffset = index === 0 ? headOffset : 0;

        ctx.fillRect(coordinate.x - segmentOffset, coordinate.y - segmentOffset, segmentSize, segmentSize);
    });

    ctx.fillStyle = snake.color;
    ctx.font = "12px Arial";
    const tailCoordinate = snake.coordinates[snake.coordinates.length - 1] ?? snake.coordinates[0];
    const previousToTailCoordinate = snake.coordinates[snake.coordinates.length - 2] ?? tailCoordinate;
    const deltaX = tailCoordinate.x - previousToTailCoordinate.x;
    const deltaY = tailCoordinate.y - previousToTailCoordinate.y;
    const isHorizontalTail = Math.abs(deltaX) >= Math.abs(deltaY);
    const tailDirectionX = isHorizontalTail ? Math.sign(deltaX || 1) : 0;
    const tailDirectionY = isHorizontalTail ? 0 : Math.sign(deltaY || 1);
    const tailLabelOffset = baseSegmentSize * 3.0;
    const tailCenterX = tailCoordinate.x + baseSegmentSize / 2;
    const tailCenterY = tailCoordinate.y + baseSegmentSize / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
        snake.l,
        tailCenterX + tailDirectionX * tailLabelOffset,
        tailCenterY + tailDirectionY * tailLabelOffset
    );
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

}

function notifyOfHitWorldObject(worldObjectId) {
    socket.emit(GAME_SOCKET_EVENTS.WORLD_OBJECT_HIT, worldObjectId);
}

function drawWorldObjects() {
    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        const worldObjectDefinition = worldObjectDefinitions[worldObject.type];

        if (!worldObjectDefinition) {
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_TREE) {
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_MONSTER) {
            if (monsterImage.complete) {
                ctx.drawImage(monsterImage, worldObject.x, worldObject.y, worldObjectDefinition.size, worldObjectDefinition.size);
            }
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_CLOUD) {
            const cloudCenterX = worldObject.x + worldObjectDefinition.size / 2;
            const cloudCenterY = worldObject.y + worldObjectDefinition.size / 2;
            const cloudRadius = worldObjectDefinition.size / 2;

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(cloudCenterX, cloudCenterY, cloudRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#BBBBBB';
            ctx.stroke();
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_THORN) {
            ctx.fillStyle = '#C62828';
            ctx.fillRect(worldObject.x, worldObject.y, worldObjectDefinition.size, worldObjectDefinition.size);
            continue;
        }
    }
}

const getWorldObjectHitbox = (worldObject, worldObjectDefinition) => {
    const maxInset = Math.max(0, Math.floor((worldObjectDefinition.size - 1) / 2));
    const objectInset = Math.max(0, Math.min(worldObjectDefinition.collisionInset ?? 0, maxInset));

    return {
        x: worldObject.x + objectInset,
        y: worldObject.y + objectInset,
        width: worldObjectDefinition.size - objectInset * 2,
        height: worldObjectDefinition.size - objectInset * 2
    };
};

function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.translate(canvas.width / 2 - snakeStates.mySnake.coordinates[0].x, canvas.height / 2 - snakeStates.mySnake.coordinates[0].y);

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, boardWidth, boardHeight);

    drawTrees();
    drawWorldObjects();

    drawSnake(snakeStates.mySnake);

    for (const id in snakeStates) {
        const user = snakeStates[id];

        drawSnake(user)
    }

    ctx.restore();
}

let intervalId;

const start = () => {
    if (!hasMovementConfig) {
        return;
    }
    intervalId = setInterval(updatePosition, updateIntervalMs);
}

const stop = () => {
    clearInterval(intervalId);
}

start();

window.addEventListener('keydown', (event) => {
    if (!isGameOver) {
        switch (event.key) {
            case 'ArrowUp':
                movementDirection = 'up';
                break;
            case 'ArrowDown':
                movementDirection = 'down';
                break;
            case 'ArrowLeft':
                movementDirection = 'left';
                break;
            case 'ArrowRight':
                movementDirection = 'right';
                break;
            case ' ':
                isPaused = !isPaused;
                isPaused ? stop() : start();
                break;
            case 'b':
                isBoostEnabled = !isBoostEnabled;
                movementStep = isBoostEnabled ? baseStep * boostMultiplier : baseStep;
                break;
            case 'o':
                overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
                break;
        }
    }

    requestAnimationFrame(drawScene);
});

const sendWeHitAnotherSnake = () => socket.emit(GAME_SOCKET_EVENTS.TURNED_INTO_MONSTERS, {coordinates: snakeStates.mySnake.coordinates});

canvas.addEventListener('touchstart', (event) => {
    if (!isGameOver) {
        const touch = event.touches[0];
        const touchX = touch.clientX;
        const touchY = touch.clientY;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        const diffX = touchX - centerX;
        const diffY = touchY - centerY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
            movementDirection = diffX > 0 ? 'right' : 'left';
        } else {
            movementDirection = diffY > 0 ? 'down' : 'up';
        }
    }

    requestAnimationFrame(drawScene);
});

function updatePosition() {
    let nextX;
    let nextY;
    let nextLength = 0;

    nextX = snakeStates.mySnake.coordinates[0].x;
    nextY = snakeStates.mySnake.coordinates[0].y;

    if (!isPaused && !isGameOver) {
        switch (movementDirection) {
            case 'up':
                nextY -= movementStep;
                break;
            case 'down':
                nextY += movementStep;
                break;
            case 'left':
                nextX -= movementStep;
                break;
            case 'right':
                nextX += movementStep;
                break;
        }

        if (gameRules.borderCollisionEndsGame && (
            nextX - SPHERE_RADIUS < 0 || nextX + SPHERE_RADIUS > boardWidth ||
            nextY - SPHERE_RADIUS < 0 || nextY + SPHERE_RADIUS > boardHeight
        )) {
            isGameOver = true;
            alert('Game Over!');
        }

        if (gameRules.worldObjectsEnabled) {
            const snakeHitbox = {
                x: nextX,
                y: nextY,
                width: gameRules.snakeSegmentSize,
                height: gameRules.snakeSegmentSize
            };

            for (const worldObjectId in worldObjects) {
                const worldObject = worldObjects[worldObjectId];
                const worldObjectDefinition = worldObjectDefinitions[worldObject.type];

                if (!worldObjectDefinition) {
                    continue;
                }

                const worldObjectHitbox = getWorldObjectHitbox(worldObject, worldObjectDefinition);
                if (!rectanglesOverlap(snakeHitbox, worldObjectHitbox)) {
                    continue;
                }

                if (worldObjectDefinition.effects.instantLose) {
                    isGameOver = true;
                    alert('Game Over, hit a dangerous object!');
                    return;
                }

                notifyOfHitWorldObject(worldObjectId);
                nextLength = snakeStates.mySnake.l + worldObjectDefinition.effects.growthDelta;

                if (!worldObjectDefinition.removeOnHit) {
                    continue;
                }
            }
        }

        if (gameRules.playerCollisionEndsGame) {
            for (const id in snakeStates) {
                if (id === 'mySnake') {
                    continue;
                }

                for (let i = 0; i < snakeStates[id].coordinates.length; i++) {
                    const coordinate = snakeStates[id].coordinates[i];
                    if (
                        nextX >= coordinate.x &&
                        nextX <= coordinate.x + gameRules.playerCollisionSize &&
                        nextY >= coordinate.y &&
                        nextY <= coordinate.y + gameRules.playerCollisionSize
                    ) {
                        isGameOver = true;
                        sendWeHitAnotherSnake();
                        alert('Game Over, hit another player!');
                        return;
                    }
                }
            }
        }

    }

    emitHeadCoordinates(nextX, nextY);
    upsertSnakeState('mySnake', { x: nextX, y: nextY }, nextLength);

    updateOverlay();
    if (!isGameOver) {
        requestAnimationFrame(drawScene);
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawScene();
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

requestAnimationFrame(drawScene);
