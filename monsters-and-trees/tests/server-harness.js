'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const SERVER_START_TIMEOUT_MS = 12_000;
const EVENT_TIMEOUT_MS = 8_000;

const startTestServer = async (extraEnv = {}) => {
    // PORT=0 lets the OS pick a free port, so parallel suites cannot collide.
    const serverProcess = spawn('node', ['server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, PORT: '0', ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const port = await new Promise((resolve, reject) => {
        let startupOutput = '';

        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for server to start. Output: ${startupOutput}`));
        }, SERVER_START_TIMEOUT_MS);

        const onData = (chunk) => {
            startupOutput += `${chunk}`;
            const listeningPort = startupOutput.match(/Server is running on http:\/\/localhost:(\d+)/)?.[1];

            if (listeningPort) {
                clearTimeout(timeoutId);
                cleanup();
                resolve(Number(listeningPort));
            }
        };

        const onExit = (code) => {
            clearTimeout(timeoutId);
            cleanup();
            reject(new Error(`Server exited before startup (code=${code}). Output: ${startupOutput}`));
        };

        const cleanup = () => {
            serverProcess.stdout.off('data', onData);
            serverProcess.off('exit', onExit);
        };

        serverProcess.stdout.on('data', onData);
        serverProcess.once('exit', onExit);
    });

    return { serverProcess, serverUrl: `http://127.0.0.1:${port}` };
};

const stopServerProcess = (serverProcess) => {
    return new Promise((resolve) => {
        if (!serverProcess || serverProcess.killed) {
            resolve();
            return;
        }

        const timeoutId = setTimeout(() => {
            serverProcess.kill('SIGKILL');
        }, 1_000);

        serverProcess.once('exit', () => {
            clearTimeout(timeoutId);
            resolve();
        });

        serverProcess.kill('SIGTERM');
    });
};

const connectClient = (serverUrl) => {
    const socket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
    });

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            socket.close();
            reject(new Error('Timed out connecting Socket.IO client'));
        }, EVENT_TIMEOUT_MS);

        socket.once('connect', () => {
            clearTimeout(timeoutId);
            resolve(socket);
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
};

const closeSocket = (socket) => {
    return new Promise((resolve) => {
        if (!socket || !socket.connected) {
            resolve();
            return;
        }

        const fallbackId = setTimeout(resolve, 300);
        socket.once('disconnect', () => {
            clearTimeout(fallbackId);
            resolve();
        });
        socket.disconnect();
    });
};

const waitForEvent = (socket, eventName, predicate = () => true) => {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            socket.off(eventName, handler);
            reject(new Error(`Timed out waiting for ${eventName}`));
        }, EVENT_TIMEOUT_MS);

        const handler = (payload) => {
            if (!predicate(payload)) {
                return;
            }

            clearTimeout(timeoutId);
            socket.off(eventName, handler);
            resolve(payload);
        };

        socket.on(eventName, handler);
    });
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
    EVENT_TIMEOUT_MS,
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
};
