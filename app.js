/* ============================================================
   RetroJava Arcade — app.js
   ------------------------------------------------------------
   ⚠️ COLOQUE AQUI SUAS CREDENCIAIS DO FIREBASE
   Obtenha em: console.firebase.google.com
   (Project Settings > Your apps > Web app)
   ============================================================ */
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

const ADMIN_EMAIL = "admin@admin.com";

/* ============================================================
   Init Firebase
   ============================================================ */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

/* ============================================================
   State
   ============================================================ */
let currentUser = null;
let isAdmin     = false;
let gamesCache  = [];
let menuCache   = [];
let bannersCache= [];

/* ============================================================
   DOM shortcuts
   ============================================================ */
const $ = (s,ctx=document)=>ctx.querySelector(s);
const $$ = (s,ctx=document)=>[...ctx.querySelectorAll(s)];

document.getElementById('year').textContent = new Date().getFullYear();

/* ============================================================
   Auth
   ============================================================ */
auth.onAuthStateChanged(user=>{
  currentUser = user;
  isAdmin = !!(user && user.email === ADMIN_EMAIL);
  $('#loginBtn').textContent = isAdmin ? 'Painel Admin' : 'Admin';
});

$('#loginBtn').addEventListener('click', ()=>{
  if(isAdmin) openModal('adminModal');
  else openModal('loginModal');
});

$('#loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const pass  = $('#loginPassword').value;
  const errEl = $('#loginError');
  errEl.textContent = '';
  try{
    await auth.signInWithEmailAndPassword(email,pass);
    closeModal('loginModal');
    if(email === ADMIN_EMAIL) openModal('adminModal');
  }catch(err){
    errEl.textContent = err.message;
  }
});

$('#logoutBtn').addEventListener('click', async ()=>{
  await auth.signOut();
  closeModal('adminModal');
});

/* ============================================================
   Modal helpers
   ============================================================ */
function openModal(id){ document.getElementById(id).hidden = false; }
function closeModal(id){ document.getElementById(id).hidden = true; }
$$('[data-close]').forEach(btn=>{
  btn.addEventListener('click', e=>{
    e.target.closest('.modal').hidden = true;
  });
});
$$('.modal').forEach(m=>{
  m.addEventListener('click', e=>{
    if(e.target === m) m.hidden = true;
  });
});

/* ============================================================
   Admin tabs
   ============================================================ */
$$('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const tab = btn.dataset.tab;
    if(!tab) return;
    $$('.tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
    $$('.tab-panel').forEach(p=>p.classList.toggle('active', p.dataset.panel===tab));
  });
});

/* ============================================================
   Realtime data listeners
   ============================================================ */
db.ref('games').on('value', snap=>{
  const val = snap.val() || {};
  gamesCache = Object.entries(val).map(([id,v])=>({id,...v}));
  renderGames();
  renderAdminGames();
  refreshCategoryFilter();
});
db.ref('menu').on('value', snap=>{
  const val = snap.val() || {};
  menuCache = Object.entries(val).map(([id,v])=>({id,...v}));
  renderMenu();
  renderAdminMenu();
});
db.ref('banners').on('value', snap=>{
  const val = snap.val() || {};
  bannersCache = Object.entries(val).map(([id,v])=>({id,...v}));
  renderBanners();
  renderAdminBanners();
});

/* ============================================================
   Render — Menu
   ============================================================ */
function renderMenu(){
  const nav = $('#mainMenu');
  nav.innerHTML = menuCache
    .map(m=>`<a href="${escapeAttr(m.url||'#')}" target="_blank" rel="noopener">${escapeHtml(m.label||'')}</a>`)
    .join('');
}

/* ============================================================
   Render — Banners
   ============================================================ */
function renderBanners(){
  const el = $('#bannerArea');
  if(!bannersCache.length){
    el.innerHTML = `<div class="banner-empty">Espaço para banners informativos.<br>Faça login como admin para adicionar.</div>`;
    return;
  }
  el.innerHTML = bannersCache.map(b=>`
    <div class="banner-card">
      ${b.image ? `<img src="${escapeAttr(b.image)}" alt="">` : ''}
      <div class="banner-body">
        ${b.title ? `<h3>${escapeHtml(b.title)}</h3>` : ''}
        ${b.text  ? `<p>${escapeHtml(b.text)}</p>` : ''}
        ${b.buttonLabel && b.buttonUrl ? `<a class="btn primary small" href="${escapeAttr(b.buttonUrl)}" target="_blank" rel="noopener">${escapeHtml(b.buttonLabel)}</a>` : ''}
      </div>
    </div>
  `).join('');
}

/* ============================================================
   Render — Games grid
   ============================================================ */
function refreshCategoryFilter(){
  const sel = $('#categoryFilter');
  const current = sel.value;
  const cats = [...new Set(gamesCache.map(g=>g.category).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas categorias</option>' +
    cats.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  sel.value = current;
}

function renderGames(){
  const grid = $('#gamesGrid');
  const term = ($('#searchInput').value||'').toLowerCase();
  const cat  = $('#categoryFilter').value;
  const filtered = gamesCache.filter(g=>{
    const okTerm = !term || (g.title||'').toLowerCase().includes(term);
    const okCat  = !cat || g.category === cat;
    return okTerm && okCat;
  });
  if(!filtered.length){
    grid.innerHTML = `<p style="color:var(--muted);grid-column:1/-1;text-align:center">Nenhum jogo encontrado.</p>`;
    return;
  }
  grid.innerHTML = filtered.map(g=>`
    <div class="game-card" data-id="${g.id}">
      <div class="cover" style="background-image:url('${escapeAttr(g.cover||'')}')"></div>
      <div class="info">
        <h4>${escapeHtml(g.title||'Sem título')}</h4>
        <div class="cat">${escapeHtml(g.category||'')}</div>
      </div>
    </div>
  `).join('');
  $$('.game-card', grid).forEach(card=>{
    card.addEventListener('click', ()=>openGameModal(card.dataset.id));
  });
}
$('#searchInput').addEventListener('input', renderGames);
$('#categoryFilter').addEventListener('change', renderGames);

/* ============================================================
   Game modal
   ============================================================ */
function openGameModal(id){
  const g = gamesCache.find(x=>x.id===id);
  if(!g) return;
  $('#modalCover').src = g.cover || '';
  $('#modalTitle').textContent = g.title || '';
  $('#modalCategory').textContent = g.category || '';
  $('#modalSubcategory').textContent = g.subcategory || '';
  $('#modalDescription').textContent = g.description || '';
  $('#playNowBtn').onclick = ()=>{
    loadGameInPhone(g.link, g.title);
    closeModal('gameModal');
  };
  openModal('gameModal');
}

/* ============================================================
   Phone screen — load game / ROM
   ------------------------------------------------------------
   .jar / .jad  → roda no emulador FreeJ2ME (via emulator.html)
   outras URLs  → carrega direto no iframe (HTML5, etc.)
   ============================================================ */
function isJavaRom(url){
  return /\.(jar|jad)(\?|$)/i.test(url);
}
function loadGameInPhone(url, title){
  if(!url) return;
  const screen = $('#phoneScreen');
  const src = isJavaRom(url)
    ? `emulator.html?jar=${encodeURIComponent(url)}`
    : url;
  screen.innerHTML = `<iframe src="${escapeAttr(src)}" title="${escapeAttr(title||'Jogo')}" allow="autoplay; fullscreen; gamepad" allowfullscreen></iframe>`;
}

$('#romInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const screen = $('#phoneScreen');
  const blobUrl = URL.createObjectURL(file);
  // emulator.html é servido mesmo-origem, então pode fazer fetch do blob:
  screen.innerHTML = `<iframe src="emulator.html?jar=${encodeURIComponent(blobUrl)}" title="${escapeAttr(file.name)}" allow="autoplay; fullscreen; gamepad" allowfullscreen></iframe>`;
});

/* ============================================================
   Fullscreen
   ============================================================ */
$('#fullscreenBtn').addEventListener('click', ()=>{
  const el = $('#phoneScreen');
  if(!document.fullscreenElement){
    el.requestFullscreen?.();
  }else{
    document.exitFullscreen?.();
  }
});

/* ============================================================
   Virtual controls — envia keydown/keyup via postMessage
   ============================================================ */
const keyMap = {
  up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight',
  fire:'Enter', a:'z', b:'x'
};
$$('.phone-controls button[data-key]').forEach(btn=>{
  const send = (action)=>{
    const key = keyMap[btn.dataset.key]; if(!key) return;
    const iframe = $('#phoneScreen iframe');
    if(iframe && iframe.contentWindow){
      iframe.contentWindow.postMessage({type:'key', key, action}, '*');
    }
    document.dispatchEvent(new KeyboardEvent(action,{key,bubbles:true}));
  };
  btn.addEventListener('pointerdown', ()=>send('keydown'));
  btn.addEventListener('pointerup',   ()=>send('keyup'));
  btn.addEventListener('pointerleave',()=>send('keyup'));
});

/* ============================================================
   ADMIN — Games CRUD
   ============================================================ */
$('#gameForm').addEventListener('submit', async e=>{
  e.preventDefault();
  if(!isAdmin) return alert('Apenas admin.');
  const id = $('#gameId').value;
  const data = {
    cover: $('#gameCover').value.trim(),
    title: $('#gameTitle').value.trim(),
    description: $('#gameDescription').value.trim(),
    category: $('#gameCategory').value.trim(),
    subcategory: $('#gameSubcategory').value.trim(),
    link: $('#gameLink').value.trim(),
    updatedAt: Date.now()
  };
  try{
    if(id) await db.ref('games/'+id).update(data);
    else   await db.ref('games').push(data);
    resetGameForm();
  }catch(err){ alert('Erro: '+err.message); }
});
$('#gameFormReset').addEventListener('click', resetGameForm);
function resetGameForm(){
  $('#gameForm').reset();
  $('#gameId').value = '';
}
function renderAdminGames(){
  const ul = $('#adminGamesList');
  ul.innerHTML = gamesCache.map(g=>`
    <li>
      <div>
        <div class="item-title">${escapeHtml(g.title||'—')}</div>
        <div class="item-sub">${escapeHtml(g.category||'')} ${g.subcategory?'· '+escapeHtml(g.subcategory):''}</div>
      </div>
      <div class="actions">
        <button class="edit" data-id="${g.id}">Editar</button>
        <button class="del"  data-id="${g.id}">Excluir</button>
      </div>
    </li>
  `).join('');
  $$('#adminGamesList .edit').forEach(b=>b.addEventListener('click',()=>{
    const g = gamesCache.find(x=>x.id===b.dataset.id); if(!g) return;
    $('#gameId').value=g.id;
    $('#gameCover').value=g.cover||'';
    $('#gameTitle').value=g.title||'';
    $('#gameDescription').value=g.description||'';
    $('#gameCategory').value=g.category||'';
    $('#gameSubcategory').value=g.subcategory||'';
    $('#gameLink').value=g.link||'';
  }));
  $$('#adminGamesList .del').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Excluir este jogo?')) return;
    await db.ref('games/'+b.dataset.id).remove();
  }));
}

/* ============================================================
   ADMIN — Menu CRUD
   ============================================================ */
$('#menuForm').addEventListener('submit', async e=>{
  e.preventDefault();
  if(!isAdmin) return;
  const id = $('#menuId').value;
  const data = {
    label: $('#menuLabel').value.trim(),
    url:   $('#menuUrl').value.trim()
  };
  if(id) await db.ref('menu/'+id).update(data);
  else   await db.ref('menu').push(data);
  resetMenuForm();
});
$('#menuFormReset').addEventListener('click', resetMenuForm);
function resetMenuForm(){ $('#menuForm').reset(); $('#menuId').value=''; }
function renderAdminMenu(){
  const ul = $('#adminMenuList');
  ul.innerHTML = menuCache.map(m=>`
    <li>
      <div>
        <div class="item-title">${escapeHtml(m.label||'')}</div>
        <div class="item-sub">${escapeHtml(m.url||'')}</div>
      </div>
      <div class="actions">
        <button class="edit" data-id="${m.id}">Editar</button>
        <button class="del"  data-id="${m.id}">Excluir</button>
      </div>
    </li>
  `).join('');
  $$('#adminMenuList .edit').forEach(b=>b.addEventListener('click',()=>{
    const m=menuCache.find(x=>x.id===b.dataset.id); if(!m) return;
    $('#menuId').value=m.id;
    $('#menuLabel').value=m.label||'';
    $('#menuUrl').value=m.url||'';
  }));
  $$('#adminMenuList .del').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Excluir item de menu?')) return;
    await db.ref('menu/'+b.dataset.id).remove();
  }));
}

/* ============================================================
   ADMIN — Banners CRUD
   ============================================================ */
$('#bannerForm').addEventListener('submit', async e=>{
  e.preventDefault();
  if(!isAdmin) return;
  const id = $('#bannerId').value;
  const data = {
    title:       $('#bannerTitle').value.trim(),
    text:        $('#bannerText').value.trim(),
    image:       $('#bannerImage').value.trim(),
    buttonLabel: $('#bannerButtonLabel').value.trim(),
    buttonUrl:   $('#bannerButtonUrl').value.trim()
  };
  if(id) await db.ref('banners/'+id).update(data);
  else   await db.ref('banners').push(data);
  resetBannerForm();
});
$('#bannerFormReset').addEventListener('click', resetBannerForm);
function resetBannerForm(){ $('#bannerForm').reset(); $('#bannerId').value=''; }
function renderAdminBanners(){
  const ul = $('#adminBannersList');
  ul.innerHTML = bannersCache.map(b=>`
    <li>
      <div>
        <div class="item-title">${escapeHtml(b.title||'(sem título)')}</div>
        <div class="item-sub">${escapeHtml((b.text||'').slice(0,60))}</div>
      </div>
      <div class="actions">
        <button class="edit" data-id="${b.id}">Editar</button>
        <button class="del"  data-id="${b.id}">Excluir</button>
      </div>
    </li>
  `).join('');
  $$('#adminBannersList .edit').forEach(btn=>btn.addEventListener('click',()=>{
    const b=bannersCache.find(x=>x.id===btn.dataset.id); if(!b) return;
    $('#bannerId').value=b.id;
    $('#bannerTitle').value=b.title||'';
    $('#bannerText').value=b.text||'';
    $('#bannerImage').value=b.image||'';
    $('#bannerButtonLabel').value=b.buttonLabel||'';
    $('#bannerButtonUrl').value=b.buttonUrl||'';
  }));
  $$('#adminBannersList .del').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Excluir banner?')) return;
    await db.ref('banners/'+btn.dataset.id).remove();
  }));
}

/* ============================================================
   Utils
   ============================================================ */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(s){ return escapeHtml(s); }
