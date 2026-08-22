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

const countWorldObjects = (worldObjectsById) => Object.keys(worldObjectsById ?? {}).length;

describe('multi-game world isolation', () => {
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

    test('world object changes in one game do not affect another game', async () => {
        const classicOwner = await connectClient(serverUrl);
        const thornsOwner = await connectClient(serverUrl);
        sockets.push(classicOwner, thornsOwner);

        const classicJoinedPromise = waitForEvent(
            classicOwner,
            SOCKET_EVENTS.JOINED_GAME,
            (payload) => payload?.gameName === 'Classic Isolation'
        );
        const classicDimensionsPromise = waitForEvent(
            classicOwner,
            SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS,
            (payload) => payload?.mapType === 'classic'
        );
        const classicWorldObjectsPromise = waitForEvent(
            classicOwner,
            SOCKET_EVENTS.UPDATE_WORLD_OBJECTS,
            (payload) => countWorldObjects(payload) > 0
        );
        classicOwner.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Classic Isolation',
            playerName: 'ClassicHost',
            mapType: 'classic',
            playingType: 'lastManStanding',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        const classicJoinPayload = await classicJoinedPromise;

        const classicDimensions = await classicDimensionsPromise;
        expect(classicDimensions.virtualWidth).toBe(6400);
        expect(classicDimensions.virtualHeight).toBe(6400);

        const classicWorldObjects = await classicWorldObjectsPromise;
        const classicCountBefore = countWorldObjects(classicWorldObjects);

        let classicSawThornsUser = false;
        let classicWorldCountChanged = false;
        const classicUsersWatcher = (payload) => {
            const users = Object.values(payload ?? {});
            if (users.some((user) => user?.name === 'ThornsHost' || user?.name === 'ThornsGuest')) {
                classicSawThornsUser = true;
            }
        };
        const classicWorldWatcher = (payload) => {
            if (countWorldObjects(payload) !== classicCountBefore) {
                classicWorldCountChanged = true;
            }
        };
        classicOwner.on(SOCKET_EVENTS.UPDATE_USERS, classicUsersWatcher);
        classicOwner.on(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, classicWorldWatcher);

        const thornsJoinedPromise = waitForEvent(
            thornsOwner,
            SOCKET_EVENTS.JOINED_GAME,
            (payload) => payload?.gameName === 'Thorns Isolation'
        );
        const thornsDimensionsPromise = waitForEvent(
            thornsOwner,
            SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS,
            (payload) => payload?.mapType === 'thorns'
        );
        const thornsWorldObjectsPromise = waitForEvent(
            thornsOwner,
            SOCKET_EVENTS.UPDATE_WORLD_OBJECTS,
            (payload) => countWorldObjects(payload) > 0
        );
        thornsOwner.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Thorns Isolation',
            playerName: 'ThornsHost',
            mapType: 'thorns',
            playingType: 'lastManStanding',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            autoJoin: true
        });
        const thornsJoinPayload = await thornsJoinedPromise;

        const thornsDimensions = await thornsDimensionsPromise;
        expect(thornsDimensions.virtualWidth).toBe(6000);
        expect(thornsDimensions.virtualHeight).toBe(6000);

        const thornsWorldObjects = await thornsWorldObjectsPromise;
        const thornsCountBefore = countWorldObjects(thornsWorldObjects);

        expect(classicJoinPayload.gameId).not.toBe(thornsJoinPayload.gameId);
        expect(classicCountBefore).not.toBe(thornsCountBefore);

        const thornsGuest = await connectClient(serverUrl);
        sockets.push(thornsGuest);
        const thornsUsersAfterJoinPromise = waitForEvent(
            thornsOwner,
            SOCKET_EVENTS.UPDATE_USERS,
            (payload) => Object.values(payload ?? {}).some((user) => user?.name === 'ThornsGuest')
        );

        thornsGuest.emit(SOCKET_EVENTS.JOIN_GAME, {
            gameId: thornsJoinPayload.gameId,
            playerName: 'ThornsGuest'
        });

        const thornsUsersAfterJoin = await thornsUsersAfterJoinPromise;
        expect(Object.values(thornsUsersAfterJoin)).toHaveLength(2);

        await wait(500);

        classicOwner.off(SOCKET_EVENTS.UPDATE_USERS, classicUsersWatcher);
        classicOwner.off(SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, classicWorldWatcher);
        expect(classicSawThornsUser).toBe(false);
        expect(classicWorldCountChanged).toBe(false);
    }, 30_000);
});
