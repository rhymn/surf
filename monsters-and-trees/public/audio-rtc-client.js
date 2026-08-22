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
        let isJoining = false;
        let isMicEnabled = true;
        let isDeafened = false;
        let localStream = null;
        let statusListener = null;
        let lastError = null;
        let isPlaybackRetryScheduled = false;

        const peerConnections = new Map();
        const remoteAudioByPeerId = new Map();
        const pendingIceCandidatesByPeerId = new Map();

        const getVoiceUnavailableReason = () => {
            if (typeof window === 'undefined' || typeof navigator === 'undefined') {
                return 'Voice chat is unavailable here.';
            }

            if (!window.isSecureContext) {
                return 'Voice chat needs HTTPS (or localhost).';
            }

            if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
                return 'WebRTC audio is not supported in this browser.';
            }

            return null;
        };

        const supportsWebRtc = () => getVoiceUnavailableReason() === null;

        // Exactly one side of each pair offers, otherwise both peers glare and negotiation fails.
        const shouldInitiateOfferTo = (peerId) => `${socket.id}` > `${peerId}`;

        const countConnectedPeers = () => {
            let connectedPeers = 0;
            for (const peerConnection of peerConnections.values()) {
                if (peerConnection.connectionState === 'connected') {
                    connectedPeers += 1;
                }
            }

            return connectedPeers;
        };

        const notifyStatus = () => {
            if (typeof statusListener !== 'function') {
                return;
            }

            statusListener({
                enabledByServer,
                supportedByBrowser: supportsWebRtc(),
                unsupportedReason: getVoiceUnavailableReason(),
                isConnected,
                isMicEnabled,
                isDeafened,
                peerCount: peerConnections.size,
                connectedPeerCount: countConnectedPeers(),
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
            pendingIceCandidatesByPeerId.delete(peerId);
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

        // Browsers block unmuted playback until the page has been interacted with.
        const scheduleRemoteAudioPlaybackRetry = () => {
            if (isPlaybackRetryScheduled || typeof window === 'undefined') {
                return;
            }

            isPlaybackRetryScheduled = true;

            const retryPlayback = () => {
                window.removeEventListener('pointerdown', retryPlayback);
                window.removeEventListener('keydown', retryPlayback);
                isPlaybackRetryScheduled = false;

                for (const remoteAudioElement of remoteAudioByPeerId.values()) {
                    remoteAudioElement.play()
                        .then(() => clearError())
                        .catch(() => scheduleRemoteAudioPlaybackRetry());
                }
            };

            window.addEventListener('pointerdown', retryPlayback, { once: true });
            window.addEventListener('keydown', retryPlayback, { once: true });
        };

        const ensureLocalStream = async () => {
            if (localStream) {
                return localStream;
            }

            if (!supportsWebRtc()) {
                throw new Error(getVoiceUnavailableReason());
            }

            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
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

                const remoteStream = event.streams?.[0] ?? new MediaStream([event.track]);
                if (remoteStream) {
                    remoteAudioElement.srcObject = remoteStream;
                    remoteAudioElement.play().catch(() => {
                        setError('Tap anywhere to enable voice audio.');
                        scheduleRemoteAudioPlaybackRetry();
                    });
                }
            };

            peerConnection.onconnectionstatechange = () => {
                const connectionState = peerConnection.connectionState;
                if (connectionState === 'failed' || connectionState === 'closed') {
                    removePeerConnection(peerId);
                    return;
                }

                notifyStatus();
            };

            peerConnections.set(peerId, peerConnection);
            notifyStatus();
            return peerConnection;
        };

        const flushPendingIceCandidates = async (peerId, peerConnection) => {
            const pendingCandidates = pendingIceCandidatesByPeerId.get(peerId);
            if (!pendingCandidates) {
                return;
            }

            pendingIceCandidatesByPeerId.delete(peerId);

            for (const candidate of pendingCandidates) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    setError(`Could not add ICE candidate: ${error.message}`);
                }
            }
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
                await flushPendingIceCandidates(fromPeerId, peerConnection);
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

            const peerConnection = peerConnections.get(fromPeerId);
            if (!peerConnection) {
                return;
            }

            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
                await flushPendingIceCandidates(fromPeerId, peerConnection);
                clearError();
            } catch (error) {
                setError(`Could not accept voice answer: ${error.message}`);
            }
        };

        const handleIceCandidate = async ({ gameId, fromPeerId, candidate } = {}) => {
            if (!isConnected || !roomGameId || gameId !== roomGameId || !fromPeerId || !candidate) {
                return;
            }

            const peerConnection = peerConnections.get(fromPeerId);
            if (!peerConnection || !peerConnection.remoteDescription) {
                const pendingCandidates = pendingIceCandidatesByPeerId.get(fromPeerId) ?? [];
                pendingCandidates.push(candidate);
                pendingIceCandidatesByPeerId.set(fromPeerId, pendingCandidates);
                return;
            }

            try {
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
                if (peerId === socket.id || !shouldInitiateOfferTo(peerId)) {
                    continue;
                }

                createOfferForPeer(peerId);
            }
        };

        const handlePeerJoined = ({ gameId, peerId } = {}) => {
            if (!isConnected || !roomGameId || gameId !== roomGameId || !peerId || peerId === socket.id) {
                return;
            }

            if (!shouldInitiateOfferTo(peerId)) {
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
            if (isConnected || isJoining) {
                return isConnected;
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
                setError(getVoiceUnavailableReason());
                return false;
            }

            isJoining = true;

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
            } finally {
                isJoining = false;
            }
        };

        const leaveRoom = () => {
            if (isConnected) {
                socket.emit(eventNames.LEAVE_ROOM);
            }

            isConnected = false;
            roomGameId = null;
            cleanupPeers();
            pendingIceCandidatesByPeerId.clear();
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
                    unsupportedReason: getVoiceUnavailableReason(),
                    isConnected,
                    isMicEnabled,
                    isDeafened,
                    peerCount: peerConnections.size,
                    connectedPeerCount: countConnectedPeers(),
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
