'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const { EMOJI_DOMINANT_COLORS } = require('../public/world-object-definitions.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
} = require('./server-harness.js');

describe('corpse food colors', () => {
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

    test('turns an eaten food segment into a dot colored like that food', async () => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        let worldObjects = {};
        let startPosition = null;

        player.on(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (payload) => { worldObjects = payload; });
        player.on(SOCKET_EVENTS.SET_START_POSITION, (payload) => { startPosition = payload; });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Corpse Color Game',
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

        const expectedColor = EMOJI_DOMINANT_COLORS[foodEaten.emoji];
        expect(expectedColor).toBeDefined();

        const frozenSnakesPromise = waitForEvent(
            player,
            SOCKET_EVENTS.UPDATE_FROZEN_SNAKES,
            (payload) => Object.values(payload ?? {}).some(
                (corpse) => corpse.segments.some((segment) => segment.color === expectedColor)
            )
        );
        player.emit(SOCKET_EVENTS.PLAYER_SELF_DESTRUCTED);

        const frozenSnakes = await frozenSnakesPromise;
        const matchingCorpse = Object.values(frozenSnakes).find(
            (corpse) => corpse.segments.some((segment) => segment.color === expectedColor)
        );

        expect(matchingCorpse).toBeDefined();
    }, 30_000);
});
