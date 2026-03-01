const GAME_SOCKET_EVENT_NAMES = {
    CONNECT: 'connect',
    LIST_ACTIVE_GAMES: 'listActiveGames',
    ACTIVE_GAMES_UPDATED: 'activeGamesUpdated',
    CREATE_GAME: 'createGame',
    JOIN_GAME: 'joinGame',
    END_GAME: 'endGame',
    JOINED_GAME: 'joinedGame',
    JOIN_GAME_ERROR: 'joinGameError',
    GAME_ENDED: 'gameEnded',
    ASSIGN_COLOR: 'assignColor',
    ASSIGN_HEAD_EMOJI: 'assignHeadEmoji',
    SET_WORLD_OBJECT_DEFINITIONS: 'setWorldObjectDefinitions',
    UPDATE_WORLD_OBJECTS: 'updateWorldObjects',
    SET_MOVEMENT_CONFIG: 'setMovementConfig',
    SET_PLAYING_TYPE: 'setPlayingType',
    SET_GAME_RULES: 'setGameRules',
    MATCH_STATE_UPDATE: 'matchStateUpdate',
    SET_VIRTUAL_DIMENSIONS: 'setVirtualDimensions',
    SET_START_POSITION: 'setStartPosition',
    UPDATE_USERS: 'updateUsers',
    UPDATE_COORDINATES_OF_HEAD: 'updateCoordinatesOfHead',
    SEND_COORDINATES_OF_HEAD: 'sendCoordinatesOfHead',
    WORLD_OBJECT_HIT: 'worldObjectHit',
    SNAKE_EATEN: 'snakeEaten',
    YOU_WERE_EATEN: 'youWereEaten',
    UPDATE_FROZEN_SNAKES: 'updateFrozenSnakes',
    CONSUME_CORPSE_SEGMENT: 'consumeCorpseSegment'
};

const SOCKET_EVENTS = GAME_SOCKET_EVENT_NAMES;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SOCKET_EVENTS;
}

if (typeof window !== 'undefined') {
    window.SOCKET_EVENTS = SOCKET_EVENTS;
}