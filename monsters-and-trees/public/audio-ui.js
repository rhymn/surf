(function () {
    const createAudioUi = ({ onConnect, onDisconnect, onToggleMic, onToggleDeafen }) => {
        const panel = document.createElement('div');
        panel.className = 'voice-panel';

        const title = document.createElement('h3');
        title.className = 'voice-title';
        title.textContent = 'Voice chat';
        panel.appendChild(title);

        const statusText = document.createElement('div');
        statusText.className = 'voice-status';
        panel.appendChild(statusText);

        const controlsRow = document.createElement('div');
        controlsRow.className = 'voice-controls';

        const connectButton = document.createElement('button');
        connectButton.className = 'btn';
        connectButton.textContent = 'Connect voice';

        const micButton = document.createElement('button');
        micButton.className = 'btn';
        micButton.textContent = 'Mute mic';

        const deafenButton = document.createElement('button');
        deafenButton.className = 'btn';
        deafenButton.textContent = 'Deafen';

        controlsRow.appendChild(connectButton);
        controlsRow.appendChild(micButton);
        controlsRow.appendChild(deafenButton);
        panel.appendChild(controlsRow);

        let isPanelVisible = true;

        let latestStatus = {
            enabledByServer: false,
            supportedByBrowser: false,
            unsupportedReason: null,
            isConnected: false,
            isMicEnabled: true,
            isDeafened: false,
            peerCount: 0,
            connectedPeerCount: 0,
            lastError: null
        };

        const render = () => {
            const canUseVoice = latestStatus.enabledByServer && latestStatus.supportedByBrowser;
            panel.style.display = isPanelVisible ? 'block' : 'none';

            connectButton.textContent = latestStatus.isConnected ? 'Disconnect voice' : 'Connect voice';
            micButton.textContent = latestStatus.isMicEnabled ? 'Mute mic' : 'Unmute mic';
            deafenButton.textContent = latestStatus.isDeafened ? 'Undeafen' : 'Deafen';
            connectButton.disabled = !canUseVoice;
            micButton.disabled = !canUseVoice;
            deafenButton.disabled = !canUseVoice;

            const statusParts = [];
            if (!latestStatus.supportedByBrowser) {
                statusParts.push(latestStatus.unsupportedReason ?? 'Not supported by this browser');
            } else if (!latestStatus.enabledByServer) {
                statusParts.push('Not enabled on server');
            } else if (latestStatus.isConnected) {
                statusParts.push(`Connected · peers: ${latestStatus.connectedPeerCount}/${latestStatus.peerCount}`);
            } else {
                statusParts.push('Not connected');
            }

            if (canUseVoice) {
                statusParts.push(latestStatus.isMicEnabled ? 'Mic on' : 'Mic off');

                if (latestStatus.isDeafened) {
                    statusParts.push('Deafened');
                }
            }

            if (latestStatus.lastError) {
                statusParts.push(`Error: ${latestStatus.lastError}`);
            }

            statusText.textContent = statusParts.join(' · ');
        };

        connectButton.onclick = () => {
            if (latestStatus.isConnected) {
                if (typeof onDisconnect === 'function') {
                    onDisconnect();
                }
                return;
            }

            if (typeof onConnect === 'function') {
                onConnect();
            }
        };

        micButton.onclick = () => {
            if (typeof onToggleMic !== 'function') {
                return;
            }

            onToggleMic(!latestStatus.isMicEnabled);
        };

        deafenButton.onclick = () => {
            if (typeof onToggleDeafen !== 'function') {
                return;
            }

            onToggleDeafen(!latestStatus.isDeafened);
        };

        render();

        return {
            element: panel,
            setVisible(nextIsVisible) {
                isPanelVisible = Boolean(nextIsVisible);
                render();
            },
            updateStatus(nextStatus) {
                latestStatus = {
                    ...latestStatus,
                    ...nextStatus
                };
                render();
            }
        };
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createAudioUi
        };
    }

    if (typeof window !== 'undefined') {
        window.createAudioUi = createAudioUi;
    }
})();
