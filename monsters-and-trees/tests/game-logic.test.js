'use strict';

const {
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
} = require('../server/game-logic.js');

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

const makeUser = ({ l = INITIAL_USER_LENGTH, w = INITIAL_USER_WIDTH, score = 0 } = {}) => ({
    l,
    w,
    score
});

const TYPE_TREE = 'tree';
const TYPE_DOT  = 'dot';

/** Minimal type-definition map used by world-object helper tests. */
const TEST_TYPE_DEFINITIONS = {
    [TYPE_TREE]: { size: 64, collisionInset: 16, spawnPadding: 6, blocksSpawn: true },
    [TYPE_DOT]:  { size: 6,  collisionInset: 0,  spawnPadding: 0, blocksSpawn: false }
};

const { getCollisionInsetForObject, getWorldObjectRect } =
    createWorldObjectHelpers(TEST_TYPE_DEFINITIONS);

// ---------------------------------------------------------------------------
// resolveCollisionResponse / toSafeCollisionResponse
// ---------------------------------------------------------------------------

describe('resolveCollisionResponse', () => {
    test('returns the value when it is a known collision response', () => {
        expect(resolveCollisionResponse(COLLISION_RESPONSES.GAME_OVER, COLLISION_RESPONSES.BOUNCE))
            .toBe(COLLISION_RESPONSES.GAME_OVER);
        expect(resolveCollisionResponse(COLLISION_RESPONSES.BOUNCE, COLLISION_RESPONSES.GAME_OVER))
            .toBe(COLLISION_RESPONSES.BOUNCE);
    });

    test('returns the fallback for an unknown value', () => {
        expect(resolveCollisionResponse('unknown', COLLISION_RESPONSES.GAME_OVER))
            .toBe(COLLISION_RESPONSES.GAME_OVER);
    });

    test('returns the fallback for null / undefined', () => {
        expect(resolveCollisionResponse(null, COLLISION_RESPONSES.BOUNCE))
            .toBe(COLLISION_RESPONSES.BOUNCE);
        expect(resolveCollisionResponse(undefined, COLLISION_RESPONSES.GAME_OVER))
            .toBe(COLLISION_RESPONSES.GAME_OVER);
    });
});

describe('toSafeCollisionResponse', () => {
    test('delegates to resolveCollisionResponse', () => {
        expect(toSafeCollisionResponse(COLLISION_RESPONSES.BOUNCE, COLLISION_RESPONSES.GAME_OVER))
            .toBe(COLLISION_RESPONSES.BOUNCE);
        expect(toSafeCollisionResponse('bad', COLLISION_RESPONSES.GAME_OVER))
            .toBe(COLLISION_RESPONSES.GAME_OVER);
    });
});

// ---------------------------------------------------------------------------
// rectanglesOverlap
// ---------------------------------------------------------------------------

describe('rectanglesOverlap', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 }; // occupies [10,30) × [10,30)

    test('returns true for clearly overlapping rectangles', () => {
        expect(rectanglesOverlap(rect, { x: 15, y: 15, width: 10, height: 10 })).toBe(true);
    });

    test('returns true when one rect is fully inside the other', () => {
        expect(rectanglesOverlap(rect, { x: 12, y: 12, width: 5, height: 5 })).toBe(true);
    });

    test('returns true for partial overlap on each side', () => {
        expect(rectanglesOverlap(rect, { x: 5,  y: 10, width: 10, height: 10 })).toBe(true); // left
        expect(rectanglesOverlap(rect, { x: 25, y: 10, width: 10, height: 10 })).toBe(true); // right
        expect(rectanglesOverlap(rect, { x: 10, y: 5,  width: 10, height: 10 })).toBe(true); // above
        expect(rectanglesOverlap(rect, { x: 10, y: 25, width: 10, height: 10 })).toBe(true); // below
    });

    test('returns false for non-overlapping rectangles', () => {
        expect(rectanglesOverlap(rect, { x: 50, y: 50, width: 10, height: 10 })).toBe(false);
        expect(rectanglesOverlap(rect, { x: 0,  y: 0,  width: 5,  height: 5  })).toBe(false);
    });

    test('returns false when rectangles only touch at an edge (not overlapping)', () => {
        // right edge of first == left edge of second → gap, not overlap
        expect(rectanglesOverlap(rect, { x: 30, y: 10, width: 10, height: 10 })).toBe(false);
        expect(rectanglesOverlap(rect, { x: 10, y: 30, width: 10, height: 10 })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getCollisionInsetForObject
// ---------------------------------------------------------------------------

describe('getCollisionInsetForObject', () => {
    test('returns the collisionInset for a known type', () => {
        // Tree: size=64, collisionInset=16. maxInset=floor((64-1)/2)=31 → clamped to 16.
        expect(getCollisionInsetForObject({ type: TYPE_TREE, x: 0, y: 0 })).toBe(16);
    });

    test('returns 0 for a type with zero collisionInset', () => {
        expect(getCollisionInsetForObject({ type: TYPE_DOT, x: 0, y: 0 })).toBe(0);
    });

    test('returns 0 for an unknown type', () => {
        expect(getCollisionInsetForObject({ type: 'unknown', x: 0, y: 0 })).toBe(0);
    });

    test('clamps collisionInset to (size-1)/2', () => {
        // Definition where collisionInset exceeds maximum allowed
        const { getCollisionInsetForObject: getClamped } = createWorldObjectHelpers({
            tooBig: { size: 10, collisionInset: 999 }
        });
        // maxInset = floor((10-1)/2) = 4
        expect(getClamped({ type: 'tooBig', x: 0, y: 0 })).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// getWorldObjectRect
// ---------------------------------------------------------------------------

describe('getWorldObjectRect', () => {
    test('returns correct rect without padding for a tree', () => {
        // Tree size=64, inset=16 → insetSize=32
        const rect = getWorldObjectRect({ type: TYPE_TREE, x: 100, y: 200 });
        expect(rect).toEqual({ x: 116, y: 216, width: 32, height: 32 });
    });

    test('returns correct rect with padding', () => {
        // Dot size=6, inset=0 → insetSize=6, padding=4
        const rect = getWorldObjectRect({ type: TYPE_DOT, x: 50, y: 60 }, 4);
        expect(rect).toEqual({ x: 46, y: 56, width: 14, height: 14 });
    });

    test('negative padding shrinks the rect', () => {
        const rect = getWorldObjectRect({ type: TYPE_DOT, x: 50, y: 60 }, -2);
        expect(rect).toEqual({ x: 52, y: 62, width: 2, height: 2 });
    });
});

// ---------------------------------------------------------------------------
// getSnakeLengthForUser / getSnakeWidthForUser
// ---------------------------------------------------------------------------

describe('getSnakeLengthForUser', () => {
    test('returns the l value from userState', () => {
        expect(getSnakeLengthForUser({ l: 10, w: 6, score: 0 })).toBe(10);
    });

    test('returns INITIAL_USER_LENGTH when userState is null', () => {
        expect(getSnakeLengthForUser(null)).toBe(INITIAL_USER_LENGTH);
    });

    test('returns INITIAL_USER_LENGTH when l is missing', () => {
        expect(getSnakeLengthForUser({ w: 6, score: 0 })).toBe(INITIAL_USER_LENGTH);
    });
});

describe('getSnakeWidthForUser', () => {
    test('returns the w value from userState', () => {
        expect(getSnakeWidthForUser({ l: 6, w: 9, score: 0 })).toBe(9);
    });

    test('returns INITIAL_USER_WIDTH when userState is null', () => {
        expect(getSnakeWidthForUser(null)).toBe(INITIAL_USER_WIDTH);
    });
});

// ---------------------------------------------------------------------------
// setSnakeLengthForUser
// ---------------------------------------------------------------------------

describe('setSnakeLengthForUser', () => {
    test('sets l on userState', () => {
        const u = makeUser();
        setSnakeLengthForUser(u, 20);
        expect(u.l).toBe(20);
    });

    test('clamps length to minimum of 1', () => {
        const u = makeUser();
        setSnakeLengthForUser(u, 0);
        expect(u.l).toBe(1);
        setSnakeLengthForUser(u, -5);
        expect(u.l).toBe(1);
    });

    test('uses INITIAL_USER_LENGTH for NaN input', () => {
        const u = makeUser();
        setSnakeLengthForUser(u, NaN);
        expect(u.l).toBe(INITIAL_USER_LENGTH);
    });

    test('uses INITIAL_USER_LENGTH for null input', () => {
        const u = makeUser();
        setSnakeLengthForUser(u, null);
        expect(u.l).toBe(INITIAL_USER_LENGTH);
    });

    test('does nothing when userState is null', () => {
        expect(() => setSnakeLengthForUser(null, 10)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// setSnakeWidthForUser
// ---------------------------------------------------------------------------

describe('setSnakeWidthForUser', () => {
    test('sets w on userState', () => {
        const u = makeUser();
        setSnakeWidthForUser(u, 10);
        expect(u.w).toBe(10);
    });

    test('clamps width to minimum of 1', () => {
        const u = makeUser({ w: 5 });
        setSnakeWidthForUser(u, 0.5);
        expect(u.w).toBe(1);
    });

    test('does nothing when nextWidth is zero or negative', () => {
        const u = makeUser({ w: 5 });
        setSnakeWidthForUser(u, 0);
        expect(u.w).toBe(5);
        setSnakeWidthForUser(u, -1);
        expect(u.w).toBe(5);
    });

    test('does nothing when nextWidth is not a number', () => {
        const u = makeUser({ w: 5 });
        setSnakeWidthForUser(u, 'big');
        expect(u.w).toBe(5);
    });

    test('does nothing when userState is null', () => {
        expect(() => setSnakeWidthForUser(null, 10)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// growSnakeAfterEatingSnake
// ---------------------------------------------------------------------------

describe('growSnakeAfterEatingSnake', () => {
    test('attacker gains victim length and score', () => {
        const attacker = makeUser({ l: 6, score: 0 });
        const victim   = makeUser({ l: 4, score: 0 });
        growSnakeAfterEatingSnake(attacker, victim);
        expect(attacker.l).toBe(10);
        expect(attacker.score).toBe(4);
    });

    test('victim is not modified', () => {
        const attacker = makeUser({ l: 6 });
        const victim   = makeUser({ l: 4, score: 0 });
        growSnakeAfterEatingSnake(attacker, victim);
        expect(victim.l).toBe(4);
        expect(victim.score).toBe(0);
    });

    test('does nothing when attacker is null', () => {
        const victim = makeUser({ l: 4 });
        expect(() => growSnakeAfterEatingSnake(null, victim)).not.toThrow();
    });

    test('does nothing when victim is null', () => {
        const attacker = makeUser({ l: 6 });
        expect(() => growSnakeAfterEatingSnake(attacker, null)).not.toThrow();
    });

    test('uses INITIAL_USER_LENGTH for userState missing l', () => {
        const attacker = makeUser();     // l = 6
        const victim   = { score: 0 };  // no l → INITIAL_USER_LENGTH = 6
        growSnakeAfterEatingSnake(attacker, victim);
        expect(attacker.l).toBe(12);
        expect(attacker.score).toBe(6);
    });
});

// ---------------------------------------------------------------------------
// applyWorldObjectEffectsToUser
// ---------------------------------------------------------------------------

describe('applyWorldObjectEffectsToUser', () => {
    const monsterDef = {
        effects: { scoreDelta: 1, growthDelta: 5, widthDelta: 1 }
    };

    test('applies score, length, and width deltas', () => {
        const u = makeUser({ l: 6, w: 6, score: 0 });
        applyWorldObjectEffectsToUser(u, monsterDef);
        expect(u.score).toBe(1);
        expect(u.l).toBe(11);
        expect(u.w).toBe(7);
    });

    test('can be applied multiple times cumulatively', () => {
        const u = makeUser({ l: 6, w: 6, score: 0 });
        applyWorldObjectEffectsToUser(u, monsterDef);
        applyWorldObjectEffectsToUser(u, monsterDef);
        expect(u.score).toBe(2);
        expect(u.l).toBe(16);
        expect(u.w).toBe(8);
    });

    test('treats non-finite deltas as zero', () => {
        const u = makeUser({ l: 6, w: 6, score: 10 });
        applyWorldObjectEffectsToUser(u, {
            effects: { scoreDelta: Infinity, growthDelta: NaN, widthDelta: undefined }
        });
        expect(u.score).toBe(10); // Infinity treated as 0
        expect(u.l).toBe(6);      // NaN treated as 0 → no growth
        expect(u.w).toBe(6);      // undefined treated as 0 → no width change
    });

    test('does nothing when userState is null', () => {
        expect(() => applyWorldObjectEffectsToUser(null, monsterDef)).not.toThrow();
    });

    test('does nothing when worldObjectDefinition is null', () => {
        const u = makeUser({ score: 5 });
        applyWorldObjectEffectsToUser(u, null);
        expect(u.score).toBe(5);
    });
});
