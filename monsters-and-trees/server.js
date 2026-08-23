const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const SOCKET_EVENTS = require('./public/socket-events.js');
const RTC_EVENTS = require('./public/rtc-events.js');
const { isAudioRtcEnabled, getIceServersConfig } = require('./server/audio-feature-flag.js');
const { createRtcSignalingState, registerRtcSignalingHandlers } = require('./server/rtc-signaling.js');
const {
    WORLD_OBJECT_TYPES,
    getRandomFoodForType,
    getFoodEnergyKcal,
    DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS
} = require('./public/world-object-definitions.js');
const { getHeadPickupHitbox } = require('./public/snake-geometry.js');
const {
    COLLISION_RESPONSES,
    DEFAULT_FOOD_HIT_BEHAVIOR,
    FOOD_HIT_BEHAVIORS,
    INITIAL_USER_LENGTH,
    INITIAL_USER_WIDTH,
    MAX_ENERGY_KCAL,
    BOOST_DRAIN_KCAL_PER_SECOND,
    MIN_ENERGY_TO_START_BOOST,
    toSafeCollisionResponse,
    toSafeFoodHitBehavior,
    rectanglesOverlap,
    createWorldObjectHelpers,
    getSnakeLengthForUser,
    getSnakeWidthForUser,
    setSnakeLengthForUser,
    setSnakeWidthForUser,
    growSnakeAfterEatingSnake,
    applyWorldObjectEffectsToUser,
    getEnergyForUser,
    canStartBoost,
    drainBoostEnergy
} = require('./server/game-logic.js');

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
const MOVEMENT_BASE_STEP = 2;
const MOVEMENT_TICKS_PER_SECOND = 30;
const MOVEMENT_BOOST_MULTIPLIER = 2;
const RULE_PLAYER_COLLISION_ENDS_GAME = true;
const RULE_SNAKE_SEGMENT_SIZE = 6;
const RULE_SNAKE_HEAD_SIZE_MULTIPLIER = 2;
const RULE_PLAYER_COLLISION_SIZE = 6;

// Clients report their own head position, so the server caps how far a snake may
// travel between two reports. Generous enough to absorb lag spikes and batching.
const MOVEMENT_LAG_TOLERANCE_TICKS = 10;
const MAX_MOVEMENT_DISTANCE_PER_UPDATE =
    MOVEMENT_BASE_STEP * MOVEMENT_BOOST_MULTIPLIER * MOVEMENT_LAG_TOLERANCE_TICKS;

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
const INITIAL_MONSTER_COUNT = 120;
const INITIAL_CLOUD_COUNT = 48;
const INITIAL_DOT_COUNT = 220;
const INITIAL_THORN_COUNT = 10;
const INITIAL_PORTAL_COUNT = 8;
const INITIAL_USER_SCORE = 0;
const PUBLIC_DIRECTORY = 'public';
const WORLD_OBJECT_TYPE_DEFINITIONS = JSON.parse(JSON.stringify(DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS));
const { getWorldObjectRect } = createWorldObjectHelpers(WORLD_OBJECT_TYPE_DEFINITIONS);

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
const AUDIO_RTC_ENABLED = isAudioRtcEnabled();
const AUDIO_RTC_ICE_SERVERS = getIceServersConfig();
const DEFAULT_MAP_TYPE = MAP_TYPES.CLASSIC;
const DEFAULT_BORDER_COLLISION_RESPONSE = COLLISION_RESPONSES.GAME_OVER;
const DEFAULT_DANGEROUS_OBJECT_COLLISION_RESPONSE = COLLISION_RESPONSES.GAME_OVER;

const MAP_DEFINITIONS = {
    [MAP_TYPES.CLASSIC]: {
        name: 'Classic Plains',
        width: 6400,
        height: 6400,
        treeCount: INITIAL_TREE_COUNT,
        monsterCount: INITIAL_MONSTER_COUNT,
        cloudCount: INITIAL_CLOUD_COUNT,
        dotCount: INITIAL_DOT_COUNT,
        thornCount: INITIAL_THORN_COUNT,
        portalCount: INITIAL_PORTAL_COUNT
    },
    [MAP_TYPES.FOREST]: {
        name: 'Dense Forest',
        width: 7200,
        height: 5600,
        treeCount: 120,
        monsterCount: 96,
        cloudCount: 36,
        dotCount: 160,
        thornCount: 6,
        portalCount: 10
    },
    [MAP_TYPES.THORNS]: {
        name: 'Thorn Field',
        width: 6000,
        height: 6000,
        treeCount: 18,
        monsterCount: 140,
        cloudCount: 40,
        dotCount: 180,
        thornCount: 28,
        portalCount: 12
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

const getRandomPosition = (width, height, size = RULE_SNAKE_SEGMENT_SIZE) => {
    const maxX = Math.max(0, width - size);
    const maxY = Math.max(0, height - size);
    return {
        x: Math.floor(Math.random() * (maxX + 1)),
        y: Math.floor(Math.random() * (maxY + 1))
    };
}

let connectedUsers = {};
let botStateById = {};
let snakeTrailById = {};
let activeGamesById = {};
let socketGameById = {};
const gameWorldsById = {};
const rtcSignalingState = createRtcSignalingState();

app.use(express.static(PUBLIC_DIRECTORY));

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

const clampPosition = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
};

// ---------------------------------------------------------------------------
// Per-game world state
// ---------------------------------------------------------------------------

const getWorldForGame = (gameId) => gameWorldsById[gameId];

const addWorldObject = (world, type, position) => {
    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[type];
    if (!world || !objectDefinition) {
        return null;
    }

    const worldObjectId = `${type}-${world.nextWorldObjectId}`;
    world.nextWorldObjectId += 1;

    const objectPosition = position ?? getRandomPosition(world.boardWidth, world.boardHeight, objectDefinition.size);
    const food = getRandomFoodForType(type);
    world.worldObjects[worldObjectId] = {
        id: worldObjectId,
        type,
        x: objectPosition.x,
        y: objectPosition.y,
        emoji: food?.emoji ?? null,
        quality: food?.quality ?? null
    };

    return world.worldObjects[worldObjectId];
};

const relocateWorldObject = (world, worldObject) => {
    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject?.type];
    if (!world || !worldObject || !objectDefinition) {
        return;
    }

    const nextPosition = getRandomPosition(world.boardWidth, world.boardHeight, objectDefinition.size);
    worldObject.x = nextPosition.x;
    worldObject.y = nextPosition.y;
};

const collidesWithBlockingObject = (world, position, padding = 0) => {
    const snakeRect = {
        x: position.x - padding,
        y: position.y - padding,
        width: RULE_SNAKE_SEGMENT_SIZE + padding * 2,
        height: RULE_SNAKE_SEGMENT_SIZE + padding * 2
    };

    for (const worldObjectId in world.worldObjects) {
        const worldObject = world.worldObjects[worldObjectId];
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

const getSafeStartPosition = (world) => {
    const maxX = Math.max(0, world.boardWidth - RULE_SNAKE_SEGMENT_SIZE);
    const maxY = Math.max(0, world.boardHeight - RULE_SNAKE_SEGMENT_SIZE);

    for (let i = 0; i < MAX_SPAWN_ATTEMPTS; i++) {
        const candidate = {
            x: Math.floor(Math.random() * (maxX + 1)),
            y: Math.floor(Math.random() * (maxY + 1))
        };

        if (!collidesWithBlockingObject(world, candidate)) {
            return candidate;
        }
    }

    const scanStep = Math.max(1, RULE_SNAKE_SEGMENT_SIZE);
    for (let y = 0; y <= maxY; y += scanStep) {
        for (let x = 0; x <= maxX; x += scanStep) {
            const candidate = { x, y };
            if (!collidesWithBlockingObject(world, candidate)) {
                return candidate;
            }
        }
    }

    return { x: 0, y: 0 };
};

const populateWorldObjects = (world) => {
    const mapDefinition = getMapDefinition(world.mapType);

    world.worldObjects = {};
    world.nextWorldObjectId = 1;
    world.frozenSnakeCorpses = {};
    world.nextCorpseId = 1;

    for (let i = 0; i < mapDefinition.treeCount; i++) {
        addWorldObject(world, WORLD_OBJECT_TYPES.TREE);
    }

    for (let i = 0; i < mapDefinition.monsterCount; i++) {
        addWorldObject(world, WORLD_OBJECT_TYPES.MONSTER);
    }

    for (let i = 0; i < mapDefinition.cloudCount; i++) {
        addWorldObject(world, WORLD_OBJECT_TYPES.CLOUD);
    }

    for (let i = 0; i < (mapDefinition.dotCount ?? 0); i++) {
        addWorldObject(world, WORLD_OBJECT_TYPES.DOT);
    }

    for (let i = 0; i < mapDefinition.thornCount; i++) {
        addWorldObject(world, WORLD_OBJECT_TYPES.THORN);
    }

    for (let i = 0; i < (mapDefinition.portalCount ?? 0); i++) {
        addWorldObject(world, WORLD_OBJECT_TYPES.PORTAL);
    }
};

const createMatchStateForGame = (game) => {
    return {
        playingType: game?.playingType ?? PLAYING_TYPE,
        timerDurationSeconds: TIMER_DURATION_SECONDS,
        scoreTarget: SCORE_TARGET,
        startedAtMs: Date.now(),
        isEnded: false,
        winnerId: null,
        winnerName: null,
        reason: null
    };
};

const getUsersInGame = (gameId) => {
    const usersForGame = {};

    for (const userId in connectedUsers) {
        if (connectedUsers[userId]?.gameId === gameId) {
            usersForGame[userId] = connectedUsers[userId];
        }
    }

    return usersForGame;
};

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
            foodHitBehavior: game.foodHitBehavior,
            playerCount: game.playerIds.size
        });
    }

    activeGames.sort((firstGame, secondGame) => secondGame.playerCount - firstGame.playerCount);
    return activeGames;
};

const broadcastActiveGames = () => {
    io.emit(SOCKET_EVENTS.ACTIVE_GAMES_UPDATED, getActiveGamesPayload());
};

const createGame = (
    gameName,
    ownerName,
    ownerSocketId,
    playingType,
    mapType,
    borderCollisionResponse,
    dangerousObjectCollisionResponse,
    foodHitBehavior
) => {
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
    const safeFoodHitBehavior = toSafeFoodHitBehavior(foodHitBehavior);

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
        foodHitBehavior: safeFoodHitBehavior,
        playerIds: new Set()
    };

    return activeGamesById[gameId];
};

const getPlayingTypeConfigForGame = (gameId) => {
    const game = activeGamesById[gameId];
    const world = getWorldForGame(gameId);

    return {
        playingType: game?.playingType ?? PLAYING_TYPE,
        timerDurationSeconds: world?.matchState.timerDurationSeconds ?? TIMER_DURATION_SECONDS,
        scoreTarget: world?.matchState.scoreTarget ?? SCORE_TARGET
    };
};

const getMapConfigForGame = (gameId) => {
    const game = activeGamesById[gameId];
    const mapType = toSafeMapType(game?.mapType);
    const mapDefinition = getMapDefinition(mapType);

    return {
        mapType,
        mapName: mapDefinition.name,
        width: mapDefinition.width,
        height: mapDefinition.height
    };
};

const getGameRulesForGame = (gameId) => {
    const game = activeGamesById[gameId];
    const borderCollisionResponse = game?.borderCollisionResponse ?? DEFAULT_BORDER_COLLISION_RESPONSE;
    const dangerousObjectCollisionResponse = game?.dangerousObjectCollisionResponse ?? DEFAULT_DANGEROUS_OBJECT_COLLISION_RESPONSE;
    const foodHitBehavior = game?.foodHitBehavior ?? DEFAULT_FOOD_HIT_BEHAVIOR;

    return {
        borderCollisionEndsGame: borderCollisionResponse === COLLISION_RESPONSES.GAME_OVER,
        borderCollisionResponse,
        dangerousObjectCollisionResponse,
        foodHitBehavior,
        playerCollisionEndsGame: RULE_PLAYER_COLLISION_ENDS_GAME,
        snakeSegmentSize: RULE_SNAKE_SEGMENT_SIZE,
        snakeHeadSizeMultiplier: RULE_SNAKE_HEAD_SIZE_MULTIPLIER,
        playerCollisionSize: RULE_PLAYER_COLLISION_SIZE,
        worldObjectsEnabled: true
    };
};

const getMatchStatePayload = (gameId) => {
    const world = getWorldForGame(gameId);
    if (!world) {
        return null;
    }

    return {
        playingType: world.matchState.playingType,
        timerDurationSeconds: world.matchState.timerDurationSeconds,
        scoreTarget: world.matchState.scoreTarget,
        startedAtMs: world.matchState.startedAtMs,
        isEnded: world.matchState.isEnded,
        winnerId: world.matchState.winnerId,
        winnerName: world.matchState.winnerName,
        reason: world.matchState.reason
    };
};

const broadcastMatchState = (gameId) => {
    const payload = getMatchStatePayload(gameId);
    if (!payload) {
        return;
    }

    io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.MATCH_STATE_UPDATE, payload);
};

const resetMatchStateForGame = (game, world) => {
    world.matchState = createMatchStateForGame(game);
    world.maxHumanParticipantsSeen = 0;
    broadcastMatchState(game.id);
};

const broadcastUsers = (gameId) => {
    if (!gameId) {
        return;
    }

    io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.UPDATE_USERS, getUsersInGame(gameId));
}

const broadcastWorldObjects = (gameId) => {
    const world = getWorldForGame(gameId);
    if (!world) {
        return;
    }

    io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, world.worldObjects);
};

const broadcastFrozenSnakeCorpses = (gameId) => {
    const world = getWorldForGame(gameId);
    if (!world) {
        return;
    }

    io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.UPDATE_FROZEN_SNAKES, world.frozenSnakeCorpses);
};

// Energy is private: a player only ever sees their own battery.
const emitEnergyUpdate = (socketId) => {
    const user = connectedUsers[socketId];
    if (!user) {
        return;
    }

    io.to(socketId).emit(SOCKET_EVENTS.ENERGY_UPDATE, {
        energy: getEnergyForUser(user),
        maxEnergy: MAX_ENERGY_KCAL,
        isBoosting: Boolean(user.isBoosting)
    });
};

const getTopScoringUsers = (gameId) => {
    let topScore = Number.NEGATIVE_INFINITY;
    const winnerIds = [];
    const usersInGame = getUsersInGame(gameId);

    for (const userId in usersInGame) {
        const score = usersInGame[userId]?.score ?? 0;

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

const isBotUserId = (userId) => Boolean(botStateById[userId]);

const getHumanUserIdsInGame = (gameId) => Object.keys(getUsersInGame(gameId)).filter((userId) => !isBotUserId(userId));

const endMatch = (gameId, winnerId, reason) => {
    const world = getWorldForGame(gameId);
    if (!world || world.matchState.isEnded) {
        return;
    }

    world.matchState.isEnded = true;
    world.matchState.winnerId = winnerId;
    world.matchState.winnerName = winnerId ? (connectedUsers[winnerId]?.name ?? null) : null;
    world.matchState.reason = reason;
    broadcastMatchState(gameId);
};

const evaluateMatchState = (gameId) => {
    const world = getWorldForGame(gameId);
    if (!world || world.matchState.isEnded) {
        return;
    }

    const usersInGame = getUsersInGame(gameId);

    if (world.matchState.playingType === PLAYING_TYPES.TIMER) {
        const elapsedMs = Date.now() - world.matchState.startedAtMs;
        if (elapsedMs >= world.matchState.timerDurationSeconds * 1000) {
            const topScorers = getTopScoringUsers(gameId);
            const winnerId = topScorers.winnerIds.length === 1 ? topScorers.winnerIds[0] : null;
            endMatch(gameId, winnerId, 'timerElapsed');
        }
        return;
    }

    if (world.matchState.playingType === PLAYING_TYPES.FIRST_TO_SCORE) {
        for (const userId in usersInGame) {
            const score = usersInGame[userId]?.score ?? 0;
            if (score >= world.matchState.scoreTarget) {
                endMatch(gameId, userId, 'scoreTargetReached');
                return;
            }
        }
        return;
    }

    if (world.matchState.playingType === PLAYING_TYPES.LAST_MAN_STANDING) {
        // Bots share the connectedUsers map, but only human players decide this mode.
        if (world.maxHumanParticipantsSeen < 2) {
            return;
        }

        const humanUserIdsInGame = getHumanUserIdsInGame(gameId);

        if (humanUserIdsInGame.length === 1) {
            endMatch(gameId, humanUserIdsInGame[0], 'lastManStanding');
            return;
        }

        if (humanUserIdsInGame.length === 0) {
            endMatch(gameId, null, 'lastManStandingDraw');
        }
    }
};

const evaluateAllMatchStates = () => {
    for (const gameId in gameWorldsById) {
        evaluateMatchState(gameId);
    }
};

// ---------------------------------------------------------------------------
// Snake helpers
// ---------------------------------------------------------------------------

const updateSnakeTrail = (snakeId, headCoordinates, length) => {
    if (!snakeTrailById[snakeId]) {
        snakeTrailById[snakeId] = [];
    }

    const nextTrail = snakeTrailById[snakeId];
    nextTrail.unshift({ x: headCoordinates.x, y: headCoordinates.y });

    const parsedLength = Number.parseInt(`${length ?? INITIAL_USER_LENGTH}`, 10);
    const safeLength = Math.max(1, Number.isNaN(parsedLength) ? INITIAL_USER_LENGTH : parsedLength);
    nextTrail.splice(safeLength);
};

// Portals drop the snake at a fresh safe spot; the trail collapses so the body
// follows the head out instead of stretching across the map.
const teleportUserThroughPortal = (world, userId, user) => {
    const exitPosition = getSafeStartPosition(world);
    user.coordinates = { x: exitPosition.x, y: exitPosition.y };
    snakeTrailById[userId] = [{ x: exitPosition.x, y: exitPosition.y }];

    return exitPosition;
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

const getSnakeHitbox = (position, snakeWidth = RULE_SNAKE_SEGMENT_SIZE) => {
    return {
        x: position.x,
        y: position.y,
        width: snakeWidth,
        height: snakeWidth
    };
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

    const attackerWidth = getSnakeWidthForUser(attackerUser);
    const attackerHitbox = getSnakeHitbox(attackerPosition, attackerWidth);
    const usersInGame = getUsersInGame(attackerUser.gameId);

    for (const victimId in usersInGame) {
        if (victimId === attackerId) {
            continue;
        }

        const victimUser = usersInGame[victimId];
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

const removeSnakeAndFreezeBody = (victimId, createCorpse = true) => {
    const victimUser = connectedUsers[victimId];
    if (!victimUser) {
        return false;
    }

    const world = getWorldForGame(victimUser.gameId);
    const victimTrail = getSnakeTrailForId(victimId);
    const bodySegments = victimTrail.slice(1); // exclude head

    if (world && createCorpse && bodySegments.length > 0) {
        const corpseId = `corpse-${world.nextCorpseId}`;
        world.nextCorpseId += 1;
        world.frozenSnakeCorpses[corpseId] = {
            segments: bodySegments,
            width: getSnakeWidthForUser(victimUser),
            color: victimUser.color
        };
    }

    if (botStateById[victimId]) {
        delete botStateById[victimId];
        if (world) {
            world.botIds = world.botIds.filter((botId) => botId !== victimId);
        }
    } else {
        io.to(victimId).emit(SOCKET_EVENTS.YOU_WERE_EATEN);
    }

    delete snakeTrailById[victimId];
    delete connectedUsers[victimId];
    return true;
};

const getCollidedWorldObjectId = (world, position, snakeWidth = RULE_SNAKE_SEGMENT_SIZE) => {
    const snakeHitbox = getSnakeHitbox(position, snakeWidth);

    for (const worldObjectId in world.worldObjects) {
        const worldObject = world.worldObjects[worldObjectId];
        const worldObjectRect = getWorldObjectRect(worldObject);
        if (rectanglesOverlap(snakeHitbox, worldObjectRect)) {
            return worldObjectId;
        }
    }

    return null;
};

const wouldCollideWithDangerousWorldObject = (world, position, snakeWidth = RULE_SNAKE_SEGMENT_SIZE) => {
    const collidedWorldObjectId = getCollidedWorldObjectId(world, position, snakeWidth);
    if (!collidedWorldObjectId) {
        return false;
    }

    const collidedWorldObject = world.worldObjects[collidedWorldObjectId];
    if (!collidedWorldObject) {
        return false;
    }

    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[collidedWorldObject.type];
    if (!objectDefinition) {
        return false;
    }

    return objectDefinition.effects.instantLose;
};

const isEdibleWorldObject = (worldObject) => {
    const objectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject?.type];
    return Boolean(objectDefinition) && objectDefinition.effects.instantLose === false;
};

const applyFoodHitBehavior = (world, worldObjectId, worldObject) => {
    const game = activeGamesById[world.gameId];
    const foodHitBehavior = game?.foodHitBehavior ?? DEFAULT_FOOD_HIT_BEHAVIOR;

    if (foodHitBehavior === FOOD_HIT_BEHAVIORS.REMOVE) {
        delete world.worldObjects[worldObjectId];
        return;
    }

    relocateWorldObject(world, worldObject);
};

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

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

// Bots head for anything edible, not just monsters.
const findNearestEdibleWorldObject = (world, position) => {
    let nearestWorldObject = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const worldObjectId in world.worldObjects) {
        const worldObject = world.worldObjects[worldObjectId];
        if (!isEdibleWorldObject(worldObject)) {
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

const resetBotUser = (botId) => {
    const botUser = connectedUsers[botId];
    const botState = botStateById[botId];
    if (!botUser || !botState) {
        return;
    }

    const world = getWorldForGame(botUser.gameId);
    if (!world) {
        return;
    }

    botUser.coordinates = getSafeStartPosition(world);
    botUser.score = INITIAL_USER_SCORE;
    botUser.headEmoji = getRandomAnimalHeadEmoji();
    setSnakeLengthForUser(botUser, INITIAL_USER_LENGTH);
    setSnakeWidthForUser(botUser, INITIAL_USER_WIDTH);
    botState.direction = getRandomBotDirection();
    snakeTrailById[botId] = [{ x: botUser.coordinates.x, y: botUser.coordinates.y }];
};

const initializeBotsForWorld = (world) => {
    for (let index = 0; index < BOT_COUNT; index++) {
        const botId = `bot-${world.gameId}-${index + 1}`;
        const startPosition = getSafeStartPosition(world);

        connectedUsers[botId] = {
            id: botId,
            name: `Bot ${index + 1}`,
            gameId: world.gameId,
            coordinates: startPosition,
            color: getRandomColor(),
            headEmoji: getRandomAnimalHeadEmoji(),
            score: INITIAL_USER_SCORE,
            l: INITIAL_USER_LENGTH,
            w: INITIAL_USER_WIDTH
        };

        snakeTrailById[botId] = [{ x: startPosition.x, y: startPosition.y }];
        botStateById[botId] = { direction: getRandomBotDirection() };
        world.botIds.push(botId);
    }
};

const removeBotsForWorld = (world) => {
    for (const botId of world.botIds) {
        delete connectedUsers[botId];
        delete botStateById[botId];
        delete snakeTrailById[botId];
    }

    world.botIds = [];
};

// Bots are removed from the world when eaten, so a fresh match respawns the full set.
const ensureBotsForWorld = (world) => {
    if (world.botIds.length === BOT_COUNT) {
        for (const botId of world.botIds) {
            resetBotUser(botId);
        }
        return;
    }

    removeBotsForWorld(world);
    initializeBotsForWorld(world);
};

const createWorldForGame = (game) => {
    const mapDefinition = getMapDefinition(game.mapType);
    const world = {
        gameId: game.id,
        mapType: toSafeMapType(game.mapType),
        boardWidth: mapDefinition.width,
        boardHeight: mapDefinition.height,
        worldObjects: {},
        nextWorldObjectId: 1,
        frozenSnakeCorpses: {},
        nextCorpseId: 1,
        botIds: [],
        maxHumanParticipantsSeen: 0,
        matchState: createMatchStateForGame(game)
    };

    gameWorldsById[game.id] = world;
    populateWorldObjects(world);
    initializeBotsForWorld(world);

    return world;
};

const getOrCreateWorldForGame = (game) => {
    return gameWorldsById[game.id] ?? createWorldForGame(game);
};

const applyWorldObjectHitForBot = (world, botId, worldObjectId) => {
    const botUser = connectedUsers[botId];
    const worldObject = world.worldObjects[worldObjectId];
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

    if (worldObject.type === WORLD_OBJECT_TYPES.PORTAL) {
        teleportUserThroughPortal(world, botId, botUser);
        return { usersChanged: true, worldObjectsChanged: false };
    }

    applyWorldObjectEffectsToUser(botUser, worldObjectDefinition, {
        quality: worldObject.quality,
        energyKcal: getFoodEnergyKcal(worldObject.type, worldObject.emoji)
    });

    if (worldObjectDefinition.removeOnHit) {
        applyFoodHitBehavior(world, worldObjectId, worldObject);
        return { usersChanged: true, worldObjectsChanged: true };
    }

    return { usersChanged: true, worldObjectsChanged: false };
};

const updateBotPositionsForWorld = (world) => {
    if (world.matchState.isEnded) {
        return;
    }

    let usersChanged = false;
    let worldObjectsChanged = false;

    for (const botId of [...world.botIds]) {
        const botUser = connectedUsers[botId];
        const botState = botStateById[botId];

        if (!botUser || !botState) {
            continue;
        }

        const currentPosition = botUser.coordinates;
        const botWidth = getSnakeWidthForUser(botUser);
        const maxX = Math.max(0, world.boardWidth - botWidth);
        const maxY = Math.max(0, world.boardHeight - botWidth);
        const nearestEdible = findNearestEdibleWorldObject(world, botUser.coordinates);
        const candidateDirections = [];

        if (nearestEdible) {
            const preferredDirections = getPreferredDirectionsTowardTarget(botUser.coordinates, nearestEdible);
            for (const preferredDirection of preferredDirections) {
                pushUniqueDirection(candidateDirections, preferredDirection);
            }
        }

        if (!nearestEdible && Math.random() < BOT_DIRECTION_CHANGE_CHANCE) {
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

            if (wouldCollideWithDangerousWorldObject(world, candidatePosition, botWidth)) {
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

        const snakeCollision = getSnakeCollision(botId, botUser.coordinates);
        if (snakeCollision) {
            const victimUser = connectedUsers[snakeCollision.victimId];
            const attackerLength = getSnakeLengthForUser(botUser);
            const victimLength = getSnakeLengthForUser(victimUser);

            if (attackerLength > victimLength) {
                // Pass createCorpse=false: bot already absorbs the full reward via
                // growSnakeAfterEatingSnake, so no corpse is created to avoid double-counting.
                const removed = removeSnakeAndFreezeBody(snakeCollision.victimId, false);
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

        const collidedWorldObjectId = getCollidedWorldObjectId(world, botUser.coordinates, botWidth);
        if (collidedWorldObjectId) {
            const result = applyWorldObjectHitForBot(world, botId, collidedWorldObjectId);
            usersChanged = usersChanged || result.usersChanged;
            worldObjectsChanged = worldObjectsChanged || result.worldObjectsChanged;
        }

        // Bot consumes frozen snake corpse segments
        const botHitbox = getSnakeHitbox(botUser.coordinates, botWidth);
        for (const corpseId in world.frozenSnakeCorpses) {
            const corpse = world.frozenSnakeCorpses[corpseId];

            for (let segIdx = corpse.segments.length - 1; segIdx >= 0; segIdx--) {
                const seg = corpse.segments[segIdx];
                const segHitbox = { x: seg.x, y: seg.y, width: corpse.width, height: corpse.width };
                if (rectanglesOverlap(botHitbox, segHitbox)) {
                    botUser.score += 1;
                    setSnakeLengthForUser(botUser, getSnakeLengthForUser(botUser) + 1);
                    corpse.segments.splice(segIdx, 1);
                    usersChanged = true;
                    worldObjectsChanged = true;
                }
            }

            if (corpse.segments.length === 0) {
                delete world.frozenSnakeCorpses[corpseId];
            }
        }
    }

    if (worldObjectsChanged) {
        broadcastWorldObjects(world.gameId);
        broadcastFrozenSnakeCorpses(world.gameId);
    }

    if (usersChanged) {
        broadcastUsers(world.gameId);
        evaluateMatchState(world.gameId);
    }
};

const updateBotPositions = () => {
    for (const gameId in gameWorldsById) {
        updateBotPositionsForWorld(gameWorldsById[gameId]);
    }
};

// ---------------------------------------------------------------------------
// Boost energy
// ---------------------------------------------------------------------------

const BOOST_DRAIN_INTERVAL_MS = 100;
let lastBoostDrainAtMs = Date.now();

const drainBoostingUsers = () => {
    const now = Date.now();
    const elapsedMs = now - lastBoostDrainAtMs;
    lastBoostDrainAtMs = now;

    for (const userId in connectedUsers) {
        const user = connectedUsers[userId];
        if (!user?.isBoosting) {
            continue;
        }

        if (drainBoostEnergy(user, elapsedMs) <= 0) {
            user.isBoosting = false;
        }

        emitEnergyUpdate(userId);
    }
};

// ---------------------------------------------------------------------------
// Movement validation
// ---------------------------------------------------------------------------

// Clients still steer themselves, so the server clamps reported positions into
// the board and rejects teleport-sized jumps.
const getValidatedHeadPosition = (world, user, requestedPosition, snakeWidth) => {
    const maxX = Math.max(0, world.boardWidth - snakeWidth);
    const maxY = Math.max(0, world.boardHeight - snakeWidth);

    let nextX = clampPosition(requestedPosition.x, 0, maxX);
    let nextY = clampPosition(requestedPosition.y, 0, maxY);

    const previousPosition = user.coordinates;
    if (!previousPosition) {
        return { x: nextX, y: nextY };
    }

    const deltaX = nextX - previousPosition.x;
    const deltaY = nextY - previousPosition.y;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > MAX_MOVEMENT_DISTANCE_PER_UPDATE) {
        const scale = MAX_MOVEMENT_DISTANCE_PER_UPDATE / distance;
        nextX = previousPosition.x + deltaX * scale;
        nextY = previousPosition.y + deltaY * scale;
    }

    return { x: nextX, y: nextY };
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

// ---------------------------------------------------------------------------
// Game membership
// ---------------------------------------------------------------------------

const removeUserFromCurrentGame = (socket) => {
    const gameId = socketGameById[socket.id];
    if (!gameId) {
        return;
    }

    const roomName = getRoomNameForGame(gameId);
    socket.leave(roomName);

    rtcSignalingState.removeParticipant(gameId, socket.id);
    socket.to(roomName).emit(RTC_EVENTS.PEER_LEFT, {
        gameId,
        peerId: socket.id
    });

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

const joinUserToGame = (socket, gameId, playerName) => {
    const game = activeGamesById[gameId];
    if (!game) {
        socket.emit(SOCKET_EVENTS.JOIN_GAME_ERROR, 'Game not found');
        return;
    }

    removeUserFromCurrentGame(socket);

    const world = getOrCreateWorldForGame(game);
    const isFirstPlayerInGame = game.playerIds.size === 0;
    const isRejoiningAfterMatchEnd = world.matchState.isEnded;

    if (isFirstPlayerInGame || isRejoiningAfterMatchEnd) {
        populateWorldObjects(world);
        resetMatchStateForGame(game, world);
        ensureBotsForWorld(world);
    }

    const userColor = getRandomColor();
    const userHeadEmoji = getRandomAnimalHeadEmoji();
    const startPosition = getSafeStartPosition(world);
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
        w: INITIAL_USER_WIDTH,
        energy: MAX_ENERGY_KCAL,
        isBoosting: false
    };

    world.maxHumanParticipantsSeen = Math.max(
        world.maxHumanParticipantsSeen,
        getHumanUserIdsInGame(gameId).length
    );
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
    socket.emit(SOCKET_EVENTS.MATCH_STATE_UPDATE, getMatchStatePayload(gameId));
    socket.emit(SOCKET_EVENTS.SET_WORLD_OBJECT_DEFINITIONS, getWorldObjectDefinitionsForClient());
    socket.emit(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, world.worldObjects);
    socket.emit(SOCKET_EVENTS.UPDATE_FROZEN_SNAKES, world.frozenSnakeCorpses);
    socket.emit(SOCKET_EVENTS.SET_MOVEMENT_CONFIG, {
        baseStep: MOVEMENT_BASE_STEP,
        ticksPerSecond: MOVEMENT_TICKS_PER_SECOND,
        boostMultiplier: MOVEMENT_BOOST_MULTIPLIER,
        maxEnergy: MAX_ENERGY_KCAL,
        boostDrainPerSecond: BOOST_DRAIN_KCAL_PER_SECOND,
        minEnergyToStartBoost: MIN_ENERGY_TO_START_BOOST
    });
    emitEnergyUpdate(socket.id);
    socket.emit(SOCKET_EVENTS.SET_GAME_RULES, getGameRulesForGame(gameId));
    const mapConfigForJoin = getMapConfigForGame(gameId);
    socket.emit(SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, {
        virtualWidth: mapConfigForJoin.width,
        virtualHeight: mapConfigForJoin.height,
        mapType: mapConfigForJoin.mapType
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

    const world = getWorldForGame(gameId);
    if (world) {
        removeBotsForWorld(world);
        delete gameWorldsById[gameId];
    }

    broadcastActiveGames();
};

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit(SOCKET_EVENTS.ACTIVE_GAMES_UPDATED, getActiveGamesPayload());
    socket.emit(RTC_EVENTS.CAPABILITIES, {
        enabled: AUDIO_RTC_ENABLED,
        iceServerConfig: AUDIO_RTC_ICE_SERVERS
    });

    if (AUDIO_RTC_ENABLED) {
        registerRtcSignalingHandlers({
            io,
            socket,
            rtcEvents: RTC_EVENTS,
            getGameIdForSocketId: (socketId) => socketGameById[socketId],
            getRoomNameForGame,
            signalingState: rtcSignalingState
        });
    }

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
        foodHitBehavior,
        autoJoin
    }) => {
        const game = createGame(
            gameName,
            playerName,
            socket.id,
            playingType,
            mapType,
            borderCollisionResponse,
            dangerousObjectCollisionResponse,
            foodHitBehavior
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

        const attackerWidth = getSnakeWidthForUser(attackerUser);
        const attackerHitbox = getSnakeHitbox(attackerUser.coordinates, attackerWidth);
        const victimWidth = getSnakeWidthForUser(victimUser);
        const victimTrail = getSnakeTrailForId(victimId);
        const actuallyOverlaps = victimTrail.some((segment) =>
            rectanglesOverlap(attackerHitbox, getSnakeSegmentHitbox(segment, victimWidth))
        );
        if (!actuallyOverlaps) {
            return;
        }

        if (!removeSnakeAndFreezeBody(victimId)) {
            return;
        }

        growSnakeAfterEatingSnake(attackerUser, victimUser);

        broadcastFrozenSnakeCorpses(gameId);
        broadcastWorldObjects(gameId);
        broadcastUsers(gameId);
        evaluateMatchState(gameId);
    });

    socket.on(SOCKET_EVENTS.SET_BOOST, (isBoostRequested) => {
        const user = connectedUsers[socket.id];
        if (!user) {
            return;
        }

        user.isBoosting = Boolean(isBoostRequested) && canStartBoost(user);
        emitEnergyUpdate(socket.id);
    });

    socket.on(SOCKET_EVENTS.PLAYER_SELF_DESTRUCTED, () => {
        const gameId = socketGameById[socket.id];
        if (!gameId) {
            return;
        }

        if (!removeSnakeAndFreezeBody(socket.id)) {
            return;
        }

        broadcastFrozenSnakeCorpses(gameId);
        broadcastUsers(gameId);
        evaluateMatchState(gameId);
    });

    socket.on(SOCKET_EVENTS.CONSUME_CORPSE_SEGMENT, ({ corpseId, segmentIndex }) => {
        const gameId = socketGameById[socket.id];
        const world = getWorldForGame(gameId);
        if (!gameId || !world) {
            return;
        }

        const consumer = connectedUsers[socket.id];
        if (!consumer) {
            return;
        }

        const corpse = world.frozenSnakeCorpses[corpseId];
        if (!corpse) {
            return;
        }

        const segment = corpse.segments[segmentIndex];
        if (!segment) {
            return;
        }

        const consumerWidth = getSnakeWidthForUser(consumer);
        const consumerHitbox = getSnakeHitbox(consumer.coordinates, consumerWidth);
        const segmentHitbox = {
            x: segment.x,
            y: segment.y,
            width: corpse.width,
            height: corpse.width
        };

        if (!rectanglesOverlap(consumerHitbox, segmentHitbox)) {
            return;
        }

        consumer.score += 1;
        setSnakeLengthForUser(consumer, getSnakeLengthForUser(consumer) + 1);

        corpse.segments.splice(segmentIndex, 1);
        if (corpse.segments.length === 0) {
            delete world.frozenSnakeCorpses[corpseId];
        }

        broadcastFrozenSnakeCorpses(gameId);
        broadcastUsers(gameId);
        evaluateMatchState(gameId);
    });

    socket.on(SOCKET_EVENTS.WORLD_OBJECT_HIT, (worldObjectId) => {
        const gameId = socketGameById[socket.id];
        const world = getWorldForGame(gameId);
        if (!gameId || !world) {
            return;
        }

        const hitterUser = connectedUsers[socket.id];
        if (!hitterUser) {
            return;
        }

        const worldObject = world.worldObjects[worldObjectId];
        if (!worldObject) {
            return;
        }

        const worldObjectDefinition = WORLD_OBJECT_TYPE_DEFINITIONS[worldObject.type];
        if (!worldObjectDefinition) {
            return;
        }

        const hitterWidth = getSnakeWidthForUser(hitterUser);
        const hitterHitbox = getHeadPickupHitbox(
            hitterUser.coordinates,
            hitterWidth,
            RULE_SNAKE_HEAD_SIZE_MULTIPLIER
        );
        const worldObjectRect = getWorldObjectRect(worldObject);
        if (!rectanglesOverlap(hitterHitbox, worldObjectRect)) {
            return;
        }

        if (worldObject.type === WORLD_OBJECT_TYPES.PORTAL) {
            const exitPosition = teleportUserThroughPortal(world, socket.id, hitterUser);
            socket.emit(SOCKET_EVENTS.TELEPORTED, exitPosition);
            broadcastUsers(gameId);
            return;
        }

        applyWorldObjectEffectsToUser(hitterUser, worldObjectDefinition, {
            quality: worldObject.quality,
            energyKcal: getFoodEnergyKcal(worldObject.type, worldObject.emoji)
        });
        emitEnergyUpdate(socket.id);

        if (worldObjectDefinition.removeOnHit) {
            applyFoodHitBehavior(world, worldObjectId, worldObject);
            broadcastWorldObjects(gameId);
        }

        broadcastUsers(gameId);
        evaluateMatchState(gameId);
    });

    socket.on(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, (headCoordinatesUpdate) => {
        const gameId = socketGameById[socket.id];
        const world = getWorldForGame(gameId);
        if (!gameId || !world || world.matchState.isEnded) {
            return;
        }

        const user = connectedUsers[socket.id];
        if (!user) {
            return;
        }

        const requestedX = Number(headCoordinatesUpdate?.x);
        const requestedY = Number(headCoordinatesUpdate?.y);
        if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) {
            return;
        }

        const authoritativeWidth = getSnakeWidthForUser(user);
        const validatedPosition = getValidatedHeadPosition(
            world,
            user,
            { x: requestedX, y: requestedY },
            authoritativeWidth
        );

        const game = activeGamesById[gameId];
        const dangerousObjectEndsGame =
            (game?.dangerousObjectCollisionResponse ?? DEFAULT_DANGEROUS_OBJECT_COLLISION_RESPONSE)
            === COLLISION_RESPONSES.GAME_OVER;

        if (dangerousObjectEndsGame
            && wouldCollideWithDangerousWorldObject(world, validatedPosition, authoritativeWidth)) {
            if (removeSnakeAndFreezeBody(socket.id)) {
                broadcastFrozenSnakeCorpses(gameId);
                broadcastUsers(gameId);
                evaluateMatchState(gameId);
            }
            return;
        }

        user.coordinates = validatedPosition;
        const authoritativeLength = getSnakeLengthForUser(user);
        updateSnakeTrail(socket.id, user.coordinates, authoritativeLength);

        const snakeCollision = getSnakeCollision(socket.id, user.coordinates);
        if (snakeCollision) {
            const victimUser = connectedUsers[snakeCollision.victimId];

            if (victimUser && getSnakeLengthForUser(user) > getSnakeLengthForUser(victimUser)) {
                const removed = removeSnakeAndFreezeBody(snakeCollision.victimId);
                if (removed) {
                    growSnakeAfterEatingSnake(user, victimUser);
                    broadcastFrozenSnakeCorpses(gameId);
                    broadcastWorldObjects(gameId);
                    broadcastUsers(gameId);
                    evaluateMatchState(gameId);
                }
            }
        }

        io.to(getRoomNameForGame(gameId)).emit(SOCKET_EVENTS.UPDATE_COORDINATES_OF_HEAD, {
            id: socket.id,
            coordinatesOfHead: { x: user.coordinates.x, y: user.coordinates.y },
            l: authoritativeLength,
            w: authoritativeWidth
        });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');

        const gameId = socketGameById[socket.id];
        removeUserFromCurrentGame(socket);
        if (gameId) {
            broadcastUsers(gameId);
            evaluateMatchState(gameId);
        }
    });
});

setInterval(updateBotPositions, BOT_MOVE_INTERVAL_MS);
setInterval(evaluateAllMatchStates, 250);
setInterval(drainBoostingUsers, BOOST_DRAIN_INTERVAL_MS);

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${server.address().port}`);
});
