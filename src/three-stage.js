/**
 * Three.js 3D Saree Stage (src/three-stage.js)
 *
 * Implements the pinned 3D stage for Janardhan Textiles:
 * - Scene 1 (The woven layers): 4 Z-stacked planes per saree (left: Magenta Kanchipuram,
 *   right: Champagne-Gold Tissue) that converge in order along Z into the unified textile.
 * - Scene 2 (The finished sarees): Side-by-side finished sarees on a warm studio backdrop.
 * - Scene 3 (The drape in motion): Transitions from mannequin to woman wearing each saree,
 *   with a restrained Three.js vertex-shader cloth pallu sweep tied to scroll progress.
 * - Scene 4 (Co-Founder closing): Recedes gracefully into the peacock-teal & antique-gold closing stage.
 * - Optional GLTFLoader / DRACOLoader support when real .glb/.gltf models are present or uploaded.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const PLANE_WIDTH = 2.15;
const PLANE_HEIGHT = 3.10;

/**
 * Custom Vertex Shader for Drape Cloth Pallu Sweep & Layered Planes
 * - Applies restrained low-frequency, low-amplitude sine wave vertex displacement
 *   weighted toward the pallu (lower-outer diagonal of the cloth mesh) so the top
 *   shoulder anchor stays stable and the saree design is never distorted.
 */
const CLOTH_VERTEX_SHADER = /* glsl */ `
  uniform float uSweepAmplitude;
  uniform float uSweepPhase;
  uniform vec4 uCropInset; // top, right, bottom, left
  varying vec2 vUv;
  varying float vWaveShade;

  void main() {
    // Remap UVs inward if cropInset is configured to hide outer storyboard dividers/borders
    vec2 croppedUv = vec2(
      mix(uCropInset.w, 1.0 - uCropInset.y, uv.x),
      mix(uCropInset.z, 1.0 - uCropInset.x, uv.y)
    );
    vUv = croppedUv;

    vec3 pos = position;

    // Weight cloth motion toward the lower pallu & outer drape edge; keep top anchor steady
    float verticalWeight = smoothstep(0.88, 0.12, uv.y);
    float horizontalWeight = smoothstep(0.05, 0.85, uv.x);
    float palluMask = clamp(verticalWeight * (0.45 + 0.55 * horizontalWeight), 0.0, 1.0);

    // Restrained low-frequency traveling wave
    float wavePrimary = sin(uv.y * 4.2 - uSweepPhase * 2.4 + uv.x * 2.6);
    float waveSecondary = cos(uv.x * 5.0 + uSweepPhase * 1.6) * 0.35;
    float displacement = (wavePrimary + waveSecondary) * uSweepAmplitude * palluMask;

    pos.z += displacement;
    pos.x += displacement * 0.16;

    vWaveShade = displacement * 0.45;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/**
 * Custom Fragment Shader for Preserving True Saree Colors & Cross-Fading Mannequin -> Woman
 */
const CLOTH_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexPrimary;
  uniform sampler2D uTexSecondary;
  uniform float uMixRatio;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vWaveShade;

  void main() {
    vec4 colA = texture2D(uTexPrimary, vUv);
    vec4 colB = texture2D(uTexSecondary, vUv);
    vec4 blended = mix(colA, colB, clamp(uMixRatio, 0.0, 1.0));

    // Soft edge alpha mask to remove any 1px border artifacts cleanly
    float edgeMaskX = smoothstep(0.0, 0.012, vUv.x) * smoothstep(1.0, 0.988, vUv.x);
    float edgeMaskY = smoothstep(0.0, 0.012, vUv.y) * smoothstep(1.0, 0.988, vUv.y);
    float edgeAlpha = edgeMaskX * edgeMaskY;

    // Subtle silk self-shading from cloth wave without altering hue
    vec3 finalRgb = clamp(blended.rgb + vec3(vWaveShade * 0.18), 0.0, 1.0);
    float finalAlpha = blended.a * uOpacity * edgeAlpha;

    if (finalAlpha < 0.01) discard;
    gl_FragColor = vec4(finalRgb, finalAlpha);
  }
`;

export class ThreeStage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} config - Site configuration from src/config.js
   * @param {ConstrainedOrbitControl} orbitControl
   */
  constructor(canvas, config, orbitControl) {
    this.canvas = canvas;
    this.config = config;
    this.orbitControl = orbitControl;

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isMobile = window.innerWidth < 768;

    // Scrubbed timeline state updated strictly by ScrollController (0..1 per phase)
    this.state = {
      globalProgress: 0,
      activeSceneIndex: 0,
      // Scene 1: 0 = separated Z layers, 1 = assembled into unified fabric
      layerAssemblyProgress: 0,
      // Crossfade from Scene 1 (woven layers) -> Scene 2 (finished sarees)
      finishedMix: 0,
      // Crossfade from Scene 2 (finished sarees) -> Scene 3 (drape in motion)
      drapeEnterMix: 0,
      // Within Scene 3: 0 = mannequin, 1 = woman wearing saree
      womanCrossfade: 0,
      // Within Scene 3: cloth pallu vertex displacement amplitude (0..0.11) and phase
      palluSweepAmplitude: 0,
      palluSweepPhase: 0,
      // Scene 4: Co-Founder closing transition (0 = stage visible, 1 = receded for closing card)
      cofounderMix: 0,
      // Camera scroll-driven Z & Y targets
      cameraZ: 6.2,
      cameraY: 0.0
    };

    this.texturesToDispose = [];
    this.geometriesToDispose = [];
    this.materialsToDispose = [];
    this.customModelGroup = null;

    this._initScene();
    this._initLights();
    this._initBackdropAndFrames();
    this._initSareeAssemblies();
    this._checkConfiguredGLTFModels();
    this._bindResizeAndMotionQuery();
    this._startRenderLoop();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.config.colors?.ivory || '#F6F1E9');

    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.1, 50);
    this.camera.position.set(0, 0, 6.2);

    // Cap pixel ratio for mobile/low-power devices
    const maxDpr = this.isMobile ? 1.5 : 2.0;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isMobile,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Master stage group rotated gently by ConstrainedOrbitControl
    this.stageRoot = new THREE.Group();
    this.scene.add(this.stageRoot);

    this.leftColumnGroup = new THREE.Group();
    this.rightColumnGroup = new THREE.Group();
    this.stageRoot.add(this.leftColumnGroup);
    this.stageRoot.add(this.rightColumnGroup);
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0xfffaf0, 1.35);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff5e4, 0.9);
    keyLight.position.set(2.5, 3.5, 5.0);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc4a15a, 0.45);
    rimLight.position.set(-3.0, -1.5, 3.0);
    this.scene.add(rimLight);
  }

  _initBackdropAndFrames() {
    // Warm studio backdrop plane that intensifies in Scene 2 ("The finished sarees")
    const studioGeo = new THREE.PlaneGeometry(11.5, 6.8);
    const studioMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.config.colors?.studioWarm || '#EFE7DA'),
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this.studioBackdropMesh = new THREE.Mesh(studioGeo, studioMat);
    this.studioBackdropMesh.position.set(0, 0, -0.95);
    this.stageRoot.add(this.studioBackdropMesh);

    this.geometriesToDispose.push(studioGeo);
    this.materialsToDispose.push(studioMat);
  }

  /**
   * Loads an image texture with fallback path resolution (/assets/... -> /public/assets/...)
   * and procedural silk fallback if an asset file is missing.
   */
  _loadTextureWithFallback(rawPath, fallbackVariant = 'magenta', layerIndex = 0) {
    const texture = this._createProceduralSilkTexture(fallbackVariant, layerIndex);
    const loader = new THREE.TextureLoader();

    const tryPaths = [rawPath];
    if (rawPath.startsWith('/assets/')) {
      tryPaths.push(`/public${rawPath}`);
      tryPaths.push(`.${rawPath}`);
    }

    const attemptLoad = (idx) => {
      if (idx >= tryPaths.length) return;
      loader.load(
        tryPaths[idx],
        (loadedTex) => {
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          loadedTex.minFilter = THREE.LinearFilter;
          loadedTex.magFilter = THREE.LinearFilter;
          loadedTex.needsUpdate = true;
          texture.image = loadedTex.image;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
        },
        undefined,
        () => attemptLoad(idx + 1)
      );
    };

    attemptLoad(0);
    this.texturesToDispose.push(texture);
    return texture;
  }

  /**
   * Low-memory procedural silk fallback texture so the 3D stage never displays blank planes
   * before async image load completes or if a path is missing.
   */
  _createProceduralSilkTexture(variant = 'magenta', layerIndex = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 368;
    const ctx = canvas.getContext('2d');

    const isMagenta = variant.includes('magenta');
    const baseHex = isMagenta ? '#84123E' : '#D6C198';
    const weftHex = isMagenta ? '#A82454' : '#E8D7B2';
    const goldHex = '#C4A15A';
    const accentHex = isMagenta ? '#063F46' : '#9C7636';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (layerIndex === 0 || layerIndex === 99) {
      // Base silk warp
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, baseHex);
      grad.addColorStop(0.5, weftHex);
      grad.addColorStop(1, baseHex);
      ctx.fillStyle = grad;
      ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
    }

    if (layerIndex === 1 || layerIndex === 99) {
      // Weft grid lines
      ctx.strokeStyle = isMagenta ? 'rgba(255,215,160,0.28)' : 'rgba(196,161,90,0.34)';
      ctx.lineWidth = 1;
      for (let y = 16; y < canvas.height - 16; y += 18) {
        ctx.beginPath();
        ctx.moveTo(12, y);
        ctx.lineTo(canvas.width - 12, y);
        ctx.stroke();
      }
      for (let x = 16; x < canvas.width - 16; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, 12);
        ctx.lineTo(x, canvas.height - 12);
        ctx.stroke();
      }
    }

    if (layerIndex === 2 || layerIndex === 99) {
      // Korvai Zari borders + pallu band
      ctx.fillStyle = goldHex;
      ctx.fillRect(8, 8, 28, canvas.height - 16);
      ctx.fillRect(canvas.width - 36, 8, 28, canvas.height - 16);
      ctx.fillRect(8, canvas.height - 96, canvas.width - 16, 88);

      ctx.fillStyle = accentHex;
      for (let y = 14; y < canvas.height - 96; y += 16) {
        ctx.beginPath();
        ctx.moveTo(36, y);
        ctx.lineTo(44, y + 8);
        ctx.lineTo(36, y + 16);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(canvas.width - 36, y);
        ctx.lineTo(canvas.width - 44, y + 8);
        ctx.lineTo(canvas.width - 36, y + 16);
        ctx.fill();
      }
    }

    if (layerIndex === 3 || layerIndex === 99) {
      // Zari Butta diamond motifs
      ctx.fillStyle = '#E5C983';
      for (let y = 32; y < canvas.height - 40; y += 36) {
        for (let x = 52; x < canvas.width - 52; x += 36) {
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.lineTo(x + 6, y);
          ctx.lineTo(x, y + 6);
          ctx.lineTo(x - 6, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _initSareeAssemblies() {
    const sceneWoven = this.config.scenes.find((s) => s.id === 'woven-layers');
    const sceneFinished = this.config.scenes.find((s) => s.id === 'finished');
    const sceneDrape = this.config.scenes.find((s) => s.id === 'drape-motion');

    const layerFiles = sceneWoven?.layerFiles || [
      'layer-0.png',
      'layer-1.png',
      'layer-2.png',
      'layer-3.png'
    ];

    const leftLayerBase =
      sceneWoven?.images?.find((i) => i.role === 'leftFabric')?.path ||
      '/assets/magenta-kanchipuram-layers/';
    const rightLayerBase =
      sceneWoven?.images?.find((i) => i.role === 'rightFabric')?.path ||
      '/assets/champagne-tissue-layers/';

    const leftFinishedImg =
      sceneFinished?.images?.find((i) => i.role === 'leftFinished') || {
        path: '/assets/magenta-finished.jpg'
      };
    const rightFinishedImg =
      sceneFinished?.images?.find((i) => i.role === 'rightFinished') || {
        path: '/assets/champagne-finished.jpg'
      };

    const mannequinLeftImg =
      sceneDrape?.images?.find((i) => i.role === 'mannequinLeft') || {
        path: '/assets/magenta-mannequin.jpg'
      };
    const womanLeftImg =
      sceneDrape?.images?.find((i) => i.role === 'womanLeft') || {
        path: '/assets/magenta-woman.jpg'
      };
    const mannequinRightImg =
      sceneDrape?.images?.find((i) => i.role === 'mannequinRight') || {
        path: '/assets/champagne-mannequin.jpg'
      };
    const womanRightImg =
      sceneDrape?.images?.find((i) => i.role === 'womanRight') || {
        path: '/assets/champagne-woman.jpg'
      };

    this.leftAssembly = this._createSideAssembly({
      parentGroup: this.leftColumnGroup,
      side: 'left',
      variant: 'magenta',
      layerBaseDir: leftLayerBase,
      layerFiles,
      finishedImage: leftFinishedImg,
      mannequinImage: mannequinLeftImg,
      womanImage: womanLeftImg
    });

    this.rightAssembly = this._createSideAssembly({
      parentGroup: this.rightColumnGroup,
      side: 'right',
      variant: 'champagne',
      layerBaseDir: rightLayerBase,
      layerFiles,
      finishedImage: rightFinishedImg,
      mannequinImage: mannequinRightImg,
      womanImage: womanRightImg
    });

    this._updateResponsiveLayout();
  }

  _createSideAssembly({
    parentGroup,
    side,
    variant,
    layerBaseDir,
    layerFiles,
    finishedImage,
    mannequinImage,
    womanImage
  }) {
    const dirNormalized = layerBaseDir.endsWith('/') ? layerBaseDir : `${layerBaseDir}/`;
    const planeGeo = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT, 1, 1);
    const borderGeo = new THREE.EdgesGeometry(planeGeo);
    this.geometriesToDispose.push(planeGeo, borderGeo);

    // 1. Woven Layer Planes (Scene 1): 4 planes stacked in Z
    const layerMeshes = [];
    const count = layerFiles.length;

    for (let i = 0; i < count; i++) {
      const fullPath = `${dirNormalized}${layerFiles[i]}`;
      const tex = this._loadTextureWithFallback(fullPath, variant, i);

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(planeGeo, mat);

      // Subtle antique-gold technical layer outline visible when planes are separated in Scene 1
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(this.config.colors?.gold || '#C4A15A'),
        transparent: true,
        opacity: 0.45
      });
      const wire = new THREE.LineSegments(borderGeo, lineMat);
      mesh.add(wire);

      parentGroup.add(mesh);
      this.materialsToDispose.push(mat, lineMat);

      layerMeshes.push({
        mesh,
        mat,
        wireMat: lineMat,
        index: i
      });
    }

    // 2. Finished Saree Plane & Studio Pedestal Frame (Scene 2)
    const finishedTex = this._loadTextureWithFallback(finishedImage.path, variant, 99);
    const finishedCrop = finishedImage.cropInset || { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 };
    const finishedMat = new THREE.ShaderMaterial({
      vertexShader: CLOTH_VERTEX_SHADER,
      fragmentShader: CLOTH_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTexPrimary: { value: finishedTex },
        uTexSecondary: { value: finishedTex },
        uMixRatio: { value: 0.0 },
        uOpacity: { value: 0.0 },
        uSweepAmplitude: { value: 0.0 },
        uSweepPhase: { value: 0.0 },
        uCropInset: {
          value: new THREE.Vector4(
            finishedCrop.top,
            finishedCrop.right,
            finishedCrop.bottom,
            finishedCrop.left
          )
        }
      }
    });
    const finishedMesh = new THREE.Mesh(planeGeo, finishedMat);
    finishedMesh.position.set(0, 0, 0.03);
    parentGroup.add(finishedMesh);
    this.materialsToDispose.push(finishedMat);

    // 3. Drape in Motion Subdivided Cloth Mesh (Scene 3: Mannequin -> Woman + Pallu Sweep)
    const clothGeo = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT, 48, 64);
    this.geometriesToDispose.push(clothGeo);

    const mannequinTex = this._loadTextureWithFallback(mannequinImage.path, variant, 99);
    const womanTex = this._loadTextureWithFallback(womanImage.path, variant, 99);
    const drapeCrop = womanImage.cropInset || { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 };

    const drapeMat = new THREE.ShaderMaterial({
      vertexShader: CLOTH_VERTEX_SHADER,
      fragmentShader: CLOTH_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTexPrimary: { value: mannequinTex },
        uTexSecondary: { value: womanTex },
        uMixRatio: { value: 0.0 },
        uOpacity: { value: 0.0 },
        uSweepAmplitude: { value: 0.0 },
        uSweepPhase: { value: 0.0 },
        uCropInset: {
          value: new THREE.Vector4(
            drapeCrop.top,
            drapeCrop.right,
            drapeCrop.bottom,
            drapeCrop.left
          )
        }
      }
    });

    const drapeMesh = new THREE.Mesh(clothGeo, drapeMat);
    drapeMesh.position.set(0, 0, 0.05);
    parentGroup.add(drapeMesh);
    this.materialsToDispose.push(drapeMat);

    return {
      side,
      layerMeshes,
      finishedMesh,
      finishedMat,
      drapeMesh,
      drapeMat
    };
  }

  /**
   * Checks if real .glb/.gltf model paths are configured in src/config.js.
   * Only loads GLTF models if configured or uploaded by the user.
   */
  _checkConfiguredGLTFModels() {
    const leftGlb = this.config.models?.leftSareeGlb;
    const rightGlb = this.config.models?.rightSareeGlb;
    if (leftGlb) {
      this.loadGLTFModelFromUrl(leftGlb, 'left');
    }
    if (rightGlb) {
      this.loadGLTFModelFromUrl(rightGlb, 'right');
    }
  }

  _getGLTFLoader() {
    if (!this._gltfLoader) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(
        this.config.models?.dracoDecoderPath ||
          'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
      );
      this._gltfLoader = new GLTFLoader();
      this._gltfLoader.setDRACOLoader(dracoLoader);
    }
    return this._gltfLoader;
  }

  loadGLTFModelFromUrl(url, targetSide = 'both', onComplete) {
    const loader = this._getGLTFLoader();
    loader.load(
      url,
      (gltf) => {
        this._attachLoadedGLTF(gltf.scene, targetSide);
        if (onComplete) onComplete(true, 'Loaded 3D GLTF model into stage.');
      },
      undefined,
      (err) => {
        console.warn('GLTF load failed, keeping layered planes:', err);
        if (onComplete) onComplete(false, 'Could not parse .glb/.gltf model.');
      }
    );
  }

  /**
   * Verified local file upload handler for .glb/.gltf models
   */
  loadUserGLTFFile(file, onComplete) {
    const objectUrl = URL.createObjectURL(file);
    this.loadGLTFModelFromUrl(objectUrl, 'both', (ok, msg) => {
      URL.revokeObjectURL(objectUrl);
      if (onComplete) onComplete(ok, ok ? `Loaded ${file.name}` : msg);
    });
  }

  _attachLoadedGLTF(modelScene, targetSide) {
    this.clearCustomGLTFModel();

    // Normalize bounding box to fit stage dimensions cleanly
    const box = new THREE.Box3().setFromObject(modelScene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2.8 / maxDim;
    modelScene.scale.setScalar(scale);
    modelScene.position.sub(center.multiplyScalar(scale));

    this.customModelGroup = new THREE.Group();
    this.customModelGroup.add(modelScene);
    this.stageRoot.add(this.customModelGroup);
  }

  clearCustomGLTFModel() {
    if (!this.customModelGroup) return;
    this.stageRoot.remove(this.customModelGroup);
    this.customModelGroup = null;
  }

  /**
   * Ensures both sarees remain visible and properly proportioned across desktop, tablet, and phone.
   */
  _updateResponsiveLayout() {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    const aspect = w / h;
    this.isMobile = w < 768;

    if (w < 640) {
      // Phones: vertical/staggered stacking so both Magenta & Champagne sarees remain completely visible
      const mobileScale = Math.min(0.56, Math.max(0.44, aspect * 0.88));
      this.leftColumnGroup.scale.setScalar(mobileScale);
      this.rightColumnGroup.scale.setScalar(mobileScale);
      this.leftColumnGroup.position.set(-0.62, 0.58, 0);
      this.rightColumnGroup.position.set(0.62, -0.62, 0);
    } else if (w < 1024) {
      // Tablet: side-by-side scaled for comfort
      const tabletScale = Math.min(0.78, Math.max(0.62, aspect * 0.68));
      this.leftColumnGroup.scale.setScalar(tabletScale);
      this.rightColumnGroup.scale.setScalar(tabletScale);
      this.leftColumnGroup.position.set(-1.08, -0.05, 0);
      this.rightColumnGroup.position.set(1.08, -0.05, 0);
    } else {
      // Desktop: full cinematic side-by-side layout
      this.leftColumnGroup.scale.setScalar(0.95);
      this.rightColumnGroup.scale.setScalar(0.95);
      this.leftColumnGroup.position.set(-1.38, -0.06, 0);
      this.rightColumnGroup.position.set(1.38, -0.06, 0);
    }
  }

  _bindResizeAndMotionQuery() {
    this._onResize = () => {
      const w = window.innerWidth;
      const h = Math.max(window.innerHeight, 1);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();

      const maxDpr = w < 768 ? 1.5 : 2.0;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      this.renderer.setSize(w, h);
      this._updateResponsiveLayout();
    };

    window.addEventListener('resize', this._onResize, { passive: true });

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._onMotionChange = (e) => {
      this.reducedMotion = e.matches;
    };
    motionQuery.addEventListener('change', this._onMotionChange);
  }

  /**
   * Applies current scrubbed state (set by ScrollController) to all 3D meshes and shaders.
   */
  _applyTimelineStateToMeshes() {
    const {
      layerAssemblyProgress,
      finishedMix,
      drapeEnterMix,
      womanCrossfade,
      palluSweepAmplitude,
      palluSweepPhase,
      cofounderMix,
      cameraZ,
      cameraY
    } = this.state;

    // Fade out 3D saree planes smoothly when entering Scene 4 (Co-Founder closing screen)
    const stageVisibility = 1.0 - cofounderMix * 0.92;

    // Studio warm backdrop peaks during Scene 2 ("The finished sarees") and Scene 3
    if (this.studioBackdropMesh) {
      this.studioBackdropMesh.material.opacity =
        Math.min(1.0, finishedMix * 0.95) * (1.0 - cofounderMix);
    }

    const updateSide = (assembly, directionSign) => {
      if (!assembly) return;

      const count = assembly.layerMeshes.length;
      const layerOpacityMaster = (1.0 - finishedMix) * stageVisibility;

      // Scene 1: Animate separated Z planes coming together in order into the finished weave
      assembly.layerMeshes.forEach((item, idx) => {
        // Stagger each layer slightly so warp -> weft -> border -> zari assemble sequentially
        const staggerStart = idx * 0.12;
        const staggerSpan = 1.0 - (count - 1) * 0.12;
        const localProgress = Math.max(
          0,
          Math.min(1, (layerAssemblyProgress - staggerStart) / staggerSpan)
        );
        // Smoothstep easing for tactile precision
        const eased = localProgress * localProgress * (3 - 2 * localProgress);

        // Separated Z offsets when localProgress = 0 -> converged Z offsets when localProgress = 1
        const separatedZ = (idx - (count - 1) * 0.5) * (this.reducedMotion ? 0.18 : 0.46);
        const convergedZ = idx * 0.006;
        item.mesh.position.z = separatedZ + (convergedZ - separatedZ) * eased;

        // Fan X & Y subtly when separated so all 4 layers are clearly distinguishable even head-on
        const separatedX =
          directionSign * (idx - (count - 1) * 0.5) * (this.reducedMotion ? 0.04 : 0.22);
        const separatedY = (idx - (count - 1) * 0.5) * (this.reducedMotion ? 0.03 : 0.12);
        item.mesh.position.x = separatedX * (1.0 - eased);
        item.mesh.position.y = separatedY * (1.0 - eased);

        // Gentle Y-axis angle when separated in 3D space, aligning flat at eased = 1
        const separatedRotY = directionSign * (this.reducedMotion ? 0 : -0.22) * (1.0 - eased);
        item.mesh.rotation.y = separatedRotY;

        item.mat.opacity = layerOpacityMaster;
        item.wireMat.opacity = (1.0 - eased) * 0.55 * layerOpacityMaster;
        item.mesh.visible = layerOpacityMaster > 0.005 && !this.customModelGroup;
      });

      // Scene 2: Finished Sarees opacity (peaks when finishedMix = 1 and drapeEnterMix = 0)
      const finishedOpacity = finishedMix * (1.0 - drapeEnterMix) * stageVisibility;
      assembly.finishedMat.uniforms.uOpacity.value = finishedOpacity;
      assembly.finishedMesh.visible = finishedOpacity > 0.005 && !this.customModelGroup;

      // Scene 3: Drape in Motion (Mannequin -> Woman + Cloth Pallu Sweep)
      const drapeOpacity = drapeEnterMix * stageVisibility;
      assembly.drapeMat.uniforms.uOpacity.value = drapeOpacity;
      assembly.drapeMat.uniforms.uMixRatio.value = womanCrossfade;

      // Disable vertex displacement if user prefers reduced motion
      const effectiveSweepAmp = this.reducedMotion ? 0.0 : palluSweepAmplitude;
      assembly.drapeMat.uniforms.uSweepAmplitude.value = effectiveSweepAmp;
      assembly.drapeMat.uniforms.uSweepPhase.value = palluSweepPhase;
      assembly.drapeMesh.visible = drapeOpacity > 0.005 && !this.customModelGroup;
    };

    updateSide(this.leftAssembly, -1);
    updateSide(this.rightAssembly, 1);

    // Blend user constrained orbit rotation with scroll-animated camera pose
    const orbitPose = this.orbitControl
      ? this.orbitControl.update(this.reducedMotion)
      : { yaw: 0, pitch: 0 };

    // Reduce orbit rotation during Scene 4 closing card
    const stageOrbitWeight = 1.0 - cofounderMix * 0.85;
    this.stageRoot.rotation.y = orbitPose.yaw * stageOrbitWeight;
    this.stageRoot.rotation.x = orbitPose.pitch * stageOrbitWeight;

    const targetZ = this.reducedMotion ? 6.2 : cameraZ;
    const targetY = this.reducedMotion ? 0.0 : cameraY;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.12;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.12;
    this.camera.lookAt(0, 0, 0);
  }

  _startRenderLoop() {
    const render = () => {
      this._rafId = requestAnimationFrame(render);
      this._applyTimelineStateToMeshes();
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }

  dispose() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._onResize);
    this.texturesToDispose.forEach((t) => t.dispose());
    this.geometriesToDispose.forEach((g) => g.dispose());
    this.materialsToDispose.forEach((m) => m.dispose());
    this.renderer.dispose();
  }
}
