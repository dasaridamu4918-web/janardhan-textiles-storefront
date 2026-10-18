/**
 * ============================================================================
 * JANARDHAN TEXTILES — CENTRALIZED PRODUCT DATA FILE (/src/products-data.js)
 * Contains:
 * 1. Base fabric prices (INR)
 * 2. The 5 ordered gallery view definitions (Five-View Saree Gallery)
 * 3. All 9 sarees with exact SKU, name, fabric, color, occasion, priceINR,
 *    stock status, design descriptions, and 5 gallery views at:
 *      /public/images/sarees/<sku>/1-front.jpg
 *      /public/images/sarees/<sku>/2-back-pallu.jpg
 *      /public/images/sarees/<sku>/3-pallu-detail.jpg
 *      /public/images/sarees/<sku>/4-macro.jpg
 *      /public/images/sarees/<sku>/5-blouse.jpg
 * ============================================================================
 */

const FABRIC_BASE_SAMPLE_PRICES = {
  "Champagne Tissue": 7500,
  "Woven Brocade": 5500,
  "Silk-Blend Jacquard": 3900,
  "Tissue Organza": 3400,
  "Art Silk Jacquard": 2800,
  "Silk-Cotton Blend": 2200,
  "Soft Mercerised Weave": 1800,
  "Textured Dobby Blend": 1500,
  "Mercerised Cotton": 1200
};

function computeFabricSamplePriceINR(fabric, embroiderySurchargePct = 0) {
  const base = FABRIC_BASE_SAMPLE_PRICES[fabric] || 2000;
  const pct = Math.max(0, Math.min(10, Number(embroiderySurchargePct) || 0));
  const raw = base * (1 + pct / 100);
  return Math.round(raw / 50) * 50;
}

const REQUIRED_GALLERY_VIEWS = [
  {
    index: 1,
    key: "front_view",
    file: "1-front.jpg",
    label: "1. Front view (three-quarter angle on the mannequin)",
    shortLabel: "Front view"
  },
  {
    index: 2,
    key: "back_pallu",
    file: "2-back-pallu.jpg",
    label: "2. Back and pallu view",
    shortLabel: "Back and pallu view"
  },
  {
    index: 3,
    key: "pallu_detail",
    file: "3-pallu-detail.jpg",
    label: "3. Pallu embroidery detail",
    shortLabel: "Pallu embroidery detail"
  },
  {
    index: 4,
    key: "fabric_macro",
    file: "4-macro.jpg",
    label: "4. Fabric and embroidery macro",
    shortLabel: "Fabric and embroidery macro"
  },
  {
    index: 5,
    key: "blouse_border",
    file: "5-blouse.jpg",
    label: "5. Blouse and border detail",
    shortLabel: "Blouse and border detail"
  }
];

function createMissingViewPlaceholderSVG(sareeName, viewLabel, fabricName = "") {
  const escXml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeName = escXml(sareeName || "Saree");
  const safeFabric = escXml(fabricName || "Janardhan Textiles");
  const safeLabel = escXml(viewLabel || "Product View");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 960" width="800" height="960">
    <rect width="800" height="960" fill="#6B1D2F"/>
    <rect x="28" y="28" width="744" height="904" rx="18" fill="#4A1220" stroke="#C4A15A" stroke-width="3"/>
    <rect x="44" y="44" width="712" height="872" rx="14" fill="none" stroke="#C4A15A" stroke-width="1" stroke-dasharray="8 6"/>
    <rect x="250" y="96" width="300" height="42" rx="21" fill="#C4A15A"/>
    <text x="400" y="123" font-family="sans-serif" font-size="15" font-weight="bold" fill="#4A1220" text-anchor="middle">JANARDHAN TEXTILES</text>
    <circle cx="400" cy="360" r="68" fill="#6B1D2F" stroke="#C4A15A" stroke-width="3"/>
    <text x="400" y="375" font-family="Georgia, serif" font-size="40" font-weight="bold" fill="#C4A15A" text-anchor="middle">JT</text>
    <text x="400" y="495" font-family="Georgia, serif" font-size="26" font-weight="bold" fill="#FAF6EE" text-anchor="middle">${safeName}</text>
    <text x="400" y="545" font-family="sans-serif" font-size="20" font-weight="bold" fill="#C4A15A" text-anchor="middle">${safeFabric} • ${safeLabel}</text>
    <rect x="190" y="600" width="420" height="48" rx="24" fill="#6B1D2F" stroke="#C4A15A" stroke-width="2"/>
    <text x="400" y="630" font-family="sans-serif" font-size="16" font-weight="bold" fill="#E5D1A7" text-anchor="middle">Five-View Studio Photography</text>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function createSareeViewSVG(saree, viewNumber) {
  const viewMeta = REQUIRED_GALLERY_VIEWS[(viewNumber || 1) - 1] || REQUIRED_GALLERY_VIEWS[0];
  const sku = saree.sku || saree.id;
  return `/public/images/sarees/${sku}/${viewMeta.file}`;
}

const RAW_SAMPLE_SAREES = [
  {
    id: "jt-saree-09",
    sku: "jt-saree-09",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Champagne Tissue Saree with Floral and Peacock Embroidery",
    fabric: "Champagne Tissue",
    color: "Champagne Gold",
    occasion: "Celebrations & Festive",
    priceINR: computeFabricSamplePriceINR("Champagne Tissue"), // 7500
    originalPriceINR: computeFabricSamplePriceINR("Champagne Tissue"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "In Stock",
    stockQty: 24,
    description: "A luminous champagne-gold tissue drape, finished with delicate floral threadwork, peacock motifs, and an ornate scalloped border. The embroidered pallu and coordinated blouse details give it an elegant look for celebrations.",
    borderAndZari: "Ornate scalloped cutwork border with delicate pink, green, and blue floral threadwork, peacock motifs, gold zari, and sequins",
    motifs: "Delicate floral threadwork and peacock motifs across the embroidered pallu and scalloped border",
    blousePiece: "Coordinated champagne-gold tissue blouse with matching floral and peacock embroidery on the neckline and sleeves",
    hexPrimary: "#CBBCA5",
    hexSecondary: "#8B6D4B",
    hexZari: "#C4A15A",
    hexBlouse: "#CBBCA5",
    gallery: [
      {
        order: 1,
        key: "front_view",
        label: "1. Front view (three-quarter angle on the mannequin)",
        shortLabel: "Front view",
        url: "/public/images/sarees/jt-saree-09/1-front.jpg",
        webpUrl: "/images/1.webp",
        isSampleImage: false,
        alt: "Champagne Tissue Saree with Floral and Peacock Embroidery — 1. Front view (three-quarter angle on the mannequin)"
      },
      {
        order: 2,
        key: "back_pallu",
        label: "2. Back and pallu view",
        shortLabel: "Back and pallu view",
        url: "/public/images/sarees/jt-saree-09/2-back-pallu.jpg",
        webpUrl: "/images/2.webp",
        isSampleImage: false,
        alt: "Champagne Tissue Saree with Floral and Peacock Embroidery — 2. Back and pallu view"
      },
      {
        order: 3,
        key: "pallu_detail",
        label: "3. Pallu embroidery detail",
        shortLabel: "Pallu embroidery detail",
        url: "/public/images/sarees/jt-saree-09/3-pallu-detail.jpg",
        webpUrl: "/images/3.webp",
        isSampleImage: false,
        alt: "Champagne Tissue Saree with Floral and Peacock Embroidery — 3. Pallu embroidery detail"
      },
      {
        order: 4,
        key: "fabric_macro",
        label: "4. Fabric and embroidery macro",
        shortLabel: "Fabric and embroidery macro",
        url: "/public/images/sarees/jt-saree-09/4-macro.jpg",
        webpUrl: "/images/4.webp",
        isSampleImage: false,
        alt: "Champagne Tissue Saree with Floral and Peacock Embroidery — 4. Fabric and embroidery macro"
      },
      {
        order: 5,
        key: "blouse_border",
        label: "5. Blouse and border detail",
        shortLabel: "Blouse and border detail",
        url: "/public/images/sarees/jt-saree-09/5-blouse.jpg",
        webpUrl: "/images/5.webp",
        isSampleImage: false,
        alt: "Champagne Tissue Saree with Floral and Peacock Embroidery — 5. Blouse and border detail"
      }
    ]
  },
  {
    id: "jt-saree-01",
    sku: "jt-saree-01",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Swarna Sand Jacquard Silk-Blend Saree",
    fabric: "Silk-Blend Jacquard",
    color: "Warm Sand & Gold",
    occasion: "Wedding & Reception",
    priceINR: computeFabricSamplePriceINR("Silk-Blend Jacquard"), // 3900
    originalPriceINR: computeFabricSamplePriceINR("Silk-Blend Jacquard"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "In Stock",
    stockQty: 42,
    description: "A warm sand and gold silk-blend jacquard saree featuring a woven temple border, floral jacquard motifs across the body and pallu, and a coordinated bordered blouse for weddings and receptions.",
    borderAndZari: "3.5-inch muted gold woven temple border with fine geometric edging on warm sand silk-blend jacquard",
    motifs: "Woven muted gold floral butti spaced evenly across the warm sand jacquard body and pallu",
    blousePiece: "Coordinated warm sand and espresso-brown jacquard blouse with matching 3.5-inch woven gold sleeve border",
    hexPrimary: "#CBBCA5",
    hexSecondary: "#5C4E3E",
    hexZari: "#C4A15A",
    hexBlouse: "#5C4E3E"
  },
  {
    id: "jt-saree-02",
    sku: "jt-saree-02",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Swarna Ivory Tissue Organza Saree",
    fabric: "Tissue Organza",
    color: "Ivory Gold",
    occasion: "Festive & Puja",
    priceINR: computeFabricSamplePriceINR("Tissue Organza"), // 3400
    originalPriceINR: computeFabricSamplePriceINR("Tissue Organza"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "In Stock",
    stockQty: 65,
    description: "A sheer, lightweight ivory-gold tissue organza drape with an antique gold floral vine border, tonal lotus jaal weave, and a coordinated blouse for festive and puja occasions.",
    borderAndZari: "4-inch woven antique gold floral vine border with crisp selvedge piping on sheer ivory-gold tissue organza",
    motifs: "Delicate tonal lotus jaal woven throughout the sheer ivory warp and gold weft",
    blousePiece: "Coordinated ivory-gold tissue organza blouse with lined bodice and 4-inch woven antique gold border on sleeves",
    hexPrimary: "#EAE2D3",
    hexSecondary: "#8B6D4B",
    hexZari: "#C4A15A",
    hexBlouse: "#C4A15A"
  },
  {
    id: "jt-saree-03",
    sku: "jt-saree-03",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Kanak Beige Jacquard Power-Loom Saree",
    fabric: "Art Silk Jacquard",
    color: "Champagne Beige",
    occasion: "Celebrations & Festive",
    priceINR: computeFabricSamplePriceINR("Art Silk Jacquard"), // 2800
    originalPriceINR: computeFabricSamplePriceINR("Art Silk Jacquard"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "In Stock",
    stockQty: 110,
    description: "A champagne-beige art silk jacquard saree woven with all-over paisley bootis, a broad geometric gold border, and a contrast jacquard blouse for celebrations and festive wear.",
    borderAndZari: "Broad 5-inch traditional paisley and geometric muted gold woven border on champagne-beige art silk jacquard",
    motifs: "All-over jacquard woven paisley bootis framed with dual gold lines across the body and pallu",
    blousePiece: "Coordinated champagne-beige and deep espresso contrast jacquard blouse with woven paisley sleeve border",
    hexPrimary: "#D8C9B4",
    hexSecondary: "#3D3327",
    hexZari: "#C4A15A",
    hexBlouse: "#3D3327"
  },
  {
    id: "jt-saree-04",
    sku: "jt-saree-04",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Nisha Espresso Soft Mercerised Saree",
    fabric: "Soft Mercerised Weave",
    color: "Espresso Brown",
    occasion: "Evening & Party",
    priceINR: computeFabricSamplePriceINR("Soft Mercerised Weave"), // 1800
    originalPriceINR: computeFabricSamplePriceINR("Soft Mercerised Weave"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "Low Stock",
    stockQty: 9,
    description: "A matte espresso-brown soft mercerised weave saree with a subtle sheen, sleek geometric diamond gold border, minimalist star-burst motifs, and a matching bordered blouse for evening gatherings.",
    borderAndZari: "2.5-inch sleek geometric diamond muted gold woven border on matte espresso-brown soft mercerised weave",
    motifs: "Minimalist star-burst buttis in a diagonal trellis layout with a soft mercerised sheen",
    blousePiece: "Coordinated running espresso-brown soft mercerised blouse with woven gold stripe sleeves",
    hexPrimary: "#3D3327",
    hexSecondary: "#8B6D4B",
    hexZari: "#C4A15A",
    hexBlouse: "#3D3327"
  },
  {
    id: "jt-saree-05",
    sku: "jt-saree-05",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Kesar Warm Ochre Mercerised Cotton Saree",
    fabric: "Mercerised Cotton",
    color: "Warm Ochre",
    occasion: "Daywear & Festive",
    priceINR: computeFabricSamplePriceINR("Mercerised Cotton"), // 1200
    originalPriceINR: computeFabricSamplePriceINR("Mercerised Cotton"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "In Stock",
    stockQty: 85,
    description: "A matte warm-ochre mercerised cotton saree with soft sheen, woven dobby borders, crisp vertical pinstripes along the body, and a matching dobby-bordered blouse for daywear and festive occasions.",
    borderAndZari: "3-inch woven dobby border in muted gold and warm espresso tones on matte warm-ochre mercerised cotton",
    motifs: "Crisp vertical pinstripes along the body with a banded dobby pallu",
    blousePiece: "Coordinated warm-ochre mercerised cotton blouse with 3-inch dobby border",
    hexPrimary: "#C8A97E",
    hexSecondary: "#5C4E3E",
    hexZari: "#C4A15A",
    hexBlouse: "#5C4E3E"
  },
  {
    id: "jt-saree-06",
    sku: "jt-saree-06",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Ratna Champagne Brocade Weave Saree",
    fabric: "Woven Brocade",
    color: "Champagne & Bronze",
    occasion: "Wedding & Reception",
    priceINR: computeFabricSamplePriceINR("Woven Brocade"), // 5500
    originalPriceINR: computeFabricSamplePriceINR("Woven Brocade"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "In Stock",
    stockQty: 30,
    description: "A champagne and bronze woven brocade saree featuring a dense foliate lattice weave, a 4.5-inch floral medallion border, and a coordinated brocade-bordered blouse for weddings and receptions.",
    borderAndZari: "4.5-inch regal antique bronze-gold woven brocade border with floral medallions",
    motifs: "Dense foliate lattice woven in muted gold and bronze thread across the champagne brocade body",
    blousePiece: "Coordinated champagne and bronze blouse with 4.5-inch brocade border for sleeves and back",
    hexPrimary: "#C2B092",
    hexSecondary: "#4A3B2C",
    hexZari: "#C4A15A",
    hexBlouse: "#4A3B2C"
  },
  {
    id: "jt-saree-07",
    sku: "jt-saree-07",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Chandni Soft Cream Silk-Cotton Saree",
    fabric: "Silk-Cotton Blend",
    color: "Soft Cream",
    occasion: "Office & Formal",
    priceINR: computeFabricSamplePriceINR("Silk-Cotton Blend"), // 2200
    originalPriceINR: computeFabricSamplePriceINR("Silk-Cotton Blend"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "In Stock",
    stockQty: 54,
    description: "A soft matte-silk cream silk-cotton blend saree with a 2-inch muted gold satin-edge border, small woven coin motifs, and a self-textured blouse for office and formal wear.",
    borderAndZari: "2-inch subtle muted gold satin-edge woven border on soft matte-silk cream silk-cotton blend",
    motifs: "Small woven coin motifs scattered lightly across the breathable body and pallu",
    blousePiece: "Coordinated soft cream self-textured silk-cotton blouse with 2-inch muted gold border",
    hexPrimary: "#EFE6D5",
    hexSecondary: "#7A654B",
    hexZari: "#C4A15A",
    hexBlouse: "#7A654B"
  },
  {
    id: "jt-saree-08",
    sku: "jt-saree-08",
    isSampleProduct: false,
    isSamplePrice: false,
    name: "Kasturi Deep Cocoa & Gold Dobby Saree",
    fabric: "Textured Dobby Blend",
    color: "Deep Cocoa",
    occasion: "Evening & Cultural",
    priceINR: computeFabricSamplePriceINR("Textured Dobby Blend"), // 1500
    originalPriceINR: computeFabricSamplePriceINR("Textured Dobby Blend"),
    discountPercent: 0,
    wholesalePriceINR: "",
    minWholesaleQty: "",
    stockStatus: "Out of Stock",
    stockQty: 0,
    description: "A deep cocoa textured dobby blend saree with a small geometric weave, 3.5-inch bronze-gold dobby border, structured pallu bands, and a contrast geometric-bordered blouse for evening and cultural events.",
    borderAndZari: "3.5-inch antique bronze-gold geometric dobby border with warm sand selvedge line",
    motifs: "Small geometric dobby weave with textured slub weft lines and structured pallu bands",
    blousePiece: "Coordinated deep cocoa and antique gold contrast dobby blouse with geometric border",
    hexPrimary: "#231D16",
    hexSecondary: "#8B6D4B",
    hexZari: "#C4A15A",
    hexBlouse: "#8B6D4B"
  }
];

const INITIAL_PRODUCTS = RAW_SAMPLE_SAREES.map((saree, idx) => {
  const sku = saree.sku || saree.id;
  const gallery = (Array.isArray(saree.gallery) && saree.gallery.length === 5)
    ? saree.gallery
    : REQUIRED_GALLERY_VIEWS.map((view) => ({
        order: view.index,
        key: view.key,
        label: view.label,
        shortLabel: view.shortLabel,
        url: `/public/images/sarees/${sku}/${view.file}?v=nb2`,
        isSampleImage: false,
        alt: `${saree.name} — ${view.label} (${saree.fabric}, ${saree.color})`
      }));

  const price = Math.round(Number(saree.priceINR || 0));
  const mrp = Math.round(Number(saree.mrp || saree.originalPriceINR || price));
  const stock = typeof saree.stockQty === "number" ? saree.stockQty : 20;
  const stock_status = stock <= 0 ? "out_of_stock" : (stock <= 10 ? "low_stock" : "in_stock");
  const featuredSkus = new Set(["jt-saree-09", "jt-saree-01", "jt-saree-02", "jt-saree-06", "jt-saree-07"]);
  const bestsellerSkus = new Set(["jt-saree-09", "jt-saree-01", "jt-saree-03", "jt-saree-05", "jt-saree-07"]);
  const workDetails = [saree.borderAndZari, saree.motifs].filter(Boolean).join(". ");

  return {
    ...saree,
    sku,
    price,
    priceINR: price,
    mrp,
    originalPriceINR: mrp,
    stock,
    stockQty: stock,
    stock_status,
    work_details: workDetails,
    blouse_piece: saree.blousePiece || "",
    care_instructions: saree.care_instructions || "",
    featured: featuredSkus.has(sku),
    bestseller: bestsellerSkus.has(sku),
    active: true,
    created_at: `2026-10-${String(10 + idx).padStart(2, "0")}T10:00:00Z`,
    images: gallery.map((g) => g.url),
    gallery
  };
});

if (typeof window !== "undefined") {
  window.FABRIC_BASE_SAMPLE_PRICES = FABRIC_BASE_SAMPLE_PRICES;
  window.computeFabricSamplePriceINR = computeFabricSamplePriceINR;
  window.REQUIRED_GALLERY_VIEWS = REQUIRED_GALLERY_VIEWS;
  window.createMissingViewPlaceholderSVG = createMissingViewPlaceholderSVG;
  window.createSareeViewSVG = createSareeViewSVG;
  window.RAW_SAMPLE_SAREES = RAW_SAMPLE_SAREES;
  window.INITIAL_PRODUCTS = INITIAL_PRODUCTS;
}
