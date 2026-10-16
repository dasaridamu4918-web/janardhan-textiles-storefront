/**
 * GSAP ScrollTrigger Scrub Controller (src/scroll-controller.js)
 *
 * WHERE TO EDIT ANIMATION TIMINGS & SCROLL RANGES:
 * - Total scroll distance is controlled by `SCROLL_DISTANCE_VH` below (default: 460% of viewport height)
 *   or via CSS height of `#story-scroll-track`.
 * - Scrub smoothing is read from `src/config.js` -> `interaction.scrollScrubSeconds` (default: 0.65s).
 * - Individual scene timeline durations and phase weights can be tuned in `_buildMasterTimeline()` below:
 *   - Phase 1 (0.00 -> 1.00): Scene 1 — Woven layers converge in Z order (`layerAssemblyProgress`)
 *   - Phase 2 (1.00 -> 2.00): Scene 2 — Crossfade & hold on finished sarees (`finishedMix`)
 *   - Phase 3 (2.00 -> 3.20): Scene 3 — Drape on mannequin -> Woman wearing saree + Pallu sweep
 *   - Phase 4 (3.20 -> 4.00): Scene 4 — Co-Founder closing screen reveal (`cofounderMix`)
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export class ScrollController {
  /**
   * @param {Object} params
   * @param {Object} params.config - Site configuration from src/config.js
   * @param {import('./three-stage.js').ThreeStage} params.threeStage
   * @param {import('./orbit-control.js').ConstrainedOrbitControl} params.orbitControl
   * @param {Function} params.onSceneChange - Callback invoked when active scene index (0..3) changes
   */
  constructor({ config, threeStage, orbitControl, onSceneChange }) {
    this.config = config;
    this.threeStage = threeStage;
    this.orbitControl = orbitControl;
    this.onSceneChange = onSceneChange;

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.currentSceneIndex = -1;

    // Cache DOM elements for safe-zone copy & overlays
    this.pinContainer = document.getElementById('story-stage-pin');
    this.scrollTrack = document.getElementById('story-scroll-track');
    this.eyebrowEl = document.getElementById('stage-eyebrow');
    this.headingEl = document.getElementById('stage-heading');
    this.captionEl = document.getElementById('stage-caption');
    this.copyCardEl = document.getElementById('stage-copy-card');
    this.layerStatusEl = document.getElementById('layer-status-pill');
    this.cofounderOverlayEl = document.getElementById('cofounder-closing-overlay');
    this.progressBarEl = document.getElementById('scroll-progress-bar');
    this.leftLabelEl = document.getElementById('left-saree-badge');
    this.rightLabelEl = document.getElementById('right-saree-badge');

    this._initLabels();
    this._buildMasterTimeline();
    this._applySceneCopy(0);
  }

  _initLabels() {
    if (this.leftLabelEl) {
      this.leftLabelEl.textContent =
        this.config.ui?.sareeLabels?.left || 'Magenta Kanchipuram';
    }
    if (this.rightLabelEl) {
      this.rightLabelEl.textContent =
        this.config.ui?.sareeLabels?.right || 'Champagne-Gold Tissue';
    }
  }

  _buildMasterTimeline() {
    const state = this.threeStage.state;
    const scrubValue = this.reducedMotion
      ? true
      : (this.config.interaction?.scrollScrubSeconds ?? 0.65);

    // Master scrubbed timeline spanning 4.0 normalized timeline units
    this.timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: this.scrollTrack,
        pin: this.pinContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: scrubValue,
        anticipatePin: 1,
        onUpdate: (self) => {
          state.globalProgress = self.progress;
          if (this.progressBarEl) {
            this.progressBarEl.style.transform = `scaleX(${self.progress})`;
          }
          if (this.orbitControl) {
            const vel = Math.min(1, Math.abs(self.getVelocity()) / 1200);
            if (vel > 0.05) {
              this.orbitControl.notifyScrollActivity(vel);
            }
          }
          this._syncDOMOverlays(self.progress);
        }
      }
    });

    // =========================================================================
    // SCENE 1 (Timeline 0.00 -> 1.00): "The woven layers"
    // Separated Z planes converge in order into each saree's unified fabric.
    // =========================================================================
    this.timeline.fromTo(
      state,
      {
        layerAssemblyProgress: 0.0,
        finishedMix: 0.0,
        drapeEnterMix: 0.0,
        womanCrossfade: 0.0,
        palluSweepAmplitude: 0.0,
        palluSweepPhase: 0.0,
        cofounderMix: 0.0,
        cameraZ: 6.35,
        cameraY: 0.0
      },
      {
        layerAssemblyProgress: 1.0,
        cameraZ: 5.95,
        duration: 1.0
      },
      0.0
    );

    // =========================================================================
    // SCENE 2 (Timeline 1.00 -> 2.00): "The finished sarees"
    // Transition smoothly to the finished saree images on a warm studio background.
    // =========================================================================
    this.timeline.to(
      state,
      {
        finishedMix: 1.0,
        cameraZ: 5.8,
        duration: 0.45
      },
      1.0
    );
    // Hold finished sarees in crisp studio clarity for inspection
    this.timeline.to(
      state,
      {
        cameraZ: 5.75,
        duration: 0.55
      },
      1.45
    );

    // =========================================================================
    // SCENE 3 (Timeline 2.00 -> 3.20): "The drape in motion"
    // Step 3A (2.00 -> 2.40): Transition from flat finished sarees to mannequin drape
    // Step 3B (2.40 -> 3.20): Cross-fade mannequin -> woman wearing saree + pallu sweep
    // =========================================================================
    this.timeline.to(
      state,
      {
        drapeEnterMix: 1.0,
        palluSweepAmplitude: 0.045,
        palluSweepPhase: 1.8,
        cameraZ: 5.85,
        duration: 0.4
      },
      2.0
    );

    this.timeline.to(
      state,
      {
        womanCrossfade: 1.0,
        palluSweepAmplitude: 0.088,
        palluSweepPhase: 6.28,
        cameraZ: 5.7,
        duration: 0.6
      },
      2.4
    );

    // Gently settle cloth wave at end of Scene 3 before Scene 4 fade
    this.timeline.to(
      state,
      {
        palluSweepAmplitude: 0.03,
        palluSweepPhase: 7.5,
        duration: 0.2
      },
      3.0
    );

    // =========================================================================
    // SCENE 4 (Timeline 3.20 -> 4.00): "Co-Founder" Closing Screen
    // Fade into deep peacock teal (#063F46), antique gold (#C4A15A), and ivory (#F6F1E9).
    // =========================================================================
    this.timeline.to(
      state,
      {
        cofounderMix: 1.0,
        palluSweepAmplitude: 0.0,
        cameraZ: 6.5,
        duration: 0.55
      },
      3.2
    );

    this.timeline.to(
      state,
      {
        cofounderMix: 1.0,
        duration: 0.25
      },
      3.75
    );
  }

  /**
   * Synchronizes DOM headings, captions, layer badges, and the Co-Founder closing screen
   * with the scrubbed scroll position (100% reversible).
   */
  _syncDOMOverlays(progress) {
    // Map normalized scroll progress (0..1) to active scene index (0..3)
    let nextSceneIndex = 0;
    if (progress < 0.25) {
      nextSceneIndex = 0; // The woven layers
    } else if (progress < 0.50) {
      nextSceneIndex = 1; // The finished sarees
    } else if (progress < 0.80) {
      nextSceneIndex = 2; // The drape in motion
    } else {
      nextSceneIndex = 3; // Co-Founder closing
    }

    if (nextSceneIndex !== this.currentSceneIndex) {
      this.currentSceneIndex = nextSceneIndex;
      this.threeStage.state.activeSceneIndex = nextSceneIndex;
      this._applySceneCopy(nextSceneIndex);
      if (this.onSceneChange) {
        this.onSceneChange(nextSceneIndex);
      }
    }

    // Update live layer assembly indicator pill during Scene 1
    if (this.layerStatusEl) {
      const sceneWoven = this.config.scenes[0];
      const labels = sceneWoven?.layerLabels || [];
      if (nextSceneIndex === 0 && labels.length > 0) {
        this.layerStatusEl.hidden = false;
        const lp = this.threeStage.state.layerAssemblyProgress;
        if (lp < 0.94) {
          const idx = Math.min(labels.length - 1, Math.floor(lp * labels.length));
          this.layerStatusEl.textContent = `Layer ${idx + 1}/${labels.length}: ${labels[idx]}`;
        } else {
          this.layerStatusEl.textContent = 'All 4 Woven Layers Aligned';
        }
      } else if (nextSceneIndex === 2) {
        this.layerStatusEl.hidden = false;
        const wf = this.threeStage.state.womanCrossfade;
        this.layerStatusEl.textContent =
          wf < 0.45 ? 'Form: Studio Mannequin Drape' : 'Form: Living Drape & Pallu Sweep';
      } else {
        this.layerStatusEl.hidden = true;
      }
    }

    // Scrub Co-Founder closing screen opacity & interactivity smoothly
    const cofounderMix = this.threeStage.state.cofounderMix;
    if (this.cofounderOverlayEl) {
      this.cofounderOverlayEl.style.opacity = String(cofounderMix);
      const isInteractive = cofounderMix > 0.6;
      this.cofounderOverlayEl.classList.toggle('is-active', isInteractive);
      this.cofounderOverlayEl.setAttribute('aria-hidden', String(!isInteractive));
    }

    // Fade out safe-zone stage copy card when Co-Founder closing screen takes over
    if (this.copyCardEl) {
      this.copyCardEl.style.opacity = String(Math.max(0, 1 - cofounderMix * 1.6));
      this.copyCardEl.style.pointerEvents = cofounderMix > 0.5 ? 'none' : 'auto';
    }
  }

  _applySceneCopy(sceneIndex) {
    const scene = this.config.scenes[sceneIndex];
    if (!scene) return;

    if (this.eyebrowEl) {
      this.eyebrowEl.textContent = scene.eyebrow || `Stage 0${sceneIndex + 1}`;
    }
    if (this.headingEl) {
      this.headingEl.textContent = scene.heading || '';
    }
    if (this.captionEl) {
      this.captionEl.textContent = scene.caption || '';
    }
  }

  /**
   * Smoothly scrolls the page to the target scene index (0..3)
   */
  scrollToScene(sceneIndex) {
    if (!this.scrollTrack) return;
    // Target progress points where each scene is fully settled
    const sceneProgressTargets = [0.12, 0.38, 0.68, 0.94];
    const targetProgress = sceneProgressTargets[sceneIndex] ?? 0;

    const trackRect = this.scrollTrack.getBoundingClientRect();
    const trackTop = window.scrollY + trackRect.top;
    const maxScroll = Math.max(0, this.scrollTrack.offsetHeight - window.innerHeight);
    const targetScrollY = trackTop + maxScroll * targetProgress;

    window.scrollTo({
      top: targetScrollY,
      behavior: this.reducedMotion ? 'auto' : 'smooth'
    });
  }
}
