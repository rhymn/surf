const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const isAudioRtcEnabled = () => `${process.env.AUDIO_RTC_ENABLED ?? 'true'}` !== 'false';

// Accepts the RTCIceServer[] JSON shape, e.g. [{"urls":"turn:host:3478","username":"u","credential":"c"}]
const getIceServersConfig = () => {
    const configuredIceServers = process.env.RTC_ICE_SERVERS;
    if (!configuredIceServers) {
        return DEFAULT_ICE_SERVERS;
    }

    try {
        const parsedIceServers = JSON.parse(configuredIceServers);
        if (Array.isArray(parsedIceServers) && parsedIceServers.length > 0) {
            return parsedIceServers;
        }
    } catch (error) {
        console.warn(`Ignoring invalid RTC_ICE_SERVERS value: ${error.message}`);
    }

    return DEFAULT_ICE_SERVERS;
};

module.exports = {
    isAudioRtcEnabled,
    getIceServersConfig
};
