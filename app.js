/* ==========================================================================
   J2ME ARCADE — app.js
   1) COLE AQUI SUAS CREDENCIAIS DO FIREBASE (Authentication + Realtime Database)
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyB4_emQyAaluMslxOzQ_Q4-BEz1dZ21T7k",
  authDomain: "workin-java.firebaseapp.com",
  databaseURL: "https://workin-java-default-rtdb.firebaseio.com",
  projectId: "workin-java",
  storageBucket: "workin-java.firebasestorage.app",
  messagingSenderId: "1031747973241",
  appId: "1:1031747973241:web:2d072365da150904f8e4a8"
};

/* Caminho do MicroEmulator (implementação MIDP/J2ME em Java) executado pelo CheerpJ.
   Baixe o microemulator.jar e coloque em ./lib/ (veja README.md). */
const MICROEMULATOR_JAR = "lib/microemulator.jar";
const GAMES_PER_PAGE = 15;

/* ==========================================================================
   2) Estado + helpers
   ========================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let games = [];             // [{id, title, cover, category, year, description, jar}]
let filtered = [];
let currentPage = 1;
let currentCategory = "";
let searchTerm = "";
let selectedGame = null;
let db = null, auth = null, fbReady = false;

let siteConfig = {
  title: "J2ME Arcade",
  subtitle: "Emulador livre de jogos Java para celular, direto no navegador",
  welcome:
    "Bem-vindo! Aqui você joga clássicos e títulos independentes em J2ME sem instalar nada.\nFaça o upload da sua própria ROM ou escolha um jogo do acervo abaixo.",
  logoSquare: "",
  logoWide: "",
  favicon: "",
  theme: "dark"
};

const LS = {
  theme: "j2me.theme",
  games: "j2me.games",
  config: "j2me.config"
};

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const placeholderCover = title =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#1b2230"/><text x="150" y="160" font-family="monospace" font-size="26" fill="#00e5a0" text-anchor="middle">${String(
      title || "J2ME"
    ).slice(0, 14)}</text></svg>`
  );

/* ==========================================================================
   3) Temas
   ========================================================================== */
const THEMES = ["dark", "light", "cyberpunk"];
const THEME_ICON = { dark: "🌙", light: "☀️", cyberpunk: "⚡" };

function applyTheme(theme, persist = true) {
  if (!THEMES.includes(theme)) theme = "dark";
  document.documentElement.dataset.theme = theme;
  $("#themeFab").textContent = THEME_ICON[theme];
  if (persist) localStorage.setItem(LS.theme, theme);
}
$("#themeFab").addEventListener("click", () => {
  const next = THEMES[(THEMES.indexOf(document.documentElement.dataset.theme) + 1) % THEMES.length];
  applyTheme(next);
  toast("Tema: " + next);
});

/* ==========================================================================
   4) Identidade visual do site
   ========================================================================== */
function applySiteConfig() {
  $("#siteTitle").textContent = siteConfig.title || "J2ME Arcade";
  $("#brandText").textContent = siteConfig.title || "J2ME Arcade";
  $("#footerBrand").textContent = siteConfig.title || "J2ME Arcade";
  $("#siteSubtitle").textContent = siteConfig.subtitle || "";
  $("#welcomeText").innerHTML = String(siteConfig.welcome || "")
    .split("\n")
    .filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`)
    .join("");
  document.title = `${siteConfig.title || "J2ME Arcade"} — Emulador Java Online`;
  $("#metaDesc").setAttribute("content", siteConfig.subtitle || "Emulador J2ME online e gratuito.");

  if (siteConfig.logoSquare) $("#logoSquare").src = siteConfig.logoSquare;
  const wide = $("#logoWide");
  if (siteConfig.logoWide) {
    wide.src = siteConfig.logoWide;
    wide.hidden = false;
    $("#brandText").style.display = "none";
  } else {
    wide.hidden = true;
    $("#brandText").style.display = "";
  }
  if (siteConfig.favicon) $("#faviconLink").href = siteConfig.favicon;

  // tema: preferência do usuário vence; senão, padrão do admin
  applyTheme(localStorage.getItem(LS.theme) || siteConfig.theme || "dark", false);
}

/* ==========================================================================
   5) Firebase (com fallback local se não configurado)
   ========================================================================== */
function initFirebase() {
  if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
    console.warn("[J2ME] Firebase não configurado — usando armazenamento local (demo).");
    return false;
  }
  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.database();
    fbReady = true;

    db.ref("games").on("value", snap => {
      const val = snap.val() || {};
      games = Object.entries(val).map(([id, g]) => ({ ...g, id }));
      games.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      afterGamesChange();
    });
    db.ref("config").on("value", snap => {
      if (snap.val()) siteConfig = { ...siteConfig, ...snap.val() };
      applySiteConfig();
    });
    auth.onAuthStateChanged(user => {
      if (user) {
        $("#adminUser").textContent = user.email;
        closeModal($("#loginModal"));
        openModal($("#adminModal"));
        renderAdminList();
        fillSiteForm();
      }
    });
    return true;
  } catch (e) {
    console.error("[J2ME] Falha ao iniciar Firebase:", e);
    return false;
  }
}

function loadLocal() {
  try {
    games = JSON.parse(localStorage.getItem(LS.games) || "[]");
    const c = JSON.parse(localStorage.getItem(LS.config) || "null");
    if (c) siteConfig = { ...siteConfig, ...c };
  } catch (_) {}
  if (!games.length) games = demoGames();
  applySiteConfig();
  afterGamesChange();
}
const saveLocal = () => {
  localStorage.setItem(LS.games, JSON.stringify(games));
  localStorage.setItem(LS.config, JSON.stringify(siteConfig));
};

function demoGames() {
  const cats = ["Ação", "Aventura", "Puzzle", "Corrida", "RPG"];
  return Array.from({ length: 18 }, (_, i) => ({
    id: "demo" + i,
    title: "Indie J2ME #" + (i + 1),
    category: cats[i % cats.length],
    year: 2004 + (i % 8),
    cover: "",
    jar: "",
    description:
      "Título independente de demonstração. Cadastre seus jogos pelo painel administrativo para substituir estes exemplos. Descrição completa aparece aqui no modal.",
    createdAt: Date.now() - i * 1000
  }));
}

/* ==========================================================================
   6) Busca, filtro, grid e paginação
   ========================================================================== */
function afterGamesChange() {
  applyFilters();
  fillCategoryDatalist();
  if (!$("#adminModal").hidden) renderAdminList();
}

function applyFilters() {
  const q = searchTerm.trim().toLowerCase();
  filtered = games.filter(g => {
    const okCat = !currentCategory || (g.category || "").toLowerCase() === currentCategory.toLowerCase();
    const hay = `${g.title} ${g.category} ${g.year} ${g.description}`.toLowerCase();
    return okCat && (!q || hay.includes(q));
  });
  currentPage = 1;
  renderGrid();
}

function renderGrid() {
  const grid = $("#gamesGrid");
  const totalPages = Math.max(1, Math.ceil(filtered.length / GAMES_PER_PAGE));
  currentPage = Math.min(currentPage, totalPages);
  const slice = filtered.slice((currentPage - 1) * GAMES_PER_PAGE, currentPage * GAMES_PER_PAGE);

  $("#gamesCount").textContent = `${filtered.length} jogo(s)`;
  $("#gamesEmpty").hidden = filtered.length !== 0;

  grid.innerHTML = slice
    .map(
      g => `<article class="card" data-id="${g.id}" tabindex="0">
      <img class="card-cover" loading="lazy" src="${esc(g.cover || placeholderCover(g.title))}"
           alt="Capa do jogo ${esc(g.title)}" onerror="this.src='${placeholderCover(g.title)}'">
      <div class="card-body">
        <p class="card-meta">${esc(g.category || "Jogo")}${g.year ? " · " + esc(g.year) : ""}</p>
        <h3 class="card-title">${esc(g.title)}</h3>
        <p class="card-desc">${esc(g.description || "")}</p>
      </div></article>`
    )
    .join("");

  $$(".card", grid).forEach(c => {
    const open = () => openGameModal(c.dataset.id);
    c.addEventListener("click", open);
    c.addEventListener("keydown", e => e.key === "Enter" && open());
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const nav = $("#pagination");
  nav.innerHTML = "";
  if (totalPages <= 1) return;

  const add = (label, page, opts = {}) => {
    if (opts.dots) {
      const s = document.createElement("span");
      s.textContent = "…";
      nav.appendChild(s);
      return;
    }
    const b = document.createElement("button");
    b.textContent = label;
    if (opts.active) b.classList.add("active");
    if (opts.disabled) b.disabled = true;
    b.addEventListener("click", () => {
      currentPage = page;
      renderGrid();
      $("#games").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.appendChild(b);
  };

  add("‹", currentPage - 1, { disabled: currentPage === 1 });

  // janela de no máximo 5 números
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);

  if (start > 1) {
    add("1", 1, { active: currentPage === 1 });
    if (start > 2) add(null, null, { dots: true });
  }
  for (let p = start; p <= end; p++) add(String(p), p, { active: p === currentPage });
  if (end < totalPages) {
    if (end < totalPages - 1) add(null, null, { dots: true });
    add(String(totalPages), totalPages, { active: currentPage === totalPages });
  }

  add("›", currentPage + 1, { disabled: currentPage === totalPages });
}

$("#searchInput").addEventListener("input", e => {
  searchTerm = e.target.value;
  applyFilters();
});
$$(".submenu a[data-cat]").forEach(a =>
  a.addEventListener("click", () => {
    currentCategory = a.dataset.cat || "";
    applyFilters();
    toast(currentCategory ? "Categoria: " + currentCategory : "Todas as categorias");
  })
);

/* ==========================================================================
   7) Modais
   ========================================================================== */
function openModal(m) { m.hidden = false; document.body.style.overflow = "hidden"; }
function closeModal(m) { m.hidden = true; if ($$(".modal:not([hidden])").length === 0) document.body.style.overflow = ""; }
$$(".modal").forEach(m => {
  m.addEventListener("click", e => { if (e.target === m || e.target.hasAttribute("data-close")) closeModal(m); });
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") $$(".modal:not([hidden])").forEach(closeModal);
});

function openGameModal(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;
  selectedGame = g;
  $("#gameModalBody").innerHTML = `
    <div class="game-detail">
      <img src="${esc(g.cover || placeholderCover(g.title))}" alt="Capa de ${esc(g.title)}"
           onerror="this.src='${placeholderCover(g.title)}'">
      <div>
        <h3>${esc(g.title)}</h3>
        <div class="tags">
          ${g.category ? `<span class="tag">${esc(g.category)}</span>` : ""}
          ${g.year ? `<span class="tag">${esc(g.year)}</span>` : ""}
          ${g.jar ? `<span class="tag">.jar</span>` : ""}
        </div>
        <p>${esc(g.description || "Sem descrição.")}</p>
      </div>
    </div>`;
  openModal($("#gameModal"));
}

$("#btnPlay").addEventListener("click", async () => {
  if (!selectedGame?.jar) return toast("Este jogo não possui link de arquivo .jar.");
  closeModal($("#gameModal"));
  $("#emulator").scrollIntoView({ behavior: "smooth", block: "center" });
  await playFromUrl(selectedGame.jar, selectedGame.title);
});

/* ==========================================================================
   8) Emulador J2ME (CheerpJ + MicroEmulator) — ROM sempre na RAM
   ========================================================================== */
let cheerpjReady = false;
let running = false;

function emuStatus(msg, spinning = false) {
  $("#emuStatus").textContent = msg || "";
  $("#emuSpinner").hidden = !spinning;
}

async function ensureCheerpJ() {
  if (cheerpjReady) return;
  emuStatus("Inicializando máquina virtual Java…", true);
  await cheerpjInit({ enableInputMethods: true, javaProperties: [] });
  cheerpjCreateDisplay(-1, -1, $("#cheerpjDisplay"));
  cheerpjReady = true;
  emuStatus("");
}

/** Recebe bytes (Uint8Array) da ROM, monta no filesystem virtual e roda. */
async function bootRom(bytes, label) {
  try {
    $("#romName").textContent = "Carregado: " + label;
    await ensureCheerpJ();
    emuStatus("Carregando " + label + "…", true);

    const vpath = "/str/game.jar";
    cheerpjAddStringFile(vpath, bytes);

    $("#emuPlaceholder").style.opacity = "0";
    $("#cheerpjDisplay").classList.add("active");
    running = true;

    // MicroEmulator fornece a implementação MIDP/CLDC para o .jar do jogo
    await cheerpjRunMain(
      "org.microemu.app.Main",
      "/app/" + MICROEMULATOR_JAR.replace(/^\.?\//, ""),
      vpath
    );
  } catch (err) {
    console.error(err);
    running = false;
    $("#emuPlaceholder").style.opacity = "1";
    $("#cheerpjDisplay").classList.remove("active");
    emuStatus("Não foi possível iniciar. Verifique o arquivo .jar e o microemulator.jar em /lib.");
    toast("Erro ao iniciar o emulador.");
  }
}

/* Upload: lido apenas em memória (ArrayBuffer), nada é enviado a servidor */
$("#romInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  emuStatus("Enviando arquivo…", true);
  const buf = await file.arrayBuffer();
  await new Promise(r => setTimeout(r, 500)); // sensação de upload
  await bootRom(new Uint8Array(buf), file.name);
});

async function playFromUrl(url, label) {
  try {
    emuStatus("Baixando " + label + "…", true);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = await res.arrayBuffer();
    await bootRom(new Uint8Array(buf), label || "game.jar");
  } catch (err) {
    console.error(err);
    emuStatus("Falha ao baixar o .jar (verifique o link e o CORS).");
    toast("Não foi possível baixar o arquivo do jogo.");
  }
}

$("#btnStop").addEventListener("click", () => {
  running = false;
  $("#cheerpjDisplay").classList.remove("active");
  $("#cheerpjDisplay").innerHTML = "";
  cheerpjReady = false;
  $("#emuPlaceholder").style.opacity = "1";
  $("#romName").textContent = "";
  emuStatus("Emulador parado. Recarregue uma ROM para jogar.");
});

const goFullscreen = () => {
  const el = $(".phone-screen");
  (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
};
$("#btnFullscreen").addEventListener("click", goFullscreen);
$("#navFullscreen").addEventListener("click", e => { e.preventDefault(); goFullscreen(); });

/* Teclado virtual do "celular" */
$$(".key").forEach(k =>
  k.addEventListener("click", () => {
    const target = $("#cheerpjDisplay canvas") || $("#cheerpjDisplay");
    const key = k.dataset.key;
    ["keydown", "keyup"].forEach(type =>
      target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true }))
    );
  })
);

/* ==========================================================================
   9) Menu (desktop hover via CSS / mobile hambúrguer)
   ========================================================================== */
$("#hamburger").addEventListener("click", () => {
  const nav = $("#nav");
  const open = nav.classList.toggle("open");
  $("#hamburger").setAttribute("aria-expanded", String(open));
});
$$(".has-sub > a").forEach(a =>
  a.addEventListener("click", e => {
    if (window.innerWidth <= 900) {
      e.preventDefault();
      a.parentElement.classList.toggle("open");
    }
  })
);
$$(".nav a:not(.has-sub > a)").forEach(a =>
  a.addEventListener("click", () => { if (window.innerWidth <= 900) $("#nav").classList.remove("open"); })
);

/* ==========================================================================
   10) Autenticação + Painel administrativo
   ========================================================================== */
function openAdminArea(e) {
  e?.preventDefault();
  $("#nav").classList.remove("open");
  if (fbReady && auth?.currentUser) {
    $("#adminUser").textContent = auth.currentUser.email;
    openModal($("#adminModal"));
    renderAdminList();
    fillSiteForm();
  } else if (fbReady) {
    openModal($("#loginModal"));
  } else {
    // modo demo local
    $("#adminUser").textContent = "modo local (sem Firebase)";
    openModal($("#adminModal"));
    renderAdminList();
    fillSiteForm();
  }
}
$("#openAdmin").addEventListener("click", openAdminArea);
$("#openAdmin2").addEventListener("click", openAdminArea);

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  try {
    await auth.signInWithEmailAndPassword($("#loginEmail").value, $("#loginPass").value);
    toast("Bem-vindo, admin!");
  } catch (err) {
    $("#loginErr").textContent = "Falha no login: " + (err.code || err.message);
  }
});
$("#btnLogout").addEventListener("click", async () => {
  if (fbReady && auth) await auth.signOut();
  closeModal($("#adminModal"));
  toast("Sessão encerrada.");
});

$$(".tab").forEach(t =>
  t.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.remove("active"));
    $$(".tab-panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $("#" + t.dataset.tab).classList.add("active");
  })
);

function fillCategoryDatalist() {
  const cats = [...new Set(games.map(g => g.category).filter(Boolean))];
  $("#catList").innerHTML = cats.map(c => `<option value="${esc(c)}">`).join("");
}

function renderAdminList() {
  const q = $("#adminSearch").value.trim().toLowerCase();
  const list = games.filter(g => !q || `${g.title} ${g.category}`.toLowerCase().includes(q));
  $("#adminList").innerHTML =
    list
      .map(
        g => `<div class="admin-item">
      <img src="${esc(g.cover || placeholderCover(g.title))}" alt="">
      <div class="ai-info"><strong>${esc(g.title)}</strong>
        <small>${esc(g.category || "-")} · ${esc(g.year || "-")}</small></div>
      <button class="btn small" data-edit="${g.id}">Editar</button>
      <button class="btn small danger" data-del="${g.id}">Apagar</button>
    </div>`
      )
      .join("") || `<p class="hint">Nenhum jogo cadastrado ainda.</p>`;

  $$("[data-edit]", $("#adminList")).forEach(b => b.addEventListener("click", () => editGame(b.dataset.edit)));
  $$("[data-del]", $("#adminList")).forEach(b => b.addEventListener("click", () => deleteGame(b.dataset.del)));
}
$("#adminSearch").addEventListener("input", renderAdminList);

function editGame(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;
  $("#gameId").value = g.id;
  $("#gTitle").value = g.title || "";
  $("#gCategory").value = g.category || "";
  $("#gYear").value = g.year || "";
  $("#gCover").value = g.cover || "";
  $("#gJar").value = g.jar || "";
  $("#gDesc").value = g.description || "";
  $('.tab[data-tab="tabForm"]').click();
}

async function deleteGame(id) {
  if (!confirm("Apagar este jogo definitivamente?")) return;
  if (fbReady) await db.ref("games/" + id).remove();
  else {
    games = games.filter(g => g.id !== id);
    saveLocal();
    afterGamesChange();
  }
  toast("Jogo apagado.");
  renderAdminList();
}

$("#gameForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("#gameId").value || uid();
  const data = {
    title: $("#gTitle").value.trim(),
    category: $("#gCategory").value.trim(),
    year: Number($("#gYear").value) || null,
    cover: $("#gCover").value.trim(),
    jar: $("#gJar").value.trim(),
    description: $("#gDesc").value.trim(),
    createdAt: games.find(g => g.id === id)?.createdAt || Date.now()
  };
  try {
    if (fbReady) await db.ref("games/" + id).set(data);
    else {
      const i = games.findIndex(g => g.id === id);
      if (i >= 0) games[i] = { ...data, id };
      else games.unshift({ ...data, id });
      saveLocal();
      afterGamesChange();
    }
    toast("Jogo salvo!");
    resetGameForm();
    renderAdminList();
  } catch (err) {
    toast("Erro ao salvar: " + (err.code || err.message));
  }
});
function resetGameForm() { $("#gameForm").reset(); $("#gameId").value = ""; }
$("#btnResetForm").addEventListener("click", resetGameForm);

function fillSiteForm() {
  $("#sTitle").value = siteConfig.title || "";
  $("#sSubtitle").value = siteConfig.subtitle || "";
  $("#sLogoSquare").value = siteConfig.logoSquare || "";
  $("#sLogoWide").value = siteConfig.logoWide || "";
  $("#sFavicon").value = siteConfig.favicon || "";
  $("#sWelcome").value = siteConfig.welcome || "";
  $("#sTheme").value = siteConfig.theme || "dark";
}

$("#siteForm").addEventListener("submit", async e => {
  e.preventDefault();
  siteConfig = {
    ...siteConfig,
    title: $("#sTitle").value.trim(),
    subtitle: $("#sSubtitle").value.trim(),
    logoSquare: $("#sLogoSquare").value.trim(),
    logoWide: $("#sLogoWide").value.trim(),
    favicon: $("#sFavicon").value.trim(),
    welcome: $("#sWelcome").value,
    theme: $("#sTheme").value
  };
  try {
    if (fbReady) await db.ref("config").set(siteConfig);
    else saveLocal();
    localStorage.removeItem(LS.theme); // deixa o tema do admin valer de novo
    applySiteConfig();
    toast("Aparência atualizada!");
  } catch (err) {
    toast("Erro ao salvar: " + (err.code || err.message));
  }
});

/* ---------- Backup: exportar / importar ---------- */
$("#btnExport").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    config: siteConfig,
    games: games.reduce((acc, g) => { const { id, ...rest } = g; acc[id] = rest; return acc; }, {})
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `j2me-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup exportado.");
});

$("#importInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.games) throw new Error("JSON sem a chave 'games'.");
    if (!confirm("Importar backup? Os dados atuais serão substituídos.")) return;
    if (fbReady) {
      await db.ref("games").set(data.games);
      if (data.config) await db.ref("config").set({ ...siteConfig, ...data.config });
    } else {
      games = Object.entries(data.games).map(([id, g]) => ({ ...g, id }));
      if (data.config) siteConfig = { ...siteConfig, ...data.config };
      saveLocal();
      applySiteConfig();
      afterGamesChange();
    }
    $("#backupMsg").textContent = "";
    toast("Backup importado com sucesso!");
    renderAdminList();
    fillSiteForm();
  } catch (err) {
    $("#backupMsg").textContent = "Erro ao importar: " + err.message;
  } finally {
    e.target.value = "";
  }
});

/* ==========================================================================
   11) Boot
   ========================================================================== */
$("#year").textContent = new Date().getFullYear();
applyTheme(localStorage.getItem(LS.theme) || siteConfig.theme, false);
if (!initFirebase()) loadLocal();
else applySiteConfig();
