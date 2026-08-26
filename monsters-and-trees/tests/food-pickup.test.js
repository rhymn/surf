'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const { getHeadPickupHitbox } = require('../public/snake-geometry.js');
const { FOOD_QUALITIES } = require('../public/world-object-definitions.js');
const { FOOD_QUALITY_MODIFIERS } = require('../server/game-logic.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
} = require('./server-harness.js');

describe('food pickup', () => {
    let serverProcess;
    let serverUrl;
    const sockets = [];

    beforeAll(async () => {
        ({ serverProcess, serverUrl } = await startTestServer({ BOT_COUNT: '0' }));
    });

    afterAll(async () => {
        for (const socket of sockets) {
            socket.removeAllListeners();
            await closeSocket(socket);
        }

        await stopServerProcess(serverProcess);
    });

    test('accepts food that touches the drawn head but not the body hitbox', async () => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        let worldObjects = {};
        let gameRules = null;
        let startPosition = null;
        let me = null;

        player.on(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (payload) => { worldObjects = payload; });
        player.on(SOCKET_EVENTS.SET_GAME_RULES, (payload) => { gameRules = payload; });
        player.on(SOCKET_EVENTS.SET_START_POSITION, (payload) => { startPosition = payload; });
        player.on(SOCKET_EVENTS.UPDATE_USERS, (payload) => { me = payload[player.id] ?? me; });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Pickup Game',
            playerName: 'Eater',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        await joinedPromise;
        await wait(300);

        const snakeWidth = me.w;
        const foodItem = Object.values(worldObjects)
            .filter((worldObject) => worldObject.type === 'dot' && worldObject.quality === FOOD_QUALITIES.AIP)
            .sort((first, second) => {
                return Math.hypot(first.x - startPosition.x, first.y - startPosition.y)
                    - Math.hypot(second.x - startPosition.x, second.y - startPosition.y);
            })[0];

        const headBox = getHeadPickupHitbox({ x: 0, y: 0 }, snakeWidth, gameRules.snakeHeadSizeMultiplier);
        const gapFromFood = Math.round((headBox.width - snakeWidth) / 2) - 2;
        const stopX = foodItem.x - snakeWidth - gapFromFood;
        const stopY = foodItem.y;

        // The body box stops short of the food, so only the head-sized box can reach it.
        expect(stopX + snakeWidth).toBeLessThan(foodItem.x);

        let currentX = startPosition.x;
        let currentY = startPosition.y;

        for (let tick = 0; tick < 6000; tick++) {
            const deltaX = stopX - currentX;
            const deltaY = stopY - currentY;
            const distance = Math.hypot(deltaX, deltaY);

            if (distance > 2) {
                currentX += (deltaX / distance) * 2;
                currentY += (deltaY / distance) * 2;
            } else {
                currentX = stopX;
                currentY = stopY;
            }

            player.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x: currentX, y: currentY });

            if (tick % 20 === 0) {
                await wait(1);
            }

            if (currentX === stopX && currentY === stopY) {
                break;
            }
        }

        await wait(200);

        const worldObjectsUpdated = waitForEvent(
            player,
            SOCKET_EVENTS.UPDATE_WORLD_OBJECTS,
            (payload) => !payload[foodItem.id]
        );
        player.emit(SOCKET_EVENTS.WORLD_OBJECT_HIT, foodItem.id);

        await worldObjectsUpdated;
        await wait(100);

        expect(me.score).toBe(FOOD_QUALITY_MODIFIERS[FOOD_QUALITIES.AIP].score);
    }, 30_000);

    test('broadcasts which food was eaten so bodies can be built from it', async () => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        let worldObjects = {};
        let startPosition = null;

        player.on(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (payload) => { worldObjects = payload; });
        player.on(SOCKET_EVENTS.SET_START_POSITION, (payload) => { startPosition = payload; });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Food Eaten Game',
            playerName: 'Eater',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        await joinedPromise;
        await wait(300);

        const foodItem = Object.values(worldObjects)
            .filter((worldObject) => worldObject.type === 'dot')
            .sort((first, second) => {
                return Math.hypot(first.x - startPosition.x, first.y - startPosition.y)
                    - Math.hypot(second.x - startPosition.x, second.y - startPosition.y);
            })[0];

        let currentX = startPosition.x;
        let currentY = startPosition.y;

        for (let tick = 0; tick < 6000; tick++) {
            const deltaX = foodItem.x - currentX;
            const deltaY = foodItem.y - currentY;
            const distance = Math.hypot(deltaX, deltaY);

            if (distance > 2) {
                currentX += (deltaX / distance) * 2;
                currentY += (deltaY / distance) * 2;
            } else {
                currentX = foodItem.x;
                currentY = foodItem.y;
            }

            player.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x: currentX, y: currentY });

            if (tick % 20 === 0) {
                await wait(1);
            }

            if (currentX === foodItem.x && currentY === foodItem.y) {
                break;
            }
        }

        await wait(200);

        const foodEatenPromise = waitForEvent(player, SOCKET_EVENTS.FOOD_EATEN);
        player.emit(SOCKET_EVENTS.WORLD_OBJECT_HIT, foodItem.id);

        const foodEaten = await foodEatenPromise;

        expect(foodEaten.userId).toBe(player.id);
        expect(foodEaten.emoji).toBe(foodItem.emoji);
        expect(foodEaten.segments).toBeGreaterThan(0);
    }, 30_000);
});
