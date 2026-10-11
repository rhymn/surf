const notify = (msg) => {
    return;
    // Send a notification
    if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification('New message', {
                body: `${msg.message}`
            });
        });
    }        
}




const getUsername = () => {
    return chatProfile.getUsername();
}

const getUserId = () => {
    return chatProfile.getUserId();
}

const initUsername = () => {
    const username = localStorage.getItem('username');

    if (!username) {
        localStorage.setItem('username', `User${Math.floor(Math.random() * 1000)}`);
    }
}

const initUserId = () => {
    const id = localStorage.getItem('userId');

    if (!id) {
        localStorage.setItem('userId', Math.random().toString(36).substring(5));
    }
}


const isFromMe = (msg) => {
    return msg.userid === getUserId();
}


const requestNotificationPermission = () => {
    // Request notification permission
    if (Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Notification permission granted.');
            }
        });
    }
}    
// requestNotificationPermission();


const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').then(registration => {
            console.log('Service Worker registered with scope:', registration.scope);
        }).catch(error => {
            console.error('Service Worker registration failed:', error);
        });
    }
}
// registerServiceWorker();

const buttonListeners = () => {
    {
        document.getElementById('invite-friends').addEventListener('click', (event) => {
            event.preventDefault();

            inviteFriends(prompt('Enter emails separated by commas').split(','));
        });    
    }

    {
        document.getElementById('set-username').addEventListener('click', (event) => {
            event.preventDefault();
            chatProfile.open();
        });    
    }

    {
        document.getElementById('copy-url').addEventListener('click', (event) => {
            event.preventDefault();
            navigator.clipboard.writeText(window.location.href).then(() => {
                alert('URL copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy URL: ', err);
            });
        });
    }

}

const inviteFriends = (emails) => {
    // use fetch to invite friends

    fetch('/invite', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: window.location.href,
            emails
        }),
    }).then(response => {
        if (response.ok) {
            alert('Invitation sent');
        } else {
            alert('Failed to send invitation');
        }
    }
    ).catch(error => {
        console.error('Error sending invitation:', error);
    });
}

const group = () => window.location.pathname.split('/').pop();

const appendGroupIdToLocalStorage = () => {
    const rooms = (localStorage.getItem('groups') || '').split(',')
        .filter(room => /^[a-z0-9]+$/.test(room) && room !== group() && room.length <= 128);
    localStorage.setItem('groups', [...new Set([...rooms, group()])].join(','));
}

const getGroups = () => {
    return (localStorage.getItem('groups') || '').split(',').filter(Boolean);
}

appendGroupIdToLocalStorage();

document.addEventListener('DOMContentLoaded', async () => {
    await chatProfile.ready;
    buttonListeners();
    document.getElementById('account-action-label').textContent = chatProfile.isLoggedIn() ? 'Your account' : 'Set password / log in';
    document.getElementById('manage-account').addEventListener('click', () => chatProfile.open('register'));

    initUsername();
    initUserId();

    const socket = io({ auth: { room: group(), userId: getUserId() } });
    socket.on('connect_error', () => {
        document.getElementById('audio-status').textContent = 'Unable to connect. Check your login or try reloading.';
    });

    const roomTitle = document.getElementById('room-title');
    const editTitle = document.getElementById('edit-room-title');
    let currentTitle = '';
    const updateTabTitle = () => {
        const unread = document.querySelectorAll('#messages .message.other.unread').length;
        const title = currentTitle ? `${currentTitle} - Simple Chat` : 'Simple Chat';
        document.title = unread ? `(${unread}) ${title}` : title;
    };
    socket.on('roomTitle', ({ title }) => {
        currentTitle = title;
        roomTitle.textContent = title || 'Group chat';
        updateTabTitle();
    });
    socket.on('connect', () => { editTitle.disabled = false; });
    socket.on('disconnect', () => { editTitle.disabled = true; });
    editTitle.addEventListener('click', () => {
        const title = prompt('Group title', currentTitle);
        if (title === null || title.trim() === currentTitle) return;
        if (title.trim().length > 120) {
            alert('Title must be 120 characters or fewer.');
            return;
        }
        editTitle.disabled = true;
        socket.timeout(5000).emit('setRoomTitle', title, (error, result) => {
            editTitle.disabled = !socket.connected;
            if (error || result?.error) alert(result?.error || 'Unable to save title. Check your connection and try again.');
        });
    });

    socket.on('connect', () => socket.emit('newUser', getUsername()));
    document.addEventListener('username-changed', () => socket.emit('newUser', getUsername()));
    const dictation = initializeDictation();
    initializeTyping(socket);
    initializeAudioCall(socket);

    const messagesDiv = document.getElementById('messages');
    const newMessageIndicator = document.createElement('div');
    newMessageIndicator.textContent = 'New messages';
    newMessageIndicator.style.display = 'none';
    newMessageIndicator.style.backgroundColor = '#ff0';
    newMessageIndicator.style.padding = '5px';
    newMessageIndicator.style.cursor = 'pointer';
    newMessageIndicator.style.position = 'fixed';
    newMessageIndicator.style.top = '0';
    newMessageIndicator.style.width = '100%';
    newMessageIndicator.style.textAlign = 'center';
    newMessageIndicator.addEventListener('click', () => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        newMessageIndicator.style.display = 'none';
    });
    document.body.appendChild(newMessageIndicator);

    let userScrolled = false;
    let latestMessageId = 0;
    let loadingHistory = false;
    let readTimer;
    const messageElements = new Map();
    const deletedMessageIds = new Set();
    const editedMessages = new Map();

    const markVisibleMessagesRead = () => {
        if (loadingHistory || document.hidden || !document.hasFocus() ||
            document.querySelector('dialog[open]') ||
            messagesDiv.scrollTop + messagesDiv.clientHeight < messagesDiv.scrollHeight - 2) return;
        chatReadState.mark(group(), latestMessageId);
        messageElements.forEach(element => element.classList.remove('unread'));
        updateTabTitle();
        newMessageIndicator.style.display = 'none';
    };
    const scheduleRead = () => {
        clearTimeout(readTimer);
        readTimer = setTimeout(markVisibleMessagesRead, 700);
    };
    window.addEventListener('focus', scheduleRead);
    window.addEventListener('storage', event => {
        if (event.key !== null && event.key !== 'readMessages') return;
        const lastRead = chatReadState.get()[group()] || 0;
        messageElements.forEach((element, id) => {
            element.classList.toggle('unread', element.classList.contains('other') &&
                !element.classList.contains('removed') && id > lastRead);
        });
        updateTabTitle();
    });
    document.addEventListener('visibilitychange', scheduleRead);
    document.getElementById('menu-modal').addEventListener('close', scheduleRead);
    window.addEventListener('pagehide', () => clearTimeout(readTimer));

    messagesDiv.addEventListener('scroll', () => {
        if (messagesDiv.scrollTop + messagesDiv.clientHeight < messagesDiv.scrollHeight - 2) {
            userScrolled = true;
        } else {
            userScrolled = false;
            newMessageIndicator.style.display = 'none';
        }
        scheduleRead();
    });

    // Listen for previous messages from the server
    socket.on('previousMessages', (messages) => {
        loadingHistory = true;
        if (messages.length === 0) {
            const startOfThread = document.createElement('div');
            startOfThread.textContent = 'Welcome to Simple Chat. This is the start of the thread.';
            startOfThread.classList.add('message', 'start-of-thread');
            messagesDiv.appendChild(startOfThread);
        }
        messages.forEach((msg) => {
            appendMessage(msg);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the newest message
        loadingHistory = false;
        scheduleRead();
    });

    const updateMessageState = (element, msg) => {
        const removed = msg.removed || deletedMessageIds.has(msg.id);
        const messageText = element.querySelector('.message-text');
        messageText.textContent = removed ? 'removed'
            : isFromMe(msg) ? msg.message : `${msg.username}: ${msg.message}`;
        const label = element.querySelector('.message-state');
        label.textContent = !removed && msg.edited ? 'edited' : '';
        label.hidden = !label.textContent;
        element.classList.toggle('removed', Boolean(removed));
        element.classList.toggle('unread', !removed && !isFromMe(msg) &&
            msg.id > (chatReadState.get()[group()] || 0));
        if (removed) element.querySelectorAll('button').forEach(button => button.remove());
        updateTabTitle();
    };

    const appendMessage = (msg) => {
        msg = editedMessages.get(msg.id) || msg;
        const {id, username:sender, userid} = msg;
        if (Number.isSafeInteger(id)) latestMessageId = Math.max(latestMessageId, id);
        const message = msg.message;
        if (messageElements.has(id)) {
            updateMessageState(messageElements.get(id), msg);
            return;
        }
        const messageElement = document.createElement('div');
        const messageText = document.createElement('span');
        messageText.className = 'message-text';
        messageElement.appendChild(messageText);
        const messageState = document.createElement('span');
        messageState.className = 'message-state';
        messageElement.appendChild(messageState);

        console.log(userid, getUserId())
        if (userid === getUserId()) {
            messageText.textContent = message;
            messageElement.classList.add('message', 'user');
            if (Number.isSafeInteger(id) && !msg.removed && !deletedMessageIds.has(id)) {
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'edit-message';
                editButton.title = 'Edit message';
                editButton.setAttribute('aria-label', 'Edit message');
                editButton.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i>';
                editButton.addEventListener('click', () => {
                    const updated = prompt('Edit message', messageText.textContent);
                    if (updated === null || updated === messageText.textContent) return;
                    if (!updated.trim()) {
                        alert('Message cannot be empty.');
                        return;
                    }
                    editButton.disabled = true;
                    socket.timeout(5000).emit('editMessage', { id, message: updated }, (error, result) => {
                        editButton.disabled = false;
                        if (error || result?.error) alert(result?.error || 'Unable to edit. Check your connection and try again.');
                    });
                });
                messageElement.appendChild(editButton);
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'delete-message';
                deleteButton.title = 'Delete message';
                deleteButton.setAttribute('aria-label', 'Delete message');
                deleteButton.innerHTML = '<i data-lucide="trash-2" aria-hidden="true"></i>';
                deleteButton.addEventListener('click', () => {
                    if (!confirm('Delete this message for everyone?')) return;
                    deleteButton.disabled = true;
                    socket.timeout(5000).emit('deleteMessage', id, (error, result) => {
                        deleteButton.disabled = false;
                        if (error || result?.error) alert(result?.error || 'Unable to delete. Check your connection and try again.');
                    });
                });
                messageElement.appendChild(deleteButton);
            }
        } else {
            messageText.textContent = `${sender}: ${message}`;
            messageElement.classList.add('message', 'other');
        }
        updateMessageState(messageElement, msg);
        if (Number.isSafeInteger(id)) messageElements.set(id, messageElement);
        messagesDiv.appendChild(messageElement);
        updateTabTitle();
        lucide.createIcons();
        if (!userScrolled) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the newest message
        } else {
            newMessageIndicator.style.display = 'block';
        }
        scheduleRead();

    }

    // Listen for messages from the server
    socket.on('message', (msg) => {
        appendMessage(msg);

        console.log(msg)

        !isFromMe(msg) && notify(msg);
    });

    socket.on('messageDeleted', ({ id }) => {
        deletedMessageIds.add(id);
        editedMessages.delete(id);
        const element = messageElements.get(id);
        if (element) updateMessageState(element, { id, removed: true });
    });

    socket.on('messageEdited', (msg) => {
        if (deletedMessageIds.has(msg.id)) return;
        editedMessages.set(msg.id, msg);
        const element = messageElements.get(msg.id);
        if (element) updateMessageState(element, msg);
    });

    // Send a message to the server
    function sendMessage(message) {
        socket.timeout(5000).emit('message', {
            username: getUsername(),
            userid: getUserId(),
            message,
        }, (error, result) => {
            if (error || result?.error) {
                const messageInput = document.getElementById('message-input');
                if (!messageInput.value) messageInput.value = message;
                alert(result?.error || 'Unable to send. Check your connection and try again.');
            }
        });
    }

    // Listen for form submission
    document.getElementById('message-input').addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        if (!event.repeat) document.getElementById('chat-form').requestSubmit();
    });

    document.getElementById('chat-form').addEventListener('submit', (event) => {
        event.preventDefault();
        dictation.stop();
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value;
        sendMessage(message);
        messageInput.value = '';
    });
});