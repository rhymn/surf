const RTC_SOCKET_EVENT_NAMES = {
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

const RTC_EVENTS = RTC_SOCKET_EVENT_NAMES;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RTC_EVENTS;
}

if (typeof window !== 'undefined') {
    window.RTC_EVENTS = RTC_EVENTS;
}
