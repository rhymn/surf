'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const { FOOD_QUALITIES } = require('../public/world-object-definitions.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
} = require('./server-harness.js');

describe('boost energy', () => {
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

    const joinFreshGame = async (gameName) => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        const state = { worldObjects: {}, energy: null, maxEnergy: null, isBoosting: false, startPosition: null, me: null };
        player.on(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (payload) => { state.worldObjects = payload; });
        player.on(SOCKET_EVENTS.SET_START_POSITION, (payload) => { state.startPosition = payload; });
        player.on(SOCKET_EVENTS.UPDATE_USERS, (payload) => { state.me = payload[player.id] ?? state.me; });
        player.on(SOCKET_EVENTS.ENERGY_UPDATE, (payload) => {
            state.energy = payload.energy;
            state.maxEnergy = payload.maxEnergy;
            state.isBoosting = payload.isBoosting;
        });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName,
            playerName: 'Booster',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        await joinedPromise;
        await wait(300);

        return { player, state };
    };

    test('starts full, drains only while boosting, and stops at empty', async () => {
        const { player, state } = await joinFreshGame('Drain Game');

        expect(state.energy).toBe(state.maxEnergy);

        await wait(500);
        expect(state.energy).toBe(state.maxEnergy);

        player.emit(SOCKET_EVENTS.SET_BOOST, true);
        await wait(1000);

        const afterBoosting = state.energy;
        expect(afterBoosting).toBeLessThan(state.maxEnergy);
        expect(state.isBoosting).toBe(true);

        player.emit(SOCKET_EVENTS.SET_BOOST, false);
        await wait(400);

        const afterRelease = state.energy;
        await wait(500);
        expect(state.energy).toBe(afterRelease);
        expect(state.isBoosting).toBe(false);
    }, 30_000);

    test('refuses to boost on an empty battery until food recharges it', async () => {
        const { player, state } = await joinFreshGame('Recharge Game');

        player.emit(SOCKET_EVENTS.SET_BOOST, true);
        await wait(11000);

        expect(state.energy).toBe(0);
        expect(state.isBoosting).toBe(false);

        player.emit(SOCKET_EVENTS.SET_BOOST, true);
        await wait(300);
        expect(state.isBoosting).toBe(false);

        const snakeWidth = state.me.w;
        const foodItem = Object.values(state.worldObjects)
            .filter((worldObject) => worldObject.type === 'dot' && worldObject.quality === FOOD_QUALITIES.AIP)
            .sort((first, second) => {
                return Math.hypot(first.x - state.startPosition.x, first.y - state.startPosition.y)
                    - Math.hypot(second.x - state.startPosition.x, second.y - state.startPosition.y);
            })[0];

        let currentX = state.startPosition.x;
        let currentY = state.startPosition.y;

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

        const energyBeforeEating = state.energy;
        player.emit(SOCKET_EVENTS.WORLD_OBJECT_HIT, foodItem.id);
        await wait(400);

        expect(state.energy).toBeGreaterThan(energyBeforeEating);
        expect(snakeWidth).toBeGreaterThan(0);
    }, 40_000);
});
