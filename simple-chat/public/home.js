const list = document.getElementById('chat-list');
const status = document.getElementById('list-status');
const refresh = document.getElementById('refresh-chats');
let request = null;

const getRememberedChats = () => [...new Set((localStorage.getItem('groups') || '').split(','))]
    .filter(room => /^[a-z0-9]+$/.test(room) && room.length <= 128).slice(-200).reverse();

const renderChats = (chats) => {
    const unread = chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
    document.title = `${unread ? `(${unread}) ` : ''}My chats - Simple Chat`;
    list.replaceChildren();
    for (const chat of chats) {
        const row = document.createElement('li');
        row.className = 'chat-row';
        const link = document.createElement('a');
        link.className = 'chat-link';
        link.href = `/${chat.room}`;
        const heading = document.createElement('div');
        heading.className = 'chat-heading';
        const title = document.createElement('h2');
        title.className = 'chat-title';
        title.textContent = chat.title || 'Group chat';
        const code = document.createElement('span');
        code.className = 'room-id';
        code.textContent = chat.room;
        heading.append(title, code);
        if (chat.unreadCount > 0) {
            const unread = document.createElement('span');
            unread.className = 'unread-count';
            unread.textContent = String(chat.unreadCount);
            unread.title = `${chat.unreadCount} unread ${chat.unreadCount === 1 ? 'message' : 'messages'}`;
            const description = document.createElement('span');
            description.className = 'sr-only';
            description.textContent = ` unread ${chat.unreadCount === 1 ? 'message' : 'messages'}`;
            unread.appendChild(description);
            heading.appendChild(unread);
        }
        const people = document.createElement('div');
        people.className = 'participants';
        for (const person of chat.participants) {
            const participant = document.createElement('span');
            participant.className = person.online ? 'participant online' : 'participant';
            participant.title = person.online ? 'Online' : 'Offline';
            const dot = document.createElement('span');
            dot.className = 'presence';
            dot.setAttribute('aria-hidden', 'true');
            const name = document.createElement('span');
            name.className = 'participant-name';
            name.textContent = `${person.username}${person.userId === chatProfile.getUserId() ? ' (you)' : ''}`;
            const presenceLabel = document.createElement('span');
            presenceLabel.className = 'sr-only';
            presenceLabel.textContent = person.online ? ', online' : ', offline';
            participant.append(dot, name, presenceLabel);
            people.appendChild(participant);
        }
        const count = document.createElement('p');
        count.className = 'participant-count';
        const messageCount = chat.messageCount ?? 0;
        for (const { icon, value, label } of [
            { icon: 'users', value: chat.participants.length, label: chat.participants.length === 1 ? 'participant' : 'participants' },
            { icon: 'message-square', value: messageCount, label: messageCount === 1 ? 'message' : 'messages' }
        ]) {
            const metric = document.createElement('span');
            metric.className = 'chat-metric';
            metric.title = `${value} ${label}`;
            metric.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
            const number = document.createElement('span');
            number.textContent = String(value);
            const description = document.createElement('span');
            description.className = 'sr-only';
            description.textContent = ` ${label}`;
            metric.append(number, description);
            count.appendChild(metric);
        }
        link.append(heading, people, count);
        const actions = document.createElement('details');
        actions.className = 'chat-actions';
        const trigger = document.createElement('summary');
        trigger.title = 'Chat actions';
        trigger.setAttribute('aria-label', `Actions for ${chat.title || chat.room}`);
        trigger.innerHTML = '<i data-lucide="ellipsis" aria-hidden="true"></i>';
        actions.addEventListener('toggle', () => {
            if (actions.open) list.querySelectorAll('.chat-actions').forEach(menu => {
                if (menu !== actions) menu.open = false;
            });
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove-chat';
        remove.title = 'Remove from my chats';
        remove.setAttribute('aria-label', `Remove ${chat.title || chat.room} from my chats`);
        remove.innerHTML = '<i data-lucide="list-minus" aria-hidden="true"></i>Remove from my chats';
        remove.addEventListener('click', () => {
            actions.open = false;
            if (!confirm('Remove this chat from your list?')) return;
            localStorage.setItem('groups', getRememberedChats().reverse().filter(room => room !== chat.room).join(','));
            loadChats();
        });
        actions.append(trigger, remove);
        row.append(link, actions);
        list.appendChild(row);
    }
    lucide.createIcons();
};

const loadChats = async () => {
    await chatProfile.ready;
    request?.abort();
    const current = new AbortController();
    request = current;
    const rooms = getRememberedChats();
    refresh.disabled = true;
    try {
        if (!rooms.length) {
            renderChats([]);
            status.textContent = 'No chats yet.';
            return;
        }
        const response = await fetch('/chats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rooms, userId: chatProfile.getUserId(), readThrough: chatReadState.get() }), signal: current.signal
        });
        if (!response.ok) throw new Error('Unable to load chats. Try refreshing.');
        const chats = await response.json();
        if (request !== current) return;
        renderChats(chats);
        status.textContent = '';
    } catch (error) {
        if (error.name !== 'AbortError' && request === current) status.textContent = 'Unable to load chats. Try refreshing.';
    } finally {
        if (request === current) refresh.disabled = false;
    }
};

const usernameLabel = document.getElementById('username-label');
chatProfile.ready.then(() => { usernameLabel.textContent = chatProfile.getUsername(); });
document.addEventListener('profile-changed', () => { usernameLabel.textContent = chatProfile.getUsername(); });
document.getElementById('home-username').addEventListener('click', () => chatProfile.open());
document.getElementById('join-chat').addEventListener('submit', event => {
    event.preventDefault();
    const room = document.getElementById('room-code').value.trim().toLowerCase();
    if (/^[a-z0-9]+$/.test(room)) window.location.assign(`/${room}`);
});
document.addEventListener('click', event => {
    list.querySelectorAll('.chat-actions[open]').forEach(menu => {
        if (!menu.contains(event.target)) menu.open = false;
    });
});
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    list.querySelectorAll('.chat-actions[open]').forEach(menu => {
        menu.open = false;
        menu.querySelector('summary').focus();
    });
});
refresh.addEventListener('click', loadChats);
window.addEventListener('focus', loadChats);
window.addEventListener('storage', loadChats);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadChats(); });
window.addEventListener('pagehide', () => request?.abort());
setInterval(() => { if (!document.hidden) loadChats(); }, 15000);
lucide.createIcons();
loadChats();