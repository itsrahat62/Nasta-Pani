/* =========================================================================
   নাস্তা অর্ডার — সিঙ্গেল ফাইল ফ্রন্টএন্ড
   ========================================================================= */
'use strict';

// ------------------------------------------------------------------ utils
const $ = (s, r = document) => r.querySelector(s);
const BN = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/[0-9]/g, (d) => BN[d]);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = (n) => '৳' + bn(Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }));

const MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const DAYS = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
function niceDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${bn(d)} ${MONTHS[m - 1]}, ${DAYS[dt.getUTCDay()]}`;
}
function shortDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${bn(d)} ${MONTHS[m - 1]}`;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// ------------------------------------------------------------ রঙ ও ইমোজি
const PALETTE = [
  { a: '#ff6a3d', s: '#fff0e8', g: 'linear-gradient(135deg,#ffa03c,#ff6a3d)' }, // কমলা
  { a: '#0e9d8a', s: '#e2f7f4', g: 'linear-gradient(135deg,#23c4a8,#0e9d8a)' }, // সবুজাভ নীল
  { a: '#6244e0', s: '#efeaff', g: 'linear-gradient(135deg,#8b6dff,#6244e0)' }, // বেগুনি
  { a: '#ef3f76', s: '#ffe9f1', g: 'linear-gradient(135deg,#ff6f9c,#ef3f76)' }, // গোলাপি
  { a: '#2f7cff', s: '#e6f0ff', g: 'linear-gradient(135deg,#4facfe,#2f7cff)' }, // নীল
  { a: '#d4a017', s: '#fff6dd', g: 'linear-gradient(135deg,#ffd166,#d4a017)' }, // সোনালি
];
/** সূচক অনুযায়ী রঙের CSS ভ্যারিয়েবল */
function accent(i) {
  const p = PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
  return `--accent:${p.a};--accent-soft:${p.s};--accent-grad:${p.g}`;
}
function hashIdx(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

const EMOJI_MAP = [
  [/কফি/, '☕'], [/সিঙ্গারা|সমুচা|সামুচা|সিংগারা/, '🥟'],
  // "সমুচা"-তে যেন চা না ধরে — তাই আশেপাশে ফাঁকা/শেষ থাকতে হবে
  [/(^|\s)চা(\s|$)/, '🍵'], [/পানি|ওয়াটার/, '💧'], [/জুস|শরবত|লেবু/, '🧃'],
  [/ডিম|অমলেট|ওমলেট|পোচ/, '🥚'], [/পুরি|পরোটা|রুটি|নান|লুচি/, '🫓'],
  [/ডাল/, '🍲'], [/ভাজি|সবজি|তরকারি|সালাদ/, '🥗'], [/মাংস|মুরগি|চিকেন|গরু|কাবাব/, '🍗'], [/মাছ/, '🐟'],
  [/ভাত|খিচুড়ি|বিরিয়ানি|পোলাও/, '🍚'], [/বার্গার/, '🍔'], [/স্যান্ডউইচ|স্যান্ডুইচ/, '🥪'],
  [/পিঠা|কেক|পেস্ট্রি/, '🍰'], [/মিষ্টি|রসগোল্লা|দই/, '🍮'], [/বিস্কুট|কুকি|টোস্ট/, '🍪'],
  [/চিপস|ঝালমুড়ি|মুড়ি|চানাচুর/, '🥨'], [/কলা|আপেল|ফল|আম|পেয়ারা/, '🍎'], [/নুডলস|নুডুলস|চাউমিন/, '🍜'],
  [/দুধ/, '🥛'], [/আইসক্রিম|কুলফি/, '🍦'], [/সরবত|কোক|পেপসি|কোল্ড/, '🥤'],
];
function emojiFor(name) {
  for (const [re, em] of EMOJI_MAP) if (re.test(name)) return em;
  return '🍽️';
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error((data && data.error) || 'সমস্যা হয়েছে');
  return data;
}

// ------------------------------------------------------------------ state
const S = {
  boot: null,
  tab: 'order',
  authTab: 'login',
  items: [],
  cart: new Map(),      // key → line
  orderMeta: null,
  dirty: false,
  date: null,           // স্টাফ পেজে দেখা তারিখ
  cache: {},
  statusVersion: null,
  shops: [],
  shopId: null,
  floor: null,          // সুপার অ্যাডমিন কোন তলা দেখছেন (null = সব)
  orderFor: null,       // স্টাফ কারো হয়ে অর্ডার করলে {id, name}
  usual: null,
  notif: [],            // স্টাফের ঘণ্টা — আজকের অর্ডারগুলো
  notifUnseen: 0,
};

/** সুপার অ্যাডমিন কোনো তলা বেছে নিলে সেটা কোয়েরিতে জুড়ে দেয় */
const fq = (sep = '&') => (S.floor ? `${sep}floor=${S.floor}` : '');
const floorBn = (f) => (f ? `${bn(f)}য় তলা` : 'সব তলা');
/** হেডারে কোন তলা দেখাচ্ছি সেটা ছোট করে লেখা */
function floorTag() {
  const f = S.boot?.user?.floor ?? S.floor;
  return f ? ` · ${bn(f)}য় তলা` : (isAdmin() ? ' · সব তলা' : '');
}

const ROLE_BN = { super_admin: 'সুপার অ্যাডমিন', staff: 'স্টাফ', user: 'ইউজার' };
const OSTATUS = {
  pending:   { t: 'অপেক্ষায়',  c: 'warn' },
  purchased: { t: 'কেনা হয়েছে', c: 'info' },
  delivered: { t: 'দেওয়া হয়েছে', c: 'ok' },
  cancelled: { t: 'বাতিল',     c: '' },
};
const isStaff = () => S.boot?.user && (S.boot.user.role === 'staff' || S.boot.user.role === 'super_admin');
const isAdmin = () => S.boot?.user?.role === 'super_admin';

// ------------------------------------------------------------------ sheet
function sheet({ title, body, footer, onOpen }) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.id = 'sheet';
  bg.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="grabber"></div>
      <div class="sheet-h"><h3>${title}</h3><button class="x" data-act="closesheet">✕</button></div>
      <div class="sheet-b">${body}</div>
      ${footer ? `<div class="sheet-f">${footer}</div>` : ''}
    </div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg);
  document.body.style.overflow = 'hidden';
  if (onOpen) onOpen(bg);
  return bg;
}
function closeSheet() {
  const s = $('#sheet');
  if (s) s.remove();
  document.body.style.overflow = '';
}

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    S.boot = await api('/api/bootstrap');
  } catch {
    $('#app').innerHTML = `<div class="empty"><div class="big">📴</div>সার্ভারে যাওয়া যাচ্ছে না</div>`;
    return;
  }
  S.date = S.date || S.boot.today;
  S.statusVersion = S.boot.status?.version ?? null;
  if (!S.boot.user) return renderAuth();
  if (!isStaff() && ['today', 'shops'].includes(S.tab)) S.tab = 'order';
  // স্টাফ ঢুকলেই আজকের তালিকা; নিজের অর্ডার পাতা তার লাগে না
  if (isStaff() && S.tab === 'order' && !S.orderFor) S.tab = 'today';
  render();
  fetchNotifs();
  startPolling();
}

// ------------------------------------------------- স্টাফের নোটিফিকেশন
const seenKey = () => `nasta_seen_${S.boot.user.id}_${S.floor || S.boot.user.floor || 'all'}`;
function getSeen() { try { return localStorage.getItem(seenKey()) || ''; } catch { return ''; } }
function markSeen() {
  const top = S.notif[0]?.updated_at;
  if (top) { try { localStorage.setItem(seenKey(), String(top)); } catch { /* ঠিক আছে */ } }
  S.notifUnseen = 0;
}

/** নতুন অর্ডার এলে ঘণ্টায় সংখ্যা বসায়; শুধু নিজের তলারটাই আসে */
async function fetchNotifs({ announce = false } = {}) {
  if (!isStaff()) return;
  try {
    const r = await api(`/api/notifications?date=${S.boot.today}${fq()}`);
    const before = S.notifUnseen;
    S.notif = r.items || [];
    const seen = getSeen();
    S.notifUnseen = S.notif.filter((x) => String(x.updated_at) > seen).length;
    if (announce && S.notifUnseen > before) {
      const fresh = S.notif.find((x) => String(x.updated_at) > seen);
      if (fresh) toast(`🔔 ${fresh.user_name} অর্ডার দিয়েছেন`, 'ok');
    }
    const b = document.querySelector('[data-act="notif"] .badge');
    const btn = document.querySelector('[data-act="notif"]');
    if (btn) {
      if (S.notifUnseen && !b) btn.insertAdjacentHTML('beforeend', `<span class="badge">${bn(S.notifUnseen)}</span>`);
      else if (S.notifUnseen && b) b.textContent = bn(S.notifUnseen);
      else if (b) b.remove();
    }
  } catch { /* চুপচাপ */ }
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!S.boot?.user || document.hidden) return;
    try {
      const r = await api(`/api/status${fq('?')}`);
      const v = r.status?.version ?? null;
      S.boot.now = r.now;
      if (v !== S.statusVersion) {
        S.statusVersion = v;
        S.boot.status = r.status;
        if (r.status) toast(`${r.status.icon} ${r.status.label}`, 'ok');
        if (!$('#sheet')) render();
      }
    } catch { /* চুপচাপ */ }
    fetchNotifs({ announce: true });
  }, 20000);
}

// ------------------------------------------------------------------ auth
function renderAuth() {
  const t = S.authTab;
  $('#app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-logo">
        <div class="em">🍵</div>
        <h1>নাস্তা অর্ডার</h1>
        <p>${esc(S.boot.office_name)}</p>
      </div>
      ${S.boot.allow_register === false ? '' : `<div class="tabs2">
        <button data-act="authtab" data-k="login" class="${t === 'login' ? 'on' : ''}">লগইন</button>
        <button data-act="authtab" data-k="reg" class="${t === 'reg' ? 'on' : ''}">রেজিস্ট্রেশন</button>
      </div>`}
      <form id="authform" class="card"><div class="card-b">
        ${t === 'reg' ? `
        <div class="field">
          <label>আপনার নাম (অফিসের ডাকনাম)</label>
          <input class="input" name="name" autocomplete="name"
            placeholder="অফিসে আপনাকে যে নামে ডাকে — যেমন: রাহাত ভাই" required />
          <div class="hint">অফিসে সবাই আপনাকে যে নামে চেনে সেটাই দিন — স্টাফ এই নাম দেখেই নাস্তা বুঝিয়ে দেবেন।</div>
        </div>` : ''}
        <div class="field">
          <label>${t === 'reg' ? 'আপনার PIN' : 'PIN'}</label>
          <input class="input" name="pin" ${t === 'reg' ? 'inputmode="numeric" pattern="[0-9]*" maxlength="6"' : ''}
            autocomplete="username" placeholder="${t === 'reg' ? '৪–৬ সংখ্যার নিজের একটা PIN' : 'যেমন: 4800'}" required />
          ${t === 'reg' ? `<div class="hint">এই PIN শুধু আপনার — এটা আর পাসওয়ার্ড দিয়েই পরে ঢুকবেন। আরেকজনের PIN-এর সাথে মিলতে পারবে না।</div>` : ''}
        </div>
        ${t === 'reg' ? `
        <div class="field">
          <label>আপনি কোন তলায় বসেন?</label>
          <div class="chip-row" id="floorpick">
            ${(S.boot.floors || [2, 3, 4, 5]).map((f, i) => `<button type="button" class="btn sm ${i === 0 ? 'primary' : ''}"
              data-floor="${f}">${bn(f)}য় তলা</button>`).join('')}
          </div>
          <input type="hidden" name="floor" value="${(S.boot.floors || [2])[0]}" />
          <div class="hint">আপনার তলার স্টাফের কাছেই আপনার অর্ডার যাবে। এক তলার কিছু অন্য তলার কেউ দেখতে পাবে না।</div>
        </div>` : ''}
        <div class="field">
          <label>পাসওয়ার্ড</label>
          <input class="input" name="password" type="password" autocomplete="${t === 'reg' ? 'new-password' : 'current-password'}" placeholder="••••••" required />
        </div>
        <button class="btn primary block lg" type="submit">${t === 'reg' ? 'রেজিস্ট্রেশন করুন' : 'ঢুকুন'}</button>
      </div></form>
    </div>`;

  // তলা বাছাই — এক চাপেই
  const fp = $('#floorpick');
  if (fp) fp.addEventListener('click', (e) => {
    const b = e.target.closest('[data-floor]');
    if (!b) return;
    fp.querySelectorAll('button').forEach((x) => x.classList.remove('primary'));
    b.classList.add('primary');
    $('#authform [name=floor]').value = b.dataset.floor;
  });

  $('#authform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const body = { pin: f.get('pin'), password: f.get('password') };
      if (t === 'reg') { body.name = f.get('name'); body.floor = Number(f.get('floor')); }
      await api(t === 'reg' ? '/api/register' : '/api/login', { method: 'POST', body });
      S.tab = 'order';
      await boot();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });
}

// ------------------------------------------------------------------ shell
function shell(inner, opts = {}) {
  const u = S.boot.user;
  // স্টাফের কাজ আর ইউজারের কাজ আলাদা — স্টাফের নিজের অর্ডার ট্যাব লাগে না
  const tabs = isStaff()
    ? [
        { k: 'today',  ic: '📋', t: 'আজ' },
        { k: 'shops',  ic: '🏪', t: 'দোকান' },
        ...(S.boot.money_module ? [{ k: 'money', ic: '💰', t: 'টাকা' }] : []),
        { k: 'report', ic: '📊', t: 'রিপোর্ট' },
        { k: 'more',   ic: '⋯',  t: 'আরও' },
      ]
    : [
        { k: 'order',   ic: '🍽️', t: 'অর্ডার' },
        { k: 'history', ic: '🗓️', t: 'ইতিহাস' },
        ...(S.boot.money_module ? [{ k: 'money', ic: '💰', t: 'হিসাব' }] : []),
        { k: 'more',    ic: '⋯',  t: 'আরও' },
      ];
  const activeKey = ['items', 'users', 'settings', 'password'].includes(S.tab)
    ? 'more'
    : (S.tab === 'order' && isStaff() ? 'today' : S.tab);

  $('#app').innerHTML = `
    <div class="topbar">
      ${opts.back ? `<button class="avatar" data-act="tab" data-k="${opts.back}" title="ফিরে যান">←</button>` : ''}
      <div class="grow">
        <h1>${esc(opts.title || S.boot.office_name)}</h1>
        <div class="sub">${esc((opts.sub || `${niceDate(S.boot.today)} · ${u.name}`) + floorTag())}</div>
      </div>
      ${opts.back || !isStaff() ? '' : `<button class="avatar" data-act="notif" title="নতুন অর্ডার" style="position:relative">🔔${
        S.notifUnseen ? `<span class="badge">${bn(S.notifUnseen)}</span>` : ''}</button>`}
      ${opts.back ? '' : `<button class="avatar" data-act="tab" data-k="more">${esc(u.name.trim()[0] || '?')}</button>`}
    </div>
    <main>${inner}</main>
    <nav class="tabbar">
      ${tabs.map((x) => `<button data-act="tab" data-k="${x.k}" class="${activeKey === x.k ? 'on' : ''}">
        <span class="ic">${x.ic}</span><span>${x.t}</span></button>`).join('')}
    </nav>`;
}

/** সুপার অ্যাডমিনের জন্য তলা বাছাইয়ের সারি (স্টাফের নিজের তলাই বাঁধা) */
function floorBar() {
  // স্টাফের তলা উপরের হেডারেই লেখা থাকে — আলাদা জায়গা নষ্ট করার দরকার নেই
  if (!isAdmin()) return '';
  const floors = S.boot.floors || [];
  return `<div class="card"><div class="card-b">
    <label style="display:block;font-size:13px;font-weight:700;color:var(--ink-2);margin-bottom:8px">কোন তলা দেখবেন?</label>
    <div class="chip-row">
      <button class="btn sm ${S.floor ? '' : 'primary'}" data-act="setfloor" data-f="">সব তলা</button>
      ${floors.map((f) => `<button class="btn sm ${S.floor === f ? 'primary' : ''}"
        data-act="setfloor" data-f="${f}">${bn(f)}য় তলা</button>`).join('')}
    </div>
  </div></div>`;
}

function statusBanner() {
  const st = S.boot.status;
  if (!st) return '';   // স্টাফ কিছু না জানালে খালি জায়গা নষ্ট করার দরকার নেই
  return `<div class="banner ${st.tone}"><span class="ic">${st.icon}</span><div>
    ${esc(st.label)}
    ${st.message ? `<small>${esc(st.message)}</small>` : ''}
  </div></div>`;
}

function render() {
  const v = {
    order: viewOrder, history: viewHistory, money: viewMoney, more: viewMore,
    today: viewToday, report: viewReport, items: viewItems, users: viewUsers,
    settings: viewSettings, password: viewPassword, shops: viewShops,
  }[S.tab];
  (v || viewOrder)();
}

// =========================================================== ১. অর্ডার পেজ
async function viewOrder() {
  // স্টাফ/অ্যাডমিন এই পাতায় আসেন শুধু কারো হয়ে অর্ডার করতে
  if (isStaff() && !S.orderFor) { S.tab = 'today'; return viewToday(); }
  shell(`<div class="spin"></div>`);
  const forQ = S.orderFor ? `?user_id=${S.orderFor.id}` : '';
  const [items, shops, mine] = await Promise.all([
    api('/api/items'), api('/api/shops'), api('/api/orders/my' + forQ),
  ]);
  S.items = items;
  S.shops = shops;
  S.orderMeta = mine;
  S.usual = mine.usual || null;
  if (!S.orderFor) S.boot.status = mine.status ?? S.boot.status;

  // দোকান: আজকের অর্ডারে যেটা ছিল → নইলে শেষবার যেটা → নইলে রোজকারেরটা → নইলে প্রথমটা
  const has = (id) => shops.some((s) => s.id === id);
  S.shopId = [mine.order?.shop_id, mine.default_shop_id, mine.usual?.shop_id]
    .find((id) => id != null && has(id)) ?? (shops[0]?.id ?? null);

  S.cart = new Map();
  if (mine.order) {
    for (const l of mine.order.lines) {
      S.cart.set(`${l.item_id}|${l.option_id || 0}`, {
        item_id: l.item_id, option_id: l.option_id, qty: l.qty,
        fallback_type: l.fallback_type, fallback_item_id: l.fallback_item_id,
        fallback_note: l.fallback_note,
      });
    }
  }
  S.dirty = false;
  paintOrder();
}

/** বেছে নেওয়া দোকানে এই জিনিসের দাম — দোকানের আলাদা দাম না থাকলে সাধারণ দাম */
function priceOf(it) {
  const sp = it.shop_prices || {};
  if (S.shopId != null && sp[S.shopId] != null) return Number(sp[S.shopId]);
  return Number(it.price);
}
/** এই জিনিসে কিছু না বাছলে যে রকমটা ধরা হবে */
function defaultOption(it) {
  return it.options.find((o) => o.is_default) || it.options[0] || null;
}

function cartTotal() {
  let t = 0;
  for (const [, l] of S.cart) {
    const it = S.items.find((i) => i.id === l.item_id);
    if (!it) continue;
    const op = it.options.find((o) => o.id === l.option_id);
    t += (priceOf(it) + (op ? op.price_delta : 0)) * l.qty;
  }
  return Math.round(t * 100) / 100;
}

const FB_TEXT = {
  skip: 'না পেলে নেব না',
  anything: 'না পেলে যেকোনো কিছু',
  item: 'না পেলে বদলে',
};

function paintOrder() {
  const locked = S.orderMeta.locked;
  const total = cartTotal();
  const count = [...S.cart.values()].reduce((s, l) => s + l.qty, 0);

  // বেছে নেওয়া দোকানে যেগুলো পাওয়াই যায় না, সেগুলো দেখানোর দরকার নেই
  const sold = (it) => !(it.shop_missing || []).includes(S.shopId);
  const menu = S.items.filter(sold);
  const cats2 = [...new Set(menu.map((i) => i.category))];

  const body = cats2.map((cat, ci) => {
    const list = menu.filter((i) => i.category === cat);
    return `
      <section style="${accent(ci)}">
        <div class="section-title">${esc(cat)}</div>
        <div class="card"><div class="card-b tight">
          ${list.map((it) => itemRow(it, locked)).join('')}
        </div></div>
      </section>`;
  }).join('');

  const usualLines = S.usual?.lines || [];
  const canQuick = !locked && usualLines.length > 0;

  shell(`
    ${S.orderFor ? `<div class="banner info"><span class="ic">🧑‍🍳</span><div>
      আপনি <b>${esc(S.orderFor.name)}</b>-এর হয়ে অর্ডার করছেন
      <small>শেষে "সেভ করুন" চাপতে ভুলবেন না</small></div></div>` : statusBanner()}
    ${locked && S.orderMeta.lock_reason
      ? `<div class="banner warn"><span class="ic">🔒</span><div>${esc(S.orderMeta.lock_reason)}</div></div>` : ''}
    ${!locked && S.orderMeta.late_note
      ? `<div class="banner warn"><span class="ic">⏳</span><div>${esc(S.orderMeta.late_note)}</div></div>` : ''}
    ${canQuick ? `
    <div class="card" style="border:1.5px solid var(--brand);">
      <div class="card-b">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-size:26px">⚡</span>
          <div style="flex:1">
            <div style="font-weight:800;font-size:16px">${S.orderFor ? `${esc(S.orderFor.name)}-এর রোজকার` : 'আপনার রোজকার অর্ডার'}</div>
            <div class="hint" style="margin:0">${esc(usualSummary())}</div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn primary" data-act="usualplace">এক চাপে দিয়ে দিন</button>
          <button class="btn sm" data-act="usualclear">সরান</button>
        </div>
      </div>
    </div>` : ''}
    ${(S.shops || []).length > 1 ? `
    <div class="card"><div class="card-b">
      <label style="display:block;font-size:13px;font-weight:700;color:var(--ink-2);margin-bottom:8px">কোথা থেকে আনবেন?</label>
      <div class="chip-row">
        ${S.shops.map((s) => `<button class="btn sm ${S.shopId === s.id ? 'primary' : ''}"
          data-act="setshop" data-id="${s.id}" ${locked ? 'disabled' : ''}>🏪 ${esc(s.name)}</button>`).join('')}
      </div>
      <div class="hint">দোকান বদলালে দামও বদলে যাবে — একেক দোকানে একেক রকম দাম।</div>
    </div></div>` : ''}
    ${body}
    <div class="card"><div class="card-b">
      <div class="field" style="margin:0">
        <label>স্টাফের জন্য নোট (ইচ্ছা হলে)</label>
        <textarea class="input" id="ordernote" ${locked ? 'disabled' : ''}
          placeholder="যেমন: চা একটু কড়া, ঝাল কম">${esc(S.orderMeta.order?.note || '')}</textarea>
      </div>
    </div></div>
    ${count > 0 || !locked ? `
    <div class="totalbar">
      <div class="t"><b>${tk(total)}</b><small>${bn(count)} টি আইটেম</small></div>
      ${locked ? `<span class="chip">লক করা</span>` :
        `<button class="btn primary" data-act="save" ${S.dirty ? '' : 'disabled'}>${S.dirty ? 'সেভ করুন' : 'সেভ করা আছে ✓'}</button>`}
    </div>` : ''}
    ${S.orderFor && S.boot.money_module ? `<button class="btn block" data-act="takecash"
      data-id="${S.orderFor.id}" data-name="${esc(S.orderFor.name)}" style="margin-top:10px">
      💵 হাতে টাকা দিলেন? লিখে রাখুন</button>` : ''}
    ${count > 0 && !locked ? `<button class="btn block" data-act="usualsave" style="margin-top:10px">⭐ ${S.orderFor ? `${esc(S.orderFor.name)}-এর রোজকার অর্ডার করে রাখুন` : 'এটাই আমার রোজকার অর্ডার করে রাখুন'}</button>` : ''}
    ${S.orderMeta.order && !locked ? `<button class="btn danger block" data-act="delorder" style="margin-top:10px">আজকের অর্ডার বাতিল করুন</button>` : ''}
    ${S.orderFor ? `<button class="btn block" data-act="orderforclear" style="margin-top:10px">← আজকের তালিকায় ফিরুন</button>` : ''}
  `, {
    title: S.orderFor ? `${S.orderFor.name}-এর অর্ডার` : undefined,
    sub: `${niceDate(S.orderMeta.date)} · ${S.orderFor ? 'স্টাফ হিসেবে' : 'আপনার অর্ডার'}`,
  });

  const n = $('#ordernote');
  if (n) n.addEventListener('input', () => { S.dirty = true; refreshSaveBtn(); });
}

function refreshSaveBtn() {
  const b = document.querySelector('[data-act="save"]');
  if (b) { b.disabled = !S.dirty; b.textContent = S.dirty ? 'সেভ করুন' : 'সেভ করা আছে ✓'; }
}

function itemRow(it, locked) {
  const lines = [...S.cart.entries()].filter(([, l]) => l.item_id === it.id);
  const off = !it.available;
  const hasOpts = it.options.length > 0;

  const base = priceOf(it);
  const def = defaultOption(it);
  // রকম না বাছলে ডিফল্টটাই যোগ হয় — এক চাপেই অর্ডার
  const mainKey = `${it.id}|${def ? def.id : 0}`;
  const mainLine = S.cart.get(mainKey);

  let html = `<div class="item ${off ? 'off' : ''} ${lines.length ? 'picked' : ''}">
    <div class="ava">${emojiFor(it.name)}</div>
    <div class="info">
      <div class="nm">${esc(it.name)} ${off ? `<span class="chip warn">আজ নেই</span>` : ''}</div>
      <div class="pr">${tk(base)}${def ? ` · ${esc(def.name)}` : ''}</div>
      ${hasOpts && it.options.length > 1 ? `<button class="chip brand" data-act="pickopt" data-item="${it.id}"
        style="margin-top:4px" ${locked || off ? 'disabled' : ''}>🔀 অন্য রকম (${bn(it.options.length)})</button>` : ''}
    </div>
    ${stepper(mainKey, mainLine ? mainLine.qty : 0, locked || off)}
  </div>`;

  // ডিফল্ট ছাড়া বাকি যেগুলো বেছেছেন
  for (const [key, l] of lines) {
    if (key === mainKey) continue;
    const op = it.options.find((o) => o.id === l.option_id);
    html += subLine(it, key, l, op, locked);
  }
  // ডিফল্ট লাইনটার বিকল্প ঠিক করার জায়গা
  if (mainLine) html += fbLine(mainKey, mainLine, locked);
  return html;
}

function subLine(it, key, l, op, locked) {
  return `<div class="item sub-line picked">
    <div class="info">
      <div class="nm">↳ ${esc(op ? op.name : it.name)}
        <span class="pr">${tk(priceOf(it) + (op ? op.price_delta : 0))}</span></div>
      ${fbChip(key, l)}
    </div>
    ${stepper(key, l.qty, locked)}
  </div>`;
}
function fbLine(key, l, locked) {
  return `<div class="item sub-line picked" style="padding-top:4px;padding-bottom:8px">
    <div class="info">${fbChip(key, l)}</div>
  </div>`;
}
function fbChip(key, l) {
  return `<button class="chip ${l.fallback_type === 'skip' && !l.fallback_note ? '' : 'info'}"
    data-act="fb" data-key="${key}" style="margin-top:4px">⚙ ${esc(fbLabel(l))}</button>`;
}

function fbLabel(l) {
  if (l.fallback_type === 'item') {
    const fb = S.items.find((i) => i.id === l.fallback_item_id);
    return `না পেলে → ${fb ? fb.name : '?'}`;
  }
  return FB_TEXT[l.fallback_type] || FB_TEXT.skip;
}

function stepper(key, qty, disabled) {
  return `<div class="stepper">
    <button data-act="dec" data-key="${key}" ${disabled || qty === 0 ? 'disabled' : ''}>−</button>
    <span class="q">${bn(qty)}</span>
    <button class="plus" data-act="inc" data-key="${key}" ${disabled ? 'disabled' : ''}>+</button>
  </div>`;
}

function bump(key, delta) {
  const [itemId, optId] = key.split('|').map(Number);
  const cur = S.cart.get(key);
  const qty = (cur ? cur.qty : 0) + delta;
  if (qty <= 0) S.cart.delete(key);
  else S.cart.set(key, cur
    ? { ...cur, qty }
    : { item_id: itemId, option_id: optId || null, qty, fallback_type: 'skip', fallback_item_id: null, fallback_note: '' });
  S.dirty = true;
  paintOrder();
}

function pickOption(itemId) {
  const it = S.items.find((i) => i.id === itemId);
  sheet({
    title: `${esc(it.name)} — কীভাবে নেবেন?`,
    body: `<div class="card" style="${accent(hashIdx(it.name))}"><div class="card-b tight">
      ${it.options.map((o, oi) => {
        const key = `${it.id}|${o.id}`;
        const have = S.cart.get(key);
        return `<div class="item ${have ? 'picked' : ''}" style="${accent(hashIdx(it.name) + oi)}">
          <div class="ava">${emojiFor(it.name)}</div>
          <div class="info"><div class="nm">${esc(o.name)} ${o.is_default ? '<span class="chip gold">ডিফল্ট</span>' : ''}</div>
            <div class="pr">${tk(priceOf(it) + o.price_delta)}${o.price_delta ? ` (${o.price_delta > 0 ? '+' : '−'}${tk(Math.abs(o.price_delta))})` : ''}</div></div>
          ${stepper(key, have ? have.qty : 0, false)}
        </div>`;
      }).join('')}
    </div></div>`,
    footer: `<button class="btn primary block" data-act="closesheet">ঠিক আছে</button>`,
  });
}

function fbSheet(key) {
  const l = S.cart.get(key);
  if (!l) return;
  const it = S.items.find((i) => i.id === l.item_id);
  const others = S.items.filter((i) => i.id !== l.item_id);
  sheet({
    title: `${esc(it.name)} না থাকলে?`,
    body: `
      <p class="hint" style="margin-top:0">দোকানে এই আইটেম না পেলে স্টাফ কী করবে সেটা এখানেই বলে দিন।</p>
      <div class="card"><div class="card-b tight">
        ${[
          ['skip', '🚫', 'না পেলে নেব না', 'টাকাও কাটা যাবে না'],
          ['anything', '🎲', 'যেকোনো কিছু দিন', 'স্টাফ যা ভালো মনে করেন'],
          ['item', '🔁', 'অন্য আইটেম দিন', 'নিচ থেকে বেছে দিন'],
        ].map(([v, ic, t, sub]) => `
          <label class="item" style="cursor:pointer">
            <span style="font-size:20px">${ic}</span>
            <div class="info"><div class="nm">${t}</div><div class="pr">${sub}</div></div>
            <input type="radio" name="fbt" value="${v}" ${l.fallback_type === v ? 'checked' : ''} />
          </label>`).join('')}
      </div></div>
      <div class="field" id="fbitemwrap" style="display:${l.fallback_type === 'item' ? 'block' : 'none'}">
        <label>বদলে কোনটা?</label>
        <select class="input" id="fbitem">
          ${others.map((o) => `<option value="${o.id}" ${o.id === l.fallback_item_id ? 'selected' : ''}>${esc(o.name)} — ${tk(o.price)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>বাড়তি কথা (ইচ্ছা হলে)</label>
        <input class="input" id="fbnote" value="${esc(l.fallback_note || '')}" placeholder="যেমন: ডাল না থাকলে ভাজি, তাও না থাকলে কিছু লাগবে না" />
      </div>`,
    footer: `<button class="btn primary block" data-act="fbsave" data-key="${key}">ঠিক আছে</button>`,
    onOpen: (bg) => {
      bg.querySelectorAll('input[name=fbt]').forEach((r) =>
        r.addEventListener('change', () => {
          $('#fbitemwrap').style.display = r.value === 'item' && r.checked ? 'block' : ($('input[name=fbt]:checked')?.value === 'item' ? 'block' : 'none');
        })
      );
    },
  });
}

function usualSummary() {
  const out = (S.usual?.lines || []).map((l) => {
    const it = S.items.find((i) => i.id === l.item_id);
    if (!it) return null;
    const op = it.options.find((o) => o.id === l.option_id);
    return `${it.name}${op ? ` (${op.name})` : ''} × ${bn(l.qty)}`;
  }).filter(Boolean);
  return out.length ? out.join(', ') : 'কিছু নেই';
}

/** রোজকার অর্ডারটা কার্টে বসিয়ে দেয় */
function applyUsual() {
  S.cart = new Map();
  for (const l of S.usual?.lines || []) {
    if (!S.items.some((i) => i.id === l.item_id)) continue;
    S.cart.set(`${l.item_id}|${l.option_id || 0}`, {
      item_id: l.item_id, option_id: l.option_id || null, qty: l.qty,
      fallback_type: l.fallback_type || 'skip',
      fallback_item_id: l.fallback_item_id || null,
      fallback_note: l.fallback_note || '',
    });
  }
  if (S.usual?.shop_id && S.shops.some((s) => s.id === S.usual.shop_id)) S.shopId = S.usual.shop_id;
  S.dirty = true;
}

async function saveOrder(silent = false) {
  const lines = [...S.cart.values()];
  const note = $('#ordernote')?.value || '';
  try {
    await api('/api/orders', {
      method: 'POST',
      body: {
        date: S.orderMeta.date,
        user_id: S.orderFor ? S.orderFor.id : undefined,
        shop_id: S.shopId,
        note,
        lines,
      },
    });
    S.dirty = false;
    if (!silent) toast(lines.length ? '✅ অর্ডার সেভ হয়েছে' : 'অর্ডার খালি করা হলো', 'ok');
    viewOrder();
  } catch (e) { toast(e.message, 'err'); }
}

// =========================================================== ২. ইতিহাস
async function viewHistory() {
  shell(`<div class="spin"></div>`);
  const rows = await api('/api/orders/history');
  shell(rows.length === 0
    ? `<div class="empty"><div class="big">🗓️</div>এখনো কোনো অর্ডার নেই</div>`
    : rows.map((o, oi) => `
      <div class="card" style="${accent(oi)}">
        <div class="card-h">
          <div class="grow"><h2>${niceDate(o.order_date)}</h2></div>
          <span class="chip ${OSTATUS[o.status].c}">${OSTATUS[o.status].t}</span>
          <b class="amt">${tk(o.total)}</b>
        </div>
        <div class="card-b tight">
          ${o.lines.map((l) => `<div class="item">
            <div class="ava">${emojiFor(l.item_name)}</div>
            <div class="info"><div class="nm">${esc(l.item_name)}${l.option_name ? ` <span class="chip brand">${esc(l.option_name)}</span>` : ''}</div>
              <div class="pr">${tk(l.unit_price)} × ${bn(l.qty)}</div></div>
            <b class="amt">${tk(l.subtotal)}</b>
          </div>`).join('')}
        </div>
      </div>`).join(''),
    { title: 'আমার অর্ডার', sub: 'গত ৬০ দিন' });
}

// =========================================================== ৩. টাকার হিসাব
async function viewMoney() {
  shell(`<div class="spin"></div>`);
  if (!isStaff()) {
    const d = await api('/api/ledger/my');
    const sum = (t) => d.rows.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0);
    return shell(`
      <div class="hero ${d.balance >= 0 ? '' : 'red'}">
        <div class="lbl">আপনার কাছে জমা আছে</div>
        <div class="val">${tk(d.balance)}</div>
        <div class="sub">${d.balance > 0 ? 'এই টাকা স্টাফের কাছে আছে' : 'সব হিসাব মিটে গেছে'}</div>
      </div>
      <div class="stats">
        <div class="stat g2"><div class="lbl">মোট জমা দিয়েছেন</div><div class="val">${tk(sum('deposit'))}</div></div>
        <div class="stat g1"><div class="lbl">নাস্তায় খরচ</div><div class="val">${tk(sum('charge'))}</div></div>
        ${sum('refund') ? `<div class="stat g4"><div class="lbl">ফেরত পেয়েছেন</div><div class="val">${tk(sum('refund'))}</div></div>` : ''}
      </div>
      <div class="section-title">লেনদেন</div>
      <div class="card"><div class="card-b tight">
        ${d.rows.length ? d.rows.map(ledgerRow).join('') : `<div class="empty"><div class="big">🪙</div>কোনো লেনদেন নেই</div>`}
      </div></div>`, { title: 'আমার হিসাব', sub: 'জমা, খরচ ও ফেরত' });
  }

  const list = await api('/api/ledger/balances?' + (S.floor ? 'floor=' + S.floor : ''));
  const totalHeld = list.reduce((s, u) => s + u.balance, 0);
  const owing = list.filter((u) => u.balance < 0);
  shell(`
    ${floorBar()}
    <div class="hero">
      <div class="lbl">সবার মিলিয়ে আপনার হাতে আছে</div>
      <div class="val">${tk(totalHeld)}</div>
      <div class="sub">${bn(list.filter((u) => u.balance !== 0).length)} জনের হিসাব চলছে</div>
    </div>
    ${owing.length ? `<div class="banner warn"><span class="ic">⚠️</span><div>
      ${bn(owing.length)} জনের কাছে টাকা পাওনা<small>${esc(owing.map((u) => u.name).join(', '))}</small></div></div>` : ''}
    <div class="section-title">কার কত জমা</div>
    <div class="card"><div class="card-b tight">
      ${list.map((u) => `<div class="list-row" data-act="userledger" data-id="${u.id}"
          style="cursor:pointer;${accent(hashIdx(u.name))}">
        <div class="ava">${esc((u.name || '?').trim()[0])}</div>
        <div class="grow">
          <div class="nm">${esc(u.name)}</div>
          <div class="sub">জমা ${tk(u.deposit)} · খরচ ${tk(u.charge)}${u.refund ? ` · ফেরত ${tk(u.refund)}` : ''}</div>
        </div>
        <b class="amt ${u.balance > 0 ? 'pos' : u.balance < 0 ? 'neg' : ''}">${tk(u.balance)}</b>
        <span class="go">›</span>
      </div>`).join('')}
    </div></div>`, { title: 'টাকার হিসাব', sub: 'জমা / ফেরত' });
}

function ledgerRow(r) {
  const map = {
    deposit: { t: 'জমা', c: 'pos', s: '+' },
    charge:  { t: 'নাস্তার খরচ', c: 'neg', s: '−' },
    refund:  { t: 'ফেরত দেওয়া হয়েছে', c: 'neg', s: '−' },
    adjust:  { t: 'সমন্বয়', c: r.amount >= 0 ? 'pos' : 'neg', s: r.amount >= 0 ? '+' : '' },
  }[r.type];
  return `<div class="list-row">
    <div class="grow">
      <div class="nm">${map.t}${r.type === 'refund' ? ' ✔' : ''}</div>
      <div class="sub">${esc(r.created_at.slice(0, 16).replace('T', ' '))}${r.note ? ' · ' + esc(r.note) : ''}</div>
    </div>
    <b class="amt ${map.c}">${map.s}${tk(Math.abs(r.amount))}</b>
    ${isStaff() && r.type !== 'charge' ? `<button class="btn sm danger" data-act="delledger" data-id="${r.id}">✕</button>` : ''}
  </div>`;
}

async function userLedgerSheet(id) {
  const d = await api('/api/ledger/user/' + id);
  sheet({
    title: esc(d.user.name),
    body: `
      <div class="hero ${d.balance > 0 ? 'green' : d.balance < 0 ? 'red' : 'blue'}">
        <div class="lbl">${d.balance < 0 ? 'পাওনা আছে' : 'এখন জমা আছে'}</div>
        <div class="val">${tk(Math.abs(d.balance))}</div>
      </div>
      <div class="row2">
        <div class="field"><label>টাকার অঙ্ক</label>
          <input class="input" id="lamt" type="number" inputmode="decimal" placeholder="৫০০" /></div>
        <div class="field"><label>নোট</label>
          <input class="input" id="lnote" placeholder="ইচ্ছা হলে" /></div>
      </div>
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn ok" data-act="ledgeradd" data-id="${id}" data-type="deposit">➕ জমা নিলাম</button>
        <button class="btn danger" data-act="ledgeradd" data-id="${id}" data-type="refund">➖ ফেরত দিলাম</button>
      </div>
      ${d.balance > 0 ? `<button class="btn dark block" data-act="refundall" data-id="${id}" style="margin-bottom:14px">পুরো ${tk(d.balance)} ফেরত দিয়ে দিলাম</button>` : ''}
      <div class="section-title">লেনদেন</div>
      <div class="card"><div class="card-b tight">
        ${d.rows.length ? d.rows.map(ledgerRow).join('') : `<div class="empty">কিছু নেই</div>`}
      </div></div>`,
  });
}

// =========================================================== ৪. স্টাফ: আজ
async function viewToday() {
  shell(`<div class="spin"></div>`);
  const date = S.date;
  const [data, items, users] = await Promise.all([
    api(`/api/orders?date=${date}${fq()}`),
    api('/api/items?all=1'),
    api('/api/users?' + (S.floor ? 'floor=' + S.floor : '')),
  ]);
  S.items = items;
  S.cache.users = users;
  const stRes = await api(`/api/status?date=${date}${fq()}`);
  const st = stRes.status;
  if (date === S.boot.today && !S.floor) S.boot.status = st;
  const orders = data.orders;
  S.cache.orders = orders;
  const people = orders.filter((o) => o.status !== 'cancelled').length;
  const amount = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);

  const live = liveTotals(orders);
  const totalQty = orders.reduce((s, o) => s + o.lines.reduce((x, l) => x + l.qty, 0), 0);
  const offItems = items.filter((i) => i.active && !i.available);

  shell(`
    ${floorBar()}
    <div class="card"><div class="card-b" style="display:flex;gap:7px;align-items:center;padding:8px 9px">
      <button class="btn sm" data-act="daynav" data-d="-1">←</button>
      <input class="input" type="date" id="daypick" value="${date}"
        style="flex:1;text-align:center;padding:7px 6px;font-size:13.5px" />
      <button class="btn sm" data-act="daynav" data-d="1">→</button>
    </div></div>

    ${st ? `<div class="banner ${st.tone}"><span class="ic">${st.icon}</span>
      <div>${esc(st.label)}${st.message ? `<small>${esc(st.message)}</small>` : ''}</div></div>` : ''}
    <div class="card"><div class="card-b" style="padding:9px 10px">
      <div class="chip-row">
        ${Object.entries(S.boot.status_options).map(([k, v]) =>
          `<button class="btn sm ${st && st.key === k ? 'primary' : ''}" data-act="setstatus" data-s="${k}"
            title="${esc(v.label)}">${v.icon} ${esc(v.label)}</button>`).join('')}
      </div>
      <input class="input" id="statusmsg" style="margin-top:8px;font-size:13.5px"
        placeholder="বাড়তি কথা (ইচ্ছা হলে)" value="${esc(st?.message || '')}" />
    </div></div>

    <!-- দোকান ধরে লাইভ টোটাল — দোকানে গিয়ে এটা দেখেই খাবার আনা যাবে -->
    ${live.length === 0
      ? `<div class="empty"><div class="big">🍽️</div>এই দিনে এখনো কেউ অর্ডার দেয়নি</div>`
      : live.map((sh, si) => `
        <div class="live" style="${accent(si)}">
          <div class="live-h">🏪 ${esc(sh.shop)}<span class="n">${bn(sh.qty)} টি · ${tk(sh.amount)}</span></div>
          <div class="live-b">
            ${sh.tiles.map((t) => `<span class="tile"><b>${bn(t.qty)}</b> ${emojiFor(t.name)} ${esc(t.name)}${
              t.option ? `<span class="o">${esc(t.option)}</span>` : ''}</span>`).join('')}
          </div>
        </div>`).join('')}

    ${orders.length ? `<div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat g1"><div class="lbl">জন</div><div class="val">${bn(people)}</div></div>
      <div class="stat g3"><div class="lbl">আইটেম</div><div class="val">${bn(totalQty)}</div></div>
      <div class="stat g2"><div class="lbl">টাকা</div><div class="val">${tk(amount)}</div></div>
    </div>` : ''}

    <div class="btn-row nowrap" style="gap:6px">
      <button class="btn primary sm" data-act="buylist">🛒 কিনতে হবে</button>
      <button class="btn sm" data-act="buylist" data-tab="plate">🍽️ সাজানো</button>
      ${S.boot.money_module ? `<button class="btn sm" data-act="buylist" data-tab="money">💵 টাকা</button>` : ''}
      <button class="btn sm" data-act="orderfor" title="কারো হয়ে অর্ডার">🧑‍🍳 কারো হয়ে</button>
      <button class="btn sm ${offItems.length ? 'danger' : ''}" data-act="availsheet"
        title="আজ কী নেই">🚫${offItems.length ? ` ${bn(offItems.length)}` : ''}</button>
    </div>

    ${orders.length ? `
    <div class="section-title">কে কী দিয়েছে — চাপ দিলে বিস্তারিত</div>
    <div class="card"><div class="card-b tight">
      ${orders.map((o) => `<div class="person" data-act="orderdetail" data-id="${o.id}"
          style="${accent(hashIdx(o.user_name))}">
        <div class="pin">${bn(o.pin || '—')}</div>
        <div style="flex:1;min-width:0">
          <div class="nm">${esc(o.user_name)}</div>
          <div class="sub">${bn(o.lines.reduce((s, l) => s + l.qty, 0))} টি${o.shop_name ? ` · ${esc(o.shop_name)}` : ''}${
            S.floor || !isAdmin() ? '' : o.user_floor ? ` · ${bn(o.user_floor)}য়` : ''}</div>
        </div>
        <b class="amt">${tk(o.total)}</b>
        <span class="dotmark ${OSTATUS[o.status].c || 'warn'}" title="${OSTATUS[o.status].t}"></span>
      </div>`).join('')}
    </div></div>
    <button class="btn ok block" data-act="deliverall">✅ সবাইকে দিয়ে দিয়েছি</button>` : ''}
  `, { title: 'আজকের অর্ডার', sub: niceDate(date) });

  $('#daypick')?.addEventListener('change', (e) => { S.date = e.target.value; viewToday(); });
}

/** দোকান ধরে কোন জিনিস কয়টা — দোকানে গিয়ে এক নজরে দেখার জন্য */
function liveTotals(orders) {
  const shops = new Map();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const key = o.shop_name || 'দোকান বলা হয়নি';
    if (!shops.has(key)) shops.set(key, { shop: key, qty: 0, amount: 0, map: new Map() });
    const sh = shops.get(key);
    for (const l of o.lines) {
      const k = `${l.item_name}|${l.option_name}`;
      if (!sh.map.has(k)) sh.map.set(k, { name: l.item_name, option: l.option_name, qty: 0 });
      sh.map.get(k).qty += l.qty;
      sh.qty += l.qty;
      sh.amount += l.subtotal;
    }
  }
  return [...shops.values()]
    .sort((a, b) => b.qty - a.qty)
    .map((sh) => ({
      ...sh,
      amount: Math.round(sh.amount * 100) / 100,
      tiles: [...sh.map.values()].sort((a, b) => b.qty - a.qty),
    }));
}

/** আজ কোন জিনিস নেই — চাপ দিয়ে বন্ধ/চালু */
function availSheet() {
  sheet({
    title: '🚫 আজ কী নেই',
    body: `<p class="hint" style="margin-top:0">যেটা আজ পাওয়া যাবে না সেটায় চাপ দিন — ইউজারের মেনুতে "আজ নেই" লেখা উঠবে।</p>
      <div class="card"><div class="card-b chip-row">
        ${S.items.filter((i) => i.active).map((i) =>
          `<button class="btn sm ${i.available ? '' : 'danger'}" data-act="avail" data-id="${i.id}"
            data-v="${i.available ? 0 : 1}">${i.available ? emojiFor(i.name) + ' ' : '🚫 '}${esc(i.name)}</button>`).join('')}
      </div></div>`,
    footer: `<button class="btn primary block" data-act="closesheet">ঠিক আছে</button>`,
  });
}

/** একজনের অর্ডারের বিস্তারিত — তালিকা ছোট রাখতে আলাদা শিটে */
function orderDetailSheet(orderId) {
  const o = (S.cache.orders || []).find((x) => x.id === orderId);
  if (!o) return;
  sheet({
    title: esc(o.user_name),
    body: `<div style="${accent(hashIdx(o.user_name))}">
      <div class="banner info"><span class="ic">🏪</span><div>${esc(o.shop_name || 'দোকান বলা হয়নি')}
        <small>PIN ${bn(o.pin || '—')}${o.user_floor ? ` · ${bn(o.user_floor)}য় তলা` : ''} · মোট ${tk(o.total)}</small></div></div>
      <div class="card"><div class="card-b tight">
        ${o.lines.map((l) => `<div class="item">
          <div class="ava">${emojiFor(l.item_name)}</div>
          <div class="info">
            <div class="nm">${esc(l.item_name)}${l.option_name ? ` <span class="chip brand">${esc(l.option_name)}</span>` : ''} × ${bn(l.qty)}</div>
            ${l.fallback_type !== 'skip' || l.fallback_note ? `<div class="pr">⚙ ${esc(fbTextOf(l))}</div>` : ''}
          </div>
          <b class="amt">${tk(l.subtotal)}</b>
        </div>`).join('')}
        ${o.note ? `<div class="item"><div class="info"><div class="pr">📝 ${esc(o.note)}</div></div></div>` : ''}
      </div></div>
      <div class="field"><label>অবস্থা</label>
        <select class="input" data-act="ostatus" data-id="${o.id}">
          ${Object.entries(OSTATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v.t}</option>`).join('')}
        </select></div>
    </div>`,
    footer: `<div class="btn-row">
      <button class="btn" data-act="orderforpick" data-id="${o.user_id}" data-name="${esc(o.user_name)}">✏️ অর্ডার বদলান</button>
      <button class="btn primary" data-act="closesheet">বুঝেছি</button>
    </div>`,
  });
}

function fbTextOf(l) {
  const base = l.fallback_type === 'item' ? `না পেলে → ${l.fallback_name}`
    : l.fallback_type === 'anything' ? 'না পেলে যেকোনো কিছু' : 'না পেলে নেব না';
  return l.fallback_note ? `${base} · ${l.fallback_note}` : base;
}

/** অর্ডার নেওয়ার সময় হাতে যত টাকা দিল — এক চাপে লিখে রাখা */
function takeCashSheet(userId, name, back = '') {
  sheet({
    title: `💵 ${esc(name)} কত দিলেন?`,
    body: `
      <div class="chip-row" style="margin-bottom:12px">
        ${[20, 50, 100, 200, 500, 1000].map((v) =>
          `<button class="btn" data-act="cashnow" data-id="${userId}" data-name="${esc(name)}"
            data-back="${back}" data-amt="${v}" style="flex:1 1 28%">${tk(v)}</button>`).join('')}
      </div>
      <div class="field" style="margin:0"><label>অন্য অঙ্ক</label>
        <input class="input" id="cashamt" type="number" inputmode="decimal" placeholder="যেমন ৩৫০" /></div>
      <div class="hint">৫০ টাকার নাস্তায় কেউ ১০০ দিলে পুরো ১০০-ই লিখুন —
        নাস্তা দেওয়ার সময় বাকি ৫০ ফেরতের হিসাব নিজে থেকেই দেখাবে।</div>`,
    footer: `<button class="btn primary block" data-act="cashnow" data-id="${userId}"
      data-back="${back}" data-name="${esc(name)}">লিখে রাখুন</button>`,
    onOpen: () => setTimeout(() => $('#cashamt')?.focus(), 120),
  });
}

/** রোজকার অর্ডারটা পড়ার মতো করে লেখা (আইটেমের নামসহ) */
function usualTextOf(usual) {
  const out = (usual?.lines || []).map((l) => {
    const it = S.items.find((i) => i.id === l.item_id);
    if (!it) return null;
    const op = it.options.find((o) => o.id === l.option_id);
    return `${it.name}${op ? ` (${op.name})` : ''} ×${bn(l.qty)}`;
  }).filter(Boolean);
  return out.join(', ');
}

/**
 * কেউ মুখে বললে — PIN বা নাম লিখে খুঁজুন, তারপর ⚡ চাপলেই তার রোজকার অর্ডার বসে যাবে।
 * অন্য কিছু বললে নামে চাপ দিয়ে তার হয়ে পুরো অর্ডারটা সাজিয়ে দিন।
 */
async function orderForSheet() {
  const d = await api(`/api/quick-users?date=${S.date}${fq()}`);
  S.cache.quick = d.users;

  sheet({
    title: '🧑‍🍳 কার হয়ে অর্ডার?',
    body: `
      <input class="input" id="qsearch" inputmode="search" autocomplete="off"
        placeholder="🔎 PIN বা নাম লিখুন — যেমন ২১০১ বা রাহাত" />
      <div id="qlist" style="margin-top:10px"></div>`,
    footer: `<button class="btn block" data-act="closesheet">বন্ধ করুন</button>`,
    onOpen: () => {
      paintQuickList('');
      const s = $('#qsearch');
      s.addEventListener('input', () => paintQuickList(s.value.trim()));
      setTimeout(() => s.focus(), 120);
    },
  });
}

function paintQuickList(q) {
  const all = S.cache.quick || [];
  const list = q
    ? all.filter((u) => String(u.name).toLowerCase().includes(q.toLowerCase()) ||
                        String(u.pin || '').includes(q))
    : all;

  $('#qlist').innerHTML = list.length === 0
    ? `<div class="empty"><div class="big">🔎</div>${q ? 'কাউকে পাওয়া গেল না' : 'এই তলায় এখনো কোনো ইউজার নেই'}</div>`
    : `<div class="card"><div class="card-b tight">
        ${list.map((u) => {
          const ut = usualTextOf(u.usual);
          return `<div class="person" data-act="orderforpick" data-id="${u.id}"
              data-name="${esc(u.name)}" style="${accent(hashIdx(u.name))}">
            <div class="pin">${bn(u.pin || '—')}</div>
            <div style="flex:1;min-width:0">
              <div class="nm">${esc(u.name)}
                ${u.order_id ? `<span class="chip ok">আজ দিয়েছেন · ${bn(u.qty)} টি</span>` : ''}</div>
              <div class="sub">${ut ? `⚡ ${esc(ut)}` : 'রোজকার অর্ডার সেভ করা নেই'}</div>
              ${S.boot.money_module && Number(u.balance) ? `<div class="sub" style="color:${
                Number(u.balance) > 0 ? 'var(--ok)' : 'var(--warn)'}">💵 ${
                Number(u.balance) > 0 ? `জমা আছে ${tk(u.balance)}` : `পাওনা ${tk(-u.balance)}`}</div>` : ''}
            </div>
            ${S.boot.money_module ? `<button class="btn sm" data-act="takecash" data-id="${u.id}"
              data-name="${esc(u.name)}" title="হাতে টাকা দিলে লিখে রাখুন">💵</button>` : ''}
            ${ut ? `<button class="btn sm primary" data-act="quickplace" data-id="${u.id}"
              data-name="${esc(u.name)}" title="রোজকার অর্ডারটা বসিয়ে দিন">⚡</button>` : ''}
            <span class="go">›</span>
          </div>`;
        }).join('')}
      </div></div>
      <p class="hint center">⚡ চাপলেই তার রোজকার অর্ডার বসে যাবে।<br>
        অন্য কিছু চাইলে নামে চাপ দিয়ে সাজিয়ে দিন।</p>`;
}

/** পপআপের তিন ট্যাব — কিনতে হবে / কে কী পাবে / আজকের টাকা */
function sheetTabs(active) {
  const t = [
    ['buy', '🛒 কিনতে হবে'],
    ['plate', '🍽️ কে কী পাবে'],
    ...(S.boot.money_module ? [['money', '💵 আজকের টাকা']] : []),
  ];
  return `<div class="tabs2" style="margin-bottom:12px">
    ${t.map(([k, label]) => k === active
      ? `<button class="on">${label}</button>`
      : `<button data-act="buylist" data-tab="${k}">${label}</button>`).join('')}
  </div>`;
}

/**
 * আজকের টাকার হিসাব — কাকে কত ফেরত দিতে হবে, কার কাছে কত পাওনা।
 * ৫০ টাকার নাস্তায় কেউ ১০০ দিলে এখানেই ৫০ ফেরত দেওয়া যায়।
 */
async function moneyTodaySheet() {
  const d = await api(`/api/money-today?date=${S.date}${fq()}`);
  S.cache.money = d;
  sheet({
    title: '💵 আজকের টাকার হিসাব',
    body: `${sheetTabs('money')}<div id="moneybody"></div>`,
    footer: `<div class="btn-row">
      <button class="btn" data-act="printsheet">🖨️ প্রিন্ট</button>
      <button class="btn primary" data-act="closesheet">বুঝেছি</button>
    </div>`,
    onOpen: () => paintMoneyToday(),
  });
}

function paintMoneyToday() {
  const d = S.cache.money;
  if (!d || !$('#moneybody')) return;

  const row = (u, kind) => `<div class="person" style="${accent(hashIdx(u.name))}">
    <div class="pin">${bn(u.pin || '—')}</div>
    <div style="flex:1;min-width:0">
      <div class="nm">${esc(u.name)}</div>
      <div class="sub">${Number(u.order_total) ? `নাস্তা ${tk(u.order_total)}` : 'আজ অর্ডার নেই'}${
        Number(u.paid_today) ? ` · দিয়েছেন ${tk(u.paid_today)}` : ''}${
        Number(u.returned_today) ? ` · ফেরত ${tk(u.returned_today)}` : ''}</div>
    </div>
    ${kind === 'give'
      ? `<button class="btn sm ok" data-act="moneyrefund" data-id="${u.id}" data-amt="${u.to_return}"
          data-name="${esc(u.name)}">💵 ${tk(u.to_return)} ফেরত</button>`
      : `<button class="btn sm" data-act="takecash" data-back="money" data-id="${u.id}"
          data-name="${esc(u.name)}">💵 ${tk(-u.to_return)} নিন</button>`}
  </div>`;

  $('#moneybody').innerHTML = `
    <div class="stats" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat g2"><div class="lbl">আজ হাতে এসেছে</div><div class="val">${tk(d.collected_today)}</div></div>
      <div class="stat g4"><div class="lbl">ফেরত দিতে হবে</div><div class="val">${tk(d.to_return_total)}</div></div>
    </div>
    ${d.give.length ? `<div class="section-title">ফেরত দিতে হবে (${bn(d.give.length)} জন)</div>
      <div class="card"><div class="card-b tight">${d.give.map((u) => row(u, 'give')).join('')}</div></div>` : ''}
    ${d.owe.length ? `<div class="section-title">টাকা নেওয়া বাকি (${bn(d.owe.length)} জন · ${tk(d.owed_total)})</div>
      <div class="card"><div class="card-b tight">${d.owe.map((u) => row(u, 'owe')).join('')}</div></div>` : ''}
    ${!d.give.length && !d.owe.length
      ? `<div class="empty"><div class="big">✅</div>সবার হিসাব মিটে গেছে</div>` : ''}`;
}

/** বাজারের লিস্ট, প্লেট সাজানো ও টাকার হিসাব — তিন ট্যাবে */
async function buyListSheet(tab = 'buy') {
  if (tab === 'plate') return platingSheet();
  if (tab === 'money') return moneyTodaySheet();
  const d = await api(`/api/summary?date=${S.date}${fq()}`);
  sheet({
    title: `🛒 বাজারের লিস্ট`,
    body: `
      ${sheetTabs('buy')}
      <div class="banner info" style="margin-bottom:14px"><span class="ic">📅</span>
        <div>${niceDate(d.date)}<small>${bn(d.people)} জনের অর্ডার · ${bn(d.shops.length)} দোকান</small></div></div>
      ${d.shops.length === 0 ? `<div class="empty"><div class="big">🤷</div>কোনো অর্ডার নেই</div>` :
        d.shops.map((sh, si) => `
        <section style="${accent(si)}">
          <div class="section-title" style="margin-top:${si ? 22 : 4}px">
            🏪 ${esc(sh.shop_name)} — ${bn(sh.qty)} টি · ${tk(sh.amount)}
          </div>
          ${sh.groups.map((g) => `
          <div class="buy-row">
            <div class="buy-qty">${bn(g.qty)}</div>
            <div style="flex:1;min-width:0">
              <div class="buy-nm">${emojiFor(g.item_name)} ${esc(g.item_name)}${g.option_name ? ` — ${esc(g.option_name)}` : ''}</div>
              <div class="buy-sub">${tk(g.unit_price)} × ${bn(g.qty)} = ${tk(g.amount)}</div>
              <div class="buy-sub" style="margin-top:2px">${esc(g.who.join(', '))}</div>
              ${g.fallbacks.map((f) => `<div class="buy-fb">⚙ ${esc(f.user)}: ${esc(
                f.type === 'item' ? `না পেলে → ${f.name}` : f.type === 'anything' ? 'না পেলে যেকোনো কিছু' : 'না পেলে নেব না'
              )}${f.note ? ` · ${esc(f.note)}` : ''}</div>`).join('')}
            </div>
          </div>`).join('')}
        </section>`).join('')}
      ${d.shops.length ? `<div class="buy-total"><span>সব মিলিয়ে ${bn(d.total_qty)} টি জিনিস</span><b>${tk(d.total_amount)}</b></div>` : ''}`,
    footer: `<div class="btn-row">
      <button class="btn" data-act="printsheet">🖨️ প্রিন্ট</button>
      <button class="btn primary" data-act="closesheet">বুঝেছি</button>
    </div>`,
  });
}

/**
 * কাকে কী দিতে হবে — নাস্তা সাজানোর তালিকা।
 * প্রতিটা প্লেট সাজানো হয়ে গেলে পাশের ঘরে টিক দিয়ে দিন, কে বাকি আছে সাথে সাথেই বোঝা যাবে।
 */
async function platingSheet() {
  const d = await api(`/api/plating?date=${S.date}${fq()}`);
  S.cache.plating = d;
  sheet({
    title: `🍽️ কে কী পাবে`,
    body: `
      ${sheetTabs('plate')}
      <div id="platebody"></div>`,
    footer: `<div class="btn-row">
      <button class="btn" data-act="printsheet">🖨️ প্রিন্ট</button>
      <button class="btn primary" data-act="closesheet">বুঝেছি</button>
    </div>`,
    onOpen: () => paintPlating(),
  });
}

function paintPlating() {
  const d = S.cache.plating;
  if (!d || !$('#platebody')) return;
  const done = d.orders.filter((o) => o.status === 'delivered').length;
  const byShop = new Map();
  for (const o of d.orders) {
    const k = o.shop_name || 'দোকান বলা হয়নি';
    if (!byShop.has(k)) byShop.set(k, []);
    byShop.get(k).push(o);
  }

  $('#platebody').innerHTML = d.orders.length === 0
    ? `<div class="empty"><div class="big">🤷</div>কোনো অর্ডার নেই</div>`
    : `<div class="banner ${done === d.people ? 'ok' : 'info'}">
        <span class="ic">${done === d.people ? '✅' : '🍽️'}</span>
        <div>${bn(done)} / ${bn(d.people)} জনের প্লেট সাজানো হয়েছে
          <small>${niceDate(d.date)} · মোট ${bn(d.total_qty)} টি জিনিস</small></div></div>
      ${[...byShop.entries()].map(([shop, list], si) => `
        <section style="${accent(si)}">
          <div class="section-title" style="margin-top:${si ? 16 : 4}px">🏪 ${esc(shop)} — ${bn(list.length)} জন</div>
          ${list.map((o) => `
            <div class="plate ${o.status === 'delivered' ? 'done' : ''}">
              <label class="plate-tick">
                <input type="checkbox" data-act="platecheck" data-id="${o.id}"
                  ${o.status === 'delivered' ? 'checked' : ''} />
              </label>
              <div class="buy-qty">${bn(o.pin || '—')}</div>
              <div style="flex:1;min-width:0">
                <div class="buy-nm">${esc(o.user_name)}${o.floor && !S.floor && isAdmin()
                  ? ` <span class="chip">${bn(o.floor)}য়</span>` : ''}</div>
                <div style="margin-top:4px">
                  ${o.lines.map((l) => `<div class="plate-line">
                    <b>${bn(l.qty)}×</b>
                    <span>${emojiFor(l.item_name)} ${esc(l.item_name)}${
                      l.option_name ? ` <span class="chip brand">${esc(l.option_name)}</span>` : ''}</span>
                  </div>`).join('')}
                </div>
                ${o.lines.filter((l) => l.fallback_type !== 'skip' || l.fallback_note)
                  .map((l) => `<div class="buy-fb">⚙ ${esc(l.item_name)}: ${esc(fbTextOf(l))}</div>`).join('')}
                ${o.note ? `<div class="buy-fb" style="background:var(--gold-soft);color:var(--gold)">📝 ${esc(o.note)}</div>` : ''}
                <div class="buy-sub" style="margin-top:4px">দাম ${tk(o.total)}${
                  S.boot.money_module && Number(o.paid_today) ? ` · হাতে দিয়েছিলেন ${tk(o.paid_today)}` : ''}</div>
                ${S.boot.money_module && Number(o.to_return) > 0 ? `
                  <button class="btn sm ok" data-act="platerefund" data-id="${o.id}" style="margin-top:6px">
                    💵 ফেরত দিন ${tk(o.to_return)}</button>` : ''}
                ${S.boot.money_module && Number(o.to_return) < 0 ? `
                  <div class="buy-fb" style="background:var(--warn-soft);color:var(--warn)">
                    💵 ${tk(-o.to_return)} পাওনা</div>` : ''}
              </div>
            </div>`).join('')}
        </section>`).join('')}
      <div class="buy-total"><span>${bn(d.people)} জন · ${bn(d.total_qty)} টি জিনিস</span><b>${tk(d.total_amount)}</b></div>`;
}

/** দোকান ধরে "কোনটা কয়টা" — রিপোর্টেও একই চেহারায় দেখায় */
function shopItemBlocks(rows) {
  if (!rows.length) return '';
  const shops = new Map();
  for (const r of rows) {
    if (!shops.has(r.shop_name)) shops.set(r.shop_name, { qty: 0, amount: 0, tiles: [] });
    const sh = shops.get(r.shop_name);
    sh.qty += r.qty;
    sh.amount += r.amount;
    sh.tiles.push(r);
  }
  return `<div class="section-title">দোকান ধরে কোনটা কয়টা</div>` +
    [...shops.entries()].map(([name, sh], si) => `
      <div class="live" style="${accent(si)}">
        <div class="live-h">🏪 ${esc(name)}<span class="n">${bn(sh.qty)} টি · ${tk(sh.amount)}</span></div>
        <div class="live-b">
          ${sh.tiles.map((t) => `<span class="tile"><b>${bn(t.qty)}</b> ${emojiFor(t.item_name)} ${esc(t.item_name)}${
            t.option_name ? `<span class="o">${esc(t.option_name)}</span>` : ''}</span>`).join('')}
        </div>
      </div>`).join('');
}

// =========================================================== ৫. রিপোর্ট
async function viewReport() {
  const to = S.repTo || S.boot.today;
  const from = S.repFrom || addDays(to, -6);
  shell(`<div class="spin"></div>`);
  const d = await api(`/api/report?from=${from}&to=${to}${fq()}`);
  shell(`
    ${floorBar()}
    <div class="card"><div class="card-b">
      <div class="row2">
        <div class="field" style="margin:0"><label>শুরু</label><input class="input" type="date" id="rfrom" value="${from}" /></div>
        <div class="field" style="margin:0"><label>শেষ</label><input class="input" type="date" id="rto" value="${to}" /></div>
      </div>
      <div class="btn-row" style="margin-top:10px">
        ${[['আজ', 0], ['৭ দিন', 6], ['৩০ দিন', 29]].map(([t, n]) =>
          `<button class="btn sm" data-act="quickrange" data-n="${n}">${t}</button>`).join('')}
      </div>
    </div></div>

    <div class="hero">
      <div class="lbl">মোট খরচ</div>
      <div class="val">${tk(d.total_amount)}</div>
      <div class="sub">${bn(d.total_days)} দিনে</div>
    </div>
    <div class="stats">
      <div class="stat g2"><div class="lbl">দিনে গড়ে</div>
        <div class="val">${tk(d.total_days ? d.total_amount / d.total_days : 0)}</div></div>
      <div class="stat g3"><div class="lbl">মোট আইটেম</div>
        <div class="val">${bn(d.byItem.reduce((s, r) => s + r.qty, 0))}</div></div>
      <div class="stat g5"><div class="lbl">কতজন খেয়েছেন</div>
        <div class="val">${bn(d.byUser.length)}</div></div>
      <div class="stat g4"><div class="lbl">সবচেয়ে বেশি</div>
        <div class="val" style="font-size:20px">${esc(d.byItem[0]?.item_name || '—')}</div>
        <div class="sub">${d.byItem[0] ? bn(d.byItem[0].qty) + ' বার' : ''}</div></div>
    </div>

    <div class="section-title">কোন আইটেম কত গেল</div>
    <div class="card"><div class="card-b scroll-x">
      <table class="tbl"><thead><tr><th>আইটেম</th><th class="n">সংখ্যা</th><th class="n">টাকা</th></tr></thead><tbody>
        ${d.byItem.map((r) => `<tr><td>${esc(r.item_name)}${r.option_name ? ` <span class="chip">${esc(r.option_name)}</span>` : ''}</td>
          <td class="n">${bn(r.qty)}</td><td class="n">${tk(r.amount)}</td></tr>`).join('') || `<tr><td colspan="3" class="center">কিছু নেই</td></tr>`}
      </tbody></table>
    </div></div>

    ${shopItemBlocks(d.byShopItem || [])}

    <div class="section-title">কোন দোকানে কত</div>
    <div class="card"><div class="card-b scroll-x">
      <table class="tbl"><thead><tr><th>দোকান</th><th class="n">অর্ডার</th><th class="n">টাকা</th></tr></thead><tbody>
        ${(d.byShop || []).map((r) => `<tr><td>🏪 ${esc(r.shop_name)}</td><td class="n">${bn(r.orders)}</td><td class="n">${tk(r.amount)}</td></tr>`).join('') || `<tr><td colspan="3" class="center">কিছু নেই</td></tr>`}
      </tbody></table>
    </div></div>

    <div class="section-title">কে কত খেল</div>
    <div class="card"><div class="card-b scroll-x">
      <table class="tbl"><thead><tr><th>নাম</th><th class="n">দিন</th><th class="n">টাকা</th></tr></thead><tbody>
        ${d.byUser.map((r) => `<tr><td>${esc(r.name)}${r.floor ? ` <span class="chip">${bn(r.floor)}য়</span>` : ''}</td><td class="n">${bn(r.days)}</td><td class="n">${tk(r.amount)}</td></tr>`).join('') || `<tr><td colspan="3" class="center">কিছু নেই</td></tr>`}
      </tbody></table>
    </div></div>

    <div class="section-title">দিন ধরে</div>
    <div class="card"><div class="card-b tight">
      ${d.days.map((r) => `<div class="list-row" data-act="gotoday" data-d="${r.order_date}" style="cursor:pointer">
        <div class="grow"><div class="nm">${niceDate(r.order_date)}</div><div class="sub">${bn(r.people)} জন</div></div>
        <b class="amt">${tk(r.amount)}</b><span class="go">›</span>
      </div>`).join('') || `<div class="empty">কিছু নেই</div>`}
    </div></div>`, { title: 'রিপোর্ট', sub: `${shortDate(from)} — ${shortDate(to)}` });

  $('#rfrom')?.addEventListener('change', (e) => { S.repFrom = e.target.value; viewReport(); });
  $('#rto')?.addEventListener('change', (e) => { S.repTo = e.target.value; viewReport(); });
}

// =========================================================== ৬. আরও
function viewMore() {
  const u = S.boot.user;
  let ai = 0;
  const row = (act, ic, t, sub) =>
    `<div class="list-row" data-act="${act}" style="cursor:pointer;${accent(ai++)}">
      <div class="ava">${ic}</div>
      <div class="grow"><div class="nm">${t}</div><div class="sub">${sub}</div></div>
      <span class="go">›</span></div>`;

  shell(`
    <div class="hero">
      <div style="font-size:44px;line-height:1">${u.role === 'super_admin' ? '👑' : u.role === 'staff' ? '🛵' : '😋'}</div>
      <div class="val" style="font-size:24px">${esc(u.name)}</div>
      <div class="sub">${ROLE_BN[u.role]} · PIN ${bn(u.pin || '—')}</div>
    </div>

    ${isStaff() ? `<div class="section-title">${isAdmin() ? 'অ্যাডমিন' : 'স্টাফ'}</div><div class="card"><div class="card-b tight">
      ${row('tab" data-k="items', '🍱', 'আইটেম ও রকম', 'নতুন আইটেম, রকম, সাধারণ দাম')}
      ${row('tab" data-k="users', '👥', 'ইউজার ও স্টাফ', isAdmin() ? 'নতুন তৈরি করুন, PIN ও রোল বদলান' : 'কে কে আছেন')}
      ${isAdmin() ? row('tab" data-k="settings', '⚙️', 'সেটিংস', 'সময়সীমা, রেজিস্ট্রেশন, হিসাব মডিউল') : ''}
    </div></div>` : ''}

    <div class="section-title">আমার</div>
    <div class="card"><div class="card-b tight">
      ${row('tab" data-k="password', '🔑', 'পাসওয়ার্ড বদলান', '')}
      ${row('install', '📲', 'হোম স্ক্রিনে অ্যাড করুন', 'অ্যাপের মতো খুলবে')}
      ${row('logout', '🚪', 'লগআউট', '')}
    </div></div>
    <p class="center hint">নাস্তা অর্ডার · ${esc(S.boot.office_name)}</p>`, { title: 'আরও' });
}

function viewPassword() {
  shell(`<form id="pwf" class="card"><div class="card-b">
      <div class="field"><label>পুরোনো পাসওয়ার্ড</label><input class="input" type="password" name="old" required /></div>
      <div class="field"><label>নতুন পাসওয়ার্ড</label><input class="input" type="password" name="new" required /></div>
      <button class="btn primary block">বদলান</button>
    </div></form>`, { title: 'পাসওয়ার্ড বদলান', back: 'more' });

  $('#pwf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/change-password', { method: 'POST', body: { old_password: f.get('old'), new_password: f.get('new') } });
      toast('✅ পাসওয়ার্ড বদলে গেছে', 'ok');
      S.tab = 'more'; render();
    } catch (err) { toast(err.message, 'err'); }
  });
}

// =========================================================== ৭. দোকান ও দাম
async function viewShops() {
  shell(`<div class="spin"></div>`, { title: 'দোকান ও দাম' });
  const [shops, items] = await Promise.all([api('/api/shops?all=1'), api('/api/items?all=1')]);
  S.shops = shops;
  S.items = items;

  shell(`
    <button class="btn primary block" data-act="shopedit" data-id="0" style="margin-bottom:14px">+ নতুন দোকান</button>
    ${shops.length === 0
      ? `<div class="empty"><div class="big">🏪</div>এখনো কোনো দোকান যোগ করা হয়নি</div>`
      : `<div class="card"><div class="card-b tight">
        ${shops.map((s, i) => {
          const n = items.filter((it) => it.shop_prices && it.shop_prices[s.id] != null).length;
          return `<div class="list-row" data-act="shopedit" data-id="${s.id}" style="cursor:pointer;${accent(i)}">
            <div class="ava">🏪</div>
            <div class="grow">
              <div class="nm">${esc(s.name)} ${s.active ? '' : '<span class="chip warn">বন্ধ</span>'}</div>
              <div class="sub">${n ? `${bn(n)} টি জিনিসের আলাদা দাম দেওয়া আছে` : 'সব জিনিসেই সাধারণ দাম'}</div>
            </div>
            <span class="go">›</span>
          </div>`;
        }).join('')}
      </div></div>`}
    <p class="hint center">একই জিনিসের একেক দোকানে একেক দাম হলে এখানে বসিয়ে দিন।<br>
      যে ঘর খালি রাখবেন, সেটায় সাধারণ দামই ধরা হবে।</p>
  `, { title: 'দোকান ও দাম' });
}

function shopEditSheet(id) {
  const s = id ? S.shops.find((x) => x.id === id) : { id: 0, name: '', active: 1 };
  if (!s) return;
  const items = S.items.filter((i) => i.active);
  sheet({
    title: id ? `🏪 ${esc(s.name)}` : 'নতুন দোকান',
    body: `
      <div class="field"><label>দোকানের নাম</label>
        <input class="input" id="s_name" value="${esc(s.name)}" placeholder="যেমন: প্রিন্স হোটেল" /></div>
      ${id ? `<label class="check"><input type="checkbox" id="s_active" ${s.active ? 'checked' : ''} /> দোকানটা চালু আছে</label>
      <button class="btn block" data-act="newitemhere" data-id="${id}" style="margin-bottom:12px">
        + এই দোকানের নতুন আইটেম (দামসহ)</button>
      <div class="section-title" style="margin-left:0">এই দোকানে কোনটার কত</div>
      <div class="card"><div class="card-b tight">
        ${items.map((it) => {
          const p = it.shop_prices ? it.shop_prices[s.id] : null;
          const missing = (it.shop_missing || []).includes(s.id);
          return `<div class="item">
            <div class="ava">${emojiFor(it.name)}</div>
            <div class="info"><div class="nm">${esc(it.name)}</div>
              <div class="pr">সাধারণ দাম ${tk(it.price)}</div>
              <label class="chip ${missing ? 'warn' : ''}" style="margin-top:4px;cursor:pointer">
                <input type="checkbox" class="missinput" data-item="${it.id}" ${missing ? 'checked' : ''}
                  style="width:14px;height:14px;margin:0" /> এখানে নেই
              </label>
            </div>
            <input class="input priceinput" data-item="${it.id}" type="number" step="0.5" inputmode="decimal"
              style="width:98px;text-align:right;padding:9px 11px" value="${p != null ? p : ''}" placeholder="${it.price}" />
          </div>`;
        }).join('')}
      </div></div>
      <div class="hint">দামের ঘর খালি রাখলে সাধারণ দামই চলবে।
        "এখানে নেই" দিলে এই দোকান বাছলে জিনিসটা মেনুতেই দেখাবে না।</div>`
      : `<div class="hint">দোকানটা সেভ করার পর প্রতিটা জিনিসের দাম বসাতে পারবেন।</div>`}`,
    footer: `<div class="btn-row">
      ${id ? `<button class="btn danger" data-act="shopdel" data-id="${id}">মুছুন</button>` : ''}
      <button class="btn primary" data-act="shopsave" data-id="${id}">সেভ</button>
    </div>`,
  });
}

// =========================================================== ৮. আইটেম ম্যানেজ
async function viewItems() {
  shell(`<div class="spin"></div>`, { title: 'আইটেম', back: 'more' });
  const items = await api('/api/items?all=1');
  S.items = items;
  const cats = [...new Set(items.map((i) => i.category))];
  shell(`
    <button class="btn primary block" data-act="itemedit" data-id="0" style="margin-bottom:14px">+ নতুন আইটেম</button>
    ${cats.map((c, ci) => `
      <section style="${accent(ci)}">
      <div class="section-title">${esc(c)}</div>
      <div class="card"><div class="card-b tight">
        ${items.filter((i) => i.category === c).map((i) => `
          <div class="list-row" data-act="itemedit" data-id="${i.id}" style="cursor:pointer;${i.active ? '' : 'opacity:.5'}">
            <div class="ava">${emojiFor(i.name)}</div>
            <div class="grow">
              <div class="nm">${esc(i.name)} ${i.available ? '' : '<span class="chip warn">আজ নেই</span>'} ${i.active ? '' : '<span class="chip">বন্ধ</span>'}</div>
              <div class="sub">${tk(i.price)}${i.options.length ? ' · ' + i.options.map((o) => esc(o.name)).join(', ') : ''}</div>
            </div>
            <span class="go">›</span>
          </div>`).join('')}
      </div></div></section>`).join('')}`, { title: 'আইটেম ও দাম', back: 'more' });
}

function itemEditSheet(id) {
  const it = id ? S.items.find((i) => i.id === id) : { name: '', price: '', category: 'নাস্তা', sort_order: 100, active: 1, available: 1, options: [] };
  sheet({
    title: id ? esc(it.name) : 'নতুন আইটেম',
    body: `
      <div class="field"><label>নাম</label><input class="input" id="i_name" value="${esc(it.name)}" placeholder="যেমন: সিঙ্গারা" /></div>
      <div class="row2">
        <div class="field"><label>দাম (৳)</label><input class="input" id="i_price" type="number" step="0.5" value="${it.price}" /></div>
        <div class="field"><label>ক্যাটাগরি</label><input class="input" id="i_cat" value="${esc(it.category)}" /></div>
      </div>
      <div class="row2">
        <label class="check"><input type="checkbox" id="i_avail" ${it.available ? 'checked' : ''} /> আজ পাওয়া যাচ্ছে</label>
        <label class="check"><input type="checkbox" id="i_active" ${it.active ? 'checked' : ''} /> মেনুতে দেখাবে</label>
      </div>
      <div class="section-title" style="margin-left:0">রকম (যেমন পরোটা → তেল দিয়ে / তেল ছাড়া)</div>
      <div id="optlist">${it.options.map(optRow).join('')}</div>
      <button class="btn sm" data-act="addoptrow">+ রকম যোগ</button>
      <div class="hint">
        ⭐ দেওয়া রকমটাই <b>ডিফল্ট</b> — কেউ কিছু না বাছলে ওটাই ধরা হবে (যেমন পরোটা → তেল দিয়ে)।<br>
        দাম বাড়লে/কমলে "+/− টাকা" ঘরে লিখুন (যেমন ওমলেট = +৫)। রকম না দিলে আইটেমটা সরাসরি অর্ডার হবে।
      </div>`,
    footer: `<div class="btn-row">
      ${id ? `<button class="btn danger" data-act="itemdel" data-id="${id}">মুছুন</button>` : ''}
      <button class="btn primary" data-act="itemsave" data-id="${id}">সেভ</button></div>`,
  });
}
function optRow(o = { name: '', price_delta: 0, is_default: false }) {
  return `<div class="optrow" style="display:grid;grid-template-columns:auto 2fr 1fr auto;gap:6px;align-items:center;margin-bottom:8px">
    <label title="কিছু না বাছলে এটাই ধরা হবে" style="cursor:pointer;display:flex;align-items:center">
      <input type="radio" name="optdef" class="o_def" ${o.is_default ? 'checked' : ''} style="width:18px;height:18px" />
    </label>
    <input class="input o_n" value="${esc(o.name)}" placeholder="যেমন: তেল দিয়ে" />
    <input class="input o_d" type="number" step="0.5" value="${o.price_delta}" placeholder="+/− টাকা" />
    <button class="btn sm danger" data-act="rmoptrow">✕</button>
  </div>`;
}

// =========================================================== ৮. ইউজার ম্যানেজ
async function viewUsers() {
  shell(`<div class="spin"></div>`, { title: 'ইউজার', back: 'more' });
  const users = await api('/api/users?' + (S.floor ? 'floor=' + S.floor : ''));
  const groups = [['super_admin', 'সুপার অ্যাডমিন'], ['staff', 'স্টাফ'], ['user', 'ইউজার']];
  shell(`
    ${floorBar()}
    ${isAdmin() ? `<button class="btn primary block" data-act="useredit" data-id="0" style="margin-bottom:14px">+ নতুন ইউজার / স্টাফ</button>` : ''}
    ${groups.map(([k, t], gi) => {
      const list = users.filter((u) => u.role === k);
      if (!list.length) return '';
      const ic = { super_admin: '👑', staff: '🛵', user: '😋' }[k];
      return `<section style="${accent(gi + 2)}">
      <div class="section-title">${ic} ${t} (${bn(list.length)})</div>
      <div class="card"><div class="card-b tight">
        ${list.map((u) => `<div class="list-row" ${isAdmin() ? `data-act="useredit" data-id="${u.id}" style="cursor:pointer"` : ''}>
          <div class="ava">${esc((u.name || '?').trim()[0])}</div>
          <div class="grow"><div class="nm">${esc(u.name)} ${u.active ? '' : '<span class="chip warn">বন্ধ</span>'}</div>
            <div class="sub">PIN ${bn(u.pin || '—')}${u.floor ? ` · ${bn(u.floor)}য় তলা` : ' · সব তলা'}</div></div>
          ${isAdmin() ? `<span class="go">›</span>` : ''}
        </div>`).join('')}
      </div></div></section>`;
    }).join('')}
    <p class="hint center">নতুন কেউ নিজে থেকেও রেজিস্ট্রেশন করতে পারবেন — অফিস PIN দিয়ে।</p>`,
    { title: 'ইউজার ও স্টাফ', back: 'more' });
  S.cache.users = users;
}

function userEditSheet(id) {
  const u = id ? S.cache.users.find((x) => x.id === id) : { name: '', role: 'user', active: 1 };
  sheet({
    title: id ? esc(u.name) : 'নতুন ইউজার',
    body: `
      <div class="field"><label>নাম</label><input class="input" id="u_name" value="${esc(u.name)}" /></div>
      <div class="row2">
        <div class="field"><label>PIN</label>
          <input class="input" id="u_pin" inputmode="numeric" maxlength="6" value="${esc(u.pin || '')}"
            placeholder="৪–৬ সংখ্যা" /></div>
        <div class="field"><label>তলা</label>
          <select class="input" id="u_floor">
            ${(S.boot.floors || []).map((f) => `<option value="${f}" ${u.floor === f ? 'selected' : ''}>${bn(f)}য় তলা</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label>রোল</label>
        <select class="input" id="u_role">
          ${Object.entries(ROLE_BN).map(([k, t]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <div class="hint">স্টাফ = নিজের তলার অর্ডার, বাজারের লিস্ট, টাকার হিসাব, অবস্থা জানানো, আইটেম ও দাম।<br>
          সুপার অ্যাডমিন = সব তলা, সব কিছু। স্টাফের তলা বদলালে এখান থেকেই বদলে দিন।</div>
      </div>
      <div class="field"><label>${id ? 'নতুন পাসওয়ার্ড (বদলাতে চাইলে)' : 'পাসওয়ার্ড'}</label>
        <input class="input" id="u_pass" type="text" placeholder="${id ? 'খালি রাখলে বদলাবে না' : 'কমপক্ষে ৪ অক্ষর'}" /></div>
      ${id ? `<label class="check">
        <input type="checkbox" id="u_active" ${u.active ? 'checked' : ''} /> অ্যাকাউন্ট চালু</label>` : ''}`,
    footer: `<button class="btn primary block" data-act="usersave" data-id="${id}">সেভ</button>`,
  });
}

// =========================================================== ৯. সেটিংস
async function viewSettings() {
  shell(`<div class="spin"></div>`, { title: 'সেটিংস', back: 'more' });
  const s = await api('/api/settings');
  shell(`<form id="setf" class="card"><div class="card-b">
      <div class="field"><label>অফিসের নাম</label><input class="input" name="office_name" value="${esc(s.office_name)}" /></div>
      <div class="field"><label>অফিসের তলাগুলো</label>
        <input class="input" name="floors" value="${esc(s.floors || '2,3,4,5')}" placeholder="2,3,4,5" />
        <div class="hint">কমা দিয়ে লিখুন। প্রত্যেক তলার হিসাব আলাদা — এক তলার কিছু অন্য তলার কেউ দেখে না।</div></div>
      <label class="check">
        <input type="checkbox" name="allow_register" ${s.allow_register === '1' ? 'checked' : ''} />
        নতুন কেউ নিজে রেজিস্ট্রেশন করতে পারবে</label>
      <div class="hint" style="margin-top:-6px;margin-bottom:12px">বন্ধ করলে শুধু অ্যাডমিনই নতুন ইউজার বানাতে পারবেন।</div>
      <label class="check">
        <input type="checkbox" name="money_module" ${s.money_module === '1' ? 'checked' : ''} />
        জমা / ফেরতের হিসাব চালু রাখুন</label>
      <div class="hint" style="margin-top:-6px;margin-bottom:12px">বন্ধ করলে "টাকা" ট্যাবটা লুকিয়ে যাবে — শুধু অর্ডার আর বাজারের লিস্ট থাকবে।</div>
      <button class="btn primary block">সেভ করুন</button>
    </div></form>`, { title: 'সেটিংস', back: 'more' });

  $('#setf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/settings', { method: 'PUT', body: {
        office_name: f.get('office_name'),
        floors: f.get('floors'),
        money_module: f.get('money_module') ? 1 : 0,
        allow_register: f.get('allow_register') ? 1 : 0,
      }});
      toast('✅ সেভ হয়েছে', 'ok');
      await boot();
      S.tab = 'settings'; render();
    } catch (err) { toast(err.message, 'err'); }
  });
}

// ------------------------------------------------------------------ events
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = Number(el.dataset.id || 0);

  try {
    switch (act) {
      case 'authtab': S.authTab = el.dataset.k; return renderAuth();
      case 'closesheet': return closeSheet();
      case 'tab':
        closeSheet();
        if (S.dirty && S.tab === 'order' && !confirm('অর্ডার সেভ করা হয়নি — বাদ দেবেন?')) return;
        S.dirty = false; S.tab = el.dataset.k; return render();

      // অর্ডার
      case 'inc': return bumpEverywhere(el.dataset.key, 1);
      case 'dec': return bumpEverywhere(el.dataset.key, -1);
      case 'pickopt': return pickOption(Number(el.dataset.item));
      case 'fb': return fbSheet(el.dataset.key);
      case 'fbsave': {
        const key = el.dataset.key;
        const l = S.cart.get(key);
        if (l) {
          l.fallback_type = document.querySelector('input[name=fbt]:checked')?.value || 'skip';
          l.fallback_item_id = l.fallback_type === 'item' ? Number($('#fbitem')?.value) || null : null;
          l.fallback_note = $('#fbnote')?.value || '';
          S.dirty = true;
        }
        closeSheet(); return paintOrder();
      }
      case 'save': return saveOrder();
      case 'delorder':
        if (!confirm('আজকের পুরো অর্ডার বাতিল করবেন?')) return;
        await api('/api/orders/' + S.orderMeta.order.id, { method: 'DELETE' });
        toast('বাতিল হয়েছে', 'ok'); return viewOrder();

      // দোকান
      case 'setshop':
        S.shopId = id; S.dirty = true; return paintOrder();
      case 'shopedit': return shopEditSheet(id);
      case 'newitemhere': {
        // দোকানের ভেতর থেকেই নতুন জিনিস — নাম, দাম, ক্যাটাগরি দিলেই হয়ে যায়
        const shop = S.shops.find((x) => x.id === id);
        const cats = [...new Set(S.items.map((i) => i.category))];
        sheet({
          title: `+ ${esc(shop?.name || 'দোকান')}-এর নতুন আইটেম`,
          body: `
            <div class="field"><label>নাম</label>
              <input class="input" id="ni_name" placeholder="যেমন: বুটের ডাল" /></div>
            <div class="row2">
              <div class="field"><label>এই দোকানে দাম (৳)</label>
                <input class="input" id="ni_price" type="number" step="0.5" inputmode="decimal" placeholder="২০" /></div>
              <div class="field"><label>ক্যাটাগরি</label>
                <input class="input" id="ni_cat" list="catlist" value="${esc(cats[0] || 'নাস্তা')}" />
                <datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
            </div>
            <div class="hint">এই দামটা শুধু এই দোকানের জন্য বসবে। অন্য দোকানে আলাদা দাম হলে
              সেখানে গিয়ে বসিয়ে দিন — না বসালে এই দামই সাধারণ দাম হিসেবে চলবে।</div>`,
          footer: `<button class="btn primary block" data-act="newitemsave" data-id="${id}">যোগ করুন</button>`,
          onOpen: () => setTimeout(() => $('#ni_name')?.focus(), 120),
        });
        return;
      }
      case 'newitemsave': {
        const name = $('#ni_name').value.trim();
        const price = Number($('#ni_price').value) || 0;
        if (!name) return toast('আইটেমের নাম দিন', 'err');
        if (price <= 0) return toast('দাম দিন', 'err');
        const r = await api('/api/items', {
          method: 'POST',
          body: { name, price, category: $('#ni_cat').value.trim() || 'নাস্তা' },
        });
        await api(`/api/shops/${id}/prices`, {
          method: 'PUT',
          body: { prices: [{ item_id: r.id, price, available: 1 }] },
        });
        toast(`✅ ${name} যোগ হলো · ${tk(price)}`, 'ok');
        closeSheet();
        await viewShops();
        return shopEditSheet(id);
      }
      case 'shopsave': {
        const name = $('#s_name').value.trim();
        if (!name) return toast('দোকানের নাম দিন', 'err');
        const body = { name };
        if (id) body.active = $('#s_active').checked ? 1 : 0;
        const r = id
          ? await api('/api/shops/' + id, { method: 'PUT', body })
          : await api('/api/shops', { method: 'POST', body });
        if (id) {
          const miss = new Map([...document.querySelectorAll('.missinput')]
            .map((m) => [Number(m.dataset.item), m.checked]));
          const prices = [...document.querySelectorAll('.priceinput')].map((p) => ({
            item_id: Number(p.dataset.item),
            price: p.value === '' ? null : Number(p.value),
            available: miss.get(Number(p.dataset.item)) ? 0 : 1,
          }));
          await api(`/api/shops/${id}/prices`, { method: 'PUT', body: { prices } });
        }
        toast('✅ সেভ হয়েছে', 'ok'); closeSheet();
        if (!id && r.id) { await viewShops(); return shopEditSheet(r.id); }
        return viewShops();
      }
      case 'shopdel':
        if (!confirm('দোকানটা সরিয়ে দেব? (পুরোনো অর্ডারের হিসাব থাকবে)')) return;
        await api('/api/shops/' + id, { method: 'DELETE' });
        toast('সরানো হয়েছে', 'ok'); closeSheet(); return viewShops();

      // রোজকার অর্ডার
      case 'usualplace':
        applyUsual();
        return saveOrder();
      case 'usualsave': {
        await api('/api/me/usual', {
          method: 'PUT',
          body: {
            user_id: S.orderFor ? S.orderFor.id : undefined,
            shop_id: S.shopId,
            lines: [...S.cart.values()],
          },
        });
        toast('⭐ রোজকার অর্ডার হিসেবে রাখা হলো', 'ok');
        return viewOrder();
      }
      case 'usualclear':
        if (!confirm('রোজকার অর্ডারটা মুছে ফেলব?')) return;
        await api('/api/me/usual' + (S.orderFor ? `?user_id=${S.orderFor.id}` : ''), { method: 'DELETE' });
        toast('মোছা হয়েছে', 'ok'); return viewOrder();

      // নোটিফিকেশন
      case 'notif': {
        const seen = getSeen();
        const list = S.notif;
        markSeen();
        sheet({
          title: '🔔 আজকের অর্ডার',
          body: list.length === 0
            ? `<div class="empty"><div class="big">🔕</div>আজ এখনো কেউ অর্ডার দেয়নি</div>`
            : `<div class="card"><div class="card-b tight">
                ${list.map((n) => `<div class="list-row" data-act="orderforpick" data-id="${n.user_id}"
                    data-name="${esc(n.user_name)}" style="cursor:pointer;${accent(hashIdx(n.user_name))}
                    ${String(n.updated_at) > seen ? 'background:var(--brand-soft)' : ''}">
                  <div class="ava">${esc((n.user_name || '?').trim()[0])}</div>
                  <div class="grow">
                    <div class="nm">${esc(n.user_name)} ${String(n.updated_at) > seen ? '<span class="chip brand">নতুন</span>' : ''}</div>
                    <div class="sub">PIN ${bn(n.pin || '—')}${n.floor ? ` · ${bn(n.floor)}য় তলা` : ''}
                      · ${bn(n.qty)} টি · 🏪 ${esc(n.shop_name || '—')}</div>
                    <div class="sub">${esc(String(n.updated_at).slice(11, 16))}</div>
                  </div>
                  <b class="amt">${tk(n.total)}</b>
                </div>`).join('')}
              </div></div>
              <p class="hint center">কারো নামে চাপ দিলে তার অর্ডারটা খুলে যাবে — চাইলে বদলেও দিতে পারবেন।</p>`,
        });
        const btn = document.querySelector('[data-act="notif"] .badge');
        if (btn) btn.remove();
        return;
      }

      // অর্ডার নেওয়ার সময় হাতে দেওয়া টাকা
      case 'takecash':
        e.stopPropagation();
        return takeCashSheet(id, el.dataset.name, el.dataset.back || '');
      case 'cashnow': {
        const amt = Number(el.dataset.amt || $('#cashamt')?.value);
        if (!amt || amt <= 0) return toast('টাকার অঙ্ক দিন', 'err');
        await api('/api/ledger', {
          method: 'POST',
          body: { user_id: id, type: 'deposit', amount: amt, note: `${S.date} — অর্ডারের সময় হাতে দিলেন` },
        });
        toast(`💵 ${el.dataset.name} দিলেন ${tk(amt)}`, 'ok');
        closeSheet();
        if (el.dataset.back === 'money') return moneyTodaySheet();
        if (S.cache.quick) {
          const fresh = await api(`/api/quick-users?date=${S.date}${fq()}`);
          S.cache.quick = fresh.users;
          return orderForSheet();
        }
        if (S.tab === 'today') return viewToday();
        return;
      }
      case 'moneyrefund': {
        const amt = Number(el.dataset.amt);
        if (!(amt > 0)) return toast('ফেরত দেওয়ার মতো টাকা নেই', 'err');
        if (!confirm(`${el.dataset.name}-কে ${tk(amt)} ফেরত দিলেন?`)) return;
        await api('/api/ledger', {
          method: 'POST',
          body: { user_id: id, type: 'refund', amount: amt, note: `${S.date} — নাস্তা দেওয়ার সময় ফেরত` },
        });
        toast(`✅ ${el.dataset.name}-কে ${tk(amt)} ফেরত দেওয়া হলো`, 'ok');
        S.cache.money = await api(`/api/money-today?date=${S.date}${fq()}`);
        return paintMoneyToday();
      }
      case 'platerefund': {
        const o = S.cache.plating?.orders.find((x) => x.id === id);
        if (!o) return;
        const amt = Number(o.to_return);
        if (amt <= 0) return toast('ফেরত দেওয়ার মতো টাকা নেই', 'err');
        if (!confirm(`${o.user_name}-কে ${tk(amt)} ফেরত দিলেন?`)) return;
        await api('/api/ledger', {
          method: 'POST',
          body: { user_id: o.user_id, type: 'refund', amount: amt, note: `${S.date} — নাস্তা দেওয়ার সময় ফেরত` },
        });
        toast(`✅ ${o.user_name}-কে ${tk(amt)} ফেরত দেওয়া হলো`, 'ok');
        const d = await api(`/api/plating?date=${S.date}${fq()}`);
        S.cache.plating = d;
        return paintPlating();
      }

      // স্টাফ কারো হয়ে অর্ডার
      case 'orderfor': return orderForSheet();
      case 'quickplace': {
        // এক ক্লিকেই ওই মানুষের রোজকার অর্ডার বসে যাবে
        e.stopPropagation();
        const u = (S.cache.quick || []).find((x) => x.id === id);
        if (!u?.usual?.lines?.length) return toast('রোজকার অর্ডার সেভ করা নেই', 'err');
        const r = await api('/api/orders', {
          method: 'POST',
          body: {
            date: S.date,
            user_id: id,
            shop_id: u.usual.shop_id ?? u.default_shop_id ?? null,
            lines: u.usual.lines,
          },
        });
        toast(`✅ ${el.dataset.name}-এর অর্ডার বসে গেছে · ${tk(r.total)}`, 'ok');
        const fresh = await api(`/api/quick-users?date=${S.date}${fq()}`);
        S.cache.quick = fresh.users;
        paintQuickList($('#qsearch')?.value.trim() || '');
        fetchNotifs();
        return;
      }
      case 'orderforpick':
        closeSheet();
        S.orderFor = { id, name: el.dataset.name };
        S.tab = 'order'; return viewOrder();
      case 'orderforclear':
        S.orderFor = null;
        S.tab = isStaff() ? 'today' : 'order';
        return render();

      // তলা
      case 'setfloor':
        S.floor = el.dataset.f ? Number(el.dataset.f) : null;
        return render();

      // স্টাফ — আজ
      case 'daynav': S.date = addDays(S.date, Number(el.dataset.d)); return viewToday();
      case 'gotoday': S.date = el.dataset.d; S.tab = 'today'; return render();
      case 'setstatus': {
        if (isAdmin() && !S.floor) return toast('আগে কোন তলা সেটা বেছে নিন', 'err');
        const r = await api('/api/status', {
          method: 'PUT',
          body: { date: S.date, floor: S.floor, status: el.dataset.s, message: $('#statusmsg')?.value || '' },
        });
        S.boot.status = r.status; S.statusVersion = r.status.version;
        toast('সবাইকে জানানো হয়েছে ✅', 'ok');
        await viewToday();
        // অর্ডার নেওয়া বন্ধ করলে সাথে সাথেই বাজারের লিস্ট সামনে আসুক
        if (el.dataset.s === 'closed') buyListSheet();
        return;
      }
      // প্লেট সাজানো হয়ে গেলে টিক — সাথে সাথেই "দেওয়া হয়েছে" হয়ে যায়
      case 'platecheck': {
        const on = el.checked;
        await api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status: on ? 'delivered' : 'pending' } });
        const o = S.cache.plating?.orders.find((x) => x.id === id);
        if (o) o.status = on ? 'delivered' : 'pending';
        paintPlating();
        return;
      }
      case 'availsheet': return availSheet();
      case 'orderdetail': return orderDetailSheet(id);
      case 'avail': {
        await api(`/api/items/${id}/available`, { method: 'PATCH', body: { available: Number(el.dataset.v) } });
        const it = S.items.find((x) => x.id === id);
        if (it) it.available = Number(el.dataset.v) === 1;
        if ($('#sheet')) { closeSheet(); availSheet(); } else { await viewToday(); }
        return;
      }
      case 'buylist': return buyListSheet(el.dataset.tab || 'buy');
      case 'printsheet': return window.print();
      case 'deliverall':
        if (!confirm('সবার অর্ডার "দেওয়া হয়েছে" করে দেবেন?')) return;
        await api('/api/orders/deliver-all', { method: 'POST', body: { date: S.date, floor: S.floor } });
        toast('✅ হয়ে গেছে', 'ok'); return viewToday();

      // টাকা
      case 'userledger': return userLedgerSheet(id);
      case 'ledgeradd': {
        const amt = Number($('#lamt')?.value);
        if (!amt) return toast('টাকার অঙ্ক দিন', 'err');
        await api('/api/ledger', { method: 'POST', body: { user_id: id, type: el.dataset.type, amount: amt, note: $('#lnote')?.value || '' } });
        toast('✅ হয়েছে', 'ok'); closeSheet(); return userLedgerSheet(id);
      }
      case 'refundall':
        if (!confirm('পুরো ব্যালেন্স ফেরত দেওয়া হয়েছে বলে লিখব?')) return;
        await api('/api/ledger/refund-all', { method: 'POST', body: { user_id: id } });
        toast('✅ ফেরত লেখা হয়েছে', 'ok'); closeSheet(); return userLedgerSheet(id);
      case 'delledger': {
        if (!confirm('এই এন্ট্রি মুছে ফেলবেন?')) return;
        await api('/api/ledger/' + id, { method: 'DELETE' });
        toast('মোছা হয়েছে', 'ok'); closeSheet(); return viewMoney();
      }

      // রিপোর্ট
      case 'quickrange':
        S.repTo = S.boot.today; S.repFrom = addDays(S.boot.today, -Number(el.dataset.n)); return viewReport();

      // আইটেম
      case 'itemedit': return itemEditSheet(id);
      case 'addoptrow': { $('#optlist').insertAdjacentHTML('beforeend', optRow()); return; }
      case 'rmoptrow': return el.closest('.optrow').remove();
      case 'itemsave': {
        const body = {
          name: $('#i_name').value, price: Number($('#i_price').value) || 0,
          category: $('#i_cat').value || 'নাস্তা',
          available: $('#i_avail').checked ? 1 : 0, active: $('#i_active').checked ? 1 : 0,
          options: [...document.querySelectorAll('.optrow')].map((r) => ({
            name: r.querySelector('.o_n').value,
            price_delta: Number(r.querySelector('.o_d').value) || 0,
            is_default: r.querySelector('.o_def').checked ? 1 : 0,
          })).filter((o) => o.name.trim()),
        };
        if (id) await api('/api/items/' + id, { method: 'PUT', body });
        else await api('/api/items', { method: 'POST', body });
        toast('✅ সেভ হয়েছে', 'ok'); closeSheet(); return viewItems();
      }
      case 'itemdel':
        if (!confirm('মেনু থেকে সরিয়ে দেব? (পুরোনো অর্ডারের হিসাব থাকবে)')) return;
        await api('/api/items/' + id, { method: 'DELETE' });
        toast('সরানো হয়েছে', 'ok'); closeSheet(); return viewItems();

      // ইউজার
      case 'useredit': return userEditSheet(id);
      case 'usersave': {
        const body = {
          name: $('#u_name').value,
          role: $('#u_role').value,
          pin: $('#u_pin').value.trim(),
          floor: Number($('#u_floor').value) || undefined,
        };
        const p = $('#u_pass').value;
        if (p) body.password = p;
        if (id) {
          body.active = $('#u_active').checked ? 1 : 0;
          await api('/api/users/' + id, { method: 'PATCH', body });
        } else {
          if (!p) return toast('পাসওয়ার্ড দিন', 'err');
          await api('/api/users', { method: 'POST', body });
        }
        toast('✅ সেভ হয়েছে', 'ok'); closeSheet(); return viewUsers();
      }

      // আরও
      case 'install':
        if (window.deferredPrompt) { window.deferredPrompt.prompt(); window.deferredPrompt = null; }
        else alert('ব্রাউজারের মেনু (⋮) খুলে "Add to Home screen" / "হোম স্ক্রিনে যোগ করুন" চাপুন।');
        return;
      case 'logout':
        if (!confirm('লগআউট করবেন?')) return;
        await api('/api/logout', { method: 'POST' });
        S.tab = 'order'; return boot();
    }
  } catch (err) { toast(err.message, 'err'); }
});

/** শীট খোলা থাকলে শীটও রিফ্রেশ করতে হবে */
function bumpEverywhere(key, d) {
  const openSheetItem = $('#sheet') ? Number(key.split('|')[0]) : null;
  bump(key, d);
  if (openSheetItem) pickOption(openSheetItem);
}

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-act="ostatus"]');
  if (!el) return;
  try {
    await api(`/api/orders/${el.dataset.id}/status`, { method: 'PATCH', body: { status: el.value } });
    toast('✅ আপডেট হয়েছে', 'ok');
    viewToday();
  } catch (err) { toast(err.message, 'err'); }
});

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.deferredPrompt = e; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.boot?.user && !$('#sheet')) boot(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
