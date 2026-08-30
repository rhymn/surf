'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const { WORLD_OBJECT_TYPES } = require('../public/world-object-definitions.js');
const { SPEED_STAR_MULTIPLIER, SPEED_STAR_DURATION_MS } = require('../server/game-logic.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
} = require('./server-harness.js');

describe('speed star', () => {
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

    test('eating a star grants a timed speed rush and removes the star', async () => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        let worldObjects = {};
        let latestSpeedStarUpdate = null;
        let latestScore = null;

        player.on(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (payload) => { worldObjects = payload; });
        player.on(SOCKET_EVENTS.SPEED_STAR_UPDATE, (payload) => { latestSpeedStarUpdate = payload; });
        player.on(SOCKET_EVENTS.UPDATE_USERS, (users) => { latestScore = users[player.id]?.score ?? latestScore; });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Star Game',
            playerName: 'Sprinter',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'bounce',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        await joinedPromise;
        await wait(300);

        const stars = Object.values(worldObjects)
            .filter((worldObject) => worldObject.type === WORLD_OBJECT_TYPES.STAR);
        expect(stars.length).toBeGreaterThan(0);

        const star = stars[0];
        expect(star.emoji).toBe('⭐');

        const activatedPromise = waitForEvent(player, SOCKET_EVENTS.SPEED_STAR_UPDATE);

        let hasActivated = false;
        player.once(SOCKET_EVENTS.SPEED_STAR_UPDATE, () => { hasActivated = true; });

        // Walk onto the star in server-sized steps so the movement validator accepts it.
        player.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x: star.x, y: star.y });
        await wait(50);

        for (let tick = 0; tick < 4000 && !hasActivated; tick++) {
            player.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x: star.x + 10, y: star.y + 10 });
            player.emit(SOCKET_EVENTS.WORLD_OBJECT_HIT, star.id);

            if (tick % 20 === 0) {
                await wait(1);
            }
        }

        const speedStarUpdate = await activatedPromise;

        expect(speedStarUpdate.multiplier).toBe(SPEED_STAR_MULTIPLIER);
        expect(speedStarUpdate.durationMs).toBe(SPEED_STAR_DURATION_MS);
        expect(speedStarUpdate.remainingMs).toBeGreaterThan(0);
        expect(speedStarUpdate.remainingMs).toBeLessThanOrEqual(SPEED_STAR_DURATION_MS);

        await wait(200);
        expect(worldObjects[star.id]).toBeUndefined();
        expect(latestScore).toBe(0);
        expect(latestSpeedStarUpdate).not.toBeNull();
    }, 30_000);
});
