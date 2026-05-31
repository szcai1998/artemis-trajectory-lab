// main.js
// Artemis Trajectory Lab - High-Fidelity Mission Visualizer
// This script utilizes Three.js and Chart.js to render a fully synchronized
// space visualization dashboard with procedural rendering and tracking cameras.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TelemetrySynth } from './audio.js';

// Instantiate procedural sound engine
const synth = new TelemetrySynth();

// Pre-allocated scratch containers for render loop optimization (Section 4.2 of rule.md)
const scratchDir = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const upVector = new THREE.Vector3(0, 0, 1);
const scratchWorldPos = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchToCraft = new THREE.Vector3();
const scratchStartPoint = new THREE.Vector3();
const scratchCraftPos = new THREE.Vector3();
const scratchDelta = new THREE.Vector3();
const scratchZero = new THREE.Vector3(0, 0, 0);


// -----------------------------------------------------------------------------
// 1. Data Generation & Mission Constants
// -----------------------------------------------------------------------------
const EARTH_RADIUS_KM = 6371;
const MOON_RADIUS_KM = 1737;
const EARTH_TO_MOON_KM = 384400; // Average distance
const TRAJ_LENGTH = 1000; // Sample points in the trajectory
const TOTAL_HOURS = 240;
const SECONDS_PER_STEP = (TOTAL_HOURS * 3600) / TRAJ_LENGTH; // 864s per step (14.4 mins)

// Interactive Burn Vector States (m/s)
let tliDv = { p: 0, n: 0, r: 0 }; // TLI (Earth departure)
let loiDv = { p: 0, n: 0, r: 0 }; // LOI (Lunar capture)
let teiDv = { p: 0, n: 0, r: 0 }; // TEI (Earth return)
let activeBurnEvent = 'tli';

let tliCost = 0;
let loiCost = 0;
let teiCost = 0;

const samplePositions = [];
let closestDistanceKm = Infinity;

// Patched-Conic Keplerian Propagation Engine
function propagateTrajectory() {
  // 1. Calculate spent Delta-V and enforce limits (max 3200 m/s budget)
  let tliMag = Math.sqrt(tliDv.p*tliDv.p + tliDv.n*tliDv.n + tliDv.r*tliDv.r);
  let loiMag = Math.sqrt(loiDv.p*loiDv.p + loiDv.n*loiDv.n + loiDv.r*loiDv.r);
  let teiMag = Math.sqrt(teiDv.p*teiDv.p + teiDv.n*teiDv.n + teiDv.r*teiDv.r);
  let totalSpent = tliMag + loiMag + teiMag;
  
  if (totalSpent > 3200) {
    const factor = 3200 / totalSpent;
    tliDv.p *= factor; tliDv.n *= factor; tliDv.r *= factor;
    loiDv.p *= factor; loiDv.n *= factor; loiDv.r *= factor;
    teiDv.p *= factor; teiDv.n *= factor; teiDv.r *= factor;
    
    tliMag = Math.sqrt(tliDv.p*tliDv.p + tliDv.n*tliDv.n + tliDv.r*tliDv.r);
    loiMag = Math.sqrt(loiDv.p*loiDv.p + loiDv.n*loiDv.n + loiDv.r*loiDv.r);
    teiMag = Math.sqrt(teiDv.p*teiDv.p + teiDv.n*teiDv.n + teiDv.r*teiDv.r);
    totalSpent = 3200;
  }

  tliCost = tliMag;
  loiCost = loiMag;
  teiCost = teiMag;

  // 2. Propagate Earth-relative departure ellipse (Phase 1)
  const r_p = 6600; // Earth parking radius (km)
  const r_a = 380000 + (tliDv.p * 200); // Apogee increases with prograde thrust
  const a1 = (r_p + r_a) / 2;
  const e1 = (r_a - r_p) / (r_a + r_p);
  const inc1 = tliDv.n * 0.001; // inclination starts at 0, tilts with normal slider
  const node1 = tliDv.r * 0.001; // ascending node starts at 0, rotates with radial slider

  // 3. Propagate Moon-relative flyby/capture (Phase 2)
  const r_p_M = Math.max(1800, 3000 + (tliDv.p * 5) - (tliDv.r * 15)); // Moon periapsis kept compact & above surface (1,737 km)
  const isCaptured = loiDv.p <= -140; // retroburn capture threshold
  
  let a2, e2;
  if (isCaptured) {
    e2 = Math.min(0.85, Math.max(0.01, 1.0 + (loiDv.p + 140) * 0.004)); // cap e2 at 0.85 to keep orbit inside Moon SOI (66,000 km)
    a2 = r_p_M / (1 - e2);
  } else {
    e2 = 1.05 + Math.abs(loiDv.p + 140) * 0.003; // hyperbola
    a2 = r_p_M / (e2 - 1);
  }
  const inc2 = 0.5 + (loiDv.n * 0.002);

  // 4. Propagate Earth-relative return ellipse (Phase 3)
  const r_p_ret = Math.max(100, 6461 + (teiDv.p - 100) * 1.5 + teiDv.r * 3.0); // Earth perigee >= 100km to prevent division by zero (singularity)
  const r_a_ret = 384400;
  const a3 = (r_p_ret + r_a_ret) / 2;
  const e3 = (r_a_ret - r_p_ret) / (r_a_ret + r_p_ret);
  const inc3 = teiDv.n * 0.001; // inclination starts at 0, tilts with normal slider
  const node3 = teiDv.r * 0.002; // ascending node starts at 0, rotates with radial slider

  const isCapturedStatus = isCaptured;
  const isDeepSpaceEscape = !isCaptured && (tliDv.p > 350);

  // Helper functions for continuous trajectory blending
  const getPhase1Pos = (step) => {
    const p = step / 300;
    const M = p * Math.PI;
    
    // Solve Kepler's equation M = E - e1 * sin(E) using Newton-Raphson solver
    let E = M;
    for (let iter = 0; iter < 5; iter++) {
      E = E - (E - e1 * Math.sin(E) - M) / (1 - e1 * Math.cos(E));
    }
    
    // Convert eccentric anomaly E to true anomaly theta
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const denom = 1 - e1 * cosE;
    const sinTheta = (Math.sqrt(1 - e1 * e1) * sinE) / denom;
    const cosTheta = (cosE - e1) / denom;
    const theta = Math.atan2(sinTheta, cosTheta);
    
    const r = (a1 * (1 - e1*e1)) / (1 + e1 * Math.cos(theta));
    
    // Rotate 180 degrees so apogee points to the positive X (Moon) direction
    const x0 = -r * Math.cos(theta);
    const z0 = -r * Math.sin(theta);
    
    const rx = x0 * Math.cos(node1) - z0 * Math.sin(node1) * Math.cos(inc1);
    const ry = z0 * Math.sin(inc1);
    const rz = x0 * Math.sin(node1) + z0 * Math.cos(node1) * Math.cos(inc1);
    return { x: rx, y: ry, z: rz };
  };

  const getPhase2Pos = (step) => {
    const p = (step - 300) / 400;
    let rx = 0, ry = 0, rz = 0;
    
    if (isCapturedStatus) {
      const numOrbits = 1;
      const M = p * Math.PI * 2 * numOrbits - Math.PI;
      
      // Solve Kepler's equation M = E - e2 * sin(E) using Newton-Raphson solver
      let E = M;
      for (let iter = 0; iter < 5; iter++) {
        E = E - (E - e2 * Math.sin(E) - M) / (1 - e2 * Math.cos(E));
      }
      
      // Convert eccentric anomaly E to true anomaly theta
      const sinE = Math.sin(E);
      const cosE = Math.cos(E);
      const denom = 1 - e2 * cosE;
      const sinTheta = (Math.sqrt(1 - e2 * e2) * sinE) / denom;
      const cosTheta = (cosE - e2) / denom;
      const theta = Math.atan2(sinTheta, cosTheta);
      
      const r = (a2 * (1 - e2*e2)) / (1 + e2 * Math.cos(theta));
      
      const dx = r * Math.cos(theta);
      const dy = r * Math.sin(theta) * Math.cos(inc2);
      const dz = r * Math.sin(theta) * Math.sin(inc2);
      
      rx = EARTH_TO_MOON_KM + dx;
      ry = dy;
      rz = dz;
    } else {
      const theta = (p - 0.5) * 2.5;
      const r = (a2 * (e2*e2 - 1)) / (1 + e2 * Math.cos(theta));
      
      const dx = r * Math.cos(theta);
      const dy = r * Math.sin(theta) * Math.cos(inc2);
      const dz = r * Math.sin(theta) * Math.sin(inc2);
      
      rx = EARTH_TO_MOON_KM + dx;
      ry = dy;
      rz = dz;
    }
    return { x: rx, y: ry, z: rz };
  };

  const getPhase3Pos = (step) => {
    let rx = 0, ry = 0, rz = 0;
    
    if (isDeepSpaceEscape) {
      const pTLI = (step - 700) / 300;
      // Get the exact exit position from Phase 2 to make it continuous!
      const p2Exit = getPhase2Pos(700);
      rx = p2Exit.x + pTLI * 120000;
      ry = p2Exit.y + pTLI * 30000;
      rz = p2Exit.z + pTLI * 45000;
    } else {
      const p = (step - 700) / 300;
      const M = (1 - p) * Math.PI;
      
      // Solve Kepler's equation M = E - e3 * sin(E) using Newton-Raphson solver
      let E = M;
      for (let iter = 0; iter < 5; iter++) {
        E = E - (E - e3 * Math.sin(E) - M) / (1 - e3 * Math.cos(E));
      }
      
      // Convert eccentric anomaly E to true anomaly theta
      const sinE = Math.sin(E);
      const cosE = Math.cos(E);
      const denom = 1 - e3 * cosE;
      const sinTheta = (Math.sqrt(1 - e3 * e3) * sinE) / denom;
      const cosTheta = (cosE - e3) / denom;
      const theta = Math.atan2(sinTheta, cosTheta);
      
      const r = (a3 * (1 - e3*e3)) / (1 + e3 * Math.cos(theta));
      
      // Rotate 180 degrees so return apogee starts near the Moon (positive X)
      const x0 = -r * Math.cos(theta);
      const z0 = -r * Math.sin(theta);
      
      rx = x0 * Math.cos(node3) - z0 * Math.sin(node3) * Math.cos(inc3);
      ry = z0 * Math.sin(inc3);
      rz = x0 * Math.sin(node3) + z0 * Math.cos(node3) * Math.cos(inc3);
    }
    return { x: rx, y: ry, z: rz };
  };

  // Clear and rebuild positions
  samplePositions.length = 0;
  closestDistanceKm = Infinity;

  for (let i = 0; i <= TRAJ_LENGTH; i++) {
    const timeSec = i * SECONDS_PER_STEP;
    let x = 0, y = 0, z = 0;
    
    if (i < 280) {
      const pos = getPhase1Pos(i);
      x = pos.x; y = pos.y; z = pos.z;
    } else if (i <= 320) {
      // Transition 1: Phase 1 -> Phase 2 LERP
      const pos1 = getPhase1Pos(i);
      const pos2 = getPhase2Pos(i);
      const t = (i - 280) / 40;
      x = (1 - t) * pos1.x + t * pos2.x;
      y = (1 - t) * pos1.y + t * pos2.y;
      z = (1 - t) * pos1.z + t * pos2.z;
    } else if (i < 680) {
      const pos = getPhase2Pos(i);
      x = pos.x; y = pos.y; z = pos.z;
    } else if (i <= 720) {
      // Transition 2: Phase 2 -> Phase 3 LERP
      const pos2 = getPhase2Pos(i);
      const pos3 = getPhase3Pos(i);
      const t = (i - 680) / 40;
      x = (1 - t) * pos2.x + t * pos3.x;
      y = (1 - t) * pos2.y + t * pos3.y;
      z = (1 - t) * pos2.z + t * pos3.z;
    } else {
      const pos = getPhase3Pos(i);
      x = pos.x; y = pos.y; z = pos.z;
    }
    
    samplePositions.push({ x, y, z, timeSec });
    
    // Distance to Moon center
    const dx = EARTH_TO_MOON_KM - x;
    const dy = -y;
    const dz = -z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < closestDistanceKm) closestDistanceKm = dist;
  }
}

// Initial propagation setup
propagateTrajectory();

// -----------------------------------------------------------------------------
// 2. Procedural Texture Generation (Offline Canvas Drawing)
// -----------------------------------------------------------------------------

// Global continental parameters shared between landmass drawing and emissive night lights
const earthContinents = [];
const numContinents = 18;
for (let i = 0; i < numContinents; i++) {
  earthContinents.push({
    cx: Math.random() * 1024,
    cy: 100 + Math.random() * 312,
    baseR: 70 + Math.random() * 110,
    landColorIndex: Math.floor(Math.random() * 4)
  });
}

// Earth: Generates custom continents, oceans, and ice caps dynamically
function generateEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // 1. Deep ocean base
  ctx.fillStyle = '#081730';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 2. Dynamic, random organic landmasses (Continents)
  const landColors = ['#1e4620', '#2d5a27', '#426b3f', '#707a50'];
  earthContinents.forEach(c => {
    ctx.fillStyle = landColors[c.landColorIndex];
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      // Jagged jaggedness to represent natural coastline
      const noise = 0.65 + Math.sin(a * 6) * 0.15 + Math.cos(a * 13) * 0.1;
      const r = c.baseR * noise;
      const x = c.cx + Math.cos(a) * r;
      const y = c.cy + Math.sin(a) * r;
      
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Draw mountain details inside continent
    ctx.fillStyle = '#8c764a';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const noise = 0.55 + Math.sin(a * 4) * 0.15;
      const r = c.baseR * 0.45 * noise;
      const x = c.cx + Math.cos(a) * r;
      const y = c.cy + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });
  
  // 3. Ice Caps (North/South poles)
  ctx.fillStyle = '#f0f5fa';
  ctx.fillRect(0, 0, canvas.width, 38);
  ctx.fillRect(0, canvas.height - 38, canvas.width, 38);
  
  // 4. Subtle coast shading (translucent overlay)
  ctx.strokeStyle = 'rgba(55, 192, 255, 0.15)';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  return new THREE.CanvasTexture(canvas);
}

// Earth Emissive Night Lights: Pulsing glowing city light clusters on continents
function generateEarthEmissiveMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // Base is pure black (no emission)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw clusters of yellow/golden city lights inside continent bounds
  earthContinents.forEach(c => {
    const numCities = 15 + Math.floor(Math.random() * 20);
    for (let i = 0; i < numCities; i++) {
      // Distribute coordinates within continental radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * c.baseR * 0.72; // keep clustered towards center
      const x = (c.cx + Math.cos(angle) * dist + 1024) % 1024;
      const y = Math.max(0, Math.min(512, c.cy + Math.sin(angle) * dist));
      
      const size = 1.0 + Math.random() * 2;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 2.5);
      grad.addColorStop(0, 'rgba(255, 230, 150, 1.0)');
      grad.addColorStop(0.3, 'rgba(255, 170, 70, 0.85)');
      grad.addColorStop(1, 'rgba(255, 170, 70, 0)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  
  return new THREE.CanvasTexture(canvas);
}

// Moon: Slate-grey cratered surface
function generateMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Base lunar grey
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Dark Lunar Maria (seas)
  ctx.fillStyle = '#4c4c4c';
  for (let i = 0; i < 9; i++) {
    const mx = Math.random() * canvas.width;
    const my = Math.random() * canvas.height;
    const mr = 25 + Math.random() * 55;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // High-density Impact Craters
  for (let i = 0; i < 150; i++) {
    const cx = Math.random() * canvas.width;
    const cy = Math.random() * canvas.height;
    const cr = 2 + Math.random() * 10;
    
    // Draw white crater ejecta lines for larger craters
    if (cr > 7) {
      ctx.strokeStyle = 'rgba(240, 240, 240, 0.12)';
      ctx.lineWidth = 1;
      const numRays = 5 + Math.floor(Math.random() * 6);
      for (let r = 0; r < numRays; r++) {
        const angle = (r / numRays) * Math.PI * 2 + Math.random() * 0.3;
        const length = cr * (3 + Math.random() * 4);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
        ctx.stroke();
      }
    }
    
    // Crater rim (light grey highlighting)
    ctx.fillStyle = '#a0a0a0';
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    
    // Crater shadow interior (dark)
    ctx.fillStyle = '#363636';
    ctx.beginPath();
    ctx.arc(cx + cr * 0.1, cy + cr * 0.1, cr * 0.85, 0, Math.PI * 2);
    ctx.fill();
    
    // Crater floor (mid-grey interior)
    ctx.fillStyle = '#5c5c5c';
    ctx.beginPath();
    ctx.arc(cx + cr * 0.02, cy + cr * 0.02, cr * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }
  
  return new THREE.CanvasTexture(canvas);
}

// Earth Clouds Layer: Transparent swirling cloud formations
function generateCloudsTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Completely clear
  
  // Swirling white clouds
  ctx.fillStyle = 'rgba(245, 250, 255, 0.82)';
  const numClouds = 22;
  for (let i = 0; i < numClouds; i++) {
    const cx = Math.random() * canvas.width;
    const cy = 40 + Math.random() * 432;
    const baseR = 50 + Math.random() * 110;
    
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      // Swirly, fibrous shapes using overlapping mathematical curves
      const noise = 0.5 + Math.sin(a * 4) * 0.25 + Math.cos(a * 9) * 0.15;
      const r = baseR * noise;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  
  return new THREE.CanvasTexture(canvas);
}

// -----------------------------------------------------------------------------
// 3. Three.js Scene Construction
// -----------------------------------------------------------------------------
const canvasContainer = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
canvasContainer.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010306);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  1500
);
// Start looking at Earth
camera.position.set(4, 2.5, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 1200;
controls.minDistance = 0.15;

// Direct illumination
const ambientLight = new THREE.AmbientLight(0x90a8ff, 0.45);
scene.add(ambientLight);

// Directional light from the "Sun"
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
directionalLight.position.set(-2, 1, 1).normalize();
scene.add(directionalLight);

// Conversions (1 Three.js unit = 100,000 km)
const SCALE = 100000;
function kmToScene(valueKm) {
  return valueKm / SCALE;
}

// Earth Sphere with glowing emissive city lights
const earthTex = generateEarthTexture();
const earthEmissiveTex = generateEarthEmissiveMap();
const earthGeo = new THREE.SphereGeometry(kmToScene(EARTH_RADIUS_KM), 64, 64);
const earthMat = new THREE.MeshPhongMaterial({
  map: earthTex,
  bumpScale: 0.02,
  shininess: 15,
  emissiveMap: earthEmissiveTex,
  emissive: new THREE.Color(0xffdda6),
  emissiveIntensity: 1.8
});
const earthMesh = new THREE.Mesh(earthGeo, earthMat);
scene.add(earthMesh);

// Conversions Lat/Lon to Cartesian 3D Coordinates
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.sin(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.cos(theta);
  return new THREE.Vector3(x, y, z);
}

// 3D DSN Ground Tracking Stations (rotating dynamically with Earth)
const dsnStations = [
  { name: "Goldstone (USA)", lat: 35.4, lon: -116.8, color: 0x37c0ff },
  { name: "Madrid (Spain)", lat: 40.4, lon: -4.2, color: 0x37c0ff },
  { name: "Canberra (Aus)", lat: -35.4, lon: 149.0, color: 0x37c0ff }
];

const stationMeshes = [];
const earthRadScene = kmToScene(EARTH_RADIUS_KM);

dsnStations.forEach(s => {
  const stationGroup = new THREE.Group();
  
  // Ground station core sphere
  const sphereGeo = new THREE.SphereGeometry(0.007, 8, 8);
  const sphereMat = new THREE.MeshBasicMaterial({ color: s.color });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  stationGroup.add(sphere);
  
  // Pulse signal ring
  const ringGeo = new THREE.RingGeometry(0.012, 0.015, 16);
  const ringMat = new THREE.MeshBasicMaterial({
    color: s.color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  stationGroup.add(ring);
  
  // Position group on rotating Earth surface
  const pos = latLonToVector3(s.lat, s.lon, earthRadScene);
  stationGroup.position.copy(pos);
  
  // Orient group normal outward from Earth center
  const normal = pos.clone().normalize();
  stationGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  
  earthMesh.add(stationGroup);
  
  stationMeshes.push({
    name: s.name,
    group: stationGroup,
    ringMat: ringMat,
    sphereMat: sphereMat
  });
});

// Earth Clouds Layer (slightly larger than Earth)
const cloudsTex = generateCloudsTexture();
const cloudsGeo = new THREE.SphereGeometry(kmToScene(EARTH_RADIUS_KM) * 1.02, 64, 64);
const cloudsMat = new THREE.MeshPhongMaterial({
  map: cloudsTex,
  transparent: true,
  opacity: 0.65,
  blending: THREE.NormalBlending
});
const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
scene.add(cloudsMesh);

// Atmospheric Glowing Outer Halo
const atmosphericGlowGeo = new THREE.SphereGeometry(kmToScene(EARTH_RADIUS_KM) * 1.065, 32, 32);
const atmosphericGlowMat = new THREE.MeshBasicMaterial({
  color: 0x37c0ff,
  transparent: true,
  opacity: 0.12,
  side: THREE.BackSide
});
const atmosphericGlowMesh = new THREE.Mesh(atmosphericGlowGeo, atmosphericGlowMat);
scene.add(atmosphericGlowMesh);

// Moon Sphere
const moonTex = generateMoonTexture();
const moonGeo = new THREE.SphereGeometry(kmToScene(MOON_RADIUS_KM), 64, 64);
const moonMat = new THREE.MeshPhongMaterial({
  map: moonTex,
  shininess: 2
});
const moonMesh = new THREE.Mesh(moonGeo, moonMat);
// Position Moon at (EARTH_TO_MOON_KM, 0, 0)
moonMesh.position.set(kmToScene(EARTH_TO_MOON_KM), 0, 0);
scene.add(moonMesh);

// Starfield Background Point-cloud
function buildStarfield() {
  const count = 1800;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count * 3; i += 3) {
    const r = 500 + Math.random() * 300;
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2 * Math.PI;
    const phi = Math.acos(2 * v - 1);
    
    positions[i] = r * Math.sin(phi) * Math.cos(theta);
    positions[i+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i+2] = r * Math.cos(phi);
    
    // Vary colors: ice-blue, warm-amber, absolute white
    const cChoice = Math.random();
    if (cChoice < 0.15) { // ice-blue
      colors[i] = 0.85; colors[i+1] = 0.92; colors[i+2] = 1.0;
    } else if (cChoice < 0.3) { // warm-amber
      colors[i] = 1.0; colors[i+1] = 0.94; colors[i+2] = 0.85;
    } else { // pure white
      colors[i] = 1.0; colors[i+1] = 1.0; colors[i+2] = 1.0;
    }
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  // Generate small glowing dot on canvas
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.7)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);
  const starTex = new THREE.CanvasTexture(canvas);
  
  const material = new THREE.PointsMaterial({
    size: 1.4,
    map: starTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  return new THREE.Points(geometry, material);
}
scene.add(buildStarfield());

// Tactical Orbital Planes & helpers
const gridHelper = new THREE.GridHelper(12, 60, 0x1a2e4c, 0x071120);
gridHelper.position.y = -0.6; // Slightly below ecliptic plane
scene.add(gridHelper);

// Moon Orbit Path (Dashed ring)
const moonOrbitPoints = [];
for (let a = 0; a <= 120; a++) {
  const theta = (a / 120) * Math.PI * 2;
  moonOrbitPoints.push(new THREE.Vector3(kmToScene(EARTH_TO_MOON_KM) * Math.cos(theta), 0, kmToScene(EARTH_TO_MOON_KM) * Math.sin(theta)));
}
const moonOrbitGeo = new THREE.BufferGeometry().setFromPoints(moonOrbitPoints);
const moonOrbitMat = new THREE.LineDashedMaterial({
  color: 0x1f3c64,
  dashSize: 0.15,
  gapSize: 0.15
});
const moonOrbitLine = new THREE.Line(moonOrbitGeo, moonOrbitMat);
moonOrbitLine.computeLineDistances();
scene.add(moonOrbitLine);

// Spacecraft Planned Trajectory (Faint tactical blue-grey dotted visual)
const trajectoryPoints = samplePositions.map(p => new THREE.Vector3(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z)));
const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(trajectoryPoints);
const trajectoryMaterial = new THREE.LineBasicMaterial({
  color: 0x1a3454,
  transparent: true,
  opacity: 0.35
});
const trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
scene.add(trajectoryLine);

// Dynamic 3D Vector Gizmos for planned maneuvers
const maneuverGizmoGroup = new THREE.Group();
scene.add(maneuverGizmoGroup);

// Create three arrows for Prograde (Green), Normal (Magenta), and Radial (Cyan) directions
const gizmoPrograde = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 0),
  0.001,
  0x00ff00, // green
  0.03, // head length
  0.015 // head width
);
const gizmoNormal = new THREE.ArrowHelper(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 0),
  0.001,
  0xff00ff, // magenta/purple
  0.03,
  0.015
);
const gizmoRadial = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, 0),
  0.001,
  0x00ffff, // cyan
  0.03,
  0.015
);

maneuverGizmoGroup.add(gizmoPrograde);
maneuverGizmoGroup.add(gizmoNormal);
maneuverGizmoGroup.add(gizmoRadial);

// Helper to update the 3D maneuver arrows
function updateGizmos() {
  const idx = activeBurnEvent === 'tli' ? 10 : (activeBurnEvent === 'loi' ? 300 : 700);
  if (!samplePositions[idx]) return;
  const p = samplePositions[idx];
  const burnPos = new THREE.Vector3(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z));
  maneuverGizmoGroup.position.copy(burnPos);
  
  const nextIdx = Math.min(idx + 1, samplePositions.length - 1);
  const pNext = samplePositions[nextIdx];
  const vDir = new THREE.Vector3(pNext.x - p.x, pNext.y - p.y, pNext.z - p.z).normalize();
  
  let centerPos = new THREE.Vector3(0, 0, 0);
  if (activeBurnEvent === 'loi') {
    centerPos.set(kmToScene(EARTH_TO_MOON_KM), 0, 0);
  }
  
  const craftPosAbs = new THREE.Vector3(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z));
  const rDir = craftPosAbs.clone().sub(centerPos).normalize();
  const nDir = new THREE.Vector3().crossVectors(rDir, vDir).normalize();
  
  const activeDv = activeBurnEvent === 'tli' ? tliDv : (activeBurnEvent === 'loi' ? loiDv : teiDv);
  
  gizmoPrograde.setDirection(vDir.clone().multiplyScalar(activeDv.p >= 0 ? 1 : -1));
  gizmoNormal.setDirection(nDir.clone().multiplyScalar(activeDv.n >= 0 ? 1 : -1));
  gizmoRadial.setDirection(rDir.clone().multiplyScalar(activeDv.r >= 0 ? 1 : -1));
  
  const scaleFactor = 0.0006;
  const proLength = Math.max(0.001, Math.abs(activeDv.p) * scaleFactor);
  const normLength = Math.max(0.001, Math.abs(activeDv.n) * scaleFactor);
  const radLength = Math.max(0.001, Math.abs(activeDv.r) * scaleFactor);
  
  gizmoPrograde.setLength(proLength, Math.min(0.015, proLength * 0.3), Math.min(0.007, proLength * 0.15));
  gizmoNormal.setLength(normLength, Math.min(0.015, normLength * 0.3), Math.min(0.007, normLength * 0.15));
  gizmoRadial.setLength(radLength, Math.min(0.015, radLength * 0.3), Math.min(0.007, radLength * 0.15));
}
updateGizmos();

// Spacecraft Glowing Neon Ribbon Trail (Gradient fade behind craft)
const TRAIL_SIZE = 60;
const trailGeometry = new THREE.BufferGeometry();
const trailPositions = new Float32Array(TRAIL_SIZE * 3);
const trailColors = new Float32Array(TRAIL_SIZE * 3);

trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));

const trailMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  linewidth: 3,
  blending: THREE.AdditiveBlending
});
const trailLine = new THREE.Line(trailGeometry, trailMaterial);
scene.add(trailLine);

// Real-time 3D DSN Communication Tracking Link Beam
const dsnLinkPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
const dsnLinkGeo = new THREE.BufferGeometry().setFromPoints(dsnLinkPoints);
const dsnLinkMat = new THREE.LineBasicMaterial({
  color: 0x37c0ff,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending
});
const dsnLinkLine = new THREE.Line(dsnLinkGeo, dsnLinkMat);
scene.add(dsnLinkLine);

// Helper to update the gradient fading ribbon trail
function updateTrailGeometry(currentIdx) {
  const positions = trailGeometry.attributes.position.array;
  const colors = trailGeometry.attributes.color.array;
  
  for (let i = 0; i < TRAIL_SIZE; i++) {
    // Collect rolling history leading up to active index
    const pointIdx = Math.max(0, currentIdx - (TRAIL_SIZE - 1 - i));
    const p = samplePositions[pointIdx];
    
    positions[i * 3] = kmToScene(p.x);
    positions[i * 3 + 1] = kmToScene(p.y);
    positions[i * 3 + 2] = kmToScene(p.z);
    
    const ratio = i / (TRAIL_SIZE - 1); // 0 (tail) to 1 (head)
    
    // Smooth transition from deep dark blue to brilliant glowing cyan
    colors[i * 3] = 0.003 + (0.21 - 0.003) * ratio;
    colors[i * 3 + 1] = 0.011 + (0.75 - 0.011) * ratio;
    colors[i * 3 + 2] = 0.02 + (1.0 - 0.02) * ratio;
  }
  
  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.color.needsUpdate = true;
}

// Tactical Equatorial Coordinate Rings around Earth & Moon
const earthRingGeo = new THREE.RingGeometry(kmToScene(EARTH_RADIUS_KM) * 1.5, kmToScene(EARTH_RADIUS_KM) * 1.54, 64);
const earthRingMat = new THREE.MeshBasicMaterial({
  color: 0x37c0ff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending
});
const earthRingMesh = new THREE.Mesh(earthRingGeo, earthRingMat);
earthRingMesh.rotation.x = Math.PI / 2;
scene.add(earthRingMesh);

const moonRingGeo = new THREE.RingGeometry(kmToScene(MOON_RADIUS_KM) * 1.6, kmToScene(MOON_RADIUS_KM) * 1.65, 64);
const moonRingMat = new THREE.MeshBasicMaterial({
  color: 0xe6a100,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending
});
const moonRingMesh = new THREE.Mesh(moonRingGeo, moonRingMat);
moonRingMesh.position.set(kmToScene(EARTH_TO_MOON_KM), 0, 0);
moonRingMesh.rotation.x = Math.PI / 2;
scene.add(moonRingMesh);

// Spacecraft 3D Composite Model (Group of primitive shapes)
const craftGroup = new THREE.Group();

// Spacecraft Bounding/Targeting Holographic Reticle (Spinning wireframe octahedron)
const reticleGeo = new THREE.OctahedronGeometry(0.045, 0);
const reticleMat = new THREE.MeshBasicMaterial({
  color: 0x37c0ff,
  wireframe: true,
  transparent: true,
  opacity: 0.35,
  blending: THREE.AdditiveBlending
});
const reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
craftGroup.add(reticleMesh);

// Fuselage / Service Module: Silver Cylindrical Body
const craftBodyGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.052, 16);
const craftBodyMat = new THREE.MeshPhongMaterial({
  color: 0xe6e6e6,
  metalness: 0.8,
  roughness: 0.25,
  shininess: 90
});
const craftBodyMesh = new THREE.Mesh(craftBodyGeo, craftBodyMat);
craftBodyMesh.rotation.x = Math.PI / 2; // Face direction of motion
craftGroup.add(craftBodyMesh);

// Command Module: Golden Cone at Front
const craftCapGeo = new THREE.ConeGeometry(0.016, 0.022, 16);
const craftCapMat = new THREE.MeshPhongMaterial({
  color: 0xdcae3b,
  metalness: 0.9,
  roughness: 0.15,
  shininess: 120
});
const craftCapMesh = new THREE.Mesh(craftCapGeo, craftCapMat);
craftCapMesh.position.set(0, 0, 0.037);
craftCapMesh.rotation.x = Math.PI / 2;
craftGroup.add(craftCapMesh);

// Engine nozzle: Dark-grey cone at rear
const craftNozzleGeo = new THREE.ConeGeometry(0.007, 0.014, 12, 1, true);
const craftNozzleMat = new THREE.MeshPhongMaterial({ color: 0x2b2b2b, shininess: 5 });
const craftNozzleMesh = new THREE.Mesh(craftNozzleGeo, craftNozzleMat);
craftNozzleMesh.position.set(0, 0, -0.033);
craftNozzleMesh.rotation.x = -Math.PI / 2;
craftGroup.add(craftNozzleMesh);

// Solar Arrays (Dual Blue Rectangular wing spans)
const arrayGeo = new THREE.BoxGeometry(0.12, 0.016, 0.002);
const arrayMat = new THREE.MeshPhongMaterial({
  color: 0x004aa6,
  emissive: 0x001140,
  shininess: 80
});
const arrayLeft = new THREE.Mesh(arrayGeo, arrayMat);
arrayLeft.position.set(-0.076, 0, 0);
craftGroup.add(arrayLeft);

const arrayRight = new THREE.Mesh(arrayGeo, arrayMat);
arrayRight.position.set(0.076, 0, 0);
craftGroup.add(arrayRight);

scene.add(craftGroup);

// Window resize handler
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// -----------------------------------------------------------------------------
// 4. Chart.js Implementation (Dynamic Timeline Charting)
// -----------------------------------------------------------------------------
const ctx = document.getElementById('telemetryChart').getContext('2d');

// Sample the trajectory coordinate array every 5 steps to populate the chart
const chartLabels = [];
const speedData = [];
const distData = [];
for (let i = 0; i <= TRAJ_LENGTH; i += 5) {
  const p = samplePositions[i];
  const hrs = p.timeSec / 3600;
  chartLabels.push(`T+${hrs.toFixed(0)}h`);
  
  // Velocity estimation (km/s)
  let vel = 0;
  if (i > 0) {
    const prev = samplePositions[i - 5];
    const dt = p.timeSec - prev.timeSec;
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const dz = p.z - prev.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    vel = dist / dt;
  } else {
    vel = 11.2; // escape velocity at launch
  }
  speedData.push(vel);
  
  // Distance to Moon center
  const dxM = EARTH_TO_MOON_KM - p.x;
  const dyM = -p.y;
  const dzM = -p.z;
  const distM = Math.sqrt(dxM*dxM + dyM*dyM + dzM*dzM);
  distData.push(distM);
}

// Scrubber Vertical Line Plugin for Chart.js
const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw: (chart) => {
    if (chart.activeScrubberIndex !== undefined) {
      const renderCtx = chart.ctx;
      const xAxis = chart.scales.x;
      const yAxis = chart.scales.ySpeed || chart.scales.y;
      
      if (!xAxis || !yAxis) return;
      
      // Calculate screen X coordinate by converting 0-1000 range to chart array index
      const chartIndex = Math.min(
        Math.floor(chart.activeScrubberIndex / 5),
        chartLabels.length - 1
      );
      const xPixel = xAxis.getPixelForIndex(chartIndex);
      
      renderCtx.save();
      renderCtx.beginPath();
      renderCtx.strokeStyle = 'rgba(55, 192, 255, 0.85)';
      renderCtx.lineWidth = 2.5;
      renderCtx.shadowBlur = 8;
      renderCtx.shadowColor = 'rgba(55, 192, 255, 1)';
      renderCtx.moveTo(xPixel, yAxis.top);
      renderCtx.lineTo(xPixel, yAxis.bottom);
      renderCtx.stroke();
      renderCtx.restore();
    }
  }
};

Chart.register(verticalLinePlugin);

const telemetryChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: chartLabels,
    datasets: [
      {
        label: 'Velocity (km/s)',
        data: speedData,
        borderColor: '#37c0ff',
        borderWidth: 2.2,
        pointRadius: 0,
        yAxisID: 'ySpeed',
        tension: 0.15
      },
      {
        label: 'Distance to Moon (km)',
        data: distData,
        borderColor: '#e6a100',
        borderWidth: 2.2,
        pointRadius: 0,
        yAxisID: 'yDist',
        tension: 0.15
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#8b9bb4',
          font: { family: 'Orbitron', size: 9 },
          boxWidth: 15,
          padding: 8
        }
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(80, 100, 140, 0.08)' },
        ticks: { color: '#687790', font: { family: 'Share Tech Mono', size: 9 } }
      },
      ySpeed: {
        position: 'left',
        grid: { color: 'rgba(80, 100, 140, 0.08)' },
        ticks: { color: '#37c0ff', font: { family: 'Share Tech Mono', size: 9 } },
        title: { display: true, text: 'VELOCITY (KM/S)', color: '#37c0ff', font: { family: 'Orbitron', size: 8 } }
      },
      yDist: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: '#e6a100', font: { family: 'Share Tech Mono', size: 9 } },
        title: { display: true, text: 'LUNAR DISTANCE (KM)', color: '#e6a100', font: { family: 'Orbitron', size: 8 } }
      }
    }
  }
});

// -----------------------------------------------------------------------------
// 5. Dynamic Typewriter Mission Terminal Logs
// -----------------------------------------------------------------------------
const terminalFeed = document.getElementById('terminal-feed');

const terminalLogs = [
  { hour: 0, msg: "<span class='log-burn'>[ LAUNCH ]</span> SLS booster ignition. Core stage nominal." },
  { hour: 1.2, msg: "<span class='log-ok'>[  OK  ]</span> Solid Rocket Booster separation successful." },
  { hour: 2.5, msg: "<span class='log-burn'>[ BURN ]</span> TRANS-LUNAR INJECTION burn initialized." },
  { hour: 4, msg: "<span class='log-ok'>[  OK  ]</span> TLI burn complete. Velocity: 10.35 km/s." },
  { hour: 12, msg: "<span class='log-ok'>[  OK  ]</span> Solar panels fully deployed. Power grid active." },
  { hour: 24, msg: "<span class='log-burn'>[ BURN ]</span> MID-COURSE CORRECTION engine burn complete." },
  { hour: 48, msg: "<span class='log-link'>[ LINK ]</span> Deep space telemetry stable. Gravity crossover zone." },
  { hour: 70, msg: "<span class='log-link'>[ LINK ]</span> LUNAR GRAVITATIONAL PULL dominant. Preparing capture." },
  { hour: 72, msg: "<span class='log-burn'>[ RETRO]</span> LUNAR ORBIT INSERTION retro-burn active." },
  { hour: 74, msg: "<span class='log-ok'>[  OK  ]</span> Lunar orbit capture confirmed: 100km x 320km." },
  { hour: 100, msg: "<span class='log-warn'>[ ECLIP]</span> Solar shadow transit. Solar cells offline." },
  { hour: 102, msg: "<span class='log-ok'>[  OK  ]</span> Solar transit ended. Cells charging. Power grid 98%." },
  { hour: 130, msg: "<span class='log-ok'>[  OK  ]</span> Lunar orbital scan underway. Propellant status optimal." },
  { hour: 168, msg: "<span class='log-burn'>[ BURN ]</span> TRANS-EARTH INJECTION RETURN burn initialized." },
  { hour: 185, msg: "<span class='log-ok'>[  OK  ]</span> Escape trajectory confirmed. Leaving Lunar SOI." },
  { hour: 210, msg: "<span class='log-ok'>[  OK  ]</span> Atmospheric entry vectors loaded. Heat shield aligned." },
  { hour: 239.2, msg: "<span class='log-ok'>[  OK  ]</span> Command Capsule separation. Service module jettisoned." },
  { hour: 240, msg: "<span class='log-warn'>[ALERT ]</span> ATMOSPHERIC RE-ENTRY. Comms BLACKOUT." },
  { hour: 240.2, msg: "<span class='log-ok'>[  OK  ]</span> Plasma blackout terminated. Main chute deployed." },
  { hour: 240.5, msg: "<span class='log-ok'>[ SPLSH]</span> SPLASHDOWN CONFIRMED. Welcome home, Artemis." }
];

let lastLoggedHour = -1;

function updateTerminalLogs(activeStep) {
  const p = samplePositions[activeStep];
  const activeHour = p.timeSec / 3600;
  
  // Find all messages that occurred up to the current simulation time
  let consoleHTML = "";
  let needsScroll = false;
  
  terminalLogs.forEach(log => {
    if (activeHour >= log.hour) {
      consoleHTML += `<span style="color: var(--text-muted)">[T+${log.hour.toFixed(1)}h]</span> ${log.msg}<br>`;
      if (log.hour > lastLoggedHour) {
        needsScroll = true;
      }
    }
  });
  
  terminalFeed.innerHTML = consoleHTML + '<span class="cursor-glow">> </span>_';
  
  if (needsScroll) {
    terminalFeed.scrollTop = terminalFeed.scrollHeight;
    lastLoggedHour = activeHour;
  }
}

// -----------------------------------------------------------------------------
// 6. Playback State & HUD Binding
// -----------------------------------------------------------------------------
let currentIndex = 0;
let running = false;
let speedMultiplier = 5;

// DOM Bindings
const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');
const resetBtn = document.getElementById('reset');
const speedSelect = document.getElementById('speed');
const timeline = document.getElementById('timeline');
const metLabel = document.getElementById('met');
const distanceLabel = document.getElementById('distance');
const velocityLabel = document.getElementById('velocity');
const closestLabel = document.getElementById('closest');

const vectorCoords = document.getElementById('vector-coords');
const fuelBar = document.getElementById('fuel-bar');
const fuelVal = document.getElementById('fuel-val');
const powerBar = document.getElementById('power-bar');
const powerVal = document.getElementById('power-val');
const signalBar = document.getElementById('signal-bar');
const signalVal = document.getElementById('signal-val');

const cameraModeSelect = document.getElementById('camera-mode');
let cameraMode = 'craft'; // Default is chase cam

// Sound HUD Bindings
const soundToggle = document.getElementById('sound-toggle');
const soundSvg = document.getElementById('sound-svg');

const speakerOnPath = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
const speakerOffPath = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM19 12c0 3.28-1.97 6.12-4.8 7.3l.66 1.48C18.66 19.23 21 15.89 21 12s-2.34-7.23-6.14-8.78l-.66 1.48C17.03 5.88 19 8.72 19 12zM4.34 2.93L2.93 4.34 8.59 10H4v4h3l5 5v-6.59l5.07 5.07c-.71.55-1.5.99-2.37 1.28l.6 1.9c1.23-.41 2.36-1.09 3.32-1.97l2.14 2.14 1.41-1.41L4.34 2.93zM12 4L9.91 6.09 12 8.18V4z"/>`;

soundToggle.addEventListener('click', () => {
  const isMuted = synth.toggleMute();
  if (isMuted) {
    soundToggle.classList.add('muted');
    soundSvg.innerHTML = speakerOffPath;
  } else {
    soundToggle.classList.remove('muted');
    soundSvg.innerHTML = speakerOnPath;
    synth.playClick(0.2);
  }
});

// UI elements hover sound triggers
document.querySelectorAll('.control-btn, .hud-select, .speed-select, #camera-mode, .sound-btn').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    synth.playClick(0.04);
  });
});

// Setup control maxes
timeline.max = (samplePositions.length - 1).toString();

playBtn.addEventListener('click', () => {
  synth.init(); // Initialize context safely
  running = true;
  playBtn.classList.add('glow-btn');
  pauseBtn.classList.remove('glow-btn');
  synth.playClick(0.15);
});

pauseBtn.addEventListener('click', () => {
  running = false;
  playBtn.classList.remove('glow-btn');
  pauseBtn.classList.add('glow-btn');
  synth.playClick(0.15);
  updateEngineSound(currentIndex);
});

resetBtn.addEventListener('click', () => {
  running = false;
  currentIndex = 0;
  lastLoggedHour = -1;
  playBtn.classList.remove('glow-btn');
  pauseBtn.classList.remove('glow-btn');
  updateCraftPosition();
  synth.playClick(0.15);
  updateEngineSound(0);
});

speedSelect.addEventListener('change', () => {
  speedMultiplier = parseFloat(speedSelect.value);
});

timeline.addEventListener('input', () => {
  currentIndex = parseInt(timeline.value, 10);
  running = false;
  playBtn.classList.remove('glow-btn');
  pauseBtn.classList.add('glow-btn');
  updateCraftPosition();
});

// -----------------------------------------------------------------------------
// Maneuver Planner DOM Bindings & Real-Time Event Handlers
// -----------------------------------------------------------------------------
const burnSelect = document.getElementById('burn-select');
const proSlider = document.getElementById('dv-prograde');
const normSlider = document.getElementById('dv-normal');
const radSlider = document.getElementById('dv-radial');

const proVal = document.getElementById('dv-prograde-val');
const normVal = document.getElementById('dv-normal-val');
const radVal = document.getElementById('dv-radial-val');
const burnMagVal = document.getElementById('burn-mag');
const fuelBudgetVal = document.getElementById('fuel-budget');
const periTextLabel = document.getElementById('perigee-label');
const estPeriapsis = document.getElementById('est-periapsis');

function updateManeuverSlidersUI() {
  const activeDv = activeBurnEvent === 'tli' ? tliDv : (activeBurnEvent === 'loi' ? loiDv : teiDv);
  
  proSlider.value = activeDv.p.toString();
  normSlider.value = activeDv.n.toString();
  radSlider.value = activeDv.r.toString();
  
  if (activeBurnEvent === 'tli') {
    proSlider.min = "-200"; proSlider.max = "600";
    normSlider.min = "-200"; normSlider.max = "200";
    radSlider.min = "-200"; radSlider.max = "200";
  } else if (activeBurnEvent === 'loi') {
    proSlider.min = "-400"; proSlider.max = "100";
    normSlider.min = "-200"; normSlider.max = "200";
    radSlider.min = "-200"; radSlider.max = "200";
  } else if (activeBurnEvent === 'tei') {
    proSlider.min = "-100"; proSlider.max = "400";
    normSlider.min = "-200"; normSlider.max = "200";
    radSlider.min = "-200"; radSlider.max = "200";
  }
  
  updateValueLabels();
}

function updateValueLabels() {
  const activeDv = activeBurnEvent === 'tli' ? tliDv : (activeBurnEvent === 'loi' ? loiDv : teiDv);
  
  proVal.textContent = `${activeDv.p >= 0 ? '+' : ''}${activeDv.p.toFixed(0)} m/s`;
  normVal.textContent = `${activeDv.n >= 0 ? '+' : ''}${activeDv.n.toFixed(0)} m/s`;
  radVal.textContent = `${activeDv.r >= 0 ? '+' : ''}${activeDv.r.toFixed(0)} m/s`;
  
  const mag = Math.sqrt(activeDv.p*activeDv.p + activeDv.n*activeDv.n + activeDv.r*activeDv.r);
  burnMagVal.textContent = `${mag.toFixed(0)} m/s`;
}

function updateChartData() {
  speedData.length = 0;
  distData.length = 0;
  
  for (let i = 0; i <= TRAJ_LENGTH; i += 5) {
    const p = samplePositions[i];
    
    let vel = 0;
    if (i > 0) {
      const prev = samplePositions[i - 5];
      const dt = p.timeSec - prev.timeSec;
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const dz = p.z - prev.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      vel = dist / dt;
    } else {
      vel = 11.2;
    }
    speedData.push(vel);
    
    const dxM = EARTH_TO_MOON_KM - p.x;
    const dyM = -p.y;
    const dzM = -p.z;
    const distM = Math.sqrt(dxM*dxM + dyM*dyM + dzM*dzM);
    distData.push(distM);
  }
  
  telemetryChart.update('none');
}

function updateFlightAlertsStatus() {
  const appContainer = document.getElementById('app');
  const sysTag = document.querySelector('.panel-tag');
  
  if (!appContainer || !sysTag) return;
  
  appContainer.classList.remove('blackout-active');
  appContainer.classList.remove('crash-active');
  appContainer.classList.remove('success-active');
  sysTag.textContent = "SYS.STATUS: ACTIVE";
  sysTag.style.color = "";
  
  const activeBurn = burnSelect.value;
  
  const totalSpent = Math.sqrt(tliDv.p*tliDv.p + tliDv.n*tliDv.n + tliDv.r*tliDv.r) +
                     Math.sqrt(loiDv.p*loiDv.p + loiDv.n*loiDv.n + loiDv.r*loiDv.r) +
                     Math.sqrt(teiDv.p*teiDv.p + teiDv.n*teiDv.n + teiDv.r*teiDv.r);
  
  const tankLeft = Math.max(0, 3200 - totalSpent);
  fuelBudgetVal.textContent = `${tankLeft.toFixed(0)} m/s`;
  
  const fuelPct = (tankLeft / 3200) * 100;
  fuelBar.style.width = `${fuelPct}%`;
  fuelVal.textContent = `${fuelPct.toFixed(0)}%`;
  
  const fuelSensor = document.getElementById('fuel-sensor');
  if (fuelSensor) {
    fuelSensor.className = fuelPct < 20 ? 'sensor-dot alert' : 'sensor-dot';
  }
  
  if (fuelPct < 15) {
    synth.startLowFuelBeep();
  } else {
    synth.stopLowFuelBeep();
  }
  
  if (activeBurn === 'tli') {
    periTextLabel.textContent = "Est. Lunar Periapsis:";
    const r_p_M = 15000 + (tliDv.p * 15) - (tliDv.r * 45);
    const h_p_M = r_p_M - MOON_RADIUS_KM;
    
    if (h_p_M < 0) {
      estPeriapsis.textContent = "IMPACT";
      estPeriapsis.className = "numeric-val warning-pulse";
      appContainer.classList.add('crash-active');
      sysTag.textContent = "SYS.ALERT: IMPACT COURSE";
      sysTag.style.color = "var(--accent-red)";
      synth.startCrashSiren();
    } else {
      estPeriapsis.textContent = `${h_p_M.toFixed(0)} km`;
      estPeriapsis.className = "numeric-val";
      estPeriapsis.style.color = "";
      synth.stopCrashSiren();
    }
  } else if (activeBurn === 'loi') {
    periTextLabel.textContent = "Lunar Orbit State:";
    const isCaptured = loiDv.p <= -140;
    if (isCaptured) {
      estPeriapsis.textContent = "CAPTURED";
      estPeriapsis.className = "numeric-val";
      estPeriapsis.style.color = "hsl(120, 100%, 60%)";
    } else {
      estPeriapsis.textContent = "ESCAPE PATH";
      estPeriapsis.className = "numeric-val warning-pulse";
      estPeriapsis.style.color = "var(--accent-gold)";
    }
    synth.stopCrashSiren();
  } else if (activeBurn === 'tei') {
    periTextLabel.textContent = "Return Perigee Alt:";
    const r_p_ret = 6461 + (teiDv.p - 100) * 1.5 + teiDv.r * 3.0;
    const h_p_ret = r_p_ret - EARTH_RADIUS_KM;
    
    if (h_p_ret < 0) {
      estPeriapsis.textContent = "EARTH CRASH";
      estPeriapsis.className = "numeric-val warning-pulse";
      appContainer.classList.add('crash-active');
      sysTag.textContent = "SYS.ALERT: CRITICAL REENTRY";
      sysTag.style.color = "var(--accent-red)";
      synth.startCrashSiren();
    } else if (h_p_ret >= 60 && h_p_ret <= 120) {
      estPeriapsis.textContent = `${h_p_ret.toFixed(0)} km (SAFE)`;
      estPeriapsis.className = "numeric-val";
      estPeriapsis.style.color = "hsl(120, 100%, 60%)";
      appContainer.classList.add('success-active');
      sysTag.textContent = "SYS.STATUS: SAFE CORRIDOR";
      sysTag.style.color = "hsl(120, 100%, 60%)";
      synth.stopCrashSiren();
    } else {
      estPeriapsis.textContent = `${h_p_ret.toFixed(0)} km (SKIP)`;
      estPeriapsis.className = "numeric-val warning-pulse";
      estPeriapsis.style.color = "var(--accent-gold)";
      sysTag.textContent = "SYS.WARN: ATMOS SKIP-OFF";
      sysTag.style.color = "var(--accent-gold)";
      synth.stopCrashSiren();
    }
  }
}

function handleSliderChange() {
  const activeDv = activeBurnEvent === 'tli' ? tliDv : (activeBurnEvent === 'loi' ? loiDv : teiDv);
  
  activeDv.p = parseFloat(proSlider.value);
  activeDv.n = parseFloat(normSlider.value);
  activeDv.r = parseFloat(radSlider.value);
  
  updateValueLabels();
  
  synth.init(); // Initialize audio context on first slider touch
  synth.playBurnSweep();
  
  propagateTrajectory();
  
  // Re-sync 3D line points
  const points = samplePositions.map(p => new THREE.Vector3(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z)));
  trajectoryLine.geometry.setFromPoints(points);
  trajectoryLine.geometry.attributes.position.needsUpdate = true;
  
  updateGizmos();
  updateChartData();
  updateFlightAlertsStatus();
  updateCraftPosition();
}

burnSelect.addEventListener('change', () => {
  activeBurnEvent = burnSelect.value;
  updateManeuverSlidersUI();
  
  // Relocate 3D controls target to the active burn event
  const idx = activeBurnEvent === 'tli' ? 10 : (activeBurnEvent === 'loi' ? 300 : 700);
  if (samplePositions[idx]) {
    const p = samplePositions[idx];
    const burnPos = new THREE.Vector3(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z));
    controls.target.copy(burnPos);
    camera.position.copy(burnPos).add(new THREE.Vector3(-0.4, 0.25, 0.4));
    controls.update();
  }
  
  synth.playClick(0.12);
  updateGizmos();
  updateFlightAlertsStatus();
});

proSlider.addEventListener('input', handleSliderChange);
normSlider.addEventListener('input', handleSliderChange);
radSlider.addEventListener('input', handleSliderChange);

// Initialize active HUD telemetry fields at startup
setTimeout(() => {
  updateManeuverSlidersUI();
  updateFlightAlertsStatus();
}, 200);

cameraModeSelect.addEventListener('change', () => {
  cameraMode = cameraModeSelect.value;
  
  // Orbit controls are always active in all modes to allow drag and zoom
  controls.enabled = true;
  
  const idx = Math.max(0, Math.min(Math.floor(currentIndex), samplePositions.length - 1));
  const p = samplePositions[idx];
  const craftPos = new THREE.Vector3(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z));
  
  if (cameraMode === 'craft') {
    // Snap target to the spacecraft and position camera to a nice chase offset
    controls.target.copy(craftPos);
    camera.position.copy(craftPos).add(new THREE.Vector3(-0.5, 0.3, 0.5));
    controls.update();
  } else if (cameraMode === 'earth') {
    const earthPos = new THREE.Vector3(0, 0, 0);
    controls.target.copy(earthPos);
    // Snap camera to orbit Earth at a good visualization distance
    camera.position.set(2.5, 1.5, 2.5);
    controls.update();
  } else if (cameraMode === 'moon') {
    const moonPos = moonMesh.position;
    controls.target.copy(moonPos);
    // Snap camera near the Moon's orbital sphere
    camera.position.copy(moonPos).add(new THREE.Vector3(-0.15, 0.08, 0.15));
    controls.update();
  } else if (cameraMode === 'free') {
    // Keep target at spacecraft position to avoid snapping
    controls.target.copy(craftPos);
    controls.update();
  }
});
// Initialize controls enabled state on startup (always enabled for interactive control)
controls.enabled = true;

// Display static closest approach (refined number only)
closestLabel.textContent = closestDistanceKm.toFixed(0);
document.getElementById('closest-unit').style.display = 'inline-block';

// Date Formatter Helper (HH:MM:SS)
function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// -----------------------------------------------------------------------------
// 7. Dynamic HUD Metrics & Physics Update Loop
// -----------------------------------------------------------------------------
function updateCraftPosition() {
  const idx = Math.max(0, Math.min(Math.floor(currentIndex), samplePositions.length - 1));
  const p = samplePositions[idx];
  
  // 1. Move craft in 3D Space
  craftGroup.position.set(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z));
  
  // Align spacecraft nose to trajectory orientation vectors
  const nextIdx = Math.min(idx + 1, samplePositions.length - 1);
  const pNext = samplePositions[nextIdx];
  scratchDir.set(pNext.x - p.x, pNext.y - p.y, pNext.z - p.z).normalize();
  if (scratchDir.lengthSq() > 0.0001) {
    // Standard quaternion looking forward along trajectory
    scratchQuat.setFromUnitVectors(upVector, scratchDir);
    craftGroup.quaternion.copy(scratchQuat);
  }
  
  // 2. Sync timeline UI scrub slider value without circular triggers
  timeline.value = idx.toString();
  
  // Update timeline range progress fill-track dynamically
  const pct = (idx / (samplePositions.length - 1)) * 100;
  timeline.style.background = `linear-gradient(to right, var(--accent-cyan) 0%, var(--accent-cyan) ${pct}%, hsla(222, 30%, 25%, 0.6) ${pct}%, hsla(222, 30%, 25%, 0.6) 100%)`;
  
  // 3. Update active scrubber vertical line on Chart.js
  telemetryChart.activeScrubberIndex = idx;
  telemetryChart.update('none'); // Update without animation for raw performance
  
  // 4. Update basic telemetry readouts (refined numbers only)
  metLabel.textContent = formatTime(p.timeSec);
  
  const dx = EARTH_TO_MOON_KM - p.x;
  const dy = -p.y;
  const dz = -p.z;
  const distKm = Math.sqrt(dx * dx + dy * dy + dz * dz);
  distanceLabel.textContent = distKm.toFixed(0);
  
  // Exact Velocity vector calculation (km/s)
  let velocityVal = 0;
  if (idx > 0) {
    const prev = samplePositions[idx - 1];
    const dt = p.timeSec - prev.timeSec;
    const dxv = p.x - prev.x;
    const dyv = p.y - prev.y;
    const dzv = p.z - prev.z;
    const distTravelKm = Math.sqrt(dxv*dxv + dyv*dyv + dzv*dzv);
    velocityVal = distTravelKm / dt;
    velocityLabel.textContent = velocityVal.toFixed(3);
  } else {
    velocityVal = 11.2;
    velocityLabel.textContent = '11.200';
  }
  
  // 5. Update 3D Cartesian coordinates vectors readout
  vectorCoords.innerHTML = `
    X: ${p.x >= 0 ? '+' : ''}${p.x.toFixed(1)}<br>
    Y: ${p.y >= 0 ? '+' : ''}${p.y.toFixed(1)}<br>
    Z: ${p.z >= 0 ? '+' : ''}${p.z.toFixed(1)}
  `;
  
  // 6. Interactive System Diagnostics (Fuel, Power, Signals) based on active state
  // Propellant
  // Dynamic fuel drainage during play loop based on active planned maneuvers
  let plannedFuel = 3200;
  if (idx <= 10) {
    plannedFuel = 3200;
  } else if (idx <= 300) {
    plannedFuel = 3200 - tliCost * Math.min(1, (idx - 10) / 15);
  } else if (idx <= 700) {
    plannedFuel = 3200 - tliCost - loiCost * Math.min(1, (idx - 300) / 15);
  } else {
    plannedFuel = 3200 - tliCost - loiCost - teiCost * Math.min(1, (idx - 700) / 15);
  }
  const fuelLevel = Math.max(0, (plannedFuel / 3200) * 100);
  
  fuelBar.style.width = `${fuelLevel}%`;
  fuelVal.textContent = `${fuelLevel.toFixed(0)}%`;

  const fuelSensor = document.getElementById('fuel-sensor');
  if (fuelSensor) {
    fuelSensor.className = fuelLevel < 20 ? 'sensor-dot alert' : (fuelLevel < 50 ? 'sensor-dot warning' : 'sensor-dot');
  }
  
  // Power Grid (Fluctuates during solar shadow transits behind Moon)
  // Behind Moon is roughly Phase 2 (idx 300-700) when spacecraft X exceeds Moon X
  const isBehindMoon = p.x > (EARTH_TO_MOON_KM + 1000);
  let powerLevel = 98 - Math.sin(idx * 0.05) * 1.5;
  if (isBehindMoon) {
    powerLevel = Math.max(82, 98 - (Math.max(0, idx - 400) * 0.12)); // eclipse drops power
  }
  powerBar.style.width = `${powerLevel.toFixed(0)}%`;
  powerVal.textContent = `${powerLevel.toFixed(0)}%`;

  const powerSensor = document.getElementById('power-sensor');
  if (powerSensor) {
    powerSensor.className = powerLevel < 85 ? 'sensor-dot warning' : 'sensor-dot';
  }
  
  // Comms Signals (degrades with distance to Earth, completely drops behind Moon)
  let signalStrength = 100;
  const appContainer = document.getElementById('app');
  const signalSensor = document.getElementById('signal-sensor');
  
  if (isBehindMoon) {
    signalStrength = 0;
    signalBar.style.width = '0%';
    signalVal.textContent = 'NO SIGNAL';
    signalVal.className = 'value numeric warning-pulse';
    
    // Visual blackout flashing panel alarm
    if (appContainer) appContainer.classList.add('blackout-active');
    if (signalSensor) signalSensor.className = 'sensor-dot alert';
    
    // Play Web Audio warning siren
    synth.startBlackoutAlarm();
  } else {
    signalStrength = Math.min(100, Math.max(22, Math.floor(100 - (p.x / EARTH_TO_MOON_KM) * 28 + Math.sin(idx * 0.1) * 2)));
    signalBar.style.width = `${signalStrength}%`;
    signalVal.textContent = `${signalStrength}%`;
    signalVal.className = 'value numeric';
    
    if (appContainer) appContainer.classList.remove('blackout-active');
    if (signalSensor) {
      signalSensor.className = signalStrength < 50 ? 'sensor-dot warning' : 'sensor-dot';
    }
    
    // Stop Web Audio warning siren
    synth.stopBlackoutAlarm();
  }
  
  // 7. Update active typewriter milestone tags highlights
  const milestoneList = document.querySelectorAll('#events li');
  milestoneList.forEach((el, index) => {
    el.classList.remove('active', 'passed');
    // Map milestone indices to timeline sectors
    // 0: T+00:00 Launch (step 0)
    // 1: T+02:30 TLI (step 10)
    // 2: T+24:00 MCC (step 100)
    // 3: T+72:00 LOI (step 300)
    // 4: T+168:00 Return (step 700)
    // 5: T+240:00 Re-entry (step 1000)
    const boundaries = [0, 10, 100, 300, 700, 1000];
    if (idx >= boundaries[index]) {
      if (index === 5 || idx < boundaries[index + 1]) {
        el.classList.add('active');
      } else {
        el.classList.add('passed');
      }
    }
  });

  const eventsSensor = document.getElementById('events-sensor');
  if (eventsSensor) {
    const activeMilestone = document.querySelector('#events li.active');
    eventsSensor.className = activeMilestone ? 'sensor-dot' : 'sensor-dot warning';
  }
  
  // 8. Update Typewriter Terminal feed
  updateTerminalLogs(idx);

  // 9. Update 3D gradient fading trail line
  updateTrailGeometry(idx);

  // 12. Update 3D DSN Tracking Link coordinates (dynamically lock onto closest visible ground station)
  let activeStationName = null;
  let minStationDistance = Infinity;
  scratchStartPoint.set(0, 0, 0); // Default fallback is Earth center
  
  stationMeshes.forEach(s => {
    // Get absolute station world position as it rotates with Earth (uses pre-allocated scratchWorldPos)
    s.group.getWorldPosition(scratchWorldPos);
    
    // Normal vector pointing outward from Earth's center (uses pre-allocated scratchNormal)
    scratchNormal.copy(scratchWorldPos).normalize();
    // Distance to craft (uses pre-allocated scratchToCraft)
    scratchToCraft.copy(craftGroup.position).sub(scratchWorldPos);
    const hasLineOfSight = scratchNormal.dot(scratchToCraft) > 0;
    
    if (hasLineOfSight) {
      const dist = scratchToCraft.length();
      if (dist < minStationDistance) {
        minStationDistance = dist;
        activeStationName = s.name;
        scratchStartPoint.copy(scratchWorldPos);
      }
    }
  });

  // Calculate coordinates. Fallback to Earth center if behind moon (signal lost)
  if (isBehindMoon) {
    scratchStartPoint.set(0, 0, 0);
  }
  
  const dsnPositions = dsnLinkLine.geometry.attributes.position.array;
  dsnPositions[0] = scratchStartPoint.x;
  dsnPositions[1] = scratchStartPoint.y;
  dsnPositions[2] = scratchStartPoint.z;
  dsnPositions[3] = kmToScene(p.x);
  dsnPositions[4] = kmToScene(p.y);
  dsnPositions[5] = kmToScene(p.z);
  dsnLinkLine.geometry.attributes.position.needsUpdate = true;

  // 10. Telemetry data step click sound (Rhythmic chatter)
  if (idx !== lastStepIdx) {
    synth.playDataStep();
    lastStepIdx = idx;
  }

  // 11. Manage active thruster combustion rumble sounds
  updateEngineSound(idx);
}

// Track states for sound step updates
let lastStepIdx = -1;
let isRumbling = false;

function updateEngineSound(activeIdx) {
  if (!running) {
    if (isRumbling) {
      synth.stopEngineRumble();
      isRumbling = false;
    }
    return;
  }
  
  // Active thruster burn sectors:
  // - SLS Launch & Ascent: Step 0 -> 22 (Hour 0 -> 5.28)
  // - LOI Retroburn: Step 300 -> 315 (Hour 72 -> 75.6)
  // - TEI Return Burn: Step 700 -> 715 (Hour 168 -> 171.6)
  const isBurning = (activeIdx >= 0 && activeIdx <= 22) || 
                    (activeIdx >= 300 && activeIdx <= 315) || 
                    (activeIdx >= 700 && activeIdx <= 715);
  
  if (isBurning) {
    if (!isRumbling) {
      synth.startEngineRumble();
      isRumbling = true;
    }
  } else {
    if (isRumbling) {
      synth.stopEngineRumble();
      isRumbling = false;
    }
  }
}

// -----------------------------------------------------------------------------
// 8. Dynamic Camera Physics Update & Rendering Loop
// -----------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  
  // 1. Advance simulation index
  if (running) {
    currentIndex += 0.4 * speedMultiplier;
    if (currentIndex >= samplePositions.length) {
      currentIndex = samplePositions.length - 1;
      running = false;
      playBtn.classList.remove('glow-btn');
      updateEngineSound(currentIndex); // shut off engines when simulation ends
    }
    updateCraftPosition();
  }
  
  // 2. Slow orbital cloud and tactical ring rotations
  cloudsMesh.rotation.y += 0.0003;
  earthMesh.rotation.y += 0.00015;
  moonMesh.rotation.y += 0.00008;
  
  earthRingMesh.rotation.z -= 0.0005;
  moonRingMesh.rotation.z += 0.001;
  
  // Pulse and rotate the 3D spacecraft wireframe target reticle
  reticleMesh.rotation.y += 0.015;
  reticleMesh.rotation.x += 0.008;
  reticleMat.opacity = 0.22 + Math.sin(Date.now() * 0.005) * 0.16;
  
  // Pulse and animate the DSN communication tracking link beam continuously
  const dsnActiveIdx = Math.max(0, Math.min(Math.floor(currentIndex), samplePositions.length - 1));
  const dsnActiveP = samplePositions[dsnActiveIdx];
  const dsnBehindMoon = dsnActiveP.x > (EARTH_TO_MOON_KM + 1000);
  
  if (dsnBehindMoon) {
    dsnLinkLine.material.color.setHex(0xff3333); // warning red
    dsnLinkLine.material.opacity = Math.max(0, 0.45 * (0.3 + Math.sin(Date.now() * 0.035) * 0.7)); // rapid alarm flash
  } else {
    // Dynamic color fade: alert if comms signal is low, cyan if locked nominal
    dsnLinkLine.material.color.setHex(0x37c0ff); // locked cyan
    dsnLinkLine.material.opacity = 0.35 + Math.sin(Date.now() * 0.005) * 0.15; // slow pulsing lock
  }

  // Animate the 3D Ground Station pulsing signal rings
  stationMeshes.forEach(s => {
    const scale = 1.0 + Math.sin(Date.now() * 0.007 + s.group.position.x) * 0.45;
    s.group.children[1].scale.set(scale, scale, 1);
    s.ringMat.opacity = 0.8 - (scale - 1.0) * 0.8;
  });
  
  // 3. Sub-pixel Translation Tracking Algorithm
  const idx = Math.max(0, Math.min(Math.floor(currentIndex), samplePositions.length - 1));
  const p = samplePositions[idx];
  scratchCraftPos.set(kmToScene(p.x), kmToScene(p.y), kmToScene(p.z));
  
  let activeTarget = null;
  if (cameraMode === 'craft') {
    activeTarget = scratchCraftPos;
  } else if (cameraMode === 'earth') {
    activeTarget = scratchZero;
  } else if (cameraMode === 'moon') {
    activeTarget = moonMesh.position;
  }
  
  if (activeTarget !== null) {
    // Compute displacement delta from current controls target (uses pre-allocated scratchDelta)
    scratchDelta.copy(activeTarget).sub(controls.target);
    // Add translation delta to both camera position and controls target to preserve offset/angle
    camera.position.add(scratchDelta);
    controls.target.copy(activeTarget);
  }
  
  // Orbit controls update (damping + user inputs) is processed every frame in all modes
  controls.update();
  renderer.render(scene, camera);
}

// Initial kickoff
updateCraftPosition();
animate();

// Sidebar collapse & slide transition handlers
const toggleLeft = document.getElementById('toggle-left');
const toggleRight = document.getElementById('toggle-right');
const panelLeft = document.querySelector('.panel-left');
const panelRight = document.querySelector('.panel-right');

toggleLeft.addEventListener('click', () => {
  synth.init();
  synth.playClick(0.18);
  panelLeft.classList.toggle('collapsed');
  toggleLeft.textContent = panelLeft.classList.contains('collapsed') ? '▶' : '◀';
});

toggleRight.addEventListener('click', () => {
  synth.init();
  synth.playClick(0.18);
  panelRight.classList.toggle('collapsed');
  toggleRight.textContent = panelRight.classList.contains('collapsed') ? '◀' : '▶';
});

/**
 * Fully disposes of a 3D object and its associated GPU assets.
 * Conforms to Section 4.1 of rule.md for WebGL memory management.
 * @param {THREE.Object3D} obj - The object to clean up.
 */
export function disposeHierarchy(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => disposeMaterial(mat));
        } else {
          disposeMaterial(child.material);
        }
      }
    }
  });
}

function disposeMaterial(material) {
  material.dispose();
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && typeof value.dispose === 'function') {
      value.dispose();
    }
  }
}