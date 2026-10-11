const initializeAudioCall = (socket) => {
    const joinButton = document.getElementById('join-call');
    const leaveButton = document.getElementById('leave-call');
    const muteButton = document.getElementById('mute-call');
    const playButton = document.getElementById('play-call');
    const notificationButton = document.getElementById('call-notifications');
    const controls = document.getElementById('audio-controls');
    const status = document.getElementById('audio-status');
    const audioContainer = document.getElementById('remote-audio');
    const peers = new Map();
    let participants = [];
    let localStream = null;
    let configuration = null;
    let joining = false;
    let joined = false;
    let generation = 0;

    lucide.createIcons();

    const supported = window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection;
    const notificationSupported = window.isSecureContext && window.Notification && navigator.serviceWorker;
    const notificationTag = `audio-call:${window.location?.pathname}`;
    let notificationsEnabled = notificationSupported && window.Notification.permission === 'granted'
        && localStorage.getItem('callNotifications') === 'true';
    let enablingNotifications = false;
    let notificationRegistration = null;
    let notificationVersion = 0;
    let notificationOperation = Promise.resolve();

    const render = (message) => {
        notificationButton.hidden = !notificationSupported;
        notificationButton.disabled = enablingNotifications || (notificationSupported && window.Notification.permission === 'denied');
        notificationButton.setAttribute('aria-pressed', String(Boolean(notificationsEnabled)));
        notificationButton.title = notificationsEnabled ? 'Disable call notifications' : 'Enable call notifications';
        notificationButton.setAttribute('aria-label', notificationButton.title);
        joinButton.hidden = joined || joining;
        joinButton.disabled = !supported || !socket.connected;
        controls.hidden = !joined && !joining;
        muteButton.disabled = !joined;
        if (!supported) {
            status.textContent = 'Audio calls require HTTPS and microphone support.';
        } else if (message) {
            status.textContent = message;
        } else if (joining) {
            status.textContent = 'Connecting...';
        } else if (joined) {
            const connected = Array.from(peers.values()).filter(peer => peer.connection.connectionState === 'connected').length;
            status.textContent = participants.length <= 1 ? 'Waiting for others...' : `${connected} connected, ${participants.length} in call`;
        } else {
            status.textContent = participants.length ? `${participants.length} in call` : 'Audio call';
        }
    };

    const getNotificationRegistration = async () => {
        if (!notificationRegistration) {
            await navigator.serviceWorker.register('/service-worker.js');
            notificationRegistration = await navigator.serviceWorker.ready;
        }
        return notificationRegistration;
    };

    const queueNotification = (operation) => {
        notificationOperation = notificationOperation.then(operation).catch(() => {
            render('Call notifications are unavailable.');
        });
    };

    const dismissCallNotification = () => {
        notificationVersion++;
        if (!notificationSupported) return;
        queueNotification(async () => {
            if (!notificationRegistration) return;
            const notifications = await notificationRegistration.getNotifications({ tag: notificationTag });
            notifications.forEach(notification => notification.close());
        });
    };

    const notifyIncomingCall = (caller) => {
        if (!notificationsEnabled || window.Notification.permission !== 'granted') return;
        const version = notificationVersion;
        queueNotification(async () => {
            const registration = await getNotificationRegistration();
            if (version !== notificationVersion || !notificationsEnabled || joined || joining ||
                !participants.some(peer => peer.peerId !== socket.id)) return;
            const username = typeof caller.username === 'string' ? caller.username.slice(0, 100) : 'Someone';
            await registration.showNotification('Incoming audio call', {
                body: `${username} started a call.`,
                tag: notificationTag,
                renotify: true,
                requireInteraction: true,
                vibrate: [200, 100, 200],
                data: { url: `${window.location.origin}${window.location.pathname}` }
            });
        });
    };

    notificationButton.addEventListener('click', async () => {
        if (!notificationSupported || enablingNotifications) return;
        if (notificationsEnabled) {
            notificationsEnabled = false;
            localStorage.removeItem('callNotifications');
            dismissCallNotification();
            render();
            return;
        }
        enablingNotifications = true;
        render();
        try {
            const permission = await window.Notification.requestPermission();
            if (permission !== 'granted') {
                render('Call notifications were not allowed.');
                return;
            }
            await getNotificationRegistration();
            notificationsEnabled = true;
            localStorage.setItem('callNotifications', 'true');
            const caller = participants.find(peer => peer.peerId !== socket.id);
            if (caller && !joined && !joining) notifyIncomingCall(caller);
            render();
        } catch {
            render('Call notifications are unavailable.');
        } finally {
            enablingNotifications = false;
            notificationButton.disabled = window.Notification.permission === 'denied';
        }
    });

    const removePeer = (peerId) => {
        const peer = peers.get(peerId);
        if (!peer) return;
        peers.delete(peerId);
        peer.connection.close();
        peer.audio.srcObject = null;
        peer.audio.remove();
    };

    const leave = (message) => {
        dismissCallNotification();
        generation++;
        joining = false;
        joined = false;
        if (socket.connected) socket.emit('audio:leave');
        for (const peerId of peers.keys()) removePeer(peerId);
        localStream?.getTracks().forEach(track => track.stop());
        localStream = null;
        muteButton.setAttribute('aria-pressed', 'false');
        muteButton.title = 'Mute microphone';
        muteButton.setAttribute('aria-label', 'Mute microphone');
        playButton.hidden = true;
        render(message);
    };

    const tryPlayback = async (audio) => {
        try {
            await audio.play();
        } catch {
            if (joined && audio.srcObject) playButton.hidden = false;
        }
    };

    const createPeer = (peerId) => {
        if (peers.has(peerId)) return peers.get(peerId);
        const connection = new RTCPeerConnection(configuration);
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', '');
        audioContainer.appendChild(audio);
        const peer = { connection, audio, candidates: [], chain: Promise.resolve() };
        peers.set(peerId, peer);
        localStream.getAudioTracks().forEach(track => connection.addTrack(track, localStream));
        connection.onicecandidate = ({ candidate }) => {
            if (candidate && joined && socket.connected) {
                socket.emit('audio:signal', { targetPeerId: peerId, candidate: candidate.toJSON() });
            }
        };
        connection.ontrack = (event) => {
            if (!joined || peers.get(peerId) !== peer) return;
            audio.srcObject = event.streams[0] || new MediaStream([event.track]);
            tryPlayback(audio);
        };
        connection.onconnectionstatechange = () => {
            if (peers.get(peerId) !== peer) return;
            render(connection.connectionState === 'failed'
                ? 'Connection failed. Hang up and retry.' : undefined);
        };
        return peer;
    };

    socket.on('audio:participants', (list) => {
        const callStarted = participants.length === 0 && list.length > 0;
        participants = list;
        for (const peerId of peers.keys()) {
            if (!list.some(participant => participant.peerId === peerId)) removePeer(peerId);
        }
        if (list.length === 0) dismissCallNotification();
        const caller = list.find(peer => peer.peerId !== socket.id);
        if (callStarted && caller && !joined && !joining) notifyIncomingCall(caller);
        render();
    });

    socket.on('audio:peer-left', ({ peerId }) => {
        removePeer(peerId);
        render();
    });

    socket.on('audio:signal', ({ fromPeerId, description, candidate }) => {
        if (!joined || fromPeerId === socket.id || !participants.some(peer => peer.peerId === fromPeerId)) return;
        const peer = createPeer(fromPeerId);
        peer.chain = peer.chain.then(async () => {
            if (!joined || peers.get(fromPeerId) !== peer) return;
            if (description) {
                await peer.connection.setRemoteDescription(description);
                for (const pending of peer.candidates.splice(0)) await peer.connection.addIceCandidate(pending);
                if (description.type === 'offer') {
                    await peer.connection.setLocalDescription(await peer.connection.createAnswer());
                    if (joined && peers.get(fromPeerId) === peer) {
                        socket.emit('audio:signal', { targetPeerId: fromPeerId, description: peer.connection.localDescription });
                    }
                }
            } else if (candidate) {
                if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(candidate);
                else peer.candidates.push(candidate);
            }
        }).catch(() => {
            if (joined && peers.get(fromPeerId) === peer) render('Unable to connect. Hang up and retry.');
        });
    });

    joinButton.addEventListener('click', async () => {
        if (joining || joined || !socket.connected || !supported) return;
        dismissCallNotification();
        const attempt = ++generation;
        joining = true;
        render();
        try {
            const response = await fetch('/rtc-config', { cache: 'no-store' });
            if (!response.ok) throw new Error('Unable to load call configuration.');
            configuration = await response.json();
            if (generation !== attempt) return;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (generation !== attempt) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            localStream = stream;
            stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => leave('Microphone disconnected.')));
            const result = await new Promise((resolve, reject) => {
                socket.timeout(5000).emit('audio:join', (error, reply) => {
                    if (error) reject(new Error('Call server did not respond. Try again.'));
                    else if (reply.error) reject(new Error(reply.error));
                    else resolve(reply);
                });
            });
            if (generation !== attempt) return;
            joining = false;
            joined = true;
            participants = [...result.peers, { peerId: socket.id }];
            render();
            for (const { peerId } of result.peers) {
                if (generation !== attempt) return;
                const peer = createPeer(peerId);
                await peer.connection.setLocalDescription(await peer.connection.createOffer());
                if (generation !== attempt || peers.get(peerId) !== peer) return;
                socket.emit('audio:signal', { targetPeerId: peerId, description: peer.connection.localDescription });
            }
        } catch (error) {
            if (generation !== attempt) return;
            const message = error.name === 'NotAllowedError' ? 'Microphone permission denied.'
                : error.name === 'NotFoundError' ? 'No microphone found.'
                : error.name === 'NotReadableError' ? 'Microphone is unavailable.'
                : error.message;
            leave(message);
        }
    });

    leaveButton.addEventListener('click', () => leave());
    muteButton.addEventListener('click', () => {
        if (!localStream) return;
        const muted = muteButton.getAttribute('aria-pressed') !== 'true';
        localStream.getAudioTracks().forEach(track => { track.enabled = !muted; });
        muteButton.setAttribute('aria-pressed', String(muted));
        muteButton.title = muted ? 'Unmute microphone' : 'Mute microphone';
        muteButton.setAttribute('aria-label', muteButton.title);
    });
    playButton.addEventListener('click', () => {
        playButton.hidden = true;
        for (const { audio } of peers.values()) if (audio.srcObject) tryPlayback(audio);
    });
    socket.on('connect', () => render(supported ? undefined : 'Audio calls require HTTPS and microphone support.'));
    socket.on('disconnect', () => {
        participants = [];
        leave('Disconnected. Rejoin when online.');
    });
    window.addEventListener('pagehide', () => leave());
    render(supported ? undefined : 'Audio calls require HTTPS and microphone support.');
};