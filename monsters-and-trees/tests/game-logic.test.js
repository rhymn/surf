'use strict';

const {
    COLLISION_RESPONSES,
    FOOD_HIT_BEHAVIORS,
    DEFAULT_FOOD_HIT_BEHAVIOR,
    INITIAL_USER_LENGTH,
    INITIAL_USER_WIDTH,
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
    MAX_ENERGY_KWH,
    BOOST_DRAIN_KWH_PER_SECOND,
    MIN_ENERGY_TO_START_BOOST,
    getEnergyForUser,
    setEnergyForUser,
    addEnergyToUser,
    canStartBoost,
    drainBoostEnergy,
    FOOD_QUALITY_MODIFIERS,
    getFoodQualityModifiers
} = require('../server/game-logic.js');

const {
    FOOD_QUALITIES,
    FOOD_EMOJIS_BY_TYPE_AND_QUALITY,
    FOOD_NUTRITION_PER_100G,
    FOOD_PORTION_GRAMS_BY_TYPE,
    ENERGY_KWH_PER_KCAL,
    getRandomFoodForType,
    getFoodQualityForEmoji,
    getFoodNutritionFacts,
    getFoodEnergyKwh
} = require('../public/world-object-definitions.js');

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
// toSafeFoodHitBehavior
// ---------------------------------------------------------------------------

describe('toSafeFoodHitBehavior', () => {
    test('returns the value for each known food hit behavior', () => {
        expect(toSafeFoodHitBehavior(FOOD_HIT_BEHAVIORS.REMOVE)).toBe(FOOD_HIT_BEHAVIORS.REMOVE);
        expect(toSafeFoodHitBehavior(FOOD_HIT_BEHAVIORS.MOVE)).toBe(FOOD_HIT_BEHAVIORS.MOVE);
    });

    test('falls back to the default for unknown values', () => {
        expect(toSafeFoodHitBehavior('teleport')).toBe(DEFAULT_FOOD_HIT_BEHAVIOR);
        expect(toSafeFoodHitBehavior(null)).toBe(DEFAULT_FOOD_HIT_BEHAVIOR);
        expect(toSafeFoodHitBehavior(undefined)).toBe(DEFAULT_FOOD_HIT_BEHAVIOR);
    });

    test('honours an explicit fallback', () => {
        expect(toSafeFoodHitBehavior('nope', FOOD_HIT_BEHAVIORS.REMOVE))
            .toBe(FOOD_HIT_BEHAVIORS.REMOVE);
    });

    test('defaults to moving food rather than removing it', () => {
        expect(DEFAULT_FOOD_HIT_BEHAVIOR).toBe(FOOD_HIT_BEHAVIORS.MOVE);
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

describe('boost energy', () => {    test('defaults to a full battery', () => {
        expect(getEnergyForUser(makeUser())).toBe(MAX_ENERGY_KWH);
    });

    test('clamps stored energy to the battery range', () => {
        const user = makeUser();
        expect(setEnergyForUser(user, 99)).toBe(MAX_ENERGY_KWH);
        expect(setEnergyForUser(user, -5)).toBe(0);
        expect(setEnergyForUser(user, NaN)).toBe(0);
    });

    test('drains proportionally to elapsed time', () => {
        const user = makeUser();
        setEnergyForUser(user, MAX_ENERGY_KWH);

        expect(drainBoostEnergy(user, 1000)).toBeCloseTo(MAX_ENERGY_KWH - BOOST_DRAIN_KWH_PER_SECOND, 6);
        expect(drainBoostEnergy(user, 500)).toBeCloseTo(MAX_ENERGY_KWH - BOOST_DRAIN_KWH_PER_SECOND * 1.5, 6);
    });

    test('a full battery is emptied by the advertised boost duration', () => {
        const user = makeUser();
        setEnergyForUser(user, MAX_ENERGY_KWH);

        const fullBoostSeconds = MAX_ENERGY_KWH / BOOST_DRAIN_KWH_PER_SECOND;
        expect(drainBoostEnergy(user, fullBoostSeconds * 1000)).toBe(0);
    });

    test('never drains below empty and ignores invalid elapsed times', () => {
        const user = makeUser();
        setEnergyForUser(user, 0.05);

        expect(drainBoostEnergy(user, 10_000)).toBe(0);
        expect(drainBoostEnergy(user, -100)).toBe(0);
        expect(drainBoostEnergy(user, NaN)).toBe(0);
    });

    test('food adds energy but cannot overcharge the battery', () => {
        const user = makeUser();
        setEnergyForUser(user, 0.5);

        expect(addEnergyToUser(user, 0.25)).toBeCloseTo(0.75, 6);
        expect(addEnergyToUser(user, 10)).toBe(MAX_ENERGY_KWH);
    });

    test('eating food recharges the battery', () => {
        const user = makeUser();
        setEnergyForUser(user, 0.2);

        applyWorldObjectEffectsToUser(user, {
            effects: { scoreDelta: 1, growthDelta: 1, widthDelta: 0 }
        }, { quality: FOOD_QUALITIES.HEALTHY, energyKwh: 0.1 });

        expect(getEnergyForUser(user)).toBeCloseTo(0.3, 6);
    });

    test('boost cannot start until the battery is charged past the minimum', () => {
        const user = makeUser();

        setEnergyForUser(user, 0);
        expect(canStartBoost(user)).toBe(false);

        setEnergyForUser(user, MIN_ENERGY_TO_START_BOOST - 0.01);
        expect(canStartBoost(user)).toBe(false);

        setEnergyForUser(user, MIN_ENERGY_TO_START_BOOST);
        expect(canStartBoost(user)).toBe(true);
    });
});

describe('food quality', () => {
    const dotDefinition = {
        effects: { scoreDelta: 1, growthDelta: 2, widthDelta: 0.2 }
    };

    const eatAs = (quality, energyKwh = 0.1) => {
        const user = makeUser({ l: 10, w: 6, score: 0 });
        setEnergyForUser(user, 0.5);
        applyWorldObjectEffectsToUser(user, dotDefinition, { quality, energyKwh });
        return user;
    };

    test('AIP food pays the most points', () => {
        expect(eatAs(FOOD_QUALITIES.AIP).score).toBe(2);
        expect(eatAs(FOOD_QUALITIES.HEALTHY).score).toBe(1);
        expect(eatAs(FOOD_QUALITIES.UNHEALTHY).score).toBe(0);
    });

    test('junk food bulks the snake up faster', () => {
        const junkEater = eatAs(FOOD_QUALITIES.UNHEALTHY);
        const healthyEater = eatAs(FOOD_QUALITIES.HEALTHY);

        expect(junkEater.l).toBeGreaterThan(healthyEater.l);
        expect(junkEater.w).toBeGreaterThan(healthyEater.w);
    });

    test('battery charge comes from the food, not its quality', () => {
        const junkEater = eatAs(FOOD_QUALITIES.UNHEALTHY, 0.4);
        const aipEater = eatAs(FOOD_QUALITIES.AIP, 0.4);

        expect(getEnergyForUser(junkEater)).toBeCloseTo(0.9, 6);
        expect(getEnergyForUser(aipEater)).toBeCloseTo(0.9, 6);
    });

    test('unknown or missing quality falls back to healthy', () => {
        expect(getFoodQualityModifiers('nonsense')).toEqual(FOOD_QUALITY_MODIFIERS[FOOD_QUALITIES.HEALTHY]);
        expect(getFoodQualityModifiers(undefined)).toEqual(FOOD_QUALITY_MODIFIERS[FOOD_QUALITIES.HEALTHY]);
    });

    test('every food emoji belongs to exactly one quality tier', () => {
        const seenEmojis = new Set();

        for (const type of Object.keys(FOOD_EMOJIS_BY_TYPE_AND_QUALITY)) {
            for (const quality of Object.keys(FOOD_EMOJIS_BY_TYPE_AND_QUALITY[type])) {
                for (const emoji of FOOD_EMOJIS_BY_TYPE_AND_QUALITY[type][quality]) {
                    expect(seenEmojis.has(emoji)).toBe(false);
                    seenEmojis.add(emoji);
                    expect(getFoodQualityForEmoji(type, emoji)).toBe(quality);
                }
            }
        }

        expect(seenEmojis.size).toBeGreaterThan(20);
    });

    test('spawning yields every quality tier with a matching emoji', () => {
        const spawnedQualities = new Set();

        for (let spawn = 0; spawn < 500; spawn++) {
            const food = getRandomFoodForType('dot');
            expect(getFoodQualityForEmoji('dot', food.emoji)).toBe(food.quality);
            spawnedQualities.add(food.quality);
        }

        expect(spawnedQualities).toEqual(new Set(Object.values(FOOD_QUALITIES)));
    });
});

describe('food nutrition', () => {
    test('every food emoji has macronutrient data', () => {
        for (const type of Object.keys(FOOD_EMOJIS_BY_TYPE_AND_QUALITY)) {
            for (const quality of Object.keys(FOOD_EMOJIS_BY_TYPE_AND_QUALITY[type])) {
                for (const emoji of FOOD_EMOJIS_BY_TYPE_AND_QUALITY[type][quality]) {
                    const facts = getFoodNutritionFacts(type, emoji);

                    expect(facts).not.toBeNull();
                    expect(facts.kcal).toBeGreaterThan(0);
                    expect(facts.energyKwh).toBeGreaterThan(0);
                }
            }
        }
    });

    test('calories follow the Atwater factors, with fibre at 2 kcal/g', () => {
        const nutrition = FOOD_NUTRITION_PER_100G['🥑'];
        const netCarbs = nutrition.carbs - nutrition.fiber;
        const expectedKcalPer100g = nutrition.fat * 9 + netCarbs * 4 + nutrition.protein * 4 + nutrition.fiber * 2;

        const facts = getFoodNutritionFacts('cloud', '🥑');
        const portionRatio = FOOD_PORTION_GRAMS_BY_TYPE.cloud / 100;

        expect(facts.kcal).toBeCloseTo(expectedKcalPer100g * portionRatio, 6);
        expect(facts.energyKwh).toBeCloseTo(facts.kcal * ENERGY_KWH_PER_KCAL, 9);
    });

    test('avocado matches its real calorie density within a few percent', () => {
        const facts = getFoodNutritionFacts('cloud', '🥑');
        const kcalPer100g = facts.kcal / (FOOD_PORTION_GRAMS_BY_TYPE.cloud / 100);

        expect(kcalPer100g).toBeGreaterThan(150);
        expect(kcalPer100g).toBeLessThan(170);
    });

    test('macros scale with the portion of each size tier', () => {
        const smallPortion = getFoodNutritionFacts('dot', '🍓');
        const bigPortion = getFoodNutritionFacts('monster', '🍉');

        expect(smallPortion.portionGrams).toBe(FOOD_PORTION_GRAMS_BY_TYPE.dot);
        expect(bigPortion.portionGrams).toBe(FOOD_PORTION_GRAMS_BY_TYPE.monster);
        expect(smallPortion.fat).toBeCloseTo(FOOD_NUTRITION_PER_100G['🍓'].fat * 0.3, 6);
    });

    test('fatty and sugary foods carry more charge than watery fruit', () => {
        const watermelon = getFoodEnergyKwh('monster', '🍉');
        const coconut = getFoodEnergyKwh('monster', '🥥');
        const strawberry = getFoodEnergyKwh('dot', '🍓');
        const candy = getFoodEnergyKwh('dot', '🍬');

        expect(coconut).toBeGreaterThan(watermelon);
        expect(candy).toBeGreaterThan(strawberry);
    });

    test('unknown food has no nutrition', () => {
        expect(getFoodNutritionFacts('dot', '🪨')).toBeNull();
        expect(getFoodEnergyKwh('dot', '🪨')).toBe(0);
    });
});
