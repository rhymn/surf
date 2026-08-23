const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.style.display = 'none';
// Stops iPadOS/iOS from scrolling, zooming or rubber-banding while steering.
canvas.style.touchAction = 'none';

// The canvas backing store is scaled by devicePixelRatio, so all drawing and
// camera math works in these CSS pixel dimensions instead.
let viewportWidth = window.innerWidth;
let viewportHeight = window.innerHeight;

const SPHERE_RADIUS = 12.5;
let boardWidth = 0;
let boardHeight = 0;
let currentMapType = 'classic';

// Ground texture is drawn once into a small tile and repeated across the world.
// A full-world canvas would be ~40M pixels on the large maps, which exceeds the
// canvas area limit on iPadOS/iOS Safari and silently renders blank.
const TEXTURE_TILE_SIZE = 512;
const TEXTURE_REFERENCE_AREA = 1600 * 1600;

// Keeps texture detail per square pixel constant regardless of map size.
const scaleCountToArea = (baseCount, width, height) => {
    return Math.max(1, Math.round(baseCount * ((width * height) / TEXTURE_REFERENCE_AREA)));
};

const MAPS = {
    classic: {
        label: 'Classic Plains',
        description: 'Open plains with a balanced mix of objects.',
        size: '6400 × 6400',
        highlights: ['Many trees', 'Lots of monsters, clouds, and dots', 'Scattered thorns'],
        respawnRule: 'Food behaviour is chosen per game — moved to a new spot or removed.',
        drawBackground(ctx, width, height) {
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#8ec9f0');
            gradient.addColorStop(0.45, '#bfe4c6');
            gradient.addColorStop(1, '#d9f2a8');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        },
        ambientCounts: { clouds: 14, sunGlints: 3 },
        drawAmbient(ctx, width, height, time, elements) {
            // A slow-turning sun glow keeps the plains from feeling static.
            for (const glint of elements.sunGlints) {
                const gx = glint.fx * width + Math.cos(time * 0.00006 + glint.phase) * width * 0.08;
                const gy = glint.fy * height + Math.sin(time * 0.00006 + glint.phase) * height * 0.08;
                const radius = glint.radius;
                const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
                glow.addColorStop(0, 'rgba(255,250,200,0.22)');
                glow.addColorStop(1, 'rgba(255,250,200,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(gx, gy, radius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Cloud shadows drift across the field and wrap around the board.
            for (const cloud of elements.clouds) {
                const driftX = (cloud.fx * width + time * cloud.speed) % (width + cloud.rx * 2) - cloud.rx;
                const bobY = cloud.fy * height + Math.sin(time * 0.0003 + cloud.phase) * height * 0.02;
                ctx.fillStyle = `rgba(60,90,60,${cloud.alpha})`;
                ctx.beginPath();
                ctx.ellipse(driftX, bobY, cloud.rx, cloud.ry, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        },
        drawTexture(octx, width, height, r) {
            // Ground variation patches
            for (let i = 0, n = scaleCountToArea(220, width, height); i < n; i++) {
                octx.fillStyle = `rgba(160,130,70,${0.04 + r() * 0.07})`;
                octx.beginPath();
                octx.ellipse(r() * width, r() * height, 8 + r() * 22, 4 + r() * 10, r() * Math.PI, 0, Math.PI * 2);
                octx.fill();
            }
            // Grass tufts (V-shapes)
            for (let i = 0, n = scaleCountToArea(600, width, height); i < n; i++) {
                const x = r() * width;
                const y = r() * height;
                const size = 4 + r() * 9;
                octx.strokeStyle = `rgba(45,120,25,${0.15 + r() * 0.25})`;
                octx.lineWidth = 1;
                octx.beginPath(); octx.moveTo(x, y); octx.lineTo(x - size * 0.45, y - size); octx.stroke();
                octx.beginPath(); octx.moveTo(x, y); octx.lineTo(x + size * 0.45, y - size); octx.stroke();
            }
            // Wildflowers
            for (let i = 0, n = scaleCountToArea(250, width, height); i < n; i++) {
                octx.fillStyle = `hsla(${40 + r() * 60},90%,65%,${0.25 + r() * 0.35})`;
                octx.beginPath();
                octx.arc(r() * width, r() * height, 1.5 + r() * 2.5, 0, Math.PI * 2);
                octx.fill();
            }
        }
    },
    forest: {
        label: 'Dense Forest',
        description: 'Dense woodland with lots of trees and scarce food.',
        size: '7200 × 5600',
        highlights: ['120 trees', 'Plenty of monsters, clouds, and dots', 'Rare thorns'],
        respawnRule: 'Food behaviour is chosen per game — moved to a new spot or removed.',
        drawBackground(ctx, width, height) {
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#2f5d34');
            gradient.addColorStop(0.5, '#4f8a3f');
            gradient.addColorStop(1, '#7fae4a');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        },
        ambientCounts: { sunbeams: 8, fireflies: 26 },
        drawAmbient(ctx, width, height, time, elements) {
            // Sunbeams slant through the canopy and sway gently.
            for (const beam of elements.sunbeams) {
                const sway = Math.sin(time * 0.0002 + beam.phase) * width * 0.03;
                const bx = beam.fx * width + sway;
                ctx.save();
                ctx.translate(bx, 0);
                ctx.rotate(beam.tilt);
                const gradient = ctx.createLinearGradient(0, 0, 0, height);
                gradient.addColorStop(0, 'rgba(255,250,190,0.16)');
                gradient.addColorStop(1, 'rgba(255,250,190,0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(-beam.width / 2, -height * 0.2, beam.width, height * 1.4);
                ctx.restore();
            }

            // Fireflies drift lazily and pulse brighter and dimmer.
            for (const firefly of elements.fireflies) {
                const fx = firefly.fx * width + Math.sin(time * 0.0006 + firefly.phase) * 26;
                const fy = firefly.fy * height + Math.cos(time * 0.0005 + firefly.phase) * 26;
                const pulse = 0.35 + 0.35 * Math.sin(time * 0.003 + firefly.phase * 3);
                const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 6);
                glow.addColorStop(0, `rgba(210,255,140,${pulse})`);
                glow.addColorStop(1, 'rgba(210,255,140,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(fx, fy, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        },
        drawTexture(octx, width, height, r) {
            // Dappled light blobs
            for (let i = 0, n = scaleCountToArea(160, width, height); i < n; i++) {
                octx.fillStyle = `rgba(255,255,170,${0.05 + r() * 0.09})`;
                octx.beginPath();
                octx.arc(r() * width, r() * height, 20 + r() * 65, 0, Math.PI * 2);
                octx.fill();
            }
            // Fallen leaf ellipses
            for (let i = 0, n = scaleCountToArea(420, width, height); i < n; i++) {
                const g = 80 + Math.floor(r() * 65);
                octx.fillStyle = `rgba(20,${g},20,${0.09 + r() * 0.17})`;
                octx.save();
                octx.translate(r() * width, r() * height);
                octx.rotate(r() * Math.PI);
                octx.beginPath();
                octx.ellipse(0, 0, 3 + r() * 11, 2 + r() * 5, 0, 0, Math.PI * 2);
                octx.fill();
                octx.restore();
            }
            // Forest-floor speckles
            for (let i = 0, n = scaleCountToArea(450, width, height); i < n; i++) {
                octx.fillStyle = `rgba(0,55,0,${0.07 + r() * 0.12})`;
                octx.beginPath();
                octx.arc(r() * width, r() * height, 0.8 + r() * 2.5, 0, Math.PI * 2);
                octx.fill();
            }
        }
    },
    thorns: {
        label: 'Thorn Field',
        description: 'Dangerous thorn field where every meal could be your last.',
        size: '6000 × 6000',
        highlights: ['Many thorns', 'Heavy food spawns', 'Few trees'],
        respawnRule: 'Food behaviour is chosen per game — moved to a new spot or removed.',
        drawBackground(ctx, width, height) {
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#5b2a86');
            gradient.addColorStop(0.5, '#c23a7a');
            gradient.addColorStop(1, '#e08a3c');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        },
        ambientCounts: { embers: 30, pulses: 3 },
        drawAmbient(ctx, width, height, time, elements) {
            // A slow pulsing haze keeps the field feeling alive and threatening.
            for (const pulse of elements.pulses) {
                const pulseAlpha = 0.08 + 0.06 * Math.sin(time * 0.0008 + pulse.phase);
                const px = pulse.fx * width;
                const py = pulse.fy * height;
                const glow = ctx.createRadialGradient(px, py, 0, px, py, pulse.radius);
                glow.addColorStop(0, `rgba(255,90,180,${Math.max(0, pulseAlpha)})`);
                glow.addColorStop(1, 'rgba(255,90,180,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(px, py, pulse.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Embers drift upward and wrap back to the bottom of the board.
            for (const ember of elements.embers) {
                const ey = (ember.fy * height - time * ember.speed) % (height + 20);
                const wrappedY = ey < 0 ? ey + height + 20 : ey;
                const ex = ember.fx * width + Math.sin(time * 0.0007 + ember.phase) * 18;
                const flicker = 0.4 + 0.35 * Math.sin(time * 0.004 + ember.phase * 5);
                ctx.fillStyle = `rgba(255,170,90,${flicker})`;
                ctx.beginPath();
                ctx.arc(ex, wrappedY, 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        },
        drawTexture(octx, width, height, r) {
            // Cracked-earth line network
            for (let i = 0, n = scaleCountToArea(240, width, height); i < n; i++) {
                const x = r() * width;
                const y = r() * height;
                const len = 8 + r() * 22;
                const angle = r() * Math.PI;
                octx.strokeStyle = `rgba(110,50,90,${0.10 + r() * 0.15})`;
                octx.lineWidth = 0.5 + r();
                octx.beginPath(); octx.moveTo(x, y); octx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len); octx.stroke();
                if (r() > 0.45) {
                    const ba = angle + (r() - 0.5) * 1.6;
                    const bx = x + Math.cos(angle) * len * 0.5;
                    const by = y + Math.sin(angle) * len * 0.5;
                    octx.beginPath(); octx.moveTo(bx, by); octx.lineTo(bx + Math.cos(ba) * len * 0.45, by + Math.sin(ba) * len * 0.45); octx.stroke();
                }
            }
            // Thorn spike triangles
            for (let i = 0, n = scaleCountToArea(260, width, height); i < n; i++) {
                const rv = Math.floor(75 + r() * 65);
                octx.fillStyle = `rgba(${rv},15,75,${0.10 + r() * 0.18})`;
                const sz = 3 + r() * 10;
                octx.save();
                octx.translate(r() * width, r() * height);
                octx.rotate(r() * Math.PI * 2);
                octx.beginPath(); octx.moveTo(0, -sz); octx.lineTo(sz * 0.4, sz * 0.5); octx.lineTo(-sz * 0.4, sz * 0.5); octx.closePath();
                octx.fill();
                octx.restore();
            }
            // Dry speckles
            for (let i = 0, n = scaleCountToArea(350, width, height); i < n; i++) {
                octx.fillStyle = `rgba(140,55,75,${0.07 + r() * 0.12})`;
                octx.beginPath();
                octx.arc(r() * width, r() * height, 0.8 + r() * 2.5, 0, Math.PI * 2);
                octx.fill();
            }
        }
    }
};

// Simple LCG-based seeded PRNG so textures are deterministic frame-to-frame.
function makeSeededRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = Math.imul(s, 1664525) + 1013904223 >>> 0;
        return s / 0x100000000;
    };
}

let mapTextureTile = null;
let mapTexturePattern = null;

function generateMapTextureTile(mapType) {
    const offscreen = document.createElement('canvas');
    offscreen.width = TEXTURE_TILE_SIZE;
    offscreen.height = TEXTURE_TILE_SIZE;
    const octx = offscreen.getContext('2d');
    const r = makeSeededRandom(0xdeadbeef);

    MAPS[mapType]?.drawTexture?.(octx, TEXTURE_TILE_SIZE, TEXTURE_TILE_SIZE, r);

    return offscreen;
}

function updateMapTexture(mapType) {
    mapTextureTile = generateMapTextureTile(mapType);
    mapTexturePattern = mapTextureTile ? ctx.createPattern(mapTextureTile, 'repeat') : null;
    ambientElements = generateAmbientElements(mapType);
}

// Ambient elements keep stable base positions (fractions of the board) so they
// drift smoothly frame to frame instead of jumping around.
let ambientElements = null;

function generateAmbientElements(mapType) {
    const counts = MAPS[mapType]?.ambientCounts;
    if (!counts) {
        return null;
    }

    const r = makeSeededRandom(0xc0ffee ^ mapType.length);
    const elements = {};

    if (counts.clouds) {
        elements.clouds = Array.from({ length: counts.clouds }, () => ({
            fx: r(),
            fy: r(),
            rx: 60 + r() * 120,
            ry: 20 + r() * 30,
            speed: 0.01 + r() * 0.02,
            phase: r() * Math.PI * 2,
            alpha: 0.03 + r() * 0.04
        }));
    }

    if (counts.sunGlints) {
        elements.sunGlints = Array.from({ length: counts.sunGlints }, () => ({
            fx: r(),
            fy: r() * 0.4,
            radius: 180 + r() * 220,
            phase: r() * Math.PI * 2
        }));
    }

    if (counts.sunbeams) {
        elements.sunbeams = Array.from({ length: counts.sunbeams }, () => ({
            fx: r(),
            width: 40 + r() * 70,
            tilt: -0.25 - r() * 0.2,
            phase: r() * Math.PI * 2
        }));
    }

    if (counts.fireflies) {
        elements.fireflies = Array.from({ length: counts.fireflies }, () => ({
            fx: r(),
            fy: r(),
            phase: r() * Math.PI * 2
        }));
    }

    if (counts.embers) {
        elements.embers = Array.from({ length: counts.embers }, () => ({
            fx: r(),
            fy: r(),
            speed: 0.01 + r() * 0.03,
            phase: r() * Math.PI * 2
        }));
    }

    if (counts.pulses) {
        elements.pulses = Array.from({ length: counts.pulses }, () => ({
            fx: r(),
            fy: r(),
            radius: 260 + r() * 260,
            phase: r() * Math.PI * 2
        }));
    }

    return elements;
}

let movementDirection = null;
const STEERING_MODES = {
    CLASSIC: 'classicDirectional',
    FREE: 'freeSteering'
};
const STEERING_MODE_LABELS = {
    [STEERING_MODES.CLASSIC]: 'Classic (up/down/left/right)',
    [STEERING_MODES.FREE]: '360° (mouse + steer keys)'
};
const STEERING_MODE_SHORT_LABELS = {
    [STEERING_MODES.CLASSIC]: 'Classic',
    [STEERING_MODES.FREE]: '360°'
};
const TURN_STEP_RADIANS = 0.12;
let steeringMode = STEERING_MODES.CLASSIC;
let steeringAngle = 0;
const activeSteerKeys = new Set();
let isPaused = false;
let isGameOver = false;
let isEaten = false;
let isBoostHeld = false;
let isBoostLatched = false;
let isBoosting = false;
let isBoostLockedOut = false;
let hasJoinedGame = false;
let isInLobbyWhilePlaying = false;
let localPlayerName = 'Anonymous';
let currentGameId = null;

const DEFAULT_BASE_STEP = 2;
const DEFAULT_TICKS_PER_SECOND = 20;
const DEFAULT_BOOST_MULTIPLIER = 2;
const DEFAULT_MAX_ENERGY = 1000;
const DEFAULT_BOOST_DRAIN_PER_SECOND = 100;
const DEFAULT_MIN_ENERGY_TO_START_BOOST = 75;
let baseStep = DEFAULT_BASE_STEP;
let ticksPerSecond = DEFAULT_TICKS_PER_SECOND;
let boostMultiplier = DEFAULT_BOOST_MULTIPLIER;
let maxEnergy = DEFAULT_MAX_ENERGY;
let boostDrainPerSecond = DEFAULT_BOOST_DRAIN_PER_SECOND;
let minEnergyToStartBoost = DEFAULT_MIN_ENERGY_TO_START_BOOST;
let currentEnergy = DEFAULT_MAX_ENERGY;
let updateIntervalMs = 1000 / ticksPerSecond;
let hasMovementConfig = false;
const GAME_WORLD_OBJECT_TYPES = window.WORLD_OBJECT_TYPES;
const OBJECT_TYPE_TREE = GAME_WORLD_OBJECT_TYPES.TREE;
const OBJECT_TYPE_MONSTER = GAME_WORLD_OBJECT_TYPES.MONSTER;
const OBJECT_TYPE_CLOUD = GAME_WORLD_OBJECT_TYPES.CLOUD;
const OBJECT_TYPE_THORN = GAME_WORLD_OBJECT_TYPES.THORN;
const OBJECT_TYPE_DOT = GAME_WORLD_OBJECT_TYPES.DOT;
const OBJECT_TYPE_PORTAL = GAME_WORLD_OBJECT_TYPES.PORTAL;
let movementStep = baseStep;
let localSnakeColor = 'red';
let localSnakeHeadEmoji = '🐍';
const INITIAL_USER_LENGTH = 6;
const GAME_SOCKET_EVENTS = window.SOCKET_EVENTS;
const RTC_SOCKET_EVENTS = window.RTC_EVENTS;
const audioRtcClient = typeof window.createAudioRtcClient === 'function'
    ? window.createAudioRtcClient({
        socket,
        rtcEvents: RTC_SOCKET_EVENTS,
        getCurrentGameId: () => currentGameId
    })
    : null;
const PLAYING_TYPES = {
    TIMER: 'timer',
    FIRST_TO_SCORE: 'firstTo1000',
    LAST_MAN_STANDING: 'lastManStanding'
};
const MAP_TYPES = Object.fromEntries(Object.keys(MAPS).map(k => [k.toUpperCase(), k]));
const COLLISION_RESPONSES = {
    GAME_OVER: 'gameOver',
    BOUNCE: 'bounce'
};
const COLLISION_RESPONSE_OPTIONS = [
    { value: COLLISION_RESPONSES.GAME_OVER, label: 'Game over' },
    { value: COLLISION_RESPONSES.BOUNCE, label: 'Bounce back' }
];
const FOOD_HIT_BEHAVIORS = {
    REMOVE: 'remove',
    MOVE: 'move'
};
const FOOD_HIT_BEHAVIOR_OPTIONS = [
    { value: FOOD_HIT_BEHAVIORS.MOVE, label: 'Move food to a new spot' },
    { value: FOOD_HIT_BEHAVIORS.REMOVE, label: 'Remove food from the map' }
];
let gameRules = {
    borderCollisionEndsGame: true,
    borderCollisionResponse: COLLISION_RESPONSES.GAME_OVER,
    dangerousObjectCollisionResponse: COLLISION_RESPONSES.GAME_OVER,
    foodHitBehavior: FOOD_HIT_BEHAVIORS.MOVE,
    playerCollisionEndsGame: true,
    treeCollisionEndsGame: false,
    snakeSegmentSize: 10,
    snakeHeadSizeMultiplier: 2,
    playerCollisionSize: 10,
    worldObjectsEnabled: true
};

let worldObjectDefinitions = JSON.parse(JSON.stringify(window.DEFAULT_WORLD_OBJECT_TYPE_DEFINITIONS));

const rectanglesOverlap = (firstRect, secondRect) => {
    return (
        firstRect.x < secondRect.x + secondRect.width &&
        firstRect.x + firstRect.width > secondRect.x &&
        firstRect.y < secondRect.y + secondRect.height &&
        firstRect.y + firstRect.height > secondRect.y
    );
};

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

let worldObjects = {};
let frozenSnakeCorpses = {};
const treeImage = new Image();
treeImage.src = treeSVG;

let snakeStates = {};
let localSocketId = null;
const initializeLocalSnake = () => {
    snakeStates.mySnake = {
        coordinates: [{ x: boardWidth / 2, y: boardHeight / 2 }],
        color: localSnakeColor,
        length: INITIAL_USER_LENGTH,
        width: gameRules.snakeSegmentSize,
        headEmoji: localSnakeHeadEmoji
    }
}

initializeLocalSnake();

const setSnakeColorById = (snakeId, color) => {
    if (snakeId === localSocketId) {
        return;
    }

    if (snakeStates[snakeId]) {
        snakeStates[snakeId].color = color;
    }
}

const ensureSnakeCoordinateCountMatchesLength = (snakeState) => {
    if (!snakeState || !Array.isArray(snakeState.coordinates)) {
        return;
    }

    const targetLength = Math.max(
        1,
        Number.parseInt(`${snakeState.length ?? INITIAL_USER_LENGTH}`, 10) || INITIAL_USER_LENGTH
    );

    if (snakeState.coordinates.length === 0) {
        snakeState.coordinates.push({ x: boardWidth / 2, y: boardHeight / 2 });
    }

    const tailCoordinate = snakeState.coordinates[snakeState.coordinates.length - 1];

    while (snakeState.coordinates.length < targetLength) {
        snakeState.coordinates.push({ x: tailCoordinate.x, y: tailCoordinate.y });
    }

    snakeState.coordinates.splice(targetLength);
};

const upsertSnakeById = (snakeId, headCoordinates, nextLength, nextScore, nextWidth) => {
    if (snakeId === localSocketId) {
        return;
    }

    if (!snakeStates[snakeId]) {
        snakeStates[snakeId] = {
            coordinates: [{
                x: headCoordinates.x,
                y: headCoordinates.y,
            }],
            color: 'black',
            name: 'Anonymous',
            length: INITIAL_USER_LENGTH,
            score: 0,
            width: gameRules.snakeSegmentSize,
            headEmoji: '🐍'
        }
    }

    const snakeState = snakeStates[snakeId];

    if (typeof nextScore === 'number') {
        snakeState.score = nextScore;
    }

    if (nextLength > 0) {
        snakeState.length = nextLength;
    }

    if (typeof nextWidth === 'number' && nextWidth > 0) {
        snakeState.width = nextWidth;
    }

    snakeState.coordinates.unshift(headCoordinates);
    ensureSnakeCoordinateCountMatchesLength(snakeState);
}

const overlay = document.createElement('div');
overlay.className = 'hud-panel';
overlay.style.display = 'none';
document.body.appendChild(overlay);

const overlayContent = document.createElement('div');
overlayContent.className = 'hud-stats';
overlay.appendChild(overlayContent);

const energyPanel = document.createElement('div');
energyPanel.className = 'hud-energy';

const energyHeader = document.createElement('div');
energyHeader.className = 'hud-energy-header';

const energyLabel = document.createElement('span');
energyLabel.className = 'hud-stat-label';
energyLabel.textContent = 'Battery';

const energyValue = document.createElement('span');
energyValue.className = 'hud-energy-value';

energyHeader.append(energyLabel, energyValue);

const energyTrack = document.createElement('div');
energyTrack.className = 'hud-energy-track';

const energyFill = document.createElement('div');
energyFill.className = 'hud-energy-fill';
energyTrack.appendChild(energyFill);

const boostButton = document.createElement('button');
boostButton.className = 'btn hud-boost-button';
boostButton.textContent = 'Hold to boost';

const lastMealPanel = document.createElement('div');
lastMealPanel.className = 'hud-last-meal';
lastMealPanel.style.display = 'none';

energyPanel.append(energyHeader, energyTrack, lastMealPanel, boostButton);
overlay.appendChild(energyPanel);

const showLastMeal = (worldObject) => {
    const facts = window.getFoodNutritionFacts?.(worldObject.type, worldObject.emoji);
    if (!facts) {
        return;
    }

    lastMealPanel.style.display = 'block';
    lastMealPanel.textContent = '';

    const mealHeading = document.createElement('div');
    mealHeading.className = 'hud-last-meal-heading';
    mealHeading.textContent = `${worldObject.emoji} +${Math.round(facts.kcal)} kcal`;

    const mealMacros = document.createElement('div');
    mealMacros.className = 'hud-last-meal-macros';
    mealMacros.textContent = `F ${facts.fat.toFixed(0)}g · C ${facts.carbs.toFixed(0)}g · Fib ${facts.fiber.toFixed(0)}g · P ${facts.protein.toFixed(0)}g`;

    lastMealPanel.append(mealHeading, mealMacros);
};

const updateEnergyMeter = () => {
    const energyRatio = maxEnergy > 0 ? Math.max(0, Math.min(1, currentEnergy / maxEnergy)) : 0;
    energyFill.style.width = `${(energyRatio * 100).toFixed(1)}%`;
    energyValue.textContent = `${Math.round(currentEnergy)} kcal`;
    energyPanel.classList.toggle('is-boosting', isBoosting);
    energyPanel.classList.toggle('is-depleted', currentEnergy < minEnergyToStartBoost);
    boostButton.classList.toggle('is-active', isBoosting);

    if (isBoostLockedOut) {
        boostButton.textContent = 'Battery empty';
    } else {
        boostButton.textContent = isBoostLatched ? 'Boost latched' : 'Hold to boost';
    }
};

let lastSentBoostState = false;

const refreshBoostState = () => {
    // Boost needs a minimum charge to start, but may run until the battery is empty.
    const hasChargeToBoost = isBoosting ? currentEnergy > 0 : currentEnergy >= minEnergyToStartBoost;
    const canControlSnake = hasJoinedGame && !isPaused && !isGameOver && !isEaten;

    // Running dry cuts boost off for good: refuelling alone must not switch it back on.
    if (!hasChargeToBoost && (isBoosting || isBoostHeld || isBoostLatched)) {
        isBoostLockedOut = true;
    }

    if (isBoostLatched && (isBoostLockedOut || !canControlSnake)) {
        isBoostLatched = false;
    }

    isBoosting = (isBoostHeld || isBoostLatched) && hasChargeToBoost && canControlSnake && !isBoostLockedOut;
    movementStep = isBoosting ? baseStep * boostMultiplier : baseStep;

    if (isBoosting !== lastSentBoostState) {
        lastSentBoostState = isBoosting;
        socket.emit(GAME_SOCKET_EVENTS.SET_BOOST, isBoosting);
    }

    updateEnergyMeter();
};

const setBoostHeld = (isHeld) => {
    isBoostHeld = Boolean(isHeld);

    // Only releasing the control arms boost again, so key auto-repeat cannot revive it.
    if (!isBoostHeld) {
        isBoostLockedOut = false;
    }

    refreshBoostState();
};

const toggleBoostLatch = () => {
    isBoostLockedOut = false;
    isBoostLatched = !isBoostLatched;
    refreshBoostState();
};

const stopBoost = () => {
    isBoostHeld = false;
    isBoostLatched = false;
    isBoostLockedOut = false;
    refreshBoostState();
};

boostButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    setBoostHeld(true);
});
boostButton.addEventListener('pointerup', () => setBoostHeld(false));
boostButton.addEventListener('pointerleave', () => setBoostHeld(false));
boostButton.addEventListener('pointercancel', () => setBoostHeld(false));

updateEnergyMeter();

const goToLobbyButton = document.createElement('button');
goToLobbyButton.className = 'btn hud-lobby-button';
goToLobbyButton.textContent = 'Go to lobby';
goToLobbyButton.style.display = 'none';
const openLobbyWhilePlaying = () => {
    isInLobbyWhilePlaying = true;
    isPaused = true;
    stopBoost();
    activeSteerKeys.clear();
    stopMovementLoop();
    canvas.style.display = 'none';
    overlay.style.display = 'none';
    timerOverlay.style.display = 'none';
    lobbyOverlay.style.display = 'flex';
    updateLobbyControls();
    socket.emit(GAME_SOCKET_EVENTS.LIST_ACTIVE_GAMES);
};
goToLobbyButton.onclick = () => {
    openLobbyWhilePlaying();
};
overlay.appendChild(goToLobbyButton);

const spectatingBanner = document.createElement('div');
spectatingBanner.className = 'hud-banner';
spectatingBanner.style.display = 'none';
document.body.appendChild(spectatingBanner);

const timerOverlay = document.createElement('div');
timerOverlay.className = 'hud-timer';
timerOverlay.textContent = '00:00';
timerOverlay.style.display = 'none';
document.body.appendChild(timerOverlay);

const lobbyOverlay = document.createElement('div');
lobbyOverlay.className = 'lobby-overlay';
lobbyOverlay.style.position = 'absolute';
lobbyOverlay.style.top = '0';
lobbyOverlay.style.left = '0';
lobbyOverlay.style.width = '100%';
lobbyOverlay.style.height = '100%';
lobbyOverlay.style.display = 'flex';
lobbyOverlay.style.alignItems = 'center';
lobbyOverlay.style.justifyContent = 'center';
lobbyOverlay.style.zIndex = '1000';

const lobbyPanel = document.createElement('div');
lobbyPanel.className = 'lobby-panel';

const lobbyHeader = document.createElement('div');
lobbyHeader.className = 'lobby-header';

const lobbyTitle = document.createElement('h1');
lobbyTitle.className = 'lobby-title';
lobbyTitle.textContent = '🐍 Monsters & Trees';
lobbyHeader.appendChild(lobbyTitle);

const lobbySubtitle = document.createElement('div');
lobbySubtitle.className = 'lobby-subtitle';
lobbySubtitle.textContent = 'Eat fruit · Grow · Survive';
lobbyHeader.appendChild(lobbySubtitle);
lobbyPanel.appendChild(lobbyHeader);

const nameLabel = document.createElement('label');
nameLabel.className = 'field-label';
nameLabel.textContent = 'Your name';
lobbyPanel.appendChild(nameLabel);

const nameInput = document.createElement('input');
nameInput.className = 'field-input';
nameInput.type = 'text';
nameInput.placeholder = 'Name';
nameInput.maxLength = 24;
lobbyPanel.appendChild(nameInput);

const createRow = document.createElement('div');
createRow.className = 'create-row';

const newGameSettingsTitle = document.createElement('h3');
newGameSettingsTitle.className = 'section-title';
newGameSettingsTitle.textContent = 'New game settings';

const newGameSettingsHint = document.createElement('div');
newGameSettingsHint.className = 'hint';
newGameSettingsHint.textContent = 'These settings are used only when creating a new game.';

const gameTypeLabel = document.createElement('label');
gameTypeLabel.className = 'field-label';
gameTypeLabel.textContent = 'Game type';

const mapTypeLabel = document.createElement('label');
mapTypeLabel.className = 'field-label';
mapTypeLabel.textContent = 'Map';

const borderCollisionLabel = document.createElement('label');
borderCollisionLabel.className = 'field-label';
borderCollisionLabel.textContent = 'Border collision';

const dangerousCollisionLabel = document.createElement('label');
dangerousCollisionLabel.className = 'field-label';
dangerousCollisionLabel.textContent = 'Dangerous object collision';

const foodHitBehaviorLabel = document.createElement('label');
foodHitBehaviorLabel.className = 'field-label';
foodHitBehaviorLabel.textContent = 'Food on hit';

const steeringSettingsTitle = document.createElement('h3');
steeringSettingsTitle.className = 'section-title';
steeringSettingsTitle.textContent = 'Your controls';

const steeringSettingsHint = document.createElement('div');
steeringSettingsHint.className = 'hint';
steeringSettingsHint.textContent = 'Steering is personal and can be changed in lobby or during play. Boost: hold B or Shift, or double-tap (double-click) to latch it until the battery runs out.';

const steeringModeLabel = document.createElement('label');
steeringModeLabel.className = 'field-label';
steeringModeLabel.textContent = 'Steering mode';

const gameNameInput = document.createElement('input');
gameNameInput.className = 'field-input';
gameNameInput.type = 'text';
gameNameInput.placeholder = 'New game name';
gameNameInput.maxLength = 40;
gameNameInput.style.flex = '1';

const createButton = document.createElement('button');
createButton.className = 'btn btn-primary';
createButton.textContent = 'Create';

const randomButton = document.createElement('button');
randomButton.className = 'btn';
randomButton.textContent = 'Random';

const mapTypeSelect = document.createElement('select');
mapTypeSelect.className = 'field-select';

const mapTypeOptions = Object.entries(MAPS).map(([value, map]) => ({ value, label: map.label }));

for (const mapTypeOption of mapTypeOptions) {
    const optionElement = document.createElement('option');
    optionElement.value = mapTypeOption.value;
    optionElement.textContent = mapTypeOption.label;
    mapTypeSelect.appendChild(optionElement);
}

mapTypeSelect.value = MAP_TYPES.CLASSIC;

const mapInfoPanel = document.createElement('div');
mapInfoPanel.className = 'map-info';

const updateMapInfoPanel = (mapType) => {
    const map = MAPS[mapType];
    if (!map) {
        mapInfoPanel.style.display = 'none';
        return;
    }
    mapInfoPanel.style.display = 'block';
    mapInfoPanel.innerHTML = [
        `<strong>${map.description}</strong>`,
        `<div style="margin-top:4px">📐 Size: ${map.size}</div>`,
        `<div>🗺️ ${map.highlights.join(' · ')}</div>`,
        `<div style="margin-top:4px">🔄 ${map.respawnRule}</div>`
    ].join('');
};

updateMapInfoPanel(mapTypeSelect.value);
mapTypeSelect.addEventListener('change', () => updateMapInfoPanel(mapTypeSelect.value));

const foodGuidePanel = document.createElement('div');
foodGuidePanel.className = 'map-info food-guide';
foodGuidePanel.innerHTML = [
    '<strong>Not all food is equal</strong>',
    '<div style="margin-top:4px">� Battery charge = real calories (fat 9, carbs 4, protein 4, fibre 2 kcal/g)</div>',
    '<div style="margin-top:4px">🟢 AIP (🍓 🥑 🥬) — double points</div>',
    '<div>⚪️ Healthy (🍅 🥚 🥜) — normal points</div>',
    '<div>🔴 Junk (🍩 🍕 🍬) — no points and extra bulk, but calorie dense</div>'
].join('');

const playingTypeSelect = document.createElement('select');
playingTypeSelect.className = 'field-select';

const steeringModeSelect = document.createElement('select');
steeringModeSelect.className = 'field-select';

const borderCollisionSelect = document.createElement('select');
borderCollisionSelect.className = 'field-select';

const dangerousObjectCollisionSelect = document.createElement('select');
dangerousObjectCollisionSelect.className = 'field-select';

const foodHitBehaviorSelect = document.createElement('select');
foodHitBehaviorSelect.className = 'field-select';

const playingTypeOptions = [
    { value: PLAYING_TYPES.LAST_MAN_STANDING, label: 'Last man standing' },
    { value: PLAYING_TYPES.TIMER, label: 'Most points in 60s' },
    { value: PLAYING_TYPES.FIRST_TO_SCORE, label: 'First to 1000 points' }
];

for (const playingTypeOption of playingTypeOptions) {
    const optionElement = document.createElement('option');
    optionElement.value = playingTypeOption.value;
    optionElement.textContent = playingTypeOption.label;
    playingTypeSelect.appendChild(optionElement);
}

const steeringModeOptions = [
    { value: STEERING_MODES.CLASSIC, label: STEERING_MODE_LABELS[STEERING_MODES.CLASSIC] },
    { value: STEERING_MODES.FREE, label: STEERING_MODE_LABELS[STEERING_MODES.FREE] }
];

for (const steeringModeOption of steeringModeOptions) {
    const optionElement = document.createElement('option');
    optionElement.value = steeringModeOption.value;
    optionElement.textContent = steeringModeOption.label;
    steeringModeSelect.appendChild(optionElement);
}

for (const collisionResponseOption of COLLISION_RESPONSE_OPTIONS) {
    const borderOptionElement = document.createElement('option');
    borderOptionElement.value = collisionResponseOption.value;
    borderOptionElement.textContent = collisionResponseOption.label;
    borderCollisionSelect.appendChild(borderOptionElement);

    const dangerousOptionElement = document.createElement('option');
    dangerousOptionElement.value = collisionResponseOption.value;
    dangerousOptionElement.textContent = collisionResponseOption.label;
    dangerousObjectCollisionSelect.appendChild(dangerousOptionElement);
}

for (const foodHitBehaviorOption of FOOD_HIT_BEHAVIOR_OPTIONS) {
    const optionElement = document.createElement('option');
    optionElement.value = foodHitBehaviorOption.value;
    optionElement.textContent = foodHitBehaviorOption.label;
    foodHitBehaviorSelect.appendChild(optionElement);
}

playingTypeSelect.value = PLAYING_TYPES.LAST_MAN_STANDING;
steeringModeSelect.value = STEERING_MODES.CLASSIC;
borderCollisionSelect.value = COLLISION_RESPONSES.GAME_OVER;
dangerousObjectCollisionSelect.value = COLLISION_RESPONSES.GAME_OVER;
foodHitBehaviorSelect.value = FOOD_HIT_BEHAVIORS.MOVE;

const PREFS_KEY = 'monstersAndTreesPrefs';

const savePreferences = () => {
    try {
        const prefs = {
            playerName: nameInput.value,
            steeringMode: steeringModeSelect.value
        };
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
        // localStorage unavailable
    }
};

const loadPreferences = () => {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return;
        const prefs = JSON.parse(raw);
        if (typeof prefs.playerName === 'string') {
            nameInput.value = prefs.playerName;
        }
        if (typeof prefs.steeringMode === 'string' && Object.values(STEERING_MODES).includes(prefs.steeringMode)) {
            steeringModeSelect.value = prefs.steeringMode;
        }
    } catch (e) {
        // localStorage unavailable or invalid JSON
    }
};

loadPreferences();

nameInput.addEventListener('input', savePreferences);
steeringModeSelect.addEventListener('change', savePreferences);

createRow.appendChild(gameNameInput);
createRow.appendChild(createButton);
createRow.appendChild(randomButton);
lobbyPanel.appendChild(newGameSettingsTitle);
lobbyPanel.appendChild(newGameSettingsHint);
lobbyPanel.appendChild(gameTypeLabel);
lobbyPanel.appendChild(playingTypeSelect);
lobbyPanel.appendChild(mapTypeLabel);
lobbyPanel.appendChild(mapTypeSelect);
lobbyPanel.appendChild(mapInfoPanel);
lobbyPanel.appendChild(foodGuidePanel);
lobbyPanel.appendChild(borderCollisionLabel);
lobbyPanel.appendChild(borderCollisionSelect);
lobbyPanel.appendChild(dangerousCollisionLabel);
lobbyPanel.appendChild(dangerousObjectCollisionSelect);
lobbyPanel.appendChild(foodHitBehaviorLabel);
lobbyPanel.appendChild(foodHitBehaviorSelect);
lobbyPanel.appendChild(steeringSettingsTitle);
lobbyPanel.appendChild(steeringSettingsHint);
lobbyPanel.appendChild(steeringModeLabel);
lobbyPanel.appendChild(steeringModeSelect);
lobbyPanel.appendChild(createRow);

const listTitle = document.createElement('h3');
listTitle.className = 'section-title';
listTitle.textContent = 'Active games';
lobbyPanel.appendChild(listTitle);

const activeGamesList = document.createElement('div');
activeGamesList.className = 'games-list';
lobbyPanel.appendChild(activeGamesList);

const rejoinCurrentGameButton = document.createElement('button');
rejoinCurrentGameButton.className = 'btn btn-primary rejoin-button';
rejoinCurrentGameButton.textContent = 'Rejoin current game';
rejoinCurrentGameButton.style.display = 'none';
lobbyPanel.appendChild(rejoinCurrentGameButton);

const makeAudioUiCallbacks = () => ({
    onConnect: () => { audioRtcClient.joinRoom(); },
    onDisconnect: () => { audioRtcClient.leaveRoom(); },
    onToggleMic: (isMicEnabled) => { audioRtcClient.setMicEnabled(isMicEnabled); },
    onToggleDeafen: (isDeafened) => { audioRtcClient.setDeafened(isDeafened); }
});

const canCreateAudioUi = typeof window.createAudioUi === 'function' && audioRtcClient;

const audioUi = canCreateAudioUi ? window.createAudioUi(makeAudioUiCallbacks()) : null;
const inGameAudioUi = canCreateAudioUi ? window.createAudioUi(makeAudioUiCallbacks()) : null;

if (audioUi) {
    audioUi.setVisible(false);
    lobbyPanel.appendChild(audioUi.element);
}

if (inGameAudioUi) {
    overlay.appendChild(inGameAudioUi.element);
}

if (audioRtcClient) {
    audioRtcClient.setStatusListener((status) => {
        audioUi?.updateStatus(status);
        inGameAudioUi?.updateStatus(status);
    });
}

lobbyOverlay.appendChild(lobbyPanel);
document.body.appendChild(lobbyOverlay);

const getEnteredPlayerName = () => {
    const enteredName = nameInput.value.trim();
    if (!enteredName) {
        return 'Anonymous';
    }

    return enteredName;
};

const updateLobbyControls = () => {
    const canRejoinCurrentGame = Boolean(currentGameId) && (Boolean(currentMatchState?.isEnded) || isInLobbyWhilePlaying);
    rejoinCurrentGameButton.textContent = currentMatchState?.isEnded ? 'Rejoin current game' : 'Re-join';
    rejoinCurrentGameButton.style.display = canRejoinCurrentGame ? 'inline-block' : 'none';

    // Voice is per game, so the lobby copy is only useful once you belong to one.
    audioUi?.setVisible(Boolean(currentGameId));
};

const emitRejoinCurrentGame = () => {
    if (!currentGameId) {
        return;
    }

    if (isInLobbyWhilePlaying && !currentMatchState?.isEnded) {
        isInLobbyWhilePlaying = false;
        isPaused = false;
        canvas.style.display = 'block';
        overlay.style.display = 'block';
        timerOverlay.style.display = 'block';
        lobbyOverlay.style.display = 'none';
        stopMovementLoop();
        startMovementLoop();
        updateLobbyControls();
        requestAnimationFrame(drawScene);
        return;
    }

    if (!currentMatchState?.isEnded) {
        return;
    }

    const playerName = localPlayerName || getEnteredPlayerName();
    socket.emit(GAME_SOCKET_EVENTS.JOIN_GAME, {
        gameId: currentGameId,
        playerName
    });
};

rejoinCurrentGameButton.onclick = () => {
    emitRejoinCurrentGame();
};

const showGameCanvas = () => {
    hasJoinedGame = true;
    isInLobbyWhilePlaying = false;
    applySteeringMode(steeringModeSelect.value);
    activeSteerKeys.clear();
    canvas.style.display = 'block';
    overlay.style.display = 'block';
    timerOverlay.style.display = 'block';
    lobbyOverlay.style.display = 'none';
    updateLobbyControls();
};

const normalizeAngle = (angleInRadians) => {
    const fullTurn = Math.PI * 2;
    return ((angleInRadians % fullTurn) + fullTurn) % fullTurn;
};

const getSnakeHeadCenter = () => {
    const head = snakeStates.mySnake.coordinates[0];
    const headSize = snakeStates.mySnake.width ?? gameRules.snakeSegmentSize;
    return {
        x: head.x + headSize / 2,
        y: head.y + headSize / 2
    };
};

const setSteeringAngleTowardScreenPoint = (screenX, screenY) => {
    if (steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    const headCenter = getSnakeHeadCenter();
    const cameraOffsetX = viewportWidth / 2 - snakeStates.mySnake.coordinates[0].x;
    const cameraOffsetY = viewportHeight / 2 - snakeStates.mySnake.coordinates[0].y;
    const headScreenX = headCenter.x + cameraOffsetX;
    const headScreenY = headCenter.y + cameraOffsetY;

    const diffX = screenX - headScreenX;
    const diffY = screenY - headScreenY;

    if (diffX === 0 && diffY === 0) {
        return;
    }

    steeringAngle = normalizeAngle(Math.atan2(diffY, diffX));
};

const applySteeringRotationFromKeys = () => {
    if (steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    if (activeSteerKeys.has('left') && !activeSteerKeys.has('right')) {
        steeringAngle = normalizeAngle(steeringAngle - TURN_STEP_RADIANS);
    }

    if (activeSteerKeys.has('right') && !activeSteerKeys.has('left')) {
        steeringAngle = normalizeAngle(steeringAngle + TURN_STEP_RADIANS);
    }
};

// Touch steering works like a floating joystick: the point where the finger
// lands becomes the origin, and dragging away from it picks the direction.
const TOUCH_STEER_DEADZONE_PX = 14;
const TOUCH_STEER_MAX_RADIUS_PX = 70;

let touchSteerAnchor = null;

const applyTouchSteerVector = (deltaX, deltaY) => {
    if (Math.hypot(deltaX, deltaY) < TOUCH_STEER_DEADZONE_PX) {
        return;
    }

    if (steeringMode === STEERING_MODES.FREE) {
        steeringAngle = normalizeAngle(Math.atan2(deltaY, deltaX));
        return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        movementDirection = deltaX > 0 ? 'right' : 'left';
        return;
    }

    movementDirection = deltaY > 0 ? 'down' : 'up';
};

const getSteeringLabel = () => STEERING_MODE_LABELS[steeringMode] ?? STEERING_MODE_LABELS[STEERING_MODES.CLASSIC];
const getShortSteeringLabel = () => STEERING_MODE_SHORT_LABELS[steeringMode] ?? STEERING_MODE_SHORT_LABELS[STEERING_MODES.CLASSIC];

const getAngleForDirection = (direction) => {
    if (direction === 'up') {
        return -Math.PI / 2;
    }

    if (direction === 'down') {
        return Math.PI / 2;
    }

    if (direction === 'left') {
        return Math.PI;
    }

    return 0;
};

const getDirectionForAngle = (angleInRadians) => {
    const normalizedAngle = normalizeAngle(angleInRadians);
    const quarterTurn = Math.PI / 2;
    const nearestQuarterTurn = Math.round(normalizedAngle / quarterTurn) % 4;

    if (nearestQuarterTurn === 1) {
        return 'down';
    }

    if (nearestQuarterTurn === 2) {
        return 'left';
    }

    if (nearestQuarterTurn === 3) {
        return 'up';
    }

    return 'right';
};

const applySteeringMode = (nextMode) => {
    const safeMode = nextMode === STEERING_MODES.FREE ? STEERING_MODES.FREE : STEERING_MODES.CLASSIC;
    if (steeringMode === safeMode) {
        return;
    }

    if (safeMode === STEERING_MODES.FREE) {
        steeringAngle = getAngleForDirection(movementDirection);
    } else {
        movementDirection = getDirectionForAngle(steeringAngle);
        activeSteerKeys.clear();
    }

    steeringMode = safeMode;
    steeringModeSelect.value = safeMode;
    updateOverlay();
};

const renderActiveGames = (games) => {
    activeGamesList.innerHTML = '';

    if (!games || games.length === 0) {
        const emptyText = document.createElement('div');
        emptyText.className = 'empty-state';
        emptyText.textContent = 'No active games yet. Create one above!';
        activeGamesList.appendChild(emptyText);
        return;
    }

    for (const game of games) {
        const borderCollisionLabel = game.borderCollisionResponse === COLLISION_RESPONSES.BOUNCE
            ? 'Bounce'
            : 'Game over';
        const dangerousCollisionLabel = game.dangerousObjectCollisionResponse === COLLISION_RESPONSES.BOUNCE
            ? 'Bounce'
            : 'Game over';
        const foodBehaviorLabel = game.foodHitBehavior === FOOD_HIT_BEHAVIORS.REMOVE
            ? 'Remove'
            : 'Move';

        const row = document.createElement('div');
        row.className = 'game-card';

        const gameMeta = document.createElement('div');
        gameMeta.className = 'game-meta';

        const gameTitle = document.createElement('strong');
        gameTitle.textContent = game.name;

        const gameSummary = document.createElement('div');
        gameSummary.textContent = `${getPlayingTypeLabel(game.playingType)} · ${game.mapName ?? 'Map'} · Host: ${game.ownerName} · Players: ${game.playerCount}`;

        const gameLockedRules = document.createElement('div');
        gameLockedRules.textContent = `Border ${borderCollisionLabel} · Dangerous ${dangerousCollisionLabel} · Food ${foodBehaviorLabel}`;

        gameMeta.append(gameTitle, gameSummary, gameLockedRules);

        const actions = document.createElement('div');
        actions.className = 'game-actions';

        const joinButton = document.createElement('button');
        joinButton.className = 'btn btn-primary';
        joinButton.textContent = 'Join';
        joinButton.onclick = () => {
            const playerName = getEnteredPlayerName();
            socket.emit(GAME_SOCKET_EVENTS.JOIN_GAME, {
                gameId: game.id,
                playerName
            });
        };

        actions.appendChild(joinButton);

        const isOwner = game.ownerSocketId === localSocketId;
        if (isOwner) {
            const endButton = document.createElement('button');
            endButton.className = 'btn btn-danger';
            endButton.textContent = 'End';
            endButton.onclick = () => {
                socket.emit(GAME_SOCKET_EVENTS.END_GAME, {
                    gameId: game.id
                });
            };
            actions.appendChild(endButton);
        }

        row.appendChild(gameMeta);
        row.appendChild(actions);
        activeGamesList.appendChild(row);
    }
};

createButton.onclick = () => {
    const playerName = getEnteredPlayerName();
    const gameName = gameNameInput.value.trim();
    const playingType = playingTypeSelect.value;
    const mapType = mapTypeSelect.value;
    const borderCollisionResponse = borderCollisionSelect.value;
    const dangerousObjectCollisionResponse = dangerousObjectCollisionSelect.value;
    const foodHitBehavior = foodHitBehaviorSelect.value;
    socket.emit(GAME_SOCKET_EVENTS.CREATE_GAME, {
        gameName,
        playerName,
        playingType,
        mapType,
        borderCollisionResponse,
        dangerousObjectCollisionResponse,
        foodHitBehavior
    });
};

const getRandomItem = (items) => items[Math.floor(Math.random() * items.length)];

const getRandomGameName = () => {
    const adjectives = ['Swift', 'Wild', 'Spiky', 'Foggy', 'Hungry', 'Sneaky'];
    const nouns = ['Monsters', 'Thorns', 'Forest', 'Snakes', 'Clouds', 'Hunters'];
    const suffix = Math.floor(Math.random() * 1000);
    return `${getRandomItem(adjectives)} ${getRandomItem(nouns)} ${suffix}`;
};

randomButton.onclick = () => {
    const playerName = getEnteredPlayerName();

    if (currentActiveGames.length > 0) {
        const randomGame = getRandomItem(currentActiveGames);
        socket.emit(GAME_SOCKET_EVENTS.JOIN_GAME, {
            gameId: randomGame.id,
            playerName
        });
        return;
    }

    const randomPlayingType = getRandomItem(playingTypeOptions).value;
    const randomMapType = getRandomItem(mapTypeOptions).value;
    const randomBorderCollisionResponse = getRandomItem(COLLISION_RESPONSE_OPTIONS).value;
    const randomDangerousObjectCollisionResponse = getRandomItem(COLLISION_RESPONSE_OPTIONS).value;
    const randomFoodHitBehavior = getRandomItem(FOOD_HIT_BEHAVIOR_OPTIONS).value;

    playingTypeSelect.value = randomPlayingType;
    mapTypeSelect.value = randomMapType;
    updateMapInfoPanel(randomMapType);
    borderCollisionSelect.value = randomBorderCollisionResponse;
    dangerousObjectCollisionSelect.value = randomDangerousObjectCollisionResponse;
    foodHitBehaviorSelect.value = randomFoodHitBehavior;

    socket.emit(GAME_SOCKET_EVENTS.CREATE_GAME, {
        gameName: getRandomGameName(),
        playerName,
        playingType: randomPlayingType,
        mapType: randomMapType,
        borderCollisionResponse: randomBorderCollisionResponse,
        dangerousObjectCollisionResponse: randomDangerousObjectCollisionResponse,
        foodHitBehavior: randomFoodHitBehavior,
        autoJoin: true
    });
};

let gameStartTime = Date.now();
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
let playingTypeConfig = {
    playingType: PLAYING_TYPES.LAST_MAN_STANDING,
    timerDurationSeconds: 60,
    scoreTarget: 1000
};
let currentMatchState = null;
let hasShownMatchEndAlert = false;

const formatDurationAsMinutesSeconds = (durationMs) => {
    const totalSeconds = Math.floor(durationMs / MS_PER_SECOND);
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const resetGameTimer = () => {
    gameStartTime = Date.now();
    hasShownMatchEndAlert = false;
    timerOverlay.textContent = '00:00';
};

const getPlayingTypeLabel = (playingType) => {
    if (playingType === PLAYING_TYPES.TIMER) {
        return 'Most points in time';
    }

    if (playingType === PLAYING_TYPES.FIRST_TO_SCORE) {
        return 'First to score';
    }

    return 'Last man standing';
};

const getPlayingTypeObjectiveText = () => {
    const playingType = currentMatchState?.playingType ?? playingTypeConfig.playingType;

    if (playingType === PLAYING_TYPES.TIMER) {
        const duration = currentMatchState?.timerDurationSeconds ?? playingTypeConfig.timerDurationSeconds;
        return `${duration}s`; 
    }

    if (playingType === PLAYING_TYPES.FIRST_TO_SCORE) {
        const scoreTarget = currentMatchState?.scoreTarget ?? playingTypeConfig.scoreTarget;
        return `Target: ${scoreTarget}`;
    }

    return 'Stay alive';
};

const updateGameTimer = () => {
    if (isGameOver && !(currentMatchState?.playingType === PLAYING_TYPES.TIMER && currentMatchState?.isEnded)) {
        return;
    }

    const activePlayingType = currentMatchState?.playingType ?? playingTypeConfig.playingType;
    if (activePlayingType === PLAYING_TYPES.TIMER) {
        const startedAtMs = currentMatchState?.startedAtMs ?? gameStartTime;
        const durationSeconds = currentMatchState?.timerDurationSeconds ?? playingTypeConfig.timerDurationSeconds;
        const elapsedMs = Date.now() - startedAtMs;
        const remainingMs = Math.max(0, durationSeconds * MS_PER_SECOND - elapsedMs);
        timerOverlay.textContent = formatDurationAsMinutesSeconds(remainingMs);
        return;
    }

    const elapsedMs = Date.now() - gameStartTime;
    timerOverlay.textContent = formatDurationAsMinutesSeconds(elapsedMs);
};

setInterval(updateGameTimer, MS_PER_SECOND);

function countOtherSnakes() {
    return Object.keys(snakeStates).filter((key) => key !== 'mySnake' && key !== localSocketId).length
}

function updateOverlay() {
    if (!hasJoinedGame) {
        return;
    }

    // Player names come from other clients, so build nodes instead of HTML strings.
    const addStatRow = (labelText, valueText) => {
        const statRow = document.createElement('div');
        statRow.className = 'hud-stat';

        const statLabel = document.createElement('span');
        statLabel.className = 'hud-stat-label';
        statLabel.textContent = labelText;

        const statValue = document.createElement('span');
        statValue.className = 'hud-stat-value';
        statValue.textContent = valueText;

        statRow.append(statLabel, statValue);
        overlayContent.appendChild(statRow);
    };

    overlayContent.textContent = '';
    addStatRow('You', localPlayerName);
    addStatRow('Mode', getPlayingTypeLabel(currentMatchState?.playingType ?? playingTypeConfig.playingType));
    addStatRow('Goal', getPlayingTypeObjectiveText());
    addStatRow('Steering', getShortSteeringLabel());

    const playersHeading = document.createElement('div');
    playersHeading.className = 'hud-section-label';
    playersHeading.textContent = `Scoreboard · ${countOtherSnakes()} rivals`;
    overlayContent.appendChild(playersHeading);

    for (const id in snakeStates) {
        const snake = snakeStates[id];

        const playerRow = document.createElement('div');
        playerRow.className = 'hud-player';

        const playerDot = document.createElement('span');
        playerDot.className = 'hud-player-dot';
        playerDot.style.color = snake.color ?? '#ffffff';
        playerDot.style.background = snake.color ?? '#ffffff';

        const playerName = document.createElement('span');
        playerName.className = 'hud-player-name';
        playerName.textContent = snake.name ?? id;

        const playerLength = document.createElement('span');
        playerLength.className = 'hud-player-length';
        playerLength.textContent = `${snake.length} L`;

        playerRow.append(playerDot, playerName, playerLength);
        overlayContent.appendChild(playerRow);
    }

    const canGoToLobby = currentGameId && !isInLobbyWhilePlaying;
    goToLobbyButton.style.display = canGoToLobby ? 'inline-block' : 'none';

}

let lastEmittedHeadCoordinates = { x: 0, y: 0 };

function emitHeadCoordinates(x, y) {
    if (!hasJoinedGame || !currentGameId) {
        return;
    }

    if (lastEmittedHeadCoordinates.x === x && lastEmittedHeadCoordinates.y === y) {
        return;
    }

    socket.emit(GAME_SOCKET_EVENTS.SEND_COORDINATES_OF_HEAD, {
        x,
        y
    });
    lastEmittedHeadCoordinates = { x, y };
}

socket.on(GAME_SOCKET_EVENTS.CONNECT, () => {
    localSocketId = socket.id;
    socket.emit(GAME_SOCKET_EVENTS.LIST_ACTIVE_GAMES);
});

let currentActiveGames = [];

socket.on(GAME_SOCKET_EVENTS.ACTIVE_GAMES_UPDATED, (games) => {
    currentActiveGames = games ?? [];
    renderActiveGames(games);
});

socket.on(GAME_SOCKET_EVENTS.JOINED_GAME, ({ gameId, playerName, playingType }) => {
    if (currentGameId && currentGameId !== gameId) {
        audioRtcClient?.handleGameLeft();
    }

    currentGameId = gameId;
    localPlayerName = playerName;
    if (playingType) {
        playingTypeConfig = {
            ...playingTypeConfig,
            playingType
        };
    }
    snakeStates.mySnake.name = localPlayerName;
    isGameOver = false;
    isEaten = false;
    spectatingBanner.style.display = 'none';
    isPaused = false;
    showGameCanvas();
    resetGameTimer();
    drawScene();
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.JOIN_GAME_ERROR, (message) => {
    alert(message || 'Could not join game');
});

socket.on(GAME_SOCKET_EVENTS.GAME_ENDED, ({ gameId, gameName }) => {
    if (currentGameId !== gameId) {
        return;
    }

    audioRtcClient?.handleGameLeft();
    currentGameId = null;
    hasJoinedGame = false;
    isGameOver = true;
    isEaten = false;
    spectatingBanner.style.display = 'none';
    isInLobbyWhilePlaying = false;
    canvas.style.display = 'none';
    overlay.style.display = 'none';
    timerOverlay.style.display = 'none';
    lobbyOverlay.style.display = 'flex';
    updateLobbyControls();
    alert(`Game "${gameName}" was ended by the owner.`);
    socket.emit(GAME_SOCKET_EVENTS.LIST_ACTIVE_GAMES);
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_COORDINATES_OF_HEAD, (headCoordinatesUpdate) => {
    const { id: snakeId, coordinatesOfHead } = headCoordinatesUpdate;
    upsertSnakeById(snakeId, { x: coordinatesOfHead.x, y: coordinatesOfHead.y }, headCoordinatesUpdate.l, headCoordinatesUpdate.score, headCoordinatesUpdate.w);

    drawScene();
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.ASSIGN_COLOR, (color) => {
    localSnakeColor = color;
    snakeStates.mySnake.color = color;
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.ASSIGN_HEAD_EMOJI, (headEmoji) => {
    if (typeof headEmoji !== 'string' || !headEmoji.trim()) {
        return;
    }

    localSnakeHeadEmoji = headEmoji;
    snakeStates.mySnake.headEmoji = headEmoji;
    drawScene();
    updateOverlay();
});

socket.on(GAME_SOCKET_EVENTS.SET_WORLD_OBJECT_DEFINITIONS, (objectDefinitions) => {
    worldObjectDefinitions = {
        ...worldObjectDefinitions,
        ...objectDefinitions
    };
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_WORLD_OBJECTS, (nextWorldObjects) => {
    worldObjects = nextWorldObjects;
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_FROZEN_SNAKES, (nextFrozenSnakeCorpses) => {
    frozenSnakeCorpses = nextFrozenSnakeCorpses;
    drawScene();
});

const applyMovementConfig = (movementConfig) => {
    const {
        baseStep: configuredBaseStep,
        ticksPerSecond: configuredTicksPerSecond,
        boostMultiplier: configuredBoostMultiplier,
        maxEnergy: configuredMaxEnergy,
        boostDrainPerSecond: configuredBoostDrain,
        minEnergyToStartBoost: configuredMinEnergyToStartBoost
    } = movementConfig;

    if (typeof configuredBaseStep === 'number' && configuredBaseStep > 0) {
        baseStep = configuredBaseStep;
    }

    if (typeof configuredTicksPerSecond === 'number' && configuredTicksPerSecond > 0) {
        ticksPerSecond = configuredTicksPerSecond;
    }

    if (typeof configuredBoostMultiplier === 'number' && configuredBoostMultiplier > 0) {
        boostMultiplier = configuredBoostMultiplier;
    }

    if (typeof configuredMaxEnergy === 'number' && configuredMaxEnergy > 0) {
        maxEnergy = configuredMaxEnergy;
    }

    if (typeof configuredBoostDrain === 'number' && configuredBoostDrain > 0) {
        boostDrainPerSecond = configuredBoostDrain;
    }

    if (typeof configuredMinEnergyToStartBoost === 'number' && configuredMinEnergyToStartBoost >= 0) {
        minEnergyToStartBoost = configuredMinEnergyToStartBoost;
    }

    updateIntervalMs = 1000 / ticksPerSecond;
    hasMovementConfig = true;
    refreshBoostState();

    if (!isPaused) {
        stopMovementLoop();
        startMovementLoop();
    }
};

socket.on(GAME_SOCKET_EVENTS.SET_MOVEMENT_CONFIG, (movementConfig) => {
    applyMovementConfig(movementConfig);
});

socket.on(GAME_SOCKET_EVENTS.ENERGY_UPDATE, (energyUpdate) => {
    if (typeof energyUpdate?.energy === 'number') {
        currentEnergy = energyUpdate.energy;
    }

    if (typeof energyUpdate?.maxEnergy === 'number' && energyUpdate.maxEnergy > 0) {
        maxEnergy = energyUpdate.maxEnergy;
    }

    refreshBoostState();
});

socket.on(GAME_SOCKET_EVENTS.SET_PLAYING_TYPE, (playingTypeConfigFromServer) => {
    playingTypeConfig = {
        ...playingTypeConfig,
        ...playingTypeConfigFromServer
    };
    updateOverlay();
    updateGameTimer();
});

socket.on(GAME_SOCKET_EVENTS.MATCH_STATE_UPDATE, (matchState) => {
    currentMatchState = {
        ...matchState,
        playingType: playingTypeConfig.playingType
    };

    if (typeof matchState?.startedAtMs === 'number') {
        gameStartTime = matchState.startedAtMs;
    }

    if (matchState?.isEnded) {
        isGameOver = true;
        isEaten = false;
        spectatingBanner.style.display = 'none';
        isInLobbyWhilePlaying = false;
        lobbyOverlay.style.display = 'flex';
        if (!hasShownMatchEndAlert) {
            if (matchState.winnerId) {
                const winnerLabel = matchState.winnerId === localSocketId
                    ? 'You'
                    : (matchState.winnerName || matchState.winnerId);
                alert(`Game Over! Winner: ${winnerLabel}`);
            } else {
                alert('Game Over! No single winner this round.');
            }
            hasShownMatchEndAlert = true;
        }
    } else {
        hasShownMatchEndAlert = false;
    }

    updateLobbyControls();
    updateOverlay();
    updateGameTimer();
});

const applyGameRules = (rulesConfig) => {
    gameRules = {
        ...gameRules,
        ...rulesConfig
    };
};

socket.on(GAME_SOCKET_EVENTS.SET_GAME_RULES, (rulesConfig) => {
    applyGameRules(rulesConfig);
});

socket.on(GAME_SOCKET_EVENTS.SET_VIRTUAL_DIMENSIONS, (virtualDimensions) => {
    boardWidth = virtualDimensions.virtualWidth;
    boardHeight = virtualDimensions.virtualHeight;
    if (virtualDimensions.mapType) {
        currentMapType = virtualDimensions.mapType;
    }
    updateMapTexture(currentMapType);
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.SET_START_POSITION, (position) => {
    isGameOver = false;
    isEaten = false;
    spectatingBanner.style.display = 'none';
    hasShownMatchEndAlert = false;
    snakeStates.mySnake.coordinates[0].x = position.x;
    snakeStates.mySnake.coordinates[0].y = position.y;
    resetGameTimer();
    updateLobbyControls();
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.TELEPORTED, (position) => {
    if (typeof position?.x !== 'number' || typeof position?.y !== 'number') {
        return;
    }

    // The body collapses onto the exit so it does not stretch back to the portal.
    snakeStates.mySnake.coordinates = snakeStates.mySnake.coordinates.map(() => ({
        x: position.x,
        y: position.y
    }));
    drawScene();
});

socket.on(GAME_SOCKET_EVENTS.YOU_WERE_EATEN, () => {
    if (isGameOver || isEaten) {
        return;
    }

    isEaten = true;
    spectatingBanner.textContent = 'Game over';
    spectatingBanner.style.display = 'block';
});

socket.on(GAME_SOCKET_EVENTS.UPDATE_USERS, (usersById) => {
    for (const snakeId in snakeStates) {
        if (snakeId === 'mySnake') {
            continue;
        }

        if (!usersById[snakeId]) {
            delete snakeStates[snakeId];
        }
    }

    for (const snakeId in usersById) {
        const userState = usersById[snakeId];

        if (snakeId === localSocketId) {
            snakeStates.mySnake.length = userState.l ?? snakeStates.mySnake.length;
            snakeStates.mySnake.width = userState.w ?? snakeStates.mySnake.width;
            snakeStates.mySnake.score = userState.score ?? snakeStates.mySnake.score;
            snakeStates.mySnake.name = userState.name ?? snakeStates.mySnake.name;
            snakeStates.mySnake.color = userState.color ?? snakeStates.mySnake.color;
            snakeStates.mySnake.headEmoji = userState.headEmoji ?? snakeStates.mySnake.headEmoji;
            ensureSnakeCoordinateCountMatchesLength(snakeStates.mySnake);
            continue;
        }

        upsertSnakeById(snakeId, userState.coordinates, userState.l, userState.score, userState.w);
        setSnakeColorById(snakeId, userState.color);
        if (snakeStates[snakeId]) {
            snakeStates[snakeId].name = userState.name ?? snakeStates[snakeId].name;
            snakeStates[snakeId].headEmoji = userState.headEmoji ?? snakeStates[snakeId].headEmoji;
        }
    }

    for (const eatenSnakeId of eatenSnakeIds) {
        if (!usersById[eatenSnakeId]) {
            eatenSnakeIds.delete(eatenSnakeId);
        }
    }

    updateOverlay();
});

socket.on('disconnect', () => {
    audioRtcClient?.handleGameLeft();
});


function drawTrees() {
    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        if (worldObject.type !== OBJECT_TYPE_TREE) {
            continue;
        }

        const worldObjectDefinition = worldObjectDefinitions[worldObject.type];
        if (!worldObjectDefinition) {
            continue;
        }

        if (treeImage.complete) {
            ctx.drawImage(treeImage, worldObject.x, worldObject.y, worldObjectDefinition.size, worldObjectDefinition.size);
        }
    }
}

function drawSnake(snake) {
    ctx.fillStyle = snake.color;
    const baseSegmentSize = snake.width ?? gameRules.snakeSegmentSize;
    const headSize = baseSegmentSize * gameRules.snakeHeadSizeMultiplier;
    const headOffset = (headSize - baseSegmentSize) / 2;
    const headCoordinate = snake.coordinates[0];
    const neckCoordinate = snake.coordinates[1] ?? headCoordinate;
    let neckDirectionX = neckCoordinate.x - headCoordinate.x;
    let neckDirectionY = neckCoordinate.y - headCoordinate.y;

    if (neckDirectionX === 0 && neckDirectionY === 0) {
        neckDirectionY = baseSegmentSize;
    }

    const neckDirectionLength = Math.hypot(neckDirectionX, neckDirectionY) || 1;
    const normalizedNeckDirectionX = neckDirectionX / neckDirectionLength;
    const normalizedNeckDirectionY = neckDirectionY / neckDirectionLength;
    const headForwardOffset = baseSegmentSize * 0.8;


    snake.coordinates.forEach((coordinate, index) => {
        const segmentSize = index === 0
            ? headSize
            : baseSegmentSize;

        const segmentOffset = index === 0 ? headOffset : 0;

        if (index === 0) {
            const headCenterX = coordinate.x + baseSegmentSize / 2 - normalizedNeckDirectionX * headForwardOffset;
            const headCenterY = coordinate.y + baseSegmentSize / 2 - normalizedNeckDirectionY * headForwardOffset;
            const headingAngle = Math.atan2(-normalizedNeckDirectionY, -normalizedNeckDirectionX);

            ctx.save();
            ctx.translate(headCenterX, headCenterY);
            ctx.rotate(headingAngle + Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${Math.max(32, Math.round(segmentSize * 2))}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            ctx.fillText(snake.headEmoji ?? '🐍', 0, 0);
            ctx.restore();
            return;
        }

        ctx.fillRect(coordinate.x - segmentOffset, coordinate.y - segmentOffset, segmentSize, segmentSize);
    });

}

function notifyOfHitWorldObject(worldObjectId) {
    socket.emit(GAME_SOCKET_EVENTS.WORLD_OBJECT_HIT, worldObjectId);
}

function drawFrozenSnakeCorpses() {
    for (const corpseId in frozenSnakeCorpses) {
        const corpse = frozenSnakeCorpses[corpseId];
        const segWidth = corpse.width ?? gameRules.snakeSegmentSize;
        ctx.fillStyle = corpse.color ?? '#888888';
        for (const segment of corpse.segments) {
            ctx.fillRect(segment.x, segment.y, segWidth, segWidth);
        }
    }
}

const EMOJI_FONT_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const FOOD_QUALITY = window.FOOD_QUALITIES;
const FOOD_QUALITY_HALO_COLORS = {
    [FOOD_QUALITY.AIP]: 'rgba(127, 240, 107, 0.55)',
    [FOOD_QUALITY.UNHEALTHY]: 'rgba(255, 90, 90, 0.5)'
};
const foodEmojiSpriteCache = new Map();

const getFoodEmojiForWorldObject = (worldObject) => {
    if (typeof worldObject.emoji === 'string' && worldObject.emoji) {
        return worldObject.emoji;
    }

    const emojisByQuality = window.FOOD_EMOJIS_BY_TYPE_AND_QUALITY?.[worldObject.type];
    return emojisByQuality?.[FOOD_QUALITY.HEALTHY]?.[0] ?? null;
};

// Emoji glyphs are expensive to rasterize, so each size/emoji/quality trio is drawn once.
const getFoodEmojiSprite = (emoji, size, quality) => {
    const spriteSize = Math.max(1, Math.round(size));
    const haloColor = FOOD_QUALITY_HALO_COLORS[quality];
    const padding = haloColor ? Math.round(spriteSize * 0.35) : 0;
    const canvasSize = spriteSize + padding * 2;
    const cacheKey = `${emoji}@${spriteSize}@${quality ?? 'none'}`;
    const cachedSprite = foodEmojiSpriteCache.get(cacheKey);

    if (cachedSprite) {
        return cachedSprite;
    }

    const sprite = document.createElement('canvas');
    sprite.width = canvasSize;
    sprite.height = canvasSize;

    const spriteContext = sprite.getContext('2d');
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;

    if (haloColor) {
        const halo = spriteContext.createRadialGradient(centerX, centerY, spriteSize * 0.2, centerX, centerY, canvasSize / 2);
        halo.addColorStop(0, haloColor);
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        spriteContext.fillStyle = halo;
        spriteContext.beginPath();
        spriteContext.arc(centerX, centerY, canvasSize / 2, 0, Math.PI * 2);
        spriteContext.fill();
    }

    spriteContext.fillStyle = 'black'; // Reset fillStyle before drawing text to avoid gradient bleeding
    spriteContext.font = `${Math.round(spriteSize * 0.9)}px ${EMOJI_FONT_STACK}`;
    spriteContext.textAlign = 'center';
    spriteContext.textBaseline = 'middle';
    spriteContext.fillText(emoji, centerX, centerY);

    sprite.drawOffset = padding;
    foodEmojiSpriteCache.set(cacheKey, sprite);
    return sprite;
};

function drawPortalSwirl(worldObject, size) {
    const radius = size / 2;
    const centerX = worldObject.x + radius;
    const centerY = worldObject.y + radius;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((performance.now() / 700) % (Math.PI * 2));

    const glow = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    glow.addColorStop(0, 'rgba(224, 213, 255, 0.95)');
    glow.addColorStop(0.55, 'rgba(124, 58, 237, 0.6)');
    glow.addColorStop(1, 'rgba(46, 16, 101, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(240, 232, 255, 0.9)';
    ctx.lineWidth = Math.max(1.5, radius * 0.12);
    ctx.lineCap = 'round';

    const armCount = 2;
    const stepsPerArm = 36;
    for (let arm = 0; arm < armCount; arm++) {
        ctx.beginPath();
        for (let step = 0; step <= stepsPerArm; step++) {
            const progress = step / stepsPerArm;
            const angle = (arm / armCount) * Math.PI * 2 + progress * Math.PI * 2.2;
            const spiralRadius = radius * (0.12 + progress * 0.82);
            const x = Math.cos(angle) * spiralRadius;
            const y = Math.sin(angle) * spiralRadius;

            if (step === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    ctx.restore();
}

function drawWorldObjects() {
    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        const worldObjectDefinition = worldObjectDefinitions[worldObject.type];

        if (!worldObjectDefinition) {
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_TREE) {
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_PORTAL) {
            drawPortalSwirl(worldObject, worldObjectDefinition.size);
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_THORN) {
            ctx.fillStyle = '#C62828';
            ctx.fillRect(worldObject.x, worldObject.y, worldObjectDefinition.size, worldObjectDefinition.size);
            continue;
        }

        const foodEmoji = getFoodEmojiForWorldObject(worldObject);
        if (foodEmoji) {
            const sprite = getFoodEmojiSprite(foodEmoji, worldObjectDefinition.size, worldObject.quality);
            const drawOffset = sprite.drawOffset ?? 0;
            ctx.drawImage(sprite, worldObject.x - drawOffset, worldObject.y - drawOffset);
        }
    }
}

const getWorldObjectHitbox = (worldObject, worldObjectDefinition) => {
    const maxInset = Math.max(0, Math.floor((worldObjectDefinition.size - 1) / 2));
    const objectInset = Math.max(0, Math.min(worldObjectDefinition.collisionInset ?? 0, maxInset));

    return {
        x: worldObject.x + objectInset,
        y: worldObject.y + objectInset,
        width: worldObjectDefinition.size - objectInset * 2,
        height: worldObjectDefinition.size - objectInset * 2
    };
};

const MINIMAP_MAX_SIZE = 150;
const MINIMAP_MARGIN = 12;

function drawMinimap() {
    if (!boardWidth || !boardHeight) {
        return;
    }

    const scale = MINIMAP_MAX_SIZE / Math.max(boardWidth, boardHeight);
    const minimapWidth = boardWidth * scale;
    const minimapHeight = boardHeight * scale;
    const originX = MINIMAP_MARGIN;
    const originY = viewportHeight - minimapHeight - MINIMAP_MARGIN;

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(originX, originY, minimapWidth, minimapHeight);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(originX, originY, minimapWidth, minimapHeight);

    for (const worldObjectId in worldObjects) {
        const worldObject = worldObjects[worldObjectId];
        const worldObjectDefinition = worldObjectDefinitions[worldObject.type];

        if (!worldObjectDefinition) {
            continue;
        }

        if (worldObject.type === OBJECT_TYPE_PORTAL) {
            ctx.fillStyle = '#a855f7';
            ctx.fillRect(originX + worldObject.x * scale - 1, originY + worldObject.y * scale - 1, 3.5, 3.5);
            continue;
        }

        ctx.fillStyle = worldObjectDefinition.effects.instantLose ? '#ef4444' : '#facc15';
        ctx.fillRect(originX + worldObject.x * scale, originY + worldObject.y * scale, 1.5, 1.5);
    }

    for (const snakeId in snakeStates) {
        if (snakeId === 'mySnake') {
            continue;
        }

        const otherHead = snakeStates[snakeId].coordinates[0];
        if (!otherHead) {
            continue;
        }

        ctx.fillStyle = snakeStates[snakeId].color ?? '#ffffff';
        ctx.fillRect(originX + otherHead.x * scale - 1.5, originY + otherHead.y * scale - 1.5, 3, 3);
    }

    const myHead = snakeStates.mySnake.coordinates[0];
    if (myHead) {
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(originX + myHead.x * scale - 2, originY + myHead.y * scale - 2, 4, 4);
    }

    ctx.restore();
}

function drawBackground() {
    const map = MAPS[currentMapType];
    if (map) {
        map.drawBackground(ctx, boardWidth, boardHeight);
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, boardWidth, boardHeight);
    }

    if (mapTexturePattern) {
        ctx.fillStyle = mapTexturePattern;
        ctx.fillRect(0, 0, boardWidth, boardHeight);
    }

    if (map?.drawAmbient && ambientElements) {
        map.drawAmbient(ctx, boardWidth, boardHeight, performance.now(), ambientElements);
    }
}

function drawScene() {
    if (!hasJoinedGame) {
        return;
    }

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.save();

    ctx.translate(viewportWidth / 2 - snakeStates.mySnake.coordinates[0].x, viewportHeight / 2 - snakeStates.mySnake.coordinates[0].y);

    drawBackground();

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, boardWidth, boardHeight);

    drawTrees();
    drawWorldObjects();
    drawFrozenSnakeCorpses();

    drawSnake(snakeStates.mySnake);

    for (const id in snakeStates) {
        const user = snakeStates[id];

        drawSnake(user)
    }

    ctx.restore();

    drawMinimap();
}

let movementIntervalId;

const startMovementLoop = () => {
    if (!hasMovementConfig) {
        return;
    }
    movementIntervalId = setInterval(updatePosition, updateIntervalMs);
}

const stopMovementLoop = () => {
    clearInterval(movementIntervalId);
}

startMovementLoop();

steeringModeSelect.addEventListener('change', () => {
    applySteeringMode(steeringModeSelect.value);
});

window.addEventListener('keydown', (event) => {
    if (!hasJoinedGame) {
        return;
    }

    if ((isGameOver || isEaten) && event.key === 'Enter') {
        event.preventDefault();
        if (lobbyOverlay.style.display !== 'flex') {
            openLobbyWhilePlaying();
        }
        return;
    }

    if (!isGameOver && !isEaten) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') {
            event.preventDefault();
        }

        switch (event.key) {
            case 'ArrowUp':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'up';
                }
                break;
            case 'ArrowDown':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'down';
                }
                break;
            case 'ArrowLeft':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'left';
                } else {
                    activeSteerKeys.add('left');
                }
                break;
            case 'ArrowRight':
                if (steeringMode === STEERING_MODES.CLASSIC) {
                    movementDirection = 'right';
                } else {
                    activeSteerKeys.add('right');
                }
                break;
            case 'a':
            case 'A':
                if (steeringMode === STEERING_MODES.FREE) {
                    activeSteerKeys.add('left');
                }
                break;
            case 'd':
            case 'D':
                if (steeringMode === STEERING_MODES.FREE) {
                    activeSteerKeys.add('right');
                }
                break;
            case ' ':
                isPaused = !isPaused;
                isPaused ? stopMovementLoop() : startMovementLoop();
                break;
            case 'b':
            case 'B':
            case 'Shift':
                setBoostHeld(true);
                break;
            case 'm':
            case 'M':
                applySteeringMode(
                    steeringMode === STEERING_MODES.FREE
                        ? STEERING_MODES.CLASSIC
                        : STEERING_MODES.FREE
                );
                break;
            case 'o':
                overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
                break;
        }
    }

    requestAnimationFrame(drawScene);
});

window.addEventListener('keyup', (event) => {
    if (event.key === 'b' || event.key === 'B' || event.key === 'Shift') {
        setBoostHeld(false);
    }

    if (steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            activeSteerKeys.delete('left');
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            activeSteerKeys.delete('right');
            break;
    }
});

const eatenSnakeIds = new Set();
const sendSnakeEaten = (victimId) => socket.emit(GAME_SOCKET_EVENTS.SNAKE_EATEN, { victimId });

const getOppositeDirection = (direction) => {
    switch (direction) {
        case 'up':
            return 'down';
        case 'down':
            return 'up';
        case 'left':
            return 'right';
        case 'right':
            return 'left';
        default:
            return direction;
    }
};

const applyDirectionToPosition = (originX, originY, direction, step) => {
    let nextX = originX;
    let nextY = originY;

    switch (direction) {
        case 'up':
            nextY -= step;
            break;
        case 'down':
            nextY += step;
            break;
        case 'left':
            nextX -= step;
            break;
        case 'right':
            nextX += step;
            break;
    }

    return { nextX, nextY };
};

const applySteeringAngleToPosition = (originX, originY, angleInRadians, step) => {
    return {
        nextX: originX + Math.cos(angleInRadians) * step,
        nextY: originY + Math.sin(angleInRadians) * step
    };
};

const reverseMovementDirection = () => {
    if (steeringMode === STEERING_MODES.FREE) {
        steeringAngle = normalizeAngle(steeringAngle + Math.PI);
        return;
    }

    movementDirection = getOppositeDirection(movementDirection);
};

// A tap is a short touch that barely moves; two in quick succession latch boost.
const TAP_MAX_DURATION_MS = 250;
const TAP_MAX_MOVE_PX = 16;
const DOUBLE_TAP_MAX_GAP_MS = 320;
const DOUBLE_TAP_MAX_DISTANCE_PX = 60;

let touchStartedAtMs = 0;
let touchStartPosition = null;
let hasTouchMovedTooFar = false;
let lastTapAtMs = 0;
let lastTapPosition = null;

canvas.addEventListener('touchstart', (event) => {
    if (!hasJoinedGame || isGameOver || isEaten) {
        return;
    }

    event.preventDefault();

    const touch = event.touches[0];
    if (!touch) {
        return;
    }

    touchSteerAnchor = { x: touch.clientX, y: touch.clientY };
    touchStartedAtMs = Date.now();
    touchStartPosition = { x: touch.clientX, y: touch.clientY };
    hasTouchMovedTooFar = false;

    requestAnimationFrame(drawScene);
}, { passive: false });

canvas.addEventListener('touchmove', (event) => {
    if (!hasJoinedGame || isGameOver || isEaten || !touchSteerAnchor) {
        return;
    }

    event.preventDefault();

    const touch = event.touches[0];
    if (!touch) {
        return;
    }

    if (touchStartPosition && Math.hypot(touch.clientX - touchStartPosition.x, touch.clientY - touchStartPosition.y) > TAP_MAX_MOVE_PX) {
        hasTouchMovedTooFar = true;
    }

    let deltaX = touch.clientX - touchSteerAnchor.x;
    let deltaY = touch.clientY - touchSteerAnchor.y;
    const distance = Math.hypot(deltaX, deltaY);

    // Let the anchor trail the finger so turning back stays responsive.
    if (distance > TOUCH_STEER_MAX_RADIUS_PX) {
        const pullIn = (distance - TOUCH_STEER_MAX_RADIUS_PX) / distance;
        touchSteerAnchor.x += deltaX * pullIn;
        touchSteerAnchor.y += deltaY * pullIn;
        deltaX = touch.clientX - touchSteerAnchor.x;
        deltaY = touch.clientY - touchSteerAnchor.y;
    }

    applyTouchSteerVector(deltaX, deltaY);

    requestAnimationFrame(drawScene);
}, { passive: false });

const registerTapForBoost = (endPosition) => {
    const now = Date.now();
    const wasTap = !hasTouchMovedTooFar
        && touchStartPosition
        && (now - touchStartedAtMs) <= TAP_MAX_DURATION_MS;

    if (!wasTap) {
        lastTapAtMs = 0;
        lastTapPosition = null;
        return;
    }

    const isDoubleTap = lastTapPosition
        && (now - lastTapAtMs) <= DOUBLE_TAP_MAX_GAP_MS
        && Math.hypot(endPosition.x - lastTapPosition.x, endPosition.y - lastTapPosition.y) <= DOUBLE_TAP_MAX_DISTANCE_PX;

    if (isDoubleTap) {
        toggleBoostLatch();
        lastTapAtMs = 0;
        lastTapPosition = null;
        return;
    }

    lastTapAtMs = now;
    lastTapPosition = endPosition;
};

const endTouchSteering = (event) => {
    touchSteerAnchor = null;

    const touch = event?.changedTouches?.[0];
    if (touch && hasJoinedGame && !isGameOver && !isEaten) {
        registerTapForBoost({ x: touch.clientX, y: touch.clientY });
    }

    touchStartPosition = null;
};

canvas.addEventListener('touchend', endTouchSteering);
canvas.addEventListener('touchcancel', endTouchSteering);

canvas.addEventListener('dblclick', (event) => {
    if (!hasJoinedGame || isGameOver || isEaten) {
        return;
    }

    event.preventDefault();
    toggleBoostLatch();
});

canvas.addEventListener('mousemove', (event) => {
    if (!hasJoinedGame || isGameOver || isEaten || steeringMode !== STEERING_MODES.FREE) {
        return;
    }

    setSteeringAngleTowardScreenPoint(event.clientX, event.clientY);
});

function updatePosition() {
    if (!hasJoinedGame || !currentGameId) {
        return;
    }

    let nextX;
    let nextY;
    let hasBounced = false;

    nextX = snakeStates.mySnake.coordinates[0].x;
    nextY = snakeStates.mySnake.coordinates[0].y;

    if (!isPaused && !isGameOver && !isEaten) {
        if (isBoosting) {
            // Predict the drain locally; the server correction arrives via energyUpdate.
            currentEnergy = Math.max(0, currentEnergy - boostDrainPerSecond * (updateIntervalMs / 1000));
            refreshBoostState();
        }

        applySteeringRotationFromKeys();

        const movedPosition = steeringMode === STEERING_MODES.FREE
            ? applySteeringAngleToPosition(nextX, nextY, steeringAngle, movementStep)
            : applyDirectionToPosition(nextX, nextY, movementDirection, movementStep);
        nextX = movedPosition.nextX;
        nextY = movedPosition.nextY;

        if (gameRules.worldObjectsEnabled) {
            const currentSnakeWidth = snakeStates.mySnake.width ?? gameRules.snakeSegmentSize;
            const snakeHitbox = {
                x: nextX,
                y: nextY,
                width: currentSnakeWidth,
                height: currentSnakeWidth
            };
            const headPickupHitbox = window.getHeadPickupHitbox(
                { x: nextX, y: nextY },
                currentSnakeWidth,
                gameRules.snakeHeadSizeMultiplier
            );

            for (const worldObjectId in worldObjects) {
                const worldObject = worldObjects[worldObjectId];
                const worldObjectDefinition = worldObjectDefinitions[worldObject.type];

                if (!worldObjectDefinition) {
                    continue;
                }

                const isDangerousObject = worldObjectDefinition.effects.instantLose;
                const worldObjectHitbox = getWorldObjectHitbox(worldObject, worldObjectDefinition);
                const collisionHitbox = isDangerousObject ? snakeHitbox : headPickupHitbox;
                if (!rectanglesOverlap(collisionHitbox, worldObjectHitbox)) {
                    continue;
                }

                if (isDangerousObject) {
                    const dangerousObjectCollisionEndsGame =
                        gameRules.dangerousObjectCollisionResponse === COLLISION_RESPONSES.BOUNCE
                            ? false
                            : true;

                    if (dangerousObjectCollisionEndsGame) {
                        socket.emit(GAME_SOCKET_EVENTS.PLAYER_SELF_DESTRUCTED);
                        isEaten = true;
                        spectatingBanner.textContent = 'Game over';
                        spectatingBanner.style.display = 'block';
                        return;
                    }

                    reverseMovementDirection();
                    const bouncedPosition = steeringMode === STEERING_MODES.FREE
                        ? applySteeringAngleToPosition(
                            snakeStates.mySnake.coordinates[0].x,
                            snakeStates.mySnake.coordinates[0].y,
                            steeringAngle,
                            movementStep
                        )
                        : applyDirectionToPosition(
                        snakeStates.mySnake.coordinates[0].x,
                        snakeStates.mySnake.coordinates[0].y,
                        movementDirection,
                        movementStep
                    );
                    nextX = bouncedPosition.nextX;
                    nextY = bouncedPosition.nextY;
                    hasBounced = true;
                    break;
                }

                // The server validates the hit against our reported position, so send it first.
                emitHeadCoordinates(nextX, nextY);
                notifyOfHitWorldObject(worldObjectId);
                showLastMeal(worldObject);

                if (!worldObjectDefinition.removeOnHit) {
                    continue;
                }
            }
        }

        if (gameRules.playerCollisionEndsGame) {
            let collidedSnakeId = null;
            const myLength = snakeStates.mySnake.length;
            const myWidthAfterMove = snakeStates.mySnake.width ?? gameRules.snakeSegmentSize;
            const mySnakeHitbox = {
                x: nextX,
                y: nextY,
                width: myWidthAfterMove,
                height: myWidthAfterMove
            };

            for (const id in snakeStates) {
                if (id === 'mySnake') {
                    continue;
                }

                if (eatenSnakeIds.has(id)) {
                    continue;
                }

                const otherSnake = snakeStates[id];
                const otherLength = otherSnake.length ?? INITIAL_USER_LENGTH;

                for (let i = 0; i < otherSnake.coordinates.length; i++) {
                    const coordinate = otherSnake.coordinates[i];
                    const otherWidth = otherSnake.width ?? gameRules.playerCollisionSize;
                    const otherSegmentHitbox = {
                        x: coordinate.x,
                        y: coordinate.y,
                        width: otherWidth,
                        height: otherWidth
                    };

                    if (rectanglesOverlap(mySnakeHitbox, otherSegmentHitbox)) {
                        collidedSnakeId = id;

                        if (myLength > otherLength) {
                            eatenSnakeIds.add(id);
                            sendSnakeEaten(id);
                        } else {
                            reverseMovementDirection();
                            const bouncedPosition = steeringMode === STEERING_MODES.FREE
                                ? applySteeringAngleToPosition(
                                    snakeStates.mySnake.coordinates[0].x,
                                    snakeStates.mySnake.coordinates[0].y,
                                    steeringAngle,
                                    movementStep
                                )
                                : applyDirectionToPosition(
                                snakeStates.mySnake.coordinates[0].x,
                                snakeStates.mySnake.coordinates[0].y,
                                movementDirection,
                                movementStep
                            );
                            nextX = bouncedPosition.nextX;
                            nextY = bouncedPosition.nextY;
                            hasBounced = true;
                        }
                        break;
                    }
                }

                if (collidedSnakeId) {
                    break;
                }
            }
        }

        const hasBorderCollision =
            nextX - SPHERE_RADIUS < 0 || nextX + SPHERE_RADIUS > boardWidth ||
            nextY - SPHERE_RADIUS < 0 || nextY + SPHERE_RADIUS > boardHeight;

        if (hasBorderCollision) {
            const borderCollisionEndsGame = gameRules.borderCollisionResponse === COLLISION_RESPONSES.BOUNCE
                ? false
                : gameRules.borderCollisionEndsGame !== false;

            if (borderCollisionEndsGame) {
                socket.emit(GAME_SOCKET_EVENTS.PLAYER_SELF_DESTRUCTED);
                isEaten = true;
                spectatingBanner.textContent = 'Game over';
                spectatingBanner.style.display = 'block';
                return;
            }

            reverseMovementDirection();
            const bouncedPosition = steeringMode === STEERING_MODES.FREE
                ? applySteeringAngleToPosition(
                    snakeStates.mySnake.coordinates[0].x,
                    snakeStates.mySnake.coordinates[0].y,
                    steeringAngle,
                    movementStep
                )
                : applyDirectionToPosition(
                snakeStates.mySnake.coordinates[0].x,
                snakeStates.mySnake.coordinates[0].y,
                movementDirection,
                movementStep
            );
            nextX = bouncedPosition.nextX;
            nextY = bouncedPosition.nextY;
            hasBounced = true;
        }

        if (hasBounced) {
            nextX = Math.max(0, Math.min(nextX, boardWidth - (snakeStates.mySnake.width ?? gameRules.snakeSegmentSize)));
            nextY = Math.max(0, Math.min(nextY, boardHeight - (snakeStates.mySnake.width ?? gameRules.snakeSegmentSize)));
        }

        // Consume frozen snake corpse segments
        const myWidthForCorpse = snakeStates.mySnake.width ?? gameRules.snakeSegmentSize;
        const myHitboxForCorpse = {
            x: nextX,
            y: nextY,
            width: myWidthForCorpse,
            height: myWidthForCorpse
        };
        const consumedSegments = [];
        for (const corpseId in frozenSnakeCorpses) {
            const corpse = frozenSnakeCorpses[corpseId];
            const segWidth = corpse.width ?? gameRules.snakeSegmentSize;
            for (let i = 0; i < corpse.segments.length; i++) {
                const segment = corpse.segments[i];
                const segHitbox = { x: segment.x, y: segment.y, width: segWidth, height: segWidth };
                if (rectanglesOverlap(myHitboxForCorpse, segHitbox)) {
                    consumedSegments.push({ corpseId, segmentIndex: i });
                }
            }
        }
        // Process descending to avoid index-shift issues on local optimistic update
        consumedSegments.sort((a, b) => b.segmentIndex - a.segmentIndex);
        for (const { corpseId, segmentIndex } of consumedSegments) {
            socket.emit(GAME_SOCKET_EVENTS.CONSUME_CORPSE_SEGMENT, { corpseId, segmentIndex });
            const corpse = frozenSnakeCorpses[corpseId];
            if (corpse) {
                corpse.segments.splice(segmentIndex, 1);
                if (corpse.segments.length === 0) {
                    delete frozenSnakeCorpses[corpseId];
                }
            }
        }

    }

    emitHeadCoordinates(nextX, nextY);
    upsertSnakeById('mySnake', { x: nextX, y: nextY });

    updateOverlay();
    if (!isGameOver) {
        requestAnimationFrame(drawScene);
    }
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    canvas.width = viewportWidth * dpr;
    canvas.height = viewportHeight * dpr;
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawScene();
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

requestAnimationFrame(drawScene);
