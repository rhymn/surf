const chatReadState = {
    get() {
        try {
            const saved = JSON.parse(localStorage.getItem('readMessages') || '{}');
            return Object.fromEntries(Object.entries(saved).filter(([room, id]) =>
                /^[a-z0-9]+$/.test(room) && Number.isSafeInteger(id) && id >= 0));
        } catch {
            return {};
        }
    },
    mark(room, id) {
        if (!/^[a-z0-9]+$/.test(room) || !Number.isSafeInteger(id) || id <= 0) return;
        const saved = this.get();
        saved[room] = Math.max(saved[room] || 0, id);
        localStorage.setItem('readMessages', JSON.stringify(saved));
    }
};