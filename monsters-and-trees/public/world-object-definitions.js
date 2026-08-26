const WORLD_OBJECT_TYPES = {
    TREE: 'tree',
    MONSTER: 'monster',
    CLOUD: 'cloud',
    THORN: 'thorn',
    DOT: 'dot',
    PORTAL: 'portal'
};

// Food quality drives the reward. AIP (autoimmune protocol) excludes grains,
// legumes, nuts, nightshades, dairy, eggs and processed food — those land in the
// lower tiers even when they are otherwise nutritious.
const FOOD_QUALITIES = {
    AIP: 'aip',
    HEALTHY: 'healthy',
    UNHEALTHY: 'unhealthy'
};

// Each size tier keeps a consistent real-world size so players can read the map,
// and each quality keeps a consistent reward.
const FOOD_EMOJIS_BY_TYPE_AND_QUALITY = {
    [WORLD_OBJECT_TYPES.MONSTER]: {
        [FOOD_QUALITIES.AIP]: ['🍉', '🍍', '🥥', '🍈', '🎃', '🥬'],
        [FOOD_QUALITIES.HEALTHY]: ['🍆', '🥔'],
        [FOOD_QUALITIES.UNHEALTHY]: ['🍞', '🧀', '🍕', '🍔', '🎂']
    },
    [WORLD_OBJECT_TYPES.CLOUD]: {
        [FOOD_QUALITIES.AIP]: ['🍌', '🍎', '🍏', '🍐', '🍊', '🍑', '🍋', '🥭', '🥑', '🥕', '🥦'],
        [FOOD_QUALITIES.HEALTHY]: ['🍅', '🫑', '🌽', '🥚'],
        [FOOD_QUALITIES.UNHEALTHY]: ['🥐', '🍩', '🍪', '🍫', '🍟']
    },
    [WORLD_OBJECT_TYPES.DOT]: {
        [FOOD_QUALITIES.AIP]: ['🍇', '🍒', '🍓', '🫐', '🥝', '🫒'],
        [FOOD_QUALITIES.HEALTHY]: ['🌰', '🥜'],
        [FOOD_QUALITIES.UNHEALTHY]: ['🍬', '🍭', '🧁']
    }
};

// Weighted so the best food is common enough to chase, junk common enough to tempt.
const FOOD_QUALITY_SPAWN_WEIGHTS = {
    [FOOD_QUALITIES.AIP]: 5,
    [FOOD_QUALITIES.HEALTHY]: 3,
    [FOOD_QUALITIES.UNHEALTHY]: 2
};

const pickRandomFoodQuality = () => {
    const qualities = Object.keys(FOOD_QUALITY_SPAWN_WEIGHTS);
    const totalWeight = qualities.reduce((sum, quality) => sum + FOOD_QUALITY_SPAWN_WEIGHTS[quality], 0);

    let roll = Math.random() * totalWeight;
    for (const quality of qualities) {
        roll -= FOOD_QUALITY_SPAWN_WEIGHTS[quality];
        if (roll <= 0) {
            return quality;
        }
    }

    return FOOD_QUALITIES.HEALTHY;
};

const getRandomFoodForType = (type) => {
    const emojisByQuality = FOOD_EMOJIS_BY_TYPE_AND_QUALITY[type];
    if (!emojisByQuality) {
        return null;
    }

    const quality = pickRandomFoodQuality();
    const emojisForQuality = emojisByQuality[quality];
    if (!emojisForQuality || emojisForQuality.length === 0) {
        return null;
    }

    return {
        emoji: emojisForQuality[Math.floor(Math.random() * emojisForQuality.length)],
        quality
    };
};

const getFoodQualityForEmoji = (type, emoji) => {
    const emojisByQuality = FOOD_EMOJIS_BY_TYPE_AND_QUALITY[type] ?? {};

    for (const quality of Object.keys(emojisByQuality)) {
        if (emojisByQuality[quality].includes(emoji)) {
            return quality;
        }
    }

    return null;
};

// Macronutrients in grams per 100g, close to real reference values.
const FOOD_NUTRITION_PER_100G = {
    // AIP
    '🍓': { fat: 0.3, carbs: 7.7, fiber: 2.0, protein: 0.7 },
    '🫐': { fat: 0.3, carbs: 14.5, fiber: 2.4, protein: 0.7 },
    '🍒': { fat: 0.3, carbs: 16.0, fiber: 2.1, protein: 1.1 },
    '🍇': { fat: 0.2, carbs: 18.1, fiber: 0.9, protein: 0.7 },
    '🥝': { fat: 0.5, carbs: 14.7, fiber: 3.0, protein: 1.1 },
    '🫒': { fat: 15.3, carbs: 6.3, fiber: 3.2, protein: 0.8 },
    '🍌': { fat: 0.3, carbs: 22.8, fiber: 2.6, protein: 1.1 },
    '🍎': { fat: 0.2, carbs: 13.8, fiber: 2.4, protein: 0.3 },
    '🍏': { fat: 0.2, carbs: 13.6, fiber: 2.8, protein: 0.4 },
    '🍐': { fat: 0.1, carbs: 15.2, fiber: 3.1, protein: 0.4 },
    '🍊': { fat: 0.3, carbs: 13.3, fiber: 1.8, protein: 0.8 },
    '🍑': { fat: 0.3, carbs: 9.5, fiber: 1.5, protein: 0.9 },
    '🍋': { fat: 0.3, carbs: 9.3, fiber: 2.8, protein: 1.1 },
    '🥭': { fat: 0.4, carbs: 15.0, fiber: 1.6, protein: 0.8 },
    '🥑': { fat: 14.7, carbs: 8.5, fiber: 6.7, protein: 2.0 },
    '🥕': { fat: 0.2, carbs: 9.6, fiber: 2.8, protein: 0.9 },
    '🥦': { fat: 0.4, carbs: 6.6, fiber: 2.6, protein: 2.8 },
    '🍉': { fat: 0.2, carbs: 7.6, fiber: 0.4, protein: 0.6 },
    '🍍': { fat: 0.1, carbs: 13.0, fiber: 1.4, protein: 0.5 },
    '🥥': { fat: 33.5, carbs: 15.2, fiber: 9.0, protein: 3.3 },
    '🍈': { fat: 0.2, carbs: 8.2, fiber: 0.9, protein: 0.8 },
    '🎃': { fat: 0.1, carbs: 6.5, fiber: 0.5, protein: 1.0 },
    '🥬': { fat: 0.4, carbs: 3.6, fiber: 2.6, protein: 2.9 },

    // Healthy but not AIP
    '🍅': { fat: 0.2, carbs: 3.9, fiber: 1.2, protein: 0.9 },
    '🫑': { fat: 0.3, carbs: 6.0, fiber: 2.1, protein: 1.0 },
    '🌽': { fat: 1.4, carbs: 19.0, fiber: 2.7, protein: 3.3 },
    '🥚': { fat: 10.6, carbs: 1.1, fiber: 0, protein: 12.6 },
    '🌰': { fat: 2.2, carbs: 53.0, fiber: 5.1, protein: 3.2 },
    '🥜': { fat: 49.2, carbs: 16.1, fiber: 8.5, protein: 25.8 },
    '🍆': { fat: 0.2, carbs: 5.9, fiber: 3.0, protein: 1.0 },
    '🥔': { fat: 0.1, carbs: 17.5, fiber: 2.1, protein: 2.0 },

    // Junk
    '🍬': { fat: 0.2, carbs: 98.0, fiber: 0, protein: 0 },
    '🍭': { fat: 0, carbs: 97.0, fiber: 0, protein: 0 },
    '🧁': { fat: 15.0, carbs: 55.0, fiber: 1.0, protein: 4.0 },
    '🍩': { fat: 25.0, carbs: 51.0, fiber: 1.4, protein: 5.2 },
    '🍪': { fat: 20.0, carbs: 68.0, fiber: 2.4, protein: 5.4 },
    '🍫': { fat: 31.0, carbs: 61.0, fiber: 3.4, protein: 4.9 },
    '🍟': { fat: 15.0, carbs: 41.0, fiber: 3.8, protein: 3.4 },
    '🥐': { fat: 21.0, carbs: 45.8, fiber: 2.6, protein: 8.2 },
    '🍕': { fat: 10.0, carbs: 33.0, fiber: 2.3, protein: 11.0 },
    '🍔': { fat: 12.0, carbs: 30.0, fiber: 1.5, protein: 15.0 },
    '🎂': { fat: 15.0, carbs: 53.0, fiber: 0.9, protein: 4.5 },
    '🍞': { fat: 3.2, carbs: 49.0, fiber: 2.7, protein: 9.0 },
    '🧀': { fat: 33.0, carbs: 1.3, fiber: 0, protein: 25.0 }
};

// Atwater factors: fiber is only partially metabolised, hence 2 instead of 4.
const KCAL_PER_GRAM = {
    fat: 9,
    netCarbs: 4,
    protein: 4,
    fiber: 2
};

const FOOD_PORTION_GRAMS_BY_TYPE = {
    [WORLD_OBJECT_TYPES.MONSTER]: 300,
    [WORLD_OBJECT_TYPES.CLOUD]: 120,
    [WORLD_OBJECT_TYPES.DOT]: 30
};

const getKcalPer100g = (nutrition) => {
    if (!nutrition) {
        return 0;
    }

    const netCarbs = Math.max(0, nutrition.carbs - nutrition.fiber);

    return nutrition.fat * KCAL_PER_GRAM.fat
        + netCarbs * KCAL_PER_GRAM.netCarbs
        + nutrition.protein * KCAL_PER_GRAM.protein
        + nutrition.fiber * KCAL_PER_GRAM.fiber;
};

const getFoodNutritionFacts = (type, emoji) => {
    const nutrition = FOOD_NUTRITION_PER_100G[emoji];
    const portionGrams = FOOD_PORTION_GRAMS_BY_TYPE[type];

    if (!nutrition || !portionGrams) {
        return null;
    }

    const portionRatio = portionGrams / 100;
    const kcal = getKcalPer100g(nutrition) * portionRatio;

    return {
        portionGrams,
        fat: nutrition.fat * portionRatio,
        carbs: nutrition.carbs * portionRatio,
        fiber: nutrition.fiber * portionRatio,
        protein: nutrition.protein * portionRatio,
        kcal
    };
};

const getFoodEnergyKcal = (type, emoji) => getFoodNutritionFacts(type, emoji)?.kcal ?? 0;

const DEFAULT_WORLD_OBJECT_DEFINITIONS = {
    [WORLD_OBJECT_TYPES.TREE]: {
        size: 64,
        spawnPadding: 6,
        collisionInset: 16,
        blocksSpawn: true,
        removeOnHit: false,
        effects: {
            instantLose: true,
            growthDelta: 0,
            scoreDelta: 0,
            widthDelta: 0
        }
    },
    [WORLD_OBJECT_TYPES.MONSTER]: {
        size: 32,
        spawnPadding: 0,
        collisionInset: 0,
        blocksSpawn: false,
        removeOnHit: true,
        effects: {
            instantLose: false,
            growthDelta: 5,
            scoreDelta: 1,
            widthDelta: 0.15
        }
    },
    [WORLD_OBJECT_TYPES.CLOUD]: {
        size: 22,
        spawnPadding: 0,
        collisionInset: 0,
        blocksSpawn: false,
        removeOnHit: true,
        effects: {
            instantLose: false,
            growthDelta: 30,
            scoreDelta: 0,
            widthDelta: 0.3
        }
    },
    [WORLD_OBJECT_TYPES.THORN]: {
        size: 18,
        spawnPadding: 0,
        collisionInset: 0,
        blocksSpawn: false,
        removeOnHit: false,
        effects: {
            instantLose: true,
            growthDelta: 0,
            scoreDelta: 0,
            widthDelta: 0
        }
    },
    [WORLD_OBJECT_TYPES.DOT]: {
        size: 16,
        spawnPadding: 0,
        collisionInset: 0,
        blocksSpawn: false,
        removeOnHit: true,
        effects: {
            instantLose: false,
            growthDelta: 1,
            scoreDelta: 1,
            widthDelta: 0
        }
    },
    // Entering a portal teleports the snake elsewhere; the portal itself stays put.
    [WORLD_OBJECT_TYPES.PORTAL]: {
        size: 56,
        spawnPadding: 24,
        collisionInset: 14,
        blocksSpawn: true,
        removeOnHit: false,
        effects: {
            instantLose: false,
            growthDelta: 0,
            scoreDelta: 0,
            widthDelta: 0
        }
    }
};

const DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS = DEFAULT_WORLD_OBJECT_DEFINITIONS;

// The color a body segment turns into once its snake dies and it becomes a
// loose dot on the ground, roughly matching the eaten food's dominant color.
const EMOJI_DOMINANT_COLORS = {
    '🍉': '#2ecc71',
    '🍍': '#f1c40f',
    '🥥': '#8d6e63',
    '🍈': '#d4e157',
    '🎃': '#e67e22',
    '🥬': '#4caf50',
    '🍆': '#8e44ad',
    '🥔': '#a1887f',
    '🍞': '#d7a86e',
    '🧀': '#f9ca24',
    '🍕': '#e67e22',
    '🍔': '#a0522d',
    '🎂': '#f48fb1',
    '🍌': '#f4d03f',
    '🍎': '#e74c3c',
    '🍏': '#8bc34a',
    '🍐': '#a8d16a',
    '🍊': '#f39c12',
    '🍑': '#ffb08a',
    '🍋': '#f9e400',
    '🥭': '#f7a325',
    '🥑': '#568203',
    '🥕': '#ed8936',
    '🥦': '#2e7d32',
    '🍅': '#e74c3c',
    '🫑': '#4caf50',
    '🌽': '#f5d76e',
    '🥚': '#fef3c7',
    '🥐': '#d4a373',
    '🍩': '#e07a9b',
    '🍪': '#8b5a2b',
    '🍫': '#5a3921',
    '🍟': '#f6c453',
    '🍇': '#7d3c98',
    '🍒': '#c0392b',
    '🍓': '#e63950',
    '🫐': '#3f51b5',
    '🥝': '#8bc34a',
    '🫒': '#6b8e23',
    '🌰': '#8b4513',
    '🥜': '#d2a679',
    '🍬': '#ff6f91',
    '🍭': '#ff4d6d',
    '🧁': '#f8a5c2'
};

const getEmojiDominantColor = (emoji, fallbackColor) => EMOJI_DOMINANT_COLORS[emoji] ?? fallbackColor;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WORLD_OBJECT_TYPES,
        FOOD_QUALITIES,
        FOOD_EMOJIS_BY_TYPE_AND_QUALITY,
        FOOD_QUALITY_SPAWN_WEIGHTS,
        FOOD_NUTRITION_PER_100G,
        FOOD_PORTION_GRAMS_BY_TYPE,
        getRandomFoodForType,
        getFoodQualityForEmoji,
        getFoodNutritionFacts,
        getFoodEnergyKcal,
        EMOJI_DOMINANT_COLORS,
        getEmojiDominantColor,
        DEFAULT_WORLD_OBJECT_DEFINITIONS,
        DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS
    };
}

if (typeof window !== 'undefined') {
    window.WORLD_OBJECT_TYPES = WORLD_OBJECT_TYPES;
    window.FOOD_QUALITIES = FOOD_QUALITIES;
    window.FOOD_EMOJIS_BY_TYPE_AND_QUALITY = FOOD_EMOJIS_BY_TYPE_AND_QUALITY;
    window.getRandomFoodForType = getRandomFoodForType;
    window.getFoodQualityForEmoji = getFoodQualityForEmoji;
    window.getFoodNutritionFacts = getFoodNutritionFacts;
    window.getFoodEnergyKcal = getFoodEnergyKcal;
    window.EMOJI_DOMINANT_COLORS = EMOJI_DOMINANT_COLORS;
    window.getEmojiDominantColor = getEmojiDominantColor;
    window.DEFAULT_WORLD_OBJECT_DEFINITIONS = DEFAULT_WORLD_OBJECT_DEFINITIONS;
    window.DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS = DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS;
}
