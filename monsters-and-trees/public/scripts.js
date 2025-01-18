const socket = io();
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

const sphereRadius = 12.5; // Radius of the sphere (half of 25)
const squareSize = 25; // Size of the square
let virtualWidth = 3000; // Virtual area width (default value)
let virtualHeight = 3000; // Virtual area height (default value)
let sphereX = virtualWidth / 2; // Initial x position of the sphere
let sphereY = virtualHeight / 2; // Initial y position of the sphere

let direction = null; // Current direction of movement
let paused = false; // Movement paused state
let gameOver = false; // Game over state
let boost = false; // Boost mode state

const baseStep = 2; // Base number of pixels the sphere moves per frame
let step = baseStep; // Current step value
let userColor = 'red'; // Default color

// Tree SVG data URL
const treeSVG = 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <rect x="112" y="128" width="32" height="64" fill="#8B4513"/>
    <circle cx="128" cy="96" r="64" fill="#228B22"/>
</svg>
`);

// Monster SVG data URL
const monsterSVG = 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <circle cx="32" cy="32" r="30" fill="#FF0000"/>
  <circle cx="22" cy="24" r="5" fill="#FFFFFF"/>
  <circle cx="42" cy="24" r="5" fill="#FFFFFF"/>
  <circle cx="22" cy="24" r="2" fill="#000000"/>
  <circle cx="42" cy="24" r="2" fill="#000000"/>
  <path d="M 22 40 Q 32 50 42 40" stroke="#000000" stroke-width="2" fill="none"/>
</svg>
`);

let trees = [];
let monsters = [];
let otherUsers = {};
let treeImages = [];
let monsterImages = [];

// Create the overlay window
const overlay = document.createElement('div');
overlay.style.position = 'absolute';
overlay.style.bottom = '10px';
overlay.style.right = '10px';
overlay.style.width = '200px';
overlay.style.height = 'auto';
overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; // 50% transparent
overlay.style.border = '1px solid black';
overlay.style.padding = '10px';
overlay.style.overflowY = 'auto';
document.body.appendChild(overlay);

// Function to update the overlay window
function updateOverlay() {
    const numberOfUsers = Object.keys(otherUsers).length + 1; // Add 1 for the current user
    overlay.innerHTML = `<strong>Connected Users: ${numberOfUsers} </strong><br>`;
    overlay.innerHTML += `<div style="color: ${userColor};">
        (${Math.round(sphereX)}, ${Math.round(sphereY)})
    </div>`;
    for (const id in otherUsers) {
        const user = otherUsers[id];
        overlay.innerHTML += `<div style="color: ${user.color};">
            (${Math.round(user.x)}, ${Math.round(user.y)})
        </div>`;
    }
}

// Function to send coordinates
function sendCoordinates(x, y) {
    socket.emit('sendCoordinates', { x, y, color: userColor });
}

// Listen for coordinates from other users
socket.on('updateCoordinates', (data) => {
    // console.log('Received coordinates:', data);
    otherUsers[data.id] = { x: data.x, y: data.y, color: data.color };
    drawScene();
    updateOverlay();
});

// Listen for assigned color from the server
socket.on('assignColor', (color) => {
    userColor = color;
    console.log('Assigned color:', userColor);
    updateOverlay(); // Update the overlay with the user's color
});

// Listen for tree positions from the server
socket.on('initializeTrees', (serverTrees) => {
    trees = serverTrees;
    treeImages = trees.map(() => {
        const img = new Image();
        img.src = treeSVG;
        return img;
    });
    drawScene();
});

// Listen for monster positions from the server
socket.on('initializeMonsters', (serverMonsters) => {
    monsters = serverMonsters;
    monsterImages = monsters.map(() => {
        const img = new Image();
        img.src = monsterSVG;
        return img;
    });
    drawScene();
});

// Listen for virtual dimensions from the server
socket.on('setVirtualDimensions', (data) => {
    virtualWidth = data.virtualWidth;
    virtualHeight = data.virtualHeight;
    drawScene();
});

// Listen for starting position from the server
socket.on('setStartPosition', (position) => {
    sphereX = position.x;
    sphereY = position.y;
    drawScene();
});

// Listen for all users' positions from the server
socket.on('updateAllUsers', (users) => {
    otherUsers = users;
    drawScene();
    updateOverlay();
});

// Listen for user disconnection
socket.on('removeUser', (id) => {
    delete otherUsers[id];
    drawScene();
    updateOverlay();
});

// Function to draw the user's sphere on the canvas
function drawSphere() {
    ctx.beginPath();
    ctx.arc(sphereX, sphereY, sphereRadius, 0, Math.PI * 2, false);
    ctx.fillStyle = userColor;
    ctx.fill();
    ctx.closePath();

    // Draw direction indicator
    ctx.beginPath();
    ctx.moveTo(sphereX, sphereY);
    switch (direction) {
        case 'up':
            ctx.lineTo(sphereX, sphereY - sphereRadius - 10);
            break;
        case 'down':
            ctx.lineTo(sphereX, sphereY + sphereRadius + 10);
            break;
        case 'left':
            ctx.lineTo(sphereX - sphereRadius - 10, sphereY);
            break;
        case 'right':
            ctx.lineTo(sphereX + sphereRadius + 10, sphereY);
            break;
    }
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();

    sendCoordinates(sphereX, sphereY); // Send the updated coordinates
}

// Function to draw other users' squares on the canvas
function drawOtherSquare(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - squareSize / 2, y - squareSize / 2, squareSize, squareSize); // Draw the square centered at (x, y)
}

// Function to draw trees on the canvas
function drawTrees() {
    const treeSize = 64;
    trees.forEach((tree, index) => {
        const img = treeImages[index];
        if (img.complete) {
            ctx.drawImage(img, tree.x, tree.y, treeSize, treeSize); // Draw the tree at the specified position with double size
        }
    });
}

// Function to draw monsters on the canvas
function drawMonsters() {
    const monsterSize = 32;
    monsters.forEach((monster, index) => {
        const img = monsterImages[index];
        if (img.complete) {
            ctx.drawImage(img, monster.x, monster.y, monsterSize, monsterSize); // Draw the monster at the specified position
        }
    });
}

// Function to draw the entire scene
function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas

    // Save the current context state
    ctx.save();

    // Translate the context to center the sphere in the viewport
    ctx.translate(canvas.width / 2 - sphereX, canvas.height / 2 - sphereY);

    // Draw the border
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, virtualWidth, virtualHeight);

    // Draw the trees
    drawTrees();

    // Draw the monsters
    drawMonsters();

    // Draw the user's sphere
    drawSphere();

    // Draw other users' objects
    for (const id in otherUsers) {
        const user = otherUsers[id];
        drawOtherSquare(user.x, user.y, user.color);
    }

    // Restore the context to its original state
    ctx.restore();
}

// Event listener for arrow keys to set the direction of the sphere's movement
window.addEventListener('keydown', (event) => {
    if (!gameOver) {
        switch (event.key) {
            case 'ArrowUp':
                direction = 'up';
                break;
            case 'ArrowDown':
                direction = 'down';
                break;
            case 'ArrowLeft':
                direction = 'left';
                break;
            case 'ArrowRight':
                direction = 'right';
                break;
            case ' ':
                paused = !paused; // Toggle the paused state
                break;
            case 'b':
                boost = !boost; // Toggle the boost state
                step = boost ? baseStep * 2 : baseStep; // Double the step value if boost is on
                break;
            case 'o':
                overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none'; // Toggle overlay visibility
                break;
        }
    }
});

// Function to update the sphere's position based on the current direction
function updatePosition() {
    if (!paused && !gameOver) {
        switch (direction) {
            case 'up':
                sphereY -= step;
                break;
            case 'down':
                sphereY += step;
                break;
            case 'left':
                sphereX -= step;
                break;
            case 'right':
                sphereX += step;
                break;
        }

        // Check for game over condition
        if (sphereX - sphereRadius < 0 || sphereX + sphereRadius > virtualWidth ||
            sphereY - sphereRadius < 0 || sphereY + sphereRadius > virtualHeight) {
            gameOver = true;
            alert('Game Over!');
        }
    }

    drawScene();
    updateOverlay(); // Update the overlay with the user's position
    if (!gameOver) {
        requestAnimationFrame(updatePosition);
    }
}

// Function to resize the canvas to fill the browser window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawScene(); // Redraw the scene after resizing
}

// Initial resize and add event listener for window resize
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Initial draw and start the animation loop
drawScene();
updatePosition();