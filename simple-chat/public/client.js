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

    const socket = io();

    initUsername();
    initUserId();

    // Notify the server of the new user
    socket.emit('newUser', getUsername());

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
        messages.forEach((msg) => {
            appendMessage(msg);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the newest message
    });

    const appendMessage = (msg) => {
        const {username:sender, userid, message} = msg;
        const messageElement = document.createElement('div');

        console.log(userid, getUserId())
        if (userid === getUserId()) {
            messageElement.textContent = message;
            messageElement.classList.add('message', 'user');
        } else {
            messageElement.textContent = `${sender}: ${message}`;
            messageElement.classList.add('message', 'other');
        }
        messagesDiv.appendChild(messageElement);
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

    // Send a message to the server
    function sendMessage(message) {
        socket.emit('message', {
            username: getUsername(),
            userid: getUserId(),
            message,
        });
    }

    // Listen for form submission
    document.getElementById('chat-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value;
        sendMessage(message);
        messageInput.value = '';
    });
});