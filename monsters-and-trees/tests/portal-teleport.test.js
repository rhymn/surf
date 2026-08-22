'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const { WORLD_OBJECT_TYPES, DEFAULT_WORLD_OBJECT_DEFINITIONS } = require('../public/world-object-definitions.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
} = require('./server-harness.js');

describe('portals', () => {
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

    test('teleports the snake somewhere else when it enters a portal', async () => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        let worldObjects = {};

        player.on(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (payload) => { worldObjects = payload; });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Portal Game',
            playerName: 'Traveller',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'bounce',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        await joinedPromise;
        await wait(300);

        const portals = Object.values(worldObjects)
            .filter((worldObject) => worldObject.type === WORLD_OBJECT_TYPES.PORTAL);
        expect(portals.length).toBeGreaterThan(0);

        const portal = portals[0];
        const teleportedPromise = waitForEvent(player, SOCKET_EVENTS.TELEPORTED);

        let hasTeleported = false;
        player.once(SOCKET_EVENTS.TELEPORTED, () => { hasTeleported = true; });

        // Walk onto the portal in server-sized steps so the movement validator accepts it.
        player.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x: portal.x, y: portal.y });
        await wait(50);

        for (let tick = 0; tick < 4000 && !hasTeleported; tick++) {
            player.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x: portal.x + 20, y: portal.y + 20 });
            player.emit(SOCKET_EVENTS.WORLD_OBJECT_HIT, portal.id);

            if (tick % 20 === 0) {
                await wait(1);
            }
        }

        const exitPosition = await teleportedPromise;

        expect(typeof exitPosition.x).toBe('number');
        expect(typeof exitPosition.y).toBe('number');

        const portalSize = DEFAULT_WORLD_OBJECT_DEFINITIONS[WORLD_OBJECT_TYPES.PORTAL].size;
        const isOutsidePortal = exitPosition.x + portalSize < portal.x
            || exitPosition.x > portal.x + portalSize
            || exitPosition.y + portalSize < portal.y
            || exitPosition.y > portal.y + portalSize;
        expect(isOutsidePortal).toBe(true);
    }, 30_000);
});
