/**
 * Collection & CTA Component
 * Populates product showcase cards, accessible alt text, and scene step indicators
 * from src/config.js.
 */

export function initCollectionAndCTA(config, { onSelectScene }) {
  const eyebrowEl = document.getElementById('collection-eyebrow');
  const headingEl = document.getElementById('collection-heading');
  const subheadingEl = document.getElementById('collection-subheading');
  const gridEl = document.getElementById('products-grid');
  const footerBrandEl = document.getElementById('footer-brand-name');
  const stepListEl = document.getElementById('scene-step-indicators');

  if (eyebrowEl) eyebrowEl.textContent = config.ui?.collectionSection?.eyebrow || '';
  if (headingEl) headingEl.textContent = config.ui?.collectionSection?.heading || '';
  if (subheadingEl) subheadingEl.textContent = config.ui?.collectionSection?.subheading || '';
  if (footerBrandEl) footerBrandEl.textContent = config.BRAND_NAME;

  // Render scene progress pills in safe zone so users can also jump via keyboard
  if (stepListEl && Array.isArray(config.scenes)) {
    stepListEl.innerHTML = '';
    config.scenes.forEach((scene, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scene-step-pill';
      btn.dataset.sceneIndex = String(idx);
      btn.setAttribute('aria-label', `${scene.heading} (Stage ${idx + 1} of ${config.scenes.length})`);
      btn.innerHTML = `<span class="step-num">0${idx + 1}</span><span class="step-label">${scene.heading}</span>`;
      btn.addEventListener('click', () => {
        if (onSelectScene) onSelectScene(idx);
      });
      stepListEl.appendChild(btn);
    });
  }

  // Render product cards from config.products
  if (gridEl && Array.isArray(config.products)) {
    gridEl.innerHTML = '';
    config.products.forEach((product, idx) => {
      const article = document.createElement('article');
      article.className = 'product-card';

      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'product-card-media';

      const img = document.createElement('img');
      img.src = product.image;
      img.alt = product.alt || product.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      mediaWrap.appendChild(img);

      const body = document.createElement('div');
      body.className = 'product-card-body';

      const title = document.createElement('h3');
      title.className = 'product-card-title';
      title.textContent = product.name;

      const desc = document.createElement('p');
      desc.className = 'product-card-desc';
      desc.textContent = product.description;

      body.appendChild(title);

      if (typeof product.originalPriceINR === 'number' && product.originalPriceINR > 0) {
        const discPct = typeof product.discountPercent === 'number' ? product.discountPercent : 0;
        const finalPrice = Math.round(product.originalPriceINR * (1 - discPct / 100));
        const priceRow = document.createElement('div');
        priceRow.style.cssText = 'display:flex;align-items:baseline;gap:0.6rem;flex-wrap:wrap;margin:0.35rem 0;';
        priceRow.innerHTML = `
          <span style="font-size:1.35rem;font-weight:700;color:#C4A15A;">₹${finalPrice.toLocaleString('en-IN')}</span>
          <span style="font-size:0.95rem;text-decoration:line-through;opacity:0.65;">₹${Math.round(product.originalPriceINR).toLocaleString('en-IN')}</span>
          ${discPct > 0 ? `<span style="font-size:0.78rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:999px;background:rgba(196,161,90,0.22);color:#C4A15A;border:1px solid rgba(196,161,90,0.5);">${discPct}% off.</span>` : ''}
        `;
        body.appendChild(priceRow);
      }

      body.appendChild(desc);

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'product-card-btn';
      actionBtn.textContent = product.id ? 'Open in Full Catalogue' : (config.ui?.collectionSection?.inquireLabel || 'Inspect Weave in 3D');
      actionBtn.setAttribute('aria-label', `${actionBtn.textContent}: ${product.name}`);
      actionBtn.addEventListener('click', () => {
        if (product.id) {
          window.location.href = '/';
          return;
        }
        if (onSelectScene) {
          onSelectScene(1);
        }
      });

      body.appendChild(actionBtn);

      article.appendChild(mediaWrap);
      article.appendChild(body);
      gridEl.appendChild(article);
    });
  }

  return {
    updateActiveStep(sceneIndex) {
      if (!stepListEl) return;
      const pills = stepListEl.querySelectorAll('.scene-step-pill');
      pills.forEach((pill, i) => {
        const isCurrent = i === sceneIndex;
        pill.classList.toggle('is-active', isCurrent);
        pill.setAttribute('aria-current', isCurrent ? 'step' : 'false');
      });
    }
  };
}
