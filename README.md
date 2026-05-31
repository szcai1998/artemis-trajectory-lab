
<div align="center">

```
 █████╗ ██████╗ ████████╗███████╗███╗   ███╗██╗███████╗
██╔══██╗██╔══██╗╚══██╔══╝██╔════╝████╗ ████║██║██╔════╝
███████║██████╔╝   ██║   █████╗  ██╔████╔██║██║███████╗
██╔══██║██╔══██╗   ██║   ██╔══╝  ██║╚██╔╝██║██║╚════██║
██║  ██║██║  ██║   ██║   ███████╗██║ ╚═╝ ██║██║███████║
╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝     ╚═╝╚═╝╚══════╝

████████╗██████╗  █████╗      ██╗███████╗ ██████╗████████╗ ██████╗ ██████╗ ██╗   ██╗    ██╗      █████╗ ██████╗
╚══██╔══╝██╔══██╗██╔══██╗     ██║██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝    ██║     ██╔══██╗██╔══██╗
   ██║   ██████╔╝███████║     ██║█████╗  ██║        ██║   ██║   ██║██████╔╝ ╚████╔╝     ██║     ███████║██████╔╝
   ██║   ██╔══██╗██╔══██║██   ██║██╔══╝  ██║        ██║   ██║   ██║██╔══██╗  ╚██╔╝      ██║     ██╔══██║██╔══██╗
   ██║   ██║  ██║██║  ██║╚█████╔╝███████╗╚██████╗   ██║   ╚██████╔╝██║  ██║   ██║       ███████╗██║  ██║██████╔╝
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚════╝ ╚══════╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝       ╚══════╝╚═╝  ╚═╝╚═════╝
```

**A high-fidelity, real-time 3D mission control visualizer for the NASA Artemis lunar program.**  
*Zero-build · Zero-dependencies · 100% client-side · Pure Web Standards*

---

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-v0.154-000000?style=for-the-badge&logo=three.js&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-v4.4-FF6384?style=for-the-badge&logo=chart.js&logoColor=white)
![WebAudio](https://img.shields.io/badge/Web_Audio_API-Procedural_Synth-8A2BE2?style=for-the-badge)

[![License: MIT](https://img.shields.io/badge/License-MIT-00d4ff.svg?style=for-the-badge)](LICENSE)
![Zero Build](https://img.shields.io/badge/Build-Zero_Config-00c851?style=for-the-badge)
![Static](https://img.shields.io/badge/Deployment-Static_HTML-gold?style=for-the-badge)

</div>

---

## 🚀 Overview

**Artemis Trajectory Lab** is a premium, immersive aerospace dashboard that simulates a complete Earth–Moon–Earth mission profile in real time. Inspired by NASA's Artemis program and mission control HUD aesthetics, it renders a fully 3D interactive space environment directly in the browser — no server, no build step, no install required.

Point it at a local HTTP server and you have a stunning mission command center running in seconds.

> *"This is not a demo. This is a mission."*

---

## ✨ Feature Highlights

### 🌍 Procedural 3D World Rendering
Every texture is generated **algorithmically at runtime** on an offscreen HTML Canvas — no image files, no CDN assets:

| Body | Generation Method |
|------|-------------------|
| **Earth** | Multi-octave continent blobs with jagged coastlines, mountain ranges, polar ice caps, and a cloud layer sphere |
| **Night Lights** | Radial-gradient city clusters distributed across each continent, glowing amber/gold |
| **Moon** | Slate-grey base with dark lunar maria (seas), 150 multi-scale impact craters, ejecta ray lines, and shadow overlays |
| **Cloud Layer** | Swirling fibrous cloud formations using overlapping trigonometric curves |
| **Starfield** | 1,800 procedurally placed point stars with per-vertex color (ice-blue, warm-amber, pure white) and soft glow textures |

### 🛸 Patched-Conic Trajectory Engine
The spacecraft follows a **Keplerian orbital mechanics model** with three distinct mission phases:

```
Phase 1: Earth Departure Ellipse      (Steps 0   → 300)
         └─ Newton-Raphson Kepler solver (5-iteration)
         └─ Eccentric → True anomaly conversion
         └─ Orbital node & inclination rotation matrix

Phase 2: Lunar Flyby / Capture Orbit  (Steps 300 → 700)
         └─ Hyperbolic trajectory (unbound) OR
         └─ Elliptical lunar orbit (LOI capture threshold: ΔVp ≤ −140 m/s)
         └─ Smooth 40-step LERP blending between phases

Phase 3: Earth Return Ellipse         (Steps 700 → 1000)
         └─ TEI burn modifies Earth re-entry perigee altitude
         └─ Deep-space escape trajectory (if TLI ΔV > 350 m/s)
```

### 🎛️ Interactive Maneuver Planner
Design your own burns with three delta-V axes per maneuver event:

| Axis | Range | Effect |
|------|-------|--------|
| **Prograde / Retrograde** | ±500 m/s | Raises/lowers apogee; controls lunar capture |
| **Normal / Antinormal** | ±200 m/s | Tilts orbital plane inclination |
| **Radial-In / Out** | ±200 m/s | Rotates ascending node; adjusts periapsis |

- **Total ΔV budget**: 3,200 m/s (enforced with proportional scaling)
- **Live periapsis estimator** updates in real time as you move sliders
- **3D maneuver gizmo arrows** — Prograde (green), Normal (magenta), Radial (cyan) — appear in the 3D scene at the selected burn point

### 📡 Real-Time HUD Telemetry
Every frame, the following are synchronized simultaneously:

- 🕐 **Mission Elapsed Time** (MET) — hours:minutes:seconds
- 📏 **Distance to Moon** — km, live
- ⚡ **Spacecraft Velocity** — km/s, derived from orbital mechanics
- 🎯 **Closest Approach** — minimum Moon distance computed across entire trajectory
- 📐 **Cartesian Coordinates (XYZ)** — km, in Earth-centered inertial frame
- 🔋 **System Health bars** — Propellant (LH₂/LOX), Power Grid, Comms Signal (DSN)

### 📊 Synchronized Chart.js Telemetry Graph
- Live **velocity vs. time** curve rendered in the bottom panel
- A **glowing vertical cursor line** tracks the current mission time in real time during playback and timeline scrubbing

### 📷 Multi-Mode Camera System
Four tracking modes with smooth `lerp` transitions:

| Mode | Description |
|------|-------------|
| **Free Orbit** | Full manual OrbitControls with damping |
| **Chase Cam** | Camera follows spacecraft with smooth lag (`lerp = 0.05`) |
| **Earth Lock** | Camera orbits locked onto Earth center |
| **Moon Lock** | Camera orbits locked onto Moon center |

### 🎵 Procedural Audio Engine (Web Audio API)
A fully **synthesized** sound design — zero audio files:

| Sound | Synthesis Method |
|-------|-----------------|
| **UI Click / Chime** | Sweeping sine wave, 1400→2400 Hz, 50ms |
| **Engine Rumble** | Lowpass-filtered white noise + 52 Hz triangle oscillator + 9.5 Hz LFO tremolo |
| **Comms Blackout Alarm** | Detuned sawtooth+triangle pair with 1.8 Hz LFO pitch modulation through lowpass filter |
| **Fuel Low Warning** | Periodic 920 Hz sine chime every 1.8 s |
| **Crash Hazard Siren** | Sawtooth sweep 380→540 Hz every 450 ms |
| **Maneuver Sweep** | Triangle pitch drop 600→~170 Hz on slider interaction |

---

## 🖥️ Architecture

```
artemis_trajectory_lab/
│
├── index.html          ← Semantic HTML5 shell: HUD panels, controls, Chart.js canvas
├── styles.css          ← Vanilla CSS3 design system: glassmorphism, Orbitron/Inter fonts,
│                          custom scrollbars, scanline overlays, responsive layout
├── main.js             ← ES6 module: Three.js scene, orbital mechanics, HUD sync,
│                          Chart.js graph, camera modes, maneuver planner
└── audio.js            ← ES6 module: Web Audio API procedural sound synthesizer
```

### Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (No Build Step)                   │
│                                                              │
│  ┌───────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │  index.html│   │  styles.css  │   │    main.js (ESM) │   │
│  │  (Structure)   │  (Glassmorphism)  │  (3D + Physics)  │   │
│  └───────────┘   └──────────────┘   └────────┬─────────┘   │
│                                               │              │
│                             ┌─────────────────┴──────────┐  │
│                             │         audio.js (ESM)      │  │
│                             │  (Web Audio API Synth)      │  │
│                             └────────────────────────────┘  │
│                                                              │
│  CDN Libraries (unpkg / jsdelivr):                          │
│  ├── Three.js v0.154.0  (WebGL 3D renderer)                 │
│  ├── OrbitControls      (Camera mouse navigation)           │
│  └── Chart.js v4.4.0    (Telemetry graph)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design System

The UI follows a **dark aerospace HUD** aesthetic using strict CSS custom properties:

```css
:root {
  --bg-color:      hsl(222, 47%,  7%);   /* Deep space navy              */
  --panel-bg:      hsla(222, 47%, 10%, 0.75); /* Glassmorphism panels    */
  --panel-border:  hsla(215, 20%, 40%, 0.4);  /* Subtle frosted border   */
  --accent-cyan:   hsl(198, 100%, 61%);  /* Primary HUD highlight        */
  --accent-blue:   hsl(210, 100%, 50%);  /* Secondary accent             */
  --accent-gold:   hsl( 45, 100%, 50%);  /* Warning / active event       */
  --accent-red:    hsl(  0, 100%, 60%);  /* Critical alert               */
  --text-primary:  hsl(214,  32%, 91%);  /* Main readable text           */
  --text-muted:    hsl(215,  16%, 57%);  /* Secondary / label text       */
}
```

**Typography**:
- `'Orbitron'` — HUD titles, numeric readouts  
- `'Share Tech Mono'` — terminal feeds, Cartesian coordinates  
- `'Inter'` — body text, control labels  

**Panel Style**: `backdrop-filter: blur(12px) saturate(180%)` glassmorphism with cyan glow border shadows.

---

## ⚡ Getting Started

### Prerequisites

- A modern browser (Chrome 90+, Firefox 90+, Edge 90+) with WebGL support
- Python 3 (for the local server) — or any static file server

### Run Locally

```bash
# Clone the repository
git clone https://github.com/your-username/artemis_trajectory_lab.git
cd artemis_trajectory_lab

# Start the development server
python3 -m http.server 8000

# Open in your browser
# → http://localhost:8000
```

> ⚠️ **Must use a local HTTP server.** Opening `index.html` directly as a `file://` URL will block ES module imports due to browser CORS policy.

---

## 🕹️ Controls & Usage

### Playback Controls

| Control | Action |
|---------|--------|
| **▶ PLAY** | Start mission simulation |
| **⏸ PAUSE** | Freeze simulation |
| **↩ RESET** | Return to launch |
| **TIME COMPRESSION** | 1× · 5× · 20× speed multiplier |
| **Timeline Scrubber** | Drag to any mission moment |

### Maneuver Planner

1. Select the **Target Burn Event** (TLI, LOI, or TEI) from the dropdown
2. Adjust the three **delta-V sliders** (Prograde, Normal, Radial)
3. Watch the trajectory path **recalculate live** in 3D
4. Monitor the **Maneuver Cost** and **Tank ΔV Remaining** budget display
5. Observe the **3D gizmo arrows** at the burn point update in real time

### Camera Modes

- **Free Orbit** — drag to rotate, scroll to zoom, right-drag to pan
- **Chase Cam** — smooth auto-follow behind the spacecraft
- **Earth / Moon Lock** — orbit the selected body with manual controls

### Audio

Click the **speaker icon** (top-left panel) to toggle the procedural audio engine.  
Engine rumble activates during burn phases; alarms trigger on low fuel or signal loss.

---

## 🔬 Orbital Mechanics Deep Dive

The trajectory propagator uses **patched conic approximation** — the standard simplification used in real preliminary mission planning:

### Kepler's Equation Solver
Each phase solves **M = E − e·sin(E)** (Kepler's Equation) using Newton-Raphson iteration (5 steps):

```javascript
let E = M;  // Initial guess: eccentric anomaly ≈ mean anomaly
for (let iter = 0; iter < 5; iter++) {
  E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
}
// Convert to true anomaly θ
const sinTheta = (Math.sqrt(1 - e²) * sin(E)) / (1 - e·cos(E));
const cosTheta = (cos(E) - e) / (1 - e·cos(E));
const theta = atan2(sinTheta, cosTheta);
```

### Phase Transitions
Phase boundaries use **40-step linear interpolation** to ensure trajectory continuity (no teleporting):

```
Steps 280–320: Phase 1 ──LERP──▶ Phase 2
Steps 680–720: Phase 2 ──LERP──▶ Phase 3
```

### Coordinate Scale
```
1 Three.js scene unit = 100,000 km  (SCALE = 100,000)

Earth radius:        6,371 km   →  0.06371 scene units
Moon radius:         1,737 km   →  0.01737 scene units
Earth-Moon distance: 384,400 km →  3.844   scene units
```

---

## 🛰️ Mission Milestones

| MET | Event | Description |
|-----|-------|-------------|
| `T+00:00` | **Launch & Ascent** | Liftoff from Kennedy Space Center |
| `T+02:30` | **Trans-Lunar Injection (TLI)** | SLS upper stage burn to escape Earth orbit |
| `T+24:00` | **Mid-Course Correction** | Minor trajectory adjustment burn |
| `T+72:00` | **Lunar Orbit Insertion (LOI)** | Retrograde burn to capture into lunar orbit |
| `T+168:00` | **Trans-Earth Injection (TEI)** | Departure burn from Moon |
| `T+240:00` | **Atmospheric Re-Entry** | Orion capsule splashdown |

---

## 🌐 DSN Ground Stations

Three real Deep Space Network tracking stations are modeled on the rotating Earth surface:

| Station | Location | Coordinates |
|---------|----------|-------------|
| **Goldstone** | California, USA | 35.4°N, 116.8°W |
| **Madrid** | Spain | 40.4°N, 4.2°W |
| **Canberra** | Australia | 35.4°S, 149.0°E |

A live **DSN link beam** (cyan line) connects the nearest station to the spacecraft in real time.

---

## 📐 Spacecraft Model

The Orion spacecraft is built from **Three.js primitive geometries** — no external 3D model files:

```
┌─────────────────────────────────────────────────┐
│  Component          │ Geometry    │ Color         │
├─────────────────────┼─────────────┼───────────────┤
│  Command Module     │ Cone        │ Gold (#dcae3b)│
│  Service Module     │ Cylinder    │ Silver        │
│  Engine Nozzle      │ Open Cone   │ Dark grey     │
│  Solar Array (×2)   │ Box         │ Dark blue     │
│  Targeting Reticle  │ Wireframe   │ Cyan, 35% α   │
│                     │ Octahedron  │               │
└─────────────────────┴─────────────┴───────────────┘
```

A **60-point gradient trail** fades from deep navy → brilliant cyan behind the spacecraft using additive blending.

---

## 🤝 Contributing

Contributions are welcome! Here are some ideas for improvements:

- [ ] Add Moon surface landing phase (descent orbit)  
- [ ] Implement Hohmann transfer calculator overlay  
- [ ] Add real Artemis I trajectory data import (JSON)  
- [ ] Multi-body gravity simulation (Earth + Moon + Sun)  
- [ ] Astronaut EVA sequence visualization  
- [ ] Export trajectory as CSV / KML  

Please open an issue first to discuss major changes.

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ for the spirit of exploration**

*"We choose to go to the Moon not because it is easy, but because it is hard."*  
— President John F. Kennedy, 1962

---

🌙 **Artemis Trajectory Lab** — *Explore the trajectory. Fly the mission.*

</div>
