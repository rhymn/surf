const createRtcSignalingState = () => {
    const audioParticipantsByGameId = new Map();
    const audioGameIdBySocketId = new Map();

    const getOrCreateParticipantSet = (gameId) => {
        if (!audioParticipantsByGameId.has(gameId)) {
            audioParticipantsByGameId.set(gameId, new Set());
        }

        return audioParticipantsByGameId.get(gameId);
    };

    const addParticipant = (gameId, socketId) => {
        const participants = getOrCreateParticipantSet(gameId);
        participants.add(socketId);
        audioGameIdBySocketId.set(socketId, gameId);
    };

    const removeParticipant = (gameId, socketId) => {
        if (!gameId) {
            return;
        }

        const participants = audioParticipantsByGameId.get(gameId);
        if (!participants) {
            return;
        }

        participants.delete(socketId);
        audioGameIdBySocketId.delete(socketId);

        if (participants.size === 0) {
            audioParticipantsByGameId.delete(gameId);
        }
    };

    const getParticipants = (gameId) => {
        const participants = audioParticipantsByGameId.get(gameId);
        if (!participants) {
            return [];
        }

        return Array.from(participants);
    };

    const getAudioGameIdForSocketId = (socketId) => {
        return audioGameIdBySocketId.get(socketId) ?? null;
    };

    return {
        addParticipant,
        removeParticipant,
        getParticipants,
        getAudioGameIdForSocketId
    };
};

const registerRtcSignalingHandlers = ({
    io,
    socket,
    rtcEvents,
    getGameIdForSocketId,
    getRoomNameForGame,
    signalingState
}) => {
    const getCurrentGameId = () => {
        return signalingState.getAudioGameIdForSocketId(socket.id) ?? getGameIdForSocketId(socket.id);
    };

    const leaveAudioRoom = () => {
        const gameId = getCurrentGameId();
        if (!gameId) {
            return;
        }

        signalingState.removeParticipant(gameId, socket.id);
        socket.to(getRoomNameForGame(gameId)).emit(rtcEvents.PEER_LEFT, {
            gameId,
            peerId: socket.id
        });
    };

    socket.on(rtcEvents.JOIN_ROOM, () => {
        const gameId = getCurrentGameId();
        if (!gameId) {
            return;
        }

        const peersInRoom = signalingState
            .getParticipants(gameId)
            .filter((peerId) => peerId !== socket.id);

        socket.emit(rtcEvents.PEERS_IN_ROOM, {
            gameId,
            peerIds: peersInRoom
        });

        signalingState.addParticipant(gameId, socket.id);

        socket.to(getRoomNameForGame(gameId)).emit(rtcEvents.PEER_JOINED, {
            gameId,
            peerId: socket.id
        });
    });

    socket.on(rtcEvents.LEAVE_ROOM, () => {
        leaveAudioRoom();
    });

    socket.on(rtcEvents.OFFER, ({ targetPeerId, description } = {}) => {
        const gameId = getCurrentGameId();
        if (!gameId || !targetPeerId || !description) {
            return;
        }

        const targetGameId = getGameIdForSocketId(targetPeerId);
        if (!targetGameId || targetGameId !== gameId) {
            return;
        }

        io.to(targetPeerId).emit(rtcEvents.OFFER, {
            gameId,
            fromPeerId: socket.id,
            description
        });
    });

    socket.on(rtcEvents.ANSWER, ({ targetPeerId, description } = {}) => {
        const gameId = getCurrentGameId();
        if (!gameId || !targetPeerId || !description) {
            return;
        }

        const targetGameId = getGameIdForSocketId(targetPeerId);
        if (!targetGameId || targetGameId !== gameId) {
            return;
        }

        io.to(targetPeerId).emit(rtcEvents.ANSWER, {
            gameId,
            fromPeerId: socket.id,
            description
        });
    });

    socket.on(rtcEvents.ICE_CANDIDATE, ({ targetPeerId, candidate } = {}) => {
        const gameId = getCurrentGameId();
        if (!gameId || !targetPeerId || !candidate) {
            return;
        }

        const targetGameId = getGameIdForSocketId(targetPeerId);
        if (!targetGameId || targetGameId !== gameId) {
            return;
        }

        io.to(targetPeerId).emit(rtcEvents.ICE_CANDIDATE, {
            gameId,
            fromPeerId: socket.id,
            candidate
        });
    });

    socket.on('disconnect', () => {
        leaveAudioRoom();
    });
};

module.exports = {
    createRtcSignalingState,
    registerRtcSignalingHandlers
};
