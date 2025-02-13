const socket = io();
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

const sphereRadius = 12.5; // Radius of the sphere (half of 25)
const squareSize = 25; // Size of the square
let virtualWidth = 600; // Virtual area width (default value)
let virtualHeight = 600; // Virtual area height (default value)
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

const monsterSVG = 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" width="800px" height="800px" viewBox="0 0 281.25 281.25" id="svg2" version="1.1" xml:space="preserve">

        <defs id="defs4"/>

        <g id="layer1" transform="translate(7276.1064,-3697.2496)">

        <path d="m -7226.8666,3743.306 a 4.6875,4.6875 0 0 0 -4.6875,4.6875 v 25.5487 c -10.6602,19.6167 -15.338,42.3572 -13.2367,64.5886 2.0363,21.5425 10.4758,42.5851 24.8108,58.9911 21.256,24.327 54.1321,36.5952 86.1236,35.2167 21.655,-0.9332 42.9676,-7.8071 61.0859,-19.704 a 4.6875,4.6875 0 0 0 0.1941,-0.1557 4.6875,4.6875 0 0 0 0.3002,-0.2435 4.6875,4.6875 0 0 0 0.4322,-0.4321 4.6875,4.6875 0 0 0 0.249,-0.2985 4.6875,4.6875 0 0 0 0.3351,-0.5328 4.6875,4.6875 0 0 0 0.1721,-0.3168 4.6875,4.6875 0 0 0 0.2252,-0.6427 4.6875,4.6875 0 0 0 0.095,-0.3039 4.6875,4.6875 0 0 0 0.1081,-0.9668 4.6875,4.6875 0 0 0 0,-0.026 v -27.9382 a 4.6875,4.6875 0 0 0 -0.016,-0.3882 4.6875,4.6875 0 0 0 -0.8129,-2.265 4.6875,4.6875 0 0 0 -0.02,-0.029 4.6875,4.6875 0 0 0 -0.2344,-0.3058 c 7.5588,-3.6431 14.8522,-7.8355 21.8006,-12.5427 8.1183,-5.4999 15.7657,-11.6942 22.8296,-18.4955 a 4.6875,4.6875 0 0 0 0.3442,-0.3736 4.6875,4.6875 0 0 0 0.082,-0.1007 4.6875,4.6875 0 0 0 0.2875,-0.4028 4.6875,4.6875 0 0 0 0,-0.01 4.6875,4.6875 0 0 0 0.2546,-0.4615 4.6875,4.6875 0 0 0 0.035,-0.079 4.6875,4.6875 0 0 0 0.174,-0.4358 4.6875,4.6875 0 0 0 0.02,-0.055 4.6875,4.6875 0 0 0 0.1337,-0.4981 4.6875,4.6875 0 0 0 0.018,-0.095 4.6875,4.6875 0 0 0 0.06,-0.4303 4.6875,4.6875 0 0 0 0.01,-0.108 4.6875,4.6875 0 0 0 0.011,-0.4926 4.6875,4.6875 0 0 0 -0.01,-0.1062 4.6875,4.6875 0 0 0 -0.046,-0.4376 4.6875,4.6875 0 0 0 -0.013,-0.086 4.6875,4.6875 0 0 0 -0.1172,-0.5182 4.6875,4.6875 0 0 0 -0.013,-0.037 4.6875,4.6875 0 0 0 -0.1538,-0.4303 4.6875,4.6875 0 0 0 -0.049,-0.1154 4.6875,4.6875 0 0 0 -0.5182,-0.8917 4.6875,4.6875 0 0 0 -0.055,-0.073 4.6875,4.6875 0 0 0 -0.092,-0.1208 l -17.5195,-21.3062 a 4.6875,4.6875 0 0 0 -0.9173,-0.8276 4.6875,4.6875 0 0 0 -0.1282,-0.086 4.6875,4.6875 0 0 0 -2.1204,-0.7763 4.6875,4.6875 0 0 0 -0.071,0 4.6875,4.6875 0 0 0 -0.048,0 4.6875,4.6875 0 0 0 -2.2833,0.4229 4.6875,4.6875 0 0 0 -0.07,0.013 c -21.7175,10.3605 -46.8635,13.5995 -70.4974,9.0802 -28.7212,-5.4922 -55.1677,-22.664 -71.9532,-46.6077 v -32.3126 a 4.6875,4.6875 0 0 0 -0.015,-0.3864 4.6875,4.6875 0 0 0 0,-0.022 4.6875,4.6875 0 0 0 -0.02,-0.1519 4.6875,4.6875 0 0 0 -0.031,-0.2289 4.6875,4.6875 0 0 0 -0.035,-0.1703 4.6875,4.6875 0 0 0 -0.049,-0.2216 4.6875,4.6875 0 0 0 -0.048,-0.1629 4.6875,4.6875 0 0 0 -0.07,-0.2216 4.6875,4.6875 0 0 0 -0.059,-0.1483 4.6875,4.6875 0 0 0 -0.097,-0.2307 4.6875,4.6875 0 0 0 -0.059,-0.1227 4.6875,4.6875 0 0 0 -0.119,-0.227 4.6875,4.6875 0 0 0 -0.09,-0.1484 4.6875,4.6875 0 0 0 -0.1154,-0.1831 4.6875,4.6875 0 0 0 -0.1153,-0.1611 4.6875,4.6875 0 0 0 -0.1154,-0.152 4.6875,4.6875 0 0 0 -0.1227,-0.1446 4.6875,4.6875 0 0 0 -0.1629,-0.1776 4.6875,4.6875 0 0 0 -0.1117,-0.1117 4.6875,4.6875 0 0 0 -0.1557,-0.1429 4.6875,4.6875 0 0 0 -0.1519,-0.1281 4.6875,4.6875 0 0 0 -0.1575,-0.1209 4.6875,4.6875 0 0 0 -0.1703,-0.1227 4.6875,4.6875 0 0 0 -0.1575,-0.099 4.6875,4.6875 0 0 0 -0.1721,-0.1026 4.6875,4.6875 0 0 0 -0.1904,-0.099 4.6875,4.6875 0 0 0 -0.1648,-0.081 4.6875,4.6875 0 0 0 -0.1685,-0.07 4.6875,4.6875 0 0 0 -0.2215,-0.088 4.6875,4.6875 0 0 0 -0.1428,-0.044 4.6875,4.6875 0 0 0 -0.2124,-0.064 4.6875,4.6875 0 0 0 -0.2582,-0.057 4.6875,4.6875 0 0 0 -0.1319,-0.027 4.6875,4.6875 0 0 0 -0.3881,-0.051 4.6875,4.6875 0 0 0 -0.02,0 4.6875,4.6875 0 0 0 -0.3882,-0.016 z m 4.6875,9.375 h 20.4565 v 29.1339 a 4.6875,4.6875 0 0 0 0,0.01 c -0.6224,13.7605 1.9546,27.621 7.4963,40.232 11.7752,26.796 36.2044,46.2942 63.316,56.0321 16.2542,5.8381 33.6296,8.4441 50.8777,7.6758 v 20.3704 c -16.2225,10.1259 -35.1275,16.0172 -54.2303,16.8402 -29.3078,1.2629 -59.5436,-10.145 -78.6585,-32.0214 -12.915,-14.7809 -20.6773,-34.0147 -22.5384,-53.703 -1.9583,-20.7186 2.5399,-42.0823 12.6855,-60.2527 a 4.6875,4.6875 0 0 0 0.066,-0.152 4.6875,4.6875 0 0 0 0.1429,-0.3278 4.6875,4.6875 0 0 0 0.2069,-0.5914 4.6875,4.6875 0 0 0 0.084,-0.3845 4.6875,4.6875 0 0 0 0.068,-0.6024 4.6875,4.6875 0 0 0 0.026,-0.2271 z m 30.4065,43.4729 c 18.0126,20.4553 42.7903,34.8362 69.6185,39.9664 24.4351,4.6726 50.1752,1.7089 72.9346,-8.3057 l 12.4457,15.1374 c -5.7821,5.2771 -11.9416,10.1408 -18.4223,14.5312 -11.6111,7.8661 -24.2533,14.2208 -37.4908,18.8544 -11.9453,-0.6552 -23.8011,-3.0323 -35.0519,-7.0734 -25.0386,-8.9933 -47.386,-27.0461 -57.9034,-50.9802 -3.0869,-7.0246 -5.1467,-14.51 -6.1304,-22.1301 z" id="path5294" style="color:#000000;fill:#fba021;fill-opacity:1;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none"/>

        </g>

    </svg>
`);

let trees = [];
let monsters = {};
let otherUsers = {};
let treeImages = [];
let monsterImages = [];

// Each snake has an array of coordinates
let snakes = {};
let socketId = null;
const initMySnake = () => {
    snakes['mySnake'] = {
        coordinates: [{ x: virtualWidth / 2, y: virtualHeight / 2 }],
        color: userColor,
        l:1
    }
}

initMySnake();

const updateSnakeColor = (snakeId, color) => {
    if(snakeId == socketId){
        return;
    }

    if(snakes[snakeId]){
        snakes[snakeId].color = color;
    }
}

const updateSnake = (snakeId, coordinatesOfHead, length, score) => {
    if(snakeId == socketId){

        // My own snake is handled locally.
        return;
    }

    if(snakeId !== 'mySnake'){
        console.log('setting new coords')
    }

    if(!snakes[snakeId]){
        snakes[snakeId] = {
            coordinates: [{
                x: coordinatesOfHead.x,
                y: coordinatesOfHead.y,
            }],
            color: 'black',
            l: 1,
            score: 0
        }
    }

    if(score){
        snakes[snakeId].score = score;
    }

    if(length > 0){
        snakes[snakeId].l = length;
    }

    // Add the new head coordinates
    snakes[snakeId].coordinates.unshift(coordinatesOfHead);

    snakes[snakeId].coordinates.splice(snakes[snakeId].l);
}


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

function numberOfSnakes(){
    return Object.keys(snakes).filter(key => key !== socketId).length
}

// Function to update the overlay window
function updateOverlay() {
    // const numberOfUsers = Object.keys(snakes).length + 1; // Add 1 for the current user
    overlay.innerHTML = `<strong>Connected Users: ${numberOfSnakes()} </strong><br>`;

    for(const id in snakes){
        const snake = snakes[id];
        overlay.innerHTML += `<div style="color: ${snake.color};">

            (${snake.coordinates[0].x}, ${snake.coordinates[0].y}), ${snake.l} L
        </div>`;
    }

}

let lastCoordinates = { x: 0, y: 0 };

// Function to send coordinates
function sendCoordinatesOfHead(x, y) {

    if(lastCoordinates.x === x && lastCoordinates.y === y){
        return;
    }

    socket.emit('sendCoordinatesOfHead', { x, y, l: snakes['mySnake'].l });
    lastCoordinates = { x, y };
}

const removeMonster = (monsterId) => {
    console.log('Removing monster:', monsterId);
    delete monsters[monsterId];
    requestAnimationFrame(drawScene);
}

socket.on("connect", () => socketId = socket.id);


socket.on('removeMonster', (monsterId) => {
    removeMonster(monsterId);
});

// Listen for coordinates from other users
socket.on('updateCoordinatesOfHead', (data) => {
    const { id, coordinatesOfHead } = data;
    updateSnake(id, { x: coordinatesOfHead.x, y: coordinatesOfHead.y }, data.l, data.score);

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
    console.log('New monsters', monsters);

});

// Listen for virtual dimensions from the server
socket.on('setVirtualDimensions', (data) => {
    virtualWidth = data.virtualWidth;
    virtualHeight = data.virtualHeight;
    drawScene();
});

// Listen for starting position from the server
socket.on('setStartPosition', (position) => {
    snakes['mySnake'].coordinates[0].x = position.x;
    snakes['mySnake'].coordinates[0].y = position.y;
    drawScene();
});

// Consider this might send back myself, so exclude myself socket.id somehow...

socket.on('updateUsers', (users) => {
    console.log(users)
    // remove all snakes in snakes, that are not in users
    for (const id in snakes) {
        // Never delete the mySnake key
        if(id == 'mySnake'){
            continue;
        }

        if (!users[id]) {
            delete snakes[id];
        }
    }

    for (const id in users) {
        const user = users[id];

        updateSnake(id, user.coordinates, user.l, user.score);
        updateSnakeColor(id, user.color);
    }

    updateOverlay();
    // drawScene();
});

// Listen for user disconnection
socket.on('removeUser', (id) => {
    delete otherUsers[id];
    drawScene();
    updateOverlay();
});


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

function drawSnake(snake) {
    const snakeSize = 10; // Size of each segment of the snake
    ctx.fillStyle = snake.color;


    snake.coordinates.forEach(coordinate => {
        ctx.fillRect(coordinate.x, coordinate.y, snakeSize, snakeSize);
    });

    // on the first coordinate, draw the value of snake.l
    ctx.fillStyle = snake.color;
    ctx.font = "12px Arial";
    ctx.fillText(snake.l, snake.coordinates[0].x, snake.coordinates[0].y);

}

function notifyOfEatenMonster(monsterId) {
    socket.emit('monsterEaten', monsterId);
}

// Function to draw monsters on the canvas
function drawMonsters() {
    const monsterSize = 32;
    for (const monster in monsters) {
        const img = new Image();
        img.src = monsterSVG;
        if (img.complete) {
            ctx.drawImage(img, monsters[monster].x, monsters[monster].y, monsterSize, monsterSize); // Draw the monster at the specified position
        }
    }
}

// Function to draw the entire scene
function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas

    // Save the current context state
    ctx.save();

    // Translate the context to center the sphere in the viewport
    ctx.translate(canvas.width / 2 - snakes['mySnake'].coordinates[0].x, canvas.height / 2 - snakes['mySnake'].coordinates[0].y);

    // Draw the border
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, virtualWidth, virtualHeight);

    // Draw the trees
    drawTrees();

    // Draw the monsters
    drawMonsters();

    // Draw the user's sphere
    // drawSphere();
    drawSnake(snakes['mySnake']);

    // Draw other users' objects
    for (const id in snakes) {
        const user = snakes[id];

        drawSnake(user)
    }
    

    // Restore the context to its original state
    ctx.restore();
}

let intervalId;

const start = () => {
    intervalId = setInterval(updatePosition, 1000 / 10); // Update the position every 60th of a second
}

const stop = () => {
    clearInterval(intervalId);
}

start();


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
                paused ? stop() : start();
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

    requestAnimationFrame(drawScene);
});

const sendWeHitAnotherSnake = () => socket.emit('iTurnedIntoMonsters', {coordinates: snakes['mySnake'].coordinates});

// Add touch event listeners for mobile devices
canvas.addEventListener('touchstart', (event) => {
    if (!gameOver) {
        const touch = event.touches[0];
        const touchX = touch.clientX;
        const touchY = touch.clientY;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        const diffX = touchX - centerX;
        const diffY = touchY - centerY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
            direction = diffX > 0 ? 'right' : 'left';
        } else {
            direction = diffY > 0 ? 'down' : 'up';
        }
    }

    requestAnimationFrame(drawScene);
});

// Function to update the sphere's position based on the current direction
function updatePosition() {
    let x, y, newLength = 0;

    x = snakes['mySnake'].coordinates[0].x;
    y = snakes['mySnake'].coordinates[0].y;

    if (!paused && !gameOver) {
        switch (direction) {
            case 'up':
                y -= step;
                break;
            case 'down':
                y += step;
                break;
            case 'left':
                x -= step;
                break;
            case 'right':
                x += step;
                break;
        }


        // Check for game over condition
        if (x - sphereRadius < 0 || x + sphereRadius > virtualWidth ||
            y - sphereRadius < 0 || y + sphereRadius > virtualHeight) {
            gameOver = true;
            alert('Game Over!');
        }

        // If we touch another snake, game over
        for (const id in snakes) {
            if (id === 'mySnake') {
                continue;
            }

            for (let i = 0; i < snakes[id].coordinates.length; i++) {
                const coordinate = snakes[id].coordinates[i];
                if (x >= coordinate.x && x <= coordinate.x + 10 &&
                    y >= coordinate.y && y <= coordinate.y + 10) {
                    gameOver = true;
                    sendWeHitAnotherSnake();
                    alert('Game Over, hit another player!');
                    return;
                }
            }
        }

        // if we eat a monster, we gain 1 point/length
        for (const monster in monsters) {
            if (x >= monsters[monster].x && x <= monsters[monster].x + 32 &&
                y >= monsters[monster].y && y <= monsters[monster].y + 32) {
                notifyOfEatenMonster(monster);
                // snakes['mySnake'].l += 50;
                newLength = snakes['mySnake'].l + 50;
            }
        }
    }

    sendCoordinatesOfHead(x, y); // Send the updated coordinates
    updateSnake('mySnake', { x, y }, newLength);

    // drawScene();
    updateOverlay(); // Update the overlay with the user's position
    if (!gameOver) {
        requestAnimationFrame(drawScene);
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawScene(); // Redraw the scene after resizing
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

requestAnimationFrame(drawScene);
