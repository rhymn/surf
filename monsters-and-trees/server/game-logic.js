'use strict';

const COLLISION_RESPONSES = {
    GAME_OVER: 'gameOver',
    BOUNCE: 'bounce'
};

const INITIAL_USER_LENGTH = 6;
const INITIAL_USER_WIDTH = 6; // matches RULE_SNAKE_SEGMENT_SIZE

// ---------------------------------------------------------------------------
// Collision response helpers
// ---------------------------------------------------------------------------

const resolveCollisionResponse = (configuredValue, fallback) => {
    if (Object.values(COLLISION_RESPONSES).includes(configuredValue)) {
        return configuredValue;
    }

    return fallback;
};

const toSafeCollisionResponse = (collisionResponse, fallback) => {
    return resolveCollisionResponse(collisionResponse, fallback);
};

// ---------------------------------------------------------------------------
// Rectangle geometry
// ---------------------------------------------------------------------------

const rectanglesOverlap = (firstRect, secondRect) => {
    return (
        firstRect.x < secondRect.x + secondRect.width &&
        firstRect.x + firstRect.width > secondRect.x &&
        firstRect.y < secondRect.y + secondRect.height &&
        firstRect.y + firstRect.height > secondRect.y
    );
};

// ---------------------------------------------------------------------------
// World-object rect helpers (require type definitions — use the factory)
// ---------------------------------------------------------------------------

/**
 * Returns { getCollisionInsetForObject, getWorldObjectRect } bound to the
 * supplied type-definition map. Pass DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS
 * (or a customised copy) in production; pass a hand-crafted map in tests.
 */
const createWorldObjectHelpers = (worldObjectTypeDefinitions) => {
    const getCollisionInsetForObject = (worldObject) => {
        const objectDefinition = worldObjectTypeDefinitions[worldObject.type];
        if (!objectDefinition) {
            return 0;
        }

        const maxInset = Math.max(0, Math.floor((objectDefinition.size - 1) / 2));
        return Math.max(0, Math.min(objectDefinition.collisionInset, maxInset));
    };

    const getWorldObjectRect = (worldObject, padding = 0) => {
        const objectDefinition = worldObjectTypeDefinitions[worldObject.type];
        const collisionInset = getCollisionInsetForObject(worldObject);
        const insetSize = objectDefinition.size - collisionInset * 2;

        return {
            x: worldObject.x + collisionInset - padding,
            y: worldObject.y + collisionInset - padding,
            width: insetSize + padding * 2,
            height: insetSize + padding * 2
        };
    };

    return { getCollisionInsetForObject, getWorldObjectRect };
};

// ---------------------------------------------------------------------------
// Snake state helpers
// ---------------------------------------------------------------------------

const getSnakeLengthForUser = (userState) => userState?.l ?? INITIAL_USER_LENGTH;
const getSnakeWidthForUser = (userState) => userState?.w ?? INITIAL_USER_WIDTH;

const setSnakeLengthForUser = (userState, nextLength) => {
    if (!userState) {
        return;
    }

    const parsed = Number.parseInt(`${nextLength ?? INITIAL_USER_LENGTH}`, 10);
    const safeLength = Math.max(1, Number.isNaN(parsed) ? INITIAL_USER_LENGTH : parsed);
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
    attackerUser.score += victimLength;
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

// ---------------------------------------------------------------------------

module.exports = {
    COLLISION_RESPONSES,
    INITIAL_USER_LENGTH,
    INITIAL_USER_WIDTH,
    resolveCollisionResponse,
    toSafeCollisionResponse,
    rectanglesOverlap,
    createWorldObjectHelpers,
    getSnakeLengthForUser,
    getSnakeWidthForUser,
    setSnakeLengthForUser,
    setSnakeWidthForUser,
    growSnakeAfterEatingSnake,
    applyWorldObjectEffectsToUser
};
