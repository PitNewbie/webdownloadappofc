// =========== 1. KONFIGURASI ===========
const CONFIG = {
  // Ganti link ini dengan RAW LINK data products.js dari GitHub milikmu[span_0](start_span)[span_0](end_span)[span_1](start_span)[span_1](end_span)
  GITHUB_PRODUCTS_URL: "http://www.dat.toline.starpit.my.id/produck.js",
  GITHUB_BANNERS_URL: "http://www.dat.toline.starpit.my.id/banner.js",
  APP_NAME: "TokoDigital",
};

// =========== 2. STORAGE HELPER (localStorage) ===========
const DB = {
  keys: {
    USERS: "td_users",
    SESSION: "td_session",
    HISTORY_PREFIX: "td_history_",
    PRODUCTS_CACHE: "td_products_cache",
  },
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) { localStorage.removeItem(key); },
};

// =========== 3. AUTH ===========
const Auth = {
  getUsers() { return DB.get(DB.keys.USERS, {}); },
  saveUsers(u) { DB.set(DB.keys.USERS, u); },

  register(username, password, name) {
    username = username.trim().toLowerCase();
    const users = this.getUsers();
    if (!username || !password) return { ok: false, msg: "Username & password wajib diisi" };
    if (users[username]) return { ok: false, msg: "Username sudah dipakai" };
    users[username] = {
      username, password, name: name || username,
      avatar: username.slice(0, 2).toUpperCase(),
      joined: new Date().toISOString(),
    };
    this.saveUsers(users);
    this.setSession(username);
    return { ok: true };
  },

  login(username, password) {
    username = username.trim().toLowerCase();
    const users = this.getUsers();
    const u = users[username];
    if (!u || u.password !== password) return { ok: false, msg: "Username atau password salah" };
    this.setSession(username);
    return { ok: true };
  },

  setSession(username) { DB.set(DB.keys.SESSION, { username }); },
  logout() { DB.remove(DB.keys.SESSION); },

  currentUser() {
    const s = DB.get(DB.keys.SESSION, null);
    if (!s) return null;
    const users = this.getUsers();
    return users[s.username] || null;
  },

  updateProfile(patch) {
    const cur = this.currentUser();
    if (!cur) return;
    const users = this.getUsers();
    users[cur.username] = { ...users[cur.username], ...patch };
    this.saveUsers(users);
  },
};

// =========== 4. RIWAYAT PESANAN ===========
const Orders = {
  key(username) { return DB.keys.HISTORY_PREFIX + username; },
  list(username) { return DB.get(this.key(username), []); },
  add(username, product) {
    const list = this.list(username);
    list.unshift({
      id: "ORD" + Date.now(),
      producticon: product.icon,
      productId: product.id,
      name: product.name,
      price: product.price,
      date: new Date().toISOString(),
      status: "Selesai",
    });
    DB.set(this.key(username), list);
  },
};

// =========== 5. AMBIL PRODUK DARI GITHUB ===========
const Products = {
  cache: [],

  async fetchFromGithub() {
    try {
      const res = await fetch(CONFIG.GITHUB_PRODUCTS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const code = await res.text();
      const extract = new Function(code + "\nreturn (typeof PRODUCTS!=='undefined')?PRODUCTS:(typeof module!=='undefined'?module.exports:[]);");
      const data = extract();
      if (!Array.isArray(data)) throw new Error("Format produk tidak valid");
      this.cache = [...data].sort(() => Math.random() - 0.5);
      DB.set(DB.keys.PRODUCTS_CACHE, data);
      return { ok: true, data };
    } catch (err) {
      const cached = DB.get(DB.keys.PRODUCTS_CACHE, null);
      if (cached && cached.length) {
        this.cache = cached;
        return { ok: true, data: cached, fromCache: true };
      }
      return { ok: false, msg: err.message };
    }
  },

  categories() {
    const set = new Set(this.cache.map(p => p.category || "Lainnya"));
    return ["Semua", ...Array.from(set)];
  },
  byCategory(cat) {
    if (!cat || cat === "Semua") return this.cache;
    return this.cache.filter(p => (p.category || "Lainnya") === cat);
  },
  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.cache.filter(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q)
    );
  },
  byId(id) { return this.cache.find(p => String(p.id) === String(id)); },
};

// =========== 5.5 AMBIL BANNER DARI GITHUB ===========
const Banners = {
  cache: [],
  async fetchFromGithub() {
    try {
      const res = await fetch(CONFIG.GITHUB_BANNERS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const code = await res.text();
      const extract = new Function(code + "\nreturn (typeof BANNERS!=='undefined')?BANNERS:(typeof module!=='undefined'?module.exports:[]);");
      let data = extract();
      
      if (Array.isArray(data)) {
        this.cache = data;
        DB.set("td_banners_cache", data);
      }
    } catch (err) {
      const cached = DB.get("td_banners_cache", []);
      if (cached && cached.length) this.cache = cached;
    }
  }
};


// =========== 6. STATE UI ===========
const State = {
  tab: "home",
  activeCategory: "Semua",
  searchQuery: "",
  detailProductId: null,
};

// =========== 7. HELPERS ===========
function rupiah(num) {
  return "Rp" + Number(num || 0).toLocaleString("id-ID");
}
function timeAgo(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
function initials(name) { return (name || "?").slice(0, 2).toUpperCase(); }

// =========== 8. RENDER: PRODUCT CARD ===========
function productCardHTML(p) {
  // Sistem akan membaca foto dari folder "produck/" berdasarkan ID produk di GitHub
  const imgPath = `producks-icon/${p.icon}.jpg`;
  
  return `
    <div class="p-card" onclick="openProductDetail('${p.id}')">
      <div class="p-thumb">
        <img src="${imgPath}" alt="${p.name}" onerror="this.src='producks-icon/default.jpg'">
      </div>
      <div class="p-body">
        <div class="p-name">${p.name}</div>
        <div class="p-cat">${p.category || "Lainnya"}</div>
        <div class="p-price">${rupiah(p.price)}${p.originalPrice ? `<span class="old">${rupiah(p.originalPrice)}</span>` : ""}</div>
        <div class="p-sold">Terjual ${p.sold || 0}</div>
      </div>
    </div>`;
}

// =========== 9. RENDER: BERANDA ===========
function renderHome() {
  const el = document.getElementById("screen-home");
  const cats = Products.categories();
  const items = Products.byCategory(State.activeCategory);

  if (!Products.cache.length) {
    el.innerHTML = `<div class="status-box"><div class="spinner"></div>Memuat produk...</div>`;
    return;
  }

  // Generate HTML Banner dari data GitHub
  let bannerHTML = "";
  if (Banners.cache.length > 0) {
    bannerHTML = `<div class="banner-slider">` + 
      Banners.cache.map(b => `
        <div class="banner">
          <div class="tag" ${b.tagColor ? `style="background: ${b.tagColor}"` : ""}></div>
          <h2>${b.title}</h2>
          <p>${b.desc}</p>
        </div>
      `).join("")
    + `</div>`;
  }

  el.innerHTML = `
    ${bannerHTML}
    <div class="cat-row">
      ${cats.map(c => `<div class="cat-chip ${c === State.activeCategory ? "active" : ""}" onclick="setCategory('${c}')">${c}</div>`).join("")}
    </div>
    <div class="section-title">${State.activeCategory === "Semua" ? "Semua Produk" : State.activeCategory} <small>${items.length} produk</small></div>
    <div class="grid">
      ${items.length ? items.map(productCardHTML).join("") : `<div class="empty-state" style="grid-column:1/-1"><div class="emoji">🗂️</div><b>Belum ada produk</b>Kategori ini masih kosong</div>`}
    </div>
  `;
}

function setCategory(cat) { State.activeCategory = cat; renderHome(); }

// =========== 10. RENDER: SEARCH ===========
function renderSearch() {
  const el = document.getElementById("screen-search");
  const q = State.searchQuery;
  const results = q ? Products.search(q) : [];

  el.innerHTML = `
    <div class="section-title">Hasil pencarian ${q ? `untuk "<span style='color:var(--primary)'>${q}</span>"` : ""}</div>
    ${!q ? `
      <div class="empty-state"><div class="emoji">🔍</div><b>Cari produk</b>Ketik nama produk di kolom atas</div>
    ` : results.length ? `
      <div class="grid">${results.map(productCardHTML).join("")}</div>
    ` : `
      <div class="empty-state"><div class="emoji">😕</div><b>Tidak ditemukan</b>Coba kata kunci lain untuk "${q}"</div>
    `}
  `;
}

// =========== 11. RENDER: RIWAYAT ===========
function renderHistory() {
  const el = document.getElementById("screen-history");
  const user = Auth.currentUser();

  if (!user) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">🔒</div><b>Masuk dulu, yuk</b>Login untuk melihat riwayat pesananmu<br><br><button class="btn outline" style="width:auto;display:inline-block;padding:10px 20px" onclick="goTab('account')">Ke halaman Akun</button></div>`;
    return;
  }

  const list = Orders.list(user.username);
  el.innerHTML = `
    <div class="section-title">Riwayat Pesanan <small>${list.length} transaksi</small></div>
    ${list.length ? list.map(o => `
      <div class="order-card">
        <div class="thumb">
          <img src="producks-icon/${o.producticon}.jpg" onerror="this.src='producks-icon/default.jpg'" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">
        </div>
        <div class="order-info">
          <div class="name">${o.name}</div>
          <div class="date">${timeAgo(o.date)}</div>
          <span class="badge">${o.status}</span>
        </div>
        <div class="order-price">${rupiah(o.price)}</div>
      </div>
    `).join("") : `<div class="empty-state"><div class="emoji">🧾</div><b>Belum ada pesanan</b>Yuk belanja produk pertamamu</div>`}
  `;
}

// =========== 12. RENDER: AKUN ===========
function renderAccount() {
  const el = document.getElementById("screen-account");
  const user = Auth.currentUser();

  if (!user) {
    el.innerHTML = `
      <div class="auth-wrap">
        <div class="logo-big">🛍️</div>
        <h2>${CONFIG.APP_NAME}</h2>
        <p class="sub">Masuk untuk menyimpan riwayat & pengaturan akunmu</p>
        <div class="auth-tabs">
          <div class="auth-tab ${State.authMode !== "register" ? "active" : ""}" onclick="setAuthMode('login')">Masuk</div>
          <div class="auth-tab ${State.authMode === "register" ? "active" : ""}" onclick="setAuthMode('register')">Daftar</div>
        </div>
        <div class="auth-form">
          ${State.authMode === "register" ? `
            <div class="form-group"><label>Nama tampilan</label><input id="reg-name" placeholder="cth: Dinda"></div>
            <div class="form-group"><label>Username</label><input id="reg-user" placeholder="username unik"></div>
            <div class="form-group"><label>Password</label><input id="reg-pass" type="password" placeholder="min. 4 karakter"></div>
            <div class="error-text" id="auth-error"></div>
            <button class="btn" onclick="handleRegister()">Buat Akun</button>
          ` : `
            <div class="form-group"><label>Username</label><input id="login-user" placeholder="username"></div>
            <div class="form-group"><label>Password</label><input id="login-pass" type="password" placeholder="password"></div>
            <div class="error-text" id="auth-error"></div>
            <button class="btn" onclick="handleLogin()">Masuk</button>
          `}
        </div>
      </div>
    `;
    return;
  }

  const totalOrders = Orders.list(user.username).length;

  el.innerHTML = `
    <div class="profile-head">
      <div class="avatar">${initials(user.avatar || user.name)}</div>
      <div>
        <div class="name">${user.name}</div>
        <div class="email">@${user.username} • ${totalOrders} pesanan</div>
      </div>
    </div>

    <div class="menu-list">
      <div class="menu-item"><span class="ic">👤</span><span class="label">Ubah nama tampilan</span></div>
      <div style="padding:0 14px 12px"><input id="acc-name" value="${user.name}" placeholder="Nama tampilan"></div>
    </div>
    <button class="btn outline" style="margin-bottom:14px" onclick="saveProfileName()">Simpan Nama</button>

    <div class="menu-list">
      <div class="menu-item" onclick="clearMyHistory()">
        <span class="ic">🗑️</span><span class="label">Hapus riwayat pesanan</span><span class="val">›</span>
      </div>
      <div class="menu-item" onclick="reloadProducts(true)">
        <span class="ic">🔄</span><span class="label">update produk (server)</span><span class="val">›</span>
      </div>
    </div>

    <div class="menu-list">
      <div class="menu-item"><span class="ic">📦</span><span class="label">Data produk</span><span class="val">GitHub</span></div>
      <div class="menu-item"><span class="ic">🗓️</span><span class="label">Gabung</span><span class="val">${new Date(user.joined).toLocaleDateString("id-ID")}</span></div>
    </div>

    <button class="btn secondary" onclick="handleLogout()">Keluar Akun</button>
  `;

  document.getElementById("acc-name").addEventListener("input", e => { State._pendingName = e.target.value; });
}

function setAuthMode(mode) { State.authMode = mode; renderAccount(); }

function handleRegister() {
  const name = document.getElementById("reg-name").value;
  const user = document.getElementById("reg-user").value;
  const pass = document.getElementById("reg-pass").value;
  const r = Auth.register(user, pass, name);
  if (!r.ok) return showAuthError(r.msg);
  showToast("Akun dibuat, selamat datang!");
  renderAccount();
}
function handleLogin() {
  const user = document.getElementById("login-user").value;
  const pass = document.getElementById("login-pass").value;
  const r = Auth.login(user, pass);
  if (!r.ok) return showAuthError(r.msg);
  showToast("Berhasil masuk");
  renderAccount();
  renderHistory();
}
function showAuthError(msg) {
  const e = document.getElementById("auth-error");
  e.textContent = msg;
  e.classList.add("show");
}
function handleLogout() {
  Auth.logout();
  showToast("Berhasil keluar");
  renderAccount();
  renderHistory();
}
function saveProfileName() {
  const val = document.getElementById("acc-name").value.trim();
  if (!val) return showToast("Nama tidak boleh kosong");
  Auth.updateProfile({ name: val, avatar: val.slice(0, 2).toUpperCase() });
  showToast("Nama tampilan diperbarui");
  renderAccount();
}
function clearMyHistory() {
  const user = Auth.currentUser();
  if (!user) return;
  if (!confirm("Hapus semua riwayat pesanan?")) return;
  DB.set(Orders.key(user.username), []);
  showToast("Riwayat dihapus");
  renderHistory();
  renderAccount();
}

// =========== 13. NAVIGASI 4 TAB ===========
function goTab(tab) {
  State.tab = tab;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + tab).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "home") renderHome();
  if (tab === "search") renderSearch();
  if (tab === "history") renderHistory();
  if (tab === "account") renderAccount();
}

// =========== 14. SEARCH BAR ===========
function handleSearchSubmit() {
  const val = document.getElementById("search-input").value;
  State.searchQuery = val;
  goTab("search");
  renderSearch();
}

// =========== 15. DETAIL PRODUK (bottom sheet) ===========
function openProductDetail(id) {
  const p = Products.byId(id);
  if (!p) return;
  State.detailProductId = id;
  const sheetBody = document.getElementById("sheet-body");
  
  // Baca foto langsung dari folder produck/
  const imgPath = `producks-icon/${p.icon}.jpg`;
  
  sheetBody.innerHTML = `
    <div class="sheet-close"></div>
    <div class="p-thumb-lg">
      <img src="${imgPath}" alt="${p.name}" onerror="this.src='producks-icon/${p.icon}.jpg'">
    </div>
    <h2>${p.name}</h2>
    <div class="price-row">
      <div class="price">${rupiah(p.price)}</div>
      ${p.originalPrice ? `<span class="old" style="font-size:13px">${rupiah(p.originalPrice)}</span>` : ""}
    </div>
    <div class="meta-row">
      <span>⭐ <b>${p.rating || "5.0"}</b></span>
      <span>🛒 <b>${p.sold || 0}</b> terjual</span>
      <span>🏷️ <b>${p.category || "Lainnya"}</b></span>
    </div>
    <div class="desc">${p.description || "Tidak ada deskripsi untuk produk ini."}</div>
    <button class="btn" onclick="buyProduct('${p.id}')">Beli Sekarang</button>
  `;
  document.getElementById("sheet-overlay").classList.add("show");
}
function closeSheet() { document.getElementById("sheet-overlay").classList.remove("show"); }

function buyProduct(id) {
  const user = Auth.currentUser();
  const p = Products.byId(id);

  if (!user) {
    closeSheet();
    showToast("Silakan masuk akun dulu untuk membeli");
    goTab("account");
    return;
  }

  if (!p) {
    showToast("Produk tidak ditemukan");
    return;
  }

  if (!p.sellerWA) {
    showToast("Nomor penjual belum tersedia");
    return;
  }

  Orders.add(user.username, p);

  const message =
`Halo Admin 👋

Saya ingin membeli produk:

📦 Produk: ${p.name}
💰 Harga: ${rupiah(p.price)}
👤 Nama: ${user.name}
🔑 Username: @${user.username}

Mohon diproses ya, terima kasih 🙏

*label dari*
   ╰┈➤ https://www.toline.starpit.my.id/`;

  const waURL =
    `https://wa.me/${p.sellerWA}?text=${encodeURIComponent(message)}`;

  closeSheet();
  showToast("Membuka WhatsApp penjual...");

  setTimeout(() => {
    window.open(waURL, "_blank");
  }, 500);
}

// =========== 16. RELOAD PRODUK ===========
async function reloadProducts(manual) {
  if (manual) showToast("Menyinkronkan produk...");
  document.getElementById("screen-home").innerHTML = `<div class="status-box"><div class="spinner"></div>Memuat produk dari server...</div>`;
  await Banners.fetchFromGithub();
  const r = await Products.fetchFromGithub();
  if (!r.ok) {
    document.getElementById("screen-home").innerHTML = `
      <div class="empty-state">
        <div class="emoji">⚠️</div>
        <b>Gagal memuat produk</b>
        ${r.msg}<br><br>
        Tolong aktifkan data seluler/wifi anda.
        <br><br><button class="btn outline" style="width:auto;display:inline-block;padding:10px 18px" onclick="reloadProducts(true)">Coba Lagi</button>
      </div>`;
    return;
  }
  if (manual) showToast(r.fromCache ? "Menampilkan data offline" : "Produk berhasil diperbarui");
  renderHome();
  if (State.tab === "search") renderSearch();
}

// =========== 17. INIT ===========
function init() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => goTab(btn.dataset.tab));
  });

  document.getElementById("search-input").addEventListener("keydown", e => {
    if (e.key === "Enter") handleSearchSubmit();
  });
  document.getElementById("search-go").addEventListener("click", handleSearchSubmit);

  document.getElementById("sheet-overlay").addEventListener("click", e => {
    if (e.target.id === "sheet-overlay") closeSheet();
  });

  goTab("home");
  reloadProducts(false);
}

document.addEventListener("DOMContentLoaded", init);
    
