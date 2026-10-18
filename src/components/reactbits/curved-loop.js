/**
 * React Bits — CurvedLoop (JS-TW Variant)
 * Installed from: npx shadcn@latest add @react-bits/CurvedLoop-JS-TW
 * Source component: src/components/CurvedLoop/CurvedLoop.jsx
 *
 * Tuned for Janardan Textiles:
 * - Used as decorative dividers on the Home page (between Hero & Featured, and above Footer).
 * - Displays ONLY true brand messages ("Janardan Textiles" + real fabric & occasion names from GET /api/filters).
 * - Slow, smooth speed, gentle curve, cream/gold palette, readable at 375px without horizontal scroll.
 * - Uses aria-hidden="true" and pauses when prefers-reduced-motion is set or when off-screen.
 */

const VIEW_WIDTH = 1440;
const VIEW_HEIGHT = 110;
const MAX_FLING = 2400;

const wrapOffset = (value, length) => (length > 0 ? (((value % length) + length) % length) - length : value);

let curvedLoopInstanceSeq = 0;

export function mountCurvedLoop(container, options = {}) {
  if (!container) return null;
  container.innerHTML = "";

  if (typeof window !== "undefined" && window.__DISABLE_REACT_BITS__) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("effects") === "off" || params.get("reactbits") === "off") return null;
  } catch (e) {}

  curvedLoopInstanceSeq += 1;
  const pathId = `jt-curved-loop-path-${curvedLoopInstanceSeq}`;

  const rawText = String(options.marqueeText || "Janardan Textiles").trim();
  const separator = String(options.separator ?? "✦").trim();
  const speed = options.speed ?? 0.65;
  const curveAmount = options.curveAmount ?? 48;
  const direction = options.direction === "right" ? "right" : "left";
  const interactive = options.interactive ?? true;
  const pauseOnHover = options.pauseOnHover ?? true;
  const textColor = options.color || "#1C1613";
  const separatorColor = options.separatorColor || "#C4A15A";
  const fontSize = options.fontSize ?? 30;
  const letterSpacing = options.letterSpacing ?? "0.08em";

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-reactbits-component", "CurvedLoop-JS-TW");
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.className =
    "relative w-full max-w-full overflow-hidden py-2 sm:py-3 select-none bg-gradient-to-r from-[#EFE6D5]/70 via-[#FAF8F5] to-[#EFE6D5]/70 border-y border-[#C4A15A]/35";
  wrapper.style.touchAction = interactive ? "pan-y" : "auto";
  wrapper.style.cursor = interactive ? "grab" : "default";
  wrapper.style.maskImage =
    "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 8%, rgba(0,0,0,1) 92%, rgba(0,0,0,0) 100%)";
  wrapper.style.webkitMaskImage =
    "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 8%, rgba(0,0,0,1) 92%, rgba(0,0,0,0) 100%)";

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("data-reactbits-component", "CurvedLoop-JS-TW");
  svg.setAttribute("viewBox", `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "block w-full h-12 sm:h-16 md:h-20 overflow-visible select-none font-serif uppercase");
  svg.style.fontSize = `${fontSize}px`;
  svg.style.fontWeight = "600";
  svg.style.letterSpacing = String(letterSpacing);

  // Hidden measurement text element
  const measureTextEl = document.createElementNS(svgNS, "text");
  measureTextEl.setAttribute("xml:space", "preserve");
  measureTextEl.style.visibility = "hidden";
  measureTextEl.style.opacity = "0";
  measureTextEl.style.pointerEvents = "none";
  const unitString = separator ? `${rawText}\u00A0\u00A0${separator}\u00A0\u00A0` : `${rawText}\u00A0\u00A0`;
  measureTextEl.textContent = unitString;
  svg.appendChild(measureTextEl);

  // Gentle quadratic Bezier curve across 1440px width, vertically centered in VIEW_HEIGHT (110)
  const defs = document.createElementNS(svgNS, "defs");
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("id", pathId);
  const clampedCurve = Math.max(-44, Math.min(44, curveAmount));
  const startY = Math.round(VIEW_HEIGHT * 0.54 - clampedCurve * 0.28);
  const ctrlY = Math.round(startY + clampedCurve * 0.85);
  path.setAttribute("d", `M-120,${startY} Q${VIEW_WIDTH / 2},${ctrlY} ${VIEW_WIDTH + 120},${startY}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "transparent");
  defs.appendChild(path);
  svg.appendChild(defs);

  const visibleTextEl = document.createElementNS(svgNS, "text");
  visibleTextEl.setAttribute("data-curved-loop-text", "");
  visibleTextEl.setAttribute("dominant-baseline", "middle");
  visibleTextEl.setAttribute("xml:space", "preserve");
  visibleTextEl.setAttribute("fill", textColor);

  const textPathEl = document.createElementNS(svgNS, "textPath");
  textPathEl.setAttribute("href", `#${pathId}`);
  textPathEl.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${pathId}`);
  textPathEl.setAttribute("startOffset", "0px");
  textPathEl.setAttribute("xml:space", "preserve");

  visibleTextEl.appendChild(textPathEl);
  svg.appendChild(visibleTextEl);
  wrapper.appendChild(svg);
  container.appendChild(wrapper);

  let spacing = 0;
  let offset = 0;
  let velocity = 0;
  let curDirection = direction;
  let hovered = false;
  let visible = true;
  let disposed = false;
  let raf = 0;
  let last = 0;

  const drag = {
    active: false,
    x: 0,
    time: 0,
    scale: 1,
    velocity: 0
  };

  const populateCopies = (copiesCount) => {
    while (textPathEl.firstChild) {
      textPathEl.removeChild(textPathEl.firstChild);
    }
    const parts = rawText.split(/\s*✦\s*/).filter(Boolean);
    for (let c = 0; c < copiesCount; c++) {
      parts.forEach((segment) => {
        const segNode = document.createTextNode(`${segment}\u00A0\u00A0`);
        textPathEl.appendChild(segNode);
        if (separator) {
          const tspan = document.createElementNS(svgNS, "tspan");
          tspan.setAttribute("fill", separatorColor);
          tspan.textContent = separator;
          textPathEl.appendChild(tspan);
          textPathEl.appendChild(document.createTextNode("\u00A0\u00A0"));
        }
      });
    }
  };

  const measure = () => {
    if (disposed) return;
    let measured = 0;
    try {
      measured = measureTextEl.getComputedTextLength();
    } catch (e) {
      measured = 0;
    }
    if (!measured || measured < 40) {
      measured = Math.max(420, unitString.length * (fontSize * 0.62));
    }
    spacing = measured;
    let totalPathLen = 1750;
    try {
      totalPathLen = path.getTotalLength() || 1750;
    } catch (e) {}
    const copies = Math.max(3, Math.ceil(totalPathLen / spacing) + 3);
    populateCopies(copies);
    offset = wrapOffset(offset, spacing);
    textPathEl.setAttribute("startOffset", `${offset.toFixed(2)}px`);
  };

  measure();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (!disposed) measure();
    });
  }

  const reduceMotion = () =>
    typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);

  const tick = (now) => {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;

    if (!drag.active && spacing > 0) {
      const sign = curDirection === "right" ? 1 : -1;
      const halted = reduceMotion() || (pauseOnHover && hovered);
      const target = halted ? 0 : sign * speed * 60;
      velocity += (target - velocity) * (1 - Math.exp(-dt * 3));
      const step = velocity * dt;
      if (Math.abs(step) > 0.001) {
        offset = wrapOffset(offset + step, spacing);
        textPathEl.setAttribute("startOffset", `${offset.toFixed(2)}px`);
      }
    }

    if (!reduceMotion()) {
      raf = requestAnimationFrame(tick);
    }
  };

  const onPointerDown = (e) => {
    if (!interactive || spacing <= 0) return;
    const rect = svg.getBoundingClientRect();
    const width = rect?.width || VIEW_WIDTH;
    drag.active = true;
    drag.x = e.clientX;
    drag.time = performance.now();
    drag.scale = VIEW_WIDTH / Math.max(1, width);
    drag.velocity = 0;
    velocity = 0;
    wrapper.style.cursor = "grabbing";
    try {
      wrapper.setPointerCapture?.(e.pointerId);
    } catch (err) {}
  };

  const onPointerMove = (e) => {
    if (!drag.active || spacing <= 0) return;
    const now = performance.now();
    const delta = (e.clientX - drag.x) * drag.scale;
    const dt = Math.max(now - drag.time, 1) / 1000;
    drag.x = e.clientX;
    drag.time = now;
    drag.velocity = drag.velocity * 0.5 + (delta / dt) * 0.5;
    offset = wrapOffset(offset + delta, spacing);
    textPathEl.setAttribute("startOffset", `${offset.toFixed(2)}px`);
  };

  const endDrag = () => {
    if (!drag.active) return;
    drag.active = false;
    wrapper.style.cursor = interactive ? "grab" : "default";
    const fling = performance.now() - drag.time > 100 ? 0 : Math.max(-MAX_FLING, Math.min(MAX_FLING, drag.velocity));
    velocity = fling;
    if (Math.abs(fling) > 60) curDirection = fling > 0 ? "right" : "left";
  };

  const onPointerEnter = () => {
    hovered = true;
  };

  const onPointerLeave = () => {
    hovered = false;
    endDrag();
  };

  wrapper.addEventListener("pointerdown", onPointerDown);
  wrapper.addEventListener("pointermove", onPointerMove);
  wrapper.addEventListener("pointerup", endDrag);
  wrapper.addEventListener("pointercancel", endDrag);
  wrapper.addEventListener("pointerenter", onPointerEnter);
  wrapper.addEventListener("pointerleave", onPointerLeave);

  let io = null;
  if (typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf && !reduceMotion()) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    });
    io.observe(wrapper);
  }

  if (!reduceMotion()) {
    raf = requestAnimationFrame(tick);
  }

  return {
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
      wrapper.removeEventListener("pointerdown", onPointerDown);
      wrapper.removeEventListener("pointermove", onPointerMove);
      wrapper.removeEventListener("pointerup", endDrag);
      wrapper.removeEventListener("pointercancel", endDrag);
      wrapper.removeEventListener("pointerenter", onPointerEnter);
      wrapper.removeEventListener("pointerleave", onPointerLeave);
    }
  };
}
