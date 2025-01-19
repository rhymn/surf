let userName;

const initUsername = () => {
    // Check if a username is stored in cookies
    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    };

    userName = getCookie('userName');

    if (!userName) {
        userName = `User${Math.floor(Math.random() * 1000)}`;
        document.cookie = `userName=${userName}; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    initUsername();

    // Notify the server of the new user
    socket.emit('newUser', userName);

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
            // const {username, message} = msg;
            // const messageElement = document.createElement('div');
            // messageElement.textContent = `${message.username}: ${message.message}`;
            // messageElement.classList.add('message', message.username === userName ? 'user' : 'other');
            // messagesDiv.appendChild(messageElement);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the newest message
    });

    const appendMessage = (msg) => {
        const {username:sender, message} = msg;
        const messageElement = document.createElement('div');

        if (sender === userName) {
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

    });

    // Send a message to the server
    function sendMessage(message) {
        socket.emit('message', {
            username: userName,
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

    // Toggle menu
    const menuButton = document.getElementById('menu-button');
    const menuContent = document.getElementById('menu-content');
    menuButton.addEventListener('click', () => {
        if (menuContent.style.display === 'block') {
            menuContent.style.display = 'none';
        } else {
            menuContent.style.display = 'block';
        }
    });
});