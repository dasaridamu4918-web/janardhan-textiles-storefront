/**
 * Constrained Orbit & Pointer Inspection Controller (src/orbit-control.js)
 *
 * WHERE TO EDIT ORBIT LIMITS & DAMPING:
 * - Default angle limits are read from `src/config.js` -> `interaction`:
 *   - `maxYawDeg`: ±12° horizontal azimuth limit
 *   - `maxPitchDeg`: ±6° vertical pitch limit
 *   - `dampingFactor`: 0.08 (lerp smoothing factor per frame)
 *   - `scrollDampReduction`: 0.25 (reduces user orbit influence while scrolling)
 * - You can also adjust `DEG_TO_RAD`, `POINTER_SENSITIVITY`, and `KEYBOARD_STEP_DEG` below.
 */

const DEG_TO_RAD = Math.PI / 180;
const POINTER_SENSITIVITY = 0.065; // degrees per pixel dragged
const KEYBOARD_STEP_DEG = 2.0;     // degrees per arrow key press

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

export class ConstrainedOrbitControl {
  /**
   * @param {HTMLElement} domElement - Interactive stage container or canvas
   * @param {Object} options - Orbit configuration from src/config.js
   */
  constructor(domElement, options = {}) {
    this.domElement = domElement;

    // EDIT ORBIT ANGLE LIMITS HERE (or in src/config.js -> interaction)
    this.maxYawRad = (options.maxYawDeg ?? 12) * DEG_TO_RAD;
    this.maxPitchRad = (options.maxPitchDeg ?? 6) * DEG_TO_RAD;
    this.dampingFactor = options.dampingFactor ?? 0.08;
    this.scrollDampReduction = options.scrollDampReduction ?? 0.25;

    this.targetYaw = 0;
    this.targetPitch = 0;
    this.currentYaw = 0;
    this.currentPitch = 0;

    this.isDragging = false;
    this.inspectLocked = false;
    this.pointerStart = { x: 0, y: 0 };
    this.yawStart = 0;
    this.pitchStart = 0;
    this.scrollInfluence = 0; // 0 = idle, 1 = actively scrolling

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.domElement) return;

    this._onPointerDown = (e) => {
      // On touch screens, allow native vertical page scroll unless user drags horizontally
      if (e.pointerType === 'touch' && !this.inspectLocked) {
        this.pointerStart = { x: e.clientX, y: e.clientY };
        this.yawStart = this.targetYaw;
        this.pitchStart = this.targetPitch;
        this.isDragging = true;
        return;
      }

      if (e.button !== undefined && e.button !== 0) return;
      this.isDragging = true;
      this.pointerStart = { x: e.clientX, y: e.clientY };
      this.yawStart = this.targetYaw;
      this.pitchStart = this.targetPitch;
      this.domElement.classList.add('is-dragging');
    };

    this._onPointerMove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.pointerStart.x;
      const dy = e.clientY - this.pointerStart.y;

      // On touch devices, if vertical movement dominates, yield to native scroll immediately
      if (e.pointerType === 'touch' && !this.inspectLocked && Math.abs(dy) > Math.abs(dx) * 1.15) {
        this.isDragging = false;
        return;
      }

      const deltaYaw = dx * POINTER_SENSITIVITY * DEG_TO_RAD;
      const deltaPitch = dy * POINTER_SENSITIVITY * DEG_TO_RAD;

      this.targetYaw = clamp(this.yawStart + deltaYaw, -this.maxYawRad, this.maxYawRad);
      this.targetPitch = clamp(this.pitchStart + deltaPitch, -this.maxPitchRad, this.maxPitchRad);
    };

    this._onPointerUp = () => {
      this.isDragging = false;
      this.domElement.classList.remove('is-dragging');
    };

    // Keyboard accessibility: Arrow keys rotate stage within ±12° yaw / ±6° pitch when stage is focused
    this._onKeyDown = (e) => {
      const stepYaw = KEYBOARD_STEP_DEG * DEG_TO_RAD;
      const stepPitch = (KEYBOARD_STEP_DEG * 0.6) * DEG_TO_RAD;
      let handled = false;

      if (e.key === 'ArrowLeft') {
        this.targetYaw = clamp(this.targetYaw - stepYaw, -this.maxYawRad, this.maxYawRad);
        handled = true;
      } else if (e.key === 'ArrowRight') {
        this.targetYaw = clamp(this.targetYaw + stepYaw, -this.maxYawRad, this.maxYawRad);
        handled = true;
      } else if (e.key === 'ArrowUp' && document.activeElement === this.domElement) {
        this.targetPitch = clamp(this.targetPitch - stepPitch, -this.maxPitchRad, this.maxPitchRad);
        handled = true;
      } else if (e.key === 'ArrowDown' && document.activeElement === this.domElement) {
        this.targetPitch = clamp(this.targetPitch + stepPitch, -this.maxPitchRad, this.maxPitchRad);
        handled = true;
      } else if (e.key === 'Home' || e.key === '0') {
        this.reset();
        handled = true;
      }

      if (handled) {
        e.preventDefault();
      }
    };

    this.domElement.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('pointerup', this._onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this._onPointerUp, { passive: true });
    this.domElement.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Called by ScrollController whenever scroll progress updates so orbit influence
   * automatically yields to scroll-driven transitions.
   */
  notifyScrollActivity(intensity = 1.0) {
    this.scrollInfluence = clamp(intensity, 0, 1);
    if (!this.isDragging) {
      // Gently pull user target back toward neutral during active scroll
      this.targetYaw = lerp(this.targetYaw, 0, 0.08 * this.scrollInfluence);
      this.targetPitch = lerp(this.targetPitch, 0, 0.08 * this.scrollInfluence);
    }
  }

  /**
   * Toggle between subtle preview tilt or reset to neutral center
   */
  toggleInspectPreset(shouldReset) {
    if (shouldReset) {
      this.inspectLocked = false;
      this.reset();
    } else {
      this.inspectLocked = true;
      // Nudge to a tasteful 6° yaw / -2.5° pitch inspection angle so keyboard/button users see immediate 3D depth
      this.targetYaw = clamp(6 * DEG_TO_RAD, -this.maxYawRad, this.maxYawRad);
      this.targetPitch = clamp(-2.5 * DEG_TO_RAD, -this.maxPitchRad, this.maxPitchRad);
    }
  }

  reset() {
    this.targetYaw = 0;
    this.targetPitch = 0;
  }

  /**
   * Blends user rotation and scroll damping via linear interpolation (lerp).
   * @param {boolean} reducedMotion - If true, dampens and minimizes rotational sway
   * @returns {{ yaw: number, pitch: number }}
   */
  update(reducedMotion = false) {
    // Decay scroll activity smoothly
    this.scrollInfluence = lerp(this.scrollInfluence, 0, 0.06);

    // Reduce orbit weight while scroll animations are actively scrubbing
    const scrollBlendWeight = 1.0 - this.scrollInfluence * (1.0 - this.scrollDampReduction);
    const motionScale = reducedMotion ? 0.35 : 1.0;

    const effectiveTargetYaw = this.targetYaw * scrollBlendWeight * motionScale;
    const effectiveTargetPitch = this.targetPitch * scrollBlendWeight * motionScale;

    this.currentYaw = lerp(this.currentYaw, effectiveTargetYaw, this.dampingFactor);
    this.currentPitch = lerp(this.currentPitch, effectiveTargetPitch, this.dampingFactor);

    return {
      yaw: this.currentYaw,
      pitch: this.currentPitch
    };
  }

  dispose() {
    if (!this.domElement) return;
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('keydown', this._onKeyDown);
  }
}
