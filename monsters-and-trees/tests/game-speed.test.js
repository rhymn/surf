'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent
} = require('./server-harness.js');

describe('game speed setting', () => {
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

    const createAndJoinGame = async (speedPreset) => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        const movementConfigPromise = waitForEvent(player, SOCKET_EVENTS.SET_MOVEMENT_CONFIG);

        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: `Speed Game ${speedPreset}`,
            playerName: 'Speedster',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            speedPreset,
            autoJoin: true
        });

        const joined = await joinedPromise;
        const movementConfig = await movementConfigPromise;

        return { player, joined, movementConfig };
    };

    test('scales every participant\'s movement speed by the chosen preset', async () => {
        const snail = await createAndJoinGame('snail');
        const mouse = await createAndJoinGame('mouse');
        const cheetah = await createAndJoinGame('cheetah');

        expect(snail.joined.speedPreset).toBe('snail');
        expect(mouse.joined.speedPreset).toBe('mouse');
        expect(cheetah.joined.speedPreset).toBe('cheetah');

        expect(snail.movementConfig.baseStep).toBeLessThan(mouse.movementConfig.baseStep);
        expect(mouse.movementConfig.baseStep).toBeLessThan(cheetah.movementConfig.baseStep);
        expect(cheetah.movementConfig.baseStep).toBe(snail.movementConfig.baseStep * 4);
    }, 30_000);

    test('falls back to the default speed when an invalid preset is requested', async () => {
        const { joined, movementConfig } = await createAndJoinGame('supersonic');
        const { movementConfig: mouseConfig } = await createAndJoinGame('mouse');

        expect(joined.speedPreset).toBe('mouse');
        expect(movementConfig.baseStep).toBe(mouseConfig.baseStep);
    }, 30_000);

    test('lists the speed preset in the active games directory', async () => {
        const owner = await connectClient(serverUrl);
        sockets.push(owner);

        const activeGamesPromise = waitForEvent(
            owner,
            SOCKET_EVENTS.ACTIVE_GAMES_UPDATED,
            (games) => games.some((game) => game.name === 'Directory Speed Game')
        );

        owner.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Directory Speed Game',
            playerName: 'Owner',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            speedPreset: 'cheetah',
            autoJoin: true
        });

        const activeGames = await activeGamesPromise;
        const listedGame = activeGames.find((game) => game.name === 'Directory Speed Game');

        expect(listedGame.speedPreset).toBe('cheetah');
    }, 30_000);
});
