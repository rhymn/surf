const list = document.getElementById('chat-list');
const status = document.getElementById('list-status');
const refresh = document.getElementById('refresh-chats');
let request = null;

const getRememberedChats = () => [...new Set((localStorage.getItem('groups') || '').split(','))]
    .filter(room => /^[a-z0-9]+$/.test(room) && room.length <= 128).slice(-200).reverse();

const renderChats = (chats) => {
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
            unread.textContent = `${chat.unreadCount} unread`;
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
            name.textContent = `${person.username}${person.userId === localStorage.getItem('userId') ? ' (you)' : ''}${person.online ? ' - online' : ''}`;
            participant.append(dot, name);
            people.appendChild(participant);
        }
        const count = document.createElement('p');
        count.className = 'participant-count';
        const messageCount = chat.messageCount ?? 0;
        count.textContent = `${chat.participants.length} ${chat.participants.length === 1 ? 'participant' : 'participants'} · ${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`;
        link.append(heading, people, count);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove-chat';
        remove.title = 'Remove from my chats';
        remove.setAttribute('aria-label', `Remove ${chat.title || chat.room} from my chats`);
        remove.innerHTML = '<i data-lucide="x" aria-hidden="true"></i>';
        remove.addEventListener('click', () => {
            if (!confirm('Remove this chat from your list?')) return;
            localStorage.setItem('groups', getRememberedChats().reverse().filter(room => room !== chat.room).join(','));
            loadChats();
        });
        row.append(link, remove);
        list.appendChild(row);
    }
    lucide.createIcons();
};

const loadChats = async () => {
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
            body: JSON.stringify({ rooms, userId: localStorage.getItem('userId') || '', readThrough: chatReadState.get() }), signal: current.signal
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
usernameLabel.textContent = localStorage.getItem('username') || 'Set username';
document.getElementById('home-username').addEventListener('click', () => {
    const username = prompt('Enter your username', localStorage.getItem('username') || '');
    if (!username?.trim()) return;
    if (username.length > 100) {
        alert('Username must be 100 characters or fewer.');
        return;
    }
    localStorage.setItem('username', username.trim());
    usernameLabel.textContent = username.trim();
});
document.getElementById('join-chat').addEventListener('submit', event => {
    event.preventDefault();
    const room = document.getElementById('room-code').value.trim().toLowerCase();
    if (/^[a-z0-9]+$/.test(room)) window.location.assign(`/${room}`);
});
refresh.addEventListener('click', loadChats);
window.addEventListener('focus', loadChats);
window.addEventListener('storage', loadChats);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadChats(); });
window.addEventListener('pagehide', () => request?.abort());
setInterval(() => { if (!document.hidden) loadChats(); }, 15000);
lucide.createIcons();
loadChats();