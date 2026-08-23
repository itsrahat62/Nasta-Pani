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
  [/কফি/, '☕'], [/চা|টি\b/, '🍵'], [/পানি|ওয়াটার/, '💧'], [/জুস|শরবত|লেবু/, '🧃'],
  [/ডিম|অমলেট|ওমলেট|পোচ/, '🥚'], [/সিঙ্গারা|সমুচা|সামুচা/, '🥟'], [/পুরি|পরোটা|রুটি|নান|লুচি/, '🫓'],
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
};

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
  if (!isStaff() && S.tab === 'today') S.tab = 'order';
  render();
  startPolling();
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!S.boot?.user || document.hidden) return;
    try {
      const r = await api('/api/status');
      const v = r.status?.version ?? null;
      S.boot.now = r.now;
      if (v !== S.statusVersion) {
        S.statusVersion = v;
        S.boot.status = r.status;
        if (r.status) toast(`${r.status.icon} ${r.status.label}`, 'ok');
        if (!$('#sheet')) render();
      }
    } catch { /* চুপচাপ */ }
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
      <div class="tabs2">
        <button data-act="authtab" data-k="login" class="${t === 'login' ? 'on' : ''}">লগইন</button>
        <button data-act="authtab" data-k="reg" class="${t === 'reg' ? 'on' : ''}">রেজিস্ট্রেশন</button>
      </div>
      <form id="authform" class="card"><div class="card-b">
        <div class="field">
          <label>${t === 'reg' ? 'আপনার নাম (অফিসের ডাকনাম)' : 'আপনার নাম'}</label>
          <input class="input" name="name" autocomplete="username"
            placeholder="${t === 'reg' ? 'অফিসে আপনাকে যে নামে ডাকে — যেমন: রাহাত ভাই' : 'অফিসের ডাকনাম'}" required />
          ${t === 'reg' ? `<div class="hint">অফিসে সবাই আপনাকে যে নামে চেনে সেটাই দিন — স্টাফ এই নাম দেখেই নাস্তা বুঝিয়ে দেবেন।</div>` : ''}
        </div>
        ${t === 'reg' ? `
        <div class="field">
          <label>অফিস PIN</label>
          <input class="input" name="pin" inputmode="numeric" placeholder="অফিস থেকে যে PIN দেওয়া হয়েছে" required />
          <div class="hint">PIN না জানলে স্টাফ বা অ্যাডমিনের কাছ থেকে নিন।</div>
        </div>` : ''}
        <div class="field">
          <label>পাসওয়ার্ড</label>
          <input class="input" name="password" type="password" autocomplete="${t === 'reg' ? 'new-password' : 'current-password'}" placeholder="••••••" required />
        </div>
        <button class="btn primary block" type="submit">${t === 'reg' ? 'রেজিস্ট্রেশন করুন' : 'ঢুকুন'}</button>
      </div></form>
    </div>`;

  $('#authform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (t === 'reg') {
        await api('/api/register', { method: 'POST', body: { name: f.get('name'), pin: f.get('pin'), password: f.get('password') } });
      } else {
        await api('/api/login', { method: 'POST', body: { name: f.get('name'), password: f.get('password') } });
      }
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
  const tabs = isStaff()
    ? [
        { k: 'order',  ic: '🍽️', t: 'অর্ডার' },
        { k: 'today',  ic: '📋', t: 'আজ' },
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
  const activeKey = ['items', 'users', 'settings', 'password'].includes(S.tab) ? 'more' : S.tab;

  $('#app').innerHTML = `
    <div class="topbar">
      ${opts.back ? `<button class="avatar" data-act="tab" data-k="${opts.back}" title="ফিরে যান">←</button>` : ''}
      <div class="grow">
        <h1>${esc(opts.title || S.boot.office_name)}</h1>
        <div class="sub">${esc(opts.sub || `${niceDate(S.boot.today)} · ${esc(u.name)}`)}</div>
      </div>
      ${opts.back ? '' : `<button class="avatar" data-act="tab" data-k="more">${esc(u.name.trim()[0] || '?')}</button>`}
    </div>
    <main>${inner}</main>
    <nav class="tabbar">
      ${tabs.map((x) => `<button data-act="tab" data-k="${x.k}" class="${activeKey === x.k ? 'on' : ''}">
        <span class="ic">${x.ic}</span><span>${x.t}</span></button>`).join('')}
    </nav>`;
}

function statusBanner() {
  const st = S.boot.status;
  if (!st) {
    return `<div class="banner muted"><span class="ic">⏰</span><div>
      অর্ডার নেওয়ার সময় ${bn(S.boot.cutoff_time)} পর্যন্ত
      <small>স্টাফ এখনো আজকের অবস্থা জানাননি</small></div></div>`;
  }
  return `<div class="banner ${st.tone}"><span class="ic">${st.icon}</span><div>
    ${esc(st.label)}
    ${st.message ? `<small>${esc(st.message)}</small>` : ''}
  </div></div>`;
}

function render() {
  const v = {
    order: viewOrder, history: viewHistory, money: viewMoney, more: viewMore,
    today: viewToday, report: viewReport, items: viewItems, users: viewUsers,
    settings: viewSettings, password: viewPassword,
  }[S.tab];
  (v || viewOrder)();
}

// =========================================================== ১. অর্ডার পেজ
async function viewOrder() {
  shell(`<div class="spin"></div>`);
  const [items, mine] = await Promise.all([api('/api/items'), api('/api/orders/my')]);
  S.items = items;
  S.orderMeta = mine;
  S.boot.status = mine.status ?? S.boot.status;

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

function cartTotal() {
  let t = 0;
  for (const [, l] of S.cart) {
    const it = S.items.find((i) => i.id === l.item_id);
    if (!it) continue;
    const op = it.options.find((o) => o.id === l.option_id);
    t += (it.price + (op ? op.price_delta : 0)) * l.qty;
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
  const cats = [...new Set(S.items.map((i) => i.category))];
  const total = cartTotal();
  const count = [...S.cart.values()].reduce((s, l) => s + l.qty, 0);

  const body = cats.map((cat, ci) => {
    const list = S.items.filter((i) => i.category === cat);
    return `
      <section style="${accent(ci)}">
        <div class="section-title">${esc(cat)}</div>
        <div class="card"><div class="card-b tight">
          ${list.map((it) => itemRow(it, locked)).join('')}
        </div></div>
      </section>`;
  }).join('');

  shell(`
    ${statusBanner()}
    ${locked ? `<div class="banner warn"><span class="ic">🔒</span><div>${esc(S.orderMeta.lock_reason)}</div></div>` : ''}
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
    ${S.orderMeta.order && !locked ? `<button class="btn danger block" data-act="delorder" style="margin-top:10px">আজকের অর্ডার বাতিল করুন</button>` : ''}
  `, { sub: `${niceDate(S.orderMeta.date)} · আপনার অর্ডার` });

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

  let html = `<div class="item ${off ? 'off' : ''} ${lines.length ? 'picked' : ''}">
    <div class="ava">${emojiFor(it.name)}</div>
    <div class="info">
      <div class="nm">${esc(it.name)} ${off ? `<span class="chip warn">আজ নেই</span>` : ''}</div>
      <div class="pr">${tk(it.price)}${hasOpts ? ' থেকে' : ''}${hasOpts ? ` · ${bn(it.options.length)} রকম` : ''}</div>
    </div>`;

  if (hasOpts) {
    html += `<button class="btn sm accent" data-act="pickopt" data-item="${it.id}" ${locked || off ? 'disabled' : ''}>+ যোগ</button>`;
  } else {
    const key = `${it.id}|0`;
    const l = S.cart.get(key);
    html += stepper(key, l ? l.qty : 0, locked || off);
  }
  html += `</div>`;

  // বাছাই করা লাইনগুলো
  for (const [key, l] of lines) {
    const op = it.options.find((o) => o.id === l.option_id);
    html += `<div class="item sub-line picked">
      <div class="info">
        <div class="nm">↳ ${esc(op ? op.name : it.name)}
          <span class="pr">${tk(it.price + (op ? op.price_delta : 0))}</span></div>
        <button class="chip ${l.fallback_type === 'skip' && !l.fallback_note ? '' : 'info'}"
          data-act="fb" data-key="${key}" style="margin-top:4px">
          ⚙ ${esc(fbLabel(l))}
        </button>
      </div>
      ${stepper(key, l.qty, locked)}
    </div>`;
  }
  return html;
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
          <div class="info"><div class="nm">${esc(o.name)}</div>
            <div class="pr">${tk(it.price + o.price_delta)}${o.price_delta ? ` (${o.price_delta > 0 ? '+' : '−'}${tk(Math.abs(o.price_delta))})` : ''}</div></div>
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

async function saveOrder() {
  const lines = [...S.cart.values()];
  const note = $('#ordernote')?.value || '';
  try {
    await api('/api/orders', { method: 'POST', body: { date: S.orderMeta.date, note, lines } });
    S.dirty = false;
    toast(lines.length ? '✅ অর্ডার সেভ হয়েছে' : 'অর্ডার খালি করা হলো', 'ok');
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

  const list = await api('/api/ledger/balances');
  const totalHeld = list.reduce((s, u) => s + u.balance, 0);
  const owing = list.filter((u) => u.balance < 0);
  shell(`
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
  const [data, items] = await Promise.all([api('/api/orders?date=' + date), api('/api/items?all=1')]);
  S.items = items;
  const st = S.boot.status && date === S.boot.today ? S.boot.status : null;
  const orders = data.orders;
  const people = orders.filter((o) => o.status !== 'cancelled').length;
  const amount = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);

  shell(`
    <div class="card"><div class="card-b" style="display:flex;gap:8px;align-items:center">
      <button class="btn sm" data-act="daynav" data-d="-1">←</button>
      <input class="input" type="date" id="daypick" value="${date}" style="flex:1;text-align:center" />
      <button class="btn sm" data-act="daynav" data-d="1">→</button>
    </div></div>

    <div class="section-title">সবাইকে যা জানাবেন</div>
    <div class="card"><div class="card-b">
      ${st ? `<div class="banner ${st.tone}" style="margin-bottom:12px"><span class="ic">${st.icon}</span>
        <div>${esc(st.label)}${st.message ? `<small>${esc(st.message)}</small>` : ''}</div></div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px">
        ${Object.entries(S.boot.status_options).map(([k, v]) =>
          `<button class="btn sm ${st && st.key === k ? 'primary' : ''}" data-act="setstatus" data-s="${k}">${v.icon} ${v.label}</button>`).join('')}
      </div>
      <input class="input" id="statusmsg" placeholder="বাড়তি কথা (যেমন: আজ সিঙ্গারা নেই)" value="${esc(st?.message || '')}" />
      <div class="hint">যেটাতে চাপ দেবেন, সেটাই সবার স্ক্রিনের উপরে দেখাবে।</div>
    </div></div>

    <div class="stats">
      <div class="stat g1"><div class="lbl">অর্ডার দিয়েছেন</div><div class="val">${bn(people)} জন</div></div>
      <div class="stat g2"><div class="lbl">মোট টাকা</div><div class="val">${tk(amount)}</div></div>
      <div class="stat g3"><div class="lbl">মোট আইটেম</div>
        <div class="val">${bn(orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.lines.reduce((x, l) => x + l.qty, 0), 0))}</div></div>
      <div class="stat g5"><div class="lbl">দেওয়া হয়েছে</div>
        <div class="val">${bn(orders.filter((o) => o.status === 'delivered').length)}/${bn(people)}</div></div>
    </div>

    <button class="btn primary block lg" data-act="buylist">🛒 বাজারের লিস্ট দেখুন</button>

    <div class="section-title">আজ কী নেই — চাপ দিয়ে বন্ধ করুন</div>
    <div class="card"><div class="card-b chip-row">
      ${items.filter((i) => i.active).map((i) =>
        `<button class="btn sm ${i.available ? '' : 'danger'}" data-act="avail" data-id="${i.id}" data-v="${i.available ? 0 : 1}">
          ${i.available ? emojiFor(i.name) + ' ' : '🚫 '}${esc(i.name)}</button>`).join('')}
    </div></div>

    <div class="section-title">অর্ডার — ${bn(people)} জন · ${tk(amount)}</div>
    ${orders.length === 0 ? `<div class="empty"><div class="big">🍽️</div>এই দিনে কেউ অর্ডার দেয়নি</div>` :
      orders.map((o) => `
      <div class="card" style="${accent(hashIdx(o.user_name))}">
        <div class="card-h">
          <div class="ava" style="width:38px;height:38px;border-radius:13px;display:grid;place-items:center;
            background:var(--accent-soft);color:var(--accent);font-weight:800">${esc((o.user_name || '?').trim()[0])}</div>
          <div class="grow"><h2>${esc(o.user_name)}</h2>
            <div class="sub" style="font-size:12px;color:var(--muted)">${bn(o.lines.reduce((s, l) => s + l.qty, 0))} টি আইটেম</div></div>
          <b class="amt">${tk(o.total)}</b>
          <select class="input" data-act="ostatus" data-id="${o.id}" style="width:auto;padding:6px 8px;font-size:13px">
            ${Object.entries(OSTATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v.t}</option>`).join('')}
          </select>
        </div>
        <div class="card-b tight">
          ${o.lines.map((l) => `<div class="item">
            <div class="ava">${emojiFor(l.item_name)}</div>
            <div class="info">
              <div class="nm">${esc(l.item_name)}${l.option_name ? ` <span class="chip brand">${esc(l.option_name)}</span>` : ''} × ${bn(l.qty)}</div>
              ${l.fallback_type !== 'skip' || l.fallback_note ? `<div class="pr">⚙ ${esc(fbTextOf(l))}</div>` : ''}
            </div>
            <b class="amt">${tk(l.subtotal)}</b>
          </div>`).join('')}
          ${o.note ? `<div class="item"><div class="info"><div class="pr">📝 ${esc(o.note)}</div></div></div>` : ''}
        </div>
      </div>`).join('')}
    ${orders.length ? `<button class="btn ok block" data-act="deliverall">✅ সবাইকে দিয়ে দিয়েছি</button>` : ''}
  `, { title: 'আজকের অর্ডার', sub: niceDate(date) });

  $('#daypick')?.addEventListener('change', (e) => { S.date = e.target.value; viewToday(); });
}

function fbTextOf(l) {
  const base = l.fallback_type === 'item' ? `না পেলে → ${l.fallback_name}`
    : l.fallback_type === 'anything' ? 'না পেলে যেকোনো কিছু' : 'না পেলে নেব না';
  return l.fallback_note ? `${base} · ${l.fallback_note}` : base;
}

async function buyListSheet() {
  const d = await api('/api/summary?date=' + S.date);
  sheet({
    title: `🛒 বাজারের লিস্ট`,
    body: `
      <div class="banner info" style="margin-bottom:14px"><span class="ic">📅</span>
        <div>${niceDate(d.date)}<small>${bn(d.people)} জনের অর্ডার</small></div></div>
      ${d.groups.length === 0 ? `<div class="empty"><div class="big">🤷</div>কোনো অর্ডার নেই</div>` :
        d.groups.map((g, gi) => `
        <div class="buy-row" style="${accent(gi)}">
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
      ${d.groups.length ? `<div class="buy-total"><span>মোট ${bn(d.total_qty)} টি জিনিস</span><b>${tk(d.total_amount)}</b></div>` : ''}`,
    footer: `<div class="btn-row">
      <button class="btn" data-act="printsheet">🖨️ প্রিন্ট</button>
      <button class="btn primary" data-act="closesheet">বুঝেছি</button>
    </div>`,
  });
}

// =========================================================== ৫. রিপোর্ট
async function viewReport() {
  const to = S.repTo || S.boot.today;
  const from = S.repFrom || addDays(to, -6);
  shell(`<div class="spin"></div>`);
  const d = await api(`/api/report?from=${from}&to=${to}`);
  shell(`
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

    <div class="section-title">কে কত খেল</div>
    <div class="card"><div class="card-b scroll-x">
      <table class="tbl"><thead><tr><th>নাম</th><th class="n">দিন</th><th class="n">টাকা</th></tr></thead><tbody>
        ${d.byUser.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${bn(r.days)}</td><td class="n">${tk(r.amount)}</td></tr>`).join('') || `<tr><td colspan="3" class="center">কিছু নেই</td></tr>`}
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
      <div class="sub">${ROLE_BN[u.role]}</div>
    </div>

    ${isAdmin() ? `<div class="section-title">অ্যাডমিন</div><div class="card"><div class="card-b tight">
      ${row('tab" data-k="items', '🍱', 'আইটেম ও দাম', 'নতুন আইটেম, অপশন, দাম বদলান')}
      ${row('tab" data-k="users', '👥', 'ইউজার ও স্টাফ', 'নতুন তৈরি করুন, রোল বদলান')}
      ${row('tab" data-k="settings', '⚙️', 'সেটিংস', 'অফিস PIN, সময়সীমা, হিসাব মডিউল')}
    </div></div>` : isStaff() ? `<div class="section-title">স্টাফ</div><div class="card"><div class="card-b tight">
      ${row('tab" data-k="users', '👥', 'ইউজার তালিকা', 'কে কে আছেন')}
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

// =========================================================== ৭. আইটেম ম্যানেজ
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
      <div class="section-title" style="margin-left:0">অপশন (যেমন ডিম → ভাজি / পোচ)</div>
      <div id="optlist">${it.options.map(optRow).join('')}</div>
      <button class="btn sm" data-act="addoptrow">+ অপশন যোগ</button>
      <div class="hint">অপশন না দিলে আইটেমটা সরাসরি অর্ডার হবে। দাম বাড়লে/কমলে "+/− টাকা" ঘরে লিখুন (যেমন ওমলেট = +৫)।</div>`,
    footer: `<div class="btn-row">
      ${id ? `<button class="btn danger" data-act="itemdel" data-id="${id}">মুছুন</button>` : ''}
      <button class="btn primary" data-act="itemsave" data-id="${id}">সেভ</button></div>`,
  });
}
function optRow(o = { name: '', price_delta: 0 }) {
  return `<div class="row2 optrow" style="margin-bottom:8px;grid-template-columns:2fr 1fr auto;gap:6px;align-items:center">
    <input class="input o_n" value="${esc(o.name)}" placeholder="যেমন: ভাজি" />
    <input class="input o_d" type="number" step="0.5" value="${o.price_delta}" placeholder="+/− টাকা" />
    <button class="btn sm danger" data-act="rmoptrow">✕</button>
  </div>`;
}

// =========================================================== ৮. ইউজার ম্যানেজ
async function viewUsers() {
  shell(`<div class="spin"></div>`, { title: 'ইউজার', back: 'more' });
  const users = await api('/api/users');
  const groups = [['super_admin', 'সুপার অ্যাডমিন'], ['staff', 'স্টাফ'], ['user', 'ইউজার']];
  shell(`
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
            <div class="sub">যোগ দিয়েছেন ${esc(String(u.created_at).slice(0, 10))}</div></div>
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
      <div class="field"><label>রোল</label>
        <select class="input" id="u_role">
          ${Object.entries(ROLE_BN).map(([k, t]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <div class="hint">স্টাফ = অর্ডার দেখা, বাজারের লিস্ট, টাকার হিসাব, স্ট্যাটাস দেওয়া। সুপার অ্যাডমিন = সবকিছু।</div>
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
      <div class="field"><label>রেজিস্ট্রেশন PIN</label>
        <input class="input" name="register_pin" value="${esc(s.register_pin)}" />
        <div class="hint">নতুন কেউ রেজিস্ট্রেশন করতে এই PIN লাগবে। বদলে দিলে পুরোনো PIN আর কাজ করবে না।</div></div>
      <div class="field"><label>অর্ডারের শেষ সময়</label>
        <input class="input" name="cutoff_time" type="time" value="${esc(s.cutoff_time)}" />
        <div class="hint">স্টাফ যদি দিনের অবস্থা না দেন, তাহলে এই সময়ের পর ইউজার আর অর্ডার বদলাতে পারবে না।</div></div>
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
        office_name: f.get('office_name'), register_pin: f.get('register_pin'),
        cutoff_time: f.get('cutoff_time'), money_module: f.get('money_module') ? 1 : 0,
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

      // স্টাফ — আজ
      case 'daynav': S.date = addDays(S.date, Number(el.dataset.d)); return viewToday();
      case 'gotoday': S.date = el.dataset.d; S.tab = 'today'; return render();
      case 'setstatus': {
        const r = await api('/api/status', { method: 'PUT', body: { date: S.date, status: el.dataset.s, message: $('#statusmsg')?.value || '' } });
        S.boot.status = r.status; S.statusVersion = r.status.version;
        toast('সবাইকে জানানো হয়েছে ✅', 'ok'); return viewToday();
      }
      case 'avail':
        await api(`/api/items/${id}/available`, { method: 'PATCH', body: { available: Number(el.dataset.v) } });
        return viewToday();
      case 'buylist': return buyListSheet();
      case 'printsheet': return window.print();
      case 'deliverall':
        if (!confirm('সবার অর্ডার "দেওয়া হয়েছে" করে দেবেন?')) return;
        await api('/api/orders/deliver-all', { method: 'POST', body: { date: S.date } });
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
            name: r.querySelector('.o_n').value, price_delta: Number(r.querySelector('.o_d').value) || 0,
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
        const body = { name: $('#u_name').value, role: $('#u_role').value };
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
