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
    return localStorage.getItem('username');
}

const getUserId = () => {
    return localStorage.getItem('userId');
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
            const username = prompt('Enter your username', getUsername());
            if (username) {
                localStorage.setItem('username', username);
                document.dispatchEvent(new Event('username-changed'));
            }
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
    const existinGroups = localStorage.getItem('groups') || [];
    const arrayOfGroups = Array.isArray(existinGroups) ? existinGroups : existinGroups.split(',');
    localStorage.setItem('groups', [...arrayOfGroups, group()]);
}

const getGroups = () => {
    return localStorage.getItem('groups').split(',');
}

appendGroupIdToLocalStorage();

document.addEventListener('DOMContentLoaded', () => {
    buttonListeners();

    initUsername();
    initUserId();

    const socket = io({ auth: { room: group(), userId: getUserId() } });

    socket.on('connect', () => socket.emit('newUser', getUsername()));
    document.addEventListener('username-changed', () => socket.emit('newUser', getUsername()));
    const dictation = initializeDictation();
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
    const messageElements = new Map();
    const deletedMessageIds = new Set();
    const editedMessages = new Map();

    messagesDiv.addEventListener('scroll', () => {
        if (messagesDiv.scrollTop + messagesDiv.clientHeight < messagesDiv.scrollHeight) {
            userScrolled = true;
        } else {
            userScrolled = false;
            newMessageIndicator.style.display = 'none';
        }
    });

    // Listen for previous messages from the server
    socket.on('previousMessages', (messages) => {
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
    });

    const appendMessage = (msg) => {
        const {id, username:sender, userid} = msg;
        const message = editedMessages.get(id)?.message ?? msg.message;
        if (deletedMessageIds.has(id) || messageElements.has(id)) return;
        const messageElement = document.createElement('div');
        const messageText = document.createElement('span');
        messageText.className = 'message-text';
        messageElement.appendChild(messageText);

        console.log(userid, getUserId())
        if (userid === getUserId()) {
            messageText.textContent = message;
            messageElement.classList.add('message', 'user');
            if (Number.isSafeInteger(id)) {
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
        if (Number.isSafeInteger(id)) messageElements.set(id, messageElement);
        messagesDiv.appendChild(messageElement);
        lucide.createIcons();
        if (!userScrolled) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the newest message
        } else {
            newMessageIndicator.style.display = 'block';
        }

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
        messageElements.get(id)?.remove();
        messageElements.delete(id);
    });

    socket.on('messageEdited', (msg) => {
        if (deletedMessageIds.has(msg.id)) return;
        editedMessages.set(msg.id, msg);
        const messageText = messageElements.get(msg.id)?.querySelector('.message-text');
        if (messageText) {
            messageText.textContent = isFromMe(msg) ? msg.message : `${msg.username}: ${msg.message}`;
        }
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
    document.getElementById('chat-form').addEventListener('submit', (event) => {
        event.preventDefault();
        dictation.stop();
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value;
        sendMessage(message);
        messageInput.value = '';
    });
});