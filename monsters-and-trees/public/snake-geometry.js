// The head is drawn as an emoji that is much larger than the body hitbox, so food
// pickup uses this box to match what the player actually sees touching the food.
const MIN_HEAD_RENDER_SIZE = 32;

const getHeadRenderSize = (snakeWidth, headSizeMultiplier = 2) => {
    return Math.max(MIN_HEAD_RENDER_SIZE, snakeWidth * headSizeMultiplier);
};

const getHeadPickupHitbox = (position, snakeWidth, headSizeMultiplier = 2) => {
    const headSize = getHeadRenderSize(snakeWidth, headSizeMultiplier);
    const centerX = position.x + snakeWidth / 2;
    const centerY = position.y + snakeWidth / 2;

    return {
        x: centerX - headSize / 2,
        y: centerY - headSize / 2,
        width: headSize,
        height: headSize
    };
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MIN_HEAD_RENDER_SIZE,
        getHeadRenderSize,
        getHeadPickupHitbox
    };
}

if (typeof window !== 'undefined') {
    window.MIN_HEAD_RENDER_SIZE = MIN_HEAD_RENDER_SIZE;
    window.getHeadRenderSize = getHeadRenderSize;
    window.getHeadPickupHitbox = getHeadPickupHitbox;
}
