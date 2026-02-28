const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const SOCKET_EVENTS = require('./public/socket-events.js');
const {
    WORLD_OBJECT_TYPES,
    DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS
} = require('./public/world-object-definitions.js');

const DEFAULT_PORT = 4000;
const HEX_COLOR_CHARS = '0123456789ABCDEF';
const HEX_BASE = 16;
const HEX_COLOR_LENGTH = 6;
const ANIMAL_HEAD_EMOJIS = [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁',
    '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🦍', '🦧', '🐔',
    '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴',
    '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪲', '🪳', '🕷️', '🕸️',
    '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🪼',
    '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🦭', '🐊', '🐅', '🐆', '🦓',
    '🫏', '🦍', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦬', '🐃', '🐂',
    '🐄', '🫎', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮',
    '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜', '🪽', '🦢', '🦩',
    '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'
];
const VIRTUAL_WIDTH = 1600;
const VIRTUAL_HEIGHT = 1600;
const MOVEMENT_BASE_STEP = 2;
const MOVEMENT_TICKS_PER_SECOND = 30;
const MOVEMENT_BOOST_MULTIPLIER = 2;
const COLLISION_RESPONSES = {
    GAME_OVER: 'gameOver',
    BOUNCE: 'bounce'
};
const RULE_PLAYER_COLLISION_ENDS_GAME = true;
const RULE_SNAKE_SEGMENT_SIZE = 6;
const RULE_SNAKE_HEAD_SIZE_MULTIPLIER = 2;
const RULE_PLAYER_COLLISION_SIZE = 6;
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
const DEFAULT_BOT_COUNT = 3;
const DEFAULT_BOT_MOVE_INTERVAL_MS = 200;
const DEFAULT_BOT_STEP = 4;
const DEFAULT_BOT_DIRECTION_CHANGE_CHANCE = 0.2;
const DEFAULT_TIMER_DURATION_SECONDS = 60;
const DEFAULT_SCORE_TARGET = 1000;
const MAX_SPAWN_ATTEMPTS = 500;
const INITIAL_TREE_COUNT = 30;
const INITIAL_MONSTER_COUNT = 20;
const INITIAL_CLOUD_COUNT = 8;
const INITIAL_THORN_COUNT = 10;
const INITIAL_USER_SCORE = 0;
const INITIAL_USER_LENGTH = 6;
const INITIAL_USER_WIDTH = RULE_SNAKE_SEGMENT_SIZE;
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
const TIMER_DURATION_SECONDS = Math.max(5, Number.parseInt(process.env.TIMER_DURATION_SECONDS ?? `${DEFAULT_TIMER_DURATION_SECONDS}`, 10));
const SCORE_TARGET = Math.max(1, Number.parseInt(process.env.SCORE_TARGET ?? `${DEFAULT_SCORE_TARGET}`, 10));
const PLAYING_TYPE = Object.values(PLAYING_TYPES).includes(process.env.PLAYING_TYPE)
    ? process.env.PLAYING_TYPE
    : PLAYING_TYPES.LAST_MAN_STANDING;
const DEFAULT_MAP_TYPE = MAP_TYPES.CLASSIC;
const DEFAULT_BORDER_COLLISION_RESPONSE = COLLISION_RESPONSES.GAME_OVER;
const DEFAULT_DANGEROUS_OBJECT_COLLISION_RESPONSE = COLLISION_RESPONSES.GAME_OVER;
const resolveCollisionResponse = (configuredValue, fallback) => {
    if (Object.values(COLLISION_RESPONSES).includes(configuredValue)) {
        return configuredValue;
    }

    return fallback;
};

const toSafeCollisionResponse = (collisionResponse, fallback) => {
    return resolveCollisionResponse(collisionResponse, fallback);
};

const MAP_DEFINITIONS = {
    [MAP_TYPES.CLASSIC]: {
        name: 'Classic Plains',
        width: 1600,
        height: 1600,
        treeCount: INITIAL_TREE_COUNT,
        monsterCount: INITIAL_MONSTER_COUNT,
        cloudCount: INITIAL_CLOUD_COUNT,
        thornCount: INITIAL_THORN_COUNT
    },
    [MAP_TYPES.FOREST]: {
        name: 'Dense Forest',
        width: 1800,
        height: 1400,
        treeCount: 55,
        monsterCount: 16,
        cloudCount: 6,
        thornCount: 6
    },
    [MAP_TYPES.THORNS]: {
        name: 'Thorn Field',
        width: 1500,
        height: 1500,
        treeCount: 18,
        monsterCount: 26,
        cloudCount: 7,
        thornCount: 28
    }
};

function getRandomColor() {
    let color = '#';
    for (let i = 0; i < HEX_COLOR_LENGTH; i++) {
        color += HEX_COLOR_CHARS[Math.floor(Math.random() * HEX_BASE)];
    }
    return color;
}

function getRandomAnimalHeadEmoji() {
    const randomIndex = Math.floor(Math.random() * ANIMAL_HEAD_EMOJIS.length);
    return ANIMAL_HEAD_EMOJIS[randomIndex];
}

const getSnakeLengthForUser = (userState) => userState?.l ?? INITIAL_USER_LENGTH;
const getSnakeWidthForUser = (userState) => userState?.w ?? INITIAL_USER_WIDTH;

const setSnakeLengthForUser = (userState, nextLength) => {
    if (!userState) {
        return;
    }

    const safeLength = Math.max(1, Number.parseInt(`${nextLength ?? INITIAL_USER_LENGTH}`, 10) || INITIAL_USER_LENGTH);
    userState.l = safeLength;
};

const setSnakeWidthForUser = (userState, nextWidth) => {
    if (!userState || typeof nextWidth !== 'number' || nextWidth <= 0) {
        return;
    }

    userState.w = Math.max(1, nextWidth);
};

const growSnakeAfterEatingSnake = (attackerUser, victimUser) => {
    if (!attackerUser || !victimUser) {
        return;
    }

    const attackerLength = getSnakeLengthForUser(attackerUser);
    const victimLength = getSnakeLengthForUser(victimUser);
    setSnakeLengthForUser(attackerUser, attackerLength + victimLength);
};

const applyWorldObjectEffectsToUser = (userState, worldObjectDefinition) => {
    if (!userState || !worldObjectDefinition) {
        return;
    }

    const scoreDelta = Number.isFinite(worldObjectDefinition.effects.scoreDelta)
        ? worldObjectDefinition.effects.scoreDelta
        : 0;
    const growthDelta = Number.isFinite(worldObjectDefinition.effects.growthDelta)
        ? worldObjectDefinition.effects.growthDelta
        : 0;
    const widthDelta = Number.isFinite(worldObjectDefinition.effects.widthDelta)
        ? worldObjectDefinition.effects.widthDelta
        : 0;

    userState.score += scoreDelta;
    setSnakeLengthForUser(userState, getSnakeLengthForUser(userState) + growthDelta);
    setSnakeWidthForUser(userState, getSnakeWidthForUser(userState) + widthDelta);
};


let boardWidth = VIRTUAL_WIDTH;
let boardHeight = VIRTUAL_HEIGHT;
let currentMapType = DEFAULT_MAP_TYPE;

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

const toSafeMapType = (mapType) => {
    if (Object.values(MAP_TYPES).includes(mapType)) {
        return mapType;
    }

    return DEFAULT_MAP_TYPE;
};

const getMapDefinition = (mapType) => {
    const safeMapType = toSafeMapType(mapType);
    return MAP_DEFINITIONS[safeMapType];
};

const applyMapToWorld = (mapType) => {
    const safeMapType = toSafeMapType(mapType);
    const mapDefinition = getMapDefinition(safeMapType);

    currentMapType = safeMapType;
    boardWidth = mapDefinition.width;
    boardHeight = mapDefinition.height;
    worldObjects = {};
    nextWorldObjectId = 1;

    for (let i = 0; i < mapDefinition.treeCount; i++) {
        addWorldObject(WORLD_OBJECT_TYPES.TREE);
    }

    for (let i = 0; i < mapDefinition.monsterCount; i++) {
        addWorldObject(WORLD_OBJECT_TYPES.MONSTER);
    }

    for (let i = 0; i < mapDefinition.cloudCount; i++) {
        addWorldObject(WORLD_OBJECT_TYPES.CLOUD);
    }

    for (let i = 0; i < mapDefinition.thornCount; i++) {
        addWorldObject(WORLD_OBJECT_TYPES.THORN);
    }
};

applyMapToWorld(DEFAULT_MAP_TYPE);

let connectedUsers = {};
let botStateById = {};
let snakeTrailById = {};
let activeGamesById = {};
let socketGameById = {};
let maxParticipantsSeen = 0;
let matchState = {
    playingType: PLAYING_TYPE,
    timerDurationSeconds: TIMER_DURATION_SECONDS,
    scoreTarget: SCORE_TARGET,
    startedAtMs: Date.now(),
    isEnded: false,
    winnerId: null,
    reason: null
};

app.use(express.static(PUBLIC_DIRECTORY));

const appendDotCoordinates = (coordinatesList) => {
    for (let i = 0; i < coordinatesList.length; i++) {
        addWorldObject(WORLD_OBJECT_TYPES.DOT, coordinatesList[i]);
    }
}

const getRoomNameForGame = (gameId) => `game:${gameId}`;

const toSafeDisplayName = (name) => {
    const normalizedName = `${name ?? ''}`.trim();
    if (!normalizedName) {
        return 'Anonymous';
    }

    return normalizedName.slice(0, 24);
};

const createGameId = () => `game-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const toSafePlayingType = (playingType) => {
    if (Object.values(PLAYING_TYPES).includes(playingType)) {
        return playingType;
    }

    return PLAYING_TYPES.LAST_MAN_STANDING;
};

const getActiveGamesPayload = () => {
    const activeGames = [];
    for (const gameId in activeGamesById) {
        const game = activeGamesById[gameId];
        activeGames.push({
            id: game.id,
            name: game.name,
            ownerName: game.ownerName,
            ownerSocketId: game.ownerSocketId,
            playingType: game.playingType,
            mapType: game.mapType,
            mapName: game.mapName,
            borderCollisionResponse: game.borderCollisionResponse,
            dangerousObjectCollisionResponse: game.dangerousObjectCollisionResponse,
            playerCount: game.playerIds.size
        });
    }

    activeGames.sort((firstGame, secondGame) => secondGame.playerCount - firstGame.playerCount);
    return activeGames;
};

const broadcastActiveGames = () => {
    io.emit(SOCKET_EVENTS.ACTIVE_GAMES_UPDATED, getActiveGamesPayload());
};

const createGame = (gameName, ownerName, ownerSocketId, playingType, mapType, borderCollisionResponse, dangerousObjectCollisionResponse) => {
    const gameId = createGameId();
    const safeMapType = toSafeMapType(mapType);
    const mapDefinition = getMapDefinition(safeMapType);
    const safeBorderCollisionResponse = toSafeCollisionResponse(
        borderCollisionResponse,
        DEFAULT_BORDER_COLLISION_RESPONSE
    );
    const safeDangerousObjectCollisionResponse = toSafeCollisionResponse(
        dangerousObjectCollisionResponse,
        DEFAULT_DANGEROUS_OBJECT_COLLISION_RESPONSE
    );

    activeGamesById[gameId] = {
        id: gameId,
        name: `${gameName ?? ''}`.trim() || `Game ${Object.keys(activeGamesById).length + 1}`,
        ownerName: toSafeDisplayName(ownerName),
        ownerSocketId,
        playingType: toSafePlayingType(playingType),
        mapType: safeMapType,
        mapName: mapDefinition.name,
        borderCollisionResponse: safeBorderCollisionResponse,
        dangerousObjectCollisionResponse: safeDangerousObjectCollisionResponse,
        playerIds: new Set()
    };

    return activeGamesById[gameId];
};

const removeUserFromCurrentGame = (socket) => {
    const gameId = socketGameById[socket.id];
    if (!gameId) {
        return;
    }

    const roomName = getRoomNameForGame(gameId);
    socket.leave(roomName);

    if (connectedUsers[socket.id]) {
        delete connectedUsers[socket.id];
    }

    if (snakeTrailById[socket.id]) {
        delete snakeTrailById[socket.id];
    }

    const game = activeGamesById[gameId];
    if (game) {
        game.playerIds.delete(socket.id);
    }

    delete socketGameById[socket.id];
    broadcastUsers(gameId);
    broadcastActiveGames();
};

const getPlayingTypeConfig = () => {
    return {
        playingType: matchState.playingType,
        timerDurationSeconds: matchState.timerDurationSeconds,
        scoreTarget: matchState.scoreTarget
    };
};

const getPlayingTypeConfigForGame = (gameId) => {
    const game = activeGamesById[gameId];
    return {
        playingType: game?.playingType ?? matchState.playingType,
        timerDurationSeconds: matchState.timerDurationSeconds,
        scoreTarget: matchState.scoreTarget
    };
};

const getMapConfigForGame = (gameId) => {
    const game = activeGamesById[gameId];
    const mapDefinition = getMapDefinition(game?.mapType ?? currentMapType);

    return {
        mapType: game?.mapType ?? currentMapType,
        mapName: mapDefinition.name,
        width: mapDefinition.width,
        height: mapDefinition.height
    };
};

const getGameRulesForGame = (gameId) => {
    const game = activeGamesById[gameId];
    const borderCollisionResponse = game?.borderCollisionResponse ?? DEFAULT_BORDER_COLLISION_RESPONSE;
    const dangerousObjectCollisionResponse = game?.dangerousObjectCollisionResponse ?? DEFAULT_DANGEROUS_OBJECT_COLLISION_RESPONSE;

    return {
        borderCollisionEndsGame: borderCollisionResponse === COLLISION_RESPONSES.GAME_OVER,
        borderCollisionResponse,
        dangerousObjectCollisionResponse,
        playerCollisionEndsGame: RULE_PLAYER_COLLISION_ENDS_GAME,
        snakeSegmentSize: RULE_SNAKE_SEGMENT_SIZE,
        snakeHeadSizeMultiplier: RULE_SNAKE_HEAD_SIZE_MULTIPLIER,
        playerCollisionSize: RULE_PLAYER_COLLISION_SIZE,
        worldObjectsEnabled: true
    };
};

const resetMatchStateForGame = (game) => {
    matchState = {
        playingType: game?.playingType ?? PLAYING_TYPE,
        timerDurationSeconds: TIMER_DURATION_SECONDS,
        scoreTarget: SCORE_TARGET,
        startedAtMs: Date.now(),
        isEnded: false,
        winnerId: null,
        reason: null
    };
    maxParticipantsSeen = 0;
    broadcastMatchState();
};

const getMatchStatePayload = () => {
    return {
        playingType: matchState.playingType,
        timerDurationSeconds: matchState.timerDurationSeconds,
        scoreTarget: matchState.scoreTarget,
        startedAtMs: matchState.startedAtMs,
        isEnded: matchState.isEnded,
        winnerId: matchState.winnerId,
        reason: matchState.reason
    };
};

const broadcastMatchState = () => {
    io.emit(SOCKET_EVENTS.MATCH_STATE_UPDATE, getMatchStatePayload());
};

const getTopScoringUsers = () => {
    let topScore = Number.NEGATIVE_INFINITY;
    const winnerIds = [];

    for (const userId in connectedUsers) {
        const user = connectedUsers[userId];
        const score = user?.score ?? 0;

        if (score > topScore) {
            topScore = score;
            winnerIds.length = 0;
            winnerIds.push(userId);
        } else if (score === topScore) {
            winnerIds.push(userId);
        }
    }

    return {
        topScore: Number.isFinite(topScore) ? topScore : 0,
        winnerIds
    };
};

const endMatch = (winnerId, reason) => {
    if (matchState.isEnded) {
        return;
    }

    matchState.isEnded = true;
    matchState.winnerId = winnerId;
    matchState.reason = reason;
    broadcastMatchState();
};

const evaluateMatchState = () => {
    if (Object.keys(activeGamesById).length > 1) {
        return;
    }

    if (matchState.isEnded) {
        return;
    }

    const connectedUserIds = Object.keys(connectedUsers);
    const connectedUserCount = connectedUserIds.length;

    if (matchState.playingType === PLAYING_TYPES.TIMER) {
        const elapsedMs = Date.now() - matchState.startedAtMs;
        if (elapsedMs >= matchState.timerDurationSeconds * 1000) {
            const topScorers = getTopScoringUsers();
            const winnerId = topScorers.winnerIds.length === 1 ? topScorers.winnerIds[0] : null;
            endMatch(winnerId, 'timerElapsed');
        }
        return;
    }

    if (matchState.playingType === PLAYING_TYPES.FIRST_TO_SCORE) {
        for (const userId in connectedUsers) {
            const score = connectedUsers[userId]?.score ?? 0;
            if (score >= matchState.scoreTarget) {
                endMatch(userId, 'scoreTargetReached');
                return;
            }
        }
        return;
    }

    if (matchState.playingType === PLAYING_TYPES.LAST_MAN_STANDING) {
        if (maxParticipantsSeen < 2) {
            return;
        }

        if (connectedUserCount === 1) {
            endMatch(connectedUserIds[0], 'lastManStanding');
            return;
        }

        if (connectedUserCount === 0) {
            endMatch(null, 'lastManStandingDraw');
        }
    }
};

const updateSnakeTrail = (snakeId, headCoordinates, length) => {
    if (!snakeTrailById[snakeId]) {
        snakeTrailById[snakeId] = [];
    }

    const nextTrail = snakeTrailById[snakeId];
    nextTrail.unshift({ x: headCoordinates.x, y: headCoordinates.y });

    const safeLength = Math.max(1, Number.parseInt(`${length ?? INITIAL_USER_LENGTH}`, 10) || INITIAL_USER_LENGTH);
    nextTrail.splice(safeLength);
};

const getSnakeTrailForId = (snakeId) => {
    const snakeTrail = snakeTrailById[snakeId];
    if (snakeTrail && snakeTrail.length > 0) {
        return snakeTrail;
    }

    const snake = connectedUsers[snakeId];
    if (!snake) {
        return [];
    }

    return [{ x: snake.coordinates.x, y: snake.coordinates.y }];
};

const getSnakeSegmentHitbox = (segmentCoordinates, snakeWidth) => {
    return {
        x: segmentCoordinates.x,
        y: segmentCoordinates.y,
        width: snakeWidth,
        height: snakeWidth
    };
};

const getSnakeCollision = (attackerId, attackerPosition) => {
    const attackerUser = connectedUsers[attackerId];
    if (!attackerUser) {
        return null;
    }

    const attackerGameId = attackerUser.gameId;

    const attackerWidth = getSnakeWidthForUser(attackerUser);
    const attackerHitbox = getSnakeHitbox(attackerPosition, attackerWidth);

    for (const victimId in connectedUsers) {
        if (victimId === attackerId) {
            continue;
        }

        const victimUser = connectedUsers[victimId];
        if (!victimUser) {
            continue;
        }

        if (victimUser.gameId !== attackerGameId) {
            continue;
        }

        const victimWidth = getSnakeWidthForUser(victimUser);
        const victimTrail = getSnakeTrailForId(victimId);

        for (let segmentIndex = 0; segmentIndex < victimTrail.length; segmentIndex++) {
            const victimSegmentHitbox = getSnakeSegmentHitbox(victimTrail[segmentIndex], victimWidth);
            if (rectanglesOverlap(attackerHitbox, victimSegmentHitbox)) {
                return {
                    victimId,
                    segmentIndex
                };
            }
        }
    }

    return null;
};

const removeSnakeAndSpawnDots = (victimId) => {
    const victimUser = connectedUsers[victimId];
    if (!victimUser) {
        return false;
    }

    const victimTrail = getSnakeTrailForId(victimId);
    appendDotCoordinates(victimTrail);

    if (botStateById[victimId]) {
        delete botStateById[victimId];
    } else {
        io.to(victimId).emit(SOCKET_EVENTS.YOU_WERE_EATEN);
    }

    delete snakeTrailById[victimId];
    delete connectedUsers[victimId];
    return true;
};

const BOT_DIRECTIONS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
];

const findNearestWorldObjectByType = (position, worldObjectType) => {
    let nearestWorldObject = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        if (!worldObject || worldObject.type !== worldObjectType) {
            continue;
        }

        const deltaX = worldObject.x - position.x;
        const deltaY = worldObject.y - position.y;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;

        if (distanceSquared < nearestDistanceSquared) {
            nearestDistanceSquared = distanceSquared;
            nearestWorldObject = worldObject;
        }
    }

    return nearestWorldObject;
};

const getPreferredDirectionsTowardTarget = (fromPosition, targetPosition) => {
    const deltaX = targetPosition.x - fromPosition.x;
    const deltaY = targetPosition.y - fromPosition.y;

    const horizontalDirection = deltaX === 0
        ? null
        : { x: Math.sign(deltaX), y: 0 };
    const verticalDirection = deltaY === 0
        ? null
        : { x: 0, y: Math.sign(deltaY) };

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        return [horizontalDirection, verticalDirection].filter(Boolean);
    }

    return [verticalDirection, horizontalDirection].filter(Boolean);
};

const areDirectionsEqual = (firstDirection, secondDirection) => {
    if (!firstDirection || !secondDirection) {
        return false;
    }

    return firstDirection.x === secondDirection.x && firstDirection.y === secondDirection.y;
};

const pushUniqueDirection = (directionList, direction) => {
    if (!direction) {
        return;
    }

    if (directionList.some((existingDirection) => areDirectionsEqual(existingDirection, direction))) {
        return;
    }

    directionList.push(direction);
};

const wouldCollideWithDangerousWorldObject = (position, snakeWidth = RULE_SNAKE_SEGMENT_SIZE) => {
    const collidedWorldObjectId = getCollidedWorldObjectId(position, snakeWidth);
    if (!collidedWorldObjectId) {
        return false;
    }

    const collidedWorldObject = worldObjects[collidedWorldObjectId];
    if (!collidedWorldObject) {
        return false;
    }

    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[collidedWorldObject.type];
    if (!objectDefinition) {
        return false;
    }

    return objectDefinition.effects.instantLose;
};

const getRandomBotDirection = () => {
    const directionIndex = Math.floor(Math.random() * BOT_DIRECTIONS.length);
    return BOT_DIRECTIONS[directionIndex];
};

const clampPosition = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
};

const getSnakeHitbox = (position, snakeWidth = RULE_SNAKE_SEGMENT_SIZE) => {
    return {
        x: position.x,
        y: position.y,
        width: snakeWidth,
        height: snakeWidth
    };
};

const getCollidedWorldObjectId = (position, snakeWidth = RULE_SNAKE_SEGMENT_SIZE) => {
    const snakeHitbox = getSnakeHitbox(position, snakeWidth);

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
    botUser.headEmoji = getRandomAnimalHeadEmoji();
    setSnakeLengthForUser(botUser, INITIAL_USER_LENGTH);
    setSnakeWidthForUser(botUser, INITIAL_USER_WIDTH);
    botState.direction = getRandomBotDirection();
    snakeTrailById[botId] = [{ x: botUser.coordinates.x, y: botUser.coordinates.y }];
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

    applyWorldObjectEffectsToUser(botUser, worldObjectDefinition);

    if (worldObjectDefinition.removeOnHit) {
        delete worldObjects[worldObjectId];
        return { usersChanged: true, worldObjectsChanged: true };
    }

    return { usersChanged: true, worldObjectsChanged: false };
};

const getBotSnakeCollision = (botId, botPosition) => {
    return getSnakeCollision(botId, botPosition);
};

const initializeBots = () => {
    for (let index = 0; index < BOT_COUNT; index++) {
        const botId = `bot-${index + 1}`;
        const startPosition = getSafeStartPosition(boardWidth, boardHeight);

        connectedUsers[botId] = {
            id: botId,
            coordinates: startPosition,
            color: getRandomColor(),
            headEmoji: getRandomAnimalHeadEmoji(),
            score: INITIAL_USER_SCORE,
            l: INITIAL_USER_LENGTH,
            w: INITIAL_USER_WIDTH
        };

        snakeTrailById[botId] = [{ x: startPosition.x, y: startPosition.y }];

        botStateById[botId] = {
            direction: getRandomBotDirection()
        };
    }
};

const updateBotPositions = () => {
    if (matchState.isEnded) {
        return;
    }

    let usersChanged = false;
    let worldObjectsChanged = false;

    for (const botId in botStateById) {
        const botUser = connectedUsers[botId];
        const botState = botStateById[botId];

        if (!botUser || !botState) {
            continue;
        }

        const currentPosition = botUser.coordinates;
        const botWidth = getSnakeWidthForUser(botUser);
        const maxX = Math.max(0, boardWidth - botWidth);
        const maxY = Math.max(0, boardHeight - botWidth);
        const nearestMonster = findNearestWorldObjectByType(botUser.coordinates, WORLD_OBJECT_TYPES.MONSTER);
        const candidateDirections = [];

        if (nearestMonster) {
            const preferredDirections = getPreferredDirectionsTowardTarget(botUser.coordinates, nearestMonster);
            for (const preferredDirection of preferredDirections) {
                pushUniqueDirection(candidateDirections, preferredDirection);
            }
        }

        if (!nearestMonster && Math.random() < BOT_DIRECTION_CHANGE_CHANCE) {
            pushUniqueDirection(candidateDirections, getRandomBotDirection());
        }

        pushUniqueDirection(candidateDirections, botState.direction);

        for (const fallbackDirection of BOT_DIRECTIONS) {
            pushUniqueDirection(candidateDirections, fallbackDirection);
        }

        let nextDirection = null;
        let nextPosition = null;

        for (const candidateDirection of candidateDirections) {
            const candidatePosition = {
                x: currentPosition.x + candidateDirection.x * BOT_STEP,
                y: currentPosition.y + candidateDirection.y * BOT_STEP
            };

            const outOfBounds =
                candidatePosition.x < 0 ||
                candidatePosition.x > maxX ||
                candidatePosition.y < 0 ||
                candidatePosition.y > maxY;

            if (outOfBounds) {
                continue;
            }

            if (wouldCollideWithDangerousWorldObject(candidatePosition, botWidth)) {
                continue;
            }

            nextDirection = candidateDirection;
            nextPosition = candidatePosition;
            break;
        }

        if (!nextPosition) {
            const clampedPosition = {
                x: clampPosition(currentPosition.x, 0, maxX),
                y: clampPosition(currentPosition.y, 0, maxY)
            };

            if (clampedPosition.x !== currentPosition.x || clampedPosition.y !== currentPosition.y) {
                botUser.coordinates = clampedPosition;
                usersChanged = true;
            }

            continue;
        }

        botState.direction = nextDirection;

        botUser.coordinates = {
            x: clampPosition(nextPosition.x, 0, maxX),
            y: clampPosition(nextPosition.y, 0, maxY)
        };
        updateSnakeTrail(botId, botUser.coordinates, getSnakeLengthForUser(botUser));
        usersChanged = true;

        const snakeCollision = getBotSnakeCollision(botId, botUser.coordinates);
        if (snakeCollision) {
            const victimUser = connectedUsers[snakeCollision.victimId];
            const attackerLength = getSnakeLengthForUser(botUser);
            const victimLength = getSnakeLengthForUser(victimUser);

            if (attackerLength > victimLength) {
                const removed = removeSnakeAndSpawnDots(snakeCollision.victimId);
                if (removed) {
                    growSnakeAfterEatingSnake(botUser, victimUser);
                }
                usersChanged = usersChanged || removed;
                worldObjectsChanged = worldObjectsChanged || removed;
                continue;
            }

            botState.direction = { x: -botState.direction.x, y: -botState.direction.y };
            botUser.coordinates = { x: currentPosition.x, y: currentPosition.y };
            updateSnakeTrail(botId, botUser.coordinates, getSnakeLengthForUser(botUser));
            usersChanged = true;
            continue;
        }

        const collidedWorldObjectId = getCollidedWorldObjectId(botUser.coordinates, botWidth);
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
        evaluateMatchState();
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
                scoreDelta: typeDefinition.effects.scoreDelta,
                widthDelta: typeDefinition.effects.widthDelta
            }
        };
    }

    return worldObjectDefinitions;
};

const broadcastWorldObjects = (gameId) => {
    if (gameId) {
        io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, worldObjects);
        return;
    }

    io.emit(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, worldObjects);
};

const joinUserToGame = (socket, gameId, playerName) => {
    const game = activeGamesById[gameId];
    if (!game) {
        socket.emit(SOCKET_EVENTS.JOIN_GAME_ERROR, 'Game not found');
        return;
    }

    removeUserFromCurrentGame(socket);

    const isFirstPlayerInGame = game.playerIds.size === 0;
    const isRejoiningAfterMatchEnd = matchState.isEnded;
    if (isFirstPlayerInGame || isRejoiningAfterMatchEnd) {
        applyMapToWorld(game.mapType);
    }

    if (isFirstPlayerInGame || isRejoiningAfterMatchEnd) {
        resetMatchStateForGame(game);
    }

    const userColor = getRandomColor();
    const userHeadEmoji = getRandomAnimalHeadEmoji();
    const startPosition = getSafeStartPosition(boardWidth, boardHeight);
    const roomName = getRoomNameForGame(gameId);
    const safePlayerName = toSafeDisplayName(playerName);

    socketGameById[socket.id] = gameId;
    game.playerIds.add(socket.id);
    socket.join(roomName);

    connectedUsers[socket.id] = {
        id: socket.id,
        name: safePlayerName,
        gameId,
        coordinates: startPosition,
        color: userColor,
        headEmoji: userHeadEmoji,
        score: INITIAL_USER_SCORE,
        l: INITIAL_USER_LENGTH,
        w: INITIAL_USER_WIDTH
    };

    maxParticipantsSeen = Math.max(maxParticipantsSeen, Object.keys(connectedUsers).length);
    snakeTrailById[socket.id] = [{ x: startPosition.x, y: startPosition.y }];

    socket.emit(SOCKET_EVENTS.JOINED_GAME, {
        gameId,
        gameName: game.name,
        playerName: safePlayerName,
        playingType: game.playingType,
        mapType: game.mapType,
        mapName: game.mapName
    });
    socket.emit(SOCKET_EVENTS.ASSIGN_COLOR, userColor);
    socket.emit(SOCKET_EVENTS.ASSIGN_HEAD_EMOJI, userHeadEmoji);
    socket.emit(SOCKET_EVENTS.SET_PLAYING_TYPE, getPlayingTypeConfigForGame(gameId));
    socket.emit(SOCKET_EVENTS.MATCH_STATE_UPDATE, getMatchStatePayload());
    socket.emit(SOCKET_EVENTS.SET_WORLD_OBJECT_DEFINITIONS, getWorldObjectDefinitionsForClient());
    socket.emit(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, worldObjects);
    socket.emit(SOCKET_EVENTS.SET_MOVEMENT_CONFIG, {
        baseStep: MOVEMENT_BASE_STEP,
        ticksPerSecond: MOVEMENT_TICKS_PER_SECOND,
        boostMultiplier: MOVEMENT_BOOST_MULTIPLIER
    });
    socket.emit(SOCKET_EVENTS.SET_GAME_RULES, getGameRulesForGame(gameId));
    socket.emit(SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, {
        virtualWidth: getMapConfigForGame(gameId).width,
        virtualHeight: getMapConfigForGame(gameId).height
    });
    socket.emit(SOCKET_EVENTS.SET_START_POSITION, startPosition);

    broadcastUsers(gameId);
    broadcastActiveGames();
};

const endGameByOwner = (socket, gameId) => {
    const game = activeGamesById[gameId];
    if (!game) {
        socket.emit(SOCKET_EVENTS.JOIN_GAME_ERROR, 'Game not found');
        return;
    }

    if (game.ownerSocketId !== socket.id) {
        socket.emit(SOCKET_EVENTS.JOIN_GAME_ERROR, 'Only the owner can end this game');
        return;
    }

    const roomName = getRoomNameForGame(gameId);
    const playerIds = Array.from(game.playerIds);

    for (const playerId of playerIds) {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
            playerSocket.leave(roomName);
            playerSocket.emit(SOCKET_EVENTS.GAME_ENDED, {
                gameId,
                gameName: game.name
            });
        }

        if (connectedUsers[playerId]) {
            delete connectedUsers[playerId];
        }

        if (snakeTrailById[playerId]) {
            delete snakeTrailById[playerId];
        }

        delete socketGameById[playerId];
    }

    game.playerIds.clear();
    delete activeGamesById[gameId];

    broadcastUsers(gameId);
    broadcastActiveGames();
};


io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit(SOCKET_EVENTS.ACTIVE_GAMES_UPDATED, getActiveGamesPayload());

    socket.on(SOCKET_EVENTS.LIST_ACTIVE_GAMES, () => {
        socket.emit(SOCKET_EVENTS.ACTIVE_GAMES_UPDATED, getActiveGamesPayload());
    });

    socket.on(SOCKET_EVENTS.CREATE_GAME, ({
        gameName,
        playerName,
        playingType,
        mapType,
        borderCollisionResponse,
        dangerousObjectCollisionResponse,
        autoJoin
    }) => {
        const game = createGame(
            gameName,
            playerName,
            socket.id,
            playingType,
            mapType,
            borderCollisionResponse,
            dangerousObjectCollisionResponse
        );
        if (autoJoin) {
            joinUserToGame(socket, game.id, playerName);
            return;
        }

        broadcastActiveGames();
    });

    socket.on(SOCKET_EVENTS.JOIN_GAME, ({ gameId, playerName }) => {
        joinUserToGame(socket, gameId, playerName);
    });

    socket.on(SOCKET_EVENTS.END_GAME, ({ gameId }) => {
        endGameByOwner(socket, gameId);
    });

    socket.on(SOCKET_EVENTS.SNAKE_EATEN, ({ victimId }) => {
        const attackerUser = connectedUsers[socket.id];
        const victimUser = connectedUsers[victimId];
        const gameId = socketGameById[socket.id];

        if (!attackerUser || !victimUser || victimId === socket.id) {
            return;
        }

        if (victimUser.gameId !== gameId) {
            return;
        }

        if (getSnakeLengthForUser(attackerUser) <= getSnakeLengthForUser(victimUser)) {
            return;
        }

        if (!removeSnakeAndSpawnDots(victimId)) {
            return;
        }

        growSnakeAfterEatingSnake(attackerUser, victimUser);

        broadcastWorldObjects(gameId);
        broadcastUsers(gameId);
        evaluateMatchState();
    });

    socket.on(SOCKET_EVENTS.WORLD_OBJECT_HIT, (worldObjectId) => {
        const gameId = socketGameById[socket.id];
        if (!gameId) {
            return;
        }

        const hitterUser = connectedUsers[socket.id];
        if (!hitterUser) {
            return;
        }

        const worldObject = worldObjects[worldObjectId];
        if (!worldObject) {
            return;
        }

        const worldObjectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject.type];
        if (!worldObjectDefinition) {
            return;
        }

        const hitterWidth = getSnakeWidthForUser(hitterUser);
        const hitterHitbox = getSnakeHitbox(hitterUser.coordinates, hitterWidth);
        const worldObjectRect = getWorldObjectRect(worldObject);
        if (!rectanglesOverlap(hitterHitbox, worldObjectRect)) {
            return;
        }

        applyWorldObjectEffectsToUser(hitterUser, worldObjectDefinition);

        if (worldObjectDefinition.removeOnHit) {
            delete worldObjects[worldObjectId];
            broadcastWorldObjects(gameId);
        }

        broadcastUsers(gameId);
        evaluateMatchState();
    });

    socket.on(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, (headCoordinatesUpdate) => {
        if (matchState.isEnded) {
            return;
        }

        const gameId = socketGameById[socket.id];
        if (!gameId) {
            return;
        }

        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].coordinates = { x: headCoordinatesUpdate.x, y: headCoordinatesUpdate.y };
            const authoritativeLength = getSnakeLengthForUser(connectedUsers[socket.id]);
            const authoritativeWidth = getSnakeWidthForUser(connectedUsers[socket.id]);
            updateSnakeTrail(socket.id, connectedUsers[socket.id].coordinates, authoritativeLength);

            const snakeCollision = getSnakeCollision(socket.id, connectedUsers[socket.id].coordinates);
            if (snakeCollision) {
                const attackerUser = connectedUsers[socket.id];
                const victimUser = connectedUsers[snakeCollision.victimId];

                if (attackerUser && victimUser && getSnakeLengthForUser(attackerUser) > getSnakeLengthForUser(victimUser)) {
                    const removed = removeSnakeAndSpawnDots(snakeCollision.victimId);
                    if (removed) {
                        growSnakeAfterEatingSnake(attackerUser, victimUser);
                        broadcastWorldObjects(gameId);
                        broadcastUsers(gameId);
                        evaluateMatchState();
                    }
                }
            }

            io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.UPDATE_COORDINATES_OF_HEAD, {
                id: socket.id,
                coordinatesOfHead: { x: headCoordinatesUpdate.x, y: headCoordinatesUpdate.y },
                l: getSnakeLengthForUser(connectedUsers[socket.id]),
                w: authoritativeWidth
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');

        const gameId = socketGameById[socket.id];
        removeUserFromCurrentGame(socket);
        if (gameId) {
            broadcastUsers(gameId);
        }
        evaluateMatchState();

    });
});

const broadcastUsers = (gameId) => {
    if (!gameId) {
        io.emit(SOCKET_EVENTS.UPDATE_USERS, connectedUsers);
        return;
    }

    const usersForGame = {};
    for (const userId in connectedUsers) {
        const user = connectedUsers[userId];
        const isBotUser = Boolean(botStateById[userId]);
        if (!isBotUser && user.gameId !== gameId) {
            continue;
        }
        usersForGame[userId] = user;
    }

    io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.UPDATE_USERS, usersForGame);
}

initializeBots();
maxParticipantsSeen = Math.max(maxParticipantsSeen, Object.keys(connectedUsers).length);
setInterval(updateBotPositions, BOT_MOVE_INTERVAL_MS);
setInterval(evaluateMatchState, 250);

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});