document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Generate a random username
    const userName = `User${Math.floor(Math.random() * 1000)}`;

    // Notify the server of the new user
    socket.emit('newUser', userName);

    // Listen for messages from the server
    socket.on('message', (message) => {
        const messagesDiv = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messagesDiv.appendChild(messageElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to the newest message
    });

    // Send a message to the server
    function sendMessage(message) {
        socket.emit('message', message);
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