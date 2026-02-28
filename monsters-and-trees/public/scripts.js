const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.style.display = 'none';

const SPHERE_RADIUS = 12.5;
let boardWidth = 0;
let boardHeight = 0;

let movementDirection = null;
const STEERING_MODES = {
    CLASSIC: 'classicDirectional',
    FREE: 'freeSteering'
};
const STEERING_MODE_LABELS = {
    [STEERING_MODES.CLASSIC]: 'Classic (up/down/left/right)',
    [STEERING_MODES.FREE]: '360° (mouse + steer keys)'
};
const TURN_STEP_RADIANS = 0.12;
let steeringMode = STEERING_MODES.CLASSIC;
let steeringAngle = 0;
const activeSteerKeys = new Set();
let isPaused = false;
let isGameOver = false;
let isBoostEnabled = false;
let hasJoinedGame = false;
let localPlayerName = 'Anonymous';
let currentGameId = null;

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
const OBJECT_TYPE_DOT = GAME_WORLD_OBJECT_TYPES.DOT;
let movementStep = baseStep;
let localSnakeColor = 'red';
let localSnakeHeadEmoji = '🐍';
const INITIAL_USER_LENGTH = 1;
const MIN_SNAKE_WIDTH = 1;
const GAME_SOCKET_EVENTS = window.SOCKET_EVENTS;
const PLAYING_TYPES = {
    TIMER: 'timer',
    FIRST_TO_SCORE: 'firstTo1000',
    LAST_MAN_STANDING: 'lastManStanding'
};
const MAP_TYPES = {
    CLASSIC: 'classic',
    FOREST: 'forest',
    THORNS: 'thorns'
};
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
        length: INITIAL_USER_LENGTH,
        width: gameRules.snakeSegmentSize,
        headEmoji: localSnakeHeadEmoji
    }
}

initializeLocalSnake();

const setSnakeColorById = (snakeId, color) => {
    if (snakeId === localSocketId) {
        return;
    }

    if (snakeStates[snakeId]) {
        snakeStates[snakeId].color = color;
    }
}

const upsertSnakeById = (snakeId, headCoordinates, nextLength, nextScore, nextWidth) => {
    if (snakeId === localSocketId) {
        return;
    }

    if (!snakeStates[snakeId]) {
        snakeStates[snakeId] = {
            coordinates: [{
                x: headCoordinates.x,
                y: headCoordinates.y,
            }],
            color: 'black',
            name: 'Anonymous',
            length: INITIAL_USER_LENGTH,
            score: 0,
            width: gameRules.snakeSegmentSize,
            headEmoji: '🐍'
        }
    }

    const snakeState = snakeStates[snakeId];

    if (typeof nextScore === 'number') {
        snakeState.score = nextScore;
    }

    if (nextLength > 0) {
        snakeState.length = nextLength;
    }

    if (typeof nextWidth === 'number' && nextWidth > 0) {
        snakeState.width = nextWidth;
    }

    snakeState.coordinates.unshift(headCoordinates);
    snakeState.coordinates.splice(snakeState.length);
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
overlay.style.display = 'none';
document.body.appendChild(overlay);

const timerOverlay = document.createElement('div');
timerOverlay.style.position = 'absolute';
timerOverlay.style.top = '10px';
timerOverlay.style.right = '10px';
timerOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
timerOverlay.style.border = '1px solid black';
timerOverlay.style.padding = '8px 10px';
timerOverlay.style.fontFamily = 'Arial, sans-serif';
timerOverlay.style.fontSize = '16px';
timerOverlay.style.fontWeight = 'bold';
timerOverlay.textContent = '00:00';
timerOverlay.style.display = 'none';
document.body.appendChild(timerOverlay);

const lobbyOverlay = document.createElement('div');
lobbyOverlay.style.position = 'absolute';
lobbyOverlay.style.top = '0';
lobbyOverlay.style.left = '0';
lobbyOverlay.style.width = '100%';
lobbyOverlay.style.height = '100%';
lobbyOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
lobbyOverlay.style.display = 'flex';
lobbyOverlay.style.alignItems = 'center';
lobbyOverlay.style.justifyContent = 'center';
lobbyOverlay.style.zIndex = '1000';

const lobbyPanel = document.createElement('div');
lobbyPanel.style.width = 'min(560px, 92vw)';
lobbyPanel.style.maxHeight = '85vh';
lobbyPanel.style.overflowY = 'auto';
lobbyPanel.style.background = '#FFFFFF';
lobbyPanel.style.border = '1px solid #222';
lobbyPanel.style.padding = '16px';
lobbyPanel.style.fontFamily = 'Arial, sans-serif';

const lobbyTitle = document.createElement('h2');
lobbyTitle.textContent = 'Choose or create game';
lobbyTitle.style.margin = '0 0 10px 0';
lobbyPanel.appendChild(lobbyTitle);

const nameLabel = document.createElement('label');
nameLabel.textContent = 'Your name';
nameLabel.style.display = 'block';
lobbyPanel.appendChild(nameLabel);

const nameInput = document.createElement('input');
nameInput.type = 'text';
nameInput.placeholder = 'Name';
nameInput.maxLength = 24;
nameInput.style.width = '100%';
nameInput.style.margin = '6px 0 12px 0';
nameInput.style.padding = '8px';
lobbyPanel.appendChild(nameInput);

const createRow = document.createElement('div');
createRow.style.display = 'flex';
createRow.style.gap = '8px';
createRow.style.marginBottom = '12px';

const gameNameInput = document.createElement('input');
gameNameInput.type = 'text';
gameNameInput.placeholder = 'New game name';
gameNameInput.maxLength = 40;
gameNameInput.style.flex = '1';
gameNameInput.style.padding = '8px';

const createButton = document.createElement('button');
createButton.textContent = 'Create';
createButton.style.padding = '8px 12px';

const randomButton = document.createElement('button');
randomButton.textContent = 'Random';
randomButton.style.padding = '8px 12px';

const mapTypeSelect = document.createElement('select');
mapTypeSelect.style.padding = '8px';
mapTypeSelect.style.marginBottom = '12px';
mapTypeSelect.style.width = '100%';

const mapTypeOptions = [
    { value: MAP_TYPES.CLASSIC, label: 'Classic Plains' },
    { value: MAP_TYPES.FOREST, label: 'Dense Forest' },
    { value: MAP_TYPES.THORNS, label: 'Thorn Field' }
];

for (const mapTypeOption of mapTypeOptions) {
    const optionElement = document.createElement('option');
    optionElement.value = mapTypeOption.value;
    optionElement.textContent = mapTypeOption.label;
    mapTypeSelect.appendChild(optionElement);
}

mapTypeSelect.value = MAP_TYPES.CLASSIC;

const playingTypeSelect = document.createElement('select');
playingTypeSelect.style.padding = '8px';
playingTypeSelect.style.marginBottom = '12px';
playingTypeSelect.style.width = '100%';

const steeringModeSelect = document.createElement('select');
steeringModeSelect.style.padding = '8px';
steeringModeSelect.style.marginBottom = '12px';
steeringModeSelect.style.width = '100%';

const playingTypeOptions = [
    { value: PLAYING_TYPES.LAST_MAN_STANDING, label: 'Last man standing' },
    { value: PLAYING_TYPES.TIMER, label: 'Most points in 60s' },
    { value: PLAYING_TYPES.FIRST_TO_SCORE, label: 'First to 1000 points' }
];

for (const playingTypeOption of playingTypeOptions) {
    const optionElement = document.createElement('option');
    optionElement.value = playingTypeOption.value;
    optionElement.textContent = playingTypeOption.label;
    playingTypeSelect.appendChild(optionElement);
}

const steeringModeOptions = [
    { value: STEERING_MODES.CLASSIC, label: STEERING_MODE_LABELS[STEERING_MODES.CLASSIC] },
    { value: STEERING_MODES.FREE, label: STEERING_MODE_LABELS[STEERING_MODES.FREE] }
];

for (const steeringModeOption of steeringModeOptions) {
    const optionElement = document.createElement('option');
    optionElement.value = steeringModeOption.value;
    optionElement.textContent = steeringModeOption.label;
    steeringModeSelect.appendChild(optionElement);
}

playingTypeSelect.value = PLAYING_TYPES.LAST_MAN_STANDING;
steeringModeSelect.value = STEERING_MODES.CLASSIC;

createRow.appendChild(gameNameInput);
createRow.appendChild(createButton);
createRow.appendChild(randomButton);
lobbyPanel.appendChild(playingTypeSelect);
lobbyPanel.appendChild(mapTypeSelect);
lobbyPanel.appendChild(steeringModeSelect);
lobbyPanel.appendChild(createRow);

const listTitle = document.createElement('h3');
listTitle.textContent = 'Active games';
listTitle.style.margin = '6px 0';
lobbyPanel.appendChild(listTitle);

const activeGamesList = document.createElement('div');
activeGamesList.style.display = 'grid';
activeGamesList.style.gap = '6px';
lobbyPanel.appendChild(activeGamesList);

lobbyOverlay.appendChild(lobbyPanel);
document.body.appendChild(lobbyOverlay);

const getEnteredPlayerName = () => {
    const enteredName = nameInput.value.trim();
    if (!enteredName) {
        return 'Anonymous';
    }

    return enteredName;
};

const showGameCanvas = () => {
    hasJoinedGame = true;
    steeringMode = steeringModeSelect.value === STEERING_MODES.FREE ? STEERING_MODES.FREE : STEERING_MODES.CLASSIC;
    activeSteerKeys.clear();
    canvas.style.display = 'block';
    overlay.style.display = 'block';
    timerOverlay.style.display = 'block';
    lobbyOverlay.style.display = 'none';
};

const normalizeAngle = (angleInRadians) => {
    const fullTurn = Math.PI * 2;
    return ((angleInRadians % fullTurn) + fullTurn) % fullTurn;
};

const getSnakeHeadCenter = () => {
    const head = snakeStates.mySnake.coordinates[0];
    const headSize = snakeStates.mySnake.width ?? gameRules.snakeSegmentSize;
    return {
        x: head.x + headSize / 2,
        y: head.y + headSize / 2
    };
};

const setSteeringAngleTowardScreenPoint = (screenX, screenY) => {
    if (steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    const headCenter = getSnakeHeadCenter();
    const cameraOffsetX = canvas.width / 2 - snakeStates.mySnake.coordinates[0].x;
    const cameraOffsetY = canvas.height / 2 - snakeStates.mySnake.coordinates[0].y;
    const headScreenX = headCenter.x + cameraOffsetX;
    const headScreenY = headCenter.y + cameraOffsetY;

    const diffX = screenX - headScreenX;
    const diffY = screenY - headScreenY;

    if (diffX === 0 && diffY === 0) {
        return;
    }

    steeringAngle = normalizeAngle(Math.atan2(diffY, diffX));
};

const applySteeringRotationFromKeys = () => {
    if (steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    if (activeSteerKeys.has('left') && !activeSteerKeys.has('right')) {
        steeringAngle = normalizeAngle(steeringAngle - TURN_STEP_RADIANS);
    }

    if (activeSteerKeys.has('right') && !activeSteerKeys.has('left')) {
        steeringAngle = normalizeAngle(steeringAngle + TURN_STEP_RADIANS);
    }
};

const getSteeringLabel = () => STEERING_MODE_LABELS[steeringMode] ?? STEERING_MODE_LABELS[STEERING_MODES.CLASSIC];

const renderActiveGames = (games) => {
    activeGamesList.innerHTML = '';

    if (!games || games.length === 0) {
        const emptyText = document.createElement('div');
        emptyText.textContent = 'No active games yet.';
        activeGamesList.appendChild(emptyText);
        return;
    }

    for (const game of games) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.border = '1px solid #DDD';
        row.style.padding = '8px';

        const gameMeta = document.createElement('div');
        gameMeta.innerHTML = `<strong>${game.name}</strong><br><small>${getPlayingTypeLabel(game.playingType)} · ${game.mapName ?? 'Map'} · Host: ${game.ownerName} · Players: ${game.playerCount}</small>`;

        const joinButton = document.createElement('button');
        joinButton.textContent = 'Join';
        joinButton.onclick = () => {
            const playerName = getEnteredPlayerName();
            socket.emit(GAME_SOCKET_EVENTS.JOIN_GAME, {
                gameId: game.id,
                playerName
            });
        };

        row.appendChild(gameMeta);
        row.appendChild(joinButton);
        activeGamesList.appendChild(row);
    }
};

createButton.onclick = () => {
    const playerName = getEnteredPlayerName();
    const gameName = gameNameInput.value.trim();
    const playingType = playingTypeSelect.value;
    const mapType = mapTypeSelect.value;
    socket.emit(GAME_SOCKET_EVENTS.CREATE_GAME, {
        gameName,
        playerName,
        playingType,
        mapType
    });
};

const getRandomItem = (items) => items[Math.floor(Math.random() * items.length)];

const getRandomGameName = () => {
    const adjectives = ['Swift', 'Wild', 'Spiky', 'Foggy', 'Hungry', 'Sneaky'];
    const nouns = ['Monsters', 'Thorns', 'Forest', 'Snakes', 'Clouds', 'Hunters'];
    const suffix = Math.floor(Math.random() * 1000);
    return `${getRandomItem(adjectives)} ${getRandomItem(nouns)} ${suffix}`;
};

randomButton.onclick = () => {
    const playerName = getEnteredPlayerName();
    const randomPlayingType = getRandomItem(playingTypeOptions).value;
    const randomMapType = getRandomItem(mapTypeOptions).value;

    playingTypeSelect.value = randomPlayingType;
    mapTypeSelect.value = randomMapType;

    socket.emit(GAME_SOCKET_EVENTS.CREATE_GAME, {
        gameName: getRandomGameName(),
        playerName,
        playingType: randomPlayingType,
        mapType: randomMapType,
        autoJoin: true
    });
};

let gameStartTime = Date.now();
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
let playingTypeConfig = {
    playingType: PLAYING_TYPES.LAST_MAN_STANDING,
    timerDurationSeconds: 60,
    scoreTarget: 1000
};
let currentMatchState = null;
let hasShownMatchEndAlert = false;

const formatDurationAsMinutesSeconds = (durationMs) => {
    const totalSeconds = Math.floor(durationMs / MS_PER_SECOND);
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const resetGameTimer = () => {
    gameStartTime = Date.now();
    hasShownMatchEndAlert = false;
    timerOverlay.textContent = '00:00';
};

const getPlayingTypeLabel = (playingType) => {
    if (playingType === PLAYING_TYPES.TIMER) {
        return 'Most points in time';
    }

    if (playingType === PLAYING_TYPES.FIRST_TO_SCORE) {
        return 'First to score';
    }

    return 'Last man standing';
};

const getPlayingTypeObjectiveText = () => {
    const playingType = currentMatchState?.playingType ?? playingTypeConfig.playingType;

    if (playingType === PLAYING_TYPES.TIMER) {
        const duration = currentMatchState?.timerDurationSeconds ?? playingTypeConfig.timerDurationSeconds;
        return `${duration}s`; 
    }

    if (playingType === PLAYING_TYPES.FIRST_TO_SCORE) {
        const scoreTarget = currentMatchState?.scoreTarget ?? playingTypeConfig.scoreTarget;
        return `Target: ${scoreTarget}`;
    }

    return 'Stay alive';
};

const updateGameTimer = () => {
    if (isGameOver && !(currentMatchState?.playingType === PLAYING_TYPES.TIMER && currentMatchState?.isEnded)) {
        return;
    }

    const activePlayingType = currentMatchState?.playingType ?? playingTypeConfig.playingType;
    if (activePlayingType === PLAYING_TYPES.TIMER) {
        const startedAtMs = currentMatchState?.startedAtMs ?? gameStartTime;
        const durationSeconds = currentMatchState?.timerDurationSeconds ?? playingTypeConfig.timerDurationSeconds;
        const elapsedMs = Date.now() - startedAtMs;
        const remainingMs = Math.max(0, durationSeconds * MS_PER_SECOND - elapsedMs);
        timerOverlay.textContent = formatDurationAsMinutesSeconds(remainingMs);
        return;
    }

    const elapsedMs = Date.now() - gameStartTime;
    timerOverlay.textContent = formatDurationAsMinutesSeconds(elapsedMs);
};

setInterval(updateGameTimer, MS_PER_SECOND);

function countOtherSnakes() {
    return Object.keys(snakeStates).filter((key) => key !== 'mySnake' && key !== localSocketId).length
}

function countBotSnakes() {
    return Object.keys(snakeStates).filter((key) => key.startsWith('bot-')).length
}

function updateOverlay() {
    if (!hasJoinedGame) {
        return;
    }

    overlay.innerHTML = `<strong>Connected Users: ${countOtherSnakes()} </strong><br>`;
    overlay.innerHTML += `<strong>Bots: ${countBotSnakes()} </strong><br>`;
    overlay.innerHTML += `<strong>Mode: ${getPlayingTypeLabel(currentMatchState?.playingType ?? playingTypeConfig.playingType)} </strong><br>`;
    overlay.innerHTML += `<strong>Steering: ${getSteeringLabel()} </strong><br>`;
    overlay.innerHTML += `<strong>Goal: ${getPlayingTypeObjectiveText()} </strong><br>`;
    overlay.innerHTML += `<strong>You: ${localPlayerName} </strong><br>`;

    for (const id in snakeStates) {
        const snake = snakeStates[id];
        overlay.innerHTML += `<div style="color: ${snake.color};">

            ${snake.name ?? id}: (${snake.coordinates[0].x}, ${snake.coordinates[0].y}), ${snake.length} L
        </div>`;
    }

}

let lastEmittedHeadCoordinates = { x: 0, y: 0 };

function emitHeadCoordinates(x, y) {
    if (!hasJoinedGame || !currentGameId) {
        return;
    }

    if (lastEmittedHeadCoordinates.x === x && lastEmittedHeadCoordinates.y === y) {
        return;
    }

    socket.emit(GAME_SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, {
        x,
        y,
        l: snakeStates.mySnake.length,
        w: snakeStates.mySnake.width
    });
    lastEmittedHeadCoordinates = { x, y };
}

socket.on(GAME_SOCKET_EVENTS.CONNECT, () => {
    localSocketId = socket.id;
    socket.emit(GAME_SOCKET_EVENTS.LIST_ACTIVE_GAMES);
});

socket.on(GAME_SOCKET_EVENTS.ACTIVE_GAMES_UPDATED, (games) => {
    renderActiveGames(games);
});

socket.on(GAME_SOCKET_EVENTS.JOINED_GAME, ({ gameId, playerName, playingType }) => {
    currentGameId = gameId;
    localPlayerName = playerName;
    if (playingType) {
        playingTypeConfig = {
            ...playingTypeConfig,
            playingType
        };
    }
    snakeStates.mySnake.name = localPlayerName;
    showGameCanvas();
    resetGameTimer();
    drawScene();
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.JOIN_GAME_ERROR, (message) => {
    alert(message || 'Could not join game');
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_COORDINATES_OF_HEAD, (headCoordinatesUpdate) => {
    const { id: snakeId, coordinatesOfHead } = headCoordinatesUpdate;
    upsertSnakeById(snakeId, { x: coordinatesOfHead.x, y: coordinatesOfHead.y }, headCoordinatesUpdate.l, headCoordinatesUpdate.score, headCoordinatesUpdate.w);

    drawScene();
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.ASSIGN_COLOR, (color) => {
    localSnakeColor = color;
    snakeStates.mySnake.color = color;
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.ASSIGN_HEAD_EMOJI, (headEmoji) => {
    if (typeof headEmoji !== 'string' || !headEmoji.trim()) {
        return;
    }

    localSnakeHeadEmoji = headEmoji;
    snakeStates.mySnake.headEmoji = headEmoji;
    drawScene();
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
        stopMovementLoop();
        startMovementLoop();
    }
};

socket.on(GAME_SOCKET_EVENTS.SET_MOVEMENT_CONFIG, (movementConfig) => {
    applyMovementConfig(movementConfig);
});

socket.on(GAME_SOCKET_EVENTS.SET_PLAYING_TYPE, (playingTypeConfigFromServer) => {
    playingTypeConfig = {
        ...playingTypeConfig,
        ...playingTypeConfigFromServer
    };
    updateOverlay();
    updateGameTimer();
});

socket.on(GAME_SOCKET_EVENTS.MATCH_STATE_UPDATE, (matchState) => {
    currentMatchState = {
        ...matchState,
        playingType: playingTypeConfig.playingType
    };

    if (typeof matchState?.startedAtMs === 'number') {
        gameStartTime = matchState.startedAtMs;
    }

    if (matchState?.isEnded) {
        isGameOver = true;
        if (!hasShownMatchEndAlert) {
            if (matchState.winnerId) {
                const winnerLabel = matchState.winnerId === localSocketId ? 'You' : matchState.winnerId;
                alert(`Game Over! Winner: ${winnerLabel}`);
            } else {
                alert('Game Over! No single winner this round.');
            }
            hasShownMatchEndAlert = true;
        }
    }

    updateOverlay();
    updateGameTimer();
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

socket.on(GAME_SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, (virtualDimensions) => {
    boardWidth = virtualDimensions.virtualWidth;
    boardHeight = virtualDimensions.virtualHeight;
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.SET_START_POSITION, (position) => {
    isGameOver = false;
    snakeStates.mySnake.coordinates[0].x = position.x;
    snakeStates.mySnake.coordinates[0].y = position.y;
    resetGameTimer();
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.YOU_WERE_EATEN, () => {
    if (isGameOver) {
        return;
    }

    isGameOver = true;
    alert('Game Over, you were eaten by a bigger snake!');
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_USERS, (usersById) => {
    for (const snakeId in snakeStates) {
        if (snakeId === 'mySnake') {
            continue;
        }

        if (!usersById[snakeId]) {
            delete snakeStates[snakeId];
        }
    }

    for (const snakeId in usersById) {
        const userState = usersById[snakeId];

        if (snakeId === localSocketId) {
            snakeStates.mySnake.length = userState.l ?? snakeStates.mySnake.length;
            snakeStates.mySnake.width = userState.w ?? snakeStates.mySnake.width;
            snakeStates.mySnake.score = userState.score ?? snakeStates.mySnake.score;
            snakeStates.mySnake.name = userState.name ?? snakeStates.mySnake.name;
            snakeStates.mySnake.color = userState.color ?? snakeStates.mySnake.color;
            snakeStates.mySnake.headEmoji = userState.headEmoji ?? snakeStates.mySnake.headEmoji;
            continue;
        }

        upsertSnakeById(snakeId, userState.coordinates, userState.l, userState.score, userState.w);
        setSnakeColorById(snakeId, userState.color);
        if (snakeStates[snakeId]) {
            snakeStates[snakeId].name = userState.name ?? snakeStates[snakeId].name;
            snakeStates[snakeId].headEmoji = userState.headEmoji ?? snakeStates[snakeId].headEmoji;
        }
    }

    for (const eatenSnakeId of eatenSnakeIds) {
        if (!usersById[eatenSnakeId]) {
            eatenSnakeIds.delete(eatenSnakeId);
        }
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
    const baseSegmentSize = snake.width ?? gameRules.snakeSegmentSize;
    const headSize = baseSegmentSize * gameRules.snakeHeadSizeMultiplier;
    const headOffset = (headSize - baseSegmentSize) / 2;
    const headCoordinate = snake.coordinates[0];
    const neckCoordinate = snake.coordinates[1] ?? headCoordinate;
    let neckDirectionX = neckCoordinate.x - headCoordinate.x;
    let neckDirectionY = neckCoordinate.y - headCoordinate.y;

    if (neckDirectionX === 0 && neckDirectionY === 0) {
        neckDirectionY = baseSegmentSize;
    }

    const neckDirectionLength = Math.hypot(neckDirectionX, neckDirectionY) || 1;
    const normalizedNeckDirectionX = neckDirectionX / neckDirectionLength;
    const normalizedNeckDirectionY = neckDirectionY / neckDirectionLength;
    const headForwardOffset = baseSegmentSize * 0.8;


    snake.coordinates.forEach((coordinate, index) => {
        const segmentSize = index === 0
            ? headSize
            : baseSegmentSize;

        const segmentOffset = index === 0 ? headOffset : 0;

        if (index === 0) {
            const headCenterX = coordinate.x + baseSegmentSize / 2 - normalizedNeckDirectionX * headForwardOffset;
            const headCenterY = coordinate.y + baseSegmentSize / 2 - normalizedNeckDirectionY * headForwardOffset;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${Math.max(32, Math.round(segmentSize * 2))}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            ctx.fillText(snake.headEmoji ?? '🐍', headCenterX, headCenterY);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            return;
        }

        ctx.fillRect(coordinate.x - segmentOffset, coordinate.y - segmentOffset, segmentSize, segmentSize);
    });

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

        if (worldObject.type === OBJECT_TYPE_DOT) {
            const dotCenterX = worldObject.x + worldObjectDefinition.size / 2;
            const dotCenterY = worldObject.y + worldObjectDefinition.size / 2;

            ctx.fillStyle = '#FFCA28';
            ctx.beginPath();
            ctx.arc(dotCenterX, dotCenterY, worldObjectDefinition.size / 2, 0, Math.PI * 2);
            ctx.fill();
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
    if (!hasJoinedGame) {
        return;
    }

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

let movementIntervalId;

const startMovementLoop = () => {
    if (!hasMovementConfig) {
        return;
    }
    movementIntervalId = setInterval(updatePosition, updateIntervalMs);
}

const stopMovementLoop = () => {
    clearInterval(movementIntervalId);
}

startMovementLoop();

window.addEventListener('keydown', (event) => {
    if (!hasJoinedGame) {
        return;
    }

    if (!isGameOver) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') {
            event.preventDefault();
        }

        switch (event.key) {
            case 'ArrowUp':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'up';
                }
                break;
            case 'ArrowDown':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'down';
                }
                break;
            case 'ArrowLeft':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'left';
                } else {
                    activeSteerKeys.add('left');
                }
                break;
            case 'ArrowRight':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'right';
                } else {
                    activeSteerKeys.add('right');
                }
                break;
            case 'a':
            case 'A':
                if (steeringMode === STEERING_MODES.FREE) {
                    activeSteerKeys.add('left');
                }
                break;
            case 'd':
            case 'D':
                if (steeringMode === STEERING_MODES.FREE) {
                    activeSteerKeys.add('right');
                }
                break;
            case ' ':
                isPaused = !isPaused;
                isPaused ? stopMovementLoop() : startMovementLoop();
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

window.addEventListener('keyup', (event) => {
    if (steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            activeSteerKeys.delete('left');
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            activeSteerKeys.delete('right');
            break;
    }
});

const eatenSnakeIds = new Set();
const sendSnakeEaten = (victimId) => socket.emit(GAME_SOCKET_EVENTS.SNAKE_EATEN, { victimId });
const sendSnakeTailBitten = (victimId, collisionX, collisionY) => socket.emit(GAME_SOCKET_EVENTS.SNAKE_TAIL_BITTEN, {
    victimId,
    collisionX,
    collisionY
});

const getOppositeDirection = (direction) => {
    switch (direction) {
        case 'up':
            return 'down';
        case 'down':
            return 'up';
        case 'left':
            return 'right';
        case 'right':
            return 'left';
        default:
            return direction;
    }
};

const applyDirectionToPosition = (originX, originY, direction, step) => {
    let nextX = originX;
    let nextY = originY;

    switch (direction) {
        case 'up':
            nextY -= step;
            break;
        case 'down':
            nextY += step;
            break;
        case 'left':
            nextX -= step;
            break;
        case 'right':
            nextX += step;
            break;
    }

    return { nextX, nextY };
};

const applySteeringAngleToPosition = (originX, originY, angleInRadians, step) => {
    return {
        nextX: originX + Math.cos(angleInRadians) * step,
        nextY: originY + Math.sin(angleInRadians) * step
    };
};

const reverseMovementDirection = () => {
    if (steeringMode === STEERING_MODES.FREE) {
        steeringAngle = normalizeAngle(steeringAngle + Math.PI);
        return;
    }

    movementDirection = getOppositeDirection(movementDirection);
};

canvas.addEventListener('touchstart', (event) => {
    if (!hasJoinedGame) {
        return;
    }

    if (!isGameOver) {
        event.preventDefault();

        const touch = event.touches[0];
        const touchX = touch.clientX;
        const touchY = touch.clientY;

        if (steeringMode === STEERING_MODES.FREE) {
            setSteeringAngleTowardScreenPoint(touchX, touchY);
            requestAnimationFrame(drawScene);
            return;
        }

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

canvas.addEventListener('mousemove', (event) => {
    if (!hasJoinedGame || isGameOver || steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    setSteeringAngleTowardScreenPoint(event.clientX, event.clientY);
});

function updatePosition() {
    if (!hasJoinedGame || !currentGameId) {
        return;
    }

    let nextX;
    let nextY;
    let nextLength = 0;
    let nextWidth = 0;
    let hasBounced = false;

    nextX = snakeStates.mySnake.coordinates[0].x;
    nextY = snakeStates.mySnake.coordinates[0].y;

    if (!isPaused && !isGameOver) {
        applySteeringRotationFromKeys();

        const movedPosition = steeringMode === STEERING_MODES.FREE
            ? applySteeringAngleToPosition(nextX, nextY, steeringAngle, movementStep)
            : applyDirectionToPosition(nextX, nextY, movementDirection, movementStep);
        nextX = movedPosition.nextX;
        nextY = movedPosition.nextY;

        if (gameRules.worldObjectsEnabled) {
            const currentSnakeWidth = snakeStates.mySnake.width ?? gameRules.snakeSegmentSize;
            const snakeHitbox = {
                x: nextX,
                y: nextY,
                width: currentSnakeWidth,
                height: currentSnakeWidth
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
                nextLength = snakeStates.mySnake.length + worldObjectDefinition.effects.growthDelta;
                const widthGain = typeof worldObjectDefinition.effects.widthDelta === 'number'
                    ? worldObjectDefinition.effects.widthDelta
                    : 0;
                nextWidth = Math.max(MIN_SNAKE_WIDTH, currentSnakeWidth + widthGain);

                if (!worldObjectDefinition.removeOnHit) {
                    continue;
                }
            }
        }

        if (gameRules.playerCollisionEndsGame) {
            let collidedSnakeId = null;
            const myLength = snakeStates.mySnake.length;
            const myWidthAfterMove = nextWidth > 0
                ? nextWidth
                : (snakeStates.mySnake.width ?? gameRules.snakeSegmentSize);
            const mySnakeHitbox = {
                x: nextX,
                y: nextY,
                width: myWidthAfterMove,
                height: myWidthAfterMove
            };

            for (const id in snakeStates) {
                if (id === 'mySnake') {
                    continue;
                }

                if (eatenSnakeIds.has(id)) {
                    continue;
                }

                const otherSnake = snakeStates[id];
                const otherLength = otherSnake.length ?? INITIAL_USER_LENGTH;

                for (let i = 0; i < otherSnake.coordinates.length; i++) {
                    const coordinate = otherSnake.coordinates[i];
                    const otherWidth = otherSnake.width ?? gameRules.playerCollisionSize;
                    const otherSegmentHitbox = {
                        x: coordinate.x,
                        y: coordinate.y,
                        width: otherWidth,
                        height: otherWidth
                    };

                    if (rectanglesOverlap(mySnakeHitbox, otherSegmentHitbox)) {
                        collidedSnakeId = id;

                        if (myLength > otherLength) {
                            eatenSnakeIds.add(id);
                            sendSnakeEaten(id);
                        } else {
                            const isTailSegment = i === otherSnake.coordinates.length - 1;
                            if (myLength < otherLength && isTailSegment) {
                                sendSnakeTailBitten(id, nextX, nextY);
                            } else {
                                reverseMovementDirection();
                                const bouncedPosition = steeringMode === STEERING_MODES.FREE
                                    ? applySteeringAngleToPosition(
                                        snakeStates.mySnake.coordinates[0].x,
                                        snakeStates.mySnake.coordinates[0].y,
                                        steeringAngle,
                                        movementStep
                                    )
                                    : applyDirectionToPosition(
                                    snakeStates.mySnake.coordinates[0].x,
                                    snakeStates.mySnake.coordinates[0].y,
                                    movementDirection,
                                    movementStep
                                );
                                nextX = bouncedPosition.nextX;
                                nextY = bouncedPosition.nextY;
                                hasBounced = true;
                            }
                        }
                        break;
                    }
                }

                if (collidedSnakeId) {
                    break;
                }
            }
        }

        if (gameRules.borderCollisionEndsGame && (
            nextX - SPHERE_RADIUS < 0 || nextX + SPHERE_RADIUS > boardWidth ||
            nextY - SPHERE_RADIUS < 0 || nextY + SPHERE_RADIUS > boardHeight
        )) {
            isGameOver = true;
            alert('Game Over!');
            return;
        }

        if (hasBounced) {
            nextX = Math.max(0, Math.min(nextX, boardWidth - (snakeStates.mySnake.width ?? gameRules.snakeSegmentSize)));
            nextY = Math.max(0, Math.min(nextY, boardHeight - (snakeStates.mySnake.width ?? gameRules.snakeSegmentSize)));
        }

    }

    emitHeadCoordinates(nextX, nextY);
    upsertSnakeById('mySnake', { x: nextX, y: nextY }, nextLength, undefined, nextWidth);

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
