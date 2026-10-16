# Janardhan Textiles — 3D Saree Showcase

A responsive, scroll-scrubbed 3D saree website for **Janardhan Textiles**, built with **HTML5**, **CSS3**, **JavaScript (ES Modules)**, **Three.js**, and **GSAP (`ScrollTrigger`)**.

---

## 1. How to Run Locally

### Option A: Using Vite (Node.js)
```bash
# 1. Install dependencies
npm install

# 2. Start local development server (http://localhost:5173)
npm run dev

# 3. Build for production (outputs to dist/)
npm run build

# 4. Preview production build
npm run preview
```

### Option B: Zero-Build Static Server (Python)
Because `index.html` includes a standards-compliant `<script type="importmap">` for Three.js and GSAP, the project also runs directly from any static HTTP server without requiring a build step:
```bash
python -m http.server 8080
```
Then open `http://localhost:8080` in your browser.

---

## 2. Editing Brand Copy & Site Configuration (`src/config.js`)

All editable site copy, brand colors, scene headings, captions, image paths, alt text, and product entries live in a single source of truth:

- **Config file**: [`src/config.js`](./src/config.js)

### Key fields in `src/config.js`
- `BRAND_NAME`: Brand title rendered in the header, page title, placeholder captions, and footer (`"Janardhan Textiles"`).
- `scenes`: Array of the 4 scrubbed story scenes:
  1. `woven-layers` (*The woven layers*)
  2. `finished` (*The finished sarees*)
  3. `drape-motion` (*The drape in motion*)
  4. `cofounder` (*Co-Founder*)
- `cofounder`:
  - `name`: Intentionally left empty (`''`). Populate this string in `src/config.js` when ready to display the Co-Founder's name.
  - `portrait`: Path to the Co-Founder portrait (`'/assets/cofounder.jpg'`).
  - `placeholderCaption`: Fallback caption (`'Co-Founder, Janardhan Textiles.'`) rendered inside an antique-gold frame whenever `/assets/cofounder.jpg` is absent.
- `products`: Array of featured collection items displayed in the `#collection` section below the pinned 3D stage.
- `colors`: Theme palette tokens (`teal: '#063F46'`, `gold: '#C4A15A'`, `ivory: '#F6F1E9'`).

---

## 3. Replacing Saree Images & Co-Founder Portrait

Place all image assets inside `public/assets/` (which is served at `/assets/...`):

| Scene / Role | File Path in `public/assets/` | Notes |
| :--- | :--- | :--- |
| **Scene 1: Left Woven Layers** | `public/assets/magenta-kanchipuram-layers/layer-0.png` .. `layer-3.png` | 4 RGBA PNG planes stacked in Z (warp base, weft grid, korvai border, zari motifs) |
| **Scene 1: Right Woven Layers** | `public/assets/champagne-tissue-layers/layer-0.png` .. `layer-3.png` | 4 RGBA PNG planes stacked in Z |
| **Scene 2: Finished Sarees** | `public/assets/magenta-finished.jpg`<br>`public/assets/champagne-finished.jpg` | Full finished saree photography on a warm studio backdrop |
| **Scene 3: Drape in Motion** | `public/assets/magenta-mannequin.jpg`<br>`public/assets/magenta-woman.jpg`<br>`public/assets/champagne-mannequin.jpg`<br>`public/assets/champagne-woman.jpg` | Mannequin and worn drape views animated with a subtle vertex-shader pallu sweep |
| **Scene 4: Co-Founder Portrait** | `public/assets/cofounder.jpg` | Optional portrait. When missing, the site automatically renders an antique-gold placeholder card with `"Co-Founder, Janardhan Textiles."` |
| **Collection Cards** | `public/assets/product1.jpg`<br>`public/assets/product2.jpg` | Featured collection cards below the pinned story stage |

### Cropping / Masking Storyboard Artifacts
If any supplied photograph includes outer storyboard dividers, arrows, or edge labels, adjust the `cropInset` object (`{ top, right, bottom, left }` in UV `0..1` coordinates) on that image entry in `src/config.js`. The custom GLSL shader in `src/three-stage.js` automatically masks out the inset margins while keeping the saree colors, borders, zari, and motifs untouched.

---

## 4. Replacing 3D Models (`.glb` / `.gltf`) & Upload Control

By default, no `.glb` or `.gltf` volumetric models are bundled in the repository, so `src/three-stage.js` renders honest, high-precision layered 3D planes and a subdivided cloth mesh (`48×64` segments) for the pallu sweep.

- **Static `.glb`/`.gltf` configuration**: To load permanent `.glb`/`.gltf` models on startup, set `models.leftSareeGlb` and/or `models.rightSareeGlb` in [`src/config.js`](./src/config.js). `ThreeStage` uses `GLTFLoader` and `DRACOLoader` to load and normalize them.
- **Interactive `.glb`/`.gltf` upload control**: Open the **Menu** drawer in the header and click **Load Optional .GLB/.GLTF** to preview a local `.glb` or `.gltf` model (validated for `.glb`/`.gltf` extension and capped at `25 MB`). Click **Use Layered Planes** to revert at any time. To disable this button in production, set `ui.modelUpload.enabled = false` in `src/config.js`.

---

## 5. Where to Edit Animation Timings, Orbit Limits & Scroll Ranges

- **Orbit angle limits & lerp damping**: Edit `interaction` in [`src/config.js`](./src/config.js) (`maxYawDeg: 12`, `maxPitchDeg: 6`, `dampingFactor: 0.08`, `scrollDampReduction: 0.25`) or see the documented constants at the top of [`src/orbit-control.js`](./src/orbit-control.js).
- **Scroll scrub timings & phase durations**: Edit `_buildMasterTimeline()` in [`src/scroll-controller.js`](./src/scroll-controller.js) and total scroll track height (`.story-scroll-track { height: 460vh; }`) in [`src/styles.css`](./src/styles.css).
- **Layer Z-separation & cloth shader displacement**: Edit `_applyTimelineStateToMeshes()` and `CLOTH_VERTEX_SHADER` in [`src/three-stage.js`](./src/three-stage.js).

---

## 6. Accessibility & Performance Notes

- **`prefers-reduced-motion`**: Automatically detected via `window.matchMedia('(prefers-reduced-motion: reduce)')`. When enabled, vertex-shader cloth displacement (`uSweepAmplitude`) is set to `0`, Z-layer separation is simplified, camera Z motion is held steady, and rotational sway is damped.
- **Keyboard Navigation**:
  - `Skip to collection` link is the first focusable element on `Tab`.
  - Focusing the 3D stage (`#story-stage-pin`) allows `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, and `Home`/`0` keys to inspect the 3D sarees within the constrained `±12°` yaw / `±6°` pitch limits.
  - Stage step pills (`01`–`04`) and the `Inspect 3D Stage` button provide full keyboard control over the scene sequence.
- **Performance**: `devicePixelRatio` is capped at `1.5` on mobile and `2.0` on desktop; below-the-fold product images use `loading="lazy"` and `decoding="async"`.

---

## 7. QA Verification Checklist

- [x] **Pinned Stage & Reversible Scrub**: Scrolling down advances smoothly through *The woven layers* → *The finished sarees* → *The drape in motion* → *Co-Founder*; scrolling up reverses every transition without jumps.
- [x] **Scene 1 Layered Assembly**: 4 separated Z planes per saree (Magenta Kanchipuram on left, Champagne-Gold Tissue on right) converge sequentially into the unified fabric.
- [x] **Scene 2 Finished Sarees**: Side-by-side finished sarees on a warm studio backdrop (`#EFE7DA`).
- [x] **Scene 3 Drape in Motion**: Smooth cross-fade from mannequin to worn saree with restrained GLSL vertex-shader pallu sweep.
- [x] **Scene 4 Co-Founder Closing**: Uses Deep Peacock Teal (`#063F46`), Antique Gold (`#C4A15A`), and Ivory (`#F6F1E9`), renders the placeholder caption `"Co-Founder, Janardhan Textiles."` when `/assets/cofounder.jpg` is absent, leaves `cofounder.name` empty (no invented name), and provides a keyboard-focusable `"Explore the Collection"` CTA.
- [x] **Constrained Orbit Blending**: Pointer drag and arrow keys rotate within `±12°` yaw and `±6°` pitch and blend smoothly via lerping when scrolling.
- [x] **Responsive & Reduced Motion**: Both sarees remain visible on mobile (`< 640px`), tablet, and desktop; `prefers-reduced-motion: reduce` disables cloth wave displacement.
