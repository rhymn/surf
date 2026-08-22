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

const createLastManStandingGame = (socket, gameName, playerName) => {
    socket.emit(SOCKET_EVENTS.CREATE_GAME, {
        gameName,
        playerName,
        mapType: 'classic',
        playingType: 'lastManStanding',
        borderCollisionResponse: 'gameOver',
        dangerousObjectCollisionResponse: 'gameOver',
        foodHitBehavior: 'remove',
        autoJoin: true
    });
};

describe('last man standing', () => {
    let serverProcess;
    let serverUrl;
    const sockets = [];

    beforeAll(async () => {
        ({ serverProcess, serverUrl } = await startTestServer());
    });

    afterAll(async () => {
        for (const socket of sockets) {
            socket.removeAllListeners();
            await closeSocket(socket);
        }

        await stopServerProcess(serverProcess);
    });

    test('does not end the match when bots are the only other participants', async () => {
        const soloPlayer = await connectClient(serverUrl);
        sockets.push(soloPlayer);

        let endedMatchState = null;
        soloPlayer.on(SOCKET_EVENTS.MATCH_STATE_UPDATE, (matchState) => {
            if (matchState?.isEnded) {
                endedMatchState = matchState;
            }
        });

        const joinedPromise = waitForEvent(soloPlayer, SOCKET_EVENTS.JOINED_GAME);
        createLastManStandingGame(soloPlayer, 'Solo LMS', 'SoloPlayer');
        await joinedPromise;

        const usersWithBots = await waitForEvent(
            soloPlayer,
            SOCKET_EVENTS.UPDATE_USERS,
            (payload) => Object.values(payload ?? {}).length > 1
        );
        expect(Object.values(usersWithBots).length).toBeGreaterThan(1);

        soloPlayer.emit(SOCKET_EVENTS.PLAYER_SELF_DESTRUCTED);
        await wait(600);

        expect(endedMatchState).toBeNull();
    }, 30_000);

    test('ends with the surviving human as named winner once another human dies', async () => {
        const survivor = await connectClient(serverUrl);
        const challenger = await connectClient(serverUrl);
        sockets.push(survivor, challenger);

        let survivorEnded = null;
        survivor.on(SOCKET_EVENTS.MATCH_STATE_UPDATE, (matchState) => {
            if (matchState?.isEnded) {
                survivorEnded = matchState;
            }
        });

        const joinedPromise = waitForEvent(survivor, SOCKET_EVENTS.JOINED_GAME);
        createLastManStandingGame(survivor, 'Duo LMS', 'Survivor');
        const joinPayload = await joinedPromise;

        const challengerJoinedPromise = waitForEvent(challenger, SOCKET_EVENTS.JOINED_GAME);
        challenger.emit(SOCKET_EVENTS.JOIN_GAME, {
            gameId: joinPayload.gameId,
            playerName: 'Challenger'
        });
        await challengerJoinedPromise;

        await wait(400);
        expect(survivorEnded).toBeNull();

        const endedPromise = waitForEvent(
            survivor,
            SOCKET_EVENTS.MATCH_STATE_UPDATE,
            (matchState) => matchState?.isEnded === true
        );
        challenger.emit(SOCKET_EVENTS.PLAYER_SELF_DESTRUCTED);

        const endedMatchState = await endedPromise;
        expect(endedMatchState.reason).toBe('lastManStanding');
        expect(endedMatchState.winnerName).toBe('Survivor');
    }, 30_000);
});
