(function () {
    const createAudioUi = ({ onConnect, onDisconnect, onToggleMic, onToggleDeafen }) => {
        const panel = document.createElement('div');
        panel.style.marginTop = '12px';
        panel.style.paddingTop = '10px';
        panel.style.borderTop = '1px solid #DDD';

        const title = document.createElement('h3');
        title.textContent = 'Voice chat';
        title.style.margin = '0 0 6px 0';
        panel.appendChild(title);

        const statusText = document.createElement('div');
        statusText.style.fontSize = '12px';
        statusText.style.marginBottom = '8px';
        statusText.style.color = '#444';
        panel.appendChild(statusText);

        const controlsRow = document.createElement('div');
        controlsRow.style.display = 'flex';
        controlsRow.style.gap = '6px';
        controlsRow.style.flexWrap = 'wrap';

        const connectButton = document.createElement('button');
        connectButton.textContent = 'Connect voice';

        const micButton = document.createElement('button');
        micButton.textContent = 'Mute mic';

        const deafenButton = document.createElement('button');
        deafenButton.textContent = 'Deafen';

        controlsRow.appendChild(connectButton);
        controlsRow.appendChild(micButton);
        controlsRow.appendChild(deafenButton);
        panel.appendChild(controlsRow);

        let latestStatus = {
            enabledByServer: false,
            supportedByBrowser: false,
            isConnected: false,
            isMicEnabled: true,
            isDeafened: false,
            peerCount: 0,
            lastError: null
        };

        const render = () => {
            const canUseVoice = latestStatus.enabledByServer && latestStatus.supportedByBrowser;
            panel.style.display = canUseVoice ? 'block' : 'none';

            if (!canUseVoice) {
                return;
            }

            connectButton.textContent = latestStatus.isConnected ? 'Disconnect voice' : 'Connect voice';
            micButton.textContent = latestStatus.isMicEnabled ? 'Mute mic' : 'Unmute mic';
            deafenButton.textContent = latestStatus.isDeafened ? 'Undeafen' : 'Deafen';
            micButton.disabled = !latestStatus.isConnected;
            deafenButton.disabled = !latestStatus.isConnected;

            const statusParts = [];
            statusParts.push(latestStatus.isConnected
                ? `Connected · peers: ${latestStatus.peerCount}`
                : 'Not connected');

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
