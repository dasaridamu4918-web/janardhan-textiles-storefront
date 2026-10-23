/**
 * Co-Founder Closing Component (Scene 4)
 * Uses ivory (#F6F1E9), deep peacock teal (#063F46), and antique gold (#C4A15A).
 * Loads portrait from config.cofounder.portrait (or scene.portraitPath).
 * When /assets/cofounder.jpg is absent, renders an architectural antique-gold
 * placeholder frame with the exact caption "Co-Founder, Lepakshi Weaves."
 * Never invents a co-founder name when config.cofounder.name is empty.
 */

export function initCofounder(config) {
  const cofounderScene = config.scenes.find((s) => s.id === 'cofounder') || {};
  const portraitSrc = config.cofounder?.portrait || cofounderScene.portraitPath || '/assets/cofounder.jpg';
  const cofounderName = (config.cofounder?.name || '').trim();
  const placeholderCaption =
    config.cofounder?.placeholderCaption || `Co-Founder, ${config.BRAND_NAME}.`;
  const ctaLabel = config.cofounder?.ctaLabel || 'Explore the Collection';
  const ctaHref = config.cofounder?.ctaHref || '#collection';

  const headingEl = document.getElementById('cofounder-heading');
  const eyebrowEl = document.getElementById('cofounder-eyebrow');
  const nameEl = document.getElementById('cofounder-name');
  const captionEl = document.getElementById('cofounder-caption');
  const portraitImg = document.getElementById('cofounder-portrait-img');
  const placeholderBox = document.getElementById('cofounder-placeholder');
  const placeholderText = document.getElementById('cofounder-placeholder-caption');
  const ctaBtn = document.getElementById('cofounder-cta-btn');

  if (eyebrowEl) {
    eyebrowEl.textContent = cofounderScene.eyebrow || '';
  }

  if (headingEl) {
    headingEl.textContent = cofounderScene.heading || 'Co-Founder';
  }

  // Only render name element if explicitly populated in src/config.js (never invent one)
  if (nameEl) {
    if (cofounderName.length > 0) {
      nameEl.textContent = cofounderName;
      nameEl.hidden = false;
    } else {
      nameEl.textContent = '';
      nameEl.hidden = true;
    }
  }

  if (captionEl) {
    const captionCopy = cofounderScene.caption || '';
    captionEl.textContent = captionCopy;
    captionEl.hidden = captionCopy.length === 0;
  }

  if (placeholderText) {
    placeholderText.textContent = placeholderCaption;
  }

  if (ctaBtn) {
    ctaBtn.textContent = ctaLabel;
    ctaBtn.setAttribute('href', ctaHref);
    ctaBtn.addEventListener('click', (e) => {
      const target = document.querySelector(ctaHref);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  }

  // Attempt to load /assets/cofounder.jpg; if missing, keep the elegant placeholder visible
  if (portraitImg && placeholderBox) {
    portraitImg.alt = cofounderName
      ? `${cofounderName}, Co-Founder, ${config.BRAND_NAME}`
      : `Co-Founder, ${config.BRAND_NAME}`;

    const probe = new Image();
    probe.onload = () => {
      portraitImg.src = portraitSrc;
      portraitImg.hidden = false;
      placeholderBox.hidden = true;
    };
    probe.onerror = () => {
      portraitImg.hidden = true;
      placeholderBox.hidden = false;
    };
    probe.src = portraitSrc;
  }
}
