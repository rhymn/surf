'use strict';

const SOCKET_EVENTS = require('../public/socket-events.js');
const RTC_EVENTS = require('../public/rtc-events.js');
const {
    startTestServer,
    stopServerProcess,
    connectClient,
    closeSocket,
    waitForEvent,
    wait
} = require('./server-harness.js');

const createGame = (socket, gameName, playerName) => {
    socket.emit(SOCKET_EVENTS.CREATE_GAME, {
        gameName,
        playerName,
        mapType: 'classic',
        playingType: 'timer',
        borderCollisionResponse: 'gameOver',
        dangerousObjectCollisionResponse: 'gameOver',
        foodHitBehavior: 'move',
        autoJoin: true
    });
};

describe('voice chat signaling', () => {
    let serverProcess;
    let serverUrl;
    const sockets = [];

    const connect = async () => {
        const socket = await connectClient(serverUrl);
        sockets.push(socket);
        return socket;
    };

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

    test('advertises capabilities with ICE servers on connect', async () => {
        const socket = await connectClient(serverUrl);
        const capabilitiesPromise = waitForEvent(socket, RTC_EVENTS.CAPABILITIES);
        sockets.push(socket);

        const capabilities = await capabilitiesPromise;
        expect(capabilities.enabled).toBe(true);
        expect(Array.isArray(capabilities.iceServerConfig)).toBe(true);
        expect(capabilities.iceServerConfig.length).toBeGreaterThan(0);
    }, 30_000);

    test('pairs peers in the same game and relays offer, answer and candidates', async () => {
        const host = await connect();
        const guest = await connect();

        const hostJoinedPromise = waitForEvent(host, SOCKET_EVENTS.JOINED_GAME);
        createGame(host, 'Voice Game', 'Host');
        const hostJoinPayload = await hostJoinedPromise;

        const guestJoinedPromise = waitForEvent(guest, SOCKET_EVENTS.JOINED_GAME);
        guest.emit(SOCKET_EVENTS.JOIN_GAME, { gameId: hostJoinPayload.gameId, playerName: 'Guest' });
        await guestJoinedPromise;

        const hostPeersPromise = waitForEvent(host, RTC_EVENTS.PEERS_IN_ROOM);
        host.emit(RTC_EVENTS.JOIN_ROOM);
        const hostPeers = await hostPeersPromise;
        expect(hostPeers.peerIds).toEqual([]);

        const hostSeesGuestPromise = waitForEvent(host, RTC_EVENTS.PEER_JOINED);
        const guestPeersPromise = waitForEvent(guest, RTC_EVENTS.PEERS_IN_ROOM);
        guest.emit(RTC_EVENTS.JOIN_ROOM);

        const guestPeers = await guestPeersPromise;
        expect(guestPeers.peerIds).toEqual([host.id]);

        const hostSeesGuest = await hostSeesGuestPromise;
        expect(hostSeesGuest.peerId).toBe(guest.id);

        const guestOfferPromise = waitForEvent(guest, RTC_EVENTS.OFFER);
        host.emit(RTC_EVENTS.OFFER, {
            targetPeerId: guest.id,
            description: { type: 'offer', sdp: 'fake-offer' }
        });
        const relayedOffer = await guestOfferPromise;
        expect(relayedOffer.fromPeerId).toBe(host.id);
        expect(relayedOffer.description.sdp).toBe('fake-offer');

        const hostAnswerPromise = waitForEvent(host, RTC_EVENTS.ANSWER);
        guest.emit(RTC_EVENTS.ANSWER, {
            targetPeerId: host.id,
            description: { type: 'answer', sdp: 'fake-answer' }
        });
        const relayedAnswer = await hostAnswerPromise;
        expect(relayedAnswer.fromPeerId).toBe(guest.id);
        expect(relayedAnswer.description.sdp).toBe('fake-answer');

        const guestCandidatePromise = waitForEvent(guest, RTC_EVENTS.ICE_CANDIDATE);
        host.emit(RTC_EVENTS.ICE_CANDIDATE, {
            targetPeerId: guest.id,
            candidate: { candidate: 'fake-candidate' }
        });
        const relayedCandidate = await guestCandidatePromise;
        expect(relayedCandidate.fromPeerId).toBe(host.id);

        const guestLeftPromise = waitForEvent(host, RTC_EVENTS.PEER_LEFT);
        guest.emit(RTC_EVENTS.LEAVE_ROOM);
        const guestLeft = await guestLeftPromise;
        expect(guestLeft.peerId).toBe(guest.id);
    }, 30_000);

    test('never relays signaling to a peer in another game', async () => {
        const insider = await connect();
        const outsider = await connect();

        const insiderJoinedPromise = waitForEvent(insider, SOCKET_EVENTS.JOINED_GAME);
        createGame(insider, 'Private Voice', 'Insider');
        await insiderJoinedPromise;

        const outsiderJoinedPromise = waitForEvent(outsider, SOCKET_EVENTS.JOINED_GAME);
        createGame(outsider, 'Other Voice', 'Outsider');
        await outsiderJoinedPromise;

        insider.emit(RTC_EVENTS.JOIN_ROOM);
        outsider.emit(RTC_EVENTS.JOIN_ROOM);
        await wait(200);

        let outsiderReceivedSignaling = false;
        const markReceived = () => {
            outsiderReceivedSignaling = true;
        };
        outsider.on(RTC_EVENTS.OFFER, markReceived);
        outsider.on(RTC_EVENTS.ICE_CANDIDATE, markReceived);

        insider.emit(RTC_EVENTS.OFFER, {
            targetPeerId: outsider.id,
            description: { type: 'offer', sdp: 'cross-game-offer' }
        });
        insider.emit(RTC_EVENTS.ICE_CANDIDATE, {
            targetPeerId: outsider.id,
            candidate: { candidate: 'cross-game-candidate' }
        });

        await wait(500);

        outsider.off(RTC_EVENTS.OFFER, markReceived);
        outsider.off(RTC_EVENTS.ICE_CANDIDATE, markReceived);
        expect(outsiderReceivedSignaling).toBe(false);
    }, 30_000);
});
