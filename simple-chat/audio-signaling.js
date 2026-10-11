const registerAudioSignaling = (io, socket, room, users) => {
    socket.data.chatRoom = room;
    socket.data.inAudioCall = false;

    const participants = () => Array.from(io.sockets.sockets.values())
        .filter(peer => peer.data.chatRoom === room && peer.data.inAudioCall)
        .map(peer => ({ peerId: peer.id, username: users[peer.id] || 'Guest' }));

    const publishParticipants = () => {
        io.to(room).emit('audio:participants', participants());
    };

    socket.emit('audio:participants', participants());

    socket.on('audio:join', (reply) => {
        if (typeof reply !== 'function') return;
        const peers = participants().filter(peer => peer.peerId !== socket.id);
        if (peers.length >= 6) {
            reply({ error: 'This call is full (maximum 6 people).' });
            return;
        }
        socket.data.inAudioCall = true;
        reply({ peers });
        publishParticipants();
    });

    const leave = () => {
        if (!socket.data.inAudioCall) return;
        socket.data.inAudioCall = false;
        io.to(room).emit('audio:peer-left', { peerId: socket.id });
        publishParticipants();
    };

    socket.on('audio:leave', leave);
    socket.on('disconnect', leave);
    socket.on('newUser', publishParticipants);

    socket.on('audio:signal', (payload) => {
        if (!payload || typeof payload !== 'object' || !socket.data.inAudioCall) return;
        const { targetPeerId, description, candidate } = payload;
        const target = io.sockets.sockets.get(targetPeerId);
        if (!target || target === socket || target.data.chatRoom !== room || !target.data.inAudioCall) return;
        if (description) {
            if (!['offer', 'answer'].includes(description.type) ||
                typeof description.sdp !== 'string' || description.sdp.length > 65536) return;
            io.to(targetPeerId).emit('audio:signal', {
                fromPeerId: socket.id,
                description: { type: description.type, sdp: description.sdp }
            });
        } else if (candidate && typeof candidate.candidate === 'string' && candidate.candidate.length < 4096) {
            io.to(targetPeerId).emit('audio:signal', { fromPeerId: socket.id, candidate });
        }
    });
};

module.exports = { registerAudioSignaling };