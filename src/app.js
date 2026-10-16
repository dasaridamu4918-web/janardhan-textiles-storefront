/**
 * Main Application Entry (src/app.js)
 * Wires configuration (src/config.js), Three.js 3D stage (src/three-stage.js),
 * constrained orbit controls (src/orbit-control.js), GSAP ScrollTrigger scrub
 * timeline (src/scroll-controller.js), and accessible DOM UI components (src/ui/).
 */

import config from './config.js';
import { ConstrainedOrbitControl } from './orbit-control.js';
import { ThreeStage } from './three-stage.js';
import { ScrollController } from './scroll-controller.js';
import { initHeader } from './ui/header.js';
import { initCofounder } from './ui/cofounder.js';
import { initCollectionAndCTA } from './ui/cta.js';

function applyThemeTokens(colors = {}) {
  const root = document.documentElement;
  if (colors.teal) root.style.setProperty('--color-teal', colors.teal);
  if (colors.gold) root.style.setProperty('--color-gold', colors.gold);
  if (colors.ivory) root.style.setProperty('--color-ivory', colors.ivory);
  if (colors.studioWarm) root.style.setProperty('--color-studio-warm', colors.studioWarm);
  if (colors.ink) root.style.setProperty('--color-ink', colors.ink);
}

/**
 * Populates semantic screen-reader landmarks and image alt descriptions
 * from src/config.js so assistive technologies have complete access to every
 * scene heading, caption, and saree image alt text alongside the 3D WebGL canvas.
 */
function populateAccessibleSceneLandmarks(siteConfig) {
  const container = document.getElementById('sr-scene-landmarks');
  if (!container || !Array.isArray(siteConfig.scenes)) return;

  container.innerHTML = '';
  siteConfig.scenes.forEach((scene, index) => {
    const section = document.createElement('section');
    section.id = `scene-${scene.id}`;
    section.className = 'sr-scene-landmark';
    section.setAttribute('aria-label', `Stage ${index + 1}: ${scene.heading}`);

    const h2 = document.createElement('h2');
    h2.textContent = scene.heading;
    section.appendChild(h2);

    if (scene.caption) {
      const p = document.createElement('p');
      p.textContent = scene.caption;
      section.appendChild(p);
    }

    if (Array.isArray(scene.images)) {
      const ul = document.createElement('ul');
      scene.images.forEach((imgMeta) => {
        const li = document.createElement('li');
        // Provide semantic <img role="img" aria-label="..."> metadata for screen readers
        const srImg = document.createElement('span');
        srImg.setAttribute('role', 'img');
        srImg.setAttribute('aria-label', imgMeta.alt || imgMeta.role);
        srImg.textContent = imgMeta.alt || imgMeta.role;
        li.appendChild(srImg);
        ul.appendChild(li);
      });
      section.appendChild(ul);
    }

    container.appendChild(section);
  });
}

function initApp() {
  document.title = `${config.BRAND_NAME} — 3D Silk Saree Showcase`;
  applyThemeTokens(config.colors);
  populateAccessibleSceneLandmarks(config);

  const canvas = document.getElementById('saree-webgl-canvas');
  const interactiveStage = document.getElementById('story-stage-pin');

  // 1. Initialize constrained pointer & keyboard orbit inspection (±12° yaw, ±6° pitch)
  const orbitControl = new ConstrainedOrbitControl(interactiveStage, config.interaction);

  // 2. Initialize Three.js 3D Stage (layered Z planes, finished studio sarees, cloth shader sweep)
  const threeStage = new ThreeStage(canvas, config, orbitControl);

  // 3. Initialize Co-Founder Closing Overlay (Scene 4)
  initCofounder(config);

  let scrollController = null;

  // 4. Initialize Header & Collection CTA UI
  const headerUI = initHeader(config, {
    onSelectScene: (sceneIndex) => {
      if (scrollController) scrollController.scrollToScene(sceneIndex);
    },
    onToggleOrbit: (shouldReset) => {
      orbitControl.toggleInspectPreset(shouldReset);
    },
    onModelUpload: (file, cb) => {
      threeStage.loadUserGLTFFile(file, cb);
    },
    onModelReset: () => {
      threeStage.clearCustomGLTFModel();
    }
  });

  const ctaUI = initCollectionAndCTA(config, {
    onSelectScene: (sceneIndex) => {
      if (scrollController) scrollController.scrollToScene(sceneIndex);
    }
  });

  // 5. Initialize GSAP ScrollTrigger scrubbed timeline
  scrollController = new ScrollController({
    config,
    threeStage,
    orbitControl,
    onSceneChange: (sceneIndex) => {
      headerUI.setActiveScene(sceneIndex);
      ctaUI.updateActiveStep(sceneIndex);
    }
  });

  // Sync initial active step
  headerUI.setActiveScene(0);
  ctaUI.updateActiveStep(0);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
