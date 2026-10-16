/**
 * Site Header & Navigation Controller
 * Renders brand identity, accessible navigation menu, and quick scene jump links
 * sourced entirely from src/config.js.
 */

export function initHeader(config, { onSelectScene, onToggleOrbit, onModelUpload, onModelReset }) {
  const brandEl = document.getElementById('brand-name');
  const menuBtn = document.getElementById('menu-toggle-btn');
  const navDrawer = document.getElementById('site-nav-drawer');
  const navList = document.getElementById('site-nav-list');
  const skipLink = document.getElementById('skip-to-collection');
  const orbitToggleBtn = document.getElementById('orbit-toggle-btn');
  const orbitHintEl = document.getElementById('orbit-hint-text');
  const glbInput = document.getElementById('glb-upload-input');
  const glbUploadBtn = document.getElementById('glb-upload-btn');
  const glbResetBtn = document.getElementById('glb-reset-btn');
  const glbStatusEl = document.getElementById('glb-upload-status');

  if (brandEl) {
    brandEl.textContent = config.BRAND_NAME;
  }

  if (skipLink && config.ui?.skipLinkText) {
    skipLink.textContent = config.ui.skipLinkText;
  }

  if (orbitHintEl && config.ui?.orbitHintText) {
    orbitHintEl.textContent = config.ui.orbitHintText;
  }

  // Populate navigation items from config
  if (navList && Array.isArray(config.ui?.navigation)) {
    navList.innerHTML = '';
    config.ui.navigation.forEach((item) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = item.href;
      a.className = 'nav-link';
      a.textContent = item.label;
      if (typeof item.sceneIndex === 'number') {
        a.dataset.sceneIndex = String(item.sceneIndex);
      }
      a.addEventListener('click', (e) => {
        if (typeof item.sceneIndex === 'number' && onSelectScene) {
          e.preventDefault();
          closeMenu();
          onSelectScene(item.sceneIndex);
        } else {
          closeMenu();
        }
      });
      li.appendChild(a);
      navList.appendChild(li);
    });
  }

  function closeMenu() {
    if (!menuBtn || !navDrawer) return;
    menuBtn.setAttribute('aria-expanded', 'false');
    navDrawer.setAttribute('aria-hidden', 'true');
    navDrawer.classList.remove('is-open');
  }

  function toggleMenu() {
    if (!menuBtn || !navDrawer) return;
    const expanded = menuBtn.getAttribute('aria-expanded') === 'true';
    const nextState = !expanded;
    menuBtn.setAttribute('aria-expanded', String(nextState));
    navDrawer.setAttribute('aria-hidden', String(!nextState));
    navDrawer.classList.toggle('is-open', nextState);
  }

  if (menuBtn) {
    menuBtn.setAttribute('aria-label', config.ui?.menuButtonLabel || 'Toggle navigation menu');
    menuBtn.addEventListener('click', toggleMenu);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
    }
  });

  // Orbit inspect toggle button
  if (orbitToggleBtn) {
    orbitToggleBtn.textContent = config.ui?.orbitButtonEnableLabel || 'Inspect 3D Stage';
    orbitToggleBtn.addEventListener('click', () => {
      if (onToggleOrbit) {
        const isReset = orbitToggleBtn.getAttribute('aria-pressed') === 'true';
        onToggleOrbit(isReset);
        orbitToggleBtn.setAttribute('aria-pressed', String(!isReset));
        orbitToggleBtn.textContent = !isReset
          ? (config.ui?.orbitButtonActiveLabel || 'Reset 3D View')
          : (config.ui?.orbitButtonEnableLabel || 'Inspect 3D Stage');
      }
    });
  }

  // Optional verified .glb/.gltf model loader with size & extension security validation
  if (glbUploadBtn && glbInput && config.ui?.modelUpload?.enabled) {
    glbUploadBtn.textContent = config.ui.modelUpload.buttonLabel;
    glbUploadBtn.addEventListener('click', () => glbInput.click());

    glbInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validExt = /\.(glb|gltf)$/i.test(file.name);
      const maxBytes = (config.ui.modelUpload.maxFileSizeMB || 25) * 1024 * 1024;

      if (!validExt) {
        if (glbStatusEl) glbStatusEl.textContent = 'Invalid format: only .glb or .gltf files are permitted.';
        glbInput.value = '';
        return;
      }
      if (file.size > maxBytes) {
        if (glbStatusEl) {
          glbStatusEl.textContent = `File exceeds ${config.ui.modelUpload.maxFileSizeMB} MB security limit.`;
        }
        glbInput.value = '';
        return;
      }

      if (glbStatusEl) glbStatusEl.textContent = `Loading ${file.name}…`;
      if (onModelUpload) {
        onModelUpload(file, (ok, msg) => {
          if (glbStatusEl) glbStatusEl.textContent = msg;
          if (glbResetBtn) glbResetBtn.hidden = !ok;
        });
      }
    });
  }

  if (glbResetBtn) {
    glbResetBtn.textContent = config.ui?.modelUpload?.resetLabel || 'Use Layered Planes';
    glbResetBtn.addEventListener('click', () => {
      if (onModelReset) onModelReset();
      glbResetBtn.hidden = true;
      if (glbInput) glbInput.value = '';
      if (glbStatusEl) glbStatusEl.textContent = 'Restored layered saree planes.';
    });
  }

  return {
    setActiveScene(sceneIndex) {
      if (!navList) return;
      const links = navList.querySelectorAll('.nav-link');
      links.forEach((link) => {
        const idx = Number(link.dataset.sceneIndex);
        link.classList.toggle('is-active', idx === sceneIndex);
      });
    }
  };
}
