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

describe('weather setting', () => {
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

    test('spawns weather cells only when enabled, and reports the setting in the game rules and directory', async () => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        let gameRules = null;
        player.on(SOCKET_EVENTS.SET_GAME_RULES, (payload) => { gameRules = payload; });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        const weatherPromise = waitForEvent(
            player,
            SOCKET_EVENTS.WEATHER_UPDATE,
            (cells) => Array.isArray(cells) && cells.length > 0
        );
        const activeGamesPromise = waitForEvent(
            player,
            SOCKET_EVENTS.ACTIVE_GAMES_UPDATED,
            (games) => games.some((game) => game.name === 'Stormy Game')
        );

        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Stormy Game',
            playerName: 'Weathered',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            weatherEnabled: true,
            autoJoin: true
        });

        const joined = await joinedPromise;
        expect(joined.speedPreset).toBe('mouse');

        const weatherCells = await weatherPromise;
        for (const cell of weatherCells) {
            expect(['windy', 'snow', 'rain', 'fog', 'storm']).toContain(cell.type);
            expect(typeof cell.x).toBe('number');
            expect(typeof cell.y).toBe('number');
            expect(cell.radius).toBeGreaterThan(0);
        }

        await wait(100);
        expect(gameRules.weatherEnabled).toBe(true);

        const activeGames = await activeGamesPromise;
        const listedGame = activeGames.find((game) => game.name === 'Stormy Game');
        expect(listedGame.weatherEnabled).toBe(true);
    }, 30_000);

    test('reports weather as disabled and sends no cells when the setting is off', async () => {
        const player = await connectClient(serverUrl);
        sockets.push(player);

        let gameRules = null;
        let weatherCells = 'not-set';
        player.on(SOCKET_EVENTS.SET_GAME_RULES, (payload) => { gameRules = payload; });
        player.on(SOCKET_EVENTS.WEATHER_UPDATE, (payload) => { weatherCells = payload; });

        const joinedPromise = waitForEvent(player, SOCKET_EVENTS.JOINED_GAME);
        player.emit(SOCKET_EVENTS.CREATE_GAME, {
            gameName: 'Calm Game',
            playerName: 'NoWeather',
            mapType: 'classic',
            playingType: 'timer',
            borderCollisionResponse: 'gameOver',
            dangerousObjectCollisionResponse: 'gameOver',
            foodHitBehavior: 'remove',
            weatherEnabled: false,
            autoJoin: true
        });
        await joinedPromise;
        await wait(300);

        expect(gameRules.weatherEnabled).toBe(false);
        expect(weatherCells).toEqual([]);
    }, 30_000);
});
