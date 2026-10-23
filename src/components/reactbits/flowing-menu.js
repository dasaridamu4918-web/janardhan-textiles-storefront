/**
 * React Bits — FlowingMenu (JS-TW Variant)
 * Installed from: npx shadcn@latest add @react-bits/FlowingMenu-JS-TW
 * Source component: src/components/FlowingMenu/FlowingMenu.jsx
 *
 * Tuned for Lepakshi Weaves:
 * - Cream background (#FAF8F5), ink text (#1C1613), champagne-gold flowing band (#D4AF37),
 *   and Cormorant Garamond serif display font matching site headings.
 * - Populated strictly from GET /api/filters (fabrics & occasions) and real product images
 *   from GET /api/products?fabric=...&limit=1 / GET /api/products?occasion=...&limit=1.
 * - If a collection has no product image, renders the row without one (never stock/invented images).
 * - Marquee text on each row is the real collection name only.
 * - Keyboard accessible (Tab through rows, Enter to open, Esc to close) & mobile touch friendly.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const prefersReduced = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);

const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function mountFlowingMenu(container, options = {}) {
  if (!container) return null;
  container.innerHTML = "";

  const items = Array.isArray(options.items) ? options.items : [];
  if (items.length === 0) return null;

  const settings = {
    speed: Math.max(0, options.speed ?? 58),
    direction: ["left", "right", "alternate"].includes(options.direction) ? options.direction : "alternate",
    followCursor: clamp(options.followCursor ?? 0.35, 0, 1),
    duration: Math.max(0.15, options.duration ?? 0.48),
    stretch: clamp(options.stretch ?? 0.55, 0, 1),
    magnet: clamp(options.magnet ?? 0.22, 0, 1),
    bandInset: Math.max(0, options.bandInset ?? 0),
    bandRadius: Math.max(0, options.bandRadius ?? 0),
    textColor: options.textColor || "#1C1613",
    bgColor: options.bgColor || "#FAF8F5",
    marqueeBgColor: options.marqueeBgColor || "#D4AF37",
    marqueeTextColor: options.marqueeTextColor || "#1C1613",
    borderColor: options.borderColor || "rgba(196, 161, 90, 0.32)",
    showIndex: options.showIndex ?? true,
    showArrow: options.showArrow ?? true,
    ariaLabel: options.ariaLabel || "Saree Collections Flowing Menu",
    onItemClick: options.onItemClick || null
  };

  const nav = document.createElement("nav");
  nav.setAttribute("data-reactbits-component", "FlowingMenu-JS-TW");
  nav.setAttribute("aria-label", settings.ariaLabel);
  nav.className = "group/fm relative box-border w-full overflow-hidden rounded-2xl border border-[#C4A15A]/45 shadow-xs font-serif";
  nav.style.backgroundColor = settings.bgColor;
  nav.style.color = settings.textColor;
  nav.style.setProperty("--flowing-menu-border", settings.borderColor);

  const ul = document.createElement("ul");
  ul.className = "relative m-0 flex list-none flex-col p-0 divide-y divide-[#C4A15A]/30";
  nav.appendChild(ul);

  const rows = [];
  const marquees = [];
  let metrics = [];

  const band = {
    top: 0,
    bottom: 0,
    vTop: 0,
    vBottom: 0,
    toTop: 0,
    toBottom: 0,
    lead: 1,
    shown: false,
    index: -1,
    rest: 0
  };
  const cursor = { x: 0, y: null, t: 0, vx: 0 };
  const engine = { raf: 0, last: 0, disposed: false };

  const marqueeAt = (index) => {
    if (!marquees[index]) marquees[index] = { x: 0, part: 0, spin: 0, covered: false };
    return marquees[index];
  };

  const insetFor = (height) => Math.min(settings.bandInset, Math.max(0, height / 2 - 2));

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.setAttribute("data-flowing-item", "");
    li.className = "group/item relative min-h-[60px] sm:min-h-[72px] overflow-hidden";

    const a = document.createElement("a");
    a.href = item.link || `#catalogue`;
    a.setAttribute("data-flowing-link", "");
    a.setAttribute("data-collection-type", item.type || "");
    a.setAttribute("data-collection-value", item.value || item.text || "");
    a.setAttribute("data-collection-route", item.routeUrl || item.link || "");
    a.className =
      "relative z-0 box-border grid min-h-[60px] sm:min-h-[72px] w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-5 px-4 sm:px-7 py-3 text-left text-inherit no-underline outline-none transition-colors duration-200 active:bg-[#D4AF37]/30 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#1C1613]";

    const idxNum = String(index + 1).padStart(2, "0");
    // Only use real product image if present; if null/empty, show row without image
    const hasRealImage = Boolean(item.image && String(item.image).trim());
    const safeText = escapeHtml(item.text);
    const safeMeta = escapeHtml(item.meta || (item.type === "fabric" ? "Fabric Collection" : "Occasion Collection"));

    a.innerHTML = `
      <span class="min-w-[1.8em] font-sans text-xs sm:text-sm font-semibold tabular-nums text-[#6E604F]" aria-hidden="true">${
        settings.showIndex ? idxNum : ""
      }</span>
      <span class="flex items-center gap-3 min-w-0">
        ${
          hasRealImage
            ? `<img src="${escapeHtml(item.image)}" alt="" aria-hidden="true" loading="lazy" decoding="async" class="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover object-top border border-[#C4A15A]/60 bg-[#EFE6D5] shrink-0" />`
            : ""
        }
        <span class="font-serif text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-[#1C1613] truncate">${safeText}</span>
      </span>
      <span class="flex items-center gap-2 sm:gap-3 justify-self-end shrink-0" aria-hidden="true">
        <span class="hidden sm:inline-block font-sans text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#F5EFE4] text-[#5C4E3C] border border-[#C4A15A]/40">${safeMeta}</span>
        ${
          settings.showArrow
            ? `<span class="w-8 h-8 rounded-full bg-[#F5EFE4] border border-[#C4A15A]/50 flex items-center justify-center text-[#1C1613] group-active/item:bg-[#D4AF37]">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M17 7H8M17 7V16"/></svg>
               </span>`
            : ""
        }
      </span>
    `;

    // Liquid Flowing Band with Marquee (marquee text is strictly the real collection name only)
    const bandEl = document.createElement("div");
    bandEl.setAttribute("aria-hidden", "true");
    bandEl.className = "pointer-events-none invisible absolute inset-0 z-[1] overflow-hidden";
    bandEl.style.backgroundColor = settings.marqueeBgColor;
    bandEl.style.color = settings.marqueeTextColor;
    bandEl.style.clipPath = "inset(50% 0 50% 0)";

    const trackEl = document.createElement("div");
    trackEl.className = "flex h-full w-max items-center will-change-transform";

    // Repeat parts for continuous marquee loop; marquee text is strictly item.text (real collection name only)
    const copiesCount = 6;
    for (let c = 0; c < copiesCount; c++) {
      const part = document.createElement("div");
      part.className = "flex h-full shrink-0 items-center";
      part.innerHTML = `
        <span class="px-5 font-serif text-xl sm:text-3xl font-bold tracking-tight whitespace-nowrap text-[#1C1613]">${safeText}</span>
        ${
          hasRealImage
            ? `<span class="mx-3 block h-10 sm:h-12 w-20 sm:w-24 shrink-0 rounded-full bg-cover bg-top border border-[#1C1613]/25 shadow-2xs" style="background-image: url('${escapeHtml(
                item.image
              )}');"></span>`
            : `<span class="mx-3 inline-block w-2 h-2 rounded-full bg-[#1C1613]/60"></span>`
        }
      `;
      trackEl.appendChild(part);
    }

    bandEl.appendChild(trackEl);
    li.appendChild(a);
    li.appendChild(bandEl);
    ul.appendChild(li);

    rows.push({ item: li, link: a, band: bandEl, track: trackEl, data: item });
  });

  container.appendChild(nav);

  const markRows = () => {
    rows.forEach((row, index) => {
      if (!row?.item) return;
      if (index === band.index) row.item.setAttribute("data-current", "");
      else row.item.removeAttribute("data-current");
    });
  };

  const paint = () => {
    const height = Math.max(0, band.bottom - band.top);
    rows.forEach((row, index) => {
      const m = metrics[index];
      if (!row?.band || !m) return;
      const state = marqueeAt(index);
      state.covered = false;
      const from = Math.max(band.top, m.top);
      const to = Math.min(band.bottom, m.top + m.height);
      if (!band.shown || to - from < 0.25) {
        row.band.style.visibility = "hidden";
      } else {
        const side = Math.min(settings.bandInset, Math.max(0, m.height / 2 - 2));
        const radius = Math.min(settings.bandRadius, height / 2, Math.max(0, (row.item?.clientWidth ?? 0) / 2 - side));
        row.band.style.visibility = "visible";
        row.band.style.clipPath = `inset(${(band.top - m.top).toFixed(2)}px ${side}px ${(m.top + m.height - band.bottom).toFixed(
          2
        )}px ${side}px round ${radius.toFixed(2)}px)`;
        state.covered = (to - from) / Math.max(1, m.height) > 0.04;
      }
      if (row.track) {
        row.track.style.transform = `translate3d(${state.x.toFixed(2)}px, 0, 0)`;
      }
    });
  };

  const frame = (now) => {
    engine.raf = 0;
    if (engine.disposed || document.hidden) return;
    const reduced = prefersReduced();
    const elapsed = clamp((now - engine.last) / 1000, 0, 1 / 20);
    engine.last = now;
    let busy = false;

    if (band.shown) {
      const current = band.index >= 0 ? metrics[band.index] : null;
      if (current) {
        const inset = insetFor(current.height);
        const lean =
          cursor.y === null || reduced
            ? 0
            : clamp(
                (cursor.y - (current.top + current.height / 2)) * settings.magnet,
                -current.height * 0.25,
                current.height * 0.25
              );
        band.toTop = current.top + inset + lean;
        band.toBottom = current.top + current.height - inset + lean;
      } else if (band.index < 0) {
        band.toTop = band.toBottom = band.rest;
      }

      const gap = (band.toTop + band.toBottom) / 2 - (band.top + band.bottom) / 2;
      if (Math.abs(gap) > 2) band.lead = gap > 0 ? 1 : -1;

      if (reduced) {
        band.top = band.toTop;
        band.bottom = band.toBottom;
        band.vTop = band.vBottom = 0;
      } else {
        const omega = (Math.PI * 2) / settings.duration;
        const fast = omega * (1 + 1.1 * settings.stretch);
        const slow = omega * (1 - 0.4 * settings.stretch);
        const zeta = 1 - 0.3 * settings.stretch;
        const wTop = band.lead > 0 ? slow : fast;
        const wBottom = band.lead > 0 ? fast : slow;
        const steps = Math.max(1, Math.ceil(elapsed / (1 / 240)));
        const dt = elapsed / steps;
        for (let i = 0; i < steps; i++) {
          band.vTop += (-wTop * wTop * (band.top - band.toTop) - 2 * zeta * wTop * band.vTop) * dt;
          band.vBottom += (-wBottom * wBottom * (band.bottom - band.toBottom) - 2 * zeta * wBottom * band.vBottom) * dt;
          band.top += band.vTop * dt;
          band.bottom += band.vBottom * dt;
          if (band.bottom < band.top) {
            const mid = (band.top + band.bottom) / 2;
            const v = (band.vTop + band.vBottom) / 2;
            band.top = band.bottom = mid;
            band.vTop = band.vBottom = v;
          }
        }
      }

      const resting =
        Math.abs(band.top - band.toTop) < 0.1 &&
        Math.abs(band.bottom - band.toBottom) < 0.1 &&
        Math.abs(band.vTop) < 2 &&
        Math.abs(band.vBottom) < 2;
      if (resting) {
        band.top = band.toTop;
        band.bottom = band.toBottom;
        band.vTop = band.vBottom = 0;
        if (band.index < 0 && band.bottom - band.top < 0.5) band.shown = false;
      } else {
        busy = true;
      }
    }

    cursor.vx *= Math.exp(-elapsed / 0.3);
    const push = clamp(cursor.vx * settings.followCursor * 0.55, -1200, 1200);

    marquees.forEach((state, index) => {
      if (!state) return;
      const goal = state.covered ? 1 : 0;
      state.spin += (goal - state.spin) * (1 - Math.exp(-elapsed / 0.35));
      if (Math.abs(goal - state.spin) < 0.002) state.spin = goal;
      if (!state.covered && state.spin === 0) return;
      busy = true;
      if (state.part <= 0 || reduced) return;
      const flow = settings.direction === "alternate" ? (index % 2 ? 1 : -1) : settings.direction === "right" ? 1 : -1;
      state.x += (flow * settings.speed + push) * state.spin * elapsed;
      state.x = (((state.x % state.part) + state.part) % state.part) - state.part;
    });

    paint();
    if (busy) engine.raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (engine.raf || engine.disposed || typeof window === "undefined") return;
    engine.last = performance.now();
    engine.raf = requestAnimationFrame(frame);
  };

  const goTo = (index, from = "top") => {
    measure();
    const m = metrics[index];
    if (!m) return;
    const inset = insetFor(m.height);
    const top = m.top + inset;
    const bottom = m.top + m.height - inset;
    if (!band.shown) {
      const start = from === "bottom" ? bottom : from === "center" ? (top + bottom) / 2 : top;
      band.top = band.bottom = start;
      band.vTop = band.vBottom = 0;
      band.shown = true;
    }
    const shift = (top + bottom) / 2 - (band.top + band.bottom) / 2;
    if (Math.abs(shift) > 0.5) band.lead = shift > 0 ? 1 : -1;
    else band.lead = from === "bottom" ? -1 : 1;
    band.toTop = top;
    band.toBottom = bottom;
    band.index = index;
    markRows();
    kick();
  };

  const release = (toward = "bottom") => {
    if (!band.shown) return;
    const point = toward === "top" ? band.toTop : toward === "bottom" ? band.toBottom : (band.toTop + band.toBottom) / 2;
    band.lead = toward === "top" ? -1 : 1;
    band.rest = point;
    band.toTop = band.toBottom = point;
    band.index = -1;
    cursor.y = null;
    markRows();
    kick();
  };

  const rowAt = (clientY) => {
    const rect = ul.getBoundingClientRect();
    const y = clientY - rect.top;
    return metrics.findIndex((m) => m && y >= m.top && y < m.top + m.height);
  };

  const halfOf = (clientY, index) => {
    const m = metrics[index];
    if (!m) return "top";
    const rect = ul.getBoundingClientRect();
    return clientY - rect.top - m.top < m.height / 2 ? "top" : "bottom";
  };

  const measure = () => {
    metrics = rows.map((row) => (row?.item ? { top: row.item.offsetTop, height: row.item.offsetHeight } : null));
    rows.forEach((row, index) => {
      const state = marqueeAt(index);
      const part = row?.track?.firstElementChild;
      const width = part?.getBoundingClientRect().width ?? 0;
      if (width > 0) {
        state.part = width;
        state.x = (((state.x % width) + width) % width) - width;
      }
    });
    if (band.shown && band.index >= 0) {
      const m = metrics[band.index];
      if (m) {
        const inset = insetFor(m.height);
        band.toTop = m.top + inset;
        band.toBottom = m.top + m.height - inset;
      }
    }
    paint();
  };

  const onPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    const now = performance.now();
    const gap = (now - cursor.t) / 1000;
    if (gap > 0 && gap < 0.1) {
      const instant = (event.clientX - cursor.x) / gap;
      cursor.vx += (instant - cursor.vx) * (1 - Math.exp(-gap / 0.08));
    }
    cursor.x = event.clientX;
    cursor.t = now;
    const rect = ul.getBoundingClientRect();
    cursor.y = event.clientY - rect.top;
    const index = rowAt(event.clientY);
    if (index >= 0 && index !== band.index) {
      goTo(index, halfOf(event.clientY, index));
    } else {
      kick();
    }
  };

  const onPointerLeave = (event) => {
    if (event.pointerType === "touch") return;
    if (band.index < 0) return;
    const rect = ul.getBoundingClientRect();
    if (event.clientY <= rect.top) release("top");
    else if (event.clientY >= rect.bottom) release("bottom");
    else release(halfOf(event.clientY, band.index));
  };

  ul.addEventListener("pointermove", onPointerMove);
  ul.addEventListener("pointerleave", onPointerLeave);

  rows.forEach((row, index) => {
    const link = row.link;
    link.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        goTo(index, "center");
      }
    });
    link.addEventListener("focus", () => {
      goTo(index, "top");
    });
    link.addEventListener("blur", (event) => {
      const next = event.relatedTarget;
      if (next && ul.contains(next)) return;
      release("bottom");
    });
    link.addEventListener("click", (event) => {
      if (typeof settings.onItemClick === "function") {
        settings.onItemClick(row.data, index, event);
      }
    });
  });

  measure();
  let observer = null;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => measure());
    observer.observe(nav);
  }

  return {
    measure,
    destroy() {
      engine.disposed = true;
      cancelAnimationFrame(engine.raf);
      if (observer) observer.disconnect();
      ul.removeEventListener("pointermove", onPointerMove);
      ul.removeEventListener("pointerleave", onPointerLeave);
    }
  };
}
