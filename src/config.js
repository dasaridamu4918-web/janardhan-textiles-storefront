const BRAND_NAME = "Janardhan Textiles";

export default {
  BRAND_NAME,
  scenes: [
    {
      id: 'woven-layers',
      eyebrow: 'Stage I · Structural Weave',
      heading: 'The woven layers',
      caption: 'Separated warp, weft, korvai border, and pure zari motifs align in three-dimensional space to form each silk structure.',
      layerFiles: ['layer-0.png', 'layer-1.png', 'layer-2.png', 'layer-3.png'],
      layerLabels: [
        'Mulberry Silk Warp Base',
        'Interlaced Weft & Kattam Grid',
        'Korvai Temple Zari Border',
        'Handwoven Gold Zari Motifs'
      ],
      images: [
        {
          role: 'leftFabric',
          path: '/assets/magenta-kanchipuram-layers/',
          alt: 'Magenta Kanchipuram fabric layers',
          title: 'Magenta Kanchipuram Silk',
          cropInset: { top: 0.02, right: 0.02, bottom: 0.02, left: 0.02 }
        },
        {
          role: 'rightFabric',
          path: '/assets/champagne-tissue-layers/',
          alt: 'Champagne-gold tissue fabric layers',
          title: 'Champagne-Gold Tissue Silk',
          cropInset: { top: 0.02, right: 0.02, bottom: 0.02, left: 0.02 }
        }
      ]
    },
    {
      id: 'finished',
      eyebrow: 'Stage II · Complete Textile',
      heading: 'The finished sarees',
      caption: 'Every thread settles into luminous alignment—preserving the authentic color depth, temple borders, and antique zari luster on a warm studio backdrop.',
      images: [
        {
          role: 'leftFinished',
          path: '/assets/magenta-finished.jpg',
          alt: 'Finished magenta Kanchipuram saree on a warm studio background',
          title: 'Magenta Kanchipuram — Finished Weave',
          cropInset: { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 }
        },
        {
          role: 'rightFinished',
          path: '/assets/champagne-finished.jpg',
          alt: 'Finished champagne-gold tissue saree on a warm studio background',
          title: 'Champagne-Gold Tissue — Finished Weave',
          cropInset: { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 }
        }
      ]
    },
    {
      id: 'drape-motion',
      eyebrow: 'Stage III · Living Silhouette',
      heading: 'The drape in motion',
      caption: 'From architectural form to fluid movement, a restrained pallu sweep reveals how handwoven silk holds both structure and grace.',
      images: [
        {
          role: 'mannequinLeft',
          path: '/assets/magenta-mannequin.jpg',
          alt: 'Magenta saree on mannequin',
          cropInset: { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 }
        },
        {
          role: 'womanLeft',
          path: '/assets/magenta-woman.jpg',
          alt: 'Woman wearing magenta saree',
          cropInset: { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 }
        },
        {
          role: 'mannequinRight',
          path: '/assets/champagne-mannequin.jpg',
          alt: 'Champagne saree on mannequin',
          cropInset: { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 }
        },
        {
          role: 'womanRight',
          path: '/assets/champagne-woman.jpg',
          alt: 'Woman wearing champagne saree',
          cropInset: { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 }
        }
      ]
    },
    {
      id: 'cofounder',
      eyebrow: 'Stage IV · Stewardship',
      heading: 'Co-Founder',
      caption: '',
      portraitPath: '/assets/cofounder.jpg'
    }
  ],
  products: [
    {
      id: 'jt-saree-09',
      name: 'Tissue Cutwork Saree',
      fabric: 'Tissue Cutwork Saree',
      color: 'Champagne Gold',
      originalPriceINR: 8999,
      discountPercent: 5,
      availability: '', // left editable; do not assume stock status
      image: '/assets/tissue-cutwork/full-saree-back-pallu.jpg',
      alt: 'Tissue Cutwork Saree — Full saree view showing champagne-gold tissue drape, scalloped cutwork border, and peacock motifs',
      description: 'A tissue saree featuring delicate cutwork detailing.',
      views: {
        fullFrontView: '/assets/tissue-cutwork/front-three-quarter-model.jpg',
        threeQuarterView: '/assets/tissue-cutwork/blouse-and-front-drape.jpg',
        sideOrBackView: '/assets/tissue-cutwork/full-saree-back-pallu.jpg',
        palluCloseup: '/assets/tissue-cutwork/pallu-detail.jpg',
        borderOrCutworkCloseup: '/assets/tissue-cutwork/border-cutwork-detail.jpg',
        fabricBodyPatternCloseup: '/assets/tissue-cutwork/fabric-body-detail.jpg'
      },
      gallery: [
        { order: 1, key: 'full_front', label: '1. Full front view', url: '/assets/tissue-cutwork/front-three-quarter-model.jpg', alt: 'Tissue Cutwork Saree — Full front view showing model wearing champagne-gold tissue saree' },
        { order: 2, key: 'three_quarter', label: '2. Three-quarter view', url: '/assets/tissue-cutwork/blouse-and-front-drape.jpg', alt: 'Tissue Cutwork Saree — Three-quarter view of embroidered blouse and front drape' },
        { order: 3, key: 'side_back', label: '3. Side or back view', url: '/assets/tissue-cutwork/full-saree-back-pallu.jpg', alt: 'Tissue Cutwork Saree — Side or back view showing fall and trailing pallu' },
        { order: 4, key: 'pallu_closeup', label: '4. Pallu close-up', url: '/assets/tissue-cutwork/pallu-detail.jpg', alt: 'Tissue Cutwork Saree — Pallu close-up showcasing scalloped cutwork and peacock embroidery' },
        { order: 5, key: 'border_cutwork', label: '5. Border or cutwork close-up', url: '/assets/tissue-cutwork/border-cutwork-detail.jpg', alt: 'Tissue Cutwork Saree — Border or cutwork close-up with gold zardosi and royal blue peacock motif' },
        { order: 6, key: 'fabric_pattern', label: '6. Fabric/body-pattern close-up', url: '/assets/tissue-cutwork/fabric-body-detail.jpg', alt: 'Tissue Cutwork Saree — Fabric/body-pattern close-up showing champagne-gold tissue weave texture and motifs' }
      ]
    },
    {
      name: 'Magenta Kanchipuram Zari Saree',
      image: '/assets/product1.jpg',
      alt: 'Finished magenta Kanchipuram saree with antique gold zari border and motifs',
      description: 'Pure mulberry silk in deep magenta featuring traditional temple rekku borders and woven antique gold zari motifs.'
    },
    {
      name: 'Champagne-Gold Tissue Zari Saree',
      image: '/assets/product2.jpg',
      alt: 'Finished champagne-gold tissue saree with luminous zari border and motifs',
      description: 'Luminous champagne-gold tissue weave with fine metallic weft and classic zari brocade detailing.'
    }
  ],
  cofounder: {
    name: '', // name intentionally empty — do not invent a co-founder name
    portrait: '/assets/cofounder.jpg',
    placeholderCaption: 'Co-Founder, Janardhan Textiles.',
    ctaLabel: 'Explore the Collection',
    ctaHref: '#collection'
  },
  colors: {
    teal: '#063F46',
    gold: '#C4A15A',
    ivory: '#F6F1E9',
    studioWarm: '#EFE7DA',
    ink: '#1A2426'
  },
  ui: {
    skipLinkText: 'Skip to collection',
    menuButtonLabel: 'Toggle navigation menu',
    orbitButtonEnableLabel: 'Inspect 3D Stage (Drag or Arrow Keys)',
    orbitButtonActiveLabel: 'Reset 3D View',
    orbitHintText: 'Drag gently on stage or use Arrow keys (±12° yaw, ±6° pitch)',
    scrollPromptText: 'Scroll to scrub through the weave',
    reducedMotionBadge: 'Reduced motion active',
    sareeLabels: {
      left: 'Magenta Kanchipuram',
      right: 'Champagne-Gold Tissue'
    },
    collectionSection: {
      eyebrow: 'Featured Silks',
      heading: 'The Signature Collection',
      subheading: 'Authentic weaves presented in their true colors, borders, and zari craftsmanship.',
      inquireLabel: 'View Specification'
    },
    modelUpload: {
      enabled: true,
      buttonLabel: 'Load Optional .GLB/.GLTF',
      resetLabel: 'Use Layered Planes',
      maxFileSizeMB: 25,
      helperText: 'Optional verified GLTF/GLB loader (.glb/.gltf up to 25 MB)'
    },
    navigation: [
      { label: '01 · Woven Layers', sceneIndex: 0, href: '#scene-woven-layers' },
      { label: '02 · Finished Sarees', sceneIndex: 1, href: '#scene-finished' },
      { label: '03 · Drape in Motion', sceneIndex: 2, href: '#scene-drape-motion' },
      { label: '04 · Co-Founder', sceneIndex: 3, href: '#scene-cofounder' },
      { label: 'Collection', sceneIndex: null, href: '#collection' }
    ]
  },
  // Optional pre-supplied 3D models (.glb/.gltf). Kept empty by default because no .glb/.gltf files exist in the repo;
  // when empty, ThreeStage renders layered image planes with accurate aspect ratios and shader cloth displacement.
  models: {
    leftSareeGlb: '',
    rightSareeGlb: '',
    dracoDecoderPath: 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
  },
  interaction: {
    maxYawDeg: 12,
    maxPitchDeg: 6,
    dampingFactor: 0.08,
    scrollDampReduction: 0.25,
    scrollScrubSeconds: 0.65
  }
};
