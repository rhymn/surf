const initializeDictation = () => {
    const button = document.getElementById('dictate-message');
    const input = document.getElementById('message-input');
    const status = document.getElementById('dictation-status');
    const languageSelect = document.getElementById('dictation-language');
    const savedLanguage = localStorage.getItem('dictationLanguage');
    languageSelect.value = Array.from(languageSelect.options).some(option => option.value === savedLanguage)
        ? savedLanguage : '';
    if (typeof Intl.DisplayNames === 'function') {
        const names = new Intl.DisplayNames([navigator.language || 'en-US'], { type: 'language' });
        for (const option of languageSelect.options) {
            if (option.value) option.textContent = names.of(option.value);
        }
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const supported = window.isSecureContext && Boolean(SpeechRecognition);
    let recognition = null;
    let callActive = false;
    let stopping = false;

    const render = (message = '') => {
        button.hidden = !supported;
        button.disabled = callActive || stopping;
        button.setAttribute('aria-pressed', String(Boolean(recognition)));
        button.title = callActive ? 'Dictation unavailable during a call'
            : recognition ? 'Stop dictation' : 'Dictate message';
        button.setAttribute('aria-label', button.title);
        const icon = recognition ? 'square' : 'speech';
        if (button.getAttribute('data-icon') !== icon) {
            button.setAttribute('data-icon', icon);
            button.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
            lucide.createIcons();
        }
        status.textContent = message;
        status.hidden = !message;
    };

    const stop = () => {
        const current = recognition;
        recognition = null;
        stopping = false;
        if (current) current.abort();
        render();
    };

    button.addEventListener('click', () => {
        if (!supported || callActive || stopping) return;
        if (recognition) {
            stopping = true;
            recognition.stop();
            render('Finishing dictation...');
            return;
        }
        try {
            const current = new SpeechRecognition();
            recognition = current;
            const draft = input.value;
            let displayed = draft;
            current.lang = languageSelect.value || navigator.language || 'en-US';
            current.continuous = true;
            current.interimResults = true;
            current.onstart = () => {
                if (recognition === current) render('Listening...');
            };
            current.onresult = (event) => {
                if (recognition !== current || callActive) return;
                if (input.value !== displayed) {
                    stop();
                    return;
                }
                const text = Array.from(event.results, result => result[0].transcript.trim())
                    .filter(Boolean).join(' ');
                displayed = draft + (text ? `${draft && !/\s$/.test(draft) ? ' ' : ''}${text}` : '');
                input.value = displayed;
                input.dispatchEvent(new Event('dictation-input'));
            };
            current.onend = () => {
                if (recognition !== current) return;
                recognition = null;
                stopping = false;
                render();
            };
            current.onerror = ({ error }) => {
                if (recognition !== current) return;
                stop();
                const errors = {
                    'not-allowed': 'Microphone permission denied.',
                    'service-not-allowed': 'Speech recognition is unavailable in this browser.',
                    'audio-capture': 'Microphone is unavailable.',
                    'network': 'Speech recognition could not connect. Try again.',
                    'no-speech': 'No speech detected. Try again.',
                    'language-not-supported': 'The selected language is not supported for dictation.'
                };
                if (error !== 'aborted') render(errors[error] || 'Dictation failed. Try again.');
            };
            render('Starting dictation...');
            current.start();
        } catch {
            stop();
            render('Dictation is unavailable. Try again.');
        }
    });

    document.addEventListener('audio-call-state', ({ detail }) => {
        callActive = detail.active;
        if (callActive) stop();
        else render();
    });
    languageSelect.addEventListener('change', () => {
        stop();
        if (languageSelect.value) localStorage.setItem('dictationLanguage', languageSelect.value);
        else localStorage.removeItem('dictationLanguage');
    });
    input.addEventListener('input', () => {
        if (recognition) stop();
    });
    window.addEventListener('pagehide', stop);
    render();
    return { stop };
};