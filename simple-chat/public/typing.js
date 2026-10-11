const initializeTyping = (socket) => {
    const input = document.getElementById('message-input');
    const status = document.getElementById('typing-status');
    const sharingToggle = document.getElementById('show-typing');
    const preferenceKey = `showTyping:${getUserId()}`;
    const sharingEnabled = () => localStorage.getItem(preferenceKey) !== 'false';
    sharingToggle.checked = sharingEnabled();
    const peers = new Map();
    let typing = false;
    let lastSent = 0;
    let idleTimer;

    const render = () => {
        const names = Array.from(new Map(Array.from(peers.values()).map(peer => [peer.userId, peer.username])).values());
        status.hidden = names.length === 0;
        status.textContent = names.length === 1 ? `${names[0]} is typing...`
            : names.length === 2 ? `${names[0]} and ${names[1]} are typing...`
            : names.length > 2 ? `${names[0]}, ${names[1]} and ${names.length - 2} others are typing...` : '';
    };
    const stop = () => {
        clearTimeout(idleTimer);
        if (typing && socket.connected) socket.emit('typing', false);
        typing = false;
    };
    const activity = () => {
        if (!sharingEnabled() || !socket.connected || document.hidden || !input.value.trim()) {
            stop();
            return;
        }
        if (!typing || Date.now() - lastSent >= 1000) {
            socket.emit('typing', true);
            lastSent = Date.now();
        }
        typing = true;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(stop, 1800);
    };
    input.addEventListener('input', activity);
    sharingToggle.addEventListener('change', () => {
        localStorage.setItem(preferenceKey, String(sharingToggle.checked));
        if (!sharingToggle.checked) stop();
    });
    window.addEventListener('storage', event => {
        if (event.key !== null && event.key !== preferenceKey) return;
        sharingToggle.checked = sharingEnabled();
        if (!sharingToggle.checked) stop();
    });
    input.addEventListener('dictation-input', activity);
    input.addEventListener('blur', stop);
    document.getElementById('chat-form').addEventListener('submit', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);
    socket.on('typing', ({ peerId, userId, username, active }) => {
        if (userId === getUserId()) return;
        clearTimeout(peers.get(peerId)?.timer);
        if (active) {
            const timer = setTimeout(() => { peers.delete(peerId); render(); }, 6000);
            peers.set(peerId, { userId, username, timer });
        } else peers.delete(peerId);
        render();
    });
    socket.on('disconnect', () => {
        stop();
        peers.forEach(peer => clearTimeout(peer.timer));
        peers.clear();
        render();
    });
};