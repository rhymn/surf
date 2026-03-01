const parseBooleanFlag = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const normalizedValue = `${value}`.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
        return false;
    }

    return fallback;
};

const isAudioRtcEnabled = (environment = process.env) => {
    return parseBooleanFlag(environment.AUDIO_RTC_ENABLED, false);
};

module.exports = {
    isAudioRtcEnabled
};
