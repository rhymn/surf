const SOCKET_EVENTS = {
    CONNECT: 'connect',
    ASSIGN_COLOR: 'assignColor',
    SET_WORLD_OBJECT_DEFINITIONS: 'setWorldObjectDefinitions',
    UPDATE_WORLD_OBJECTS: 'updateWorldObjects',
    SET_MOVEMENT_CONFIG: 'setMovementConfig',
    SET_GAME_RULES: 'setGameRules',
    SET_VIRTUAL_DIMENSIONS: 'setVirtualDimensions',
    SET_START_POSITION: 'setStartPosition',
    UPDATE_USERS: 'updateUsers',
    UPDATE_COORDINATES_OF_HEAD: 'updateCoordinatesOfHead',
    SEND_COORDINATES_OF_HEAD: 'sendCoordinatesOfHead',
    WORLD_OBJECT_HIT: 'worldObjectHit',
    TURNED_INTO_MONSTERS: 'iTurnedIntoMonsters'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SOCKET_EVENTS;
}

if (typeof window !== 'undefined') {
    window.SOCKET_EVENTS = SOCKET_EVENTS;
}