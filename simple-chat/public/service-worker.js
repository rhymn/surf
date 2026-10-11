self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    // You can handle fetch events here if needed
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    let url;
    try {
        url = new URL(event.notification.data?.url || '/', self.location.origin);
    } catch {
        return;
    }
    if (url.origin !== self.location.origin) return;
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        const existing = clientList.find(client => {
            const clientUrl = new URL(client.url);
            return clientUrl.origin === url.origin && clientUrl.pathname === url.pathname;
        });
        if (existing) return existing.focus();
        if (clients.openWindow) return clients.openWindow(url.href);
    }));
});