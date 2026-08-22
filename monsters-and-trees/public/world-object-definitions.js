const WORLD_OBJECT_TYPES = {
    TREE: 'tree',
    MONSTER: 'monster',
    CLOUD: 'cloud',
    THORN: 'thorn',
    DOT: 'dot'
};

// Every edible object is drawn as one of these emojis, picked when it spawns.
// Each tier keeps a consistent real-world size so players can still read the map.
const FOOD_EMOJIS_BY_TYPE = {
    [WORLD_OBJECT_TYPES.MONSTER]: ['🍉', '🍍', '🥥', '🍈', '🎃', '🥬', '🍞', '🧀'],
    [WORLD_OBJECT_TYPES.CLOUD]: [
        '🍌', '🍎', '🍏', '🍐', '🍊', '🍑', '🍋', '🥭',
        '🥑', '🌽', '🥕', '🫑', '🥦', '🥐'
    ],
    [WORLD_OBJECT_TYPES.DOT]: ['🍇', '🍒', '🍓', '🫐', '🥝', '🍅', '🌰', '🥜', '🫒', '🥚']
};

const getRandomFoodEmojiForType = (type) => {
    const emojisForType = FOOD_EMOJIS_BY_TYPE[type];
    if (!emojisForType || emojisForType.length === 0) {
        return null;
    }

    return emojisForType[Math.floor(Math.random() * emojisForType.length)];
};

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
    }
};

const DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS = DEFAULT_WORLD_OBJECT_DEFINITIONS;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WORLD_OBJECT_TYPES,
        FOOD_EMOJIS_BY_TYPE,
        getRandomFoodEmojiForType,
        DEFAULT_WORLD_OBJECT_DEFINITIONS,
        DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS
    };
}

if (typeof window !== 'undefined') {
    window.WORLD_OBJECT_TYPES = WORLD_OBJECT_TYPES;
    window.FOOD_EMOJIS_BY_TYPE = FOOD_EMOJIS_BY_TYPE;
    window.getRandomFoodEmojiForType = getRandomFoodEmojiForType;
    window.DEFAULT_WORLD_OBJECT_DEFINITIONS = DEFAULT_WORLD_OBJECT_DEFINITIONS;
    window.DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS = DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS;
}
