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
const walkToward = async (player, from, to, step = 20) => {
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

// Approaches `target` (a point on the owner's horizontal body line) from well
// outside that line, then descends straight onto it in the final leg. This
// guarantees the attacker only ever touches the intended segment instead of
// risking a straight-line path that clips other segments along the way.
const approachAlongPerpendicularPath = async (player, from, target, bodyLineY, boardHeight) => {
    const offsetDirection = bodyLineY > boardHeight / 2 ? -1 : 1;
    const stagingY = bodyLineY + offsetDirection * 300;

    await walkToward(player, from, { x: from.x, y: stagingY });
    const staged = await walkToward(player, { x: from.x, y: stagingY }, { x: target.x, y: stagingY });
    await walkToward(player, staged, target);
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
        let boardHeight = null;
        owner.on(SOCKET_EVENTS.SET_START_POSITION, (payload) => { ownerStart = payload; });
        owner.on(SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, (payload) => {
            boardWidth = payload.virtualWidth;
            boardHeight = payload.virtualHeight;
        });

        const ownerJoinedPromise = waitForEvent(owner, SOCKET_EVENTS.JOINED_GAME);
        owner.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Tail Bite Game',
            playerName: 'Owner',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'bounce',
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

        return { owner, guest, users, ownerStart, guestStart, boardWidth, boardHeight };
    };

    // Moves the owner in a straight horizontal line so its body forms a
    // predictable, evenly spaced line with a head distinct from its tail.
    const buildOwnerTrail = async (owner, ownerStart, boardWidth) => {
        const stepDirection = ownerStart.x < boardWidth / 2 ? 1 : -1;
        const step = 6;
        let ownerHead = ownerStart;

        for (let i = 0; i < 6; i++) {
            const target = { x: ownerStart.x + stepDirection * step * (i + 1), y: ownerStart.y };
            owner.emit(SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, target);
            ownerHead = target;
            await wait(30);
        }

        return {
            tail: { x: ownerStart.x + stepDirection * step, y: ownerStart.y },
            head: ownerHead
        };
    };

    test('nibbles exactly one segment off a bigger snake\'s tail and grows the attacker', async () => {
        const { owner, guest, users, ownerStart, guestStart, boardWidth, boardHeight } = await joinSharedGame();
        const { tail } = await buildOwnerTrail(owner, ownerStart, boardWidth);

        const usersUpdatedPromise = waitForEvent(
            guest,
            SOCKET_EVENTS.UPDATE_USERS,
            (payload) => payload[owner.id]?.l === 5 && payload[guest.id]?.l === 7
        );

        await approachAlongPerpendicularPath(guest, guestStart, tail, ownerStart.y, boardHeight);

        await usersUpdatedPromise;

        expect(users[owner.id].l).toBe(5);
        expect(users[guest.id].l).toBe(7);
        expect(users[guest.id].score).toBeGreaterThan(0);
    }, 30_000);

    test('instantly kills a snake that touches a bigger snake anywhere but its tail', async () => {
        const { owner, guest, users, ownerStart, guestStart, boardWidth, boardHeight } = await joinSharedGame();
        const { head } = await buildOwnerTrail(owner, ownerStart, boardWidth);

        await wait(200);
        const ownerLengthBefore = users[owner.id].l;
        const guestLengthBefore = users[guest.id].l;

        let latestUsers = null;
        owner.on(SOCKET_EVENTS.UPDATE_USERS, (payload) => { latestUsers = payload; });
        const guestEatenPromise = waitForEvent(guest, SOCKET_EVENTS.YOU_WERE_EATEN);

        // Guest approaches the owner's current head (not the tail) instead.
        await approachAlongPerpendicularPath(guest, guestStart, head, ownerStart.y, boardHeight);

        await guestEatenPromise;

        // Poll instead of matching a single UPDATE_USERS payload exactly, since
        // multiple broadcasts may arrive before the final settled state does.
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            if (latestUsers && !latestUsers[guest.id] && latestUsers[owner.id]?.l > ownerLengthBefore) {
                break;
            }
            await wait(50);
        }

        expect(latestUsers[owner.id].l).toBe(ownerLengthBefore + guestLengthBefore);
        expect(latestUsers[guest.id]).toBeUndefined();
    }, 30_000);
});
