(function () {
    const createAudioRtcClient = ({ socket, rtcEvents, getCurrentGameId }) => {
        const fallbackRtcEvents = {
            CAPABILITIES: 'rtcCapabilities',
            JOIN_ROOM: 'rtcJoinRoom',
            LEAVE_ROOM: 'rtcLeaveRoom',
            PEERS_IN_ROOM: 'rtcPeersInRoom',
            PEER_JOINED: 'rtcPeerJoined',
            PEER_LEFT: 'rtcPeerLeft',
            OFFER: 'rtcOffer',
            ANSWER: 'rtcAnswer',
            ICE_CANDIDATE: 'rtcIceCandidate'
        };

        const eventNames = rtcEvents || fallbackRtcEvents;
        const defaultIceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

        let enabledByServer = false;
        let iceServers = defaultIceServers;
        let roomGameId = null;
        let isConnected = false;
        let isMicEnabled = true;
        let isDeafened = false;
        let localStream = null;
        let statusListener = null;
        let lastError = null;

        const peerConnections = new Map();
        const remoteAudioByPeerId = new Map();

        const supportsWebRtc = () => {
            return typeof window !== 'undefined' &&
                Boolean(window.RTCPeerConnection) &&
                Boolean(navigator.mediaDevices?.getUserMedia);
        };

        const notifyStatus = () => {
            if (typeof statusListener !== 'function') {
                return;
            }

            statusListener({
                enabledByServer,
                supportedByBrowser: supportsWebRtc(),
                isConnected,
                isMicEnabled,
                isDeafened,
                peerCount: peerConnections.size,
                gameId: roomGameId,
                lastError
            });
        };

        const setError = (errorMessage) => {
            lastError = errorMessage || null;
            notifyStatus();
        };

        const clearError = () => {
            if (!lastError) {
                return;
            }

            lastError = null;
            notifyStatus();
        };

        const removeRemoteAudioElement = (peerId) => {
            const remoteAudioElement = remoteAudioByPeerId.get(peerId);
            if (remoteAudioElement?.parentNode) {
                remoteAudioElement.parentNode.removeChild(remoteAudioElement);
            }
            remoteAudioByPeerId.delete(peerId);
        };

        const removePeerConnection = (peerId) => {
            const peerConnection = peerConnections.get(peerId);
            if (!peerConnection) {
                return;
            }

            peerConnection.onicecandidate = null;
            peerConnection.ontrack = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.close();
            peerConnections.delete(peerId);
            removeRemoteAudioElement(peerId);
            notifyStatus();
        };

        const cleanupPeers = () => {
            for (const peerId of peerConnections.keys()) {
                removePeerConnection(peerId);
            }
        };

        const stopLocalStream = () => {
            if (!localStream) {
                return;
            }

            for (const track of localStream.getTracks()) {
                track.stop();
            }
            localStream = null;
        };

        const setRemoteAudioMute = (shouldMute) => {
            for (const remoteAudioElement of remoteAudioByPeerId.values()) {
                remoteAudioElement.muted = shouldMute;
            }
        };

        const ensureLocalStream = async () => {
            if (localStream) {
                return localStream;
            }

            if (!supportsWebRtc()) {
                throw new Error('WebRTC audio is not supported in this browser.');
            }

            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            for (const track of localStream.getAudioTracks()) {
                track.enabled = isMicEnabled;
            }
            return localStream;
        };

        const createPeerConnection = async (peerId) => {
            if (!isConnected || !roomGameId || !peerId) {
                return null;
            }

            const existingConnection = peerConnections.get(peerId);
            if (existingConnection) {
                return existingConnection;
            }

            const stream = await ensureLocalStream();
            const peerConnection = new RTCPeerConnection({ iceServers });

            for (const track of stream.getTracks()) {
                peerConnection.addTrack(track, stream);
            }

            peerConnection.onicecandidate = (event) => {
                if (!event.candidate) {
                    return;
                }

                socket.emit(eventNames.ICE_CANDIDATE, {
                    targetPeerId: peerId,
                    candidate: event.candidate
                });
            };

            peerConnection.ontrack = (event) => {
                let remoteAudioElement = remoteAudioByPeerId.get(peerId);
                if (!remoteAudioElement) {
                    remoteAudioElement = document.createElement('audio');
                    remoteAudioElement.autoplay = true;
                    remoteAudioElement.playsInline = true;
                    remoteAudioElement.muted = isDeafened;
                    remoteAudioElement.style.display = 'none';
                    document.body.appendChild(remoteAudioElement);
                    remoteAudioByPeerId.set(peerId, remoteAudioElement);
                }

                const [remoteStream] = event.streams;
                if (remoteStream) {
                    remoteAudioElement.srcObject = remoteStream;
                    remoteAudioElement.play().catch(() => undefined);
                }
            };

            peerConnection.onconnectionstatechange = () => {
                const connectionState = peerConnection.connectionState;
                if (['failed', 'closed', 'disconnected'].includes(connectionState)) {
                    removePeerConnection(peerId);
                }
            };

            peerConnections.set(peerId, peerConnection);
            notifyStatus();
            return peerConnection;
        };

        const createOfferForPeer = async (peerId) => {
            if (!isConnected || !roomGameId || !peerId || peerId === socket.id) {
                return;
            }

            try {
                const peerConnection = await createPeerConnection(peerId);
                if (!peerConnection) {
                    return;
                }

                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit(eventNames.OFFER, {
                    targetPeerId: peerId,
                    description: offer
                });
                clearError();
            } catch (error) {
                setError(`Could not create voice offer: ${error.message}`);
            }
        };

        const handleOffer = async ({ gameId, fromPeerId, description } = {}) => {
            if (!isConnected || !roomGameId || gameId !== roomGameId || !fromPeerId || !description) {
                return;
            }

            try {
                const peerConnection = await createPeerConnection(fromPeerId);
                if (!peerConnection) {
                    return;
                }

                await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit(eventNames.ANSWER, {
                    targetPeerId: fromPeerId,
                    description: answer
                });
                clearError();
            } catch (error) {
                setError(`Could not accept voice offer: ${error.message}`);
            }
        };

        const handleAnswer = async ({ gameId, fromPeerId, description } = {}) => {
            if (!isConnected || !roomGameId || gameId !== roomGameId || !fromPeerId || !description) {
                return;
            }

            try {
                const peerConnection = await createPeerConnection(fromPeerId);
                if (!peerConnection) {
                    return;
                }

                await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
                clearError();
            } catch (error) {
                setError(`Could not accept voice answer: ${error.message}`);
            }
        };

        const handleIceCandidate = async ({ gameId, fromPeerId, candidate } = {}) => {
            if (!isConnected || !roomGameId || gameId !== roomGameId || !fromPeerId || !candidate) {
                return;
            }

            try {
                const peerConnection = await createPeerConnection(fromPeerId);
                if (!peerConnection) {
                    return;
                }

                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                clearError();
            } catch (error) {
                setError(`Could not add ICE candidate: ${error.message}`);
            }
        };

        const handleCapabilities = ({ enabled, iceServerConfig } = {}) => {
            enabledByServer = Boolean(enabled);
            iceServers = Array.isArray(iceServerConfig) && iceServerConfig.length > 0
                ? iceServerConfig
                : defaultIceServers;

            if (!enabledByServer && isConnected) {
                leaveRoom();
            }

            notifyStatus();
        };

        const handlePeersInRoom = ({ gameId, peerIds } = {}) => {
            if (!isConnected || !roomGameId || gameId !== roomGameId || !Array.isArray(peerIds)) {
                return;
            }

            for (const peerId of peerIds) {
                if (peerId === socket.id) {
                    continue;
                }

                createOfferForPeer(peerId);
            }
        };

        const handlePeerJoined = ({ gameId, peerId } = {}) => {
            if (!isConnected || !roomGameId || gameId !== roomGameId || !peerId || peerId === socket.id) {
                return;
            }

            createOfferForPeer(peerId);
        };

        const handlePeerLeft = ({ gameId, peerId } = {}) => {
            if (!roomGameId || gameId !== roomGameId || !peerId) {
                return;
            }

            removePeerConnection(peerId);
        };

        const joinRoom = async () => {
            if (isConnected) {
                return true;
            }

            const gameId = getCurrentGameId?.();
            if (!gameId) {
                setError('Join a game before enabling voice.');
                return false;
            }

            if (!enabledByServer) {
                setError('Voice chat is disabled on the server.');
                return false;
            }

            if (!supportsWebRtc()) {
                setError('WebRTC audio is not supported in this browser.');
                return false;
            }

            try {
                await ensureLocalStream();
                roomGameId = gameId;
                isConnected = true;
                socket.emit(eventNames.JOIN_ROOM);
                clearError();
                notifyStatus();
                return true;
            } catch (error) {
                setError(`Could not start microphone: ${error.message}`);
                return false;
            }
        };

        const leaveRoom = () => {
            if (isConnected) {
                socket.emit(eventNames.LEAVE_ROOM);
            }

            isConnected = false;
            roomGameId = null;
            cleanupPeers();
            stopLocalStream();
            notifyStatus();
        };

        const setMicEnabled = (nextMicEnabled) => {
            isMicEnabled = Boolean(nextMicEnabled);
            if (localStream) {
                for (const track of localStream.getAudioTracks()) {
                    track.enabled = isMicEnabled;
                }
            }
            notifyStatus();
        };

        const setDeafened = (nextDeafened) => {
            isDeafened = Boolean(nextDeafened);
            setRemoteAudioMute(isDeafened);
            notifyStatus();
        };

        const handleGameLeft = () => {
            leaveRoom();
        };

        const destroy = () => {
            leaveRoom();
            socket.off(eventNames.CAPABILITIES, handleCapabilities);
            socket.off(eventNames.PEERS_IN_ROOM, handlePeersInRoom);
            socket.off(eventNames.PEER_JOINED, handlePeerJoined);
            socket.off(eventNames.PEER_LEFT, handlePeerLeft);
            socket.off(eventNames.OFFER, handleOffer);
            socket.off(eventNames.ANSWER, handleAnswer);
            socket.off(eventNames.ICE_CANDIDATE, handleIceCandidate);
        };

        socket.on(eventNames.CAPABILITIES, handleCapabilities);
        socket.on(eventNames.PEERS_IN_ROOM, handlePeersInRoom);
        socket.on(eventNames.PEER_JOINED, handlePeerJoined);
        socket.on(eventNames.PEER_LEFT, handlePeerLeft);
        socket.on(eventNames.OFFER, handleOffer);
        socket.on(eventNames.ANSWER, handleAnswer);
        socket.on(eventNames.ICE_CANDIDATE, handleIceCandidate);

        notifyStatus();

        return {
            setStatusListener(listener) {
                statusListener = typeof listener === 'function' ? listener : null;
                notifyStatus();
            },
            joinRoom,
            leaveRoom,
            handleGameLeft,
            setMicEnabled,
            setDeafened,
            getStatus() {
                return {
                    enabledByServer,
                    supportedByBrowser: supportsWebRtc(),
                    isConnected,
                    isMicEnabled,
                    isDeafened,
                    peerCount: peerConnections.size,
                    gameId: roomGameId,
                    lastError
                };
            },
            destroy
        };
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createAudioRtcClient
        };
    }

    if (typeof window !== 'undefined') {
        window.createAudioRtcClient = createAudioRtcClient;
    }
})();
