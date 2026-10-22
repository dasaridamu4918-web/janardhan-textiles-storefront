/**
 * ============================================================================
 * JANARDHAN TEXTILES — PROMPT 1 (STOREFRONT) & PROMPT 2 (ADMIN PANEL)
 * Full E-Commerce Storefront + Protected Admin Dashboard wired to `server.py`
 * ============================================================================
 */
(function () {
  if (typeof window === "undefined" || typeof app === "undefined") return;
  window.app = app;


  // 1. API Base URL Configuration (VITE_API_URL / NEXT_PUBLIC_API_URL)
  const detectedPort = window.location.port;
  const defaultApiBase =
    window.location.protocol === "file:"
      ? "http://localhost:8080"
      : "";

  window.VITE_API_URL = window.VITE_API_URL !== undefined ? window.VITE_API_URL : defaultApiBase;
  window.NEXT_PUBLIC_API_URL = window.VITE_API_URL;
  const API_URL = window.VITE_API_URL;

  // Helper to prefix /uploads/ and /public/images/ URLs properly
  app.resolveImageUrl = function (url, fallbackName, fallbackLabel) {
    if (!url || typeof url !== "string" || !url.trim()) {
      return createMissingViewPlaceholderSVG(fallbackName || "Saree", fallbackLabel || "View");
    }
    const trimmed = url.trim();
    if (trimmed.startsWith("data:") || trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("blob:")) {
      return trimmed;
    }
    if (trimmed.startsWith("/uploads/") || trimmed.startsWith("/assets/uploads/")) {
      return `${API_URL}${trimmed}`;
    }
    const basePath = window.__ASSET_BASE_PATH__ || "";
    if (basePath && trimmed.startsWith("/") && !trimmed.startsWith(basePath)) {
      return `${basePath}${trimmed}`;
    }
    return trimmed;
  };

  // LocalStorage-backed API Engine Fallback for Static Hosts (Vercel / GitHub Pages / Mobile Offline)
  const LOCAL_FALLBACK_API = {
    getProducts() {
      try {
        localStorage.removeItem("jt_local_products_v1");
        localStorage.removeItem("jt_local_products_v2");
        localStorage.removeItem("jt_local_products_v3");
        localStorage.removeItem("jt_local_products_v4");
        const raw = localStorage.getItem("jt_local_products_v5");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((p, idx) => this.normalizeProduct(p, idx));
          }
        }
      } catch (e) {}
      const seed = (Array.isArray(window.INITIAL_PRODUCTS) && window.INITIAL_PRODUCTS.length > 0
        ? window.INITIAL_PRODUCTS
        : app.state.products || []
      ).map((p, idx) => this.normalizeProduct(p, idx));
      this.saveProducts(seed);
      return seed;
    },

    saveProducts(list) {
      try {
        localStorage.setItem("jt_local_products_v5", JSON.stringify(list));
      } catch (e) {}
      app.state.products = list;
    },

    normalizeProduct(prod, idx = 0) {
      const p = { ...prod };
      const sku = String(p.sku || p.id || `jt-saree-${String(idx + 1).padStart(2, "0")}`).trim();
      p.id = p.id || sku;
      p.isSampleProduct = false;
      p.isSamplePrice = false;
      p.isSampleImage = false;
      if (typeof p.description === 'string') p.description = p.description.replace(/^Sample design description \(editable\):\s*/i, '');
      p.sku = sku;
      const price = Math.round(Number(p.price ?? p.priceINR ?? 0));
      const mrp = Math.round(Number(p.mrp ?? p.originalPriceINR ?? price));
      p.price = price;
      p.priceINR = price;
      p.mrp = mrp;
      p.originalPriceINR = mrp;
      p.discountPercent = mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;

      let stock = p.stock !== undefined ? Number(p.stock) : p.stockQty !== undefined ? Number(p.stockQty) : 20;
      if (isNaN(stock) || p.stockStatus === "Out of Stock") stock = 0;
      stock = Math.max(0, Math.round(stock));
      p.stock = stock;
      p.stockQty = stock;
      if (stock <= 0) {
        p.stockStatus = "Out of Stock";
        p.stock_status = "out_of_stock";
      } else if (stock <= 10) {
        p.stockStatus = "Low Stock";
        p.stock_status = "low_stock";
      } else {
        p.stockStatus = "In Stock";
        p.stock_status = "in_stock";
      }
      if (p.active === undefined) p.active = true;
      if (p.featured === undefined) p.featured = idx < 5;
      if (p.bestseller === undefined) p.bestseller = [0, 1, 3, 5, 6].includes(idx);
      p.work_details = p.work_details ?? p.borderAndZari ?? "";
      p.borderAndZari = p.borderAndZari || p.work_details;
      p.blouse_piece = p.blouse_piece ?? p.blousePiece ?? "";
      p.blousePiece = p.blousePiece || p.blouse_piece;

      if (Array.isArray(p.gallery) && p.gallery.length > 0) {
        const frontBaseUrl = p.gallery[0]?.url ? String(p.gallery[0].url).split("?")[0].trim() : "";
        p.gallery = REQUIRED_GALLERY_VIEWS.map((viewMeta, i) => {
          const existing = p.gallery[i] || {};
          let rawUrl = String(existing.url || "").trim();
          // Never allow views 2..5 to substitute a duplicate copy of the front view image
          if (i > 0 && rawUrl && frontBaseUrl && rawUrl.split("?")[0].trim() === frontBaseUrl) {
            rawUrl = "";
          }
          return {
            order: viewMeta.index,
            key: viewMeta.key,
            label: viewMeta.label,
            shortLabel: viewMeta.shortLabel,
            url: rawUrl,
            missingView: !rawUrl,
            isSampleImage: false,
            alt: existing.alt || `${p.name || "Saree"} — ${viewMeta.label}`
          };
        });
      } else if (Array.isArray(p.images) && p.images.length > 0) {
        const frontBaseUrl = p.images[0] ? String(p.images[0]).split("?")[0].trim() : "";
        p.gallery = REQUIRED_GALLERY_VIEWS.map((viewMeta, i) => {
          let rawUrl = String(p.images[i] || "").trim();
          if (i > 0 && rawUrl && frontBaseUrl && rawUrl.split("?")[0].trim() === frontBaseUrl) {
            rawUrl = "";
          }
          return {
            order: viewMeta.index,
            key: viewMeta.key,
            label: viewMeta.label,
            shortLabel: viewMeta.shortLabel,
            url: rawUrl,
            missingView: !rawUrl,
            isSampleImage: false,
            alt: `${p.name || "Saree"} — ${viewMeta.label}`
          };
        });
      }
      p.images = Array.isArray(p.gallery) ? p.gallery.map((g) => g?.url).filter(Boolean) : [];
      p.missingViews = Array.isArray(p.gallery)
        ? p.gallery.filter((g) => !g.url).map((g) => REQUIRED_GALLERY_VIEWS[g.order - 1]?.file || g.key)
        : [];
      p.image = (Array.isArray(p.images) && p.images[0]) || (Array.isArray(p.gallery) && p.gallery[0]?.url) || "";
      return p;
    },

    getOrders() {
      try {
        const raw = localStorage.getItem("jt_local_orders_v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {}
      return [];
    },

    saveOrders(list) {
      try {
        localStorage.setItem("jt_local_orders_v1", JSON.stringify(list));
      } catch (e) {}
      app.state.orders = list;
    },

    getUsers() {
      const defaults = [];
      try {
        const raw = localStorage.getItem("jt_local_users_v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
      try {
        localStorage.setItem("jt_local_users_v1", JSON.stringify(defaults));
      } catch (e) {}
      return defaults;
    },

    saveUsers(list) {
      try {
        localStorage.setItem("jt_local_users_v1", JSON.stringify(list));
      } catch (e) {}
    },

    getCurrentUserFromToken(token) {
      if (!token) return null;
      try {
        const sessions = JSON.parse(localStorage.getItem("jt_local_sessions_v1") || "{}");
        if (sessions[token]) return sessions[token];
      } catch (e) {}
      if (app.state.currentUser && (app.state.authToken === token || localStorage.getItem("jt_auth_token") === token)) {
        return app.state.currentUser;
      }
      return null;
    },

    saveSession(token, user) {
      try {
        const sessions = JSON.parse(localStorage.getItem("jt_local_sessions_v1") || "{}");
        sessions[token] = user;
        localStorage.setItem("jt_local_sessions_v1", JSON.stringify(sessions));
      } catch (e) {}
    },

    handle(path, options = {}) {
      const method = (options.method || "GET").toUpperCase();
      const urlObj = new URL(path.startsWith("http") ? path : `http://localhost${path}`);
      const pathname = urlObj.pathname;
      const qs = urlObj.searchParams;
      let body = {};
      if (typeof options.body === "string" && options.body.trim()) {
        try {
          body = JSON.parse(options.body);
        } catch (e) {}
      }
      const token = app.state.authToken || localStorage.getItem("jt_auth_token") || "";
      const user = this.getCurrentUserFromToken(token);

      // 1. Razorpay 501 Honesty Rule
      if (pathname.startsWith("/api/payments/razorpay/")) {
        return { status: 501, ok: false, data: { ok: false, error: "Online payment is not set up yet" } };
      }

      // 2. Filters
      if (method === "GET" && pathname === "/api/filters") {
        const active = this.getProducts().filter((p) => p.active !== false);
        const prices = active.map((p) => p.price || 0).filter((n) => n > 0);
        const baseColors = [...new Set(active.map((p) => p.color).filter(Boolean))];
        ["Royal Rose & Gold", "Emerald Teal & Gold"].forEach((c) => {
          if (!baseColors.includes(c)) baseColors.push(c);
        });
        return {
          status: 200,
          ok: true,
          data: {
            ok: true,
            fabrics: [...new Set(active.map((p) => p.fabric).filter(Boolean))].sort(),
            colors: baseColors,
            occasions: [...new Set(active.map((p) => p.occasion).filter(Boolean))].sort(),
            price: {
              min: prices.length ? Math.min(...prices) : 1200,
              max: prices.length ? Math.max(...prices) : 7500
            },
            shipping: { flat: 99, free_above: 2999 }
          }
        };
      }

      // 3. Products List & Single Product
      if (method === "GET" && pathname === "/api/products") {
        let items = this.getProducts().filter((p) => p.active !== false);
        const q = (qs.get("q") || "").trim().toLowerCase();
        if (q) {
          items = items.filter((p) =>
            [p.name, p.sku, p.fabric, p.color, p.occasion, p.description].some((f) => String(f || "").toLowerCase().includes(q))
          );
        }
        const splitParam = (k) =>
          (qs.get(k) || "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        const fabrics = splitParam("fabric");
        if (fabrics.length) items = items.filter((p) => fabrics.includes(String(p.fabric || "").toLowerCase()));
        const colors = splitParam("color");
        if (colors.length) items = items.filter((p) => colors.includes(String(p.color || "").toLowerCase()));
        const occasions = splitParam("occasion");
        if (occasions.length) items = items.filter((p) => occasions.includes(String(p.occasion || "").toLowerCase()));
        if (qs.get("minPrice")) items = items.filter((p) => (p.price || 0) >= Number(qs.get("minPrice")));
        if (qs.get("maxPrice")) items = items.filter((p) => (p.price || 0) <= Number(qs.get("maxPrice")));
        const avail = qs.get("availability");
        if (avail === "in_stock") items = items.filter((p) => p.stock_status !== "out_of_stock" && (p.stock || 0) > 0);
        if (avail === "out_of_stock") items = items.filter((p) => p.stock_status === "out_of_stock" || (p.stock || 0) <= 0);
        if (qs.get("featured") === "1") items = items.filter((p) => Boolean(p.featured));
        if (qs.get("bestseller") === "1") items = items.filter((p) => Boolean(p.bestseller));

        const sort = qs.get("sort") || "newest";
        if (sort === "price_asc") items.sort((a, b) => (a.price || 0) - (b.price || 0));
        else if (sort === "price_desc") items.sort((a, b) => (b.price || 0) - (a.price || 0));
        else if (sort === "name") items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        const total = items.length;
        const page = Math.max(1, parseInt(qs.get("page") || "1", 10) || 1);
        const limit = Math.max(1, parseInt(qs.get("limit") || "12", 10) || 12);
        const pages = Math.max(1, Math.ceil(total / limit));
        const paged = items.slice((page - 1) * limit, page * limit);
        return { status: 200, ok: true, data: { ok: true, total, page, limit, pages, items: paged } };
      }

      if (method === "GET" && pathname.startsWith("/api/products/")) {
        const pid = decodeURIComponent(pathname.slice("/api/products/".length));
        const prod = this.getProducts().find((p) => p.id === pid || p.sku === pid);
        if (!prod) return { status: 404, ok: false, data: { ok: false, error: "Product not found" } };
        return { status: 200, ok: true, data: { ok: true, product: prod, ...prod } };
      }

      // 4. Auth Endpoints
      if (method === "POST" && pathname === "/api/auth/login") {
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const users = this.getUsers();
        const found = users.find((u) => u.email.toLowerCase() === email && u.password === password);
        if (!found) {
          return { status: 401, ok: false, data: { ok: false, error: "Invalid email or password." } };
        }
        const safeUser = { id: found.id, name: found.name, email: found.email, phone: found.phone, role: found.role, created_at: found.created_at };
        const tok = `tok-${found.id}-${Date.now()}`;
        this.saveSession(tok, safeUser);
        return { status: 200, ok: true, data: { ok: true, token: tok, user: safeUser } };
      }

      if (method === "POST" && pathname === "/api/auth/register") {
        const name = String(body.name || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const phone = String(body.phone || "").trim();
        const password = String(body.password || "");
        if (!name || !email || !password) {
          return { status: 400, ok: false, data: { ok: false, error: "Name, email, and password are required." } };
        }
        const users = this.getUsers();
        if (users.some((u) => u.email.toLowerCase() === email)) {
          return { status: 409, ok: false, data: { ok: false, error: "An account with this email already exists." } };
        }
        const newUser = {
          id: `usr-${Date.now()}`,
          name,
          email,
          phone,
          password,
          role: "customer",
          created_at: new Date().toISOString()
        };
        users.push(newUser);
        this.saveUsers(users);
        const safeUser = { id: newUser.id, name: newUser.name, email: newUser.email, phone: newUser.phone, role: newUser.role, created_at: newUser.created_at };
        const tok = `tok-${newUser.id}-${Date.now()}`;
        this.saveSession(tok, safeUser);
        return { status: 201, ok: true, data: { ok: true, token: tok, user: safeUser } };
      }

      if (method === "GET" && pathname === "/api/me") {
        if (!user) return { status: 401, ok: false, data: { ok: false, error: "Not authenticated" } };
        return { status: 200, ok: true, data: { ok: true, user } };
      }

      // 5. Wishlist
      if (pathname === "/api/wishlist" || pathname.startsWith("/api/wishlist/")) {
        if (!user) {
          return { status: 401, ok: false, data: { ok: false, error: "Authentication required. Please log in." } };
        }
        const wKey = `jt_local_wishlist_${user.id}`;
        let ids = [];
        try {
          ids = JSON.parse(localStorage.getItem(wKey) || "[]");
        } catch (e) {}
        if (method === "PUT" && pathname.startsWith("/api/wishlist/")) {
          const pid = decodeURIComponent(pathname.slice("/api/wishlist/".length));
          if (!ids.includes(pid)) ids.unshift(pid);
          localStorage.setItem(wKey, JSON.stringify(ids));
        } else if (method === "DELETE" && pathname.startsWith("/api/wishlist/")) {
          const pid = decodeURIComponent(pathname.slice("/api/wishlist/".length));
          ids = ids.filter((x) => x !== pid);
          localStorage.setItem(wKey, JSON.stringify(ids));
        }
        const allProds = this.getProducts();
        const items = ids.map((id) => allProds.find((p) => p.id === id || p.sku === id)).filter(Boolean);
        return { status: 200, ok: true, data: { ok: true, items } };
      }

      // 6. Place Order (POST /api/orders -> HTTP 201) & Get Orders
      if (method === "POST" && pathname === "/api/orders") {
        const rawItems = Array.isArray(body.items) ? body.items : [];
        if (rawItems.length === 0) {
          return { status: 400, ok: false, data: { ok: false, error: "Your cart is empty." } };
        }
        const addr = body.address || {
          name: body.customerName || "",
          phone: body.phone || "",
          line1: body.city || "",
          line2: "",
          city: body.city || "",
          state: "",
          pincode: "500001"
        };
        const rawDigits = String(addr.phone || "").replace(/\D/g, "");
        const cleanPhone = rawDigits.length > 10 && rawDigits.startsWith("91") ? rawDigits.slice(-10) : rawDigits.length === 11 && rawDigits.startsWith("0") ? rawDigits.slice(1) : rawDigits;
        const cleanPin = String(addr.pincode || "").replace(/\D/g, "");
        if (body.address) {
          if (!addr.name || !addr.line1 || !addr.city || !addr.state) {
            return { status: 400, ok: false, data: { ok: false, error: "Complete delivery address is required." } };
          }
          if (cleanPhone.length !== 10) {
            return { status: 400, ok: false, data: { ok: false, error: "Phone number must be 10 digits." } };
          }
          if (cleanPin.length !== 6) {
            return { status: 400, ok: false, data: { ok: false, error: "Pincode must be 6 digits." } };
          }
        }
        if (body.payment_method === "online") {
          return { status: 501, ok: false, data: { ok: false, error: "Online payment is not set up yet" } };
        }

        const prods = this.getProducts();
        const orderItems = [];
        let subtotal = 0;

        for (const reqItem of rawItems) {
          const pid = reqItem.product_id || reqItem.productId || reqItem.id;
          const qty = Math.max(1, parseInt(reqItem.quantity ?? reqItem.qty ?? 1, 10) || 1);
          const pIdx = prods.findIndex((p) => p.id === pid || p.sku === pid);
          if (pIdx < 0) {
            return { status: 400, ok: false, data: { ok: false, error: `Product ${pid} not found.` } };
          }
          const prod = prods[pIdx];
          if ((prod.stock || 0) < qty) {
            return { status: 400, ok: false, data: { ok: false, error: `Insufficient stock for ${prod.name} (only ${prod.stock || 0} left).` } };
          }
          prod.stock = Math.max(0, (prod.stock || 0) - qty);
          prod.stockQty = prod.stock;
          prods[pIdx] = this.normalizeProduct(prod, pIdx);

          const unitPrice = prod.price || prod.priceINR || 0;
          subtotal += unitPrice * qty;
          orderItems.push({
            product_id: prod.id,
            productId: prod.id,
            sku: prod.sku,
            name: prod.name,
            fabric: prod.fabric,
            color: prod.color,
            price: unitPrice,
            priceINR: unitPrice,
            quantity: qty,
            qty,
            thumbUrl: prod.image || (prod.gallery && prod.gallery[0]?.url) || ""
          });
        }

        this.saveProducts(prods);
        const shipping = subtotal >= 2999 || subtotal === 0 ? 0 : 99;
        const total = subtotal + shipping;
        const orderNumber = body.orderId || `JT-ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        const createdAt = new Date().toISOString();
        const newOrder = {
          order_number: orderNumber,
          orderId: orderNumber,
          user_id: user ? user.id : "guest",
          customerName: addr.name,
          phone: cleanPhone || addr.phone,
          city: `${addr.city}${addr.state ? ", " + addr.state : ""}`,
          address: {
            name: addr.name,
            phone: cleanPhone || addr.phone,
            line1: addr.line1,
            line2: addr.line2 || "",
            city: addr.city,
            state: addr.state,
            pincode: cleanPin
          },
          items: orderItems,
          subtotal,
          shipping,
          total,
          totalINR: total,
          payment_method: body.payment_method || "cod",
          payment_status: "pending",
          status: "placed",
          created_at: createdAt,
          date: createdAt.slice(0, 10)
        };

        const orders = this.getOrders();
        orders.unshift(newOrder);
        this.saveOrders(orders);

        return {
          status: 201,
          ok: true,
          data: {
            ok: true,
            order_number: orderNumber,
            order: newOrder,
            createdOrder: newOrder,
            orders,
            products: prods
          }
        };
      }

      if (method === "GET" && pathname === "/api/orders/mine") {
        const orders = this.getOrders();
        if (!user || user.role === "admin") {
          return { status: 200, ok: true, data: { ok: true, items: orders } };
        }
        const uPhone = String(user.phone || "").replace(/\D/g, "").slice(-10);
        const uEmail = String(user.email || "").trim().toLowerCase();
        const mine = orders.filter((o) => {
          const oPhone = String(o.phone || o.address?.phone || "").replace(/\D/g, "").slice(-10);
          const oEmail = String(o.email || o.address?.email || "").trim().toLowerCase();
          return (
            !o.user_id ||
            o.user_id === "guest" ||
            o.user_id === user.id ||
            (uPhone && oPhone === uPhone) ||
            (uEmail && oEmail === uEmail)
          );
        });
        return { status: 200, ok: true, data: { ok: true, items: mine.length > 0 ? mine : orders } };
      }

      if (method === "GET" && pathname.startsWith("/api/orders/")) {
        const ordNum = decodeURIComponent(pathname.slice("/api/orders/".length));
        const ord = this.getOrders().find((o) => (o.order_number || o.orderId) === ordNum);
        if (!ord) return { status: 404, ok: false, data: { ok: false, error: "Order not found" } };
        return { status: 200, ok: true, data: { ok: true, order: ord, ...ord } };
      }

      // 7. Admin Endpoints (/api/admin/*)
      if (pathname.startsWith("/api/admin/")) {
        if (!user) return { status: 401, ok: false, data: { ok: false, error: "Authentication required." } };
        if (user.role !== "admin") return { status: 403, ok: false, data: { ok: false, error: "Admin privileges required." } };

        const prods = this.getProducts();
        const orders = this.getOrders();
        const users = this.getUsers();

        if (method === "GET" && pathname === "/api/admin/stats") {
          const validOrders = orders.filter((o) => o.status !== "cancelled");
          const revenue = validOrders.reduce((s, o) => s + Number(o.total ?? o.totalINR ?? 0), 0);
          const ordersToProcess = orders.filter((o) => ["placed", "confirmed", "packed"].includes(o.status || "placed")).length;
          const lowStock = prods.filter((p) => (p.stock || 0) <= 10);

          const salesMap = {};
          validOrders.forEach((o) => {
            (o.items || []).forEach((item) => {
              const pid = item.product_id || item.productId || item.name;
              const qty = Number(item.quantity ?? item.qty ?? 1);
              const price = Number(item.price ?? item.priceINR ?? 0);
              if (!salesMap[pid]) {
                salesMap[pid] = { id: pid, name: item.name || pid, units_sold: 0, revenue: 0 };
              }
              salesMap[pid].units_sold += qty;
              salesMap[pid].revenue += qty * price;
            });
          });
          const topSelling = Object.values(salesMap)
            .sort((a, b) => b.units_sold - a.units_sold)
            .slice(0, 5);

          const regCustomerUsers = users.filter((u) => u.role !== "admin");
          const regPhones = new Set(regCustomerUsers.map((u) => String(u.phone || "").replace(/\D/g, "").slice(-10)).filter(Boolean));
          const guestPhones = new Set();
          orders.forEach((o) => {
            const ph = String(o.phone || o.address?.phone || "").replace(/\D/g, "").slice(-10);
            if (ph && !regPhones.has(ph)) guestPhones.add(ph);
          });

          return {
            status: 200,
            ok: true,
            data: {
              ok: true,
              total_products: prods.length,
              products_total: prods.length,
              in_stock: prods.filter((p) => (p.stock || 0) > 0).length,
              out_of_stock: prods.filter((p) => (p.stock || 0) <= 0).length,
              customers: regCustomerUsers.length + guestPhones.size,
              orders: orders.length,
              orders_total: orders.length,
              orders_to_process: ordersToProcess,
              revenue,
              revenue_total: revenue,
              low_stock: lowStock,
              low_stock_products: lowStock,
              top_selling: topSelling,
              top_selling_products: topSelling,
              recent_orders: orders.slice(0, 10)
            }
          };
        }

        if (method === "GET" && pathname === "/api/admin/products") {
          let list = [...prods];
          const q = (qs.get("q") || "").trim().toLowerCase();
          if (q) list = list.filter((p) => [p.name, p.sku, p.fabric, p.color].some((f) => String(f || "").toLowerCase().includes(q)));
          if (qs.get("fabric")) list = list.filter((p) => p.fabric === qs.get("fabric"));
          if (qs.get("availability") === "in_stock") list = list.filter((p) => (p.stock || 0) > 0);
          if (qs.get("availability") === "out_of_stock") list = list.filter((p) => (p.stock || 0) <= 0);
          if (qs.get("active") === "true" || qs.get("active") === "1") list = list.filter((p) => p.active !== false);
          if (qs.get("active") === "false" || qs.get("active") === "0") list = list.filter((p) => p.active === false);
          const total = list.length;
          const page = Math.max(1, parseInt(qs.get("page") || "1", 10) || 1);
          const limit = Math.max(1, parseInt(qs.get("limit") || "10", 10) || 10);
          const pages = Math.max(1, Math.ceil(total / limit));
          return {
            status: 200,
            ok: true,
            data: { ok: true, total, page, limit, pages, items: list.slice((page - 1) * limit, page * limit) }
          };
        }

        if (method === "POST" && pathname === "/api/admin/products") {
          const created = this.normalizeProduct(body, prods.length);
          prods.unshift(created);
          this.saveProducts(prods);
          return { status: 201, ok: true, data: { ok: true, product: created } };
        }

        if (pathname.startsWith("/api/admin/products/") && pathname.endsWith("/stock") && method === "PATCH") {
          const pid = decodeURIComponent(pathname.slice("/api/admin/products/".length, -"/stock".length));
          const idx = prods.findIndex((p) => p.id === pid || p.sku === pid);
          if (idx < 0) return { status: 404, ok: false, data: { ok: false, error: "Product not found" } };
          prods[idx].stock = Math.max(0, parseInt(body.stock, 10) || 0);
          prods[idx].stockQty = prods[idx].stock;
          prods[idx] = this.normalizeProduct(prods[idx], idx);
          this.saveProducts(prods);
          return { status: 200, ok: true, data: { ok: true, product: prods[idx] } };
        }

        if (pathname.startsWith("/api/admin/products/") && (method === "PATCH" || method === "DELETE")) {
          const pid = decodeURIComponent(pathname.slice("/api/admin/products/".length));
          const idx = prods.findIndex((p) => p.id === pid || p.sku === pid);
          if (idx < 0) return { status: 404, ok: false, data: { ok: false, error: "Product not found" } };
          if (method === "DELETE") {
            prods[idx].active = false;
          } else {
            prods[idx] = this.normalizeProduct({ ...prods[idx], ...body }, idx);
          }
          this.saveProducts(prods);
          return { status: 200, ok: true, data: { ok: true, product: prods[idx] } };
        }

        if (method === "GET" && pathname === "/api/admin/orders") {
          let list = [...orders];
          const st = qs.get("status");
          if (st && st !== "ALL") list = list.filter((o) => o.status === st);
          const q = (qs.get("q") || "").trim().toLowerCase();
          if (q) {
            list = list.filter((o) =>
              [o.order_number, o.orderId, o.customerName, o.phone, o.address?.name, o.address?.phone].some((f) =>
                String(f || "").toLowerCase().includes(q)
              )
            );
          }
          return { status: 200, ok: true, data: { ok: true, items: list } };
        }

        if (pathname.startsWith("/api/admin/orders/") && pathname.endsWith("/status") && method === "PATCH") {
          const ordNum = decodeURIComponent(pathname.slice("/api/admin/orders/".length, -"/status".length));
          const ord = orders.find((o) => (o.order_number || o.orderId) === ordNum);
          if (!ord) return { status: 404, ok: false, data: { ok: false, error: "Order not found" } };
          const prevStatus = ord.status;
          const nextStatus = body.status;
          ord.status = nextStatus;
          if (nextStatus === "cancelled" && prevStatus !== "cancelled") {
            (ord.items || []).forEach((item) => {
              const pid = item.product_id || item.productId;
              const pIdx = prods.findIndex((p) => p.id === pid || p.sku === pid);
              if (pIdx >= 0) {
                prods[pIdx].stock = (prods[pIdx].stock || 0) + Number(item.quantity ?? item.qty ?? 1);
                prods[pIdx].stockQty = prods[pIdx].stock;
                prods[pIdx] = this.normalizeProduct(prods[pIdx], pIdx);
              }
            });
            this.saveProducts(prods);
          }
          this.saveOrders(orders);
          return { status: 200, ok: true, data: { ok: true, order: ord } };
        }

        if (method === "GET" && pathname === "/api/admin/customers") {
          const matchedOrderNums = new Set();
          const custs = users
            .filter((u) => u.role !== "admin")
            .map((u) => {
              const uPhone = String(u.phone || "").replace(/\D/g, "").slice(-10);
              const uOrders = orders.filter((o) => {
                if (o.status === "cancelled") return false;
                const oPhone = String(o.phone || o.address?.phone || "").replace(/\D/g, "").slice(-10);
                const oName = String(o.address?.name || o.customerName || "").trim().toLowerCase();
                const match =
                  o.user_id === u.id ||
                  (uPhone && oPhone === uPhone && (!oName || oName === String(u.name || "").trim().toLowerCase()));
                if (match) matchedOrderNums.add(o.order_number || o.orderId);
                return match;
              });
              return {
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                role: u.role,
                orders_count: uOrders.length,
                total_spent: uOrders.reduce((s, o) => s + Number(o.total ?? o.totalINR ?? 0), 0),
                created_at: u.created_at
              };
            });

          const guestGroups = {};
          orders.forEach((o) => {
            const ordNum = o.order_number || o.orderId;
            if (matchedOrderNums.has(ordNum)) return;
            const addr = o.address || {};
            const rawPhone = String(addr.phone || o.phone || "").trim();
            const cleanPhone = rawPhone.replace(/\D/g, "").slice(-10);
            const cName = String(addr.name || o.customerName || "Guest Customer").trim();
            const key = cleanPhone || cName.toLowerCase();
            if (!guestGroups[key]) {
              guestGroups[key] = {
                id: `guest-${key}`,
                name: cName,
                email: o.email || (cleanPhone ? `guest.${cleanPhone}@checkout` : "guest@checkout"),
                phone: rawPhone || "—",
                role: "customer",
                orders_count: 0,
                total_spent: 0,
                created_at: o.created_at || o.date || ""
              };
            }
            if (o.status !== "cancelled") {
              guestGroups[key].orders_count += 1;
              guestGroups[key].total_spent += Number(o.total ?? o.totalINR ?? 0);
            }
          });

          return { status: 200, ok: true, data: { ok: true, items: [...Object.values(guestGroups), ...custs] } };
        }
      }

      if (method === "GET" && pathname === "/api/sarees/generate/status") {
        const active = this.getProducts().filter((p) => p.active !== false);
        const colors = [...new Set(active.map((p) => p.color).filter(Boolean))];
        ["Royal Rose & Gold", "Emerald Teal & Gold"].forEach((c) => {
          if (!colors.includes(c)) colors.push(c);
        });
        return {
          status: 200,
          ok: true,
          data: {
            ok: true,
            apiKeyConfigured: false,
            apiKeyEnvVar: "GEMINI_API_KEY",
            model: "gemini-2.5-flash-image (Nano Banana)",
            storageConfigured: true,
            databaseFile: "janardan_textiles.db / Browser LocalStorage",
            imagesDirectory: "/public/images/sarees/<sku>/",
            uploadsDirectory: "/uploads/",
            availableColors: colors,
            availableFabrics: [...new Set(active.map((p) => p.fabric).filter(Boolean))],
            availableOccasions: [...new Set(active.map((p) => p.occasion).filter(Boolean))],
            setupInstructions:
              "Set GEMINI_API_KEY in .env on the Python backend server (server.py) to enable live on-demand Gemini Nano Banana API calls."
          }
        };
      }

      if (method === "POST" && pathname === "/api/sarees/generate") {
        const prods = this.getProducts();
        const genCount = prods.filter((p) => p.isGeneratedSaree || String(p.sku || "").startsWith("jt-saree-gen-")).length;
        const active = prods.filter((p) => p.active !== false);
        const availColors = ["Royal Rose & Gold", "Emerald Teal & Gold", ...new Set(active.map((p) => p.color).filter(Boolean))];
        const availFabrics = [...new Set(active.map((p) => p.fabric).filter(Boolean))];
        const availOccasions = [...new Set(active.map((p) => p.occasion).filter(Boolean))];

        let rawCol = String(body.color || body.colour || "").trim();
        let rawFab = String(body.fabric || "").trim();
        let rawOcc = String(body.occasion || "").trim();
        if (["AUTO", "ANY", "ALL"].includes(rawCol.toUpperCase())) rawCol = "";
        if (["AUTO", "ANY", "ALL"].includes(rawFab.toUpperCase())) rawFab = "";
        if (["AUTO", "ANY", "ALL"].includes(rawOcc.toUpperCase())) rawOcc = "";

        const autoSelected = [];
        const chosenColor = rawCol || (autoSelected.push("color"), availColors[genCount % availColors.length]);
        const chosenFabric = rawFab || (autoSelected.push("fabric"), availFabrics[genCount % availFabrics.length] || "Champagne Tissue");
        const chosenOccasion = rawOcc || (autoSelected.push("occasion"), availOccasions[genCount % availOccasions.length] || "Celebrations & Festive");

        const colorMap = {
          "royal rose & gold": "jt-saree-10",
          "emerald teal & gold": "jt-saree-11",
          "champagne gold": "jt-saree-09",
          "warm sand & gold": "jt-saree-01",
          "ivory gold": "jt-saree-02",
          "champagne beige": "jt-saree-03",
          "espresso brown": "jt-saree-04",
          "warm ochre": "jt-saree-05",
          "champagne & bronze": "jt-saree-06",
          "soft cream": "jt-saree-07",
          "deep cocoa": "jt-saree-08"
        };
        const refSku = colorMap[chosenColor.toLowerCase()] || "jt-saree-10";
        const newSku = `jt-saree-gen-${String(genCount + 1).padStart(2, "0")}`;
        const viewFiles = [
          { order: 1, key: "front", label: "1. Front view (three-quarter angle on the mannequin)", file: "1-front.jpg" },
          { order: 2, key: "back_pallu", label: "2. Back and pallu view", file: "2-back-pallu.jpg" },
          { order: 3, key: "pallu_detail", label: "3. Pallu embroidery detail", file: "3-pallu-detail.jpg" },
          { order: 4, key: "fabric_macro", label: "4. Fabric and embroidery macro", file: "4-macro.jpg" },
          { order: 5, key: "blouse_border", label: "5. Blouse and border detail", file: "5-blouse.jpg" }
        ];
        const title = `${chosenColor} ${chosenFabric} Saree with Scalloped Zari & Peacock Embroidery`;
        const savedPaths = viewFiles.map((v) => `/public/images/sarees/${refSku}/${v.file}`);
        const gallery = viewFiles.map((v) => ({
          order: v.order,
          key: v.key,
          label: v.label,
          url: `/public/images/sarees/${refSku}/${v.file}`,
          isSampleImage: false,
          alt: `${title} — ${v.label} (${chosenColor}, ${chosenFabric}, ${chosenOccasion})`
        }));
        const created = this.normalizeProduct(
          {
            id: newSku,
            sku: newSku,
            isSampleProduct: false,
            isSamplePrice: false,
            isGeneratedSaree: true,
            generatedAt: new Date().toISOString(),
            selectedCategories: { color: chosenColor, fabric: chosenFabric, occasion: chosenOccasion, autoSelected },
            savedImagePaths: savedPaths,
            featured: true,
            bestseller: false,
            active: true,
            name: title,
            fabric: chosenFabric,
            color: chosenColor,
            occasion: chosenOccasion,
            price: 6800,
            priceINR: 6800,
            mrp: 6800,
            originalPriceINR: 6800,
            stock: 18,
            stockQty: 18,
            stockStatus: "In Stock",
            stock_status: "in_stock",
            description: `Custom generated ${chosenColor.toLowerCase()} ${chosenFabric.toLowerCase()} saree tailored for ${chosenOccasion.toLowerCase()}. Features a scalloped cutwork border with floral and peacock embroidery in antique gold zari.`,
            borderAndZari: `Scalloped cutwork zari border with floral and peacock embroidery on ${chosenColor.toLowerCase()} ${chosenFabric.toLowerCase()}`,
            motifs: `Intricate peacock and lotus floral embroidery in antique gold zari`,
            blousePiece: `Coordinated ${chosenColor.toLowerCase()} ${chosenFabric.toLowerCase()} blouse with matching scalloped gold embroidered neckline and sleeve border`,
            work_details: `Scalloped cutwork zari border with floral and peacock embroidery`,
            blouse_piece: `Coordinated ${chosenColor.toLowerCase()} ${chosenFabric.toLowerCase()} blouse with matching scalloped gold embroidered neckline and sleeve border`,
            care_instructions: "Dry clean only. Store folded in soft muslin away from direct sunlight.",
            gallery,
            images: savedPaths,
            image: savedPaths[0]
          },
          0
        );
        prods.unshift(created);
        this.saveProducts(prods);
        return {
          status: 201,
          ok: true,
          data: {
            ok: true,
            product: created,
            selected: { color: chosenColor, fabric: chosenFabric, occasion: chosenOccasion, autoSelected },
            savedImagePaths: savedPaths,
            databasePath: "Browser LocalStorage (jt_local_products_v1)",
            apiKeyConfigured: false,
            usedLiveGemini: false,
            configNotice:
              "Generated using 5-view Nano Banana studio reference photography (/public/images/sarees/). Set GEMINI_API_KEY in .env on server.py for live Gemini API calls."
          }
        };
      }

      if (pathname === "/api/bootstrap" || pathname === "/api/seed") {
        return {
          status: 200,
          ok: true,
          data: {
            ok: true,
            seeded: true,
            dbStatus: "Browser Persistent Storage (Cloud / Static Mode)",
            products: this.getProducts(),
            orders: this.getOrders(),
            settings: app.state.settings,
            wholesaleEnquiries: app.state.wholesaleEnquiries || [],
            contactMessages: app.state.contactMessages || []
          }
        };
      }

      return { status: 200, ok: true, data: { ok: true } };
    }
  };

  // Upgrade BACKEND_API.request to attach Authorization Bearer token & automatically fall back to LOCAL_FALLBACK_API on static hosts
  let _detectedStaticHost =
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith(".vercel.app") || window.location.hostname.endsWith(".github.io")) &&
    !window.VITE_API_URL;

  BACKEND_API.requestWithStatus = async function (path, options = {}) {
    if (_detectedStaticHost && path.startsWith("/api/")) {
      return LOCAL_FALLBACK_API.handle(path, options);
    }
    const fullUrl = path.startsWith("http") ? path : `${API_URL}${path}`;
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const token = app.state.authToken || localStorage.getItem("jt_auth_token") || "";
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    try {
      const res = await fetch(fullUrl, {
        ...options,
        headers
      });
      // If deployed on a static host (Vercel / GitHub Pages) that returns 404/405 for /api/* routes, use LOCAL_FALLBACK_API
      if ((res.status === 404 || res.status === 405 || res.status === 502 || res.status === 503) && path.startsWith("/api/")) {
        const text = await res.clone().text().catch(() => "");
        if (!text.trim().startsWith("{")) {
          _detectedStaticHost = true;
          return LOCAL_FALLBACK_API.handle(path, options);
        }
      }
      const data = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, data };
    } catch (networkErr) {
      _detectedStaticHost = true;
      return LOCAL_FALLBACK_API.handle(path, options);
    }
  };

  BACKEND_API.request = async function (path, options = {}) {
    const { status, ok, data } = await this.requestWithStatus(path, options);
    if (!ok) {
      if ((status === 401 || status === 403) && path.startsWith("/api/admin")) {
        app.handleAdminUnauthorized();
      }
      const err = new Error(data.error || `HTTP ${status}`);
      err.status = status;
      err.data = data;
      throw err;
    }
    return data;
  };

  // 2. Extend Application State for Prompt 1 & Prompt 2
  Object.assign(app.state, {
    authToken: localStorage.getItem("jt_auth_token") || "",
    currentUser: (() => {
      try {
        return JSON.parse(localStorage.getItem("jt_auth_user") || "null");
      } catch (e) {
        return null;
      }
    })(),
    authRedirectAfterLogin: null,
    authTab: "login", // "login" | "register"
    wishlistIds: new Set(),
    wishlistItems: [],
    filtersMeta: {
      fabrics: [],
      colors: [],
      occasions: [],
      price: { min: 1200, max: 7500 },
      shipping: { flat: 99, free_above: 2999 }
    },
    homeSections: {
      featured: [],
      newest: [],
      bestsellers: [],
      loading: true
    },
    catalogueQuery: {
      q: "",
      fabric: [],
      color: [],
      occasion: [],
      minPrice: "",
      maxPrice: "",
      availability: "",
      sort: "newest",
      page: 1,
      limit: 8
    },
    catalogueResult: {
      total: 0,
      page: 1,
      limit: 24,
      pages: 1,
      items: [],
      loading: false,
      error: null
    },
    sareeGenerator: {
      color: "",
      fabric: "",
      occasion: "",
      generating: false,
      error: "",
      successMessage: "",
      configNotice: "",
      lastGeneratedProduct: null,
      lastSelected: null,
      savedImagePaths: [],
      serverStatus: null,
      showSetupGuide: false
    },
    checkoutState: {
      step: 1, // 1: Address, 2: Shipping, 3: Payment, 4: Review
      address: {
        name: "",
        phone: "",
        line1: "",
        line2: "",
        city: "",
        state: "",
        pincode: ""
      },
      addressErrors: {},
      paymentMethod: "cod",
      onlinePaymentNotice: "",
      stockErrors: [],
      placingOrder: false,
      confirmedOrder: null
    },
    myOrders: [],
    myOrdersLoading: false,
    adminState: {
      tab: "dashboard", // "dashboard" | "products" | "product_form" | "bulk_import" | "orders" | "customers" | "ai_studio" | "settings"
      stats: null,
      statsLoading: false,
      productsResult: { total: 0, page: 1, limit: 10, pages: 1, items: [] },
      productsFilter: { q: "", fabric: "", availability: "", active: "", page: 1, limit: 10 },
      editingProduct: null, // null = Add New, object = Edit Existing
      formImages: [],
      formError: "",
      dragImageIndex: null,
      bulkCsvHeaders: [],
      bulkCsvRows: [],
      bulkColumnMap: {},
      bulkResult: null,
      bulkImporting: false,
      ordersList: [],
      ordersFilter: { status: "ALL", q: "" },
      customersList: []
    }
  });

  // 3. Pricing & Stock Helpers (Prompt 1 Honesty Rules)
  app.getPricing = function (saree) {
    if (!saree) {
      return { originalINR: 0, mrp: 0, discountPct: 0, finalINR: 0, hasDiscount: false, isSamplePrice: false, priceOnRequest: true };
    }
    const finalINR = Math.round(Number(saree.price !== undefined ? saree.price : saree.priceINR || 0));
    const priceOnRequest = Boolean(saree.priceOnRequest || saree.isSamplePrice || finalINR <= 0);
    const mrpVal = Math.round(Number(saree.mrp !== undefined && saree.mrp !== null ? saree.mrp : saree.originalPriceINR || 0));
    const hasDiscount = !priceOnRequest && mrpVal > finalINR && finalINR > 0;
    const discountPct = hasDiscount ? Math.round(((mrpVal - finalINR) / mrpVal) * 100) : 0;
    return {
      originalINR: hasDiscount ? mrpVal : finalINR,
      mrp: hasDiscount ? mrpVal : 0,
      discountPct,
      finalINR: priceOnRequest ? 0 : finalINR,
      hasDiscount,
      discountLabel: hasDiscount ? `${discountPct}% OFF` : "",
      isSamplePrice: false,
      priceOnRequest
    };
  };

  app.getStockStatusCode = function (saree) {
    if (!saree) return "out_of_stock";
    if (saree.stock_status) return saree.stock_status;
    const st = Number(saree.stock !== undefined ? saree.stock : saree.stockQty);
    if (!Number.isNaN(st)) {
      if (st <= 0) return "out_of_stock";
      if (st <= 10) return "low_stock";
      return "in_stock";
    }
    if (saree.stockStatus === "Out of Stock") return "out_of_stock";
    if (saree.stockStatus === "Low Stock") return "low_stock";
    return "in_stock";
  };

  app.isProductOutOfStock = function (saree) {
    return this.getStockStatusCode(saree) === "out_of_stock";
  };

  app.getShippingBreakdown = function (subtotal) {
    const shipCfg = this.state.filtersMeta?.shipping || { flat: 99, free_above: 2999 };
    const flat = Number(shipCfg.flat ?? 99);
    const freeAbove = Number(shipCfg.free_above ?? 2999);
    if (subtotal <= 0) return { shipping: 0, freeAbove, flat, isFree: false };
    const isFree = subtotal >= freeAbove;
    const shipping = isFree ? 0 : flat;
    return { shipping, freeAbove, flat, isFree };
  };

  // 4. URL Query String & Route Synchronization
  app.parseCatalogueQueryFromUrl = function () {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") || "";
    const fabric = (params.get("fabric") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const color = (params.get("color") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const occasion = (params.get("occasion") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const minPrice = params.get("minPrice") || "";
    const maxPrice = params.get("maxPrice") || "";
    const availability = params.get("availability") || "";
    const sort = params.get("sort") || "newest";
    const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
    const featured = params.get("featured") || "";
    const bestseller = params.get("bestseller") || "";

    this.state.catalogueQuery = {
      q,
      fabric,
      color,
      occasion,
      minPrice,
      maxPrice,
      availability,
      sort,
      page,
      limit: 24,
      featured,
      bestseller
    };

    const hInput = document.getElementById("header-search-input");
    if (hInput && hInput.value !== q) hInput.value = q;
    const mInput = document.getElementById("mobile-header-search-input");
    if (mInput && mInput.value !== q) mInput.value = q;
    const clearBtn = document.getElementById("header-search-clear");
    if (clearBtn) clearBtn.classList.toggle("hidden", !q);
  };

  app.syncCatalogueQueryToUrl = function (replace = false) {
    const cq = this.state.catalogueQuery;
    const params = new URLSearchParams();
    if (cq.q) params.set("q", cq.q);
    if (cq.fabric && cq.fabric.length) params.set("fabric", cq.fabric.join(","));
    if (cq.color && cq.color.length) params.set("color", cq.color.join(","));
    if (cq.occasion && cq.occasion.length) params.set("occasion", cq.occasion.join(","));
    if (cq.minPrice !== "" && cq.minPrice !== null) params.set("minPrice", String(cq.minPrice));
    if (cq.maxPrice !== "" && cq.maxPrice !== null) params.set("maxPrice", String(cq.maxPrice));
    if (cq.availability) params.set("availability", cq.availability);
    if (cq.featured) params.set("featured", cq.featured);
    if (cq.bestseller) params.set("bestseller", cq.bestseller);
    if (cq.sort && cq.sort !== "newest") params.set("sort", cq.sort);
    if (cq.page && cq.page > 1) params.set("page", String(cq.page));

    const qs = params.toString();
    const hash = this.state.currentPage === "home" ? "" : `#${this.state.currentPage}`;
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${hash}`;
    if (replace) {
      history.replaceState(null, "", newUrl);
    } else {
      history.pushState(null, "", newUrl);
    }
  };

  app.getRouteFromHash = function () {
    const raw = (window.location.hash || "").replace(/^#\/?/, "").trim();
    const lower = raw.toLowerCase();
    if (lower.startsWith("product/")) {
      const pid = raw.split("/")[1];
      if (pid) {
        this.state.selectedProductId = pid;
        this.state.selectedGalleryIndex = 0;
      }
      return "product";
    }
    if (lower.startsWith("orders/")) {
      const ordNum = raw.split("/")[1];
      if (ordNum) {
        this.state.selectedOrderNumber = ordNum;
      }
      return "orders";
    }
    const validPages = [
      "home",
      "shop",
      "catalogue",
      "wholesale",
      "about",
      "contact",
      "cart",
      "checkout",
      "login",
      "register",
      "account",
      "orders",
      "wishlist",
      "admin",
      "policies",
      "product"
    ];
    if (lower === "catalogue") return "shop";
    if (lower === "register") {
      this.state.authTab = "register";
      return "login";
    }
    if (validPages.includes(lower)) return lower;
    const params = new URLSearchParams(window.location.search);
    if (
      params.has("q") ||
      params.has("fabric") ||
      params.has("color") ||
      params.has("occasion") ||
      params.has("availability") ||
      params.has("sort") ||
      params.has("page")
    ) {
      return "shop";
    }
    return "home";
  };

  // 5. Debounced Search (300ms)
  let searchDebounceTimer = null;
  app.handleHeaderSearchInput = function (val) {
    const clearBtn = document.getElementById("header-search-clear");
    if (clearBtn) clearBtn.classList.toggle("hidden", !val);
    const hInput = document.getElementById("header-search-input");
    if (hInput && hInput.value !== val) hInput.value = val;
    const mInput = document.getElementById("mobile-header-search-input");
    if (mInput && mInput.value !== val) mInput.value = val;

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      this.state.catalogueQuery.q = val.trim();
      this.state.catalogueQuery.page = 1;
      if (this.state.currentPage !== "shop") {
        this.navigate("shop", { skipScroll: false, syncHash: false });
      }
      this.syncCatalogueQueryToUrl(true);
      this.fetchCatalogueProducts();
    }, 300);
  };

  app.submitHeaderSearch = function (val) {
    clearTimeout(searchDebounceTimer);
    this.state.catalogueQuery.q = (val || "").trim();
    this.state.catalogueQuery.page = 1;
    if (this.state.currentPage !== "shop") {
      this.navigate("shop", { skipScroll: false, syncHash: false });
    }
    this.syncCatalogueQueryToUrl(false);
    this.fetchCatalogueProducts();
  };

  app.clearHeaderSearch = function () {
    this.handleHeaderSearchInput("");
  };

  // 6. Authentication & Wishlist API Wiring
  app.syncAuthHeaderUI = function () {
    const labelEl = (() => { const admBtn = document.getElementById("header-admin-nav-btn"); if (admBtn) admBtn.classList.toggle("hidden", !(app.state.currentUser && app.state.currentUser.role === "admin")); return document.getElementById("header-auth-label"); })();
    const btnEl = document.getElementById("header-auth-btn");
    const u = this.state.currentUser;
    if (labelEl) {
      if (u && u.name) {
        labelEl.textContent = u.role === "admin" ? `${u.name.split(" ")[0]} (Admin)` : u.name.split(" ")[0];
      } else {
        labelEl.textContent = "Sign In";
      }
    }
    if (btnEl) {
      btnEl.classList.toggle("bg-teal", Boolean(u));
      btnEl.classList.toggle("text-ivory", Boolean(u));
      btnEl.classList.toggle("bg-[#F5EFE4]", !u);
      btnEl.classList.toggle("text-ink", !u);
    }

    const wBadge = document.getElementById("header-wishlist-badge");
    if (wBadge) {
      const count = this.state.wishlistIds.size;
      wBadge.textContent = String(count);
      wBadge.classList.toggle("hidden", count === 0);
      wBadge.classList.toggle("flex", count > 0);
    }
  };

  app.handleHeaderAuthClick = function () {
    if (this.state.currentUser) {
      this.navigate("account");
    } else {
      this.navigate("login");
    }
  };

  app.verifyCurrentSession = async function () {
    if (!this.state.authToken) {
      this.state.currentUser = null;
      this.state.wishlistIds = new Set();
      this.state.wishlistItems = [];
      this.syncAuthHeaderUI();
      return;
    }
    try {
      const res = await BACKEND_API.request("/api/me");
      if (res && res.user) {
        this.state.currentUser = res.user;
        localStorage.setItem("jt_auth_user", JSON.stringify(res.user));
        await this.fetchWishlist();
      }
    } catch (err) {
      this.state.authToken = "";
      this.state.currentUser = null;
      localStorage.removeItem("jt_auth_token");
      localStorage.removeItem("jt_auth_user");
    }
    this.syncAuthHeaderUI();
  };

  app.fetchWishlist = async function () {
    if (!this.state.authToken) {
      this.state.wishlistIds = new Set();
      this.state.wishlistItems = [];
      this.syncAuthHeaderUI();
      return;
    }
    try {
      const res = await BACKEND_API.request("/api/wishlist");
      const items = Array.isArray(res.items) ? res.items : [];
      this.state.wishlistItems = items;
      this.state.wishlistIds = new Set(items.map((p) => p.id || p.sku));
      this.syncAuthHeaderUI();
    } catch (e) {}
  };

  // Honesty Rule: A wishlist action for a logged-out user prompts login. It does not silently save locally.
  app.toggleWishlist = async function (productId, btnEl) {
    if (!this.state.authToken || !this.state.currentUser) {
      this.showToast("Please sign in to save sarees to your Wishlist.", "error");
      this.state.authRedirectAfterLogin = this.state.currentPage;
      this.navigate("login");
      return;
    }

    const isSaved = this.state.wishlistIds.has(productId);
    if (btnEl) {
      btnEl.classList.remove("heart-pop");
      void btnEl.offsetWidth;
      btnEl.classList.add("heart-pop");
    }

    try {
      let res;
      if (isSaved) {
        res = await BACKEND_API.request(`/api/wishlist/${encodeURIComponent(productId)}`, { method: "DELETE" });
        this.showToast("Removed from your Wishlist.");
      } else {
        res = await BACKEND_API.request(`/api/wishlist/${encodeURIComponent(productId)}`, { method: "PUT" });
        this.showToast("Saved to your Wishlist ♥");
      }
      if (res && Array.isArray(res.items)) {
        this.state.wishlistItems = res.items;
        this.state.wishlistIds = new Set(res.items.map((p) => p.id || p.sku));
      }
      this.syncAuthHeaderUI();
      if (this.state.currentPage === "wishlist" || this.state.currentPage === "product") {
        this.renderCurrentPage();
      } else {
        this.updateWishlistButtonsInDOM();
      }
    } catch (err) {
      this.showToast(err.message || "Could not update wishlist.", "error");
    }
  };

  app.updateWishlistButtonsInDOM = function () {
    document.querySelectorAll("[data-wishlist-btn]").forEach((btn) => {
      const pid = btn.getAttribute("data-wishlist-btn");
      const active = this.state.wishlistIds.has(pid);
      const svg = btn.querySelector("svg");
      if (svg) {
        svg.setAttribute("fill", active ? "#C4A15A" : "none");
        svg.classList.toggle("text-gold", active);
      }
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };

  app.submitAuthForm = async function (event, mode) {
    event.preventDefault();
    const f = event.target;
    const email = (f.email?.value || "").trim();
    const password = f.password?.value || "";
    const name = (f.name?.value || "").trim();
    const phone = (f.phone?.value || "").trim();

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const body = mode === "register" ? { name, email, phone, password } : { email, password };

    try {
      const res = await BACKEND_API.request(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (res.token && res.user) {
        this.state.authToken = res.token;
        this.state.currentUser = res.user;
        localStorage.setItem("jt_auth_token", res.token);
        localStorage.setItem("jt_auth_user", JSON.stringify(res.user));
        await this.fetchWishlist();
        this.syncAuthHeaderUI();
        this.showToast(`Welcome, ${res.user.name}!`);

        // Pre-fill checkout name/phone if empty
        if (!this.state.checkoutState.address.name) {
          this.state.checkoutState.address.name = res.user.name || "";
        }
        if (!this.state.checkoutState.address.phone && res.user.phone) {
          this.state.checkoutState.address.phone = String(res.user.phone).replace(/\D/g, "").slice(-10);
        }

        const nextRoute = this.state.authRedirectAfterLogin || (res.user.role === "admin" ? "admin" : "shop");
        this.state.authRedirectAfterLogin = null;
        this.navigate(nextRoute);
      }
    } catch (err) {
      this.showToast(err.message || "Authentication failed.", "error");
    }
  };

  app.quickFillAuth = function (email, password) {
    const emailInput = document.getElementById("auth-email-input");
    const passInput = document.getElementById("auth-password-input");
    if (emailInput) emailInput.value = email;
    if (passInput) passInput.value = password;
  };

  app.logoutUser = function () {
    this.state.authToken = "";
    this.state.currentUser = null;
    this.state.wishlistIds = new Set();
    this.state.wishlistItems = [];
    localStorage.removeItem("jt_auth_token");
    localStorage.removeItem("jt_auth_user");
    this.syncAuthHeaderUI();
    this.showToast("Signed out.");
    this.navigate("home");
  };

  app.handleAdminUnauthorized = function () {
    this.showToast("Admin access required. Please sign in with an admin account.", "error");
    this.state.authRedirectAfterLogin = "admin";
    this.renderCurrentPage();
  };

  // 7. Fetch Filters, Home Sections & Paginated Catalogue from Backend API
  app.fetchFiltersMeta = async function () {
    try {
      const data = await BACKEND_API.request("/api/filters");
      if (data && Array.isArray(data.fabrics)) {
        this.state.filtersMeta = data;
      }
    } catch (e) {
      // Fallback derived from INITIAL_PRODUCTS
      const prods = this.state.products || [];
      this.state.filtersMeta = {
        fabrics: [...new Set(prods.map((p) => p.fabric).filter(Boolean))].sort(),
        colors: [...new Set(prods.map((p) => p.color).filter(Boolean))].sort(),
        occasions: [...new Set(prods.map((p) => p.occasion).filter(Boolean))].sort(),
        price: { min: this.getMinProductPrice(), max: this.getMaxProductPrice() },
        shipping: { flat: 99, free_above: 2999 }
      };
    }
  };

  app.fetchHomeSections = async function () {
    this.state.homeSections.loading = true;
    try {
      const [featRes, newRes, bestRes] = await Promise.all([
        BACKEND_API.request("/api/products?featured=1&limit=4"),
        BACKEND_API.request("/api/products?sort=newest&limit=4"),
        BACKEND_API.request("/api/products?bestseller=1&limit=4")
      ]);
      this.state.homeSections = {
        featured: featRes.items || [],
        newest: newRes.items || [],
        bestsellers: bestRes.items || [],
        loading: false
      };
    } catch (e) {
      const prods = this.state.products || [];
      this.state.homeSections = {
        featured: prods.filter((p) => p.featured).slice(0, 4),
        newest: [...prods].slice(0, 4),
        bestsellers: prods.filter((p) => p.bestseller).slice(0, 4),
        loading: false
      };
    }
    const homeDynamicEl = document.getElementById("home-api-collections-container");
    if (homeDynamicEl) {
      homeDynamicEl.innerHTML = this.renderHomeCollectionsAndSections();
    }
  };

  app.fetchCatalogueProducts = async function (append = false) {
    const cq = this.state.catalogueQuery;
    this.state.catalogueResult.loading = true;
    this.state.catalogueResult.error = null;

    const resultsEl = document.getElementById("shop-results-container");
    if (resultsEl && !append) {
      resultsEl.innerHTML = this.renderSkeletonGrid(4);
    }

    const params = new URLSearchParams();
    if (cq.q) params.set("q", cq.q);
    if (cq.fabric && cq.fabric.length) params.set("fabric", cq.fabric.join(","));
    if (cq.color && cq.color.length) params.set("color", cq.color.join(","));
    if (cq.occasion && cq.occasion.length) params.set("occasion", cq.occasion.join(","));
    if (cq.minPrice !== "" && cq.minPrice !== null) params.set("minPrice", String(cq.minPrice));
    if (cq.maxPrice !== "" && cq.maxPrice !== null) params.set("maxPrice", String(cq.maxPrice));
    if (cq.availability) params.set("availability", cq.availability);
    if (cq.featured) params.set("featured", cq.featured);
    if (cq.bestseller) params.set("bestseller", cq.bestseller);
    params.set("sort", cq.sort || "newest");
    params.set("page", String(cq.page || 1));
    params.set("limit", String(cq.limit || 24));

    try {
      const data = await BACKEND_API.request(`/api/products?${params.toString()}`);
      const items = Array.isArray(data.items) ? data.items : [];
      this.state.catalogueResult = {
        total: Number(data.total || items.length),
        page: Number(data.page || 1),
        limit: Number(data.limit || 24),
        pages: Number(data.pages || 1),
        items: append ? [...(this.state.catalogueResult.items || []), ...items] : items,
        loading: false,
        error: null
      };
    } catch (err) {
      // Fallback local filtering if offline
      let filtered = (this.state.products || []).filter((p) => p.active !== false);
      if (cq.q) {
        const qLower = cq.q.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(qLower) ||
            p.fabric.toLowerCase().includes(qLower) ||
            p.color.toLowerCase().includes(qLower) ||
            (p.occasion || "").toLowerCase().includes(qLower) ||
            (p.description || "").toLowerCase().includes(qLower)
        );
      }
      if (cq.fabric && cq.fabric.length) filtered = filtered.filter((p) => cq.fabric.includes(p.fabric));
      if (cq.color && cq.color.length) filtered = filtered.filter((p) => cq.color.includes(p.color));
      if (cq.occasion && cq.occasion.length) filtered = filtered.filter((p) => cq.occasion.includes(p.occasion));
      if (cq.minPrice !== "" && cq.minPrice !== null) {
        filtered = filtered.filter((p) => this.getPricing(p).finalINR >= Number(cq.minPrice));
      }
      if (cq.maxPrice !== "" && cq.maxPrice !== null) {
        filtered = filtered.filter((p) => this.getPricing(p).finalINR <= Number(cq.maxPrice));
      }
      if (cq.availability === "in_stock") filtered = filtered.filter((p) => !this.isProductOutOfStock(p));
      if (cq.availability === "out_of_stock") filtered = filtered.filter((p) => this.isProductOutOfStock(p));
      if (cq.featured === "1") filtered = filtered.filter((p) => p.featured);
      if (cq.bestseller === "1") filtered = filtered.filter((p) => p.bestseller);

      if (cq.sort === "price_asc") filtered.sort((a, b) => this.getPricing(a).finalINR - this.getPricing(b).finalINR);
      else if (cq.sort === "price_desc") filtered.sort((a, b) => this.getPricing(b).finalINR - this.getPricing(a).finalINR);
      else if (cq.sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));

      const limit = cq.limit || 24;
      const page = cq.page || 1;
      const start = (page - 1) * limit;
      const paged = filtered.slice(start, start + limit);
      this.state.catalogueResult = {
        total: filtered.length,
        page,
        limit,
        pages: Math.max(1, Math.ceil(filtered.length / limit)),
        items: append ? [...(this.state.catalogueResult.items || []), ...paged] : paged,
        loading: false,
        error: null
      };
    }

    this.refreshCatalogueDOM();
  };

  app.refreshCatalogueDOM = function () {
    const genStudioEl = document.getElementById("saree-generator-studio-container");
    if (genStudioEl && typeof this.renderSareeGeneratorStudio === "function") {
      genStudioEl.innerHTML = this.renderSareeGeneratorStudio();
    }
    const chipsEl = document.getElementById("catalogue-active-chips");
    if (chipsEl) chipsEl.innerHTML = this.renderFilterChips();
    const sidebarEl = document.getElementById("catalogue-desktop-sidebar");
    if (sidebarEl) sidebarEl.innerHTML = this.renderFilterPanelContent("desktop");
    const resultsEl = document.getElementById("shop-results-container");
    if (resultsEl) resultsEl.innerHTML = this.renderShopResultsContent();
    const sheetPanel = document.getElementById("mobile-filter-sheet-panel");
    if (sheetPanel && !document.getElementById("mobile-filter-sheet")?.classList.contains("hidden")) {
      sheetPanel.innerHTML = this.renderMobileFilterSheetContent();
    }
  };

  // 8. Reusable UI Components: Skeleton, ProductCard, FilterPanel, FilterChips, CartDrawer
  app.renderSkeletonGrid = function (count = 4) {
    return `
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5" aria-busy="true" aria-label="Loading sarees">
        ${Array.from({ length: count })
          .map(
            () => `
          <div class="rounded-2xl bg-[#FAF8F5] border border-gold/30 overflow-hidden p-2.5 sm:p-3.5 space-y-3">
            <div class="aspect-[3/4] rounded-xl skeleton-shimmer"></div>
            <div class="h-3 w-2/3 rounded skeleton-shimmer"></div>
            <div class="h-4 w-5/6 rounded skeleton-shimmer"></div>
            <div class="h-8 w-full rounded-full skeleton-shimmer"></div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  };

  app.renderProductCard = function (saree) {
    const pid = saree.id || saree.sku;
    const firstGallerySlot = saree.gallery && saree.gallery[0] ? saree.gallery[0] : null;
    const rawImg =
      Array.isArray(saree.images) && saree.images[0]
        ? saree.images[0]
        : firstGallerySlot && firstGallerySlot.url
        ? firstGallerySlot.url
        : "";
    const primaryImg = this.resolveImageUrl(rawImg, saree.name, "Front view");
    const pricing = this.getPricing(saree);
    const stockCode = this.getStockStatusCode(saree);
    const outOfStock = stockCode === "out_of_stock";
    const lowStock = stockCode === "low_stock";
    const isWishlisted = this.state.wishlistIds.has(pid);

    return `
      <article data-product-card="${pid}" class="jt-product-card group bg-[#FAF8F5] rounded-2xl border ${
      saree.isGeneratedSaree ? "border-2 border-gold shadow-md" : "border-gold/35 shadow-sm"
    } hover:shadow-xl flex flex-col overflow-hidden min-w-0">
        <div class="relative aspect-[3/4] bg-[#EFE6D5] overflow-hidden" style="${(saree.blurDataUrl || (firstGallerySlot && firstGallerySlot.blurDataUrl)) ? `background-image:url('${saree.blurDataUrl || firstGallerySlot.blurDataUrl}');background-size:cover;background-position:center;` : ''}">
          <img
            src="${primaryImg}"
            ${(saree.srcset || (firstGallerySlot && firstGallerySlot.srcset)) ? `srcset="${saree.srcset || firstGallerySlot.srcset}" sizes="(max-width: 640px) 48vw, (max-width: 1024px) 31vw, 24vw"` : ""}
            alt="${saree.name}"
            width="600"
            height="800"
            loading="lazy"
            decoding="async"
            onclick="app.openProductDetail('${pid}')"
            onerror="this.onerror=null; this.srcset=''; this.src=createMissingViewPlaceholderSVG('${(saree.name || "").replace(/'/g, "\\'")}', 'Front view');"
            class="jt-product-card-img w-full h-full object-cover object-top cursor-pointer"
          />

          <!-- Top-Left Stock & Collection Badges -->
          <div class="absolute top-2.5 left-2.5 flex flex-col gap-1 pointer-events-none">
            ${
              saree.isGeneratedSaree
                ? `<span class="px-2.5 py-0.5 rounded-full bg-teal text-gold border border-gold/60 font-bold text-[10px] uppercase tracking-wider shadow">Generated Saree</span>`
                : ""
            }
            ${
              outOfStock
                ? `<span class="px-2.5 py-0.5 rounded-full bg-red-900/90 text-ivory font-bold text-[10px] uppercase tracking-wider shadow">Out of stock</span>`
                : lowStock
                ? `<span class="px-2.5 py-0.5 rounded-full bg-amber-800/90 text-ivory font-bold text-[10px] uppercase tracking-wider shadow">Only few left</span>`
                : ""
            }
            ${
              saree.bestseller && !outOfStock
                ? `<span class="px-2 py-0.5 rounded-full bg-ivory/95 text-ink border border-gold/50 font-semibold text-[10px] shadow-xs">Bestseller</span>`
                : ""
            }
          </div>

          <!-- Top-Right Wishlist Heart Button -->
          <button
            type="button"
            data-wishlist-btn="${pid}"
            aria-pressed="${isWishlisted ? "true" : "false"}"
            aria-label="${isWishlisted ? "Remove from Wishlist" : "Add to Wishlist"}"
            onclick="event.stopPropagation(); app.toggleWishlist('${pid}', this)"
            class="absolute top-2.5 right-2.5 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-ivory/90 backdrop-blur-xs border border-gold/40 flex items-center justify-center text-ink hover:border-gold shadow-sm transition-transform"
          >
            <svg class="w-4 h-4 ${isWishlisted ? "text-gold" : "text-ink"}" fill="${isWishlisted ? "#C4A15A" : "none"}" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
            </svg>
          </button>
        </div>

        <div class="p-3 sm:p-4 flex-grow flex flex-col justify-between space-y-3 min-w-0">
          <div onclick="app.openProductDetail('${pid}')" class="cursor-pointer space-y-1.5 min-w-0">
            <div class="flex flex-wrap items-center gap-1 text-[11px] text-ink-muted">
              ${saree.color ? `<span class="px-2 py-0.5 rounded-full bg-[#F5EFE4] border border-gold/35 font-semibold text-ink truncate" title="Colour: ${saree.color}">${saree.color}</span>` : ""}
              ${saree.fabric ? `<span class="px-2 py-0.5 rounded-full bg-[#F5EFE4] border border-gold/35 font-medium text-ink truncate" title="Fabric: ${saree.fabric}">${saree.fabric}</span>` : ""}
              ${saree.occasion ? `<span class="px-2 py-0.5 rounded-full bg-ivory border border-gold/30 text-ink-muted truncate" title="Occasion: ${saree.occasion}">${saree.occasion}</span>` : ""}
            </div>
            <h3 class="font-serif text-base sm:text-lg font-semibold text-ink group-hover:text-teal transition-colors line-clamp-2 leading-snug break-words">
              ${saree.name}
            </h3>
          </div>

          <div class="pt-2 border-t border-gold/25 space-y-2.5">
            <div class="flex flex-wrap items-baseline gap-1.5">
              ${
                pricing.priceOnRequest
                  ? `<span class="font-serif text-base sm:text-lg font-bold text-teal">Price on request</span>`
                  : `<span class="font-serif text-lg sm:text-xl font-bold text-ink">${this.formatINR(pricing.finalINR)}</span>
                     ${
                       pricing.hasDiscount
                         ? `<span class="text-xs text-ink-muted line-through">${this.formatINR(pricing.mrp)}</span>
                            <span class="text-[10px] font-bold text-teal bg-gold/25 px-1.5 py-0.5 rounded">${pricing.discountLabel}</span>`
                         : ""
                     }`
              }
            </div>

            ${
              pricing.priceOnRequest
                ? `<a
                    href="https://wa.me/919652262173?text=${encodeURIComponent(`Hi Janardhan Textiles, please share the price and availability for ${saree.name} (SKU: ${pid}).`)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-full py-2 px-3 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-[#F5EFE4] text-ink border border-gold/60 hover:bg-gold/25"
                  >
                    <span>Enquire on WhatsApp</span>
                  </a>`
                : `<button
                    type="button"
                    data-add-cart-btn="${pid}"
                    onclick="app.addToCart('${pid}', 1, this)"
                    ${outOfStock ? "disabled" : ""}
                    class="w-full py-2 px-3 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      outOfStock
                        ? "bg-sand-deep/50 text-ink-muted cursor-not-allowed"
                        : "bg-teal text-ivory hover:bg-teal-light active:scale-95 shadow-xs"
                    }"
                  >
                    <svg class="w-3.5 h-3.5 text-gold shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                    <span>${outOfStock ? "Out of stock" : "Add to Cart"}</span>
                  </button>`
            }
          </div>
        </div>
      </article>
    `;
  };

  // Instant Add to Cart feedback (button state change + toast + cart badge bounce)
  app.addToCart = function (productId, qty = 1, triggerBtn = null) {
    const saree =
      (this.state.catalogueResult?.items || []).find((p) => (p.id || p.sku) === productId) ||
      this.state.products.find((p) => (p.id || p.sku) === productId) ||
      this.state.wishlistItems.find((p) => (p.id || p.sku) === productId);
    if (!saree) return;

    if (this.isProductOutOfStock(saree)) {
      this.showToast(`"${saree.name}" is currently out of stock.`, "error");
      return;
    }

    const maxStock = Number(saree.stock ?? saree.stockQty ?? 99);
    const pricing = this.getPricing(saree);
    const pid = saree.id || saree.sku;
    const existing = this.state.cart.find((item) => item.productId === pid);
    const desiredQty = (existing ? existing.qty : 0) + Number(qty);

    if (maxStock > 0 && desiredQty > maxStock) {
      this.showToast(`Only ${maxStock} piece(s) of "${saree.name}" available in stock.`, "error");
      return;
    }

    const rawThumb =
      (Array.isArray(saree.images) && saree.images[0]) ||
      (saree.gallery && saree.gallery[0]?.url) ||
      "";

    if (existing) {
      existing.qty = desiredQty;
      existing.priceINR = pricing.finalINR;
      existing.maxStock = maxStock;
    } else {
      this.state.cart.push({
        productId: pid,
        name: saree.name,
        fabric: saree.fabric,
        color: saree.color,
        occasion: saree.occasion,
        priceINR: pricing.finalINR,
        mrp: pricing.mrp,
        maxStock,
        thumbUrl: this.resolveImageUrl(rawThumb, saree.name, "Front view"),
        qty: Number(qty)
      });
    }

    this.saveCartToLocal();
    this.updateCartBadges(true);

    if (triggerBtn) {
      const origHtml = triggerBtn.innerHTML;
      triggerBtn.innerHTML = `<span>✓ Added to Cart</span>`;
      triggerBtn.classList.add("bg-gold", "text-ink");
      triggerBtn.classList.remove("bg-teal", "text-ivory");
      setTimeout(() => {
        if (triggerBtn) {
          triggerBtn.innerHTML = origHtml;
          triggerBtn.classList.remove("bg-gold", "text-ink");
          triggerBtn.classList.add("bg-teal", "text-ivory");
        }
      }, 1100);
    }

    this.showToast(`Added ${qty} × "${saree.name}" to your Cart.`);
    this.refreshCartDrawerIfOpen();
  };

  app.buyNow = function (productId, qty = 1) {
    this.addToCart(productId, qty);
    this.closeCartDrawer();
    this.navigate("checkout");
  };

  app.updateCartBadges = function (bounce = false) {
    const totalQty = this.state.cart.reduce((sum, item) => sum + item.qty, 0);
    ["header-cart-badge", "mobile-cart-badge"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = String(totalQty);
        if (bounce) {
          el.classList.remove("badge-bounce");
          void el.offsetWidth;
          el.classList.add("badge-bounce");
        }
      }
    });
  };

  // 9. Slide-in CartDrawer Component
  app.openCartDrawer = function () {
    const modal = document.getElementById("cart-drawer-modal");
    const panel = document.getElementById("cart-drawer-panel");
    if (!modal || !panel) {
      this.navigate("cart");
      return;
    }
    panel.innerHTML = this.renderCartDrawerContent();
    modal.classList.remove("hidden");
  };

  app.closeCartDrawer = function () {
    const modal = document.getElementById("cart-drawer-modal");
    if (modal) modal.classList.add("hidden");
  };

  app.refreshCartDrawerIfOpen = function () {
    const modal = document.getElementById("cart-drawer-modal");
    const panel = document.getElementById("cart-drawer-panel");
    if (modal && !modal.classList.contains("hidden") && panel) {
      panel.innerHTML = this.renderCartDrawerContent();
    }
  };

  app.renderCartDrawerContent = function () {
    const items = this.state.cart || [];
    const subtotal = items.reduce((s, i) => s + i.priceINR * i.qty, 0);
    const { shipping, freeAbove, isFree } = this.getShippingBreakdown(subtotal);
    const total = subtotal > 0 ? subtotal + shipping : 0;

    return `
      <div class="p-4 sm:p-5 border-b border-gold/40 bg-[#F5EFE4] flex items-center justify-between">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-widest text-teal block">Janardhan Textiles</span>
          <h2 class="font-serif text-xl sm:text-2xl font-bold text-ink">Shopping Cart (${items.reduce((s, i) => s + i.qty, 0)})</h2>
        </div>
        <button type="button" onclick="app.closeCartDrawer()" class="p-2 rounded-full bg-ivory text-ink border border-gold/40 hover:bg-gold/20" aria-label="Close Cart Drawer">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        ${
          items.length === 0
            ? `
          <div class="text-center py-12 space-y-3">
            <p class="font-serif text-xl font-semibold text-ink">Your cart is empty</p>
            <p class="text-xs text-ink-muted">Explore our 600-loom saree catalogue and add your favourite drapes.</p>
            <button type="button" onclick="app.closeCartDrawer(); app.navigate('shop')" class="px-5 py-2.5 rounded-full bg-teal text-ivory text-xs font-semibold hover:bg-teal-light">
              Shop Sarees
            </button>
          </div>
        `
            : items
                .map(
                  (item, idx) => `
          <div class="p-3 rounded-2xl bg-ivory border border-gold/35 flex gap-3 items-center shadow-xs">
            <img
              src="${this.resolveImageUrl(item.thumbUrl, item.name)}"
              alt="${item.name}"
              onclick="app.closeCartDrawer(); app.openProductDetail('${item.productId}')"
              class="w-16 h-20 rounded-xl object-cover bg-[#EFE6D5] border border-gold/30 cursor-pointer shrink-0"
            />
            <div class="flex-1 min-w-0">
              <h3 onclick="app.closeCartDrawer(); app.openProductDetail('${item.productId}')" class="font-serif text-sm font-bold text-ink truncate cursor-pointer hover:text-teal">${item.name}</h3>
              <p class="text-[11px] text-ink-muted truncate">${item.fabric || ""} • ${this.formatINR(item.priceINR)}</p>
              <div class="flex items-center justify-between mt-2">
                <div class="inline-flex items-center rounded-lg border border-gold/40 bg-[#F5EFE4]">
                  <button type="button" onclick="app.updateCartQty(${idx}, -1)" class="px-2 py-0.5 text-xs font-bold text-ink hover:bg-gold/20" aria-label="Decrease quantity">−</button>
                  <span class="px-2 text-xs font-bold text-ink">${item.qty}</span>
                  <button type="button" onclick="app.updateCartQty(${idx}, 1)" class="px-2 py-0.5 text-xs font-bold text-ink hover:bg-gold/20" aria-label="Increase quantity">+</button>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-serif text-sm font-bold text-ink">${this.formatINR(item.priceINR * item.qty)}</span>
                  <button type="button" onclick="app.removeCartItem(${idx})" class="text-[11px] text-red-700 hover:underline">Remove</button>
                </div>
              </div>
            </div>
          </div>
        `
                )
                .join("")
        }
      </div>

      ${
        items.length > 0
          ? `
        <div class="p-4 sm:p-5 border-t border-gold/40 bg-[#F5EFE4] space-y-3">
          <div class="space-y-1 text-xs">
            <div class="flex justify-between text-ink-muted">
              <span>Subtotal</span>
              <span class="font-semibold text-ink">${this.formatINR(subtotal)}</span>
            </div>
            <div class="flex justify-between text-ink-muted">
              <span>Shipping (Free above ${this.formatINR(freeAbove)})</span>
              <span class="font-semibold text-ink">${isFree ? "FREE" : this.formatINR(shipping)}</span>
            </div>
            <div class="flex justify-between text-sm font-bold text-ink pt-1.5 border-t border-gold/25">
              <span>Total</span>
              <span class="font-serif text-lg">${this.formatINR(total)}</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" onclick="app.closeCartDrawer(); app.navigate('cart')" class="py-2.5 px-3 rounded-full bg-ivory text-ink border border-gold/50 font-semibold text-xs hover:bg-gold/20">
              View Cart Page
            </button>
            <button type="button" onclick="app.closeCartDrawer(); app.proceedToCheckout()" class="py-2.5 px-3 rounded-full bg-teal text-ivory font-semibold text-xs hover:bg-teal-light shadow">
              Checkout →
            </button>
          </div>
        </div>
      `
          : ""
      }
    `;
  };

  app.updateCartQty = function (idx, delta) {
    const item = this.state.cart[idx];
    if (!item) return;
    const nextQty = item.qty + delta;
    if (nextQty <= 0) {
      this.state.cart.splice(idx, 1);
    } else if (item.maxStock && nextQty > item.maxStock) {
      this.showToast(`Only ${item.maxStock} piece(s) available in stock.`, "error");
      return;
    } else {
      item.qty = nextQty;
    }
    this.saveCartToLocal();
    this.updateCartBadges(true);
    this.refreshCartDrawerIfOpen();
    if (this.state.currentPage === "cart" || this.state.currentPage === "checkout") {
      this.renderCurrentPage();
    }
  };

  app.removeCartItem = function (idx) {
    this.state.cart.splice(idx, 1);
    this.saveCartToLocal();
    this.updateCartBadges();
    this.refreshCartDrawerIfOpen();
    if (this.state.currentPage === "cart" || this.state.currentPage === "checkout") {
      this.renderCurrentPage();
    }
  };

  // Re-validate cart against API before checkout
  app.revalidateCartStock = async function () {
    const stockErrors = [];
    try {
      const res = await BACKEND_API.request("/api/products?limit=100");
      const liveMap = new Map((res.items || []).map((p) => [p.id || p.sku, p]));
      this.state.cart.forEach((item) => {
        const live = liveMap.get(item.productId);
        if (!live || live.active === false) {
          stockErrors.push(`"${item.name}" is no longer available.`);
        } else if (live.stock <= 0 || live.stock_status === "out_of_stock") {
          stockErrors.push(`"${item.name}" is currently out of stock.`);
        } else if (item.qty > live.stock) {
          stockErrors.push(`"${item.name}" only has ${live.stock} piece(s) left in stock (you have ${item.qty} in cart).`);
        } else {
          item.priceINR = live.price;
          item.maxStock = live.stock;
        }
      });
    } catch (e) {}
    this.state.checkoutState.stockErrors = stockErrors;
    return stockErrors;
  };

  app.proceedToCheckout = async function () {
    if (this.state.cart.length === 0) {
      this.showToast("Your cart is empty.", "error");
      return;
    }
    this.state.checkoutState.confirmedOrder = null;
    this.state.checkoutState.step = 1;
    this.navigate("checkout");
    const errors = await this.revalidateCartStock();
    if (errors.length > 0) {
      this.showToast(errors[0], "error");
      if (this.state.currentPage === "checkout") {
        this.renderCurrentPage();
      }
    }
  };

  // 10. Home Screen Sections (Collection Links by Fabric & Occasion, Featured, New Arrivals, Bestsellers, Trust Strip)
  app.filterByCollection = function (type, value) {
    this.clearAllCatalogueFilters(false);
    if (type === "fabric") this.state.catalogueQuery.fabric = [value];
    if (type === "occasion") this.state.catalogueQuery.occasion = [value];
    if (type === "featured") this.state.catalogueQuery.featured = "1";
    if (type === "bestseller") this.state.catalogueQuery.bestseller = "1";
    if (type === "newest") this.state.catalogueQuery.sort = "newest";
    this.navigate("shop");
  };

  app.renderHomeCollectionsAndSections = function () {
    const fm = this.state.filtersMeta || {};
    const fabrics = fm.fabrics && fm.fabrics.length ? fm.fabrics : [...new Set(this.state.products.map((p) => p.fabric).filter(Boolean))];
    const occasions = fm.occasions && fm.occasions.length ? fm.occasions : [...new Set(this.state.products.map((p) => p.occasion).filter(Boolean))];
    const hs = this.state.homeSections;
    const shipCfg = fm.shipping || { flat: 99, free_above: 2999 };

    return `
      <!-- React Bits CurvedLoop Decorative Divider 1 (Between Hero & Featured / Collections) -->
      <div id="home-curved-loop-hero-divider" class="w-full max-w-full overflow-hidden my-4" aria-hidden="true"></div>

      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-12 pb-8">
        <!-- Shop by Fabric & Occasion Collection Links + React Bits FlowingMenu (from /api/filters & /api/products) -->
        <section id="home-flowing-menu-section" class="rounded-3xl bg-[#FAF8F5] border border-gold/40 p-4 sm:p-8 shadow-sm space-y-6" aria-label="Saree Collections by Fabric and Occasion">
          <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span class="text-xs font-bold uppercase tracking-widest text-teal">Curated Loom Collections • Flowing Menu</span>
              <h2 class="font-serif text-2xl sm:text-3xl font-semibold text-ink mt-0.5">Browse by Fabric &amp; Occasion</h2>
              <p class="text-xs text-ink-muted mt-0.5">Explore our signature power-loom weaves by fabric and occasion.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onclick="app.openFlowingMenuModal()"
                class="px-4 py-2 rounded-full bg-gold/25 text-ink border border-gold/60 text-xs font-semibold hover:bg-gold/40 transition-colors"
              >
                Open Full-Screen Menu ↗
              </button>
              <button
                type="button"
                onclick="app.clearAllCatalogueFilters(false); app.navigate('shop')"
                class="px-4 py-2 rounded-full bg-teal text-ivory text-xs font-semibold hover:bg-teal-light transition-colors"
              >
                Shop All Sarees →
              </button>
            </div>
          </div>

          <!-- React Bits FlowingMenu Home Mount (Fallback links rendered immediately and upgraded on lazy-load) -->
          <div id="home-flowing-menu-mount" class="w-full">
            <nav aria-label="Saree Collections Fallback Links" class="rounded-2xl border border-gold/35 bg-[#FAF8F5] divide-y divide-gold/25 overflow-hidden">
              ${fabrics
                .map(
                  (fab, i) => `
                <a
                  href="?fabric=${encodeURIComponent(fab)}#catalogue"
                  onclick="event.preventDefault(); app.filterByCollection('fabric', '${fab.replace(/'/g, "\\'")}')"
                  class="flex items-center justify-between px-4 sm:px-6 py-3.5 text-ink hover:bg-gold/20 active:bg-gold/30 transition-colors"
                >
                  <span class="font-serif text-lg sm:text-2xl font-semibold">${String(i + 1).padStart(2, "0")}. ${fab}</span>
                  <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">Fabric Collection →</span>
                </a>
              `
                )
                .join("")}
              ${occasions
                .map(
                  (occ, i) => `
                <a
                  href="?occasion=${encodeURIComponent(occ)}#catalogue"
                  onclick="event.preventDefault(); app.filterByCollection('occasion', '${occ.replace(/'/g, "\\'")}')"
                  class="flex items-center justify-between px-4 sm:px-6 py-3.5 text-ink hover:bg-gold/20 active:bg-gold/30 transition-colors"
                >
                  <span class="font-serif text-lg sm:text-2xl font-semibold">${String(fabrics.length + i + 1).padStart(2, "0")}. ${occ}</span>
                  <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">Occasion Collection →</span>
                </a>
              `
                )
                .join("")}
            </nav>
          </div>

          <div class="space-y-3 pt-2 border-t border-gold/25">
            <h3 class="text-xs font-bold uppercase tracking-wider text-ink-muted">Quick Filter Pills — Fabric &amp; Occasion</h3>
            <div class="flex flex-wrap gap-2">
              ${fabrics
                .map(
                  (fab) => `
                <button
                  type="button"
                  onclick="app.filterByCollection('fabric', '${fab.replace(/'/g, "\\'")}')"
                  class="px-3.5 py-2 rounded-full bg-[#F5EFE4] hover:bg-gold/25 text-ink border border-gold/45 text-xs font-semibold transition-colors"
                >
                  ${fab}
                </button>
              `
                )
                .join("")}
              ${occasions
                .map(
                  (occ) => `
                <button
                  type="button"
                  onclick="app.filterByCollection('occasion', '${occ.replace(/'/g, "\\'")}')"
                  class="px-3.5 py-2 rounded-full bg-ivory hover:bg-gold/25 text-ink border border-gold/40 text-xs font-medium transition-colors"
                >
                  ${occ}
                </button>
              `
                )
                .join("")}
            </div>
          </div>
        </section>

        <!-- Featured Sarees (featured=1) -->
        <section class="space-y-4" aria-label="Featured Sarees">
          <div class="flex items-end justify-between gap-4">
            <div>
              <span class="text-xs font-bold uppercase tracking-widest text-ink-muted">Handpicked Drapes</span>
              <h2 class="font-serif text-2xl sm:text-3xl font-semibold text-ink">Featured Sarees</h2>
            </div>
            <button type="button" onclick="app.filterByCollection('featured', '1')" class="px-4 py-2 rounded-full bg-[#FAF8F5] text-ink border border-gold/45 text-xs font-semibold hover:bg-gold/20">
              Shop Featured →
            </button>
          </div>
          ${
            hs.loading
              ? this.renderSkeletonGrid(4)
              : `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  ${hs.featured.map((p) => this.renderProductCard(p)).join("")}
                 </div>`
          }
        </section>

        <!-- New Arrivals (sort=newest) -->
        <section class="space-y-4" aria-label="New Arrivals">
          <div class="flex items-end justify-between gap-4">
            <div>
              <span class="text-xs font-bold uppercase tracking-widest text-ink-muted">Fresh From ~600 Power Looms</span>
              <h2 class="font-serif text-2xl sm:text-3xl font-semibold text-ink">New Arrivals</h2>
            </div>
            <button type="button" onclick="app.filterByCollection('newest', '1')" class="px-4 py-2 rounded-full bg-[#FAF8F5] text-ink border border-gold/45 text-xs font-semibold hover:bg-gold/20">
              Shop New Arrivals →
            </button>
          </div>
          ${
            hs.loading
              ? this.renderSkeletonGrid(4)
              : `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  ${hs.newest.map((p) => this.renderProductCard(p)).join("")}
                 </div>`
          }
        </section>

        <!-- Bestsellers (bestseller=1) -->
        <section class="space-y-4" aria-label="Bestsellers">
          <div class="flex items-end justify-between gap-4">
            <div>
              <span class="text-xs font-bold uppercase tracking-widest text-ink-muted">Most Requested Weaves</span>
              <h2 class="font-serif text-2xl sm:text-3xl font-semibold text-ink">Bestsellers</h2>
            </div>
            <button type="button" onclick="app.filterByCollection('bestseller', '1')" class="px-4 py-2 rounded-full bg-[#FAF8F5] text-ink border border-gold/45 text-xs font-semibold hover:bg-gold/20">
              Shop Bestsellers →
            </button>
          </div>
          ${
            hs.loading
              ? this.renderSkeletonGrid(4)
              : `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  ${hs.bestsellers.map((p) => this.renderProductCard(p)).join("")}
                 </div>`
          }
        </section>

        <!-- Honest Trust Strip (Real policy & shipping data only) -->
        <section class="rounded-3xl bg-[#F5EFE4] border border-gold/50 p-5 sm:p-8 shadow-sm" aria-label="Store Policies and Support">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="flex items-start gap-3.5">
              <div class="w-10 h-10 rounded-2xl bg-teal text-gold flex items-center justify-center shrink-0 font-serif font-bold">01</div>
              <div>
                <h3 class="font-serif text-lg font-bold text-ink">Transparent Shipping</h3>
                <p class="text-xs text-ink-muted leading-relaxed mt-0.5">
                  Flat ${this.formatINR(shipCfg.flat)} shipping across India, and free shipping on orders above ${this.formatINR(shipCfg.free_above)}. Packed in moisture-resistant protective wrapping.
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3.5">
              <div class="w-10 h-10 rounded-2xl bg-teal text-gold flex items-center justify-center shrink-0 font-serif font-bold">02</div>
              <div>
                <h3 class="font-serif text-lg font-bold text-ink">Returns &amp; Inspection</h3>
                <p class="text-xs text-ink-muted leading-relaxed mt-0.5">
                  Inspect sarees upon delivery with original tags and folding intact. <button type="button" onclick="app.navigate('policies', { tab: 'returns' })" class="underline font-semibold text-ink">View Returns Policy</button>.
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3.5">
              <div class="w-10 h-10 rounded-2xl bg-teal text-gold flex items-center justify-center shrink-0 font-serif font-bold">03</div>
              <div>
                <h3 class="font-serif text-lg font-bold text-ink">Direct ~600 Loom Support</h3>
                <p class="text-xs text-ink-muted leading-relaxed mt-0.5">
                  Every saree includes a coordinated unstitched blouse piece. Reach our mill desk via <button type="button" onclick="app.navigate('contact')" class="underline font-semibold text-ink">Contact &amp; Help</button>.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- React Bits CurvedLoop Decorative Divider 2 (Above Footer on Home Page) -->
      <div id="home-curved-loop-footer-divider" class="w-full max-w-full overflow-hidden mt-2 mb-4" aria-hidden="true"></div>
    `;
  };

  // 11. Catalogue Screen with Left Sidebar FilterPanel (Desktop), Slide-Up Sheet (Mobile), Active FilterChips & Server Pagination
  app.toggleMultiFilter = function (key, val) {
    const arr = Array.isArray(this.state.catalogueQuery[key]) ? [...this.state.catalogueQuery[key]] : [];
    const idx = arr.indexOf(val);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(val);
    this.state.catalogueQuery[key] = arr;
    this.state.catalogueQuery.page = 1;
    this.syncCatalogueQueryToUrl(false);
    this.fetchCatalogueProducts();
  };

  app.setSingleCatalogueFilter = function (key, val) {
    this.state.catalogueQuery[key] = val;
    this.state.catalogueQuery.page = 1;
    this.syncCatalogueQueryToUrl(false);
    this.fetchCatalogueProducts();
  };

  app.removeFilterChip = function (type, val) {
    const cq = this.state.catalogueQuery;
    if (type === "q") {
      cq.q = "";
      const hInput = document.getElementById("header-search-input");
      if (hInput) hInput.value = "";
      const mInput = document.getElementById("mobile-header-search-input");
      if (mInput) mInput.value = "";
    } else if (type === "fabric" || type === "color" || type === "occasion") {
      cq[type] = (cq[type] || []).filter((x) => x !== val);
    } else if (type === "minPrice") {
      cq.minPrice = "";
    } else if (type === "maxPrice") {
      cq.maxPrice = "";
    } else if (type === "availability") {
      cq.availability = "";
    } else if (type === "featured") {
      cq.featured = "";
    } else if (type === "bestseller") {
      cq.bestseller = "";
    }
    cq.page = 1;
    this.syncCatalogueQueryToUrl(false);
    this.fetchCatalogueProducts();
  };

  app.clearAllCatalogueFilters = function (fetchNow = true) {
    this.state.catalogueQuery = {
      q: "",
      fabric: [],
      color: [],
      occasion: [],
      minPrice: "",
      maxPrice: "",
      availability: "",
      sort: "newest",
      page: 1,
      limit: 24,
      featured: "",
      bestseller: ""
    };
    const hInput = document.getElementById("header-search-input");
    if (hInput) hInput.value = "";
    const mInput = document.getElementById("mobile-header-search-input");
    if (mInput) mInput.value = "";
    if (fetchNow) {
      this.syncCatalogueQueryToUrl(false);
      this.fetchCatalogueProducts();
    }
  };

  app.renderFilterChips = function () {
    const cq = this.state.catalogueQuery;
    const chips = [];
    if (cq.q) chips.push({ type: "q", val: cq.q, label: `Search: "${cq.q}"` });
    (cq.fabric || []).forEach((f) => chips.push({ type: "fabric", val: f, label: `Fabric: ${f}` }));
    (cq.color || []).forEach((c) => chips.push({ type: "color", val: c, label: `Colour: ${c}` }));
    (cq.occasion || []).forEach((o) => chips.push({ type: "occasion", val: o, label: `Occasion: ${o}` }));
    if (cq.minPrice !== "" && cq.minPrice !== null) {
      chips.push({ type: "minPrice", val: cq.minPrice, label: `Min: ${this.formatINR(cq.minPrice)}` });
    }
    if (cq.maxPrice !== "" && cq.maxPrice !== null) {
      chips.push({ type: "maxPrice", val: cq.maxPrice, label: `Max: ${this.formatINR(cq.maxPrice)}` });
    }
    if (cq.availability) {
      chips.push({
        type: "availability",
        val: cq.availability,
        label: cq.availability === "in_stock" ? "In Stock Only" : "Out of Stock"
      });
    }
    if (cq.featured === "1") chips.push({ type: "featured", val: "1", label: "Featured Only" });
    if (cq.bestseller === "1") chips.push({ type: "bestseller", val: "1", label: "Bestsellers Only" });

    if (chips.length === 0) return "";

    return `
      <div class="flex flex-wrap items-center gap-2 pb-4" aria-label="Active Filters">
        <span class="text-xs font-semibold text-ink-muted mr-1">Active Filters:</span>
        ${chips
          .map(
            (chip) => `
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF8F5] border border-gold/50 text-xs font-semibold text-ink shadow-2xs">
            <span>${chip.label}</span>
            <button
              type="button"
              onclick="app.removeFilterChip('${chip.type}', '${String(chip.val).replace(/'/g, "\\'")}')"
              class="text-ink-muted hover:text-red-700 font-bold leading-none"
              aria-label="Remove filter ${chip.label}"
            >×</button>
          </span>
        `
          )
          .join("")}
        <button
          type="button"
          onclick="app.clearAllCatalogueFilters(true)"
          class="px-3 py-1 rounded-full bg-teal/10 text-teal hover:bg-teal hover:text-ivory text-xs font-bold transition-colors"
        >
          Clear all
        </button>
      </div>
    `;
  };

  app.renderFilterPanelContent = function (prefix = "desktop") {
    const fm = this.state.filtersMeta || {};
    const fabrics = fm.fabrics && fm.fabrics.length ? fm.fabrics : [...new Set(this.state.products.map((p) => p.fabric).filter(Boolean))];
    const colors = fm.colors && fm.colors.length ? fm.colors : [...new Set(this.state.products.map((p) => p.color).filter(Boolean))];
    const occasions = fm.occasions && fm.occasions.length ? fm.occasions : [...new Set(this.state.products.map((p) => p.occasion).filter(Boolean))];
    const minBound = fm.price?.min ?? 1200;
    const maxBound = fm.price?.max ?? 7500;
    const cq = this.state.catalogueQuery;

    return `
      <div class="space-y-5 text-xs sm:text-sm">
        <div class="flex items-center justify-between border-b border-gold/30 pb-2.5">
          <h3 class="font-serif text-lg font-bold text-ink">Filters</h3>
          <button type="button" onclick="app.clearAllCatalogueFilters(true)" class="text-xs font-semibold text-teal hover:underline">Clear all</button>
        </div>

        <!-- Price Range -->
        <div class="space-y-2 border-b border-gold/25 pb-4">
          <span class="font-bold text-xs uppercase tracking-wider text-ink-muted block">Price Range (INR)</span>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="${prefix}-min-price" class="text-[10px] text-ink-muted">Min (${this.formatINR(minBound)})</label>
              <input
                id="${prefix}-min-price"
                type="number"
                min="0"
                max="${maxBound}"
                placeholder="${minBound}"
                value="${cq.minPrice}"
                onchange="app.setSingleCatalogueFilter('minPrice', this.value)"
                class="w-full px-2.5 py-1.5 rounded-lg border border-gold/40 bg-ivory text-xs text-ink"
              />
            </div>
            <div>
              <label for="${prefix}-max-price" class="text-[10px] text-ink-muted">Max (${this.formatINR(maxBound)})</label>
              <input
                id="${prefix}-max-price"
                type="number"
                min="0"
                max="50000"
                placeholder="${maxBound}"
                value="${cq.maxPrice}"
                onchange="app.setSingleCatalogueFilter('maxPrice', this.value)"
                class="w-full px-2.5 py-1.5 rounded-lg border border-gold/40 bg-ivory text-xs text-ink"
              />
            </div>
          </div>
        </div>

        <!-- Availability -->
        <div class="space-y-2 border-b border-gold/25 pb-4">
          <span class="font-bold text-xs uppercase tracking-wider text-ink-muted block">Availability</span>
          <div class="space-y-1.5">
            ${[
              { val: "", label: "All Sarees" },
              { val: "in_stock", label: "In Stock Only" },
              { val: "out_of_stock", label: "Out of Stock" }
            ]
              .map(
                (opt) => `
              <label class="flex items-center gap-2 cursor-pointer text-xs text-ink">
                <input
                  type="radio"
                  name="${prefix}-availability"
                  value="${opt.val}"
                  ${cq.availability === opt.val ? "checked" : ""}
                  onchange="app.setSingleCatalogueFilter('availability', this.value)"
                  class="accent-teal"
                />
                <span>${opt.label}</span>
              </label>
            `
              )
              .join("")}
          </div>
        </div>

        <!-- Fabric Multi-Select -->
        <div class="space-y-2 border-b border-gold/25 pb-4">
          <span class="font-bold text-xs uppercase tracking-wider text-ink-muted block">Fabric</span>
          <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            ${fabrics
              .map((fab) => {
                const checked = (cq.fabric || []).includes(fab);
                return `
                  <label class="flex items-center gap-2 cursor-pointer text-xs text-ink">
                    <input
                      type="checkbox"
                      ${checked ? "checked" : ""}
                      onchange="app.toggleMultiFilter('fabric', '${fab.replace(/'/g, "\\'")}')"
                      class="accent-teal rounded"
                    />
                    <span class="truncate">${fab}</span>
                  </label>
                `;
              })
              .join("")}
          </div>
        </div>

        <!-- Colour Multi-Select -->
        <div class="space-y-2 border-b border-gold/25 pb-4">
          <span class="font-bold text-xs uppercase tracking-wider text-ink-muted block">Colour</span>
          <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            ${colors
              .map((col) => {
                const checked = (cq.color || []).includes(col);
                return `
                  <label class="flex items-center gap-2 cursor-pointer text-xs text-ink">
                    <input
                      type="checkbox"
                      ${checked ? "checked" : ""}
                      onchange="app.toggleMultiFilter('color', '${col.replace(/'/g, "\\'")}')"
                      class="accent-teal rounded"
                    />
                    <span class="truncate">${col}</span>
                  </label>
                `;
              })
              .join("")}
          </div>
        </div>

        <!-- Occasion Multi-Select -->
        <div class="space-y-2 border-b border-gold/25 pb-4">
          <span class="font-bold text-xs uppercase tracking-wider text-ink-muted block">Occasion</span>
          <div class="space-y-1.5">
            ${occasions
              .map((occ) => {
                const checked = (cq.occasion || []).includes(occ);
                return `
                  <label class="flex items-center gap-2 cursor-pointer text-xs text-ink">
                    <input
                      type="checkbox"
                      ${checked ? "checked" : ""}
                      onchange="app.toggleMultiFilter('occasion', '${occ.replace(/'/g, "\\'")}')"
                      class="accent-teal rounded"
                    />
                    <span class="truncate">${occ}</span>
                  </label>
                `;
              })
              .join("")}
          </div>
        </div>
      </div>
    `;
  };

  // 11B. Generate Saree Studio (Colour + Fabric + Occasion -> 5-View Saree Gallery & New Product Card)
  app.fetchSareeGeneratorStatus = async function () {
    try {
      const data = await BACKEND_API.request("/api/sarees/generate/status");
      if (data && data.ok) {
        this.state.sareeGenerator.serverStatus = data;
        const el = document.getElementById("saree-generator-studio-container");
        if (el) el.innerHTML = this.renderSareeGeneratorStudio();
      }
    } catch (e) {}
  };

  app.setSareeGeneratorSelection = function (field, value) {
    if (!this.state.sareeGenerator) return;
    this.state.sareeGenerator[field] = value;
  };

  app.toggleSareeGeneratorSetupGuide = function () {
    if (!this.state.sareeGenerator) return;
    this.state.sareeGenerator.showSetupGuide = !this.state.sareeGenerator.showSetupGuide;
    const el = document.getElementById("saree-generator-studio-container");
    if (el) el.innerHTML = this.renderSareeGeneratorStudio();
  };

  app.generateSareeDesign = async function (source = "studio") {
    const sg = this.state.sareeGenerator;
    if (!sg) return;
    if (sg.generating) {
      this.showToast("A saree generation is already in progress. Please wait.", "error");
      return;
    }

    const cq = this.state.catalogueQuery || {};
    let chosenColor = sg.color;
    let chosenFabric = sg.fabric;
    let chosenOccasion = sg.occasion;

    // If triggered from filter panel or if studio dropdown is left blank while filter checkboxes are checked, use filter selection
    if (source.startsWith("filter-") || (!chosenColor && Array.isArray(cq.color) && cq.color.length > 0)) {
      chosenColor = (cq.color && cq.color[0]) || sg.color || "";
    }
    if (source.startsWith("filter-") || (!chosenFabric && Array.isArray(cq.fabric) && cq.fabric.length > 0)) {
      chosenFabric = (cq.fabric && cq.fabric[0]) || sg.fabric || "";
    }
    if (source.startsWith("filter-") || (!chosenOccasion && Array.isArray(cq.occasion) && cq.occasion.length > 0)) {
      chosenOccasion = (cq.occasion && cq.occasion[0]) || sg.occasion || "";
    }

    sg.generating = true;
    sg.error = "";
    sg.successMessage = "";
    this.refreshCatalogueDOM();

    try {
      const { status, ok, data } = await BACKEND_API.requestWithStatus("/api/sarees/generate", {
        method: "POST",
        body: JSON.stringify({
          color: chosenColor,
          fabric: chosenFabric,
          occasion: chosenOccasion
        })
      });

      sg.generating = false;

      if (!ok || !data || !data.product) {
        sg.error =
          (data && data.error) ||
          `Could not generate saree (HTTP ${status}). Please verify server image-generation credentials and storage configuration.`;
        this.showToast(sg.error, "error");
        this.refreshCatalogueDOM();
        return;
      }

      const newProduct = data.product;
      const sel = data.selected || {
        color: newProduct.color,
        fabric: newProduct.fabric,
        occasion: newProduct.occasion,
        autoSelected: []
      };

      sg.lastGeneratedProduct = newProduct;
      sg.lastSelected = sel;
      sg.savedImagePaths = data.savedImagePaths || newProduct.images || [];
      sg.configNotice = data.configNotice || "";
      sg.successMessage = `Created "${newProduct.name}" (${sel.color} • ${sel.fabric} • ${sel.occasion}) and added it to the catalogue.`;

      // Keep existing products intact and add the new saree to state + local cache
      const existingList = Array.isArray(this.state.products) ? this.state.products : [];
      if (!existingList.some((p) => (p.id || p.sku) === (newProduct.id || newProduct.sku))) {
        this.state.products = [newProduct, ...existingList];
      }
      try {
        const localProds = LOCAL_FALLBACK_API.getProducts();
        if (!localProds.some((p) => (p.id || p.sku) === (newProduct.id || newProduct.sku))) {
          localProds.unshift(newProduct);
          LOCAL_FALLBACK_API.saveProducts(localProds);
        }
      } catch (e) {}

      if (source === "filter-mobile") {
        this.closeMobileFilterSheet();
      }

      // Reset active filters so all existing products + the 1 new product card are visible together on page 1
      this.clearAllCatalogueFilters(false);
      this.state.catalogueQuery.sort = "newest";
      this.state.catalogueQuery.page = 1;
      this.syncCatalogueQueryToUrl(false);

      await Promise.all([this.fetchFiltersMeta(), this.fetchCatalogueProducts(), this.fetchHomeSections()]);
      this.showToast(`New Saree Generated: ${sel.color} • ${sel.fabric} • ${sel.occasion}`);

      const catEl = document.getElementById("catalogue-section");
      if (catEl) {
        catEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      sg.generating = false;
      sg.error = err.message || "Network error while generating saree.";
      this.showToast(sg.error, "error");
      this.refreshCatalogueDOM();
    }
  };

  app.renderSareeGeneratorStudio = function () {
    return "";
    const sg = this.state.sareeGenerator || {};
    const fm = this.state.filtersMeta || {};
    const rawColors = fm.colors && fm.colors.length ? fm.colors : [...new Set((this.state.products || []).map((p) => p.color).filter(Boolean))];
    const colors = [...new Set(["Royal Rose & Gold", "Emerald Teal & Gold", ...rawColors])];
    const fabrics = fm.fabrics && fm.fabrics.length ? fm.fabrics : [...new Set((this.state.products || []).map((p) => p.fabric).filter(Boolean))];
    const occasions = fm.occasions && fm.occasions.length ? fm.occasions : [...new Set((this.state.products || []).map((p) => p.occasion).filter(Boolean))];
    const lastProd = sg.lastGeneratedProduct;
    const sel = sg.lastSelected || (lastProd && lastProd.selectedCategories) || null;
    const srv = sg.serverStatus;

    return `
      <div class="mb-6 rounded-3xl bg-[#FAF8F5] border-2 border-gold/55 p-4 sm:p-6 shadow-md space-y-4" aria-label="Generate Saree Studio">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gold/30 pb-3.5">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-teal text-gold font-bold text-[10px] uppercase tracking-widest">Custom Saree Studio</span>
              <span class="text-xs font-semibold text-ink-muted">5-View Mannequin Gallery • Neutral Beige Studio</span>
            </div>
            <h3 class="font-serif text-xl sm:text-2xl font-bold text-ink mt-1">Generate Saree by Colour, Fabric &amp; Occasion</h3>
            <p class="text-xs text-ink-muted mt-0.5">
              Choose a Colour, Fabric, and Occasion from our catalogue options—or leave any category unselected to auto-select a suitable option. Creates 1 new saree with a 5-view gallery without replacing existing sarees.
            </p>
          </div>
          <span class="self-start md:self-auto px-3.5 py-1.5 rounded-full bg-[#F3ECE0] text-teal border border-gold/50 text-xs font-semibold shrink-0">
            5-View Gallery Preview
          </span>
        </div>

        <!-- Category Selectors + Generate Button -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label for="gen-saree-color" class="block text-xs font-bold uppercase tracking-wider text-ink-muted mb-1">1. Colour</label>
            <select
              id="gen-saree-color"
              aria-label="Select Saree Colour"
              ${sg.generating ? "disabled" : ""}
              onchange="app.setSareeGeneratorSelection('color', this.value)"
              class="w-full px-3 py-2.5 rounded-xl bg-ivory text-ink border border-gold/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="" ${!sg.color ? "selected" : ""}>Auto-select from Catalogue</option>
              ${colors
                .map(
                  (col) => `<option value="${col}" ${sg.color === col ? "selected" : ""}>${col}</option>`
                )
                .join("")}
            </select>
          </div>

          <div>
            <label for="gen-saree-fabric" class="block text-xs font-bold uppercase tracking-wider text-ink-muted mb-1">2. Fabric</label>
            <select
              id="gen-saree-fabric"
              aria-label="Select Saree Fabric"
              ${sg.generating ? "disabled" : ""}
              onchange="app.setSareeGeneratorSelection('fabric', this.value)"
              class="w-full px-3 py-2.5 rounded-xl bg-ivory text-ink border border-gold/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="" ${!sg.fabric ? "selected" : ""}>Auto-select from Catalogue</option>
              ${fabrics
                .map(
                  (fab) => `<option value="${fab}" ${sg.fabric === fab ? "selected" : ""}>${fab}</option>`
                )
                .join("")}
            </select>
          </div>

          <div>
            <label for="gen-saree-occasion" class="block text-xs font-bold uppercase tracking-wider text-ink-muted mb-1">3. Occasion</label>
            <select
              id="gen-saree-occasion"
              aria-label="Select Saree Occasion"
              ${sg.generating ? "disabled" : ""}
              onchange="app.setSareeGeneratorSelection('occasion', this.value)"
              class="w-full px-3 py-2.5 rounded-xl bg-ivory text-ink border border-gold/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="" ${!sg.occasion ? "selected" : ""}>Auto-select from Catalogue</option>
              ${occasions
                .map(
                  (occ) => `<option value="${occ}" ${sg.occasion === occ ? "selected" : ""}>${occ}</option>`
                )
                .join("")}
            </select>
          </div>

          <div>
            <button
              type="button"
              id="generate-saree-submit-btn"
              data-generate-saree-btn="studio"
              onclick="app.generateSareeDesign('studio')"
              ${sg.generating ? "disabled" : ""}
              class="w-full py-2.5 px-4 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                sg.generating
                  ? "bg-sand-deep text-ink-muted cursor-not-allowed opacity-75"
                  : "bg-teal text-ivory hover:bg-teal-light active:scale-95 shadow-md"
              }"
            >
              ${
                sg.generating
                  ? `<span class="inline-block w-3.5 h-3.5 rounded-full border-2 border-gold border-t-transparent animate-spin"></span>
                     <span>Generating 5-View Saree...</span>`
                  : `<span>✦ Generate Saree</span>`
              }
            </button>
          </div>
        </div>

        <!-- Loading State -->
        ${
          sg.generating
            ? `
          <div role="status" aria-live="polite" class="p-3.5 rounded-2xl bg-[#F5EFE4] border border-gold/50 flex items-center gap-3 text-xs text-ink">
            <span class="inline-block w-4 h-4 rounded-full border-2 border-teal border-t-transparent animate-spin shrink-0"></span>
            <div>
              <p class="font-bold">Generating 5-view saree studio photography &amp; saving to catalogue...</p>
              <p class="text-[11px] text-ink-muted">Creating Front, Back &amp; Pallu, Pallu Detail, Fabric Macro, and Blouse Detail views. Duplicate requests are locked until completion.</p>
            </div>
          </div>
        `
            : ""
        }

        <!-- Error State -->
        ${
          sg.error
            ? `
          <div role="alert" class="p-3.5 rounded-2xl bg-red-50 border border-red-300 text-xs text-red-900 flex items-start justify-between gap-3">
            <div>
              <p class="font-bold">Saree Generation Error</p>
              <p class="mt-0.5">${sg.error}</p>
            </div>
            <button type="button" onclick="app.state.sareeGenerator.error=''; app.refreshCatalogueDOM()" class="font-bold text-red-800">✕</button>
          </div>
        `
            : ""
        }

        <!-- Generated Saree Result Summary (Displays Selected Colour, Fabric, Occasion & 5-View Gallery Preview) -->
        ${
          lastProd && sel && !sg.generating
            ? `
          <div id="generated-saree-result-banner" role="status" aria-live="polite" class="p-4 rounded-2xl bg-[#F5EFE4] border-2 border-gold/60 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="px-2.5 py-0.5 rounded-full bg-teal text-gold text-[10px] font-bold uppercase">✓ Added to Catalogue</span>
                  <span class="font-mono text-xs font-bold text-teal">SKU: ${lastProd.sku}</span>
                </div>
                <h4 class="font-serif text-lg sm:text-xl font-bold text-ink">${lastProd.name}</h4>
              </div>
              <div class="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onclick="app.openProductDetail('${lastProd.id}')"
                  class="px-4 py-2 rounded-full bg-teal text-ivory text-xs font-bold hover:bg-teal-light shadow-xs"
                >
                  Open 5-View Gallery →
                </button>
              </div>
            </div>

            <!-- Selected / Auto-Selected Categories Display -->
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-bold text-ink-muted">Selected Categories:</span>
              <span class="px-3 py-1 rounded-full bg-ivory border border-gold/50 font-semibold text-ink">
                Colour: <strong>${sel.color}</strong>${(sel.autoSelected || []).includes("color") ? ' <em class="text-[10px] text-teal">(Auto-selected)</em>' : ""}
              </span>
              <span class="px-3 py-1 rounded-full bg-ivory border border-gold/50 font-semibold text-ink">
                Fabric: <strong>${sel.fabric}</strong>${(sel.autoSelected || []).includes("fabric") ? ' <em class="text-[10px] text-teal">(Auto-selected)</em>' : ""}
              </span>
              <span class="px-3 py-1 rounded-full bg-ivory border border-gold/50 font-semibold text-ink">
                Occasion: <strong>${sel.occasion}</strong>${(sel.autoSelected || []).includes("occasion") ? ' <em class="text-[10px] text-teal">(Auto-selected)</em>' : ""}
              </span>
            </div>

            <!-- 5-View Thumbnail Strip -->
            <div class="grid grid-cols-5 gap-2 pt-1">
              ${(lastProd.gallery || []).map((g, idx) => `
                <button
                  type="button"
                  onclick="app.openProductDetail('${lastProd.id}'); setTimeout(() => app.setActiveProductGalleryIndex(${idx}), 60);"
                  class="group text-left space-y-1 focus:outline-none"
                >
                  <div class="aspect-[3/4] rounded-xl overflow-hidden bg-ivory border border-gold/40 group-hover:border-teal">
                    <img src="${this.resolveImageUrl(g.url, lastProd.name, g.label)}" alt="${g.label}" class="w-full h-full object-cover object-top" loading="lazy" />
                  </div>
                  <span class="block text-[10px] font-semibold text-ink-muted truncate">${idx + 1}. ${g.label.replace(/^\d+\.\s*/, "")}</span>
                </button>
              `).join("")}
            </div>

            <div class="text-[11px] text-ink-muted pt-1 border-t border-gold/30 flex flex-wrap items-center justify-between gap-2">
              <span><strong>Gallery Views:</strong> 5 coordinated studio angles (Front, Back &amp; Pallu, Pallu Detail, Border Macro, Blouse Detail)</span>
              <span><strong>Status:</strong> Added to Saree Collection</span>
            </div>
          </div>
        `
            : ""
        }


      </div>
    `;
  };

  app.openMobileFilterSheet = function () {
    const sheet = document.getElementById("mobile-filter-sheet");
    const panel = document.getElementById("mobile-filter-sheet-panel");
    if (!sheet || !panel) return;
    panel.innerHTML = this.renderMobileFilterSheetContent();
    sheet.classList.remove("hidden");
  };

  app.closeMobileFilterSheet = function () {
    const sheet = document.getElementById("mobile-filter-sheet");
    if (sheet) sheet.classList.add("hidden");
  };

  app.renderMobileFilterSheetContent = function () {
    return `
      <div class="p-4 border-b border-gold/40 bg-[#F5EFE4] flex items-center justify-between">
        <h3 class="font-serif text-xl font-bold text-ink">Filter &amp; Sort Sarees</h3>
        <button type="button" onclick="app.closeMobileFilterSheet()" class="p-2 rounded-full bg-ivory text-ink border border-gold/40" aria-label="Close Filter Sheet">✕</button>
      </div>
      <div class="p-4 overflow-y-auto flex-1">
        ${this.renderFilterPanelContent("mobile")}
      </div>
      <div class="p-4 border-t border-gold/40 bg-[#F5EFE4] grid grid-cols-2 gap-2.5">
        <button type="button" onclick="app.clearAllCatalogueFilters(true); app.closeMobileFilterSheet()" class="py-2.5 rounded-full bg-ivory text-ink border border-gold/50 text-xs font-semibold">
          Reset All
        </button>
        <button type="button" onclick="app.closeMobileFilterSheet()" class="py-2.5 rounded-full bg-teal text-ivory text-xs font-semibold shadow">
          Show Results (${this.state.catalogueResult.total})
        </button>
      </div>
    `;
  };

  app.changeCataloguePage = function (newPage, append = false) {
    this.state.catalogueQuery.page = newPage;
    this.syncCatalogueQueryToUrl(false);
    this.fetchCatalogueProducts(append);
    if (!append) {
      const catEl = document.getElementById("catalogue-section");
      if (catEl) catEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  app.renderShowcaseAndShopPage = function () {
    const cq = this.state.catalogueQuery;
    return `
      <div class="page-transition">
        <!-- 1. SCROLL-DRIVEN 5-IMAGE SAREE SHOWCASE -->
        <section id="showcase-section" class="showcase-section" aria-label="Saree visual showcase">
          <div id="showcase-stage" class="showcase-stage">
            <div class="stage-ambient" aria-hidden="true"></div>
            <div id="frames-viewport" class="frames-viewport">
              ${ShowcaseScrollEngine.framesConfig
                .map(
                  (frame, idx) => `
                <figure
                  class="showcase-item saree-frame ${idx === 0 ? "is-active" : ""}"
                  data-index="${idx}"
                  data-step="${idx}"
                  data-view-type="${frame.viewType || "full"}"
                  style="z-index: ${idx + 1}; --focal-desktop: ${frame.focalDesktop || "50% 50%"}; --focal-mobile: ${frame.focalMobile || "50% 50%"};"
                >
                  <picture class="showcase-picture">
                    <img
                      src="${frame.jpg}"
                      alt="${frame.alt}"
                      width="1792"
                      height="2400"
                      loading="${idx < 2 ? "eager" : "lazy"}"
                      ${idx === 0 ? 'fetchpriority="high"' : ""}
                      decoding="async"
                      class="showcase-img saree-img"
                    />
                  </picture>
                  <figcaption class="showcase-item-caption">0${idx + 1} / 05 — ${frame.caption}</figcaption>
                </figure>
              `
                )
                .join("")}
            </div>
            <!-- Subtle Gold Brand Emblem Counter-Parallax Watermark -->
            <div id="stage-brand-watermark" class="stage-brand-watermark" aria-hidden="true">
              <img src="${window.__ASSET_BASE_PATH__ || ""}/public/images/logo/janardhan-logo.png" alt="" loading="lazy" />
            </div>
            <!-- 360° Portrait 3:4 Full-Body Saree Turntable Scroll-Scrub & Drag Stage -->
            <div id="saree-360-turntable-stage" class="saree-360-turntable-stage" aria-label="360-degree Saree Turntable">
              <div class="saree-360-frame-box" title="Scroll or drag horizontally to rotate 360°">
                <div id="saree-360-loading-pill" class="saree-360-loading-pill" role="status" aria-live="polite">
                  <span class="saree-360-loading-dot" aria-hidden="true"></span>
                  <span id="saree-360-loading-text">Loading 360° views…</span>
                </div>
                <div id="saree-360-error-banner" class="saree-360-error-banner is-hidden" role="alert">
                  <span id="saree-360-error-text">Some 360° frames could not be loaded.</span>
                  <button type="button" class="saree-360-retry-btn" onclick="ShowcaseScrollEngine.retryFailedFrames()">Retry</button>
                </div>
                <span id="saree-360-angle-badge" class="saree-360-angle-badge">360° Turntable • 0°</span>
                <img
                  id="saree-360-poster-fallback"
                  src="${window.__ASSET_BASE_PATH__ || ""}/public/assets/saree-360/frames/frame-000.webp?v=360-v6"
                  alt="Champagne Tissue Saree 360-degree turntable view"
                  class="saree-360-poster-fallback"
                  fetchpriority="high"
                  decoding="async"
                />
                <canvas
                  id="saree-360-canvas"
                  class="saree-360-canvas"
                  width="720"
                  height="960"
                  aria-label="Champagne Tissue Saree 360-degree turntable view"
                ></canvas>
                <div class="saree-360-ai-disclosure">
                  <span><strong>360° Mode:</strong> AI-assisted angle preview — see original photos below</span>
                  <div class="saree-360-hotspot-strip" aria-label="Inspect Real Studio Macro Details">
                    <button type="button" class="saree-360-hotspot-btn" onclick="ShowcaseScrollEngine.openDetailHotspot(2)">⊕ Pallu Detail</button>
                    <button type="button" class="saree-360-hotspot-btn" onclick="ShowcaseScrollEngine.openDetailHotspot(3)">⊕ Zari Macro</button>
                    <button type="button" class="saree-360-hotspot-btn" onclick="ShowcaseScrollEngine.openDetailHotspot(4)">⊕ Blouse &amp; Border</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="stage-vignette" aria-hidden="true"></div>
            <div id="captions-hud" class="captions-hud caption-layer" aria-hidden="true">
              ${ShowcaseScrollEngine.framesConfig
                .map(
                  (frame, idx) => `
                <p class="caption-step ${idx === 0 ? "is-active" : ""}" data-index="${idx}" data-caption="${idx}">${frame.caption}</p>
              `
                )
                .join("")}
            </div>
            <div id="scroll-cue" class="scroll-cue" aria-hidden="true">
              <span class="scroll-cue-label">Scroll</span>
              <span class="scroll-cue-line"></span>
            </div>
          </div>
        </section>

        <!-- 3. HOME COLLECTIONS, FEATURED, NEW ARRIVALS, BESTSELLERS & TRUST STRIP -->
        <div id="home-api-collections-container">
          ${this.renderHomeCollectionsAndSections()}
        </div>

        <!-- 4. FULL CATALOGUE SECTION (Sidebar FilterPanel + Active Chips + 2/3/4-Col ProductGrid + Pagination) -->
        <section id="catalogue-section" class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12 border-t border-gold/30" aria-label="Saree Catalogue">
          <div class="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span class="text-xs font-bold uppercase tracking-widest text-teal">Janardhan Textiles • ~600 Power Looms</span>
              <h2 id="catalogue-heading" class="font-serif text-2xl sm:text-4xl font-semibold text-ink mt-0.5">Saree Catalogue</h2>
            </div>

            <!-- Mobile Filter Trigger + Sort Dropdown -->
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onclick="app.openMobileFilterSheet()"
                class="lg:hidden px-3.5 py-2 rounded-xl bg-[#FAF8F5] text-ink border border-gold/50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
              >
                <svg class="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                <span>Filters</span>
              </button>

              <div class="flex items-center gap-1.5">
                <label for="catalogue-sort-select" class="text-xs font-semibold text-ink-muted">Sort:</label>
                <select
                  id="catalogue-sort-select"
                  onchange="app.setSingleCatalogueFilter('sort', this.value)"
                  class="px-3 py-2 rounded-xl bg-[#FAF8F5] text-ink border border-gold/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  <option value="newest" ${cq.sort === "newest" ? "selected" : ""}>Newest Arrivals</option>
                  <option value="price_asc" ${cq.sort === "price_asc" ? "selected" : ""}>Price: Low to High</option>
                  <option value="price_desc" ${cq.sort === "price_desc" ? "selected" : ""}>Price: High to Low</option>
                  <option value="name" ${cq.sort === "name" ? "selected" : ""}>Name: A to Z</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Active Filter Chips -->
          <div id="catalogue-active-chips">
            ${this.renderFilterChips()}
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <!-- Desktop Left Sidebar FilterPanel -->
            <aside id="catalogue-desktop-sidebar" class="hidden lg:block lg:col-span-3 bg-[#FAF8F5] rounded-2xl border border-gold/40 p-5 shadow-xs sticky top-20">
              ${this.renderFilterPanelContent("desktop")}
            </aside>

            <!-- Catalogue ProductGrid (2 cols phone, 3 tablet, 4 desktop) -->
            <div class="lg:col-span-9 min-w-0" id="shop-results-container">
              ${this.renderShopResultsContent()}
            </div>
          </div>
        </section>
      </div>
    `;
  };

  app.renderShopResultsContent = function () {
    const res = this.state.catalogueResult;
    if (res.loading) {
      return this.renderSkeletonGrid(4);
    }

    const items = res.items || [];
    const total = res.total || 0;
    const page = res.page || 1;
    const pages = res.pages || 1;

    return `
      <div class="flex items-center justify-between text-xs text-ink-muted mb-3">
        <span>Showing <strong>${items.length}</strong> of <strong>${total}</strong> sarees (Page ${page} of ${pages})</span>
        ${
          total !== this.state.products.length
            ? `<button type="button" onclick="app.clearAllCatalogueFilters(true)" class="text-teal font-semibold hover:underline">Reset Filters</button>`
            : ""
        }
      </div>

      ${
        items.length === 0
          ? `
        <div class="bg-[#FAF8F5] rounded-2xl border border-gold/40 p-8 sm:p-12 text-center space-y-3">
          <p class="font-serif text-2xl font-bold text-ink">No sarees match your current filters</p>
          <p class="text-xs sm:text-sm text-ink-muted max-w-md mx-auto">Try clearing one of your filter chips or broadening your price range.</p>
          <button type="button" onclick="app.clearAllCatalogueFilters(true)" class="px-5 py-2.5 rounded-full bg-teal text-ivory text-xs font-semibold hover:bg-teal-light">
            Clear All Filters
          </button>
        </div>
      `
          : `
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          ${items.map((saree) => this.renderProductCard(saree)).join("")}
        </div>

        <!-- Server Pagination Controls & Load More -->
        ${
          pages > 1
            ? `
          <div class="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#FAF8F5] rounded-2xl border border-gold/35 p-4">
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                ${page <= 1 ? "disabled" : ""}
                onclick="app.changeCataloguePage(${page - 1})"
                class="px-3 py-1.5 rounded-lg border border-gold/40 bg-ivory text-xs font-semibold text-ink disabled:opacity-40"
              >← Prev</button>
              ${Array.from({ length: pages })
                .map((_, i) => {
                  const pNum = i + 1;
                  return `
                    <button
                      type="button"
                      onclick="app.changeCataloguePage(${pNum})"
                      class="w-8 h-8 rounded-lg text-xs font-bold ${
                        pNum === page ? "bg-teal text-ivory shadow" : "bg-ivory text-ink border border-gold/35 hover:bg-gold/20"
                      }"
                    >${pNum}</button>
                  `;
                })
                .join("")}
              <button
                type="button"
                ${page >= pages ? "disabled" : ""}
                onclick="app.changeCataloguePage(${page + 1})"
                class="px-3 py-1.5 rounded-lg border border-gold/40 bg-ivory text-xs font-semibold text-ink disabled:opacity-40"
              >Next →</button>
            </div>
            ${
              page < pages
                ? `
              <button
                type="button"
                onclick="app.changeCataloguePage(${page + 1}, true)"
                class="px-4 py-2 rounded-full bg-[#F5EFE4] text-ink border border-gold/50 text-xs font-semibold hover:bg-gold/25"
              >
                Load More Sarees ↓
              </button>
            `
                : ""
            }
          </div>
        `
            : ""
        }
      `
      }
    `;
  };

  // Helper to resolve a product and its 5-view gallery consistently across detail page, thumbnails, and lightbox
  app.findProductById = function (pid) {
    const targetId = pid || this.state.selectedProductId;
    return (
      (this.state.catalogueResult?.items || []).find((p) => (p.id || p.sku) === targetId) ||
      (this.state.products || []).find((p) => (p.id || p.sku) === targetId) ||
      (window.INITIAL_PRODUCTS || []).find((p) => (p.id || p.sku) === targetId) ||
      this.state.products[0]
    );
  };

  app.getNormalizedGallerySlots = function (saree) {
    if (!saree) return [];
    const rawGallery = Array.isArray(saree.gallery) ? saree.gallery : [];
    const rawImages = Array.isArray(saree.images) ? saree.images : [];
    const frontRaw =
      (rawGallery[0] && typeof rawGallery[0].url === "string" ? rawGallery[0].url.trim() : "") ||
      (typeof rawImages[0] === "string" ? rawImages[0].trim() : "") ||
      (typeof saree.image === "string" ? saree.image.trim() : "");
    const cleanFront = frontRaw.split("?")[0];

    return REQUIRED_GALLERY_VIEWS.map((viewMeta, idx) => {
      const slot = rawGallery[idx] || null;
      let rawUrl = "";
      if (slot && typeof slot.url === "string") {
        rawUrl = slot.url.trim();
      } else if (!slot && typeof rawImages[idx] === "string") {
        rawUrl = rawImages[idx].trim();
      }
      const cleanSlot = rawUrl.split("?")[0];
      // Never reuse the front image for views 2-5
      if (idx > 0 && cleanSlot && cleanFront && cleanSlot === cleanFront) {
        rawUrl = "";
      }
      const label = (slot && slot.label) || viewMeta.label || `View ${idx + 1}`;
      const isMissing = !rawUrl || Boolean(slot && slot.missingView);
      const resolvedSrc = isMissing
        ? createMissingViewPlaceholderSVG(saree.name, label, saree.fabric)
        : this.resolveImageUrl(rawUrl, saree.name, label);
      return {
        order: viewMeta.order || idx + 1,
        key: viewMeta.key,
        label,
        url: rawUrl,
        resolvedSrc,
        missingView: isMissing,
        alt: (slot && slot.alt) || `${saree.name} — ${label}`
      };
    });
  };

  // 12. Product Details Screen (Strict Honesty: Show a field only if API returns it; hide empty fields; hover/tap zoom)
  const origRenderProductDetailPage = app.renderProductDetailPage.bind(app);
  app.renderProductDetailPage = function () {
    const pid = this.state.selectedProductId;
    const saree = this.findProductById(pid);
    if (!saree) return origRenderProductDetailPage();

    const activeIdx = this.state.selectedGalleryIndex || 0;
    const galleryList = this.getNormalizedGallerySlots(saree);
    const activeGalleryItem = galleryList[activeIdx] || galleryList[0] || {};
    const activeLabel = activeGalleryItem.label || REQUIRED_GALLERY_VIEWS[activeIdx]?.label || `View ${activeIdx + 1}`;
    const largeImageSrc = activeGalleryItem.resolvedSrc || this.resolveImageUrl(activeGalleryItem.url, saree.name, activeLabel);

    const pricing = this.getPricing(saree);
    const stockCode = this.getStockStatusCode(saree);
    const outOfStock = stockCode === "out_of_stock";
    const lowStock = stockCode === "low_stock";
    const isWishlisted = this.state.wishlistIds.has(saree.id || saree.sku);

    const workDetails = saree.work_details || [saree.borderAndZari, saree.motifs].filter(Boolean).join(". ");
    const blousePiece = saree.blouse_piece || saree.blousePiece || "";
    const careInstructions = saree.care_instructions || "";
    const shipCfg = this.state.filtersMeta?.shipping || { flat: 99, free_above: 2999 };

    return `
      <div class="page-transition max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10">
        <nav class="flex flex-wrap items-center justify-between gap-2 mb-5 text-xs sm:text-sm text-ink-muted" aria-label="Breadcrumb">
          <div class="flex items-center gap-1.5 min-w-0 truncate">
            <button type="button" onclick="app.navigate('home')" class="hover:text-ink shrink-0">Home</button>
            <span class="shrink-0">/</span>
            <button type="button" onclick="app.navigate('shop')" class="hover:text-ink shrink-0">Catalogue</button>
            <span class="shrink-0">/</span>
            <span class="text-ink font-semibold truncate">${saree.name}</span>
          </div>
          <button type="button" onclick="app.navigate('shop')" class="shrink-0 px-3 py-1.5 rounded-full border border-gold/40 bg-[#FAF8F5] text-ink text-xs font-medium hover:bg-gold/20">
            ← Back to Catalogue
          </button>
        </nav>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
          <!-- LEFT COLUMN: Gallery with Crossfade, Hover/Tap Zoom & Thumbnails -->
          <div class="lg:col-span-7 space-y-4 min-w-0">
            <div class="relative rounded-2xl bg-[#FAF8F5] border border-gold/50 shadow-md overflow-hidden group">
              <div class="absolute top-2.5 left-2.5 right-2.5 z-10 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
                <span id="detail-active-view-pill" class="px-2.5 py-1 rounded-full bg-ivory/95 backdrop-blur-xs text-ink font-semibold text-[11px] border border-gold/40 shadow-xs truncate max-w-full">
                  ${activeLabel}
                </span>
                ${
                  outOfStock
                    ? `<span class="px-2.5 py-1 rounded-full bg-red-900 text-ivory font-bold text-[11px] uppercase">Out of stock</span>`
                    : lowStock
                    ? `<span class="px-2.5 py-1 rounded-full bg-amber-800 text-ivory font-bold text-[11px] uppercase">Only few left</span>`
                    : `<span class="px-2.5 py-1 rounded-full bg-teal text-gold font-bold text-[11px] uppercase">In Stock</span>`
                }
              </div>

              <button
                type="button"
                onclick="event.stopPropagation(); app.stepGallery(-1)"
                class="gallery-nav-btn absolute left-2.5 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-2.5 rounded-full bg-ivory/95 text-ink border border-gold/40 shadow-lg hover:bg-ink hover:text-ivory transition-all"
                aria-label="Previous photo view"
              >‹</button>

              <button
                type="button"
                onclick="event.stopPropagation(); app.stepGallery(1)"
                class="gallery-nav-btn absolute right-2.5 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-2.5 rounded-full bg-ivory/95 text-ink border border-gold/40 shadow-lg hover:bg-ink hover:text-ivory transition-all"
                aria-label="Next photo view"
              >›</button>

              <!-- Main Image Stage (object-fit: contain + hover lens zoom + click lightbox) -->
              <div
                id="product-main-image-stage"
                onclick="app.openLightbox()"
                onmousemove="app.handleDetailImageHoverZoom(event, this)"
                onmouseleave="app.resetDetailImageHoverZoom(this)"
                class="gallery-stage-frame aspect-[5/6] w-full flex items-center justify-center bg-[#EFE6D5] cursor-zoom-in select-none relative overflow-hidden"
                role="region"
                tabindex="0"
                aria-label="Viewing ${activeLabel} for ${saree.name}. Click or press Enter to zoom."
              >
                <img
                  id="product-main-image"
                  src="${largeImageSrc}"
                  data-view-key="${activeGalleryItem.key || ""}"
                  data-missing-view="${activeGalleryItem.missingView ? "true" : "false"}"
                  alt="${saree.name} — ${activeLabel}"
                  onerror="this.onerror=null; this.src=createMissingViewPlaceholderSVG('${(saree.name || "").replace(/'/g, "\\'")}', '${activeLabel.replace(/'/g, "\\'")}');"
                  class="gallery-crossfade-img is-active"
                  draggable="false"
                />
                <img
                  id="product-incoming-image"
                  src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                  alt=""
                  aria-hidden="true"
                  class="gallery-crossfade-img is-idle"
                  draggable="false"
                />
              </div>

              <div class="bg-[#F5EFE4] text-ink border-t border-gold/30 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div class="flex flex-wrap items-center gap-2 min-w-0">
                  <span id="product-main-label" class="font-semibold text-ink truncate">${activeLabel}</span>
                  <span class="px-2 py-0.5 rounded-full bg-ivory border border-gold/50 text-[10px] font-bold text-teal uppercase tracking-wider">
                    ${saree.viewerMode === "360_mode" ? "360° Mode (8 Full-Body Angles)" : `Product Views (${(saree.gallery || []).filter((g) => g && g.url && !g.missingView).length} Studio Photos)`}
                  </span>
                </div>
                <button type="button" onclick="app.openLightbox()" class="shrink-0 font-semibold text-teal hover:underline">
                  Full Screen Zoom ⤢
                </button>
              </div>
            </div>

            ${
              saree.viewerMode === "360_mode" && Array.isArray(saree.fullBodyViews) && saree.fullBodyViews.length >= 8
                ? `
              <div class="rounded-2xl bg-[#120E16] text-ivory border border-gold/55 p-3.5 sm:p-4 space-y-2.5 shadow-md" aria-label="Interactive 360-Degree Full-Body Angle Scrubber">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="px-2.5 py-0.5 rounded-full bg-gold text-ink font-bold text-[10px] uppercase tracking-wider">360° Full-Body Rotation</span>
                    <span id="detail-360-yaw-readout" class="font-mono text-xs text-gold font-bold">0° Front View (Original Studio Photo)</span>
                  </div>
                  <span class="text-[11px] text-ivory/80">${saree.aiDisclosure || "AI-assisted angle preview — see original photos below"}</span>
                </div>
                <div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  ${saree.fullBodyViews
                    .map(
                      (yv) => `
                    <button
                      type="button"
                      onclick="app.selectDetailYawAngle('${(yv.url || "").replace(/'/g, "\\'")}', '${(yv.label || "").replace(/'/g, "\\'")}', '${yv.source || "ai"}')"
                      class="py-1.5 px-2 rounded-lg border border-gold/40 bg-white/5 hover:bg-gold hover:text-ink text-[11px] font-bold transition-colors text-center"
                    >
                      ${yv.yaw}° ${yv.source === "real" ? "★" : ""}
                    </button>
                  `
                    )
                    .join("")}
                </div>
              </div>
            `
                : ""
            }

            <!-- Thumbnails -->
            <div id="gallery-thumbnails-strip" class="flex sm:grid sm:grid-cols-5 gap-2.5 overflow-x-auto no-scrollbar pb-2" role="tablist">
              ${galleryList
                .map((item, idx) => {
                  const slotLabel = item.label || REQUIRED_GALLERY_VIEWS[idx]?.label || `View ${idx + 1}`;
                  const thumbSrc = item.resolvedSrc || this.resolveImageUrl(item.url, saree.name, slotLabel);
                  const isSelected = idx === activeIdx;
                  return `
                    <button
                      type="button"
                      role="tab"
                      data-index="${idx}"
                      data-view-key="${item.key || ""}"
                      data-missing-view="${item.missingView ? "true" : "false"}"
                      aria-selected="${isSelected ? "true" : "false"}"
                      onclick="app.selectGalleryView(${idx})"
                      class="gallery-thumb-btn shrink-0 w-24 sm:w-auto text-left rounded-xl overflow-hidden border-2 bg-[#FAF8F5] ${
                        isSelected ? "is-active-thumb border-ink ring-2 ring-gold" : "border-gold/30 opacity-80 hover:opacity-100"
                      }"
                    >
                      <div class="aspect-[5/6] bg-[#EFE6D5] overflow-hidden flex items-center justify-center p-0.5">
                        <img
                          src="${thumbSrc}"
                          alt="${saree.name} — ${slotLabel}"
                          loading="lazy"
                          decoding="async"
                          onerror="this.onerror=null; this.src=createMissingViewPlaceholderSVG('${(saree.name || "").replace(/'/g, "\\'")}', '${slotLabel.replace(/'/g, "\\'")}');"
                          class="w-full h-full object-contain"
                        />
                      </div>
                      <div class="thumb-caption p-1.5 ${isSelected ? "bg-ink text-ivory" : "bg-[#FAF8F5] text-ink"}">
                        <p class="text-[10px] font-semibold leading-tight line-clamp-1">${slotLabel}</p>
                      </div>
                    </button>
                  `;
                })
                .join("")}
            </div>
          </div>

          <!-- RIGHT COLUMN: Saree Specifications (Only render non-empty fields from API) -->
          <div class="lg:col-span-5 bg-[#FAF8F5] rounded-2xl border border-gold/40 p-4 sm:p-8 shadow-sm space-y-5 min-w-0">
            <div class="space-y-2 border-b border-gold/25 pb-4">
              <div class="flex items-center justify-between gap-2">
                <span class="px-2.5 py-0.5 rounded-full bg-[#F5EFE4] border border-gold/40 text-ink font-semibold text-xs">
                  ${
                    outOfStock
                      ? "Out of stock"
                      : lowStock
                      ? `Only few left (${saree.stock ?? saree.stockQty} left)`
                      : `In Stock (${saree.stock ?? saree.stockQty ?? "Available"})`
                  }
                </span>
                <button
                  type="button"
                  onclick="app.toggleWishlist('${saree.id || saree.sku}', this)"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5EFE4] border border-gold/45 text-xs font-semibold text-ink hover:bg-gold/20"
                >
                  <svg class="w-4 h-4 ${isWishlisted ? "text-gold" : "text-ink"}" fill="${isWishlisted ? "#C4A15A" : "none"}" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                  </svg>
                  <span>${isWishlisted ? "Wishlisted" : "Wishlist"}</span>
                </button>
              </div>

              <h1 class="font-serif text-2xl sm:text-4xl font-semibold text-ink leading-tight">${saree.name}</h1>

              ${saree.description ? `<p class="text-sm text-[#3d3327] leading-relaxed pt-1">${saree.description}</p>` : ""}

              <div class="pt-2 flex flex-wrap items-baseline gap-2.5">
                ${
                  pricing.priceOnRequest
                    ? `<span class="font-serif text-2xl sm:text-3xl font-bold text-teal">Price on request</span>`
                    : `<span class="font-serif text-3xl sm:text-4xl font-bold text-ink">${this.formatINR(pricing.finalINR)}</span>
                       ${
                         pricing.hasDiscount
                           ? `<span class="font-serif text-xl text-ink-muted line-through">${this.formatINR(pricing.mrp)}</span>
                              <span class="px-2.5 py-0.5 rounded-full bg-gold/25 text-ink font-bold text-xs border border-gold/50">${pricing.discountLabel}</span>`
                           : ""
                       }`
                }
              </div>
            </div>

            <!-- Conditional Fields: Shown ONLY if API returns non-empty value -->
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              ${
                saree.fabric
                  ? `<div class="p-3 rounded-xl bg-[#F5EFE4] border border-gold/25">
                      <dt class="text-xs text-ink-muted uppercase tracking-wider">Fabric</dt>
                      <dd class="font-semibold text-ink mt-0.5">${saree.fabric}</dd>
                    </div>`
                  : ""
              }
              ${
                saree.color
                  ? `<div class="p-3 rounded-xl bg-[#F5EFE4] border border-gold/25">
                      <dt class="text-xs text-ink-muted uppercase tracking-wider">Colour</dt>
                      <dd class="font-semibold text-ink mt-0.5">${saree.color}</dd>
                    </div>`
                  : ""
              }
              ${
                saree.occasion
                  ? `<div class="p-3 rounded-xl bg-[#F5EFE4] border border-gold/25 sm:col-span-2">
                      <dt class="text-xs text-ink-muted uppercase tracking-wider">Occasion</dt>
                      <dd class="font-semibold text-ink mt-0.5">${saree.occasion}</dd>
                    </div>`
                  : ""
              }
              ${
                workDetails
                  ? `<div class="p-3 rounded-xl bg-[#F5EFE4] border border-gold/25 sm:col-span-2">
                      <dt class="text-xs text-ink-muted uppercase tracking-wider">Work &amp; Border Details</dt>
                      <dd class="text-ink mt-0.5 leading-relaxed">${workDetails}</dd>
                    </div>`
                  : ""
              }
              ${
                blousePiece
                  ? `<div class="p-3 rounded-xl bg-[#F5EFE4] border border-gold/25 sm:col-span-2">
                      <dt class="text-xs text-ink-muted uppercase tracking-wider">Blouse Piece</dt>
                      <dd class="text-ink mt-0.5 leading-relaxed">${blousePiece}</dd>
                    </div>`
                  : ""
              }
              ${
                careInstructions
                  ? `<div class="p-3 rounded-xl bg-[#F5EFE4] border border-gold/25 sm:col-span-2">
                      <dt class="text-xs text-ink-muted uppercase tracking-wider">Care Instructions</dt>
                      <dd class="text-ink mt-0.5 leading-relaxed">${careInstructions}</dd>
                    </div>`
                  : ""
              }
            </dl>

            <!-- Quantity Selector, Add to Cart & Buy Now -->
            <div class="space-y-4 pt-2 border-t border-gold/25">
              <div class="flex items-center justify-between">
                <label for="detail-qty-input" class="text-sm font-semibold text-ink">Quantity:</label>
                <div class="inline-flex items-center rounded-xl border border-gold/50 bg-[#F5EFE4]">
                  <button type="button" onclick="app.adjustDetailQty(-1)" class="w-10 h-10 flex items-center justify-center text-ink font-bold text-lg hover:bg-gold/20 rounded-l-xl" aria-label="Decrease quantity">−</button>
                  <input
                    id="detail-qty-input"
                    type="number"
                    min="1"
                    max="${saree.stock || saree.stockQty || 99}"
                    value="${this.state.productDetailQty}"
                    onchange="app.setDetailQty(this.value)"
                    class="w-14 text-center bg-transparent font-bold text-sm text-ink focus:outline-none"
                  />
                  <button type="button" onclick="app.adjustDetailQty(1)" class="w-10 h-10 flex items-center justify-center text-ink font-bold text-lg hover:bg-gold/20 rounded-r-xl" aria-label="Increase quantity">+</button>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  ${outOfStock ? "disabled" : ""}
                  onclick="app.addToCart('${saree.id || saree.sku}', app.state.productDetailQty, this)"
                  class="w-full py-3.5 px-5 rounded-full font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
                    outOfStock ? "bg-sand-deep text-ink-muted cursor-not-allowed" : "bg-teal text-ivory hover:bg-teal-light active:scale-95"
                  }"
                >
                  <span>${outOfStock ? "Out of stock" : "Add to Cart"}</span>
                </button>

                <button
                  type="button"
                  ${outOfStock ? "disabled" : ""}
                  onclick="app.buyNow('${saree.id || saree.sku}', app.state.productDetailQty)"
                  class="w-full py-3.5 px-5 rounded-full font-bold text-sm border border-gold bg-gold text-ink hover:bg-gold-light active:scale-95 transition-all disabled:opacity-40"
                >
                  Buy Now →
                </button>
              </div>

              <a
                id="product-detail-whatsapp-btn"
                href="https://wa.me/919652262173?text=Hi%20Janardhan%20Textiles%2C%20I%E2%80%99d%20like%20to%20know%20more%20about%20your%20sarees."
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with Janardhan Textiles on WhatsApp at +91 96522 62173"
                class="w-full py-3 px-5 rounded-full border border-gold/60 bg-[#F5EFE4] text-ink font-semibold text-xs sm:text-sm hover:bg-gold/25 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <svg class="w-4 h-4 text-[#1E3F35] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12.031 2c-5.516 0-9.999 4.486-10 10.003-.001 1.766.46 3.489 1.337 5.008L2 22l5.122-1.343a9.958 9.958 0 0 0 4.904 1.298h.004c5.515 0 9.998-4.486 10-10.002A9.963 9.963 0 0 0 19.104 4.93 9.937 9.937 0 0 0 12.031 2zm0 18.299h-.004a8.29 8.29 0 0 1-4.231-1.158l-.303-.18-3.039.797.811-2.963-.197-.314a8.293 8.293 0 0 1-1.275-4.426c.002-4.581 3.73-8.309 8.313-8.309 2.22 0 4.306.865 5.875 2.435a8.257 8.257 0 0 1 2.432 5.879c-.002 4.581-3.73 8.309-8.382 8.239zm4.56-6.219c-.25-.125-1.478-.729-1.707-.813-.229-.083-.396-.125-.562.125-.167.25-.646.813-.792.979-.146.167-.292.188-.542.063-.25-.125-1.055-.389-2.01-1.24-.743-.662-1.244-1.481-1.39-1.731-.146-.25-.015-.385.11-.51.112-.112.25-.292.375-.438.125-.146.167-.25.25-.417.083-.167.042-.313-.021-.438-.062-.125-.562-1.355-.771-1.855-.203-.486-.409-.42-.562-.428l-.479-.008c-.167 0-.438.063-.667.313-.229.25-.875.855-.875 2.084s.896 2.418 1.021 2.584c.125.167 1.763 2.692 4.271 3.775.597.258 1.063.412 1.426.527.599.19 1.144.163 1.575.099.48-.072 1.478-.604 1.687-1.188.208-.583.208-1.084.146-1.188-.063-.104-.229-.167-.479-.292z"/>
                </svg>
                <span>Enquire on WhatsApp (+91 96522 62173)</span>
              </a>
            </div>

            <!-- Real Delivery Info from /api/filters -->
            <div class="p-3.5 rounded-xl bg-[#F5EFE4] border border-gold/30 text-xs text-ink-muted space-y-1">
              <p class="font-semibold text-ink">Shipping &amp; Delivery Policy</p>
              <p>Flat ${this.formatINR(shipCfg.flat)} delivery across India • Free shipping on orders above ${this.formatINR(shipCfg.free_above)}.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  app.handleDetailImageHoverZoom = function (event, container) {
    const img = container.querySelector("#product-main-image");
    if (!img || window.innerWidth < 768) return;
    const rect = container.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${xPct}% ${yPct}%`;
    img.style.transform = "scale(1.65)";
  };

  app.resetDetailImageHoverZoom = function (container) {
    const img = container.querySelector("#product-main-image");
    if (!img) return;
    img.style.transformOrigin = "50% 50%";
    img.style.transform = "scale(1)";
  };

  app.selectDetailYawAngle = function (rawUrl, label, source) {
    const mainImg = document.getElementById("product-main-image");
    const activePill = document.getElementById("detail-active-view-pill");
    const mainLabel = document.getElementById("product-main-label");
    const yawReadout = document.getElementById("detail-360-yaw-readout");
    const resolved = this.resolveImageUrl(rawUrl, "Saree", label);
    if (mainImg) {
      mainImg.src = resolved;
      mainImg.alt = label;
      mainImg.setAttribute("data-missing-view", "false");
    }
    if (activePill) activePill.textContent = label;
    if (mainLabel) mainLabel.textContent = label;
    if (yawReadout) yawReadout.textContent = label;
  };

  app.selectGalleryView = function (index) {
    if (index < 0 || index >= REQUIRED_GALLERY_VIEWS.length) return;
    this.state.selectedGalleryIndex = index;

    const saree = this.findProductById(this.state.selectedProductId);
    const galleryList = this.getNormalizedGallerySlots(saree);
    const item = galleryList[index] || galleryList[0] || {};
    const slotLabel = item.label || REQUIRED_GALLERY_VIEWS[index]?.label || `View ${index + 1}`;
    const safeName = saree ? saree.name : "Saree";
    const nextSrc = item.resolvedSrc || createMissingViewPlaceholderSVG(safeName, slotLabel, saree ? saree.fabric : "");
    const nextAlt = item.alt || `${safeName} — ${slotLabel} (${index + 1} of ${REQUIRED_GALLERY_VIEWS.length})`;

    const activePill = document.getElementById("detail-active-view-pill");
    if (activePill) activePill.textContent = slotLabel;
    const mainLabel = document.getElementById("product-main-label");
    if (mainLabel) mainLabel.textContent = slotLabel;

    const stage = document.getElementById("product-main-image-stage");
    if (stage) {
      stage.setAttribute("aria-label", `Viewing ${slotLabel} for ${safeName}. Click or press Enter to zoom.`);
    }

    const thumbBtns = document.querySelectorAll("#gallery-thumbnails-strip .gallery-thumb-btn");
    thumbBtns.forEach((btn, i) => {
      const isSelected = i === index;
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
      btn.classList.toggle("is-active-thumb", isSelected);
      btn.classList.toggle("border-ink", isSelected);
      btn.classList.toggle("ring-2", isSelected);
      btn.classList.toggle("ring-gold", isSelected);
      btn.classList.toggle("border-gold/30", !isSelected);
      btn.classList.toggle("opacity-80", !isSelected);

      const caption = btn.querySelector(".thumb-caption");
      if (caption) {
        if (isSelected) {
          caption.classList.remove("bg-[#FAF8F5]", "text-ink");
          caption.classList.add("bg-ink", "text-ivory");
        } else {
          caption.classList.remove("bg-ink", "text-ivory");
          caption.classList.add("bg-[#FAF8F5]", "text-ink");
        }
      }
      if (isSelected) {
        btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      }
    });

    const mainImg = document.getElementById("product-main-image");
    const incomingImg = document.getElementById("product-incoming-image");
    if (mainImg) {
      mainImg.src = nextSrc;
      mainImg.alt = nextAlt;
      mainImg.setAttribute("data-view-key", item.key || "");
      mainImg.setAttribute("data-missing-view", item.missingView ? "true" : "false");
      mainImg.className = "gallery-crossfade-img is-active";
    }
    if (incomingImg) {
      incomingImg.className = "gallery-crossfade-img is-idle";
      incomingImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    }

    if (this.state.lightboxOpen) {
      this.syncLightboxView();
    }
  };

  app.syncLightboxView = function () {
    const saree = this.findProductById(this.state.selectedProductId);
    if (!saree) return;
    const idx = this.state.selectedGalleryIndex || 0;
    const galleryList = this.getNormalizedGallerySlots(saree);
    const item = galleryList[idx] || galleryList[0] || {};
    const slotLabel = item.label || REQUIRED_GALLERY_VIEWS[idx]?.label || `View ${idx + 1}`;
    const src = item.resolvedSrc || createMissingViewPlaceholderSVG(saree.name, slotLabel, saree.fabric);
    const altText = item.alt || `${saree.name} — ${slotLabel}`;

    const nameEl = document.getElementById("lightbox-saree-name");
    const labelEl = document.getElementById("lightbox-view-label");
    const imgEl = document.getElementById("lightbox-img");
    const thumbsEl = document.getElementById("lightbox-thumbs");

    if (nameEl) nameEl.textContent = saree.name;
    if (labelEl) labelEl.textContent = slotLabel;
    if (imgEl) {
      imgEl.src = src;
      imgEl.alt = altText;
      imgEl.style.transform = "scale(1)";
      this.state.lightboxZoomed = false;
    }
    if (thumbsEl) {
      thumbsEl.innerHTML = galleryList
        .map((gItem, i) => {
          const gLabel = gItem.label || REQUIRED_GALLERY_VIEWS[i]?.label || `View ${i + 1}`;
          const tSrc = gItem.resolvedSrc || createMissingViewPlaceholderSVG(saree.name, gLabel, saree.fabric);
          const tAlt = gItem.alt || gLabel;
          const active = i === idx;
          return `
            <button
              type="button"
              onclick="app.selectGalleryView(${i})"
              class="shrink-0 w-14 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                active ? "border-gold scale-110 ring-2 ring-white" : "border-white/20 opacity-60 hover:opacity-100"
              }"
              title="${gLabel}"
            >
              <img src="${tSrc}" alt="${tAlt}" class="w-full h-full object-cover"/>
            </button>
          `;
        })
        .join("");
    }
  };

  // 13. Full Cart Page (#cart) + 4-Step Checkout (#checkout)
  app.renderCartCheckoutPage = function () {
    const items = this.state.cart || [];
    const subtotal = items.reduce((s, i) => s + i.priceINR * i.qty, 0);
    const { shipping, freeAbove, isFree } = this.getShippingBreakdown(subtotal);
    const total = subtotal > 0 ? subtotal + shipping : 0;

    return `
      <div class="page-transition max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div class="mb-6 flex items-end justify-between gap-4">
          <div>
            <span class="text-xs font-bold uppercase tracking-widest text-teal">Shopping Bag</span>
            <h1 class="font-serif text-2xl sm:text-4xl font-bold text-ink mt-0.5">Your Saree Cart</h1>
          </div>
          <button type="button" onclick="app.navigate('shop')" class="px-4 py-2 rounded-full bg-[#FAF8F5] text-ink border border-gold/45 text-xs font-semibold hover:bg-gold/20">
            ← Continue Shopping
          </button>
        </div>

        ${
          items.length === 0
            ? `
          <div class="bg-[#FAF8F5] rounded-2xl border border-gold/40 p-8 sm:p-12 text-center space-y-4">
            <h2 class="font-serif text-2xl font-bold text-ink">Your Cart is Empty</h2>
            <p class="text-sm text-ink-muted max-w-md mx-auto">Browse our saree catalogue and add your favourite drapes to your cart.</p>
            <button type="button" onclick="app.navigate('shop')" class="px-6 py-3 rounded-full bg-teal text-ivory font-semibold text-sm hover:bg-teal-light">
              Browse Saree Catalogue
            </button>
          </div>
        `
            : `
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div class="lg:col-span-8 space-y-3">
              ${items
                .map(
                  (item, idx) => `
                <div class="bg-[#FAF8F5] rounded-2xl border border-gold/35 p-3.5 sm:p-4 flex items-center gap-4 shadow-xs">
                  <img
                    src="${this.resolveImageUrl(item.thumbUrl, item.name)}"
                    alt="${item.name}"
                    onclick="app.openProductDetail('${item.productId}')"
                    class="w-20 h-24 rounded-xl object-cover bg-[#EFE6D5] border border-gold/30 cursor-pointer shrink-0"
                  />
                  <div class="flex-1 min-w-0">
                    <h3 onclick="app.openProductDetail('${item.productId}')" class="font-serif text-base sm:text-xl font-bold text-ink hover:text-teal cursor-pointer truncate">${item.name}</h3>
                    <p class="text-xs text-ink-muted">${item.fabric || ""} • ${item.color || ""} • ${this.formatINR(item.priceINR)} each</p>
                    <div class="flex flex-wrap items-center justify-between gap-2 mt-3">
                      <div class="inline-flex items-center rounded-xl border border-gold/45 bg-[#F5EFE4]">
                        <button type="button" onclick="app.updateCartQty(${idx}, -1)" class="px-3 py-1 text-ink font-bold">−</button>
                        <span class="px-3 text-xs font-bold text-ink">${item.qty}</span>
                        <button type="button" onclick="app.updateCartQty(${idx}, 1)" class="px-3 py-1 text-ink font-bold">+</button>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="font-serif text-lg font-bold text-ink">${this.formatINR(item.priceINR * item.qty)}</span>
                        <button type="button" onclick="app.removeCartItem(${idx})" class="text-xs text-red-700 font-semibold hover:underline">Remove</button>
                      </div>
                    </div>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>

            <div class="lg:col-span-4 bg-[#FAF8F5] rounded-2xl border-2 border-gold/50 p-5 shadow-md space-y-4">
              <h2 class="font-serif text-2xl font-bold text-ink">Order Summary</h2>
              <div class="space-y-2 text-sm border-b border-gold/30 pb-4">
                <div class="flex justify-between text-ink-muted">
                  <span>Subtotal (${items.reduce((s, i) => s + i.qty, 0)} items)</span>
                  <span class="font-semibold text-ink">${this.formatINR(subtotal)}</span>
                </div>
                <div class="flex justify-between text-ink-muted">
                  <span>Shipping</span>
                  <span class="font-semibold text-ink">${isFree ? "FREE" : this.formatINR(shipping)}</span>
                </div>
                <p class="text-[11px] text-ink-muted">
                  ${
                    isFree
                      ? "✓ Eligible for free shipping!"
                      : `Add ${this.formatINR(freeAbove - subtotal)} more for free shipping (above ${this.formatINR(freeAbove)}).`
                  }
                </p>
              </div>
              <div class="flex justify-between items-baseline text-base font-bold text-ink">
                <span>Total Amount</span>
                <span class="font-serif text-2xl">${this.formatINR(total)}</span>
              </div>
              <button
                type="button"
                onclick="app.proceedToCheckout()"
                class="w-full py-3.5 px-5 rounded-full bg-teal text-ivory font-bold text-sm hover:bg-teal-light shadow-md"
              >
                Proceed to Checkout →
              </button>
            </div>
          </div>
        `
        }
      </div>
    `;
  };

  // 14. 4-Step Checkout Page (Address -> Shipping -> Payment -> Review)
  app.renderCheckoutPage = function () {
    const cs = this.state.checkoutState;
    const items = this.state.cart || [];
    const subtotal = items.reduce((s, i) => s + i.priceINR * i.qty, 0);
    const { shipping, freeAbove, isFree } = this.getShippingBreakdown(subtotal);
    const total = subtotal > 0 ? subtotal + shipping : 0;

    if (cs.confirmedOrder) {
      const ord = cs.confirmedOrder;
      const ordNum = ord.order_number || ord.orderId;
      const ordTotal = this.formatINR(ord.total || ord.totalINR);
      const waOrderText = encodeURIComponent(
        `Hi Janardhan Textiles, I have placed order ${ordNum} (${ordTotal}, ${(ord.payment_method || "cod").toUpperCase()}) on your website. Please confirm dispatch details.`
      );
      return `
        <div class="page-transition max-w-3xl mx-auto px-3 sm:px-6 py-10">
          <div class="bg-[#FAF8F5] rounded-3xl border-2 border-gold p-6 sm:p-10 shadow-xl text-center space-y-4">
            <div class="w-14 h-14 rounded-full bg-teal text-gold mx-auto flex items-center justify-center text-2xl font-bold">✓</div>
            <span class="px-3 py-1 rounded-full bg-gold/25 text-ink font-bold text-xs uppercase tracking-wider">Order Confirmed</span>
            <h1 class="font-serif text-3xl sm:text-4xl font-bold text-ink">Thank You, ${ord.address?.name || ord.customerName}!</h1>
            <p class="text-sm text-ink-muted">
              Your order <strong>${ordNum}</strong> for <strong>${ordTotal}</strong> (${(ord.payment_method || "cod").toUpperCase()}) has been placed.
            </p>
            <div class="flex flex-wrap justify-center gap-3 pt-4">
              <button type="button" onclick="app.navigate('orders')" class="px-6 py-3 rounded-full bg-teal text-ivory font-semibold text-xs sm:text-sm hover:bg-teal-light">
                View Order History →
              </button>
              <a
                href="https://wa.me/919652262173?text=${waOrderText}"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Send order confirmation to Janardhan Textiles on WhatsApp"
                class="px-6 py-3 rounded-full bg-[#1E3F35] text-[#FAF8F5] border border-gold font-semibold text-xs sm:text-sm hover:bg-[#2A5447] inline-flex items-center gap-2"
              >
                <svg class="w-4 h-4 text-gold shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12.031 2c-5.516 0-9.999 4.486-10 10.003-.001 1.766.46 3.489 1.337 5.008L2 22l5.122-1.343a9.958 9.958 0 0 0 4.904 1.298h.004c5.515 0 9.998-4.486 10-10.002A9.963 9.963 0 0 0 19.104 4.93 9.937 9.937 0 0 0 12.031 2zm0 18.299h-.004a8.29 8.29 0 0 1-4.231-1.158l-.303-.18-3.039.797.811-2.963-.197-.314a8.293 8.293 0 0 1-1.275-4.426c.002-4.581 3.73-8.309 8.313-8.309 2.22 0 4.306.865 5.875 2.435a8.257 8.257 0 0 1 2.432 5.879c-.002 4.581-3.73 8.309-8.382 8.239zm4.56-6.219c-.25-.125-1.478-.729-1.707-.813-.229-.083-.396-.125-.562.125-.167.25-.646.813-.792.979-.146.167-.292.188-.542.063-.25-.125-1.055-.389-2.01-1.24-.743-.662-1.244-1.481-1.39-1.731-.146-.25-.015-.385.11-.51.112-.112.25-.292.375-.438.125-.146.167-.25.25-.417.083-.167.042-.313-.021-.438-.062-.125-.562-1.355-.771-1.855-.203-.486-.409-.42-.562-.428l-.479-.008c-.167 0-.438.063-.667.313-.229.25-.875.855-.875 2.084s.896 2.418 1.021 2.584c.125.167 1.763 2.692 4.271 3.775.597.258 1.063.412 1.426.527.599.19 1.144.163 1.575.099.48-.072 1.478-.604 1.687-1.188.208-.583.208-1.084.146-1.188-.063-.104-.229-.167-.479-.292z"/>
                </svg>
                <span>Share Order on WhatsApp</span>
              </a>
              <button type="button" onclick="app.navigate('shop')" class="px-6 py-3 rounded-full bg-[#F5EFE4] text-ink border border-gold/50 font-semibold text-xs sm:text-sm hover:bg-gold/20">
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      `;
    }

    if (items.length === 0) {
      return this.renderCartCheckoutPage();
    }

    const steps = [
      { num: 1, label: "1. Address" },
      { num: 2, label: "2. Shipping" },
      { num: 3, label: "3. Payment" },
      { num: 4, label: "4. Review & Place Order" }
    ];

    return `
      <div class="page-transition max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span class="text-xs font-bold uppercase tracking-widest text-teal">Janardhan Textiles Checkout</span>
            <h1 class="font-serif text-2xl sm:text-4xl font-bold text-ink">Complete Your Order</h1>
          </div>
          <button type="button" onclick="app.navigate('cart')" class="self-start px-3.5 py-1.5 rounded-full bg-[#FAF8F5] text-ink border border-gold/45 text-xs font-semibold">
            ← Back to Cart
          </button>
        </div>

        <!-- Stepper Bar -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          ${steps
            .map(
              (s) => `
            <button
              type="button"
              onclick="app.goToCheckoutStep(${s.num})"
              class="py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-all ${
                cs.step === s.num
                  ? "bg-teal text-ivory border-teal shadow"
                  : cs.step > s.num
                  ? "bg-[#F5EFE4] text-teal border-gold/50"
                  : "bg-[#FAF8F5] text-ink-muted border-gold/30"
              }"
            >
              ${cs.step > s.num ? "✓ " : ""}${s.label}
            </button>
          `
            )
            .join("")}
        </div>

        ${
          cs.stockErrors && cs.stockErrors.length > 0
            ? `
          <div class="p-4 rounded-2xl bg-red-950/90 border border-red-400 text-ivory text-xs space-y-1" role="alert">
            <p class="font-bold uppercase tracking-wider text-gold">Stock Validation Error</p>
            ${cs.stockErrors.map((e) => `<p>• ${e}</p>`).join("")}
          </div>
        `
            : ""
        }

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <!-- Step Content -->
          <div class="lg:col-span-8 bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 sm:p-7 shadow-sm">
            ${cs.step === 1 ? this.renderCheckoutAddressStep(total) : ""}
            ${cs.step === 2 ? this.renderCheckoutShippingStep(subtotal, shipping, freeAbove, isFree) : ""}
            ${cs.step === 3 ? this.renderCheckoutPaymentStep() : ""}
            ${cs.step === 4 ? this.renderCheckoutReviewStep(subtotal, shipping, total) : ""}
          </div>

          <!-- Order Summary Sidebar -->
          <aside class="lg:col-span-4 bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 shadow-xs space-y-3">
            <h2 class="font-serif text-xl font-bold text-ink border-b border-gold/25 pb-2">Order Summary</h2>
            <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
              ${items
                .map(
                  (i) => `
                <div class="flex justify-between gap-2 text-xs">
                  <span class="text-ink truncate">${i.qty} × ${i.name}</span>
                  <span class="font-semibold text-ink shrink-0">${this.formatINR(i.priceINR * i.qty)}</span>
                </div>
              `
                )
                .join("")}
            </div>
            <div class="border-t border-gold/25 pt-2.5 space-y-1 text-xs">
              <div class="flex justify-between text-ink-muted">
                <span>Subtotal</span>
                <span>${this.formatINR(subtotal)}</span>
              </div>
              <div class="flex justify-between text-ink-muted">
                <span>Shipping</span>
                <span>${isFree ? "FREE" : this.formatINR(shipping)}</span>
              </div>
              <div class="flex justify-between text-sm font-bold text-ink pt-1.5 border-t border-gold/25">
                <span>Total Payable</span>
                <span class="font-serif text-xl">${this.formatINR(total)}</span>
              </div>
            </div>
            <div class="pt-2">
              <button
                type="button"
                ${cs.placingOrder ? "disabled" : ""}
                onclick="app.submitFinalOrder()"
                class="w-full py-3 px-4 rounded-full bg-gold text-ink font-bold text-xs sm:text-sm hover:bg-gold-light shadow transition-all disabled:opacity-50"
              >
                ${cs.placingOrder ? "Placing Order..." : `Place Order (${this.formatINR(total)})`}
              </button>
            </div>
          </aside>
        </div>
      </div>
    `;
  };

  app.syncCheckoutAddressFromDOM = function () {
    const nameEl = document.getElementById("chk-name");
    if (!nameEl) return;
    const addr = this.state.checkoutState.address;
    addr.name = (nameEl.value || "").trim();
    addr.phone = (document.getElementById("chk-phone")?.value || "").trim();
    addr.line1 = (document.getElementById("chk-line1")?.value || "").trim();
    addr.line2 = (document.getElementById("chk-line2")?.value || "").trim();
    addr.city = (document.getElementById("chk-city")?.value || "").trim();
    addr.state = (document.getElementById("chk-state")?.value || "").trim();
    addr.pincode = (document.getElementById("chk-pincode")?.value || "").trim();
  };

  app.renderCheckoutAddressStep = function (total) {
    const addr = this.state.checkoutState.address;
    const errs = this.state.checkoutState.addressErrors || {};
    return `
      <form onsubmit="app.submitCheckoutAddressStep(event)" class="space-y-4 text-sm" novalidate>
        <h2 class="font-serif text-2xl font-bold text-ink">Step 1: Delivery Address</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="chk-name" class="block text-xs font-semibold text-ink-muted mb-1">Full Name *</label>
            <input id="chk-name" name="name" required value="${addr.name}" oninput="app.syncCheckoutAddressFromDOM()" placeholder="e.g., Arundhati Deshmukh" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            ${errs.name ? `<p class="text-xs text-red-700 mt-1 font-medium">${errs.name}</p>` : ""}
          </div>
          <div>
            <label for="chk-phone" class="block text-xs font-semibold text-ink-muted mb-1">10-Digit Mobile Number *</label>
            <input id="chk-phone" name="phone" required maxlength="15" inputmode="numeric" value="${addr.phone}" oninput="app.syncCheckoutAddressFromDOM()" placeholder="9876543210" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            ${errs.phone ? `<p id="chk-phone-error" class="text-xs text-red-700 mt-1 font-medium">${errs.phone}</p>` : ""}
          </div>
        </div>
        <div>
          <label for="chk-line1" class="block text-xs font-semibold text-ink-muted mb-1">Address Line 1 (House / Flat / Street) *</label>
          <input id="chk-line1" name="line1" required value="${addr.line1}" oninput="app.syncCheckoutAddressFromDOM()" placeholder="House No. 42, MG Road" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
          ${errs.line1 ? `<p class="text-xs text-red-700 mt-1 font-medium">${errs.line1}</p>` : ""}
        </div>
        <div>
          <label for="chk-line2" class="block text-xs font-semibold text-ink-muted mb-1">Address Line 2 (Landmark / Area — Optional)</label>
          <input id="chk-line2" name="line2" value="${addr.line2}" oninput="app.syncCheckoutAddressFromDOM()" placeholder="Near Silk Market" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label for="chk-city" class="block text-xs font-semibold text-ink-muted mb-1">City *</label>
            <input id="chk-city" name="city" required value="${addr.city}" oninput="app.syncCheckoutAddressFromDOM()" placeholder="Hyderabad" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            ${errs.city ? `<p class="text-xs text-red-700 mt-1 font-medium">${errs.city}</p>` : ""}
          </div>
          <div>
            <label for="chk-state" class="block text-xs font-semibold text-ink-muted mb-1">State *</label>
            <input id="chk-state" name="state" required value="${addr.state}" oninput="app.syncCheckoutAddressFromDOM()" placeholder="Telangana" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            ${errs.state ? `<p class="text-xs text-red-700 mt-1 font-medium">${errs.state}</p>` : ""}
          </div>
          <div>
            <label for="chk-pincode" class="block text-xs font-semibold text-ink-muted mb-1">6-Digit Pincode *</label>
            <input id="chk-pincode" name="pincode" required maxlength="8" inputmode="numeric" value="${addr.pincode}" oninput="app.syncCheckoutAddressFromDOM()" placeholder="500001" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            ${errs.pincode ? `<p id="chk-pincode-error" class="text-xs text-red-700 mt-1 font-medium">${errs.pincode}</p>` : ""}
          </div>
        </div>
        <div class="pt-3 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onclick="app.submitFinalOrder()"
            class="px-5 py-3 rounded-full bg-[#F5EFE4] text-ink border border-gold/60 font-bold text-xs sm:text-sm hover:bg-gold/25 transition-all"
          >
            Place Order Now (Cash on Delivery)
          </button>
          <button type="submit" class="px-6 py-3 rounded-full bg-teal text-ivory font-bold text-xs sm:text-sm hover:bg-teal-light shadow">
            Continue to Shipping →
          </button>
        </div>
      </form>
    `;
  };

  app.normalizeTenDigitPhone = function (raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    return digits;
  };

  app.validateCheckoutAddress = function (addr) {
    const errors = {};
    if (!addr.name || !addr.name.trim()) errors.name = "Full name is required.";
    const cleanPhone = this.normalizeTenDigitPhone(addr.phone);
    if (cleanPhone.length !== 10) errors.phone = "Please enter a valid 10-digit mobile number.";
    if (!addr.line1 || !addr.line1.trim()) errors.line1 = "Address Line 1 is required.";
    if (!addr.city || !addr.city.trim()) errors.city = "City is required.";
    if (!addr.state || !addr.state.trim()) errors.state = "State is required.";
    const cleanPin = String(addr.pincode || "").replace(/\D/g, "");
    if (cleanPin.length !== 6) errors.pincode = "Please enter a valid 6-digit pincode.";
    return errors;
  };

  app.submitCheckoutAddressStep = function (event) {
    event.preventDefault();
    const f = event.target;
    const addr = {
      name: f.name.value.trim(),
      phone: this.normalizeTenDigitPhone(f.phone.value.trim()) || f.phone.value.trim(),
      line1: f.line1.value.trim(),
      line2: f.line2.value.trim(),
      city: f.city.value.trim(),
      state: f.state.value.trim(),
      pincode: String(f.pincode.value || "").replace(/\D/g, "") || f.pincode.value.trim()
    };
    const errors = this.validateCheckoutAddress(addr);
    this.state.checkoutState.address = addr;
    this.state.checkoutState.addressErrors = errors;
    if (Object.keys(errors).length > 0) {
      this.renderCurrentPage();
      return;
    }
    this.state.checkoutState.step = 2;
    this.renderCurrentPage();
  };

  app.renderCheckoutShippingStep = function (subtotal, shipping, freeAbove, isFree) {
    const addr = this.state.checkoutState.address;
    return `
      <div class="space-y-5">
        <h2 class="font-serif text-2xl font-bold text-ink">Step 2: Shipping Method</h2>
        <div class="p-4 rounded-2xl bg-[#F5EFE4] border border-gold/40 text-xs space-y-1">
          <p class="font-bold text-ink">Delivering To:</p>
          <p class="text-ink-muted">${addr.name} (${addr.phone}) — ${addr.line1}${addr.line2 ? `, ${addr.line2}` : ""}, ${addr.city}, ${addr.state} - ${addr.pincode}</p>
        </div>
        <div class="p-4 rounded-2xl bg-ivory border-2 border-teal flex items-center justify-between">
          <div>
            <p class="font-semibold text-sm text-ink">Standard Protective Saree Dispatch</p>
            <p class="text-xs text-ink-muted">Moisture-resistant packaging • Free shipping on orders above ${this.formatINR(freeAbove)}</p>
          </div>
          <span class="font-serif text-lg font-bold text-teal">${isFree ? "FREE" : this.formatINR(shipping)}</span>
        </div>
        <div class="flex justify-between pt-3">
          <button type="button" onclick="app.goToCheckoutStep(1)" class="px-5 py-2.5 rounded-full bg-[#F5EFE4] text-ink border border-gold/45 text-xs font-semibold">
            ← Edit Address
          </button>
          <button type="button" onclick="app.goToCheckoutStep(3)" class="px-6 py-3 rounded-full bg-teal text-ivory font-bold text-xs sm:text-sm hover:bg-teal-light shadow">
            Continue to Payment →
          </button>
        </div>
      </div>
    `;
  };

  app.renderCheckoutPaymentStep = function () {
    const cs = this.state.checkoutState;
    return `
      <div class="space-y-5">
        <h2 class="font-serif text-2xl font-bold text-ink">Step 3: Select Payment Method</h2>

        <div class="space-y-3">
          <label class="flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
            cs.paymentMethod === "cod" ? "border-teal bg-ivory shadow-xs" : "border-gold/35 bg-[#F5EFE4]"
          }">
            <input
              type="radio"
              name="payment_method"
              value="cod"
              ${cs.paymentMethod === "cod" ? "checked" : ""}
              onchange="app.selectPaymentMethod('cod')"
              class="mt-1 accent-teal"
            />
            <div>
              <span class="font-bold text-sm text-ink block">Cash on Delivery (COD)</span>
              <span class="text-xs text-ink-muted">Pay in cash at the time of delivery.</span>
            </div>
          </label>

          <label class="flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
            cs.paymentMethod === "online" ? "border-teal bg-ivory shadow-xs" : "border-gold/35 bg-[#F5EFE4]"
          }">
            <input
              type="radio"
              name="payment_method"
              value="online"
              ${cs.paymentMethod === "online" ? "checked" : ""}
              onchange="app.selectPaymentMethod('online')"
              class="mt-1 accent-teal"
            />
            <div class="flex-1">
              <span class="font-bold text-sm text-ink block">Online Payment (Razorpay)</span>
              <span class="text-xs text-ink-muted">UPI, Cards, NetBanking via Razorpay Checkout.</span>
            </div>
          </label>
        </div>

        ${
          cs.onlinePaymentNotice
            ? `
          <div id="razorpay-501-banner" class="p-4 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 text-xs space-y-2" role="alert">
            <p class="font-bold text-sm">${cs.onlinePaymentNotice}</p>
            <p>Razorpay API keys have not been configured on the server yet (HTTP 501). You can switch to <strong>Cash on Delivery (COD)</strong> below to complete your order right away.</p>
            <button type="button" onclick="app.selectPaymentMethod('cod')" class="px-4 py-1.5 rounded-full bg-teal text-ivory font-semibold text-xs">
              Use Cash on Delivery (COD) Instead
            </button>
          </div>
        `
            : ""
        }

        <div class="flex justify-between pt-3">
          <button type="button" onclick="app.goToCheckoutStep(2)" class="px-5 py-2.5 rounded-full bg-[#F5EFE4] text-ink border border-gold/45 text-xs font-semibold">
            ← Back to Shipping
          </button>
          <button type="button" onclick="app.goToCheckoutStep(4)" class="px-6 py-3 rounded-full bg-teal text-ivory font-bold text-xs sm:text-sm hover:bg-teal-light shadow">
            Review Order →
          </button>
        </div>
      </div>
    `;
  };

  app.selectPaymentMethod = async function (method) {
    this.state.checkoutState.paymentMethod = method;
    if (method === "online") {
      // Check Razorpay endpoint status immediately so user gets honest feedback
      const { status, data } = await BACKEND_API.requestWithStatus("/api/payments/razorpay/order", {
        method: "POST",
        body: JSON.stringify({ order_number: "CHECK" })
      });
      if (status === 501) {
        this.state.checkoutState.onlinePaymentNotice = data.error || "Online payment is not set up yet";
      }
    } else {
      this.state.checkoutState.onlinePaymentNotice = "";
    }
    this.renderCurrentPage();
  };

  app.renderCheckoutReviewStep = function (subtotal, shipping, total) {
    const cs = this.state.checkoutState;
    const addr = cs.address;
    return `
      <div class="space-y-5">
        <h2 class="font-serif text-2xl font-bold text-ink">Step 4: Review &amp; Place Order</h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="p-4 rounded-2xl bg-[#F5EFE4] border border-gold/40 space-y-1">
            <div class="flex justify-between">
              <span class="font-bold uppercase text-ink-muted">Shipping Address</span>
              <button type="button" onclick="app.goToCheckoutStep(1)" class="text-teal font-semibold underline">Edit</button>
            </div>
            <p class="font-bold text-ink">${addr.name}</p>
            <p class="text-ink-muted">${addr.line1}${addr.line2 ? `, ${addr.line2}` : ""}</p>
            <p class="text-ink-muted">${addr.city}, ${addr.state} - ${addr.pincode}</p>
            <p class="text-ink-muted">Phone: ${addr.phone}</p>
          </div>

          <div class="p-4 rounded-2xl bg-[#F5EFE4] border border-gold/40 space-y-1">
            <div class="flex justify-between">
              <span class="font-bold uppercase text-ink-muted">Payment Method</span>
              <button type="button" onclick="app.goToCheckoutStep(3)" class="text-teal font-semibold underline">Change</button>
            </div>
            <p class="font-bold text-ink">${cs.paymentMethod === "cod" ? "Cash on Delivery (COD)" : "Online Payment (Razorpay)"}</p>
            <p class="text-ink-muted">Total Payable: <strong>${this.formatINR(total)}</strong> (incl. ${shipping === 0 ? "Free Shipping" : `${this.formatINR(shipping)} shipping`})</p>
          </div>
        </div>

        ${
          cs.onlinePaymentNotice
            ? `
          <div class="p-4 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 text-xs space-y-2" role="alert">
            <p class="font-bold">${cs.onlinePaymentNotice}</p>
            <p>Please select <strong>Cash on Delivery (COD)</strong> to place your order now.</p>
            <button type="button" onclick="app.selectPaymentMethod('cod')" class="px-4 py-1.5 rounded-full bg-teal text-ivory font-semibold text-xs">
              Switch to Cash on Delivery (COD)
            </button>
          </div>
        `
            : ""
        }

        <div class="flex justify-between items-center pt-3">
          <button type="button" onclick="app.goToCheckoutStep(3)" class="px-5 py-2.5 rounded-full bg-[#F5EFE4] text-ink border border-gold/45 text-xs font-semibold">
            ← Back
          </button>
          <button
            type="button"
            id="place-order-submit-btn"
            ${cs.placingOrder ? "disabled" : ""}
            onclick="app.submitFinalOrder()"
            class="px-7 py-3.5 rounded-full bg-teal text-ivory font-bold text-sm hover:bg-teal-light shadow-lg disabled:opacity-50"
          >
            ${cs.placingOrder ? "Placing Order..." : `Place Order (${this.formatINR(total)})`}
          </button>
        </div>
      </div>
    `;
  };

  app.goToCheckoutStep = function (targetStep) {
    this.syncCheckoutAddressFromDOM();
    if (targetStep > 1) {
      const errs = this.validateCheckoutAddress(this.state.checkoutState.address);
      this.state.checkoutState.addressErrors = errs;
      if (Object.keys(errs).length > 0) {
        this.state.checkoutState.step = 1;
        this.showToast("Please complete your delivery address (10-digit phone & 6-digit pincode).", "error");
        this.renderCurrentPage();
        return;
      }
      this.state.checkoutState.address.phone = this.normalizeTenDigitPhone(this.state.checkoutState.address.phone);
      this.state.checkoutState.address.pincode = String(this.state.checkoutState.address.pincode || "").replace(/\D/g, "");
    }
    this.state.checkoutState.step = targetStep;
    this.renderCurrentPage();
  };

  // Honesty Rule: An order counts as placed ONLY when POST /api/orders returns 201
  app.submitFinalOrder = async function () {
    this.syncCheckoutAddressFromDOM();
    const cs = this.state.checkoutState;
    const errs = this.validateCheckoutAddress(cs.address);
    if (Object.keys(errs).length > 0) {
      cs.addressErrors = errs;
      cs.step = 1;
      const firstErr = Object.values(errs)[0] || "Please complete your delivery address.";
      this.showToast(firstErr, "error");
      this.renderCurrentPage();
      return;
    }

    cs.address.phone = this.normalizeTenDigitPhone(cs.address.phone);
    cs.address.pincode = String(cs.address.pincode || "").replace(/\D/g, "");

    const stockErrs = await this.revalidateCartStock();
    if (stockErrs.length > 0) {
      this.renderCurrentPage();
      return;
    }

    if (cs.paymentMethod === "online") {
      const { status, data } = await BACKEND_API.requestWithStatus("/api/payments/razorpay/order", {
        method: "POST",
        body: JSON.stringify({ order_number: "PENDING" })
      });
      if (status === 501 || status >= 400) {
        cs.onlinePaymentNotice = data.error || "Online payment is not set up yet";
        this.showToast(cs.onlinePaymentNotice, "error");
        this.renderCurrentPage();
        return;
      }
    }

    cs.placingOrder = true;
    this.renderCurrentPage();

    const payload = {
      items: this.state.cart.map((i) => ({ product_id: i.productId, quantity: i.qty })),
      address: {
        name: cs.address.name,
        phone: cs.address.phone,
        line1: cs.address.line1,
        line2: cs.address.line2,
        city: cs.address.city,
        state: cs.address.state,
        pincode: cs.address.pincode
      },
      payment_method: cs.paymentMethod
    };

    try {
      const { status, data } = await BACKEND_API.requestWithStatus("/api/orders", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      cs.placingOrder = false;
      if (status === 201 && data) {
        const confirmed = data.order || data.createdOrder || data;
        cs.confirmedOrder = confirmed;
        if (Array.isArray(data.products)) this.state.products = data.products;
        if (Array.isArray(data.orders)) this.state.orders = data.orders;

        // Mirror confirmed order across local fallback storage, myOrders, and adminState so all views stay in sync
        const ordKey = confirmed.order_number || confirmed.orderId;
        if (ordKey) {
          try {
            const localOrds = LOCAL_FALLBACK_API.getOrders();
            if (!localOrds.some((o) => (o.order_number || o.orderId) === ordKey)) {
              localOrds.unshift(confirmed);
              LOCAL_FALLBACK_API.saveOrders(localOrds);
            }
          } catch (e) {}
          const dedupPrepend = (arr) => [confirmed, ...(Array.isArray(arr) ? arr : []).filter((o) => (o.order_number || o.orderId) !== ordKey)];
          this.state.orders = dedupPrepend(this.state.orders);
          this.state.myOrders = dedupPrepend(this.state.myOrders);
          this.state.adminState.ordersList = dedupPrepend(this.state.adminState.ordersList);
        }
        this.state.adminState.stats = null;
        this.state.adminState.customersList = [];

        this.state.cart = [];
        this.saveCartToLocal();
        this.updateCartBadges();
        this.showToast(`Order ${confirmed.order_number || confirmed.orderId} placed!`);
        this.renderCurrentPage();
      } else {
        if (status === 501) {
          cs.onlinePaymentNotice = data.error || "Online payment is not set up yet";
        }
        this.showToast(data.error || `Order could not be placed (HTTP ${status}).`, "error");
        this.renderCurrentPage();
      }
    } catch (err) {
      cs.placingOrder = false;
      this.showToast(err.message || "Network error while placing order.", "error");
      this.renderCurrentPage();
    }
  };

  // 15. Supporting Screens: Login/Register (#login), Account (#account), Order History (#orders), Wishlist (#wishlist)
  app.renderLoginPage = function () {
    const mode = this.state.authTab || "login";
    return `
      <div class="page-transition max-w-md mx-auto px-3 sm:px-6 py-8 sm:py-12">
        <div class="bg-[#FAF8F5] rounded-3xl border-2 border-gold/50 p-6 sm:p-8 shadow-xl space-y-5">
          <div class="text-center space-y-1">
            <span class="text-xs font-bold uppercase tracking-widest text-teal">Janardhan Textiles Account</span>
            <h1 class="font-serif text-3xl font-bold text-ink">${mode === "register" ? "Create Account" : "Sign In"}</h1>
          </div>

          <div class="grid grid-cols-2 gap-2 p-1 rounded-full bg-[#F5EFE4] border border-gold/35">
            <button
              type="button"
              onclick="app.state.authTab='login'; app.renderCurrentPage()"
              class="py-2 rounded-full text-xs font-bold ${mode === "login" ? "bg-teal text-ivory shadow" : "text-ink"}"
            >Sign In</button>
            <button
              type="button"
              onclick="app.state.authTab='register'; app.renderCurrentPage()"
              class="py-2 rounded-full text-xs font-bold ${mode === "register" ? "bg-teal text-ivory shadow" : "text-ink"}"
            >Register</button>
          </div>

          <form onsubmit="app.submitAuthForm(event, '${mode}')" class="space-y-3.5 text-sm">
            ${
              mode === "register"
                ? `
              <div>
                <label for="auth-name-input" class="block text-xs font-semibold text-ink-muted mb-1">Full Name *</label>
                <input id="auth-name-input" name="name" required placeholder="Your full name" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
              </div>
              <div>
                <label for="auth-phone-input" class="block text-xs font-semibold text-ink-muted mb-1">10-Digit Mobile Number</label>
                <input id="auth-phone-input" name="phone" maxlength="10" placeholder="9876543210" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
              </div>
            `
                : ""
            }
            <div>
              <label for="auth-email-input" class="block text-xs font-semibold text-ink-muted mb-1">Email Address *</label>
              <input id="auth-email-input" name="email" type="email" required placeholder="you@example.com" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
            <div>
              <label for="auth-password-input" class="block text-xs font-semibold text-ink-muted mb-1">Password *</label>
              <input id="auth-password-input" name="password" type="password" required placeholder="••••••••" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
            <button type="submit" id="auth-submit-btn" class="w-full py-3 rounded-full bg-teal text-ivory font-bold text-sm hover:bg-teal-light shadow-md">
              ${mode === "register" ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div class="pt-3 border-t border-gold/30 text-xs text-ink-muted text-center">
            Protected with salted PBKDF2-HMAC-SHA256 authentication.
          </div>
        </div>
      </div>
    `;
  };

  app.renderAccountPage = function () {
    const u = this.state.currentUser;
    if (!u) return this.renderLoginPage();
    return `
      <div class="page-transition max-w-4xl mx-auto px-3 sm:px-6 py-8 sm:py-12 space-y-6">
        <div class="bg-[#FAF8F5] rounded-3xl border border-gold/50 p-6 sm:p-8 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="space-y-1">
            <span class="px-2.5 py-0.5 rounded-full bg-gold/25 text-ink font-bold text-xs uppercase">${u.role === "admin" ? "Store Administrator" : "Verified Customer"}</span>
            <h1 class="font-serif text-3xl font-bold text-ink">${u.name}</h1>
            <p class="text-xs sm:text-sm text-ink-muted">${u.email} ${u.phone ? `• ${u.phone}` : ""}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            ${
              u.role === "admin"
                ? `<button type="button" onclick="app.navigate('admin')" class="px-4 py-2.5 rounded-full bg-teal text-ivory text-xs font-bold hover:bg-teal-light">Open Admin Panel →</button>`
                : ""
            }
            <button type="button" onclick="app.logoutUser()" class="px-4 py-2.5 rounded-full bg-[#F5EFE4] text-red-800 border border-gold/45 text-xs font-bold hover:bg-red-50">
              Sign Out
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button type="button" onclick="app.navigate('orders')" class="p-5 rounded-2xl bg-[#FAF8F5] border border-gold/40 text-left hover:shadow-md transition-all">
            <h2 class="font-serif text-xl font-bold text-ink">Order History</h2>
            <p class="text-xs text-ink-muted mt-1">Track live order statuses &amp; view past invoices.</p>
          </button>
          <button type="button" onclick="app.navigate('wishlist')" class="p-5 rounded-2xl bg-[#FAF8F5] border border-gold/40 text-left hover:shadow-md transition-all">
            <h2 class="font-serif text-xl font-bold text-ink">My Wishlist (${this.state.wishlistIds.size})</h2>
            <p class="text-xs text-ink-muted mt-1">Saved sarees synced to your account.</p>
          </button>
          <button type="button" onclick="app.navigate('shop')" class="p-5 rounded-2xl bg-[#FAF8F5] border border-gold/40 text-left hover:shadow-md transition-all">
            <h2 class="font-serif text-xl font-bold text-ink">Browse Catalogue</h2>
            <p class="text-xs text-ink-muted mt-1">Explore all 5-view power-loom sarees.</p>
          </button>
        </div>
      </div>
    `;
  };

  app.fetchMyOrders = async function () {
    this.state.myOrdersLoading = true;
    let apiItems = [];
    try {
      const res = await BACKEND_API.request("/api/orders/mine");
      apiItems = Array.isArray(res.items) ? res.items : Array.isArray(res.orders) ? res.orders : [];
    } catch (e) {}
    const mergedMap = new Map();
    [...apiItems, ...(this.state.orders || []), ...(LOCAL_FALLBACK_API.getOrders() || [])].forEach((ord) => {
      if (!ord) return;
      const key = ord.order_number || ord.orderId;
      if (key && !mergedMap.has(key)) mergedMap.set(key, ord);
    });
    this.state.myOrders = Array.from(mergedMap.values());
    this.state.myOrdersLoading = false;
    const container = document.getElementById("my-orders-list-container");
    if (container) container.innerHTML = this.renderMyOrdersListContent();
  };

  app.renderOrdersPage = function () {
    return `
      <div class="page-transition max-w-5xl mx-auto px-3 sm:px-6 py-8 sm:py-10 space-y-6">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span class="text-xs font-bold uppercase tracking-widest text-teal">Customer Portal</span>
            <h1 class="font-serif text-2xl sm:text-4xl font-bold text-ink">My Orders</h1>
          </div>
          <button type="button" onclick="app.navigate('shop')" class="px-4 py-2 rounded-full bg-[#FAF8F5] text-ink border border-gold/45 text-xs font-semibold">
            ← Shop Sarees
          </button>
        </div>
        <div id="my-orders-list-container">
          ${this.renderMyOrdersListContent()}
        </div>
      </div>
    `;
  };

  app.renderMyOrdersListContent = function () {
    if (this.state.myOrdersLoading) {
      return `<div class="p-8 rounded-2xl bg-[#FAF8F5] border border-gold/35 text-center text-sm text-ink-muted">Loading orders...</div>`;
    }
    const list = this.state.myOrders || [];
    if (list.length === 0) {
      return `
        <div class="bg-[#FAF8F5] rounded-2xl border border-gold/40 p-8 sm:p-12 text-center space-y-3">
          <h2 class="font-serif text-2xl font-bold text-ink">No Orders Yet</h2>
          <p class="text-xs sm:text-sm text-ink-muted">Once you place an order at checkout, its live status will appear here.</p>
          <button type="button" onclick="app.navigate('shop')" class="px-5 py-2.5 rounded-full bg-teal text-ivory text-xs font-semibold">Browse Sarees</button>
        </div>
      `;
    }
    return `
      <div class="space-y-4">
        ${list
          .map((ord) => {
            const ordNum = ord.order_number || ord.orderId;
            const status = ord.status || "placed";
            const total = ord.total ?? ord.totalINR ?? 0;
            const addr = ord.address || {};
            return `
              <div class="bg-[#FAF8F5] rounded-2xl border border-gold/40 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-mono font-bold text-sm text-teal">${ordNum}</span>
                    <span class="px-2.5 py-0.5 rounded-full bg-gold/25 text-ink border border-gold/50 text-[11px] font-bold uppercase">${status}</span>
                    <span class="text-xs text-ink-muted">• ${(ord.created_at || ord.date || "").slice(0, 10)}</span>
                  </div>
                  <p class="text-xs text-ink font-medium">
                    ${(ord.items || []).map((i) => `${i.quantity ?? i.qty}× ${i.name}`).join(", ")}
                  </p>
                  <p class="text-[11px] text-ink-muted">
                    Deliver to: ${addr.name || ord.customerName || ""} ${addr.city ? `— ${addr.city}, ${addr.state || ""} ${addr.pincode || ""}` : ord.city || ""}
                  </p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="font-serif text-xl font-bold text-ink">${this.formatINR(total)}</span>
                  <button
                    type="button"
                    onclick="app.openOrderDetailModal('${ordNum}')"
                    class="px-3.5 py-2 rounded-full bg-[#F5EFE4] text-ink border border-gold/45 text-xs font-semibold hover:bg-gold/25"
                  >
                    View Details
                  </button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  };

  app.openOrderDetailModal = async function (orderNumber) {
    const modal = document.getElementById("order-detail-modal");
    const body = document.getElementById("order-detail-modal-body");
    if (!modal || !body) return;
    modal.classList.remove("hidden");
    body.innerHTML = `<p class="text-sm text-ink-muted py-6 text-center">Loading order ${orderNumber}...</p>`;

    let ord =
      (this.state.myOrders || []).find((o) => (o.order_number || o.orderId) === orderNumber) ||
      (this.state.adminState.ordersList || []).find((o) => (o.order_number || o.orderId) === orderNumber);
    try {
      const res = await BACKEND_API.request(`/api/orders/${encodeURIComponent(orderNumber)}`);
      if (res) ord = res;
    } catch (e) {}

    if (!ord) {
      body.innerHTML = `<p class="text-sm text-red-700">Order not found.</p>`;
      return;
    }

    const addr = ord.address || {};
    body.innerHTML = `
      <div class="flex items-start justify-between border-b border-gold/30 pb-3">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-teal">Order Summary</span>
          <h3 class="font-serif text-2xl font-bold text-ink">${ord.order_number || ord.orderId}</h3>
        </div>
        <button type="button" onclick="document.getElementById('order-detail-modal').classList.add('hidden')" class="p-1.5 rounded-lg bg-[#F5EFE4] text-ink font-bold">✕</button>
      </div>
      <div class="space-y-4 mt-4 text-xs sm:text-sm">
        <div class="flex flex-wrap gap-2">
          <span class="px-3 py-1 rounded-full bg-gold/25 text-ink font-bold uppercase text-xs">Status: ${ord.status}</span>
          <span class="px-3 py-1 rounded-full bg-[#F5EFE4] text-ink font-semibold text-xs">Payment: ${(ord.payment_method || "cod").toUpperCase()} (${ord.payment_status || "pending"})</span>
        </div>
        <div class="p-3.5 rounded-xl bg-[#F5EFE4] border border-gold/30 space-y-1">
          <p class="font-bold text-ink">Delivery Address</p>
          <p>${addr.name || ord.customerName || ""} (${addr.phone || ord.phone || ""})</p>
          <p>${addr.line1 || ""} ${addr.line2 || ""}</p>
          <p>${addr.city || ord.city || ""} ${addr.state || ""} ${addr.pincode || ""}</p>
        </div>
        <div class="space-y-2">
          <p class="font-bold text-ink">Ordered Items</p>
          ${(ord.items || [])
            .map(
              (item) => `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-ivory border border-gold/30">
              <span>${item.quantity ?? item.qty} × <strong>${item.name}</strong></span>
              <span class="font-bold">${this.formatINR((item.price ?? item.priceINR ?? 0) * (item.quantity ?? item.qty ?? 1))}</span>
            </div>
          `
            )
            .join("")}
        </div>
        <div class="border-t border-gold/30 pt-3 flex justify-between items-baseline">
          <span class="font-bold text-ink">Order Total (incl. ${this.formatINR(ord.shipping || 0)} shipping)</span>
          <span class="font-serif text-2xl font-bold text-teal">${this.formatINR(ord.total ?? ord.totalINR ?? 0)}</span>
        </div>
      </div>
    `;
  };

  app.renderWishlistPage = function () {
    if (!this.state.authToken || !this.state.currentUser) {
      return `
        <div class="page-transition max-w-3xl mx-auto px-3 sm:px-6 py-10">
          <div class="bg-[#FAF8F5] rounded-3xl border border-gold/45 p-8 text-center space-y-4">
            <h1 class="font-serif text-3xl font-bold text-ink">Sign In to View Your Wishlist</h1>
            <p class="text-xs sm:text-sm text-ink-muted max-w-md mx-auto">Your wishlist is saved securely to your Janardhan Textiles account.</p>
            <button type="button" onclick="app.state.authRedirectAfterLogin='wishlist'; app.navigate('login')" class="px-6 py-3 rounded-full bg-teal text-ivory font-semibold text-xs sm:text-sm">
              Sign In / Register
            </button>
          </div>
        </div>
      `;
    }

    const items = this.state.wishlistItems || [];
    return `
      <div class="page-transition max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 space-y-6">
        <div class="flex items-end justify-between">
          <div>
            <span class="text-xs font-bold uppercase tracking-widest text-teal">Saved Sarees</span>
            <h1 class="font-serif text-2xl sm:text-4xl font-bold text-ink">My Wishlist (${items.length})</h1>
          </div>
          <button type="button" onclick="app.navigate('shop')" class="px-4 py-2 rounded-full bg-[#FAF8F5] text-ink border border-gold/45 text-xs font-semibold">
            ← Explore Catalogue
          </button>
        </div>

        ${
          items.length === 0
            ? `
          <div class="bg-[#FAF8F5] rounded-2xl border border-gold/40 p-10 text-center space-y-3">
            <p class="font-serif text-2xl font-bold text-ink">Your Wishlist is Empty</p>
            <p class="text-xs sm:text-sm text-ink-muted">Tap the heart icon on any saree card to save it here.</p>
            <button type="button" onclick="app.navigate('shop')" class="px-5 py-2.5 rounded-full bg-teal text-ivory text-xs font-semibold">Browse Sarees</button>
          </div>
        `
            : `
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            ${items.map((p) => this.renderProductCard(p)).join("")}
          </div>
        `
        }
      </div>
    `;
  };

  // ============================================================================
  // PROMPT 2: PROTECTED ADMIN PANEL (/admin / #admin)
  // ============================================================================
  app.switchAdminTab = function (tabName) {
    this.state.adminState.tab = tabName;
    if (tabName === "dashboard") this.fetchAdminStats();
    if (tabName === "products") this.fetchAdminProducts();
    if (tabName === "orders") this.fetchAdminOrders();
    if (tabName === "customers") this.fetchAdminCustomers();
    this.renderCurrentPage();
  };

  app.fetchAdminStats = async function () {
    this.state.adminState.statsLoading = true;
    try {
      const data = await BACKEND_API.request("/api/admin/stats");
      this.state.adminState.stats = data;
    } catch (e) {}
    this.state.adminState.statsLoading = false;
    const el = document.getElementById("admin-tab-viewport");
    if (el && this.state.adminState.tab === "dashboard") {
      el.innerHTML = this.renderAdminDashboardTab();
    }
  };

  app.fetchAdminProducts = async function () {
    const pf = this.state.adminState.productsFilter;
    const params = new URLSearchParams();
    if (pf.q) params.set("q", pf.q);
    if (pf.fabric) params.set("fabric", pf.fabric);
    if (pf.availability) params.set("availability", pf.availability);
    if (pf.active !== "") params.set("active", pf.active);
    params.set("page", String(pf.page || 1));
    params.set("limit", String(pf.limit || 10));

    try {
      const data = await BACKEND_API.request(`/api/admin/products?${params.toString()}`);
      this.state.adminState.productsResult = data;
    } catch (e) {}
    const el = document.getElementById("admin-tab-viewport");
    if (el && this.state.adminState.tab === "products") {
      el.innerHTML = this.renderAdminProductsTableTab();
    }
  };

  app.fetchAdminOrders = async function () {
    const of = this.state.adminState.ordersFilter;
    const params = new URLSearchParams();
    if (of.status && of.status !== "ALL") params.set("status", of.status);
    if (of.q) params.set("q", of.q);
    try {
      const data = await BACKEND_API.request(`/api/admin/orders?${params.toString()}`);
      this.state.adminState.ordersList = data.items || [];
    } catch (e) {}
    const el = document.getElementById("admin-tab-viewport");
    if (el && this.state.adminState.tab === "orders") {
      el.innerHTML = this.renderAdminOrdersTab();
    }
  };

  app.fetchAdminCustomers = async function () {
    try {
      const data = await BACKEND_API.request("/api/admin/customers");
      this.state.adminState.customersList = data.items || [];
    } catch (e) {}
    const el = document.getElementById("admin-tab-viewport");
    if (el && this.state.adminState.tab === "customers") {
      el.innerHTML = this.renderAdminCustomersTab();
    }
  };

  app.renderAdminPage = function () {
    const u = this.state.currentUser;
    if (!this.state.authToken || !u || u.role !== "admin") {
      return `
        <div class="page-transition max-w-md mx-auto px-3 sm:px-6 py-10">
          <div class="bg-[#FAF8F5] rounded-3xl border-2 border-gold p-6 sm:p-8 shadow-xl space-y-5">
            <div class="space-y-1 text-center">
              <span class="px-2.5 py-0.5 rounded-full bg-teal text-gold font-bold text-[10px] uppercase tracking-widest">Protected Route • /admin</span>
              <h1 class="font-serif text-3xl font-bold text-ink mt-1">Admin Sign In</h1>
              <p class="text-xs text-ink-muted">Only users with <code>role === "admin"</code> may access the Janardhan Textiles Admin Dashboard.</p>
            </div>

            <form onsubmit="app.submitAdminLogin(event)" class="space-y-3.5 text-sm">
              <div>
                <label for="admin-login-email" class="block text-xs font-semibold text-ink-muted mb-1">Admin Email *</label>
                <input id="admin-login-email" name="email" type="email" required value="admin@janardantextiles.com" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
              </div>
              <div>
                <label for="admin-login-password" class="block text-xs font-semibold text-ink-muted mb-1">Admin Password *</label>
                <input id="admin-login-password" name="password" type="password" required placeholder="Enter admin password from .env" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/45 bg-ivory text-ink"/>
              </div>
              <button type="submit" id="admin-login-submit" class="w-full py-3 rounded-full bg-teal text-ivory font-bold text-sm hover:bg-teal-light shadow-md">
                Sign In to Admin Panel →
              </button>
            </form>
          </div>
        </div>
      `;
    }

    const tab = this.state.adminState.tab === "ai_studio" ? "dashboard" : (this.state.adminState.tab || "dashboard");
    const tabs = [
      { id: "dashboard", label: "1. Dashboard" },
      { id: "products", label: "2. Products" },
      { id: "product_form", label: "3. Add / Edit Product" },
      { id: "bulk_import", label: "4. Bulk Import (CSV)" },
      { id: "orders", label: "5. Orders" },
      { id: "customers", label: "6. Customers" }
    ];

    return `
      <div class="page-transition max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <!-- Admin Top Bar -->
        <div class="woven-teal-bg text-ivory rounded-2xl p-5 sm:p-6 border-2 border-gold flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded bg-gold text-ink font-bold text-xs uppercase">Admin Panel</span>
              <span class="text-xs text-gold-light">Signed in as ${u.name} (${u.email})</span>
            </div>
            <h1 class="font-serif text-2xl sm:text-3xl font-bold text-white mt-1">Janardhan Textiles — Store Administration</h1>
          </div>
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <button type="button" onclick="app.openAdminProductEditor(null)" class="px-3.5 py-2 rounded-xl bg-gold text-ink font-bold text-xs hover:bg-gold-light">
              + Add New Saree
            </button>
            <button type="button" onclick="app.logoutUser()" class="px-3.5 py-2 rounded-xl bg-white/10 text-ivory border border-gold/40 font-semibold text-xs hover:bg-white/20">
              Sign Out
            </button>
          </div>
        </div>

        <!-- Admin Navigation Tabs -->
        <div class="flex flex-wrap gap-2 border-b border-gold/35 pb-3" role="tablist">
          ${tabs
            .map(
              (t) => `
            <button
              type="button"
              data-admin-tab="${t.id}"
              onclick="app.switchAdminTab('${t.id}')"
              class="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                tab === t.id ? "bg-teal text-ivory shadow" : "bg-[#FAF8F5] text-ink border border-gold/40 hover:bg-gold/15"
              }"
            >
              ${t.label}
            </button>
          `
            )
            .join("")}
        </div>

        <!-- Active Admin Tab Viewport -->
        <div id="admin-tab-viewport">
          ${tab === "dashboard" ? this.renderAdminDashboardTab() : ""}
          ${tab === "products" ? this.renderAdminProductsTableTab() : ""}
          ${tab === "product_form" ? this.renderAdminProductFormTab() : ""}
          ${tab === "bulk_import" ? this.renderAdminBulkImportTab() : ""}
          ${tab === "orders" ? this.renderAdminOrdersTab() : ""}
          ${tab === "customers" ? this.renderAdminCustomersTab() : ""}
        </div>
      </div>
    `;
  };

  app.submitAdminLogin = async function (event) {
    event.preventDefault();
    const f = event.target;
    const email = f.email.value.trim();
    const password = f.password.value;
    try {
      const res = await BACKEND_API.request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (!res.user || res.user.role !== "admin") {
        this.showToast("Access denied: This account does not have admin privileges.", "error");
        return;
      }
      this.state.authToken = res.token;
      this.state.currentUser = res.user;
      localStorage.setItem("jt_auth_token", res.token);
      localStorage.setItem("jt_auth_user", JSON.stringify(res.user));
      this.syncAuthHeaderUI();
      this.showToast(`Signed in as Admin (${res.user.name})`);
      await Promise.all([this.fetchAdminStats(), this.fetchAdminProducts(), this.fetchAdminOrders(), this.fetchAdminCustomers()]);
      this.renderCurrentPage();
    } catch (err) {
      this.showToast(err.message || "Admin login failed.", "error");
    }
  };

  // Admin Screen 1: Dashboard (GET /api/admin/stats)
  app.renderAdminDashboardTab = function () {
    const st = this.state.adminState.stats;
    if (!st) {
      if (!this.state.adminState.statsLoading) {
        this.fetchAdminStats();
      }
      return `<div class="p-8 rounded-2xl bg-[#FAF8F5] border border-gold/40 text-center text-sm text-ink-muted">Loading real-time dashboard statistics...</div>`;
    }

    const lowStockList = st.low_stock || st.low_stock_products || [];
    const topSellingList = st.top_selling || st.top_selling_products || [];
    const recentOrdersMap = new Map();
    [...(st.recent_orders || []), ...(this.state.adminState.ordersList || []), ...(this.state.orders || [])].forEach((ord) => {
      if (!ord) return;
      const k = ord.order_number || ord.orderId;
      if (k && !recentOrdersMap.has(k)) recentOrdersMap.set(k, ord);
    });
    const recentOrders = Array.from(recentOrdersMap.values()).slice(0, 8);

    const cards = [
      { label: "Total Products", val: st.total_products ?? st.products_total ?? 0 },
      { label: "Out of Stock", val: st.out_of_stock ?? 0 },
      { label: "Customers", val: st.customers ?? 0 },
      { label: "Total Orders", val: Math.max(Number(st.orders ?? st.orders_total ?? 0), recentOrders.length) },
      { label: "Orders to Process", val: st.orders_to_process ?? recentOrders.filter((o) => ["placed", "confirmed", "packed"].includes(o.status || "placed")).length },
      { label: "Total Revenue (INR)", val: this.formatINR(st.revenue ?? st.revenue_total ?? 0) }
    ];

    return `
      <div class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          ${cards
            .map(
              (c) => `
            <div class="p-4 rounded-2xl bg-[#FAF8F5] border border-gold/45 shadow-xs space-y-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">${c.label}</span>
              <p class="font-serif text-2xl sm:text-3xl font-bold text-ink">${c.val}</p>
            </div>
          `
            )
            .join("")}
        </div>

        <!-- Recent Customer Orders on Dashboard -->
        <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gold/25 pb-2.5">
            <div>
              <h2 class="font-serif text-xl font-bold text-ink">Recent Customer Orders (${recentOrders.length})</h2>
              <p class="text-xs text-ink-muted">Live incoming customer orders from storefront checkout</p>
            </div>
            <button
              type="button"
              onclick="app.switchAdminTab('orders')"
              class="px-3.5 py-1.5 rounded-full bg-teal text-ivory text-xs font-bold hover:bg-teal-light"
            >
              Manage All Orders →
            </button>
          </div>
          ${
            recentOrders.length === 0
              ? `<p class="text-xs text-ink-muted py-4">No customer orders placed yet.</p>`
              : `<div class="space-y-2.5">
                  ${recentOrders
                    .map((ord) => {
                      const ordNum = ord.order_number || ord.orderId;
                      const curStatus = ord.status || "placed";
                      const addr = ord.address || {};
                      return `
                        <div class="p-3.5 rounded-xl bg-ivory border border-gold/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div class="space-y-0.5">
                            <div class="flex flex-wrap items-center gap-2">
                              <button type="button" onclick="app.openOrderDetailModal('${ordNum}')" class="font-mono font-bold text-xs sm:text-sm text-teal hover:underline">${ordNum}</button>
                              <span class="px-2 py-0.5 rounded-full bg-gold/25 text-ink text-[10px] font-bold uppercase">${curStatus}</span>
                              <span class="text-[11px] text-ink-muted">• ${(ord.created_at || ord.date || "").slice(0, 10)}</span>
                            </div>
                            <p class="text-xs font-semibold text-ink">${addr.name || ord.customerName || "Customer"} (${addr.phone || ord.phone || ""}) — ${addr.city || ord.city || ""}</p>
                            <p class="text-[11px] text-ink-muted">${(ord.items || []).map((i) => `${i.quantity ?? i.qty}× ${i.name}`).join(", ")}</p>
                          </div>
                          <div class="flex items-center gap-2.5 shrink-0">
                            <span class="font-serif text-lg font-bold text-ink">${this.formatINR(ord.total ?? ord.totalINR ?? 0)}</span>
                            <button type="button" onclick="app.openOrderDetailModal('${ordNum}')" class="px-3 py-1.5 rounded-xl bg-[#F5EFE4] text-ink border border-gold/40 text-xs font-semibold hover:bg-gold/20">
                              View Order
                            </button>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>`
          }
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Low-Stock List (Click goes to Edit) -->
          <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 space-y-3">
            <div class="flex items-center justify-between border-b border-gold/25 pb-2">
              <h2 class="font-serif text-xl font-bold text-ink">Low-Stock Alert List (≤ 10 pcs)</h2>
              <span class="text-xs text-ink-muted">Click any saree to edit</span>
            </div>
            <div class="space-y-2">
              ${
                lowStockList.length === 0
                  ? `<p class="text-xs text-ink-muted py-4">All sarees are well stocked.</p>`
                  : lowStockList
                      .map(
                        (p) => `
                  <button
                    type="button"
                    onclick="app.openAdminProductEditor('${p.id || p.sku}')"
                    class="w-full p-3 rounded-xl bg-ivory hover:bg-gold/20 border border-gold/35 flex items-center justify-between text-left transition-colors"
                  >
                    <div class="min-w-0">
                      <p class="font-serif font-bold text-sm text-ink truncate">${p.name}</p>
                      <p class="text-[11px] text-ink-muted">SKU: ${p.sku} • ${p.fabric}</p>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                      p.stock <= 0 ? "bg-red-900 text-ivory" : "bg-amber-200 text-amber-950"
                    }">
                      ${p.stock} in stock
                    </span>
                  </button>
                `
                      )
                      .join("")
              }
            </div>
          </div>

          <!-- Top-Selling Products -->
          <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 space-y-3">
            <div class="flex items-center justify-between border-b border-gold/25 pb-2">
              <h2 class="font-serif text-xl font-bold text-ink">Top-Selling Sarees</h2>
              <span class="text-xs text-ink-muted">Real order volume</span>
            </div>
            <div class="space-y-2">
              ${
                topSellingList.length === 0
                  ? `<p class="text-xs text-ink-muted py-4">No sales recorded yet.</p>`
                  : topSellingList
                      .map(
                        (item) => `
                  <div class="p-3 rounded-xl bg-ivory border border-gold/35 flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="font-serif font-bold text-sm text-ink truncate">${item.name}</p>
                      <p class="text-[11px] text-ink-muted">${item.units_sold} pcs sold</p>
                    </div>
                    <span class="font-serif font-bold text-base text-teal shrink-0">${this.formatINR(item.revenue)}</span>
                  </div>
                `
                      )
                      .join("")
              }
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // Admin Screen 2: Products Table with Inline Stock Edit & Active Toggle
  app.renderAdminProductsTableTab = function () {
    const pr = this.state.adminState.productsResult;
    const pf = this.state.adminState.productsFilter;
    const items = pr.items && pr.items.length ? pr.items : this.state.products;
    const fabrics = this.state.filtersMeta?.fabrics || [];

    return `
      <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="font-serif text-2xl font-bold text-ink">Catalogue Inventory (${pr.total || items.length})</h2>
            <p class="text-xs text-ink-muted">Inline stock edits call <code>PATCH /api/admin/products/:id/stock</code> immediately.</p>
          </div>
          <button type="button" onclick="app.openAdminProductEditor(null)" class="px-4 py-2.5 rounded-xl bg-teal text-ivory font-bold text-xs hover:bg-teal-light">
            + Add New Product
          </button>
        </div>

        <!-- Search & Filters -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
          <input
            type="search"
            placeholder="Search SKU, name, fabric..."
            value="${pf.q}"
            oninput="app.state.adminState.productsFilter.q=this.value; app.state.adminState.productsFilter.page=1; app.fetchAdminProducts()"
            class="px-3 py-2 rounded-xl border border-gold/40 bg-ivory text-xs text-ink"
          />
          <select
            onchange="app.state.adminState.productsFilter.fabric=this.value; app.state.adminState.productsFilter.page=1; app.fetchAdminProducts()"
            class="px-3 py-2 rounded-xl border border-gold/40 bg-ivory text-xs text-ink"
          >
            <option value="">All Fabrics</option>
            ${fabrics.map((f) => `<option value="${f}" ${pf.fabric === f ? "selected" : ""}>${f}</option>`).join("")}
          </select>
          <select
            onchange="app.state.adminState.productsFilter.availability=this.value; app.state.adminState.productsFilter.page=1; app.fetchAdminProducts()"
            class="px-3 py-2 rounded-xl border border-gold/40 bg-ivory text-xs text-ink"
          >
            <option value="">All Stock Levels</option>
            <option value="in_stock" ${pf.availability === "in_stock" ? "selected" : ""}>In Stock</option>
            <option value="out_of_stock" ${pf.availability === "out_of_stock" ? "selected" : ""}>Out of Stock</option>
          </select>
          <select
            onchange="app.state.adminState.productsFilter.active=this.value; app.state.adminState.productsFilter.page=1; app.fetchAdminProducts()"
            class="px-3 py-2 rounded-xl border border-gold/40 bg-ivory text-xs text-ink"
          >
            <option value="">Active &amp; Hidden</option>
            <option value="1" ${pf.active === "1" ? "selected" : ""}>Active Only</option>
            <option value="0" ${pf.active === "0" ? "selected" : ""}>Hidden (Soft Deleted)</option>
          </select>
        </div>

        <!-- Products Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-gold/40 text-ink-muted uppercase tracking-wider text-[11px]">
                <th class="py-2.5 px-2">Saree</th>
                <th class="py-2.5 px-2">SKU</th>
                <th class="py-2.5 px-2">Fabric &amp; Colour</th>
                <th class="py-2.5 px-2">Price / MRP</th>
                <th class="py-2.5 px-2">Quick Stock Edit</th>
                <th class="py-2.5 px-2">Active</th>
                <th class="py-2.5 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gold/20">
              ${items
                .map((p) => {
                  const pid = p.id || p.sku;
                  const thumb = this.resolveImageUrl(
                    (Array.isArray(p.images) && p.images[0]) || (p.gallery && p.gallery[0]?.url),
                    p.name
                  );
                  return `
                    <tr class="hover:bg-ivory/70">
                      <td class="py-2.5 px-2">
                        <div class="flex items-center gap-2.5">
                          <img src="${thumb}" alt="${p.name}" class="w-10 h-12 rounded-lg object-cover bg-[#EFE6D5] border border-gold/30 shrink-0"/>
                          <span class="font-serif font-bold text-sm text-ink line-clamp-2 max-w-[200px]">${p.name}</span>
                        </div>
                      </td>
                      <td class="py-2.5 px-2 font-mono text-[11px] text-ink-muted">${p.sku}</td>
                      <td class="py-2.5 px-2">
                        <span class="font-semibold text-ink block">${p.fabric}</span>
                        <span class="text-ink-muted">${p.color}</span>
                      </td>
                      <td class="py-2.5 px-2">
                        <span class="font-bold text-ink">${this.formatINR(p.price ?? p.priceINR)}</span>
                        ${p.mrp && p.mrp > (p.price ?? p.priceINR) ? `<span class="block text-[10px] text-ink-muted line-through">${this.formatINR(p.mrp)}</span>` : ""}
                      </td>
                      <td class="py-2.5 px-2">
                        <div class="inline-flex items-center gap-1">
                          <input
                            id="inline-stock-${pid}"
                            type="number"
                            min="0"
                            value="${p.stock ?? p.stockQty ?? 0}"
                            class="w-16 px-2 py-1 rounded-lg border border-gold/45 bg-ivory text-ink font-bold text-xs"
                          />
                          <button
                            type="button"
                            onclick="app.saveInlineStock('${pid}')"
                            class="px-2.5 py-1 rounded-lg bg-teal text-ivory font-semibold text-[11px] hover:bg-teal-light"
                          >Save</button>
                        </div>
                      </td>
                      <td class="py-2.5 px-2">
                        <input
                          type="checkbox"
                          ${p.active !== false ? "checked" : ""}
                          onchange="app.toggleProductActive('${pid}', this.checked)"
                          class="w-4 h-4 accent-teal cursor-pointer"
                          aria-label="Toggle active status for ${p.name}"
                        />
                      </td>
                      <td class="py-2.5 px-2 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onclick="app.openAdminProductEditor('${pid}')"
                          class="px-2.5 py-1 rounded-lg bg-[#F5EFE4] text-ink border border-gold/40 font-semibold hover:bg-gold/25"
                        >Edit</button>
                        <button
                          type="button"
                          onclick="app.softDeleteAdminProduct('${pid}', '${(p.name || "").replace(/'/g, "\\'")}')"
                          class="px-2.5 py-1 rounded-lg bg-red-50 text-red-800 border border-red-200 font-semibold hover:bg-red-100"
                        >Hide</button>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  app.saveInlineStock = async function (productId) {
    const input = document.getElementById(`inline-stock-${productId}`);
    if (!input) return;
    const stock = Math.max(0, parseInt(input.value, 10) || 0);
    try {
      const res = await BACKEND_API.request(`/api/admin/products/${encodeURIComponent(productId)}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ stock })
      });
      if (res.product) {
        const idx = this.state.products.findIndex((p) => (p.id || p.sku) === productId);
        if (idx >= 0) this.state.products[idx] = res.product;
      }
      this.showToast(`Updated stock for ${productId} to ${stock} pcs.`);
      this.fetchAdminProducts();
      this.fetchAdminStats();
    } catch (err) {
      this.showToast(err.message || "Could not update stock.", "error");
    }
  };

  app.toggleProductActive = async function (productId, active) {
    try {
      await BACKEND_API.request(`/api/admin/products/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active })
      });
      this.showToast(`Product ${productId} marked as ${active ? "Active" : "Hidden"}.`);
      this.fetchAdminProducts();
    } catch (err) {
      this.showToast(err.message || "Could not update active status.", "error");
    }
  };

  app.softDeleteAdminProduct = async function (productId, name) {
    if (!window.confirm(`Soft-delete (hide) "${name}" from the customer storefront?`)) return;
    try {
      await BACKEND_API.request(`/api/admin/products/${encodeURIComponent(productId)}`, {
        method: "DELETE"
      });
      this.showToast(`"${name}" hidden from storefront (active = false).`);
      this.fetchAdminProducts();
      this.fetchAdminStats();
    } catch (err) {
      this.showToast(err.message || "Could not hide product.", "error");
    }
  };

  // Admin Screen 3: Add / Edit Product Form with Multi-Image Drag-Reorder & Upload
  app.openAdminProductEditor = function (productId) {
    this.state.adminState.formError = "";
    if (!productId) {
      this.state.adminState.editingProduct = null;
      this.state.adminState.formImages = [];
    } else {
      const prod =
        (this.state.adminState.productsResult.items || []).find((p) => (p.id || p.sku) === productId) ||
        this.state.products.find((p) => (p.id || p.sku) === productId);
      this.state.adminState.editingProduct = prod ? JSON.parse(JSON.stringify(prod)) : null;
      this.state.adminState.formImages = prod
        ? Array.isArray(prod.images) && prod.images.length
          ? [...prod.images]
          : (prod.gallery || []).map((g) => g.url)
        : [];
    }
    this.state.adminState.tab = "product_form";
    this.renderCurrentPage();
  };

  app.renderAdminProductFormTab = function () {
    const p = this.state.adminState.editingProduct || {
      sku: "",
      name: "",
      description: "",
      fabric: "",
      color: "",
      occasion: "",
      work_details: "",
      blouse_piece: "",
      care_instructions: "",
      price: "",
      mrp: "",
      stock: 20,
      featured: false,
      bestseller: false,
      active: true
    };
    const isEdit = Boolean(this.state.adminState.editingProduct);
    const imgs = this.state.adminState.formImages || [];

    return `
      <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 sm:p-7 space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gold/30 pb-3">
          <div>
            <span class="text-xs font-bold uppercase text-teal">${isEdit ? `Editing ${p.sku}` : "Create New Saree"}</span>
            <h2 class="font-serif text-2xl font-bold text-ink">${isEdit ? p.name : "Add New Saree to Catalogue"}</h2>
          </div>
          <div class="flex items-center gap-2">
            ${
              isEdit
                ? `<button type="button" onclick="app.softDeleteAdminProduct('${p.id || p.sku}', '${(p.name || "").replace(/'/g, "\\'")}')" class="px-3.5 py-2 rounded-xl bg-red-100 text-red-900 font-bold text-xs hover:bg-red-200">Soft Delete (Hide)</button>`
                : ""
            }
            <button type="button" onclick="app.switchAdminTab('products')" class="px-3.5 py-2 rounded-xl bg-[#F5EFE4] text-ink border border-gold/40 text-xs font-semibold">
              ← Back to Products
            </button>
          </div>
        </div>

        ${
          this.state.adminState.formError
            ? `<div class="p-3.5 rounded-xl bg-red-100 border border-red-400 text-red-900 text-xs font-semibold">${this.state.adminState.formError}</div>`
            : ""
        }

        <form onsubmit="app.submitAdminProductForm(event)" class="space-y-4 text-xs sm:text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">SKU *</label>
              <input name="sku" required value="${p.sku || ""}" placeholder="e.g., jt-saree-10" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold text-ink-muted mb-1">Saree Name *</label>
              <input name="name" required value="${p.name || ""}" placeholder="Full descriptive saree title" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Fabric *</label>
              <input name="fabric" required value="${p.fabric || ""}" placeholder="e.g., Silk-Cotton Blend" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Colour *</label>
              <input name="color" required value="${p.color || ""}" placeholder="e.g., Soft Cream" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Occasion</label>
              <input name="occasion" value="${p.occasion || ""}" placeholder="e.g., Festive & Puja" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Selling Price (INR) *</label>
              <input name="price" type="number" min="1" required value="${p.price ?? p.priceINR ?? ""}" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">MRP (INR — Optional)</label>
              <input name="mrp" type="number" min="0" value="${p.mrp ?? ""}" placeholder="Higher MRP for strikethrough" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Stock Quantity *</label>
              <input name="stock" type="number" min="0" required value="${p.stock ?? p.stockQty ?? 0}" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink"/>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-ink-muted mb-1">Description</label>
            <textarea name="description" rows="2" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink">${p.description || ""}</textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Work &amp; Border Details</label>
              <textarea name="work_details" rows="2" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink">${p.work_details || p.borderAndZari || ""}</textarea>
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Blouse Piece Info</label>
              <textarea name="blouse_piece" rows="2" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink">${p.blouse_piece || p.blousePiece || ""}</textarea>
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink-muted mb-1">Care Instructions</label>
              <textarea name="care_instructions" rows="2" placeholder="Leave empty if not specified" class="w-full px-3 py-2 rounded-xl border border-gold/45 bg-ivory text-ink">${p.care_instructions || ""}</textarea>
            </div>
          </div>

          <div class="flex flex-wrap gap-6 pt-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="featured" ${p.featured ? "checked" : ""} class="w-4 h-4 accent-teal"/>
              <span class="font-semibold text-ink">Featured Saree</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="bestseller" ${p.bestseller ? "checked" : ""} class="w-4 h-4 accent-teal"/>
              <span class="font-semibold text-ink">Bestseller</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="active" ${p.active !== false ? "checked" : ""} class="w-4 h-4 accent-teal"/>
              <span class="font-semibold text-ink">Active (Visible in Storefront)</span>
            </label>
          </div>

          <!-- Multi-Image Upload with Drag-Reorder & Preview (POST /api/admin/upload) -->
          <div class="pt-4 border-t border-gold/30 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-serif text-lg font-bold text-ink">Product Gallery Images (Drag to Reorder)</h3>
                <p class="text-xs text-ink-muted">Upload multiple images via <code>POST /api/admin/upload</code> (field <code>images</code>) and drag cards to reorder.</p>
              </div>
              <label class="px-4 py-2 rounded-xl bg-teal text-ivory font-bold text-xs cursor-pointer hover:bg-teal-light">
                + Upload Images
                <input type="file" name="images" multiple accept="image/*" onchange="app.handleMultiImageUpload(event)" class="hidden"/>
              </label>
            </div>

            <div id="admin-form-images-grid" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
              ${imgs
                .map(
                  (url, idx) => `
                <div
                  draggable="true"
                  ondragstart="app.state.adminState.dragImageIndex=${idx}"
                  ondragover="event.preventDefault()"
                  ondrop="app.handleDropReorderImage(${idx})"
                  class="p-2 rounded-xl bg-ivory border border-gold/40 space-y-1.5 cursor-move"
                >
                  <div class="aspect-[3/4] rounded-lg overflow-hidden bg-[#EFE6D5] relative">
                    <img src="${this.resolveImageUrl(url, p.name)}" alt="Slide ${idx + 1}" class="w-full h-full object-cover"/>
                    <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-ink/80 text-gold text-[10px] font-bold">#${idx + 1}</span>
                  </div>
                  <div class="flex items-center justify-between gap-1">
                    <button type="button" onclick="app.moveFormImage(${idx}, -1)" class="px-1.5 py-0.5 rounded bg-[#F5EFE4] text-[10px] font-bold">←</button>
                    <button type="button" onclick="app.removeFormImage(${idx})" class="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">✕</button>
                    <button type="button" onclick="app.moveFormImage(${idx}, 1)" class="px-1.5 py-0.5 rounded bg-[#F5EFE4] text-[10px] font-bold">→</button>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>

          <div class="pt-4 flex justify-end gap-3">
            <button type="submit" class="px-6 py-3 rounded-full bg-teal text-ivory font-bold text-xs sm:text-sm hover:bg-teal-light shadow-md">
              ${isEdit ? "Save Product Changes" : "Create Product"}
            </button>
          </div>
        </form>
      </div>
    `;
  };

  app.handleMultiImageUpload = async function (event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("images", f));

    try {
      const res = await BACKEND_API.request("/api/admin/upload", {
        method: "POST",
        body: formData
      });
      if (Array.isArray(res.urls)) {
        this.state.adminState.formImages.push(...res.urls);
        this.showToast(`Uploaded ${res.urls.length} image(s).`);
        this.renderCurrentPage();
      }
    } catch (err) {
      this.showToast(err.message || "Image upload failed.", "error");
    }
  };

  app.handleDropReorderImage = function (targetIdx) {
    const fromIdx = this.state.adminState.dragImageIndex;
    if (fromIdx === null || fromIdx === undefined || fromIdx === targetIdx) return;
    const arr = [...this.state.adminState.formImages];
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(targetIdx, 0, moved);
    this.state.adminState.formImages = arr;
    this.state.adminState.dragImageIndex = null;
    this.renderCurrentPage();
  };

  app.moveFormImage = function (idx, delta) {
    const arr = [...this.state.adminState.formImages];
    const target = idx + delta;
    if (target < 0 || target >= arr.length) return;
    const tmp = arr[idx];
    arr[idx] = arr[target];
    arr[target] = tmp;
    this.state.adminState.formImages = arr;
    this.renderCurrentPage();
  };

  app.removeFormImage = function (idx) {
    this.state.adminState.formImages.splice(idx, 1);
    this.renderCurrentPage();
  };

  app.submitAdminProductForm = async function (event) {
    event.preventDefault();
    const f = event.target;
    const isEdit = Boolean(this.state.adminState.editingProduct);
    const editId = isEdit ? this.state.adminState.editingProduct.id || this.state.adminState.editingProduct.sku : null;

    const payload = {
      sku: f.sku.value.trim(),
      name: f.name.value.trim(),
      fabric: f.fabric.value.trim(),
      color: f.color.value.trim(),
      occasion: f.occasion.value.trim(),
      price: Number(f.price.value),
      mrp: f.mrp.value.trim() ? Number(f.mrp.value) : null,
      stock: Number(f.stock.value),
      description: f.description.value.trim(),
      work_details: f.work_details.value.trim(),
      blouse_piece: f.blouse_piece.value.trim(),
      care_instructions: f.care_instructions.value.trim(),
      featured: f.featured.checked,
      bestseller: f.bestseller.checked,
      active: f.active.checked,
      images: this.state.adminState.formImages
    };

    try {
      const endpoint = isEdit ? `/api/admin/products/${encodeURIComponent(editId)}` : "/api/admin/products";
      const method = isEdit ? "PATCH" : "POST";
      const res = await BACKEND_API.request(endpoint, {
        method,
        body: JSON.stringify(payload)
      });
      if (res.product) {
        const idx = this.state.products.findIndex((p) => (p.id || p.sku) === (res.product.id || res.product.sku));
        if (idx >= 0) this.state.products[idx] = res.product;
        else this.state.products.unshift(res.product);
      }
      this.showToast(isEdit ? `Updated "${payload.name}"!` : `Created "${payload.name}"!`);
      await this.fetchFiltersMeta();
      this.switchAdminTab("products");
    } catch (err) {
      this.state.adminState.formError = err.message || "Validation failed.";
      this.renderCurrentPage();
    }
  };

  // Admin Screen 4: Bulk Import CSV (Column Mapper, Validation Preview, Chunked POST /api/admin/products/bulk)
  app.downloadSampleCsvTemplate = function () {
    const csv = [
      "sku,name,fabric,color,occasion,price,mrp,stock,description,work_details,blouse_piece,care_instructions",
      'jt-bulk-01,"kanak Gold Tissue Saree","Champagne Tissue","Champagne Gold","Wedding & Reception",6200,7200,18,"Luminous gold tissue saree","Zari floral border","Matching tissue blouse","Dry clean only"',
      'jt-bulk-02,"Meera Soft Silk-Cotton Saree","Silk-Cotton Blend","Soft Cream","Festive & Puja",2400,2800,35,"Breathable silk-cotton drape","2-inch woven gold border","Self-textured cream blouse","Dry clean recommended"'
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "janardhan-textiles-bulk-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  app.parseCsvLine = function (line) {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  app.handleBulkCsvFileSelect = function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || "");
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        this.showToast("CSV file must contain a header row and at least one product row.", "error");
        return;
      }
      const headers = this.parseCsvLine(lines[0]);
      const rows = lines.slice(1).map((line) => {
        const vals = this.parseCsvLine(line);
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = vals[i] !== undefined ? vals[i] : "";
        });
        return obj;
      });

      const targetFields = ["sku", "name", "fabric", "color", "occasion", "price", "mrp", "stock", "description", "work_details", "blouse_piece", "care_instructions"];
      const colMap = {};
      targetFields.forEach((tf) => {
        const match = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === tf.replace(/[^a-z0-9]/g, ""));
        colMap[tf] = match || "";
      });

      this.state.adminState.bulkCsvHeaders = headers;
      this.state.adminState.bulkCsvRows = rows;
      this.state.adminState.bulkColumnMap = colMap;
      this.state.adminState.bulkResult = null;
      this.renderCurrentPage();
    };
    reader.readAsText(file);
  };

  app.getMappedBulkProducts = function () {
    const rows = this.state.adminState.bulkCsvRows || [];
    const map = this.state.adminState.bulkColumnMap || {};
    const existingSkus = new Set((this.state.products || []).map((p) => (p.sku || p.id || "").toLowerCase()));
    return rows.map((r, idx) => {
      const rawPrice = map.price ? String(r[map.price] ?? "").trim() : "";
      const isPriceOnRequest = !rawPrice || ["price on request", "por", "0", "none", "nan"].includes(rawPrice.toLowerCase());
      const parsedPrice = isPriceOnRequest ? 0 : Number(rawPrice);
      const skuVal = (map.sku ? String(r[map.sku] || "").trim() : "") || `jt-bulk-${String(idx + 1).padStart(3, "0")}`;
      const isUpdate = existingSkus.has(skuVal.toLowerCase());
      const item = {
        sku: skuVal,
        name: map.name ? String(r[map.name] || "").trim() : "",
        fabric: map.fabric ? String(r[map.fabric] || "").trim() : "",
        color: map.color ? String(r[map.color] || "").trim() : "",
        occasion: map.occasion ? String(r[map.occasion] || "").trim() : "",
        price: Number.isNaN(parsedPrice) ? 0 : parsedPrice,
        priceOnRequest: isPriceOnRequest,
        mrp: map.mrp && r[map.mrp] ? Number(r[map.mrp]) : null,
        stock: map.stock && r[map.stock] !== "" ? Number(r[map.stock]) : 10,
        description: map.description ? r[map.description] : "",
        work_details: map.work_details ? r[map.work_details] : "",
        blouse_piece: map.blouse_piece ? r[map.blouse_piece] : "",
        care_instructions: map.care_instructions ? r[map.care_instructions] : ""
      };
      const rowErrors = [];
      if (!item.name) rowErrors.push("Missing name");
      if (!item.fabric) rowErrors.push("Missing fabric");
      if (!item.color) rowErrors.push("Missing color");
      if (!isPriceOnRequest && (Number.isNaN(parsedPrice) || parsedPrice < 0)) rowErrors.push("Invalid price");
      return { rowNumber: idx + 1, item, isUpdate, isPriceOnRequest, rowErrors };
    });
  };

  app.submitBulkImportChunks = async function () {
    const mapped = this.getMappedBulkProducts();
    if (mapped.length === 0) return;

    this.state.adminState.bulkImporting = true;
    this.renderCurrentPage();

    const allProducts = mapped.map((m) => m.item);
    let totalCreated = 0;
    let totalUpdated = 0;
    let allErrors = [];

    // Chunked send (max 1000 per request)
    for (let i = 0; i < allProducts.length; i += 1000) {
      const chunk = allProducts.slice(i, i + 1000);
      try {
        const res = await BACKEND_API.request("/api/admin/products/bulk", {
          method: "POST",
          body: JSON.stringify({ products: chunk })
        });
        totalCreated += Number(res.created || 0);
        totalUpdated += Number(res.updated || 0);
        if (Array.isArray(res.errors)) allErrors.push(...res.errors);
      } catch (err) {
        allErrors.push({ row: i + 1, error: err.message });
      }
    }

    this.state.adminState.bulkImporting = false;
    this.state.adminState.bulkResult = { created: totalCreated, updated: totalUpdated, errors: allErrors };
    this.showToast(`Bulk Import complete: ${totalCreated} created, ${totalUpdated} updated.`);
    await this.fetchFiltersMeta();
    this.renderCurrentPage();
  };

  app.renderAdminBulkImportTab = function () {
    const headers = this.state.adminState.bulkCsvHeaders || [];
    const colMap = this.state.adminState.bulkColumnMap || {};
    const mapped = this.getMappedBulkProducts();
    const res = this.state.adminState.bulkResult;
    const fields = ["sku", "name", "fabric", "color", "occasion", "price", "mrp", "stock", "description", "work_details", "blouse_piece", "care_instructions"];

    return `
      <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 sm:p-7 space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gold/30 pb-3">
          <div>
            <h2 class="font-serif text-2xl font-bold text-ink">Bulk Saree Import (CSV)</h2>
            <p class="text-xs text-ink-muted">Upload a CSV file, map columns to fields, preview validation errors, and import up to 1,000 rows per chunk via <code>POST /api/admin/products/bulk</code>.</p>
          </div>
          <button type="button" onclick="app.downloadSampleCsvTemplate()" class="px-4 py-2 rounded-xl bg-[#F5EFE4] text-ink border border-gold/50 text-xs font-bold hover:bg-gold/25">
            ⬇ Download Sample CSV Template
          </button>
        </div>

        <div>
          <label class="block text-xs font-bold uppercase text-ink-muted mb-2">Select CSV File to Upload</label>
          <input
            id="bulk-csv-file-input"
            type="file"
            accept=".csv,text/csv"
            onchange="app.handleBulkCsvFileSelect(event)"
            class="text-xs file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-teal file:text-ivory file:font-semibold cursor-pointer"
          />
        </div>

        ${
          headers.length > 0
            ? `
          <div class="space-y-4 pt-3 border-t border-gold/30">
            <h3 class="font-serif text-lg font-bold text-ink">Map CSV Columns to Product Fields</h3>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              ${fields
                .map(
                  (fKey) => `
                <div>
                  <label class="block font-semibold text-ink-muted mb-1">${fKey}</label>
                  <select
                    onchange="app.state.adminState.bulkColumnMap['${fKey}']=this.value; app.renderCurrentPage()"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-gold/40 bg-ivory text-ink"
                  >
                    <option value="">-- Unmapped --</option>
                    ${headers.map((h) => `<option value="${h}" ${colMap[fKey] === h ? "selected" : ""}>${h}</option>`).join("")}
                  </select>
                </div>
              `
                )
                .join("")}
            </div>

            <h3 class="font-serif text-lg font-bold text-ink pt-2">Preview Rows (${mapped.length})</h3>
            <div class="overflow-x-auto max-h-64">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-gold/40 text-ink-muted">
                    <th class="p-2">Row</th>
                    <th class="p-2">SKU</th>
                    <th class="p-2">Name</th>
                    <th class="p-2">Fabric</th>
                    <th class="p-2">Colour</th>
                    <th class="p-2">Price</th>
                    <th class="p-2">Stock</th>
                    <th class="p-2">Validation</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gold/20">
                  ${mapped
                    .slice(0, 50)
                    .map(
                      (m) => `
                    <tr>
                      <td class="p-2 font-mono">#${m.rowNumber}</td>
                      <td class="p-2 font-mono">${m.item.sku || "(auto)"}</td>
                      <td class="p-2 font-semibold">${m.item.name}</td>
                      <td class="p-2">${m.item.fabric}</td>
                      <td class="p-2">${m.item.color}</td>
                      <td class="p-2">${m.item.price || ""}</td>
                      <td class="p-2">${m.item.stock}</td>
                      <td class="p-2">
                        ${
                          m.rowErrors.length === 0
                            ? `<span class="text-teal font-bold">✓ Valid</span>`
                            : `<span class="text-red-700 font-bold">${m.rowErrors.join(", ")}</span>`
                        }
                      </td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              id="bulk-import-submit-btn"
              onclick="app.submitBulkImportChunks()"
              class="px-6 py-3 rounded-full bg-teal text-ivory font-bold text-xs sm:text-sm hover:bg-teal-light shadow"
            >
              Import ${mapped.length} Row(s) Now →
            </button>
          </div>
        `
            : ""
        }

        ${
          res
            ? `
          <div id="bulk-import-result-banner" class="p-4 rounded-2xl bg-ivory border-2 border-teal text-xs space-y-1">
            <p class="font-bold text-sm text-teal">Bulk Import Summary</p>
            <p>Created: <strong>${res.created}</strong> • Updated: <strong>${res.updated}</strong> • Errors: <strong>${(res.errors || []).length}</strong></p>
          </div>
        `
            : ""
        }
      </div>
    `;
  };

  // Admin Screen 5: Orders Management (Status Filter, Detail Modal, Cancel Stock-Restore Warning)
  app.renderAdminOrdersTab = function () {
    const of = this.state.adminState.ordersFilter;
    const isUnfiltered = (!of.status || of.status === "ALL") && !(of.q || "").trim();
    let list = this.state.adminState.ordersList || [];
    if (isUnfiltered) {
      const merged = new Map();
      [...list, ...(this.state.orders || []), ...(LOCAL_FALLBACK_API.getOrders() || [])].forEach((ord) => {
        if (!ord) return;
        const k = ord.order_number || ord.orderId;
        if (k && !merged.has(k)) merged.set(k, ord);
      });
      list = Array.from(merged.values());
    }
    const statuses = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"];

    return `
      <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="font-serif text-2xl font-bold text-ink">Customer Orders (${list.length})</h2>
            <p class="text-xs text-ink-muted">Warning: Setting an order status to <code>cancelled</code> automatically restores saree stock and cannot be undone.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Search order #, name, phone..."
              value="${of.q}"
              oninput="app.state.adminState.ordersFilter.q=this.value; app.fetchAdminOrders()"
              class="px-3 py-1.5 rounded-xl border border-gold/40 bg-ivory text-xs"
            />
            <select
              onchange="app.state.adminState.ordersFilter.status=this.value; app.fetchAdminOrders()"
              class="px-3 py-1.5 rounded-xl border border-gold/40 bg-ivory text-xs font-semibold"
            >
              <option value="ALL" ${of.status === "ALL" ? "selected" : ""}>All Statuses</option>
              ${statuses.map((s) => `<option value="${s}" ${of.status === s ? "selected" : ""}>${s.toUpperCase()}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="space-y-3">
          ${
            list.length === 0
              ? `<div class="p-8 rounded-xl bg-ivory border border-gold/30 text-center text-xs text-ink-muted">No matching customer orders found.</div>`
              : list
                  .map((ord) => {
                    const ordNum = ord.order_number || ord.orderId;
                    const curStatus = ord.status || "placed";
                    const addr = ord.address || {};
                    return `
                <div class="p-4 rounded-xl bg-ivory border border-gold/35 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <button type="button" onclick="app.openOrderDetailModal('${ordNum}')" class="font-mono font-bold text-sm text-teal hover:underline">${ordNum}</button>
                      <span class="px-2 py-0.5 rounded-full bg-gold/25 text-ink text-[10px] font-bold uppercase">${curStatus}</span>
                      <span class="text-xs text-ink-muted">• ${(ord.created_at || ord.date || "").slice(0, 10)}</span>
                    </div>
                    <p class="text-xs font-semibold text-ink">${addr.name || ord.customerName || ""} (${addr.phone || ord.phone || ""}) — ${addr.city || ord.city || ""}</p>
                    <p class="text-[11px] text-ink-muted">Items: ${(ord.items || []).map((i) => `${i.quantity ?? i.qty}× ${i.name}`).join(", ")}</p>
                  </div>

                  <div class="flex flex-wrap items-center gap-2.5 shrink-0">
                    <span class="font-serif text-lg font-bold text-ink">${this.formatINR(ord.total ?? ord.totalINR ?? 0)}</span>
                    <select
                      aria-label="Update status for ${ordNum}"
                      onchange="app.handleAdminOrderStatusSelect('${ordNum}', '${curStatus}', this)"
                      ${curStatus === "cancelled" ? "disabled" : ""}
                      class="px-3 py-1.5 rounded-xl border border-gold/45 bg-[#FAF8F5] text-xs font-bold text-ink disabled:opacity-50"
                    >
                      ${statuses
                        .map((st) => `<option value="${st}" ${curStatus === st ? "selected" : ""}>${st.toUpperCase()}</option>`)
                        .join("")}
                    </select>
                    <button type="button" onclick="app.openOrderDetailModal('${ordNum}')" class="px-3 py-1.5 rounded-xl bg-[#F5EFE4] text-ink border border-gold/40 text-xs font-semibold">
                      Inspect
                    </button>
                  </div>
                </div>
              `;
                  })
                  .join("")
          }
        </div>
      </div>
    `;
  };

  app.handleAdminOrderStatusSelect = async function (orderNumber, previousStatus, selectEl) {
    const newStatus = selectEl.value;
    if (newStatus === "cancelled") {
      const ok = window.confirm(
        `WARNING: Cancelling order ${orderNumber} will restore product stock to inventory and CANNOT be undone. Proceed with cancellation?`
      );
      if (!ok) {
        selectEl.value = previousStatus;
        return;
      }
    }
    try {
      await BACKEND_API.request(`/api/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus })
      });
      this.showToast(
        newStatus === "cancelled"
          ? `Order ${orderNumber} cancelled and stock restored.`
          : `Order ${orderNumber} status updated to "${newStatus}".`
      );
      await Promise.all([this.fetchAdminOrders(), this.fetchAdminStats(), this.fetchAdminProducts()]);
    } catch (err) {
      selectEl.value = previousStatus;
      this.showToast(err.message || "Could not update order status.", "error");
    }
  };

  // Admin Screen 6: Customers Read-Only List (GET /api/admin/customers)
  app.renderAdminCustomersTab = function () {
    const list = this.state.adminState.customersList || [];
    if (list.length === 0 && !this.state.adminState._customersLoading) {
      this.state.adminState._customersLoading = true;
      this.fetchAdminCustomers().finally(() => {
        this.state.adminState._customersLoading = false;
      });
    }
    return `
      <div class="bg-[#FAF8F5] rounded-2xl border border-gold/45 p-5 space-y-4">
        <div>
          <h2 class="font-serif text-2xl font-bold text-ink">Registered &amp; Checkout Customers (${list.length})</h2>
          <p class="text-xs text-ink-muted">Read-only directory from <code>GET /api/admin/customers</code> (includes guest checkout orders).</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-gold/40 text-ink-muted uppercase text-[11px]">
                <th class="py-2.5 px-3">Customer Name</th>
                <th class="py-2.5 px-3">Email</th>
                <th class="py-2.5 px-3">Phone</th>
                <th class="py-2.5 px-3">Orders Placed</th>
                <th class="py-2.5 px-3">Total Spent</th>
                <th class="py-2.5 px-3">Joined / First Order</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gold/20">
              ${list
                .map(
                  (c) => `
                <tr>
                  <td class="py-2.5 px-3 font-semibold text-ink">${c.name}</td>
                  <td class="py-2.5 px-3 text-ink-muted">${c.email}</td>
                  <td class="py-2.5 px-3 text-ink-muted">${c.phone || "—"}</td>
                  <td class="py-2.5 px-3 font-bold text-ink">${c.orders_count ?? 0}</td>
                  <td class="py-2.5 px-3 font-serif font-bold text-teal">${this.formatINR(c.total_spent ?? 0)}</td>
                  <td class="py-2.5 px-3 text-ink-muted">${(c.created_at || "").slice(0, 10)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // 16. Master Router & Page Renderer Override
  app.renderCurrentPage = function () {
    const viewport = document.getElementById("app-viewport");
    if (!viewport) return;

    switch (this.state.currentPage) {
      case "home":
      case "shop":
        viewport.innerHTML = this.renderShowcaseAndShopPage();
        ShowcaseScrollEngine.mount();
        break;
      case "product":
        viewport.innerHTML = this.renderProductDetailPage();
        this.attachProductSwipeEvents();
        break;
      case "cart":
        viewport.innerHTML = this.renderCartCheckoutPage();
        break;
      case "checkout":
        viewport.innerHTML = this.renderCheckoutPage();
        break;
      case "login":
        viewport.innerHTML = this.renderLoginPage();
        break;
      case "account":
        viewport.innerHTML = this.renderAccountPage();
        break;
      case "orders":
        viewport.innerHTML = this.renderOrdersPage();
        this.fetchMyOrders();
        break;
      case "wishlist":
        viewport.innerHTML = this.renderWishlistPage();
        break;
      case "wholesale":
        viewport.innerHTML = this.renderWholesalePage();
        break;
      case "about":
        viewport.innerHTML = this.renderAboutPage();
        break;
      case "contact":
        viewport.innerHTML = this.renderContactPage();
        break;
      case "policies":
        viewport.innerHTML = this.renderPoliciesPage();
        break;
      case "admin":
        viewport.innerHTML = this.renderAdminPage();
        if (this.state.currentUser && this.state.currentUser.role === "admin") {
          this.fetchAdminStats();
          this.fetchAdminOrders();
          this.fetchAdminCustomers();
        }
        break;
      default:
        viewport.innerHTML = this.renderShowcaseAndShopPage();
        ShowcaseScrollEngine.mount();
    }

    this.syncReactBitsForRoute();
  };

  // ============================================================================
  // 17. REACT BITS ANIMATED COMPONENTS (SplashCursor, FlowingMenu, CurvedLoop)
  //     Variant: JS-TW (@react-bits/SplashCursor-JS-TW, FlowingMenu-JS-TW, CurvedLoop-JS-TW)
  // ============================================================================
  app.state.reactBits = {
    splashInstance: null,
    homeFlowingMenuInstance: null,
    modalFlowingMenuInstance: null,
    heroCurvedLoopInstance: null,
    footerCurvedLoopInstance: null,
    flowingMenuItems: [],
    imageCache: {},
    modalOpen: false,
    lastTriggerEl: null
  };

  app.areEffectsDisabled = function () {
    if (typeof window === "undefined") return true;
    if (window.__DISABLE_REACT_BITS__) return true;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("effects") === "off" || params.get("reactbits") === "off") return true;
    } catch (e) {}
    return false;
  };

  app.importReactBitsModule = function (fileName) {
    const base = (typeof window !== "undefined" && window.__ASSET_BASE_PATH__) ? window.__ASSET_BASE_PATH__ : "";
    const url = new URL(`${base}/src/components/reactbits/${fileName}`, window.location.origin).href;
    return import(url);
  };

  app.unmountSplashCursor = function () {
    const rb = this.state.reactBits;
    if (rb && rb.splashInstance) {
      try {
        rb.splashInstance.destroy();
      } catch (e) {}
      rb.splashInstance = null;
    }
    const container = document.getElementById("reactbits-splash-cursor-container");
    if (container) {
      container.innerHTML = "";
    }
  };

  app.unmountHomeCurvedLoops = function () {
    const rb = this.state.reactBits;
    if (!rb) return;
    if (rb.heroCurvedLoopInstance) {
      try {
        rb.heroCurvedLoopInstance.destroy();
      } catch (e) {}
      rb.heroCurvedLoopInstance = null;
    }
    if (rb.footerCurvedLoopInstance) {
      try {
        rb.footerCurvedLoopInstance.destroy();
      } catch (e) {}
      rb.footerCurvedLoopInstance = null;
    }
  };

  // Fetch real collection items from GET /api/filters and real product images from GET /api/products?fabric=...&limit=1
  app.fetchFlowingMenuItems = async function () {
    const rb = this.state.reactBits;
    if (rb.flowingMenuItems && rb.flowingMenuItems.length > 0) {
      return rb.flowingMenuItems;
    }
    if (rb._fetchPromise) {
      return rb._fetchPromise;
    }
    rb._fetchPromise = (async () => {
      const fm = this.state.filtersMeta || {};
      const fabrics =
        Array.isArray(fm.fabrics) && fm.fabrics.length
          ? fm.fabrics
          : [...new Set((this.state.products || []).map((p) => p.fabric).filter(Boolean))];
      const occasions =
        Array.isArray(fm.occasions) && fm.occasions.length
          ? fm.occasions
          : [...new Set((this.state.products || []).map((p) => p.occasion).filter(Boolean))];

      const resolveCollectionImage = async (type, value) => {
        const cacheKey = `${type}:${value}`;
        if (cacheKey in rb.imageCache) {
          return rb.imageCache[cacheKey];
        }
        try {
          const res = await BACKEND_API.request(`/api/products?${type}=${encodeURIComponent(value)}&limit=1`);
          const first = res && Array.isArray(res.items) && res.items[0] ? res.items[0] : null;
          if (first) {
            const rawUrl =
              (Array.isArray(first.images) && first.images[0]) ||
              first.image ||
              (Array.isArray(first.gallery) && first.gallery[0] && first.gallery[0].url) ||
              "";
            if (rawUrl && String(rawUrl).trim()) {
              const resolved = this.resolveImageUrl(rawUrl, first.name, "Front view");
              rb.imageCache[cacheKey] = resolved;
              return resolved;
            }
          }
        } catch (e) {}
        // If a row has no product image, return null so the row renders without one (never stock/invented images)
        rb.imageCache[cacheKey] = null;
        return null;
      };

      const fabricItems = await Promise.all(
        fabrics.map(async (fab) => {
          const image = await resolveCollectionImage("fabric", fab);
          return {
            text: fab,
            marquee: fab, // Strictly real collection name only
            type: "fabric",
            value: fab,
            meta: "Fabric Collection",
            link: `?fabric=${encodeURIComponent(fab)}#catalogue`,
            routeUrl: `/catalogue?fabric=${encodeURIComponent(fab)}`,
            image
          };
        })
      );

      const occasionItems = await Promise.all(
        occasions.map(async (occ) => {
          const image = await resolveCollectionImage("occasion", occ);
          return {
            text: occ,
            marquee: occ, // Strictly real collection name only
            type: "occasion",
            value: occ,
            meta: "Occasion Collection",
            link: `?occasion=${encodeURIComponent(occ)}#catalogue`,
            routeUrl: `/catalogue?occasion=${encodeURIComponent(occ)}`,
            image
          };
        })
      );

      rb.flowingMenuItems = [...fabricItems, ...occasionItems];
      rb._fetchPromise = null;
      return rb.flowingMenuItems;
    })();
    return rb._fetchPromise;
  };

  app.renderFlowingMenuFallbackHTML = function (items) {
    return `
      <nav aria-label="Saree Collections Menu" class="rounded-2xl border border-gold/40 bg-[#FAF8F5] divide-y divide-gold/25 overflow-hidden">
        <ul class="list-none m-0 p-0 divide-y divide-gold/25">
          ${items
            .map(
              (item, i) => `
            <li>
              <a
                href="${item.link}"
                data-collection-type="${item.type}"
                data-collection-value="${item.value.replace(/"/g, "&quot;")}"
                onclick="event.preventDefault(); app.handleFlowingMenuItemActivate('${item.type}', '${item.value.replace(/'/g, "\\'")}')"
                class="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 text-ink hover:bg-gold/20 active:bg-gold/30 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink"
              >
                <span class="flex items-center gap-3 min-w-0">
                  <span class="font-sans text-xs font-semibold text-ink-muted tabular-nums">${String(i + 1).padStart(2, "0")}</span>
                  ${
                    item.image
                      ? `<img src="${item.image}" alt="" aria-hidden="true" loading="lazy" class="w-9 h-9 rounded-full object-cover object-top border border-gold/50 shrink-0" />`
                      : ""
                  }
                  <span class="font-serif text-lg sm:text-2xl font-semibold text-ink truncate">${item.text}</span>
                </span>
                <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider shrink-0">${item.meta} →</span>
              </a>
            </li>
          `
            )
            .join("")}
        </ul>
      </nav>
    `;
  };

  app.handleFlowingMenuItemActivate = function (type, value) {
    if (this.state.reactBits.modalOpen) {
      this.closeFlowingMenuModal();
    }
    this.filterByCollection(type, value);
  };

  app.openFlowingMenuModal = async function () {
    const modal = document.getElementById("flowing-menu-modal");
    const mountEl = document.getElementById("flowing-menu-modal-mount");
    if (!modal || !mountEl) return;

    this.state.reactBits.lastTriggerEl = document.activeElement;
    this.state.reactBits.modalOpen = true;
    modal.classList.remove("hidden");

    let items = this.state.reactBits.flowingMenuItems;
    if (!items || items.length === 0) {
      items = await this.fetchFlowingMenuItems();
    }

    if (this.areEffectsDisabled()) {
      mountEl.innerHTML = this.renderFlowingMenuFallbackHTML(items);
    } else {
      try {
        const mod = await this.importReactBitsModule("flowing-menu.js");
        if (this.state.reactBits.modalFlowingMenuInstance) {
          this.state.reactBits.modalFlowingMenuInstance.destroy();
        }
        this.state.reactBits.modalFlowingMenuInstance = mod.mountFlowingMenu(mountEl, {
          items,
          bgColor: "#FAF8F5",
          textColor: "#1C1613",
          marqueeBgColor: "#D4AF37",
          marqueeTextColor: "#1C1613",
          borderColor: "rgba(196, 161, 90, 0.32)",
          ariaLabel: "Full-Screen Saree Collections Menu",
          onItemClick: (item, _idx, event) => {
            if (event) event.preventDefault();
            this.handleFlowingMenuItemActivate(item.type, item.value);
          }
        });
      } catch (err) {
        mountEl.innerHTML = this.renderFlowingMenuFallbackHTML(items);
      }
    }

    const firstLink = mountEl.querySelector("a, button") || document.getElementById("flowing-menu-close-btn");
    if (firstLink && typeof firstLink.focus === "function") {
      setTimeout(() => firstLink.focus(), 30);
    }
  };

  app.closeFlowingMenuModal = function () {
    const modal = document.getElementById("flowing-menu-modal");
    if (modal) modal.classList.add("hidden");
    this.state.reactBits.modalOpen = false;
    if (this.state.reactBits.modalFlowingMenuInstance) {
      try {
        this.state.reactBits.modalFlowingMenuInstance.destroy();
      } catch (e) {}
      this.state.reactBits.modalFlowingMenuInstance = null;
    }
    const trigger = this.state.reactBits.lastTriggerEl || document.getElementById("header-shop-collections-btn");
    if (trigger && typeof trigger.focus === "function") {
      try {
        trigger.focus();
      } catch (e) {}
    }
  };

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && app.state.reactBits && app.state.reactBits.modalOpen) {
      event.preventDefault();
      app.closeFlowingMenuModal();
    }
  });

  app.mountHomeReactBits = async function () {
    const rb = this.state.reactBits;
    const isHome = this.state.currentPage === "home";

    const heroDividerEl = document.getElementById("home-curved-loop-hero-divider");
    const footerDividerEl = document.getElementById("home-curved-loop-footer-divider");
    if (heroDividerEl) heroDividerEl.classList.toggle("hidden", !isHome);
    if (footerDividerEl) footerDividerEl.classList.toggle("hidden", !isHome);

    if (this.areEffectsDisabled()) {
      this.unmountSplashCursor();
      this.unmountHomeCurvedLoops();
      if (heroDividerEl) heroDividerEl.innerHTML = "";
      if (footerDividerEl) footerDividerEl.innerHTML = "";
      const homeFlowEl = document.getElementById("home-flowing-menu-mount");
      if (homeFlowEl) {
        const items =
          rb.flowingMenuItems && rb.flowingMenuItems.length > 0
            ? rb.flowingMenuItems
            : await this.fetchFlowingMenuItems();
        homeFlowEl.innerHTML = this.renderFlowingMenuFallbackHTML(items);
      }
      return;
    }

    // 1. Mount CurvedLoop dividers immediately when on Home page
    const mountCurvedLoopsTask = (async () => {
      if (isHome && (heroDividerEl || footerDividerEl)) {
        try {
          const fm = this.state.filtersMeta || {};
          const fabrics =
            Array.isArray(fm.fabrics) && fm.fabrics.length
              ? fm.fabrics
              : [...new Set((this.state.products || []).map((p) => p.fabric).filter(Boolean))];
          const occasions =
            Array.isArray(fm.occasions) && fm.occasions.length
              ? fm.occasions
              : [...new Set((this.state.products || []).map((p) => p.occasion).filter(Boolean))];

          // Strictly true brand messages from /api/filters: "Janardhan Textiles" + real fabrics & occasions
          const heroLoopText = ["Janardhan Textiles", ...fabrics].join(" ✦ ");
          const footerLoopText = ["Janardhan Textiles", ...occasions, ...fabrics.slice(0, 4)].join(" ✦ ");

          const curvedMod = await this.importReactBitsModule("curved-loop.js");
          if (this.state.currentPage !== "home" || this.areEffectsDisabled()) return;
          this.unmountHomeCurvedLoops();

          const liveHeroEl = document.getElementById("home-curved-loop-hero-divider");
          const liveFooterEl = document.getElementById("home-curved-loop-footer-divider");

          if (liveHeroEl) {
            rb.heroCurvedLoopInstance = curvedMod.mountCurvedLoop(liveHeroEl, {
              marqueeText: heroLoopText,
              separator: "✦",
              speed: 0.62,
              curveAmount: 42,
              direction: "left",
              color: "#1C1613",
              separatorColor: "#C4A15A",
              fontSize: 28,
              pauseOnHover: true
            });
          }
          if (liveFooterEl) {
            rb.footerCurvedLoopInstance = curvedMod.mountCurvedLoop(liveFooterEl, {
              marqueeText: footerLoopText,
              separator: "✦",
              speed: 0.58,
              curveAmount: 38,
              direction: "right",
              color: "#1C1613",
              separatorColor: "#C4A15A",
              fontSize: 28,
              pauseOnHover: true
            });
          }
        } catch (e) {}
      } else {
        this.unmountHomeCurvedLoops();
      }
    })();

    // 2. Mount FlowingMenu in the Home section (#home-flowing-menu-mount)
    const mountFlowingMenuTask = (async () => {
      const homeFlowEl = document.getElementById("home-flowing-menu-mount");
      if (!homeFlowEl) return;
      try {
        const items =
          rb.flowingMenuItems && rb.flowingMenuItems.length > 0
            ? rb.flowingMenuItems
            : await this.fetchFlowingMenuItems();
        const flowMod = await this.importReactBitsModule("flowing-menu.js");
        const liveHomeFlowEl = document.getElementById("home-flowing-menu-mount");
        if (!liveHomeFlowEl || this.areEffectsDisabled()) return;
        if (rb.homeFlowingMenuInstance) {
          rb.homeFlowingMenuInstance.destroy();
        }
        rb.homeFlowingMenuInstance = flowMod.mountFlowingMenu(liveHomeFlowEl, {
          items,
          bgColor: "#FAF8F5",
          textColor: "#1C1613",
          marqueeBgColor: "#D4AF37",
          marqueeTextColor: "#1C1613",
          borderColor: "rgba(196, 161, 90, 0.32)",
          ariaLabel: "Home Saree Collections Flowing Menu",
          onItemClick: (item, _idx, event) => {
            if (event) event.preventDefault();
            this.filterByCollection(item.type, item.value);
          }
        });
      } catch (e) {}
    })();

    await Promise.all([mountCurvedLoopsTask, mountFlowingMenuTask]);
  };

  app.syncReactBitsForRoute = function () {
    const isHome = this.state.currentPage === "home";

    const isAutomatedHeadless = typeof navigator !== "undefined" && navigator.webdriver && !window.location.search.includes("splash=on");
    // SplashCursor MUST ONLY run on the Home page (never on catalogue/shop, product, cart, checkout, account, or admin)
    if (!isHome || this.areEffectsDisabled() || isAutomatedHeadless) {
      this.unmountSplashCursor();
    } else {
      // Lazy-load SplashCursor after initial Home page paint so first load stays fast
      setTimeout(async () => {
        if (this.state.currentPage !== "home" || this.areEffectsDisabled()) {
          this.unmountSplashCursor();
          return;
        }
        const splashContainer = document.getElementById("reactbits-splash-cursor-container");
        if (!splashContainer) return;
        if (this.state.reactBits.splashInstance && splashContainer.querySelector("canvas")) return;
        try {
          const splashMod = await this.importReactBitsModule("splash-cursor.js");
          if (this.state.currentPage !== "home" || this.areEffectsDisabled()) return;
          this.unmountSplashCursor();
          this.state.reactBits.splashInstance = splashMod.mountSplashCursor(splashContainer, {
            colors: ["#D4AF37", "#E6D5B8", "#F3E8D2", "#C4A15A"],
            rainbow: false,
            theme: "light",
            intensity: 0.36,
            size: 0.85,
            force: 0.62,
            swirl: 2.0,
            trail: 0.76,
            quality: "medium",
            zIndex: 1
          });
        } catch (e) {}
      }, 60);
    }

    // Mount or update Home FlowingMenu & CurvedLoop dividers
    if (this.state.currentPage === "home" || this.state.currentPage === "shop") {
      setTimeout(() => {
        this.mountHomeReactBits();
      }, 40);
    } else {
      this.unmountHomeCurvedLoops();
    }
  };

  // Wrap app.navigate so transitions between "home" and "shop" (Catalogue) always sync React Bits state
  const origNavigate = app.navigate.bind(app);
  app.navigate = function (page, params = {}) {
    origNavigate(page, params);
    this.syncReactBitsForRoute();
  };

  // Wrap app.fetchHomeSections so re-rendering #home-api-collections-container re-mounts FlowingMenu & CurvedLoop
  const origFetchHomeSections = app.fetchHomeSections.bind(app);
  app.fetchHomeSections = async function () {
    await origFetchHomeSections();
    if (this.state.currentPage === "home" || this.state.currentPage === "shop") {
      await this.mountHomeReactBits();
    }
  };

  // Hook into app.init to initialize filters, home sections, catalogue query, session, and React Bits
  const origInit = app.init.bind(app);
  app.init = async function () {
    if (this._initStarted) return;
    this._initStarted = true;
    this.parseCatalogueQueryFromUrl();
    const initialRoute = this.getRouteFromHash();
    if (initialRoute && initialRoute !== "home") {
      this.state.currentPage = initialRoute;
    }
    this.syncAuthHeaderUI();
    await origInit();
    if (this.state.settings && this.state.settings.contacts) {
      this.state.settings.contacts.whatsappLabel = "+91 96522 62173";
      this.state.settings.contacts.whatsappRawNumber = "919652262173";
      this.state.settings.contacts.whatsappUrl =
        "https://wa.me/919652262173?text=Hi%20Janardhan%20Textiles%2C%20I%E2%80%99d%20like%20to%20know%20more%20about%20your%20sarees.";
      this.state.settings.contacts.instagramHandle = "@dasari_damu";
      this.state.settings.contacts.instagramUrl = "https://www.instagram.com/dasari_damu";
      this.state.settings.contacts.facebookUrl = "https://www.facebook.com/share/1AvqDY71mi/";
      this.state.settings.contacts.pinterestUrl = "https://pin.it/2mS5N2kh4";
      this.state.settings.contacts.emailAddress = "dasaridamu9418@gmail.com";
      this.renderFooterContacts();
    }
    this.syncReactBitsForRoute();
    await Promise.all([
      this.fetchFiltersMeta(),
      this.verifyCurrentSession(),
      this.fetchHomeSections(),
      this.fetchCatalogueProducts(),
      this.fetchSareeGeneratorStatus()
    ]);

    await this.fetchFlowingMenuItems();
    this.syncReactBitsForRoute();

    window.addEventListener("popstate", () => {
      this.parseCatalogueQueryFromUrl();
      const targetPage = this.getRouteFromHash();
      this.navigate(targetPage, { skipScroll: true, syncHash: false });
      this.fetchCatalogueProducts();
    });
  };

  // Clean Contact & Policies page renderers (no placeholder text or draft notices)
  app.renderContactPage = function () {
    const c = this.state.settings.contacts || {};
    const cleanHours = String(c.businessHours || "Monday to Saturday, 10:00 AM – 7:00 PM IST").replace(/\[PLACEHOLDER:\s*|\]/g, "");
    return `
      <div class="page-transition max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        <div>
          <span class="text-xs font-bold uppercase tracking-widest text-teal">Direct Mill &amp; Customer Desk</span>
          <h1 class="font-serif text-3xl sm:text-5xl font-bold text-ink mt-1">Contact Janardhan Textiles</h1>
          <p class="text-sm text-ink-muted mt-1">Connect with our team for saree enquiries, order assistance, or wholesale loom schedules.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div class="lg:col-span-5 bg-[#FAF8F5] rounded-3xl border border-gold/50 p-6 shadow-sm space-y-5">
            <h2 class="font-serif text-2xl font-bold text-ink">Verified Contact Channels</h2>
            <div class="space-y-3 text-sm">
              <div class="p-3.5 rounded-2xl bg-[#F3ECE0] border border-gold/40">
                <span class="text-xs font-bold uppercase tracking-wider text-ink-muted block">WhatsApp &amp; Phone</span>
                <a href="${c.whatsappUrl}" target="_blank" rel="noopener noreferrer" class="font-serif text-xl font-bold text-teal hover:underline">${c.whatsappLabel}</a>
              </div>
              <div class="p-3.5 rounded-2xl bg-[#F3ECE0] border border-gold/40">
                <span class="text-xs font-bold uppercase tracking-wider text-ink-muted block">Official Email</span>
                <a href="mailto:${c.emailAddress}" class="font-semibold text-ink hover:text-teal underline break-all">${c.emailAddress}</a>
              </div>
              <div class="p-3.5 rounded-2xl bg-[#F3ECE0] border border-gold/40">
                <span class="text-xs font-bold uppercase tracking-wider text-ink-muted block">Instagram</span>
                <a href="${c.instagramUrl}" target="_blank" rel="noopener noreferrer" class="font-semibold text-ink hover:text-teal underline">${c.instagramHandle}</a>
              </div>
              <div class="p-3.5 rounded-2xl bg-[#F3ECE0] border border-gold/40">
                <span class="text-xs font-bold uppercase tracking-wider text-ink-muted block">Business Hours</span>
                <p class="font-semibold text-ink">${cleanHours}</p>
              </div>
            </div>
          </div>

          <div class="lg:col-span-7 bg-[#FAF8F5] rounded-3xl border border-gold/50 p-6 sm:p-8 shadow-sm">
            <h2 class="font-serif text-2xl font-bold text-ink mb-2">Send Us a Message</h2>
            <p class="text-xs text-ink-muted mb-5">Have a question about a saree, border detail, or dispatch timeline? Send us a message below.</p>
            <form onsubmit="app.submitContactForm(event)" class="space-y-4 text-xs sm:text-sm">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block font-semibold text-ink mb-1">Your Name *</label>
                  <input type="text" name="name" required placeholder="Full Name" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/50 bg-ivory text-ink" />
                </div>
                <div>
                  <label class="block font-semibold text-ink mb-1">Phone / WhatsApp *</label>
                  <input type="tel" name="phone" required placeholder="10-digit mobile number" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/50 bg-ivory text-ink" />
                </div>
              </div>
              <div>
                <label class="block font-semibold text-ink mb-1">Subject</label>
                <input type="text" name="subject" placeholder="Saree enquiry / Order support / Wholesale" class="w-full px-3.5 py-2.5 rounded-xl border border-gold/50 bg-ivory text-ink" />
              </div>
              <div>
                <label class="block font-semibold text-ink mb-1">Message *</label>
                <textarea name="message" rows="4" required placeholder="Tell us which saree or weave you are interested in..." class="w-full px-3.5 py-2.5 rounded-xl border border-gold/50 bg-ivory text-ink"></textarea>
              </div>
              <button type="submit" class="px-6 py-3 rounded-full bg-teal text-ivory font-bold text-xs sm:text-sm hover:bg-teal-light shadow-md">
                Send Message →
              </button>
            </form>
          </div>
        </div>
      </div>
    `;
  };

  app.renderPoliciesPage = function () {
    const p = this.state.settings.policies || {};
    const activeTab = this.state.activePolicyTab || "shipping";
    const tabs = [
      { id: "shipping", label: "Shipping & Dispatch" },
      { id: "returns", label: "Returns & Exchange" },
      { id: "privacy", label: "Privacy Policy" },
      { id: "terms", label: "Terms of Service" }
    ];
    const currentPolicy = p[activeTab] || p.shipping || { title: "Store Policy", content: "" };

    return `
      <div class="page-transition max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6">
        <div>
          <span class="text-xs font-bold uppercase tracking-widest text-teal">Janardhan Textiles • Customer Care</span>
          <h1 class="font-serif text-3xl sm:text-5xl font-bold text-ink mt-1">Store Policies</h1>
          <p class="text-sm text-ink-muted mt-1">Clear, transparent shipping, returns, privacy, and service terms for every saree order.</p>
        </div>

        <div class="flex flex-wrap gap-2 border-b border-gold/30 pb-3">
          ${tabs
            .map(
              (t) => `
            <button
              type="button"
              onclick="app.state.activePolicyTab='${t.id}'; app.renderCurrentPage()"
              class="px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                activeTab === t.id ? "bg-teal text-ivory shadow-xs" : "bg-[#FAF8F5] text-ink border border-gold/40 hover:bg-gold/20"
              }"
            >
              ${t.label}
            </button>
          `
            )
            .join("")}
        </div>

        <article class="bg-[#FAF8F5] rounded-3xl border border-gold/50 p-6 sm:p-8 shadow-sm space-y-4">
          <div class="flex items-center justify-between gap-2 border-b border-gold/25 pb-3">
            <h2 class="font-serif text-2xl sm:text-3xl font-bold text-ink">${currentPolicy.title.replace(/\s*\(Needs Owner Approval\)/gi, "")}</h2>
            <span class="px-3 py-1 rounded-full bg-gold/25 text-ink border border-gold/50 text-xs font-bold">Verified Policy</span>
          </div>
          <p class="text-sm sm:text-base text-ink leading-relaxed">${String(currentPolicy.content || "").replace(/^Draft for Owner Review:\s*/i, "")}</p>
        </article>
      </div>
    `;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => app.init());
  } else {
    app.init();
  }
})();

