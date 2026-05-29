# Artemis Trajectory Lab - Repository Rules & Contribution Guidelines

This document establishes the official architectural standards, Git workflows, visual parameters, performance bounds, and agent-collaboration protocols for the **Artemis Trajectory Lab** project. All developers and autonomous agents (main agents and subagents) must adhere to these rules strictly to ensure codebase stability, exceptional aesthetic quality, and optimal performance.

---

## 1. Git Branching Model & Semantic Commits

### 1.1 Branch Naming Conventions
To maintain a transparent and clean git tree, all branch names must follow the structural prefix format:
- `feature/<name>`: For new capabilities, visual widgets, or math extensions (e.g., `feature/orbit-overlay`).
- `bugfix/<issue-name>`: For addressing existing glitches or code errors (e.g., `bugfix/timeline-flicker`).
- `hotfix/<patch>`: For high-priority production-level corrections (e.g., `hotfix/mobile-touch-freeze`).
- `refactor/<optimization>`: For code restructuring or optimizations without functional changes (e.g., `refactor/three-disposal`).
- `docs/<doc-updates>`: For documentation additions or refinements (e.g., `docs/api-guide`).
- `chore/<task>`: For non-code infrastructure, tooling, or minor configuration adjustments (e.g., `chore/ignore-updates`).

### 1.2 Semantic Commit Message Guidelines
All commit messages must be structured semantic commits. This ensures automated changelogs and clean history tracking. The format is:
`type: descriptive message`

| Commit Type | Purpose / Use Case | Example |
| :--- | :--- | :--- |
| `feat` | Adding a new structural component, math module, or physical entity | `feat: integrate telemetry real-time chart synchronization` |
| `fix` | Correcting a logical, visual, mathematical, or runtime exception | `fix: resolve OrbitControls division-by-zero during canvas reset` |
| `docs` | Editing or extending markdown guides, internal code comments, or headers | `docs: document procedural moon canvas generation algorithms` |
| `style` | Layout, colors, CSS vars, transparency, layout tweaks, theme adjustments | `style: enhance glassmorphism panel backdrop blur and color glowing shadows` |
| `refactor` | Code reorganization, variable scope reduction, loops optimizations | `refactor: optimize Three.js render loop to use pre-allocated vectors` |
| `chore` | Gitignores, cleanups, checklist updates, task state management | `chore: update task.md checklist state to track timeline scrubbing completion` |

> [!IMPORTANT]
> - Never write vague or generic commits (e.g., `fix stuff`, `changes`, `update`).
> - Keep commits highly descriptive and focused on one specific context.
> - Limit the commit summary line to 72 characters.

---

## 2. Modern Web Code Standards & Layout

### 2.1 Core Code Philosophy
This is a **zero-build, client-side web application**. Under no circumstances should compilation pipelines, module bundlers (Vite, Webpack, Rollup), transpilers (Babel), or compiler-dependent languages (TypeScript, Sass) be introduced. 

- **Vanilla HTML5**: All layouts, overlays, and structures belong strictly to semantic tags in `index.html`. No inline styling or inline `<script>` injection.
- **Vanilla CSS3**: Layout, responsive media queries, typography, and styling must rely solely on native CSS3 features.
- **Vanilla ES6+ JS**: The logic is driven strictly by vanilla JavaScript modules (`type="module"`).
- **Approved CDNs Only**: Third-party integrations are confined to high-performance, stable CDNs specified in `GEMINI.md`.
  - Three.js: `v0.154.0` (with corresponding OrbitControls).
  - Chart.js: `v4.4.0+`.

### 2.2 Design Tokens & Theme Parameters
All layout modules, telemetry displays, and panel layers must inherit variables defined under the `:root` scope. Custom hardcoded hex values are strictly prohibited.

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

### 2.3 Premium HUD & Visual Quality Guidelines
To achieve a high-fidelity dark-mode mission control visualizer, components must apply:
- **Glassmorphism Panels**: Translucent panels blending with the starry spatial backdrop:
  ```css
  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%); /* Safari support */
  ```
- **Typography Matrix**:
  - *HUD Numeric Data & Headings*: `'Orbitron'`, sans-serif.
  - *Monospace Log / Code terminal*: `'Share Tech Mono'`, monospace.
  - *Standard UI Text / Controls*: `'Inter'`, sans-serif.
- **Visual Fine-details**:
  - Interactive nodes and high-status telemetry must exhibit subtle glowing drop-shadows: `box-shadow: 0 0 10px hsla(198, 100%, 61%, 0.2)`.
  - Provide thin custom scrollbars matching the accent palette.
  - Implement dynamic hover and active states (transitions: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`).

> [!TIP]
> Use HSL/HSLA values exclusively for color specifications. They provide consistent control over lighting, opacity, and saturation, simplifying dynamic adjustments and transitions in the HUD.

---

## 3. Agent & Subagent Coordination Protocol

When autonomous main agents, subagents, and background tasks collaborate on this codebase, strict sequence and coordination guidelines must be followed to avoid file editing collisions and merge conflicts.

### 3.1 Step-by-Step Edit Pipeline
1. **Context Initialization**: Before modifying any files, read `GEMINI.md` and `rule.md` to understand system constraints.
2. **Task State Verification**: Inspect the `task.md` (or task checklist file) to find the current active sprint or feature task.
3. **Sequential Execution & File Locks**:
   - Multiple agents must never perform concurrent writes to the same file.
   - Wait for other background tasks to complete before initiating file replacements.
4. **Localization of Changes**: Keep your code edits confined to the minimal necessary files. Avoid widespread restructuring of unaffected systems.
5. **Post-Write Validation**: Always check that files remain valid syntax-wise (e.g. check for unclosed brackets, duplicate variables, broken imports).
6. **Descriptive Summary & Commits**: Write extremely clear, semantic commits detailing the exact modification.

> [!WARNING]
> Parallel calls to replacement tools (like `replace_file_content` or `multi_replace_file_content`) targeting the same file will trigger logical overwrite collisions. Ensure all tool calls for a file are unified or serialized sequentially.

---

## 4. Three.js Visual Quality & Performance

High-performance 3D visualization is a cornerstone of the Artemis Trajectory Lab. The rendering engine must remain responsive, leak-free, and mathematically accurate under all conditions.

### 4.1 Strict Memory Management & Resource Disposal
To prevent CPU/GPU memory leaks during timeline resets, trajectory modifications, or screen transitions, all WebGL resources must be explicitly disposed of. Simply removing a mesh from the scene is insufficient.

```javascript
/**
 * Fully disposes of a 3D object and its associated GPU assets.
 * @param {THREE.Object3D} obj - The object to clean up.
 */
function disposeHierarchy(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      // Dispose geometry
      if (child.geometry) {
        child.geometry.dispose();
      }

      // Dispose materials (handle arrays or single materials)
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
  
  // Clean up textures
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && typeof value.dispose === 'function') {
      value.dispose();
    }
  }
}
```

### 4.2 Maintaining 60 FPS Performance
- **Pre-allocation of Objects**: Avoid creating new `THREE.Vector3`, `THREE.Quaternion`, or `THREE.Matrix4` instances inside the `requestAnimationFrame` render loop. Declare these utility containers outside the loop and use `.set()`, `.copy()`, or `.add()` in place:
  ```javascript
  // Declared at module level
  const tempCraftPos = new THREE.Vector3();
  const tempCameraOffset = new THREE.Vector3(0, 5, 10);
  
  // Used inside the loop
  tempCraftPos.copy(spacecraft.position);
  ```
- **Light & Shadow Budget**: Limit the count of shadow-casting dynamic lights. Use soft ambient lights, and keep spotlight shadow maps restricted (e.g. `2048x2048` maximum) to avoid rendering pipeline stalls.

### 4.3 Smooth Spacecraft Tracking (Lerp Formula)
When the active camera tracking mode is engaged, the camera and control targets must move smoothly. Do not perform snap-to updates. Implement linear interpolation:

```javascript
// Dynamic update within requestAnimationFrame loop
const trackingOffset = new THREE.Vector3(0, 0.15, 0.4); // Standard tracking angle offset
const targetCamPosition = craftPosition.clone().add(trackingOffset);

// Smoothly interpolate camera position and orbit target
camera.position.lerp(targetCamPosition, 0.05);
controls.target.lerp(craftPosition, 0.05);

controls.update(); // Keep controls synchronized with updated parameters
```

### 4.4 Robust Dynamic Canvas Resizing
The 3D canvas must adapt seamlessly to window adjustments or overlay pane expansions. The resize handler must safely recalculate the camera projection metrics.

```javascript
function handleResize() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Clamp sizes to prevent rendering errors on collapse
  const safeWidth = Math.max(width, 320);
  const safeHeight = Math.max(height, 240);

  camera.aspect = safeWidth / safeHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(safeWidth, safeHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 to preserve GPU performance
}

window.addEventListener('resize', handleResize);
```

### 4.5 Procedural Asset Generation Constraints
In alignment with the "zero static asset" design principle, all texture files must be drawn programmatically using dynamic offscreen HTML canvases.
- **Procedural Earth**: Drawn on a `1024x512` canvas using multi-octave 2D noise algorithms for green/brown continents and deep blue oceans, then loaded via `new THREE.CanvasTexture(earthCanvas)`.
- **Procedural Moon**: Drawn on a `512x256` canvas using slate-grey backgrounds layered with circles of variable opacity to represent impact craters and ray patterns, loaded via `new THREE.CanvasTexture(moonCanvas)`.
- **Anisotropy & Filtering**: To maintain sharp planetary boundaries at oblique viewing angles, set the maximum anisotropy supported by the hardware:
  ```javascript
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.anisotropy = maxAnisotropy;
  ```
