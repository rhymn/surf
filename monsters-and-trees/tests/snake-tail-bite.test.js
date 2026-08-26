'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
} = require('./server-harness.js');

// Small helper: walk a player's head toward a target position in bounded steps
// so the server's per-update movement-distance validation always accepts it.
const walkToward = async (player, from, to, step = 5) => {
    let currentX = from.x;
    let currentY = from.y;

    for (let tick = 0; tick < 2000; tick++) {
        const deltaX = to.x - currentX;
        const deltaY = to.y - currentY;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance <= step) {
            currentX = to.x;
            currentY = to.y;
        } else {
            currentX += (deltaX / distance) * step;
            currentY += (deltaY / distance) * step;
        }

        player.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, { x: currentX, y: currentY });

        if (tick % 10 === 0) {
            await wait(1);
        }

        if (currentX === to.x && currentY === to.y) {
            break;
        }
    }

    await wait(150);
    return { x: currentX, y: currentY };
};

describe('snake tail biting', () => {
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

    const joinSharedGame = async () => {
        const owner = await connectClient(serverUrl);
        const guest = await connectClient(serverUrl);
        sockets.push(owner, guest);

        const users = {};
        owner.on(SOCKET_EVENTS.UPDATE_USERS, (payload) => Object.assign(users, payload));
        guest.on(SOCKET_EVENTS.UPDATE_USERS, (payload) => Object.assign(users, payload));

        let ownerStart = null;
        let boardWidth = null;
        owner.on(SOCKET_EVENTS.SET_START_POSITION, (payload) => { ownerStart = payload; });
        owner.on(SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, (payload) => { boardWidth = payload.virtualWidth; });

        const ownerJoinedPromise = waitForEvent(owner, SOCKET_EVENTS.JOINED_GAME);
        owner.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Tail Bite Game',
            playerName: 'Owner',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        const ownerJoined = await ownerJoinedPromise;
        await wait(200);

        let guestStart = null;
        guest.on(SOCKET_EVENTS.SET_START_POSITION, (payload) => { guestStart = payload; });

        const guestJoinedPromise = waitForEvent(guest, SOCKET_EVENTS.JOINED_GAME);
        guest.emit(SOCKET_EVENTS.JOIN_GAME, { gameId: ownerJoined.gameId, playerName: 'Guest' });
        await guestJoinedPromise;
        await wait(300);

        return { owner, guest, users, ownerStart, guestStart, boardWidth };
    };

    test('nibbles exactly one segment off a bigger snake\'s tail and grows the attacker', async () => {
        const { owner, guest, users, ownerStart, guestStart, boardWidth } = await joinSharedGame();

        // Build up the owner's trail so its tail sits away from its current head.
        const stepDirection = ownerStart.x < boardWidth / 2 ? 1 : -1;
        const step = 6;
        const firstMoveTarget = { x: ownerStart.x + stepDirection * step, y: ownerStart.y };

        for (let i = 0; i < 6; i++) {
            const target = { x: ownerStart.x + stepDirection * step * (i + 1), y: ownerStart.y };
            owner.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, target);
            await wait(30);
        }

        const usersUpdatedPromise = waitForEvent(
            guest,
            SOCKET_EVENTS.UPDATE_USERS,
            (payload) => payload[owner.id]?.l === 5 && payload[guest.id]?.l === 7
        );

        // Guest walks onto the owner's tail (the owner's first move target).
        // A step bigger than the combined hitbox width means the approach jumps
        // straight onto the target in one tick, triggering exactly one bite.
        await walkToward(guest, guestStart, firstMoveTarget, 20);

        await usersUpdatedPromise;

        expect(users[owner.id].l).toBe(5);
        expect(users[guest.id].l).toBe(7);
        expect(users[guest.id].score).toBeGreaterThan(0);
    }, 30_000);

    test('does not shrink a snake when touched anywhere except its tail', async () => {
        const { owner, guest, users, ownerStart, guestStart, boardWidth } = await joinSharedGame();

        // Move the owner so its trail has a head that is distinct from its tail.
        const stepDirection = ownerStart.x < boardWidth / 2 ? 1 : -1;
        const step = 6;
        let ownerHead = ownerStart;

        for (let i = 0; i < 6; i++) {
            const target = { x: ownerStart.x + stepDirection * step * (i + 1), y: ownerStart.y };
            owner.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, target);
            ownerHead = target;
            await wait(30);
        }

        await wait(200);
        const ownerLengthBefore = users[owner.id].l;
        const guestLengthBefore = users[guest.id].l;

        // Guest walks onto the owner's current head (not the tail) instead.
        await walkToward(guest, guestStart, ownerHead, 20);
        await wait(300);

        expect(users[owner.id].l).toBe(ownerLengthBefore);
        expect(users[guest.id].l).toBe(guestLengthBefore);
    }, 30_000);
});
