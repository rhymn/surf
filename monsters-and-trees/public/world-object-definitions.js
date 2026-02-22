const WORLD_OBJECT_TYPES = {
    TREE: 'tree',
    MONSTER: 'monster',
    CLOUD: 'cloud',
    THORN: 'thorn'
};

const DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS = {
    [WORLD_OBJECT_TYPES.TREE]: {
        size: 64,
        spawnPadding: 6,
        collisionInset: 16,
        blocksSpawn: true,
        removeOnHit: false,
        effects: {
            instantLose: true,
            growthDelta: 0,
            scoreDelta: 0
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
            growthDelta: 50,
            scoreDelta: 1
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
            scoreDelta: 0
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
            scoreDelta: 0
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WORLD_OBJECT_TYPES,
        DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS
    };
}

if (typeof window !== 'undefined') {
    window.WORLD_OBJECT_TYPES = WORLD_OBJECT_TYPES;
    window.DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS = DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS;
}
