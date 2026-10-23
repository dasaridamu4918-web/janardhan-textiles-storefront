/* LEPAKSHI WEAVES — Operations dashboard (orders, allocation, Excel uploads).
 * Talks to /api/ops/* on server.py. Session token is shared with the storefront admin login. */
(function () {
  "use strict";

  const TOKEN_KEY = "jt_auth_token";
  const USER_KEY = "jt_auth_user";
  const STATUSES = ["New", "Allocated", "In production", "Dispatched", "Delivered"];
  const COLUMNS = [
    { key: "order_id", label: "Order ID", required: true, aliases: ["order id", "order no", "order number", "orderid", "po", "po number", "invoice"] },
    { key: "order_date", label: "Order date", required: true, aliases: ["date", "order date", "ordered on", "po date"] },
    { key: "retailer_name", label: "Retailer", required: true, aliases: ["retailer", "customer", "party", "party name", "buyer", "shop", "client"] },
    { key: "retailer_city", label: "City", aliases: ["city", "town", "location", "place"] },
    { key: "channel", label: "Channel (Retail/Wholesale)", aliases: ["channel", "type", "order type", "sale type"] },
    { key: "product_code", label: "Product code", required: true, aliases: ["product code", "sku", "design no", "design number", "item code", "code", "design code"] },
    { key: "product_name", label: "Product name", aliases: ["product", "product name", "item", "design", "saree name", "description"] },
    { key: "fabric", label: "Fabric", aliases: ["fabric", "material", "weave"] },
    { key: "quantity", label: "Quantity", required: true, aliases: ["qty", "quantity", "pcs", "pieces", "sarees", "no of sarees"] },
    { key: "status", label: "Status", aliases: ["status", "stage", "order status"] },
    { key: "notes", label: "Notes", aliases: ["notes", "remarks", "comment", "comments"] }
  ];
  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN");
  const stClass = (s) => "st-" + String(s || "New").replace(/\s+/g, "-");

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    sandbox: false,
    tab: "overview",
    filters: { from: "", to: "", status: "", retailer: "", product: "", fabric: "", staff: "", q: "" },
    page: 1,
    selected: new Set(),
    meta: { retailers: [], products: [], fabrics: [], staff: [] },
    upload: null
  };

  // ------------------------------------------------------------------ Browser Sandbox (for static Vercel preview when server.py is not running)
  const SANDBOX_KEY = "lw_ops_sandbox_db_v1";
  function getSandboxDb() {
    try {
      const raw = localStorage.getItem(SANDBOX_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const db = createInitialSandboxDb();
    saveSandboxDb(db);
    return db;
  }
  function saveSandboxDb(db) {
    try {
      localStorage.setItem(SANDBOX_KEY, JSON.stringify(db));
    } catch (e) {}
  }
  function createInitialSandboxDb() {
    const today = new Date();
    const dStr = (daysAgo) => {
      const d = new Date(today);
      d.setDate(today.getDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    const staff = [
      { id: 1, name: "[PLACEHOLDER] Ravi Kumar", phone: "9000000001", team: "Production", email: "ravi.placeholder@lepakshi.local", active: 1 },
      { id: 2, name: "[PLACEHOLDER] Meena Devi", phone: "9000000002", team: "Quality check", email: "meena.placeholder@lepakshi.local", active: 1 },
      { id: 3, name: "[PLACEHOLDER] Suresh Babu", phone: "9000000003", team: "Dispatch", email: "suresh.placeholder@lepakshi.local", active: 1 }
    ];
    const samples = [
      ["PLACEHOLDER-1001", dStr(6), "[PLACEHOLDER] Sri Lakshmi Silks", "Hyderabad", "Wholesale", "LW-KAN-001", "Kanchipuram Pure Silk - Ruby", "Kanchipuram Pure Silk", 28, "Delivered", 3, "BATCH-A1", "LR-88210", "Sample order"],
      ["PLACEHOLDER-1002", dStr(5), "[PLACEHOLDER] Vasundhara Sarees", "Bengaluru", "Wholesale", "LW-TIS-014", "Champagne Tissue - Peacock", "Champagne Tissue", 40, "Dispatched", 3, "BATCH-A2", "LR-88241", "Sample order"],
      ["PLACEHOLDER-1003", dStr(4), "[PLACEHOLDER] Kalaniketan Emporium", "Vijayawada", "Wholesale", "LW-DHM-003", "Dharmavaram Bridal Brocade", "Dharmavaram Silk", 35, "In production", 1, "BATCH-B1", "", "Sample order"],
      ["PLACEHOLDER-1004", dStr(3), "[PLACEHOLDER] Pothys Boutique", "Chennai", "Wholesale", "LW-KAN-001", "Kanchipuram Pure Silk - Ruby", "Kanchipuram Pure Silk", 50, "Allocated", 1, "BATCH-B2", "", "Sample order"],
      ["PLACEHOLDER-1005", dStr(2), "[PLACEHOLDER] Retail Walk-in", "Dharmavaram", "Retail", "LW-ORG-007", "Tissue Organza - Rose Gold", "Tissue Organza", 2, "Allocated", 2, "BATCH-C1", "", "Sample order"],
      ["PLACEHOLDER-1006", dStr(2), "[PLACEHOLDER] Nalli Selection House", "Hyderabad", "Wholesale", "LW-PAI-031", "Paithani Pure Silk - Haldi", "Paithani Silk", 18, "New", null, "", "", "Sample order"],
      ["PLACEHOLDER-1007", dStr(1), "[PLACEHOLDER] Mandir Fine Silks", "Guntur", "Wholesale", "LW-TIS-014", "Champagne Tissue - Peacock", "Champagne Tissue", 24, "New", null, "", "", "Sample order"],
      ["PLACEHOLDER-1008", dStr(0), "[PLACEHOLDER] Retail Online Enquiry", "Bengaluru", "Retail", "LW-MYS-038", "Sandstone Mysore Silk", "Mysore Silk", 3, "New", null, "", "", "Sample order"]
    ];
    const orders = samples.map((s) => {
      const st = staff.find((x) => x.id === s[10]);
      return {
        order_id: s[0],
        order_date: s[1],
        retailer: s[2],
        retailer_city: s[3],
        channel: s[4],
        product_code: s[5],
        product_name: s[6],
        fabric: s[7],
        quantity: s[8],
        status: s[9],
        staff_id: s[10],
        staff_name: st ? st.name : "",
        batch: s[11],
        dispatch_ref: s[12],
        notes: s[13],
        is_placeholder: 1
      };
    });
    return {
      staff,
      orders,
      uploads: [
        {
          id: 1,
          original_filename: "[PLACEHOLDER] sample-october-orders.xlsx",
          uploaded_at: new Date().toISOString(),
          uploaded_by: "sandbox@lepakshiweaves.in",
          imported_rows: orders.length,
          error_rows: 0
        }
      ],
      activity: [
        {
          action: "ops_seed_placeholder",
          timestamp: new Date().toISOString(),
          user_email: "sandbox@lepakshiweaves.in",
          target_type: "ops_orders",
          target_id: "sandbox",
          details_json: JSON.stringify({ inserted: orders.length, mode: "browser_sandbox" })
        }
      ]
    };
  }

  function parseDateStrict(raw) {
    const s = String(raw || "").trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return s;
    }
    m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s);
    if (m) {
      const d = +m[1], mo = +m[2], y = +m[3];
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
    return null;
  }

  function validateRowsLocal(rows) {
    const errors = [];
    const valid = [];
    const seen = new Set();
    rows.forEach((r, idx) => {
      const rowNum = idx + 2;
      const oid = String(r.order_id || "").trim();
      const odate = parseDateStrict(r.order_date);
      const ret = String(r.retailer_name || "").trim();
      const pcode = String(r.product_code || "").trim();
      const qtyRaw = String(r.quantity || "").trim();
      const qty = Number(qtyRaw);
      const stRaw = String(r.status || "New").trim() || "New";
      const stMatch = STATUSES.find((s) => s.toLowerCase() === stRaw.toLowerCase());
      let rowOk = true;
      if (!oid || !/^[A-Za-z0-9_./-]{1,40}$/.test(oid)) {
        errors.push({ row: rowNum, field: "order_id", message: "Missing or invalid Order ID (use letters, numbers, - _ / . up to 40 chars)" });
        rowOk = false;
      } else if (seen.has(oid.toUpperCase())) {
        errors.push({ row: rowNum, field: "order_id", message: `Duplicate Order ID "${oid}" in this file` });
        rowOk = false;
      } else {
        seen.add(oid.toUpperCase());
      }
      if (!odate) {
        errors.push({ row: rowNum, field: "order_date", message: `Invalid date "${r.order_date || ""}" (use YYYY-MM-DD or DD-MM-YYYY)` });
        rowOk = false;
      }
      if (!ret) {
        errors.push({ row: rowNum, field: "retailer_name", message: "Missing retailer / party name" });
        rowOk = false;
      }
      if (!pcode) {
        errors.push({ row: rowNum, field: "product_code", message: "Missing product code / SKU" });
        rowOk = false;
      }
      if (!qtyRaw || !Number.isInteger(qty) || qty < 1 || qty > 100000) {
        errors.push({ row: rowNum, field: "quantity", message: `Invalid quantity "${qtyRaw}" (must be whole number 1–100000)` });
        rowOk = false;
      }
      if (!stMatch) {
        errors.push({ row: rowNum, field: "status", message: `Unknown status "${stRaw}" (allowed: ${STATUSES.join(", ")})` });
        rowOk = false;
      }
      if (rowOk) {
        valid.push({
          order_id: oid,
          order_date: odate,
          retailer: ret,
          retailer_city: String(r.retailer_city || "").trim(),
          channel: /^wholesale$/i.test(String(r.channel || "").trim()) ? "Wholesale" : "Retail",
          product_code: pcode.toUpperCase(),
          product_name: String(r.product_name || pcode).trim(),
          fabric: String(r.fabric || "Unspecified").trim() || "Unspecified",
          quantity: qty,
          status: stMatch,
          staff_id: null,
          staff_name: "",
          batch: "",
          dispatch_ref: "",
          notes: String(r.notes || "").trim().slice(0, 500),
          is_placeholder: /^PLACEHOLDER/i.test(oid) || /\[PLACEHOLDER\]/i.test(ret) ? 1 : 0
        });
      }
    });
    return { total_rows: rows.length, valid_rows: valid.length, error_rows: rows.length - valid.length, errors, valid };
  }

  function filterOrdersLocal(orders, params) {
    const f = {
      from: params.get("from") || "",
      to: params.get("to") || "",
      status: params.get("status") || "",
      retailer: params.get("retailer") || "",
      product: params.get("product") || "",
      fabric: params.get("fabric") || "",
      q: (params.get("q") || "").toLowerCase()
    };
    return orders.filter((o) => {
      if (f.from && o.order_date < f.from) return false;
      if (f.to && o.order_date > f.to) return false;
      if (f.status && o.status !== f.status) return false;
      if (f.retailer && o.retailer !== f.retailer) return false;
      if (f.product && o.product_code !== f.product) return false;
      if (f.fabric && o.fabric !== f.fabric) return false;
      if (f.q) {
        const hay = `${o.order_id} ${o.retailer} ${o.retailer_city} ${o.product_code} ${o.product_name} ${o.fabric} ${o.staff_name} ${o.batch} ${o.dispatch_ref}`.toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    });
  }

  async function sandboxApi(path, opts = {}) {
    const db = getSandboxDb();
    const u = new URL(path, location.origin);
    const p = u.pathname;
    const params = u.searchParams;
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};

    if (p === "/api/ops/me") return { ok: true, user: state.user };
    if (p === "/api/ops/filters") {
      return {
        ok: true,
        retailers: [...new Set(db.orders.map((o) => o.retailer))].sort(),
        products: [...new Set(db.orders.map((o) => o.product_code))].sort(),
        fabrics: [...new Set(db.orders.map((o) => o.fabric))].sort(),
        staff: db.staff
      };
    }
    if (p === "/api/ops/summary") {
      const list = filterOrdersLocal(db.orders, params);
      const by_status = Object.fromEntries(STATUSES.map((s) => [s, { orders: 0, qty: 0 }]));
      const dayMap = {};
      const retMap = {};
      const prodMap = {};
      let totalSarees = 0;
      let phCount = 0;
      list.forEach((o) => {
        const q = Number(o.quantity || 0);
        totalSarees += q;
        if (o.is_placeholder) phCount++;
        if (by_status[o.status]) {
          by_status[o.status].orders++;
          by_status[o.status].qty += q;
        }
        dayMap[o.order_date] = dayMap[o.order_date] || { day: o.order_date, n: 0, qty: 0 };
        dayMap[o.order_date].n++;
        dayMap[o.order_date].qty += q;
        retMap[o.retailer] = (retMap[o.retailer] || 0) + q;
        const pk = `${o.product_code} · ${o.product_name}`;
        prodMap[pk] = (prodMap[pk] || 0) + q;
      });
      return {
        ok: true,
        placeholder_orders: phCount,
        cards: {
          total_orders: list.length,
          pending: by_status["New"].orders,
          allocated: by_status["Allocated"].orders + by_status["In production"].orders,
          in_production: by_status["In production"].orders,
          dispatched: by_status["Dispatched"].orders + by_status["Delivered"].orders,
          delivered: by_status["Delivered"].orders,
          total_sarees: totalSarees
        },
        by_status,
        per_day: Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day)).slice(-30),
        top_retailers: Object.entries(retMap).map(([label, qty]) => ({ label, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8),
        top_products: Object.entries(prodMap).map(([label, qty]) => ({ label, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8)
      };
    }
    if (p === "/api/ops/orders" && method === "GET") {
      const list = filterOrdersLocal(db.orders, params).sort((a, b) => b.order_date.localeCompare(a.order_date) || a.order_id.localeCompare(b.order_id));
      if (params.get("export") === "1") return { ok: true, items: list, total: list.length, page: 1, pages: 1 };
      const page = Math.max(1, Number(params.get("page") || 1));
      const limit = Math.max(1, Number(params.get("limit") || 25));
      const pages = Math.max(1, Math.ceil(list.length / limit));
      return { ok: true, items: list.slice((page - 1) * limit, page * limit), total: list.length, page, pages };
    }
    if (p.startsWith("/api/ops/orders/") && method === "PATCH") {
      const oid = decodeURIComponent(p.slice("/api/ops/orders/".length));
      const ord = db.orders.find((o) => o.order_id === oid);
      if (!ord) throw new Error("Order not found");
      ord.status = body.status;
      db.activity.unshift({
        action: "ops_order_status",
        timestamp: new Date().toISOString(),
        user_email: state.user.email,
        target_type: "ops_order",
        target_id: oid,
        details_json: JSON.stringify({ status: body.status })
      });
      saveSandboxDb(db);
      return { ok: true };
    }
    if (p === "/api/ops/allocate" && method === "POST") {
      const ids = new Set(body.order_ids || []);
      const st = db.staff.find((s) => s.id === Number(body.staff_id));
      let updated = 0;
      db.orders.forEach((o) => {
        if (ids.has(o.order_id)) {
          if (st) {
            o.staff_id = st.id;
            o.staff_name = st.name;
          }
          if (body.batch) o.batch = body.batch;
          if (body.dispatch_ref) o.dispatch_ref = body.dispatch_ref;
          if (o.status === "New") o.status = "Allocated";
          updated++;
        }
      });
      db.activity.unshift({
        action: "ops_allocate",
        timestamp: new Date().toISOString(),
        user_email: state.user.email,
        target_type: "ops_orders",
        target_id: `${updated} orders`,
        details_json: JSON.stringify({ staff: st?.name || "", batch: body.batch || "", dispatch_ref: body.dispatch_ref || "" })
      });
      saveSandboxDb(db);
      return { ok: true, updated };
    }
    if (p === "/api/ops/placeholder-data" && method === "POST") {
      if (body.action === "clear") {
        const before = db.orders.length;
        db.orders = db.orders.filter((o) => !o.is_placeholder);
        saveSandboxDb(db);
        return { ok: true, removed: before - db.orders.length };
      } else {
        const fresh = createInitialSandboxDb();
        saveSandboxDb(fresh);
        return { ok: true, inserted: fresh.orders.length };
      }
    }
    if (p === "/api/ops/uploads/validate" && method === "POST") {
      const res = validateRowsLocal(body.rows || []);
      return { ok: true, total_rows: res.total_rows, valid_rows: res.valid_rows, error_rows: res.error_rows, errors: res.errors };
    }
    if (p === "/api/ops/uploads/commit" && method === "POST") {
      const res = validateRowsLocal(body.rows || []);
      const byId = new Map(db.orders.map((o) => [o.order_id, o]));
      res.valid.forEach((v) => byId.set(v.order_id, v));
      db.orders = [...byId.values()];
      db.uploads.unshift({
        id: db.uploads.length + 1,
        original_filename: body.filename || "upload.xlsx",
        uploaded_at: new Date().toISOString(),
        uploaded_by: state.user.email,
        imported_rows: res.valid_rows,
        error_rows: res.error_rows
      });
      db.activity.unshift({
        action: "ops_upload_commit",
        timestamp: new Date().toISOString(),
        user_email: state.user.email,
        target_type: "ops_upload",
        target_id: body.filename || "upload",
        details_json: JSON.stringify({ imported: res.valid_rows, errors: res.error_rows })
      });
      saveSandboxDb(db);
      return { ok: true, imported_rows: res.valid_rows, error_rows: res.error_rows };
    }
    if (p === "/api/ops/uploads" && method === "GET") {
      return { ok: true, items: db.uploads };
    }
    if (p === "/api/ops/staff" && method === "GET") {
      return {
        ok: true,
        items: db.staff.map((s) => ({
          ...s,
          open_orders: db.orders.filter((o) => o.staff_id === s.id && !["Dispatched", "Delivered"].includes(o.status)).length
        }))
      };
    }
    if (p === "/api/ops/staff" && method === "POST") {
      const id = db.staff.reduce((m, s) => Math.max(m, s.id), 0) + 1;
      db.staff.push({ id, name: body.name, phone: body.phone || "", team: body.team || "Production", email: body.email || "", active: 1 });
      saveSandboxDb(db);
      return { ok: true, id };
    }
    if (p.startsWith("/api/ops/staff/") && method === "PATCH") {
      const id = Number(p.slice("/api/ops/staff/".length));
      const st = db.staff.find((s) => s.id === id);
      if (st) st.active = body.active ? 1 : 0;
      saveSandboxDb(db);
      return { ok: true };
    }
    if (p === "/api/ops/activity" && method === "GET") {
      return { ok: true, items: db.activity };
    }
    return { ok: true };
  }

  // ------------------------------------------------------------------ API
  async function api(path, opts = {}) {
    if (state.sandbox) return sandboxApi(path, opts);
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let res;
    try {
      res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    } catch (e) {
      const err = new Error("Network error — check your connection.");
      err.network = true;
      throw err;
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const err = new Error("Operations server not reachable.");
      err.noBackend = true;
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    if (res.status === 401) {
      const err = new Error(data.error || "Please sign in.");
      err.unauth = true;
      throw err;
    }
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function qs(extra = {}) {
    const p = new URLSearchParams();
    Object.entries({ ...state.filters, ...extra }).forEach(([k, v]) => {
      if (v !== "" && v !== null && v !== undefined) p.set(k, v);
    });
    return p.toString();
  }

  // ------------------------------------------------------------------ UI helpers
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = `fixed top-16 inset-x-3 sm:left-auto sm:right-4 sm:w-96 z-50 card px-4 py-3 text-sm font-semibold ${
      isError ? "!bg-wine !text-ivory" : ""
    }`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 4200);
  }

  function openModal(html) {
    $("#modal-body").innerHTML = html;
    $("#modal").classList.remove("hidden");
  }
  function closeModal() {
    $("#modal").classList.add("hidden");
  }
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal();
  });

  function show(id) {
    ["no-backend", "login-view", "app"].forEach((x) => $("#" + x).classList.toggle("hidden", x !== id));
    const inApp = id === "app";
    $("#tabs").classList.toggle("hidden", !inApp);
    $("#tabs").classList.toggle("md:flex", inApp);
    $("#bottom-tabs").classList.toggle("hidden", !inApp);
    $("#user-box").classList.toggle("hidden", !inApp);
    $("#user-box").classList.toggle("flex", inApp);
  }

  function tabsFor() {
    const t = [
      { id: "overview", label: "Overview", icon: "▦" },
      { id: "orders", label: "Orders", icon: "☰" },
      { id: "upload", label: "Upload", icon: "⇪" }
    ];
    if (state.user?.role === "admin") {
      t.push({ id: "staff", label: "Staff", icon: "☺" }, { id: "activity", label: "Activity", icon: "⏱" });
    }
    return t;
  }

  function renderTabs() {
    const tabs = tabsFor();
    $("#tabs").innerHTML = tabs
      .map(
        (t) =>
          `<button class="tab-btn btn !py-1.5 text-ivory/90 hover:bg-indigo-light" role="tab" aria-selected="${state.tab === t.id}" data-tab="${t.id}">${t.label}</button>`
      )
      .join("");
    $("#bottom-tabs").innerHTML = `<div class="grid" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs
      .map(
        (t) =>
          `<button data-tab="${t.id}" class="py-2 flex flex-col items-center text-[10px] font-semibold ${
            state.tab === t.id ? "text-gold" : "text-ivory/80"
          }" aria-current="${state.tab === t.id}"><span class="text-base leading-none" aria-hidden="true">${t.icon}</span>${t.label}</button>`
      )
      .join("")}</div>`;
  }

  document.addEventListener("click", (e) => {
    const tb = e.target.closest("[data-tab]");
    if (tb) {
      state.tab = tb.dataset.tab;
      state.page = 1;
      render();
      window.scrollTo({ top: 0 });
    }
  });

  // ------------------------------------------------------------------ Auth
  async function boot() {
    if (!state.token) {
      // Still probe that the server exists so static hosting shows the right message
      try {
        const res = await fetch("/api/filters");
        const ct = res.headers.get("content-type") || "";
        if (!res.ok || !ct.includes("application/json")) return show("no-backend");
      } catch (e) {
        return show("no-backend");
      }
      return show("login-view");
    }
    try {
      const me = await api("/api/ops/me");
      state.user = me.user;
      $("#user-label").textContent = `${me.user.name} · ${me.user.role}`;
      show("app");
      await loadMeta();
      render();
    } catch (e) {
      if (e.noBackend || e.network) return show("no-backend");
      if (e.unauth || e.status === 403) {
        if (e.status === 403) {
          $("#login-error").textContent = "This account does not have admin or staff access.";
          $("#login-error").classList.remove("hidden");
        }
        return show("login-view");
      }
      show("login-view");
    }
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = $("#login-error");
    errEl.classList.add("hidden");
    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value })
      });
      if (!res.user || !["admin", "staff"].includes(res.user.role)) {
        errEl.textContent = "This account does not have admin or staff access.";
        errEl.classList.remove("hidden");
        return;
      }
      state.token = res.token;
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      f.reset();
      boot();
    } catch (err) {
      if (err.noBackend || err.network) return show("no-backend");
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    const wasSandbox = state.sandbox;
    state.token = "";
    state.user = null;
    state.sandbox = false;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    show(wasSandbox ? "no-backend" : "login-view");
  });

  async function enterSandbox(role) {
    state.sandbox = true;
    state.user = {
      name: role === "admin" ? "Owner Admin (Sandbox)" : "Mill Staff (Sandbox)",
      email: role === "admin" ? "admin.sandbox@lepakshiweaves.in" : "staff.sandbox@lepakshiweaves.in",
      role
    };
    $("#user-label").textContent = `${state.user.name} · ${state.user.role}`;
    show("app");
    await loadMeta();
    render();
  }
  $("#enter-sandbox-admin")?.addEventListener("click", () => enterSandbox("admin"));
  $("#enter-sandbox-staff")?.addEventListener("click", () => enterSandbox("staff"));

  async function loadMeta() {
    try {
      state.meta = await api("/api/ops/filters");
    } catch (e) {
      if (e.unauth) show("login-view");
    }
  }

  // ------------------------------------------------------------------ Render router
  function render() {
    renderTabs();
    const app = $("#app");
    if (state.tab === "overview") return renderOverview(app);
    if (state.tab === "orders") return renderOrders(app);
    if (state.tab === "upload") return renderUpload(app);
    if (state.tab === "staff") return renderStaff(app);
    if (state.tab === "activity") return renderActivity(app);
  }

  function filterBar({ compact = false } = {}) {
    const f = state.filters;
    const opt = (list, val) => list.map((x) => `<option value="${esc(x)}" ${x === val ? "selected" : ""}>${esc(x)}</option>`).join("");
    return `
      <form id="filter-form" class="card p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 items-end no-print">
        <label class="col-span-2 lg:col-span-2 text-[11px] font-semibold">Search
          <input name="q" value="${esc(f.q)}" placeholder="Order ID, retailer, product, batch…" class="field mt-1" type="search">
        </label>
        <label class="text-[11px] font-semibold">From<input name="from" type="date" value="${esc(f.from)}" class="field mt-1"></label>
        <label class="text-[11px] font-semibold">To<input name="to" type="date" value="${esc(f.to)}" class="field mt-1"></label>
        <label class="text-[11px] font-semibold">Status
          <select name="status" class="field mt-1"><option value="">All</option>${opt(STATUSES, f.status)}</select>
        </label>
        ${
          compact
            ? ""
            : `<label class="text-[11px] font-semibold">Retailer<select name="retailer" class="field mt-1"><option value="">All</option>${opt(state.meta.retailers || [], f.retailer)}</select></label>
        <label class="text-[11px] font-semibold">Product code<select name="product" class="field mt-1"><option value="">All</option>${opt(state.meta.products || [], f.product)}</select></label>
        <label class="text-[11px] font-semibold">Fabric<select name="fabric" class="field mt-1"><option value="">All</option>${opt(state.meta.fabrics || [], f.fabric)}</select></label>`
        }
        <div class="col-span-2 md:col-span-4 lg:col-span-8 flex flex-wrap gap-1.5">
          ${[["Today", 0], ["7 days", 7], ["30 days", 30], ["All dates", -1]]
            .map(([l, d]) => `<button type="button" class="btn btn-ghost !py-1 !px-2.5 !text-[11px]" data-range="${d}">${l}</button>`)
            .join("")}
          <button type="submit" class="btn btn-primary !py-1 !px-3 !text-[11px] ml-auto">Apply</button>
          <button type="button" id="clear-filters" class="btn btn-ghost !py-1 !px-3 !text-[11px]">Clear</button>
        </div>
      </form>`;
  }

  function bindFilters(onChange) {
    const form = $("#filter-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      Object.keys(state.filters).forEach((k) => {
        if (fd.has(k)) state.filters[k] = String(fd.get(k) || "").trim();
      });
      state.page = 1;
      onChange();
    });
    form.querySelectorAll("[data-range]").forEach((b) =>
      b.addEventListener("click", () => {
        const d = Number(b.dataset.range);
        const iso = (dt) => dt.toISOString().slice(0, 10);
        if (d < 0) {
          state.filters.from = "";
          state.filters.to = "";
        } else {
          const end = new Date();
          const start = new Date();
          start.setDate(end.getDate() - d);
          state.filters.from = iso(start);
          state.filters.to = iso(end);
        }
        state.page = 1;
        onChange();
      })
    );
    $("#clear-filters").addEventListener("click", () => {
      Object.keys(state.filters).forEach((k) => (state.filters[k] = ""));
      state.page = 1;
      onChange();
    });
  }

  // ------------------------------------------------------------------ Overview
  async function renderOverview(app) {
    app.innerHTML = `${filterBar({ compact: true })}
      <div id="ov-body" class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">${'<div class="skeleton h-24"></div>'.repeat(5)}</div>
        <div class="grid md:grid-cols-2 gap-3">${'<div class="skeleton h-56"></div>'.repeat(4)}</div>
      </div>`;
    bindFilters(() => renderOverview(app));
    let d;
    try {
      d = await api(`/api/ops/summary?${qs()}`);
    } catch (e) {
      return handleErr(e, $("#ov-body"));
    }
    const c = d.cards;
    const isAdmin = state.user.role === "admin";
    const card = (label, value, sub, tone, statusFilter) => `
      <button class="card p-3 sm:p-4 text-left hover:shadow-md transition ${tone}" data-goto-status="${statusFilter}">
        <span class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider opacity-80">${label}</span>
        <span class="block font-serif text-3xl sm:text-4xl font-bold leading-tight">${fmtNum(value)}</span>
        <span class="block text-[11px] opacity-75">${sub}</span>
      </button>`;
    $("#ov-body").innerHTML = `
      ${
        d.placeholder_orders > 0
          ? `<div class="placeholder-tag rounded-xl px-3 py-2 text-xs font-semibold flex flex-wrap items-center gap-2">
              <span>⚠ ${fmtNum(d.placeholder_orders)} PLACEHOLDER demo orders are included in these numbers — they are not real.</span>
              ${isAdmin ? `<button class="btn btn-wine !py-1 !px-2.5 !text-[11px] ml-auto" id="clear-placeholder">Remove placeholder data</button>` : ""}
            </div>`
          : ""
      }
      ${
        c.total_orders === 0
          ? `<div class="card p-6 text-center space-y-3">
              <h2 class="font-serif text-2xl font-bold text-indigo">No orders yet</h2>
              <p class="text-sm text-ink-muted">Upload your Excel or CSV order sheet to see totals here.</p>
              <div class="flex flex-wrap justify-center gap-2">
                <button class="btn btn-primary" data-tab="upload">Upload Excel / CSV</button>
                ${isAdmin ? `<button class="btn btn-ghost" id="seed-placeholder">Load PLACEHOLDER demo data</button>` : ""}
              </div>
            </div>`
          : `
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        ${card("Total orders", c.total_orders, "received", "bg-indigo text-ivory !border-indigo", "")}
        ${card("Pending", c.pending, "not yet allocated", "bg-[#FDECC8] text-[#5C3900]", "New")}
        ${card("Allocated", c.allocated, `${fmtNum(c.in_production)} in production`, "bg-[#E0E1F7] text-indigo", "Allocated")}
        ${card("Dispatched", c.dispatched, `${fmtNum(c.delivered)} delivered`, "bg-[#D7EEF0] text-[#0F5560]", "Dispatched")}
        <div class="card p-3 sm:p-4 bg-wine text-ivory !border-wine col-span-2 lg:col-span-1">
          <span class="block text-[11px] font-bold uppercase tracking-wider text-gold-light">Total sarees ordered</span>
          <span class="block font-serif text-3xl sm:text-4xl font-bold leading-tight text-gold-light">${fmtNum(c.total_sarees)}</span>
          <span class="block text-[11px] opacity-80">pieces across all orders</span>
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-3">
        <section class="card p-4"><h3 class="font-serif text-lg font-bold mb-2">Orders per day</h3>${barChartV(d.per_day.map((x) => ({ label: x.day.slice(5), value: x.n, title: `${x.day}: ${x.n} orders, ${x.qty} sarees` })))}</section>
        <section class="card p-4"><h3 class="font-serif text-lg font-bold mb-2">Orders by status</h3>${barChartH(
          STATUSES.map((s) => ({ label: s, value: d.by_status[s]?.orders || 0, cls: "bar-" + String(s).replace(/\s+/g, "-") })),
          "orders"
        )}</section>
        <section class="card p-4"><h3 class="font-serif text-lg font-bold mb-2">Top retailers <span class="text-xs font-sans text-ink-muted">(sarees)</span></h3>${barChartH(
          d.top_retailers.map((x) => ({ label: x.label, value: x.qty })),
          "pcs"
        )}</section>
        <section class="card p-4"><h3 class="font-serif text-lg font-bold mb-2">Top product codes <span class="text-xs font-sans text-ink-muted">(sarees)</span></h3>${barChartH(
          d.top_products.map((x) => ({ label: x.label, value: x.qty })),
          "pcs"
        )}</section>
      </div>`
      }`;
    $("#ov-body").querySelectorAll("[data-goto-status]").forEach((b) =>
      b.addEventListener("click", () => {
        state.filters.status = b.dataset.gotoStatus;
        state.tab = "orders";
        state.page = 1;
        render();
      })
    );
    $("#clear-placeholder")?.addEventListener("click", () => placeholderAction("clear"));
    $("#seed-placeholder")?.addEventListener("click", () => placeholderAction("seed"));
  }

  async function placeholderAction(action) {
    if (action === "clear" && !confirm("Remove all PLACEHOLDER demo orders, staff and retailers?")) return;
    try {
      const r = await api("/api/ops/placeholder-data", { method: "POST", body: JSON.stringify({ action }) });
      toast(action === "clear" ? `Removed ${r.removed} placeholder orders.` : `Loaded ${r.inserted} PLACEHOLDER demo orders.`);
      await loadMeta();
      render();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function barChartV(items) {
    if (!items.length) return `<p class="text-xs text-ink-muted py-8 text-center">No data for this range.</p>`;
    const max = Math.max(...items.map((i) => i.value), 1);
    const w = 100 / items.length;
    return `<svg viewBox="0 0 100 52" class="w-full h-48" role="img" aria-label="Orders per day chart" preserveAspectRatio="none">
      ${items
        .map((it, i) => {
          const h = (it.value / max) * 42;
          return `<g><title>${esc(it.title || `${it.label}: ${it.value}`)}</title>
            <rect x="${i * w + w * 0.15}" y="${44 - h}" width="${w * 0.7}" height="${h}" rx="0.6" fill="#2B2D6E"></rect></g>`;
        })
        .join("")}
      <line x1="0" y1="44" x2="100" y2="44" stroke="#C4A15A" stroke-width="0.3"/>
    </svg>
    <div class="flex justify-between text-[10px] text-ink-muted -mt-1"><span>${esc(items[0].label)}</span><span>${esc(items[items.length - 1].label)}</span></div>`;
  }

  function barChartH(items, unit) {
    if (!items.length) return `<p class="text-xs text-ink-muted py-8 text-center">No data for this range.</p>`;
    const max = Math.max(...items.map((i) => i.value), 1);
    return `<ul class="space-y-2">${items
      .map(
        (it) => `<li>
          <div class="flex justify-between text-xs gap-2"><span class="truncate font-semibold">${esc(it.label)}</span><span class="shrink-0 text-ink-muted">${fmtNum(it.value)} ${unit}</span></div>
          <div class="h-2.5 rounded-full bg-[#EFE6D5] overflow-hidden mt-0.5"><div class="h-full rounded-full ${it.cls || ""}" style="width:${Math.max(2, (it.value / max) * 100)}%;${
          it.cls ? "" : "background:#6B1D2F"
        }"></div></div>
        </li>`
      )
      .join("")}</ul>`;
  }

  function handleErr(e, el) {
    if (e.unauth) return show("login-view");
    if (e.noBackend || e.network) return show("no-backend");
    if (el) el.innerHTML = `<div class="card p-4 text-sm text-wine font-semibold">${esc(e.message)}</div>`;
    else toast(e.message, true);
  }

  // ------------------------------------------------------------------ Orders & allocation
  async function renderOrders(app) {
    app.innerHTML = `${filterBar()}
      <div class="flex flex-wrap items-center gap-2 no-print">
        <button id="allocate-btn" class="btn btn-wine" disabled>Allocate selected (<span id="sel-count">0</span>)</button>
        <div class="ml-auto flex gap-2">
          <button id="export-xlsx" class="btn btn-ghost">⬇ Excel</button>
          <button id="export-pdf" class="btn btn-ghost">⬇ PDF</button>
        </div>
      </div>
      <div id="orders-body"><div class="skeleton h-64"></div></div>`;
    bindFilters(() => renderOrders(app));
    $("#allocate-btn").addEventListener("click", openAllocate);
    $("#export-xlsx").addEventListener("click", () => exportView("xlsx"));
    $("#export-pdf").addEventListener("click", () => exportView("pdf"));
    await loadOrders();
  }

  async function loadOrders() {
    const body = $("#orders-body");
    let d;
    try {
      d = await api(`/api/ops/orders?${qs({ page: state.page, limit: 25 })}`);
    } catch (e) {
      return handleErr(e, body);
    }
    state.selected.clear();
    updateSel();
    if (!d.items.length) {
      body.innerHTML = `<div class="card p-6 text-center text-sm text-ink-muted">No orders match these filters.</div>`;
      return;
    }
    const statusSelect = (o) =>
      `<select class="field !py-1 !text-[11px] !w-auto" data-status-for="${esc(o.order_id)}" aria-label="Status for ${esc(o.order_id)}">${STATUSES.map(
        (s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`
      ).join("")}</select>`;
    const allocText = (o) =>
      [o.staff_name && `👤 ${esc(o.staff_name)}`, o.batch && `Batch ${esc(o.batch)}`, o.dispatch_ref && `Dispatch ${esc(o.dispatch_ref)}`]
        .filter(Boolean)
        .join(" · ") || `<span class="text-ink-muted">Not allocated</span>`;
    const ph = (o) => (o.is_placeholder ? ` <span class="pill placeholder-tag">PLACEHOLDER</span>` : "");
    body.innerHTML = `
      <div class="card hidden md:block overflow-x-auto">
        <table class="data w-full">
          <thead><tr>
            <th><input type="checkbox" id="sel-all" aria-label="Select all on this page"></th>
            <th>Order</th><th>Date</th><th>Retailer</th><th>Product</th><th>Fabric</th><th class="text-right">Qty</th><th>Allocation</th><th>Status</th>
          </tr></thead>
          <tbody>${d.items
            .map(
              (o) => `<tr>
              <td><input type="checkbox" data-sel="${esc(o.order_id)}" aria-label="Select ${esc(o.order_id)}"></td>
              <td class="font-mono font-semibold">${esc(o.order_id)}${ph(o)}</td>
              <td class="whitespace-nowrap">${esc(o.order_date)}</td>
              <td>${esc(o.retailer)}<div class="text-[10px] text-ink-muted">${esc(o.channel)}${o.retailer_city ? " · " + esc(o.retailer_city) : ""}</div></td>
              <td class="font-mono">${esc(o.product_code)}<div class="text-[10px] text-ink-muted font-sans">${esc(o.product_name)}</div></td>
              <td>${esc(o.fabric)}</td>
              <td class="text-right font-bold">${fmtNum(o.quantity)}</td>
              <td class="text-[11px]">${allocText(o)}</td>
              <td>${statusSelect(o)}</td>
            </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>
      <ul class="md:hidden space-y-2">${d.items
        .map(
          (o) => `<li class="card p-3 space-y-1.5">
          <div class="flex items-start gap-2">
            <input type="checkbox" class="mt-1" data-sel="${esc(o.order_id)}" aria-label="Select ${esc(o.order_id)}">
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2"><span class="font-mono font-bold text-sm">${esc(o.order_id)}</span><span class="pill ${stClass(o.status)}">${esc(o.status)}</span></div>
              <p class="text-xs">${esc(o.retailer)} · <span class="text-ink-muted">${esc(o.order_date)}</span>${ph(o)}</p>
              <p class="text-xs"><span class="font-mono">${esc(o.product_code)}</span> · ${esc(o.fabric)} · <b>${fmtNum(o.quantity)} pcs</b></p>
              <p class="text-[11px]">${allocText(o)}</p>
            </div>
          </div>
          <div class="flex justify-end">${statusSelect(o)}</div>
        </li>`
        )
        .join("")}</ul>
      <div class="flex items-center justify-between text-xs mt-3 no-print">
        <span>${fmtNum(d.total)} orders · page ${d.page} of ${d.pages}</span>
        <div class="flex gap-1.5">
          <button class="btn btn-ghost !py-1.5" id="pg-prev" ${d.page <= 1 ? "disabled" : ""}>← Prev</button>
          <button class="btn btn-ghost !py-1.5" id="pg-next" ${d.page >= d.pages ? "disabled" : ""}>Next →</button>
        </div>
      </div>`;
    body.querySelectorAll("[data-sel]").forEach((cb) =>
      cb.addEventListener("change", () => {
        cb.checked ? state.selected.add(cb.dataset.sel) : state.selected.delete(cb.dataset.sel);
        body.querySelectorAll(`[data-sel="${CSS.escape(cb.dataset.sel)}"]`).forEach((x) => (x.checked = cb.checked));
        updateSel();
      })
    );
    $("#sel-all")?.addEventListener("change", (e) => {
      body.querySelectorAll("[data-sel]").forEach((cb) => {
        cb.checked = e.target.checked;
        e.target.checked ? state.selected.add(cb.dataset.sel) : state.selected.delete(cb.dataset.sel);
      });
      updateSel();
    });
    body.querySelectorAll("[data-status-for]").forEach((sel) =>
      sel.addEventListener("change", async () => {
        try {
          await api(`/api/ops/orders/${encodeURIComponent(sel.dataset.statusFor)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: sel.value })
          });
          toast(`${sel.dataset.statusFor} → ${sel.value}`);
          loadOrders();
        } catch (e) {
          toast(e.message, true);
        }
      })
    );
    $("#pg-prev")?.addEventListener("click", () => {
      state.page--;
      loadOrders();
    });
    $("#pg-next")?.addEventListener("click", () => {
      state.page++;
      loadOrders();
    });
  }

  function updateSel() {
    const n = state.selected.size;
    const c = $("#sel-count");
    if (c) c.textContent = n;
    const b = $("#allocate-btn");
    if (b) b.disabled = n === 0;
  }

  function openAllocate() {
    const staff = (state.meta.staff || []).filter((s) => s.active);
    openModal(`
      <h2 class="font-serif text-2xl font-bold text-indigo">Allocate ${state.selected.size} order(s)</h2>
      <p class="text-xs text-ink-muted mb-3">Pick a staff member, a production batch and/or a dispatch reference. New orders move to "Allocated".</p>
      <form id="alloc-form" class="space-y-3">
        <label class="block text-xs font-semibold">Staff member
          <select name="staff_id" class="field mt-1"><option value="">— Not assigned —</option>${staff
            .map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.team)})</option>`)
            .join("")}</select>
        </label>
        ${staff.length ? "" : `<p class="text-[11px] text-wine">No active staff yet. ${state.user.role === "admin" ? "Add staff in the Staff tab." : "Ask the admin to add staff."}</p>`}
        <label class="block text-xs font-semibold">Production batch<input name="batch" maxlength="40" placeholder="e.g. BATCH-07 / Loom shed A" class="field mt-1"></label>
        <label class="block text-xs font-semibold">Dispatch reference<input name="dispatch_ref" maxlength="40" placeholder="e.g. LR / AWB number" class="field mt-1"></label>
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-wine" type="submit">Allocate</button>
        </div>
      </form>`);
    $("#alloc-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await api("/api/ops/allocate", {
          method: "POST",
          body: JSON.stringify({
            order_ids: [...state.selected],
            staff_id: f.staff_id.value ? Number(f.staff_id.value) : null,
            batch: f.batch.value.trim(),
            dispatch_ref: f.dispatch_ref.value.trim()
          })
        });
        closeModal();
        toast(`Allocated ${r.updated} order(s).`);
        loadOrders();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  // ------------------------------------------------------------------ Export
  let xlsxPromise;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPromise) {
      xlsxPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/public/vendor/xlsx.full.min.js";
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => reject(new Error("Could not load the Excel library."));
        document.head.appendChild(s);
      });
    }
    return xlsxPromise;
  }

  async function exportView(kind) {
    let d;
    try {
      d = await api(`/api/ops/orders?${qs({ export: 1 })}`);
    } catch (e) {
      return toast(e.message, true);
    }
    if (!d.items.length) return toast("Nothing to export for these filters.", true);
    const rows = d.items.map((o) => ({
      "Order ID": o.order_id,
      "Order date": o.order_date,
      Retailer: o.retailer,
      City: o.retailer_city,
      Channel: o.channel,
      "Product code": o.product_code,
      "Product name": o.product_name,
      Fabric: o.fabric,
      Quantity: o.quantity,
      Status: o.status,
      Staff: o.staff_name,
      Batch: o.batch,
      "Dispatch ref": o.dispatch_ref,
      Notes: o.notes,
      Placeholder: o.is_placeholder ? "YES - not real data" : ""
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    const filterText = Object.entries(state.filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") || "All orders";
    if (kind === "xlsx") {
      try {
        const XLSX = await loadXLSX();
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Orders");
        XLSX.writeFile(wb, `lepakshi-weaves-orders-${stamp}.xlsx`);
      } catch (e) {
        toast(e.message, true);
      }
      return;
    }
    // PDF: printable report → browser "Save as PDF" (works on phones and desktops, no extra library)
    const w = window.open("", "_blank");
    if (!w) return toast("Allow pop-ups to export PDF.", true);
    const cols = ["Order ID", "Order date", "Retailer", "Product code", "Fabric", "Quantity", "Status", "Staff", "Batch", "Dispatch ref"];
    const totalQty = d.items.reduce((s, o) => s + Number(o.quantity || 0), 0);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>LEPAKSHI WEAVES orders ${stamp}</title>
      <style>body{font-family:Arial,sans-serif;font-size:10px;color:#231619;margin:18px}h1{font-size:16px;color:#6B1D2F;margin:0}
      table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #d9cbb0;padding:4px;text-align:left}
      th{background:#2B2D6E;color:#fff}tr:nth-child(even) td{background:#faf6ee}.meta{color:#6B5B57;margin:4px 0}
      @page{size:A4 landscape;margin:10mm}</style></head><body>
      <img src="${location.origin}/public/brand/lepakshi-weaves-logo-horizontal-88.png" alt="LEPAKSHI WEAVES" height="40">
      <h1>Orders report</h1>
      <p class="meta">Generated ${new Date().toLocaleString("en-IN")} by ${esc(state.user.name)} · Filters: ${esc(filterText)} · ${fmtNum(d.items.length)} orders · ${fmtNum(totalQty)} sarees</p>
      ${d.items.some((o) => o.is_placeholder) ? '<p class="meta"><b>Note:</b> rows marked PLACEHOLDER are demo data, not real orders.</p>' : ""}
      <table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}${c === "Order ID" && r.Placeholder ? " (PLACEHOLDER)" : ""}</td>`).join("")}</tr>`).join("")}
      </tbody></table><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }

  // ------------------------------------------------------------------ Upload
  function normalizeHeader(h) {
    return String(h || "").toLowerCase().replace(/[_\-.#]/g, " ").replace(/\s+/g, " ").trim();
  }

  function autoMap(headers) {
    const map = {};
    COLUMNS.forEach((col) => {
      const candidates = [col.key.replace(/_/g, " "), col.label.toLowerCase(), ...col.aliases];
      const found = headers.find((h) => candidates.includes(normalizeHeader(h)));
      map[col.key] = found || "";
    });
    return map;
  }

  async function renderUpload(app) {
    app.innerHTML = `
      <section class="card p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="font-serif text-2xl font-bold text-indigo">Upload order sheet</h2>
            <p class="text-xs text-ink-muted">Excel (.xlsx) or CSV, up to 5 MB and 20,000 rows. The first sheet and first row (headers) are used.</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost" id="tpl-xlsx">⬇ Template .xlsx</button>
            <a class="btn btn-ghost" id="tpl-csv" href="#">⬇ Template .csv</a>
          </div>
        </div>
        <label class="block border-2 border-dashed border-gold/60 rounded-2xl p-6 text-center cursor-pointer hover:bg-[#FAF6EE]">
          <input id="file-input" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" class="sr-only">
          <span class="block text-3xl" aria-hidden="true">⇪</span>
          <span class="block font-semibold text-sm">Tap to choose a file</span>
          <span id="file-name" class="block text-xs text-ink-muted mt-1">No file selected</span>
        </label>
        <div id="upload-step"></div>
      </section>
      <section class="card p-4">
        <h3 class="font-serif text-lg font-bold mb-2">Recent uploads</h3>
        <div id="upload-history" class="text-xs"><div class="skeleton h-16"></div></div>
      </section>`;
    $("#file-input").addEventListener("change", onFileChosen);
    $("#tpl-xlsx").addEventListener("click", downloadTemplateXlsx);
    $("#tpl-csv").addEventListener("click", downloadTemplateCsv);
    loadUploadHistory();
  }

  const TEMPLATE_SAMPLE = [
    ["PLACEHOLDER-1001", "2026-10-01", "[PLACEHOLDER] Sri Lakshmi Silks", "[PLACEHOLDER] Hyderabad", "Wholesale", "LW-KAN-001", "Kanchipuram Pure Silk - Ruby", "Kanchipuram Pure Silk", 24, "New", "Sample row - replace with real data"],
    ["PLACEHOLDER-1002", "2026-10-01", "[PLACEHOLDER] Retail walk-in", "[PLACEHOLDER] Dharmavaram", "Retail", "LW-TIS-014", "Champagne Tissue - Peacock", "Champagne Tissue", 1, "Allocated", "Sample row - replace with real data"],
    ["PLACEHOLDER-1003", "02-10-2026", "[PLACEHOLDER] Vasundhara Sarees", "[PLACEHOLDER] Bengaluru", "Wholesale", "LW-ORG-007", "Tissue Organza - Rose", "Tissue Organza", 60, "In production", "Dates may also be DD-MM-YYYY"]
  ];

  async function downloadTemplateXlsx() {
    try {
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.key), ...TEMPLATE_SAMPLE]);
      ws["!cols"] = COLUMNS.map(() => ({ wch: 20 }));
      const help = XLSX.utils.aoa_to_sheet([
        ["Column", "Required", "Rules"],
        ["order_id", "Yes", "Unique. Letters, numbers, - _ / . (max 40)"],
        ["order_date", "Yes", "YYYY-MM-DD or DD-MM-YYYY"],
        ["retailer_name", "Yes", "Shop / party name"],
        ["retailer_city", "No", ""],
        ["channel", "No", "Retail or Wholesale (default Retail)"],
        ["product_code", "Yes", "Your design / SKU code"],
        ["product_name", "No", ""],
        ["fabric", "No", "e.g. Kanchipuram Pure Silk"],
        ["quantity", "Yes", "Whole number of sarees, 1-100000"],
        ["status", "No", STATUSES.join(" / ") + " (default New)"],
        ["notes", "No", "Max 500 characters"],
        [],
        ["Rows starting with PLACEHOLDER are examples. Delete them before uploading real data."]
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.utils.book_append_sheet(wb, help, "How to fill");
      XLSX.writeFile(wb, "lepakshi-weaves-orders-template.xlsx");
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function downloadTemplateCsv(e) {
    e.preventDefault();
    try {
      let blob;
      if (state.sandbox) {
        const csvCell = (v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [COLUMNS.map((c) => c.key), ...TEMPLATE_SAMPLE].map((r) => r.map(csvCell).join(",")).join("\r\n");
        blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
      } else {
        const res = await fetch("/api/ops/template.csv", { headers: { Authorization: `Bearer ${state.token}` } });
        if (!res.ok) throw new Error("Could not download the template.");
        blob = await res.blob();
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "lepakshi-weaves-orders-template.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function onFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    const step = $("#upload-step");
    state.upload = null;
    if (!file) return;
    $("#file-name").textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      step.innerHTML = `<p class="text-sm text-wine font-semibold">Only .xlsx or .csv files are accepted. Old .xls files: open in Excel and "Save As" .xlsx.</p>`;
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      step.innerHTML = `<p class="text-sm text-wine font-semibold">This file is larger than 5 MB. Split it into smaller files.</p>`;
      return;
    }
    step.innerHTML = `<div class="skeleton h-24"></div>`;
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
      if (aoa.length < 2) throw new Error("The sheet has no data rows under the header row.");
      const headers = aoa[0].map((h) => String(h).trim());
      const dataRows = aoa.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
      if (dataRows.length > 20000) throw new Error(`Too many rows (${dataRows.length}). Max 20,000 per upload.`);
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      state.upload = { filename: file.name, headers, dataRows, fileB64: btoa(bin), map: autoMap(headers) };
      renderMapping();
    } catch (err) {
      step.innerHTML = `<p class="text-sm text-wine font-semibold">Could not read this file: ${esc(err.message)}</p>`;
    }
  }

  function mappedRows() {
    const u = state.upload;
    const idx = Object.fromEntries(COLUMNS.map((c) => [c.key, u.headers.indexOf(u.map[c.key])]));
    return u.dataRows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c.key, idx[c.key] >= 0 ? String(r[idx[c.key]] ?? "").trim() : ""])));
  }

  function renderMapping() {
    const u = state.upload;
    const missing = COLUMNS.filter((c) => c.required && !u.map[c.key]);
    const preview = u.dataRows.slice(0, 8);
    $("#upload-step").innerHTML = `
      <div class="space-y-4">
        <div>
          <h3 class="font-serif text-lg font-bold">1. Preview <span class="text-xs font-sans text-ink-muted">(${fmtNum(u.dataRows.length)} data rows)</span></h3>
          <div class="overflow-x-auto border border-gold/30 rounded-xl mt-1">
            <table class="data w-full"><thead><tr><th>#</th>${u.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
            <tbody>${preview.map((r, i) => `<tr><td class="text-ink-muted">${i + 2}</td>${u.headers.map((_, j) => `<td>${esc(r[j])}</td>`).join("")}</tr>`).join("")}</tbody></table>
          </div>
        </div>
        <div>
          <h3 class="font-serif text-lg font-bold">2. Match your columns</h3>
          <p class="text-xs text-ink-muted mb-2">We guessed from your headers. Fix any that are wrong. * = required.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            ${COLUMNS.map(
              (c) => `<label class="text-[11px] font-semibold">${esc(c.label)}${c.required ? " *" : ""}
                <select class="field mt-1 ${c.required && !u.map[c.key] ? "!border-wine" : ""}" data-map="${c.key}">
                  <option value="">— not in file —</option>
                  ${u.headers.map((h) => `<option ${u.map[c.key] === h ? "selected" : ""}>${esc(h)}</option>`).join("")}
                </select></label>`
            ).join("")}
          </div>
          ${missing.length ? `<p class="text-xs text-wine font-semibold mt-2">Required columns not matched: ${missing.map((m) => esc(m.label)).join(", ")}</p>` : ""}
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="validate-btn" class="btn btn-primary" ${missing.length ? "disabled" : ""}>3. Check rows</button>
        </div>
        <div id="validate-result"></div>
      </div>`;
    $("#upload-step").querySelectorAll("[data-map]").forEach((sel) =>
      sel.addEventListener("change", () => {
        state.upload.map[sel.dataset.map] = sel.value;
        renderMapping();
      })
    );
    $("#validate-btn").addEventListener("click", validateUpload);
  }

  async function validateUpload() {
    const out = $("#validate-result");
    out.innerHTML = `<div class="skeleton h-16"></div>`;
    try {
      const r = await api("/api/ops/uploads/validate", {
        method: "POST",
        body: JSON.stringify({ filename: state.upload.filename, rows: mappedRows() })
      });
      out.innerHTML = `
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="card p-2"><b class="font-serif text-2xl">${fmtNum(r.total_rows)}</b><span class="block text-[10px] uppercase">rows</span></div>
          <div class="card p-2 bg-[#DCEFD9]"><b class="font-serif text-2xl">${fmtNum(r.valid_rows)}</b><span class="block text-[10px] uppercase">ready</span></div>
          <div class="card p-2 ${r.error_rows ? "bg-[#F8DADF]" : ""}"><b class="font-serif text-2xl">${fmtNum(r.error_rows)}</b><span class="block text-[10px] uppercase">with errors</span></div>
        </div>
        ${errorTable(r.errors)}
        <div class="flex flex-wrap gap-2 mt-3">
          <button id="commit-btn" class="btn btn-wine" ${r.valid_rows ? "" : "disabled"}>Import ${fmtNum(r.valid_rows)} valid row(s)</button>
          ${r.error_rows ? `<span class="text-xs text-ink-muted self-center">Rows with errors are skipped. Fix them in Excel and upload again.</span>` : ""}
        </div>`;
      $("#commit-btn")?.addEventListener("click", commitUpload);
    } catch (e) {
      handleErr(e, out);
    }
  }

  function errorTable(errors) {
    if (!errors || !errors.length) return `<p class="text-xs font-semibold text-[#245C1D] mt-2">✓ No errors found.</p>`;
    return `<div class="mt-3 max-h-72 overflow-y-auto border border-wine/30 rounded-xl">
      <table class="data w-full"><thead><tr><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
      <tbody>${errors
        .slice(0, 300)
        .map((er) => `<tr><td class="font-mono">${er.row}</td><td>${esc(er.field)}</td><td class="text-wine">${esc(er.message)}</td></tr>`)
        .join("")}</tbody></table>
      ${errors.length > 300 ? `<p class="text-[11px] p-2 text-ink-muted">Showing first 300 of ${errors.length} problems.</p>` : ""}
    </div>`;
  }

  async function commitUpload() {
    const btn = $("#commit-btn");
    btn.disabled = true;
    btn.textContent = "Importing…";
    try {
      const r = await api("/api/ops/uploads/commit", {
        method: "POST",
        body: JSON.stringify({ filename: state.upload.filename, rows: mappedRows(), file_b64: state.upload.fileB64 })
      });
      toast(`Imported ${r.imported_rows} order(s). ${r.error_rows ? r.error_rows + " row(s) skipped." : ""}`);
      state.upload = null;
      await loadMeta();
      state.tab = "overview";
      render();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Import valid rows";
      if (e.data && e.data.errors) $("#validate-result").insertAdjacentHTML("beforeend", errorTable(e.data.errors));
      toast(e.message, true);
    }
  }

  async function loadUploadHistory() {
    const el = $("#upload-history");
    try {
      const d = await api("/api/ops/uploads");
      el.innerHTML = d.items.length
        ? `<ul class="divide-y divide-gold/20">${d.items
            .map(
              (u) => `<li class="py-2 flex flex-wrap justify-between gap-2">
              <span class="font-semibold break-all">${esc(u.original_filename)}</span>
              <span class="text-ink-muted">${esc(u.uploaded_at.replace("T", " ").slice(0, 16))} · ${esc(u.uploaded_by)} · ${u.imported_rows} imported${
                u.error_rows ? `, ${u.error_rows} skipped` : ""
              }</span></li>`
            )
            .join("")}</ul>`
        : `<p class="text-ink-muted">No uploads yet.</p>`;
    } catch (e) {
      handleErr(e, el);
    }
  }

  // ------------------------------------------------------------------ Staff (admin)
  async function renderStaff(app) {
    app.innerHTML = `
      <section class="card p-4 space-y-3">
        <h2 class="font-serif text-2xl font-bold text-indigo">Staff</h2>
        <form id="staff-form" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
          <label class="text-[11px] font-semibold">Name *<input name="name" required maxlength="120" class="field mt-1"></label>
          <label class="text-[11px] font-semibold">Phone<input name="phone" inputmode="tel" maxlength="15" class="field mt-1"></label>
          <label class="text-[11px] font-semibold">Team
            <select name="team" class="field mt-1"><option>Production</option><option>Dispatch</option><option>Quality check</option><option>Office</option></select>
          </label>
          <label class="text-[11px] font-semibold">Login email <span class="font-normal text-ink-muted">(optional)</span><input name="email" type="email" class="field mt-1" autocomplete="off"></label>
          <label class="text-[11px] font-semibold">Login password <span class="font-normal text-ink-muted">(min 10)</span><input name="password" type="password" minlength="10" class="field mt-1" autocomplete="new-password"></label>
          <button class="btn btn-primary sm:col-span-2 lg:col-span-5 justify-self-start" type="submit">+ Add staff member</button>
        </form>
        <p class="text-[11px] text-ink-muted">Staff with a login can sign in here to view orders, upload sheets, allocate and update status. They cannot manage staff or see the activity log.</p>
      </section>
      <section id="staff-list" class="card p-4"><div class="skeleton h-24"></div></section>`;
    $("#staff-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.email.value && f.password.value.length < 10) return toast("Password must be at least 10 characters.", true);
      try {
        await api("/api/ops/staff", {
          method: "POST",
          body: JSON.stringify({ name: f.name.value, phone: f.phone.value, team: f.team.value, email: f.email.value, password: f.password.value })
        });
        toast("Staff member added.");
        f.reset();
        await loadMeta();
        loadStaff();
      } catch (err) {
        toast(err.message, true);
      }
    });
    loadStaff();
  }

  async function loadStaff() {
    const el = $("#staff-list");
    try {
      const d = await api("/api/ops/staff");
      el.innerHTML = d.items.length
        ? `<ul class="divide-y divide-gold/20">${d.items
            .map(
              (s) => `<li class="py-2.5 flex flex-wrap items-center justify-between gap-2 ${s.active ? "" : "opacity-50"}">
              <div><b>${esc(s.name)}</b> <span class="pill bg-[#EFE6D5]">${esc(s.team)}</span>
                <div class="text-[11px] text-ink-muted">${esc(s.phone || "")}${s.email ? " · login: " + esc(s.email) : " · no login"} · ${s.open_orders} open order(s)</div></div>
              <button class="btn btn-ghost !py-1 !text-[11px]" data-staff-toggle="${s.id}" data-active="${s.active ? 0 : 1}">${s.active ? "Deactivate" : "Activate"}</button>
            </li>`
            )
            .join("")}</ul>`
        : `<p class="text-xs text-ink-muted">No staff added yet.</p>`;
      el.querySelectorAll("[data-staff-toggle]").forEach((b) =>
        b.addEventListener("click", async () => {
          try {
            await api(`/api/ops/staff/${b.dataset.staffToggle}`, { method: "PATCH", body: JSON.stringify({ active: b.dataset.active === "1" }) });
            await loadMeta();
            loadStaff();
          } catch (e) {
            toast(e.message, true);
          }
        })
      );
    } catch (e) {
      handleErr(e, el);
    }
  }

  // ------------------------------------------------------------------ Activity (admin)
  async function renderActivity(app) {
    app.innerHTML = `<section class="card p-4"><h2 class="font-serif text-2xl font-bold text-indigo mb-2">Activity log</h2><div id="act-list"><div class="skeleton h-40"></div></div></section>`;
    const el = $("#act-list");
    try {
      const d = await api("/api/ops/activity");
      el.innerHTML = d.items.length
        ? `<ul class="divide-y divide-gold/20 text-xs">${d.items
            .map((a) => {
              let det = "";
              try {
                const o = JSON.parse(a.details_json || "{}");
                det = Object.entries(o).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
              } catch (e) {}
              return `<li class="py-2"><div class="flex flex-wrap justify-between gap-2"><b>${esc(a.action.replace(/_/g, " "))}</b><span class="text-ink-muted">${esc(
                a.timestamp.replace("T", " ").slice(0, 19)
              )}</span></div><div>${esc(a.user_email)} → ${esc(a.target_type)} ${esc(a.target_id)}</div>${det ? `<div class="text-ink-muted break-all">${esc(det)}</div>` : ""}</li>`;
            })
            .join("")}</ul>`
        : `<p class="text-xs text-ink-muted">No activity yet.</p>`;
    } catch (e) {
      handleErr(e, el);
    }
  }

  boot();
})();
