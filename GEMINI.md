# GEMINI.md - Artemis Trajectory Lab Guidelines

This document outlines the development guidelines, run commands, tech stack structure, design tokens, and coding conventions for the Artemis Trajectory Lab. Any agent (main agent or subagent) editing this codebase must adhere strictly to these rules.

---

## 1. Run & Build Commands

* **Local Development Server**: Start a simple HTTP server using Python 3:
  ```bash
  python3 -m http.server 8000
  ```
* **Production Build**: None. This is a static, zero-build client-side web application. Do not install compilers, bundlers, or transpilers unless explicitly requested.

---

## 2. Tech Stack Architecture

* **HTML**: HTML5 semantic structure. Avoid inline styling or script blocks; structure remains strictly in `index.html`.
* **CSS**: Vanilla CSS3 with standard CSS custom variables for design tokens. Responsive layout that adapts between desktop and mobile viewport sizes.
* **JavaScript**: Modern ES6 modules (`type="module"`).
* **Third-Party Libraries (CDN)**:
  * **Three.js** (v0.154.0): For 3D scene rendering.
  * **OrbitControls**: For 3D camera mouse navigation.
  * **Chart.js** (v4.4.0+): For rendering real-time synchronized telemetry graphs.

---

## 3. Premium Design System (HUD Theme)

To maintain a professional, high-fidelity dark-mode aerospace dashboard (reminiscent of professional mission control visualizers), use the following styling standards:

### HSL Color Tokens
All styling must utilize the following CSS variables defined in `:root`:
```css
:root {
  --bg-color: hsl(222, 47%, 7%);
  --panel-bg: hsla(222, 47%, 10%, 0.75);
  --panel-border: hsla(215, 20%, 40%, 0.4);
  --accent-cyan: hsl(198, 100%, 61%);
  --accent-blue: hsl(210, 100%, 50%);
  --accent-gold: hsl(45, 100%, 50%);
  --accent-red: hsl(0, 100%, 60%);
  --text-primary: hsl(214, 32%, 91%);
  --text-muted: hsl(215, 16%, 57%);
}
```

### Visual Styling
* **Glassmorphism**: HUD panels must feature a translucent backdrop blur:
  ```css
  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  backdrop-filter: blur(12px) saturate(180%);
  ```
* **Typography**:
  * HUD Titles & Numeric Telemetry: `'Orbitron'`, sans-serif;
  * Code Terminal & Live Logging: `'Share Tech Mono'`, monospace;
  * Body Text & Control Labels: `'Inter'`, sans-serif;
* **Micro-details**: Implement subtle scanner lines, glowing cyan borders (`box-shadow: 0 0 10px hsla(198, 100%, 61%, 0.2)`), and custom narrow scrollbars.

---

## 4. Coding Conventions & Constraints

### Procedural 3D Textures (No Static Asset Dependencies)
* **Earth Texture**: Generate programmatically on an offscreen HTML Canvas (1024x512) using multi-octave 2D Simplex/Perlin-style noise to draw deep blue oceans and green/brown continents, layered with a secondary rotating semi-translucent cloud sphere.
* **Moon Texture**: Generate programmatically on an offscreen HTML Canvas (512x256) using a slate-grey fill layered with multiple sizes of overlapping light-grey craters, ejecta ray lines, and dark-grey shadow overlays.
* **Loading Textures**: Use `THREE.CanvasTexture(canvas)` to convert dynamic canvases to 3D materials.

### 3D Coordinates & Physics
* Trajectory math scales coordinates using `SCALE = 100000` (1 unit = 100,000 km).
* Spacecraft tracking mode must use a smooth linear interpolation (lerp) update formula:
  ```javascript
  // Target position is slightly behind/above the spacecraft
  const targetCamPos = craftPosition.clone().add(offset);
  camera.position.lerp(targetCamPos, 0.05); // smooth lerp
  controls.target.lerp(craftPosition, 0.05); // target tracks craft smoothly
  ```

### HUD Synchronization
* Any time `currentIndex` changes (during timeline scrubs or play loop), update the following simultaneously:
  1. Spacecraft position in 3D scene.
  2. Telemetry panel numbers (MET, velocity, distances).
  3. Active status check in events log.
  4. Glowing vertical timeline cursor on the Chart.js graph.
