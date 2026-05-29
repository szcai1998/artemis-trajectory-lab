// main.js
// This script uses Three.js to render a simple Earth‑to‑Moon mission
// visualisation.  It defines a set of sample trajectory points, scales
// distances down to a manageable coordinate system, and animates a small
// spacecraft along that path.  The left/right/bottom panels update
// telemetry values and playback controls.

import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.154.0/examples/jsm/controls/OrbitControls.js';

// -----------------------------------------------------------------------------
// Data generation
//
// Define constants for the Earth–Moon system.  Distances are in kilometres.
const EARTH_RADIUS_KM = 6371;
const MOON_RADIUS_KM = 1737;
const EARTH_TO_MOON_KM = 384400; // average distance from Earth to Moon
const TRAJ_LENGTH = 1000; // number of sample points in the trajectory

// Create an array of sample positions representing a transfer from Earth to
// Moon with a slight vertical (z‑axis) oscillation.  The z‑oscillation
// simulates a trajectory that arcs above and below the ecliptic plane.
const samplePositions = [];
for (let i = 0; i <= TRAJ_LENGTH; i++) {
  const t = i / TRAJ_LENGTH;
  // x moves linearly from 0 (Earth) to EARTH_TO_MOON_KM (Moon)
  const x = EARTH_TO_MOON_KM * t;
  // y stays at 0 for simplicity; could vary for an inclination
  const y = 0;
  // z oscillates sinusoidally to give the path some curvature
  const zAmplitude = 200000; // amplitude of z (km)
  const z = zAmplitude * Math.sin(t * Math.PI);
  // mission time in seconds – assign 10 minute increments per step
  const timeSec = i * 600; // 600 seconds = 10 minutes
  samplePositions.push({ x, y, z, timeSec });
}

// Determine the minimum distance to the Moon along the trajectory.  The
// distance to the Moon is the Euclidean distance from the current position
// to the Moon’s centre at (EARTH_TO_MOON_KM, 0, 0).
let closestDistanceKm = Infinity;
samplePositions.forEach(p => {
  const dx = EARTH_TO_MOON_KM - p.x;
  const dy = 0 - p.y;
  const dz = 0 - p.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < closestDistanceKm) closestDistanceKm = dist;
});

// -----------------------------------------------------------------------------
// Three.js scene setup

const canvasContainer = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
canvasContainer.appendChild(renderer.domElement);

// Scene and camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);

const camera = new THREE.PerspectiveCamera(
  45,
  canvasContainer.clientWidth / canvasContainer.clientHeight,
  0.1,
  1000
);
camera.position.set(5, 3, 5);

// Orbit controls allow the user to rotate, zoom and pan the camera
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = false;

// Resize handler to keep the renderer and camera aspect in sync
window.addEventListener('resize', onWindowResize);
function onWindowResize() {
  const { clientWidth, clientHeight } = canvasContainer;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight);
}

// Lighting – a dim ambient light and a directional light from the Sun direction
const ambientLight = new THREE.AmbientLight(0x808080, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(-1, 2, 1);
scene.add(directionalLight);

// Scaling factor converts kilometres to Three.js units.  One unit is
// chosen to be 100,000 km.  This allows us to fit the Earth–Moon system
// comfortably within a scene spanning ~8 units.
const SCALE = 100000;
function kmToScene(valueKm) {
  return valueKm / SCALE;
}

// Create Earth sphere
const earthGeometry = new THREE.SphereGeometry(kmToScene(EARTH_RADIUS_KM), 64, 64);
const earthMaterial = new THREE.MeshPhongMaterial({ color: 0x0066aa, emissive: 0x001133 });
const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earthMesh);

// Create Moon sphere positioned at its scaled distance on the x‑axis
const moonGeometry = new THREE.SphereGeometry(kmToScene(MOON_RADIUS_KM), 64, 64);
const moonMaterial = new THREE.MeshPhongMaterial({ color: 0x888888, emissive: 0x222222 });
const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
moonMesh.position.set(kmToScene(EARTH_TO_MOON_KM), 0, 0);
scene.add(moonMesh);

// Create the trajectory line.  Convert all sample positions to scaled units.
const trajectoryPoints = samplePositions.map(p => new THREE.Vector3(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z)));
const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(trajectoryPoints);
const trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0x37c0ff, linewidth: 2 });
const trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
scene.add(trajectoryLine);

// Create the spacecraft – a small sphere used as a marker
const craftGeometry = new THREE.SphereGeometry(0.03, 32, 32);
const craftMaterial = new THREE.MeshPhongMaterial({ color: 0xffcc00, emissive: 0x332200 });
const craftMesh = new THREE.Mesh(craftGeometry, craftMaterial);
scene.add(craftMesh);

// -----------------------------------------------------------------------------
// Playback state and UI bindings

let currentIndex = 0;
let running = false;
let speedMultiplier = 1;

const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');
const resetBtn = document.getElementById('reset');
const speedSelect = document.getElementById('speed');
const timeline = document.getElementById('timeline');
const metLabel = document.getElementById('met');
const distanceLabel = document.getElementById('distance');
const velocityLabel = document.getElementById('velocity');
const closestLabel = document.getElementById('closest');

// Initialize slider max value to length of sample positions
timeline.max = (samplePositions.length - 1).toString();

playBtn.addEventListener('click', () => {
  running = true;
});
pauseBtn.addEventListener('click', () => {
  running = false;
});
resetBtn.addEventListener('click', () => {
  running = false;
  currentIndex = 0;
  updateCraftPosition();
});
speedSelect.addEventListener('change', () => {
  speedMultiplier = parseFloat(speedSelect.value);
});
// When the timeline slider is moved manually, update the index and pause playback
timeline.addEventListener('input', () => {
  currentIndex = parseInt(timeline.value, 10);
  running = false;
  updateCraftPosition();
});

// Display the closest approach distance once computed
closestLabel.textContent = `${closestDistanceKm.toFixed(0)} km`;

// Helper to format seconds into HH:MM:SS
function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Update the spacecraft position, telemetry labels, and timeline slider
function updateCraftPosition() {
  const idx = Math.max(0, Math.min(Math.floor(currentIndex), samplePositions.length - 1));
  const p = samplePositions[idx];
  craftMesh.position.set(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z));
  // Update timeline slider value without triggering the input event
  timeline.value = idx.toString();
  // Update telemetry
  metLabel.textContent = formatTime(p.timeSec);
  // Distance to moon
  const dx = EARTH_TO_MOON_KM - p.x;
  const dy = -p.y;
  const dz = -p.z;
  const distKm = Math.sqrt(dx * dx + dy * dy + dz * dz);
  distanceLabel.textContent = `${distKm.toFixed(0)} km`;
  // Velocity estimation using difference between current and previous point (km/s)
  if (idx > 0) {
    const prev = samplePositions[idx - 1];
    const dt = (p.timeSec - prev.timeSec);
    const dxv = p.x - prev.x;
    const dyv = p.y - prev.y;
    const dzv = p.z - prev.z;
    const distTravelKm = Math.sqrt(dxv * dxv + dyv * dyv + dzv * dzv);
    const vel = distTravelKm / dt; // km/s
    velocityLabel.textContent = `${vel.toFixed(3)} km/s`;
  } else {
    velocityLabel.textContent = '0 km/s';
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  // Only advance when running
  if (running) {
    // The increment is scaled by speedMultiplier; increasing this value makes
    // playback smoother at high speeds.  Multiplying by 0.5 keeps the
    // progression slow enough for visualisation while still responding to
    // multiple speeds.
    currentIndex += 0.5 * speedMultiplier;
    if (currentIndex >= samplePositions.length) {
      currentIndex = samplePositions.length - 1;
      running = false;
    }
    updateCraftPosition();
  }
  // Keep OrbitControls updated
  controls.update();
  renderer.render(scene, camera);
}

// Initialise the scene and start the animation loop
updateCraftPosition();
animate();