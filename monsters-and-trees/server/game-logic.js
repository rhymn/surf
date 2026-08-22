'use strict';

const COLLISION_RESPONSES = {
    GAME_OVER: 'gameOver',
    BOUNCE: 'bounce'
};

// Whether an edible world object disappears when eaten, or is relocated elsewhere.
const FOOD_HIT_BEHAVIORS = {
    REMOVE: 'remove',
    MOVE: 'move'
};

const DEFAULT_FOOD_HIT_BEHAVIOR = FOOD_HIT_BEHAVIORS.MOVE;

const INITIAL_USER_LENGTH = 6;
const INITIAL_USER_WIDTH = 6; // matches RULE_SNAKE_SEGMENT_SIZE

// Boost runs off a small battery: a full charge lasts MAX_ENERGY_KWH / BOOST_DRAIN
// seconds of boosting, and only food puts energy back in.
const MAX_ENERGY_KWH = 1;
const BOOST_DRAIN_KWH_PER_SECOND = 0.2;
const MIN_ENERGY_TO_START_BOOST = 0.15;

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

const toSafeFoodHitBehavior = (foodHitBehavior, fallback = DEFAULT_FOOD_HIT_BEHAVIOR) => {
    if (Object.values(FOOD_HIT_BEHAVIORS).includes(foodHitBehavior)) {
        return foodHitBehavior;
    }

    return fallback;
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
    const energyDelta = Number.isFinite(worldObjectDefinition.effects.energyDelta)
        ? worldObjectDefinition.effects.energyDelta
        : 0;

    userState.score += scoreDelta;
    setSnakeLengthForUser(userState, getSnakeLengthForUser(userState) + growthDelta);
    setSnakeWidthForUser(userState, getSnakeWidthForUser(userState) + widthDelta);
    addEnergyToUser(userState, energyDelta);
};

// ---------------------------------------------------------------------------
// Boost energy
// ---------------------------------------------------------------------------

const clampEnergy = (energyValue) => {
    if (!Number.isFinite(energyValue)) {
        return 0;
    }

    return Math.min(MAX_ENERGY_KWH, Math.max(0, energyValue));
};

const getEnergyForUser = (userState) => clampEnergy(userState?.energy ?? MAX_ENERGY_KWH);

const setEnergyForUser = (userState, nextEnergy) => {
    if (!userState) {
        return 0;
    }

    userState.energy = clampEnergy(nextEnergy);
    return userState.energy;
};

const addEnergyToUser = (userState, energyDelta) => {
    if (!userState || !Number.isFinite(energyDelta)) {
        return getEnergyForUser(userState);
    }

    return setEnergyForUser(userState, getEnergyForUser(userState) + energyDelta);
};

const canStartBoost = (userState) => getEnergyForUser(userState) >= MIN_ENERGY_TO_START_BOOST;

const drainBoostEnergy = (userState, elapsedMs) => {
    if (!userState || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
        return getEnergyForUser(userState);
    }

    const drained = (elapsedMs / 1000) * BOOST_DRAIN_KWH_PER_SECOND;
    return setEnergyForUser(userState, getEnergyForUser(userState) - drained);
};

// ---------------------------------------------------------------------------

module.exports = {
    COLLISION_RESPONSES,
    FOOD_HIT_BEHAVIORS,
    DEFAULT_FOOD_HIT_BEHAVIOR,
    INITIAL_USER_LENGTH,
    INITIAL_USER_WIDTH,
    MAX_ENERGY_KWH,
    BOOST_DRAIN_KWH_PER_SECOND,
    MIN_ENERGY_TO_START_BOOST,
    resolveCollisionResponse,
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
    setEnergyForUser,
    addEnergyToUser,
    canStartBoost,
    drainBoostEnergy
};
