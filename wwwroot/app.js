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
// ষষ্ঠী বিভক্তি — "সেপ্টেম্বর-এর" নয়, "সেপ্টেম্বরের"; "জানুয়ারি-এর" নয়, "জানুয়ারির"
const MONTHS_OF = ['জানুয়ারির','ফেব্রুয়ারির','মার্চের','এপ্রিলের','মে-র','জুনের','জুলাইয়ের','আগস্টের','সেপ্টেম্বরের','অক্টোবরের','নভেম্বরের','ডিসেম্বরের'];
/** "১২ সেপ্টেম্বরের" */
function dateOf(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${bn(d)} ${MONTHS_OF[m - 1]}`;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// ------------------------------------------------------- কোন সময়ের হিসাব দেখব
// মাস ধরে, অমুক তারিখ থেকে আজ পর্যন্ত, অথবা শুরু থেকে সব — ইতিহাস আর টাকার খাতা
// দুটোতেই একই বাছাই চলে, তাই এক জায়গায় রাখা।
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
}
function periodRange() {
  const today = S.boot.today;
  const p = S.period || { mode: 'month', month: today.slice(0, 7) };
  if (p.mode === 'all') return { from: null, to: null, label: 'শুরু থেকে আজ পর্যন্ত সব' };
  if (p.mode === 'since') return { from: p.from, to: today, label: `${shortDate(p.from)} থেকে আজ পর্যন্ত` };
  const [y, m] = p.month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${p.month}-01`,
    // চলতি মাস হলে আজ পর্যন্ত, আগের মাস হলে মাসের শেষ দিন পর্যন্ত
    to: p.month === today.slice(0, 7) ? today : `${p.month}-${String(last).padStart(2, '0')}`,
    label: `${MONTHS[m - 1]} ${bn(y)}`,
  };
}
function periodQS(extra = {}) {
  const r = periodRange();
  const q = new URLSearchParams(extra);
  if (r.from) q.set('from', r.from);
  if (r.to) q.set('to', r.to);
  const s = q.toString();
  return s ? '?' + s : '';
}
/** সময় বাছাইয়ের ছোট কার্ড — মাস আগে-পিছে, "এই মাস", "সব", আর "অমুক তারিখ থেকে আজ পর্যন্ত" */
function periodBar() {
  const today = S.boot.today;
  const cur = today.slice(0, 7);
  const p = S.period || { mode: 'month', month: cur };
  const month = p.mode === 'month' ? p.month : cur;
  const r = periodRange();
  const [y, m] = month.split('-').map(Number);
  return `<div class="card period"><div class="card-b">
    <div class="period-row">
      <button class="btn sm" data-act="period" data-mode="month" data-month="${addMonths(month, -1)}" title="আগের মাস">←</button>
      <button class="btn sm grow ${p.mode === 'month' ? 'primary' : ''}" data-act="period" data-mode="month"
        data-month="${month}">🗓️ ${MONTHS[m - 1]} ${bn(y)}</button>
      <button class="btn sm" data-act="period" data-mode="month" data-month="${addMonths(month, 1)}"
        ${month >= cur ? 'disabled' : ''} title="পরের মাস">→</button>
      <button class="btn sm ${p.mode === 'all' ? 'primary' : ''}" data-act="period" data-mode="all">সব</button>
    </div>
    <label class="period-since ${p.mode === 'since' ? 'on' : ''}">
      <span>এই তারিখ থেকে আজ পর্যন্ত</span>
      <input class="input" type="date" id="psince" max="${today}" value="${p.mode === 'since' ? p.from : ''}" />
    </label>
    <div class="hint" style="margin:6px 0 0">দেখাচ্ছে: <b>${esc(r.label)}</b></div>
  </div></div>`;
}
/** সময় বদলালে যে পাতা বা শিট খোলা আছে সেটাই নতুন করে আঁকা */
function repaintPeriod() {
  if (S.ledgerSheet) return userLedgerSheet(S.ledgerSheet.id, S.ledgerSheet.tab);
  render();
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
  const box = $('#toasts');
  // একই কথা পাশাপাশি দুবার নয়, আর একসাথে দুটোর বেশি জমতেও দেওয়া হয় না —
  // নইলে টোস্ট জমে পর্দার নিচের অংশটাই ঢেকে যায়
  if ([...box.children].some((c) => c.textContent === msg)) return;
  while (box.children.length >= 2) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
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
  announced: new Set(), // যাদের অর্ডারের কথা একবার বলা হয়ে গেছে (এই সেশনে আর বলবে না)
  statusScope: undefined, // statusVersion কোন তলার জন্য গোনা — তলা বদলালে চুপচাপ মিলিয়ে নেয়
};

/** সুপার অ্যাডমিন কোনো তলা বেছে নিলে সেটা কোয়েরিতে জুড়ে দেয় */
const fq = (sep = '&') => (S.floor ? `${sep}floor=${S.floor}` : '');
const floorBn = (f) => (f ? `${bn(f)}য় তলা` : 'সব তলা');
/** হেডারে কোন তলা দেখাচ্ছি সেটা ছোট করে লেখা */
function floorTag() {
  const f = S.boot?.user?.floor ?? S.floor;
  return f ? ` · ${bn(f)}য় তলা` : (isAdmin() ? ' · সব তলা' : '');
}

/**
 * নাম লেখার ঘরে বসানোর জন্য। মোবাইল কিবোর্ড নিজে থেকে "ঠিক" করে দিলে
 * Tareq লিখে Tariq সেভ হয়ে যেত — নামের ঘরে অটো-কারেক্ট চলবে না।
 */
const RAW_TEXT = 'autocorrect="off" spellcheck="false"';

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
  // কারো খাতা আর খোলা নেই — সময় বদলালে এখন মূল পাতাটাই নতুন করে আঁকা হবে
  S.ledgerSheet = null;
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
  S.statusScope = S.floor ?? S.boot.user?.floor ?? null;
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

/**
 * নতুন অর্ডার এলে ঘণ্টায় সংখ্যা বসায়; শুধু নিজের তলারটাই আসে।
 *
 * ঘণ্টার সংখ্যাটা localStorage-এর "কতটুকু দেখা হয়েছে" ধরে গোনা হয়।
 * কিন্তু টোস্টটা কখনোই ওটার উপর ভরসা করে না — কার অর্ডারের কথা একবার বলা
 * হয়ে গেছে সেটা মনে (S.announced) রাখা হয়। নইলে localStorage বন্ধ থাকলে
 * (প্রাইভেট উইন্ডো, সাইট-ডেটা ব্লক করা ফোন) ঘণ্টা খোলার পরেই আবার
 * "অমুকে অর্ডার দিয়েছেন" ভেসে উঠত — বারবার।
 */
async function fetchNotifs({ announce = false } = {}) {
  if (!isStaff()) return;
  try {
    const r = await api(`/api/notifications?date=${S.boot.today}${fq()}`);
    S.notif = r.items || [];
    const seen = getSeen();
    S.notifUnseen = S.notif.filter((x) => String(x.updated_at) > seen).length;

    const fresh = S.notif.filter((x) => !S.announced.has(x.id));
    if (announce && fresh.length) {
      // একসাথে অনেকে দিলে একটা টোস্টেই বলা হয় — পর্দা ভরে যায় না
      toast(fresh.length === 1
        ? `🔔 ${fresh[0].user_name} অর্ডার দিয়েছেন`
        : `🔔 ${bn(fresh.length)} জন নতুন অর্ডার দিয়েছেন`, 'ok');
    }
    // প্রথম বারেও (announce ছাড়া) মনে রাখা হয়, নইলে পরের পোলেই পুরোনোগুলো নতুন মনে হতো
    for (const x of S.notif) S.announced.add(x.id);
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
      // অবস্থাটা কোন তলার, সেটাও হিসাবে রাখতে হয়। অ্যাডমিন তলা বদলালে
      // অন্য তলার version আসে — ওটা "অবস্থা বদলেছে" নয়, তাই চুপচাপ মিলিয়ে নেওয়া হয়।
      const scope = S.floor ?? S.boot.user.floor ?? null;
      const rescoped = S.statusScope !== scope;
      S.statusScope = scope;
      if (v !== S.statusVersion || rescoped) {
        const changed = !rescoped && v !== S.statusVersion;
        S.statusVersion = v;
        S.boot.status = r.status;
        if (changed && r.status) toast(`${r.status.icon} ${r.status.label}`, 'ok');
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
          <input class="input" name="name" autocomplete="name" ${RAW_TEXT}
            placeholder="অফিসে আপনাকে যে নামে ডাকে — যেমন: রাহাত ভাই" required />
          <div class="hint">অফিসে সবাই আপনাকে যে নামে চেনে সেটাই দিন — স্টাফ এই নাম দেখেই নাস্তা বুঝিয়ে দেবেন।</div>
        </div>` : ''}
        <div class="field">
          <label>${t === 'reg' ? 'আপনার PIN' : 'PIN'}</label>
          <input class="input" name="pin" ${t === 'reg' ? 'inputmode="numeric" pattern="[0-9]*" maxlength="6"' : ''}
            autocomplete="username" placeholder="${t === 'reg' ? '১–৬ সংখ্যার নিজের একটা PIN' : 'যেমন: 4800'}" required />
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
        ...(S.boot.money_module ? [{ k: 'money', ic: '📊', t: 'ড্যাশবোর্ড' }] : []),
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
  // বাছা দোকানের মেনু খালি হলে যেটায় জিনিস আছে সেটাই খুলুক — খালি পাতা দেখিয়ে লাভ নেই
  if (!items.some((it) => soldHere(it, S.shopId))) {
    const stocked = shops.find((s) => items.some((it) => soldHere(it, s.id)));
    if (stocked) S.shopId = stocked.id;
  }

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

/** বেছে নেওয়া দোকানে এই জিনিসের দাম। দাম বসানো না থাকলে জিনিসটা ওই দোকানে নেই। */
function priceOf(it) {
  const sp = it.shop_prices || {};
  return S.shopId != null && sp[S.shopId] != null ? Number(sp[S.shopId]) : 0;
}
/** এই দোকানে জিনিসটা পাওয়া যায় কি না — দাম বসানো থাকলেই পাওয়া যায় */
function soldHere(it, shopId = S.shopId) {
  return shopId != null && (it.shop_prices || {})[shopId] != null;
}
/** চালু দোকানগুলো — বন্ধ দোকান দাম বসানোর জায়গায় দেখানোর দরকার নেই */
const liveShops = () => (S.shops || []).filter((s) => s.active);
/** কোন কোন দোকানে পাওয়া যায়, দামসহ — "Hotel Star ৳১০ · Prince ৳১২" */
function shopPriceText(it) {
  const sp = it.shop_prices || {};
  const bits = liveShops().filter((s) => sp[s.id] != null).map((s) => `${s.name} ${tk(sp[s.id])}`);
  return bits.length ? bits.join(' · ') : 'কোনো দোকানে দাম বসানো হয়নি';
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
  const saved = S.orderMeta.order;
  // লক হয়ে গেলে আর কার্টের হিসাব দেখানো ঠিক নয় — সেভ হওয়া অর্ডারের আসল টাকাটাই
  // দেখাতে হবে, নইলে বদলি জিনিসের পর টোটালবার আর হিসাবের অঙ্ক আলাদা দেখাবে।
  const total = locked && saved ? Number(saved.total) : cartTotal();
  const count = locked && saved
    ? saved.lines.reduce((s, l) => s + (l.missing ? l.sub_qty : l.qty), 0)
    : [...S.cart.values()].reduce((s, l) => s + l.qty, 0);

  // এই দোকানে যেগুলোর দাম বসানো নেই, সেগুলো এই দোকানে পাওয়াই যায় না
  const menu = S.items.filter((it) => soldHere(it));
  const cats2 = [...new Set(menu.map((i) => i.category))];

  const shopName = (S.shops || []).find((s) => s.id === S.shopId)?.name || 'এই দোকান';
  // পিসিতে এই মোড়কটাই দুই কলাম হয়ে যায় (CSS-এ) — স্ক্রল কমে, চওড়া ফাঁকা জায়গাও থাকে না
  const body = menu.length === 0
    ? `<div class="empty"><div class="big">🏪</div>
        <b>${esc(shopName)}</b>-এ এখনো কোনো জিনিসের দাম বসানো হয়নি
        <div class="hint" style="margin-top:8px">${isStaff()
          ? 'দোকান ও দাম পাতায় গিয়ে এই দোকানে কী কী পাওয়া যায় আর কত দাম, সেটা বসিয়ে দিন।'
          : 'স্টাফকে বলুন এই দোকানের দামগুলো বসিয়ে দিতে — নইলে অন্য দোকান বেছে নিন।'}</div>
      </div>`
    : `<div class="menu-grid">${cats2.map((cat, ci) => {
    const list = menu.filter((i) => i.category === cat);
    return `
      <section style="${accent(ci)}">
        <div class="section-title">${esc(cat)}</div>
        <div class="card"><div class="card-b tight">
          ${list.map((it) => itemRow(it, locked)).join('')}
        </div></div>
      </section>`;
  }).join('')}</div>`;

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
    ${S.orderMeta.cancelled_order && !S.orderMeta.order ? `<div class="banner muted"><span class="ic">🚫</span><div>
      এই দিনের আগের অর্ডারটা (${tk(S.orderMeta.cancelled_order.total)}) বাতিল করা হয়েছিল
      <small>ইতিহাসে ওটা "বাতিল" হিসেবে থেকে গেছে। চাইলে নিচে থেকে নতুন করে অর্ডার দিন।</small></div></div>` : ''}
    ${acceptBanner()}
    ${subsNotice()}
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
      ${locked ? `<span class="chip">${S.orderMeta.order ? '🔒 জমা হয়েছে' : 'লক করা'}</span>` :
        `<button class="btn primary" data-act="save" ${S.dirty ? '' : 'disabled'}>${S.dirty ? 'সেভ করুন' : 'সেভ করা আছে ✓'}</button>`}
    </div>` : ''}
    ${S.orderFor && S.boot.money_module ? `<button class="btn block" data-act="takecash"
      data-id="${S.orderFor.id}" data-name="${esc(S.orderFor.name)}" style="margin-top:10px">
      💵 হাতে টাকা দিলেন? লিখে রাখুন</button>` : ''}
    <!-- রোজকার অর্ডার সেভ করা আজকের অর্ডার ছোঁয় না, তাই লক থাকলেও এটা চলবে -->
    ${count > 0 ? `<button class="btn block" data-act="usualsave" style="margin-top:10px">⭐ ${S.orderFor ? `${esc(S.orderFor.name)}-এর রোজকার অর্ডার করে রাখুন` : 'এটাই আমার রোজকার অর্ডার করে রাখুন'}</button>` : ''}
    ${S.orderMeta.order && !locked ? `<button class="btn danger block" data-act="delorder" style="margin-top:10px">🚫 এই অর্ডার বাতিল করুন</button>` : ''}
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

/**
 * স্টাফ অর্ডারটা গ্রহণ করেছেন কি না — ইউজারের সবচেয়ে বড় প্রশ্নটার উত্তর।
 * স্টাফ কারো হয়ে অর্ডার করলে এটা দেখানোর দরকার নেই, তিনি নিজেই তো দায়িত্বে।
 */
function acceptBanner() {
  const o = S.orderMeta?.order;
  if (!o || S.orderFor) return '';
  if (o.accepted) {
    const who = S.orderMeta.accepted_by_name;
    const at = o.accepted_at ? bn(String(o.accepted_at).slice(11, 16)) : '';
    return `<div class="banner ok"><span class="ic">✅</span><div>
      আপনার অর্ডার গ্রহণ করা হয়েছে
      <small>${who ? esc(who) + ' নিয়েছেন' : 'স্টাফ নিয়েছেন'}${at ? ` · ${at}` : ''}</small></div></div>`;
  }
  return `<div class="banner warn"><span class="ic">⏳</span><div>
    এখনো গ্রহণ করা হয়নি
    <small>আপনার তলার দায়িত্বে যিনি আছেন, তিনি দেখে নিলেই এখানে ✅ দেখাবে</small></div></div>`;
}

/** যা পাওয়া যায়নি আর বদলে যা আনা হয়েছে — সেই খবরটা উপরেই জানিয়ে দেওয়া */
function subsNotice() {
  const subs = (S.orderMeta?.order?.lines || []).filter((l) => l.missing);
  if (subs.length === 0) return '';
  return `<div class="banner info"><span class="ic">🔁</span><div>
    ${bn(subs.length)} টি জিনিস পাওয়া যায়নি — বদলে অন্য কিছু আনা হয়েছে
    <small>${esc(subs.map(subTextOf).join(' · '))}</small></div></div>`;
}

/** "সিঙ্গারা পাওয়া যায়নি, তাই সমুচা আনা হয়েছে ২ টি · ৳২৪" — এক লাইনে পুরো কথাটা */
function subTextOf(l) {
  const why = l.fallback_type === 'anything' ? 'আপনি বলেছিলেন যেকোনো কিছু'
    : l.fallback_type === 'item' ? `আপনি বলেছিলেন না পেলে ${l.fallback_name}`
    : 'আপনি বলেছিলেন না পেলে নেব না';
  if (!l.sub_name) return `${l.item_name} পাওয়া যায়নি — কিছু আনা হয়নি`;
  const amt = `${bn(l.sub_qty)} টি · ${tk(l.sub_subtotal)}`;
  return `${l.item_name} পাওয়া যায়নি, ${why} — তাই ${l.sub_name} আনা হয়েছে (${amt})${
    l.sub_note ? ` · ${l.sub_note}` : ''}`;
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
  // বদলি হিসেবে শুধু এই দোকানে যা পাওয়া যায় সেগুলোই দেখানো যায়
  const others = S.items.filter((i) => i.id !== l.item_id && soldHere(i));
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
          ${others.map((o) => `<option value="${o.id}" ${o.id === l.fallback_item_id ? 'selected' : ''}>${esc(o.name)} — ${tk(priceOf(o))}</option>`).join('')}
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
    const r = await api('/api/orders', {
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
    // সার্ভার যা আসলে করেছে সেটাই বলা — আগে সব লাইন বাদ পড়লেও "সেভ হয়েছে" দেখাত
    if (r.cancelled) toast('🚫 অর্ডারটা বাতিল করা হলো — ইতিহাসে থেকে যাবে', 'ok');
    else if (r.dropped?.length) toast(`⚠️ সেভ হয়েছে, কিন্তু এগুলো এই দোকানে নেই বলে বাদ গেল: ${r.dropped.join(', ')}`, 'err');
    else if (!silent) toast(`✅ অর্ডার সেভ হয়েছে · ${tk(r.total)}`, 'ok');
    viewOrder();
  } catch (e) {
    // সেভ না হলে কার্টে যা ছিল তা-ই থাকে — কিছু হারায় না, আবার চেষ্টা করা যায়
    toast(e.message, 'err');
  }
}

// =========================================================== ২. ইতিহাস
/** একটা দিনের অর্ডার কার্ড — ইউজারের ইতিহাসে আর স্টাফের "কার কী" শিটে একই চেহারা */
function orderCard(o, oi) {
  const off = o.status === 'cancelled';
  const st = OSTATUS[o.status] || { t: o.status, c: '' };
  return `<div class="card ${off ? 'cancelled' : ''}" style="${accent(oi)}">
    <div class="card-h">
      <div class="grow"><h2>${niceDate(o.order_date)}</h2>
        ${o.shop_name ? `<div class="hint" style="margin:0">🏪 ${esc(o.shop_name)}</div>` : ''}</div>
      ${off ? '' : o.accepted ? `<span class="chip ok" title="স্টাফ গ্রহণ করেছেন">✅ গৃহীত</span>`
        : `<span class="chip warn" title="এখনো গ্রহণ করা হয়নি">⏳</span>`}
      <span class="chip ${st.c}">${off ? '🚫 ' : ''}${st.t}</span>
      <b class="amt">${tk(o.total)}</b>
    </div>
    <div class="card-b tight">
      ${o.lines.map((l) => `<div class="item ${l.missing ? 'gone' : ''}">
        <div class="ava">${l.missing ? '🔁' : emojiFor(l.item_name)}</div>
        <div class="info"><div class="nm">${esc(l.item_name)}${l.option_name ? ` <span class="chip brand">${esc(l.option_name)}</span>` : ''}</div>
          <div class="pr">${l.missing ? esc(subTextOf(l)) : `${tk(l.unit_price)} × ${bn(l.qty)}`}</div></div>
        <b class="amt">${tk(l.missing ? l.sub_subtotal : l.subtotal)}</b>
      </div>`).join('')}
      ${off ? `<div class="item"><div class="info"><div class="pr">এই অর্ডারটা বাতিল করা হয়েছিল — টাকা কাটা হয়নি</div></div></div>` : ''}
    </div>
  </div>`;
}

/** এক সময়ের অর্ডারগুলোর সারাংশ — কত দিন, কত টাকা */
function historySummary(h) {
  const s = h.summary;
  // এক সারিতেই থাকুক — ফোনে টাইল ভেঙে দুই লাইনে গেলে জায়গা নষ্ট
  return `<div class="stats" style="grid-template-columns:repeat(${s.cancelled ? 3 : 2},1fr)">
    <div class="stat g1"><div class="lbl">যত দিন অর্ডার</div><div class="val">${bn(s.days)}</div></div>
    <div class="stat g2"><div class="lbl">মোট</div><div class="val">${tk(s.amount)}</div></div>
    ${s.cancelled ? `<div class="stat g4"><div class="lbl">বাতিল</div><div class="val">${bn(s.cancelled)}</div></div>` : ''}
  </div>`;
}

async function viewHistory() {
  shell(`<div class="spin"></div>`, { title: 'আমার অর্ডার' });
  const r = periodRange();
  const h = await api('/api/orders/history' + periodQS());
  shell(`
    ${periodBar()}
    ${h.orders.length ? historySummary(h) : ''}
    ${h.orders.length === 0
      ? `<div class="empty"><div class="big">🗓️</div>এই সময়ে কোনো অর্ডার নেই
          <div class="hint" style="margin-top:8px">(${esc(r.label)}) — উপরে অন্য মাস বা "সব" বেছে দেখুন।</div></div>`
      : `<div class="menu-grid">${h.orders.map(orderCard).join('')}</div>`}`,
    { title: 'আমার অর্ডার', sub: r.label });
}

// ====================================================== টাকার খাতা (পাসবই)
/** খাতার একটা ঘটনার নাম — "💵 জমা দিলেন", "🍽️ নাস্তা · ১২ সেপ্টেম্বরের" … */
function bookLabel(r) {
  const od = r.order_date ? ` · ${dateOf(r.order_date)}` : '';
  switch (r.kind) {
    case 'deposit': return { ic: '💵', t: 'জমা দিলেন' };
    case 'refund': return { ic: '↩️', t: 'ফেরত নিলেন' };
    case 'adjust': return { ic: '⚖️', t: 'সমন্বয়' };
    case 'charge': return { ic: '🍽️', t: `নাস্তা${od}` };
    case 'pending': return { ic: '⏳', t: `নাস্তা${od} (দেওয়া বাকি)` };
    default: return { ic: '•', t: r.kind };
  }
}
/**
 * সারির নিচের ছোট লেখা। খরচের সারিতে সার্ভার নিজে যে "2026-09-10 তারিখের নাস্তা" নোট
 * বসায়, সেটা উপরের নামেই আছে — দুবার দেখানোর দরকার নেই।
 */
function bookNote(r) {
  if (r.kind === 'charge' && /তারিখের নাস্তা$/.test(r.note || '')) return '';
  return r.note || '';
}

/**
 * পাসবইয়ের মতো খাতা: শুরুতে কত ছিল → প্রতিটা ঘটনা → প্রতিবারের পর কত রইল → শেষে কত।
 * ২০০ জমা দিয়ে রোজ খেলে এখানেই দেখা যায় ২০০ → ১৫৫ → ১১০ → ৫০ কীভাবে নামছে।
 */
function passbook(st, { canDelete = false } = {}) {
  const rows = st.rows || [];
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const body = rows.map((r) => {
    const L = bookLabel(r);
    const amt = Number(r.amount);
    return `<div class="pbrow ${r.pending ? 'pending' : ''}">
      <div class="pb-what">
        <b>${L.ic} ${esc(L.t)}</b>
        <small>${shortDate(r.date)} · ${bn(String(r.at).slice(11, 16))}${bookNote(r) ? ` · ${esc(bookNote(r))}` : ''}</small>
      </div>
      <div class="pb-amt ${amt > 0 ? 'pos' : 'neg'}">${sign(amt)}${tk(Math.abs(amt))}</div>
      <div class="pb-bal ${Number(r.balance) < 0 ? 'neg' : ''}">${tk(r.balance)}</div>
      ${canDelete && r.ledger_id && r.kind !== 'charge'
        ? `<button class="btn sm danger pb-del" data-act="delledger" data-id="${r.ledger_id}" title="এন্ট্রি মুছুন">✕</button>`
        : ''}
    </div>`;
  }).join('');

  return `<div class="card passbook"><div class="card-b tight">
    <div class="pbrow head"><div class="pb-what">কী হলো</div><div class="pb-amt">টাকা</div><div class="pb-bal">জের</div></div>
    <div class="pbrow edge"><div class="pb-what"><b>${st.from ? `${dateOf(st.from)} আগে জমা ছিল` : 'শুরুতে'}</b></div>
      <div class="pb-amt"></div><div class="pb-bal">${tk(st.opening)}</div></div>
    ${body || `<div class="empty" style="padding:22px">এই সময়ে কোনো লেনদেন নেই</div>`}
    <div class="pbrow edge"><div class="pb-what"><b>${st.to && st.to !== S.boot.today ? `${shortDate(st.to)} শেষে` : 'এখন হাতে'}</b></div>
      <div class="pb-amt"></div><div class="pb-bal ${Number(st.closing) < 0 ? 'neg' : ''}">${tk(st.closing)}</div></div>
  </div></div>`;
}

// ======================================================= ৩. ড্যাশবোর্ড (ইউজার)
/**
 * ইউজারের নিজের ড্যাশবোর্ড — দুটো ভাগ:
 *   ভাগ ১: টাকার খাতা — জমা দেওয়া টাকা দিনে দিনে কীভাবে কমছে, এখন কত ফেরত পাবেন
 *   ভাগ ২: এই সময়ে আর শুরু থেকে মোট কত টাকার নাস্তা খেয়েছেন
 */
async function viewDashboard() {
  shell(`<div class="spin"></div>`, { title: 'আমার ড্যাশবোর্ড' });
  const r = periodRange();
  const st = await api('/api/ledger/statement' + periodQS());
  const now = Number(st.now);
  const t = st.totals;
  const ever = st.ever;

  shell(`
    <div class="hero ${now > 0 ? 'green' : now < 0 ? 'red' : 'blue'}">
      <div class="lbl">${now < 0 ? 'আপনার কাছে পাওনা' : 'এখন ফেরত পাবেন'}</div>
      <div class="val">${tk(Math.abs(now))}</div>
      <div class="sub">${now > 0 ? 'এই টাকাটা এখন স্টাফের কাছে জমা আছে'
        : now < 0 ? 'এই টাকাটা স্টাফকে দিতে হবে' : 'সব হিসাব মিটে গেছে'}${
        Number(ever.pending) ? ` · এর মধ্যে ${tk(ever.pending)}-এর নাস্তা এখনো দেওয়া বাকি` : ''}</div>
    </div>

    ${periodBar()}

    <!-- ভাগ ১ — জমা কীভাবে কমছে -->
    <div class="section-title">১· টাকার খাতা — জমা কীভাবে কমছে</div>
    ${passbook(st)}
    <p class="hint">প্রতিটা সারির ডানে <b>জের</b> = ওই ঘটনার পর আপনার কত টাকা জমা রইল।
      ⏳ চিহ্নের নাস্তা এখনো দেওয়া হয়নি, তবু টাকাটা এখন থেকেই বাদ ধরা হয়েছে।</p>

    <!-- ভাগ ২ — মোট কত খরচ -->
    <div class="section-title">২· কত টাকার নাস্তা খেয়েছেন</div>
    <div class="stats">
      <div class="stat g1"><div class="lbl">এই সময়ে নাস্তা</div><div class="val">${tk(t.food)}</div>
        <div class="sub">${bn(t.food_days)} দিন${t.food_days ? ` · দিনে গড়ে ${tk(t.food / t.food_days)}` : ''}</div></div>
      <div class="stat g2"><div class="lbl">এই সময়ে জমা</div><div class="val">${tk(t.deposit)}</div></div>
      ${Number(t.refund) ? `<div class="stat g4"><div class="lbl">ফেরত নিয়েছেন</div><div class="val">${tk(t.refund)}</div></div>` : ''}
    </div>
    <div class="hero" style="margin-top:4px">
      <div class="lbl">শুরু থেকে এ পর্যন্ত মোট নাস্তা</div>
      <div class="val">${tk(ever.food)}</div>
      <div class="sub">${bn(ever.food_days)} দিনের · মোট জমা দিয়েছেন ${tk(ever.deposit)}${
        Number(ever.refund) ? ` · ফেরত নিয়েছেন ${tk(ever.refund)}` : ''}</div>
    </div>`, { title: 'আমার ড্যাশবোর্ড', sub: r.label });
}

// =========================================================== ৩. টাকার হিসাব
async function viewMoney() {
  if (!isStaff()) return viewDashboard();
  shell(`<div class="spin"></div>`);

  const list = await api('/api/ledger/balances?' + (S.floor ? 'floor=' + S.floor : ''));
  // "এখন কত" = লেজার থেকে দেওয়া বাকি অর্ডারের দামও বাদ — টাকার পাতা আর খাতার সাথে হুবহু এক
  const totalHeld = list.reduce((s, u) => s + Number(u.now), 0);
  const owing = list.filter((u) => Number(u.now) < 0);
  shell(`
    ${floorBar()}
    <div class="hero">
      <div class="lbl">সবার মিলিয়ে আপনার হাতে আছে</div>
      <div class="val">${tk(totalHeld)}</div>
      <div class="sub">${bn(list.filter((u) => Number(u.now) !== 0).length)} জনের হিসাব চলছে</div>
    </div>
    ${owing.length ? `<div class="banner warn"><span class="ic">⚠️</span><div>
      ${bn(owing.length)} জনের কাছে টাকা পাওনা<small>${esc(owing.map((u) => u.name).join(', '))}</small></div></div>` : ''}
    <div class="section-title">কার কত জমা — নামে চাপ দিলে পুরো খাতা আর অর্ডার</div>
    <div class="card"><div class="card-b tight">
      ${list.map((u) => `<div class="list-row" data-act="userledger" data-id="${u.id}"
          style="cursor:pointer;${accent(hashIdx(u.name))}">
        <div class="ava">${esc((u.name || '?').trim()[0])}</div>
        <div class="grow">
          <div class="nm">${esc(u.name)}</div>
          <div class="sub">জমা ${tk(u.deposit)} · খরচ ${tk(u.charge)}${
            Number(u.pending) ? ` · দেওয়া বাকি ${tk(u.pending)}` : ''}${Number(u.refund) ? ` · ফেরত ${tk(u.refund)}` : ''}</div>
        </div>
        <b class="amt ${u.now > 0 ? 'pos' : u.now < 0 ? 'neg' : ''}">${tk(u.now)}</b>
        <span class="go">›</span>
      </div>`).join('')}
    </div></div>`, { title: 'টাকার হিসাব', sub: 'জমা / ফেরত' });
}

/**
 * একজনের পুরো হিসাব (স্টাফের জন্য) — জমা/ফেরত লেখা, টাকার খাতা আর সব অর্ডার।
 * ⚠️ ২০০ জমা দিয়ে তিন দিন খেলে "৫০ ফেরত" কোথা থেকে এল, সেটা এখানেই সারি ধরে দেখা যায়।
 */
async function userLedgerSheet(id, tab = 'book') {
  const r = periodRange();
  const [st, hist] = await Promise.all([
    api('/api/ledger/statement' + periodQS({ user_id: id })),
    tab === 'orders' ? api('/api/orders/history' + periodQS({ user_id: id })) : null,
  ]);
  const now = Number(st.now);
  sheet({
    title: `${esc(st.user.name)} <small style="font-weight:600;color:var(--muted)">PIN ${bn(st.user.pin || '—')}</small>`,
    body: `
      <div class="hero ${now > 0 ? 'green' : now < 0 ? 'red' : 'blue'}">
        <div class="lbl">${now < 0 ? 'পাওনা আছে' : 'এখন জমা আছে'}</div>
        <div class="val">${tk(Math.abs(now))}</div>
        ${Number(st.ever.pending) ? `<div class="sub">এর মধ্যে ${tk(st.ever.pending)}-এর নাস্তা এখনো দেওয়া বাকি</div>` : ''}
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
      ${now > 0 ? `<button class="btn dark block" data-act="refundall" data-id="${id}" style="margin-bottom:14px">পুরো ${tk(now)} ফেরত দিয়ে দিলাম</button>` : ''}

      <div class="tabs2" style="margin-bottom:10px">
        <button data-act="ledgertab" data-id="${id}" data-tab="book" class="${tab === 'book' ? 'on' : ''}">💰 টাকার খাতা</button>
        <button data-act="ledgertab" data-id="${id}" data-tab="orders" class="${tab === 'orders' ? 'on' : ''}">🗓️ সব অর্ডার</button>
      </div>
      ${periodBar()}
      ${tab === 'book'
        ? passbook(st, { canDelete: true })
        : hist.orders.length
          ? historySummary(hist) + hist.orders.map(orderCard).join('')
          : `<div class="empty"><div class="big">🗓️</div>এই সময়ে কোনো অর্ডার নেই</div>`}`,
    footer: S.ledgerBack === 'money'
      ? `<button class="btn block" data-act="ledgerback">← আজকের টাকার পাতায় ফিরুন</button>`
      : `<button class="btn primary block" data-act="closesheet">বুঝেছি</button>`,
  });
  // sheet() আগে পুরোনো শিট বন্ধ করে (তাতে এটা মুছে যায়), তাই খোলার পরেই মনে রাখা
  S.ledgerSheet = { id, tab };
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
  const totalQty = orders.reduce(
    (s, o) => s + o.lines.reduce((x, l) => x + (l.missing ? l.sub_qty : l.qty), 0), 0);
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
        <button class="btn sm ${o.accepted ? 'ok' : ''}" data-act="accept" data-id="${o.id}"
          data-v="${o.accepted ? 0 : 1}"
          title="${o.accepted ? 'গ্রহণ করেছেন — চাপ দিলে ফিরিয়ে নেবে' : 'চাপ দিয়ে গ্রহণ করুন'}"
          >${o.accepted ? '✅' : '⏳'}</button>
        <span class="dotmark ${OSTATUS[o.status].c || 'warn'}" title="${OSTATUS[o.status].t}"></span>
      </div>`).join('')}
    </div></div>
    ${orders.some((o) => !o.accepted && o.status !== 'cancelled')
      ? `<button class="btn block" data-act="acceptall">✅ সবার অর্ডার গ্রহণ করলাম</button>` : ''}
    <button class="btn ok block" data-act="deliverall" style="margin-top:8px">✅ সবাইকে দিয়ে দিয়েছি</button>` : ''}
  `, { title: 'আজকের অর্ডার', sub: niceDate(date) });

  $('#daypick')?.addEventListener('change', (e) => { S.date = e.target.value; viewToday(); });
}

/**
 * দোকান ধরে কোন জিনিস কয়টা — দিনের এখনকার আসল ছবি।
 * কোনো জিনিস পাওয়া না গেলে সেটার বদলে যা আনা হয়েছে সেটাই গোনা হয়,
 * নইলে পাশের "টাকা" ঘরের অঙ্কের সাথে মিলত না।
 */
function liveTotals(orders) {
  const shops = new Map();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const key = o.shop_name || 'দোকান বলা হয়নি';
    if (!shops.has(key)) shops.set(key, { shop: key, qty: 0, amount: 0, map: new Map() });
    const sh = shops.get(key);
    for (const l of o.lines) {
      if (l.missing && !Number(l.sub_qty)) continue;   // পাওয়া যায়নি, কিছুই আনা হয়নি
      const name = l.missing ? l.sub_name : l.item_name;
      const option = l.missing ? '' : l.option_name;
      const qty = l.missing ? l.sub_qty : l.qty;
      const amount = Number(l.missing ? l.sub_subtotal : l.subtotal);
      const k = `${name}|${option}`;
      if (!sh.map.has(k)) sh.map.set(k, { name, option, qty: 0 });
      sh.map.get(k).qty += qty;
      sh.qty += qty;
      sh.amount += amount;
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
        ${o.lines.map((l) => `<div class="item ${l.missing ? 'gone' : ''}">
          <div class="ava">${l.missing ? '🔁' : emojiFor(l.item_name)}</div>
          <div class="info">
            <div class="nm">${esc(l.item_name)}${l.option_name ? ` <span class="chip brand">${esc(l.option_name)}</span>` : ''} × ${bn(l.qty)}</div>
            ${l.missing ? `<div class="pr">${esc(subTextOf(l))}</div>`
              : l.fallback_type !== 'skip' || l.fallback_note ? `<div class="pr">⚙ ${esc(fbTextOf(l))}</div>` : ''}
          </div>
          <b class="amt">${tk(l.missing ? l.sub_subtotal : l.subtotal)}</b>
          <!-- ক্লাসের নাম "info" দেওয়া যাবে না — .item .info এর সাথে লেগে বাটনটা চওড়া হয়ে যায় -->
          <button class="btn sm ${l.missing ? 'primary' : ''}" data-act="subline" data-id="${l.id}"
            title="দোকানে পাওয়া যায়নি? বদলি বসিয়ে দিন">🔁</button>
        </div>`).join('')}
        ${o.note ? `<div class="item"><div class="info"><div class="pr">📝 ${esc(o.note)}</div></div></div>` : ''}
      </div></div>
      <div class="field"><label>অবস্থা</label>
        <select class="input" data-act="ostatus" data-id="${o.id}">
          ${Object.entries(OSTATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v.t}</option>`).join('')}
        </select></div>
    </div>`,
    footer: `<div class="btn-row">
      <button class="btn ${o.accepted ? '' : 'ok'}" data-act="accept" data-id="${o.id}"
        data-v="${o.accepted ? 0 : 1}">${o.accepted ? '↩ গ্রহণ ফিরিয়ে নিন' : '✅ গ্রহণ করলাম'}</button>
      <button class="btn" data-act="orderforpick" data-id="${o.user_id}" data-name="${esc(o.user_name)}">✏️ বদলান</button>
      <button class="btn primary" data-act="closesheet">বুঝেছি</button>
    </div>`,
  });
}

function fbTextOf(l) {
  const base = l.fallback_type === 'item' ? `না পেলে → ${l.fallback_name}`
    : l.fallback_type === 'anything' ? 'না পেলে যেকোনো কিছু' : 'না পেলে নেব না';
  return l.fallback_note ? `${base} · ${l.fallback_note}` : base;
}

/**
 * দোকানে জিনিসটা পাওয়া যায়নি — বদলে যা আনা হলো সেটা ওই ব্যক্তির নামেই বসিয়ে দেওয়া।
 * মূল জিনিসের দাম বাদ যায়, বদলিটার দামই তার হিসাবে ওঠে।
 */
function subSheet(lineId) {
  let line = null, ord = null;
  for (const o of S.cache.orders || []) {
    const l = (o.lines || []).find((x) => x.id === lineId);
    if (l) { line = l; ord = o; break; }
  }
  if (!line) return;

  const why = line.fallback_type === 'anything' ? '“না পেলে যেকোনো কিছু”'
    : line.fallback_type === 'item' ? `“না পেলে ${line.fallback_name}”`
    : '“না পেলে নেব না”';
  // অর্ডারটা যে দোকান থেকে, ওই দোকানের দামই ধরা হয়
  const sp = (it) => (it.shop_prices || {})[ord.shop_id];
  const items = S.items.filter((i) => i.active);
  // "না পেলে অমুকটা" বলা থাকলে সেটাই আগে থেকে বাছা থাকুক — একটা ক্লিক কম
  const preId = line.sub_item_id || (line.fallback_type === 'item' ? line.fallback_item_id : null);

  sheet({
    title: `🔁 ${esc(line.item_name)} পাওয়া যায়নি?`,
    body: `
      <div class="banner ${line.fallback_type === 'skip' ? 'warn' : 'info'}"><span class="ic">💬</span><div>
        ${esc(ord.user_name)} বলে রেখেছেন — ${esc(why)}
        <small>${line.fallback_type === 'skip'
          ? 'উনি কিছু নিতে চাননি — তবু কিছু আনলে নিচে বসিয়ে দিন'
          : 'বদলে যা আনলেন নিচে বসিয়ে দিন, দামটা ওর নামেই যাবে'}</small></div></div>
      <div class="field"><label>বদলে কী আনলেন?</label>
        <select class="input" id="sb_item">
          <option value="">— তালিকার বাইরে / কিছুই আনিনি —</option>
          ${items.map((i) => `<option value="${i.id}" data-p="${sp(i) ?? ''}"
            ${preId === i.id ? 'selected' : ''}>${esc(i.name)}${
              sp(i) != null ? ` · ${tk(sp(i))}` : ' · এই দোকানে দাম বসানো নেই'}</option>`).join('')}
        </select></div>
      <div class="field"><label>তালিকায় নেই? নামটা লিখে দিন</label>
        <input class="input" id="sb_other" value="${esc(line.sub_item_id ? '' : line.sub_name || '')}"
          ${RAW_TEXT} placeholder="যেমন: নিমকি" /></div>
      <div class="row2">
        <div class="field"><label>কয়টা</label>
          <input class="input" id="sb_qty" type="number" min="0" max="99"
            value="${line.sub_qty || line.qty}" /></div>
        <div class="field"><label>দাম (একটার)</label>
          <input class="input" id="sb_price" type="number" step="0.5" inputmode="decimal"
            value="${line.sub_unit_price || ''}" placeholder="আইটেম বাছলে নিজেই বসবে" /></div>
      </div>
      <div class="field"><label>বাড়তি কথা (ইচ্ছা হলে)</label>
        <input class="input" id="sb_note" value="${esc(line.sub_note || '')}"
          placeholder="যেমন: সিঙ্গারা শেষ হয়ে গিয়েছিল" /></div>
      <div class="hint">মূল ${esc(line.item_name)}-এর ${tk(line.subtotal)} বাদ যাবে, বদলিটার দামই বসবে।
        কিছুই না আনলে নাম-দাম খালি রাখুন — তখন ০ টাকা ধরা হবে।</div>`,
    footer: `<div class="btn-row">
      ${line.missing ? `<button class="btn" data-act="subclear" data-id="${line.id}">↩ আসলে পাওয়া গেছে</button>` : ''}
      <button class="btn primary" data-act="subsave" data-id="${line.id}">বসিয়ে দিন</button>
    </div>`,
    onOpen: () => {
      // আইটেম বাছলে তার দামটা নিজে থেকেই বসে যাক
      const sel = $('#sb_item'), pr = $('#sb_price');
      sel?.addEventListener('change', () => {
        const p = sel.selectedOptions[0]?.dataset.p;
        pr.value = p ? Number(p) : '';
      });
      if (!pr.value) {
        const p = sel?.selectedOptions[0]?.dataset.p;
        if (p) pr.value = Number(p);
      }
    },
  });
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

  // "৫০ ফেরত" কোথা থেকে এল সেটা এক লাইনেই: আগে জমা ২০০ → আজ দিলেন → আজকের নাস্তা → এখন ৫০
  const chain = (u) => {
    const bits = [];
    if (Number(u.opening)) bits.push(`আগে জমা ${tk(u.opening)}`);
    if (Number(u.paid_today)) bits.push(`আজ দিলেন +${tk(u.paid_today)}`);
    if (Number(u.order_total)) bits.push(`আজ নাস্তা −${tk(u.order_total)}`);
    if (Number(u.returned_today)) bits.push(`আজ ফেরত −${tk(u.returned_today)}`);
    return bits.length ? `${bits.join(' · ')} → এখন ${tk(u.to_return)}` : 'আজ অর্ডার নেই';
  };
  const row = (u, kind) => `<div class="person" data-act="userledger" data-id="${u.id}" data-back="money"
      style="cursor:pointer;${accent(hashIdx(u.name))}" title="চাপ দিলে পুরো খাতা">
    <div class="pin">${bn(u.pin || '—')}</div>
    <div style="flex:1;min-width:0">
      <div class="nm">${esc(u.name)}</div>
      <div class="sub">${chain(u)}</div>
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
                  ${o.lines.map((l) => l.missing
                    // পাওয়া যায়নি — হাতে যাবে বদলি জিনিসটাই, তাই সেটাই বড় করে
                    ? (Number(l.sub_qty) ? `<div class="plate-line">
                        <b>${bn(l.sub_qty)}×</b>
                        <span>🔁 ${esc(l.sub_name)} <span class="chip info">বদলি</span>
                          <s style="opacity:.55">${esc(l.item_name)}</s></span>
                      </div>` : `<div class="plate-line">
                        <b>—</b><span><s style="opacity:.55">${esc(l.item_name)}</s>
                          <span class="chip warn">পাওয়া যায়নি</span></span></div>`)
                    : `<div class="plate-line">
                        <b>${bn(l.qty)}×</b>
                        <span>${emojiFor(l.item_name)} ${esc(l.item_name)}${
                          l.option_name ? ` <span class="chip brand">${esc(l.option_name)}</span>` : ''}</span>
                      </div>`).join('')}
                </div>
                ${o.lines.filter((l) => !l.missing && (l.fallback_type !== 'skip' || l.fallback_note))
                  .map((l) => `<div class="buy-fb">⚙ ${esc(l.item_name)}: ${esc(fbTextOf(l))}</div>`).join('')}
                ${o.note ? `<div class="buy-fb" style="background:var(--gold-soft);color:var(--gold)">📝 ${esc(o.note)}</div>` : ''}
                <div class="buy-sub" style="margin-top:4px">দাম ${tk(o.total)}${
                  S.boot.money_module && Number(o.opening) ? ` · আগে জমা ছিল ${tk(o.opening)}` : ''}${
                  S.boot.money_module && Number(o.paid_today) ? ` · আজ হাতে দিলেন ${tk(o.paid_today)}` : ''}</div>
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
      ${row('tab" data-k="items', '🍱', 'আইটেম ও রকম', 'নতুন আইটেম, রকম, দোকান ধরে দাম')}
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
              <div class="sub">${n ? `${bn(n)} টি জিনিস পাওয়া যায়`
                : '<span style="color:var(--warn)">কিছুই যোগ করা হয়নি — মেনু খালি</span>'}</div>
            </div>
            <span class="go">›</span>
          </div>`;
        }).join('')}
      </div></div>`}
    <p class="hint center">প্রতিটা দোকানের নিজের মেনু — যে জিনিসের দাম বসাবেন, শুধু সেটাই ওই দোকানে দেখাবে।<br>
      একই জিনিসের একেক দোকানে একেক দাম দিতে পারবেন।</p>
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
        <input class="input" id="s_name" value="${esc(s.name)}" ${RAW_TEXT}
          placeholder="যেমন: প্রিন্স হোটেল" /></div>
      ${id ? `<label class="check"><input type="checkbox" id="s_active" ${s.active ? 'checked' : ''} /> দোকানটা চালু আছে</label>
      <button class="btn block" data-act="newitemhere" data-id="${id}" style="margin-bottom:12px">
        + এই দোকানের নতুন আইটেম (দামসহ)</button>
      <div class="section-title" style="margin-left:0">এই দোকানে কী কী পাওয়া যায়</div>
      <div class="chip-row" style="margin-bottom:10px">
        <button class="btn sm" data-act="shopclearall">সব ঘর খালি করুন</button>
        <span class="hint" style="margin:0;align-self:center">যেগুলোর দাম বসাবেন, শুধু সেগুলোই এই দোকানে দেখাবে</span>
      </div>
      <div class="card"><div class="card-b tight">
        ${items.map((it) => {
          const p = it.shop_prices ? it.shop_prices[s.id] : null;
          return `<div class="item ${p == null ? 'off' : ''}">
            <div class="ava">${emojiFor(it.name)}</div>
            <div class="info"><div class="nm">${esc(it.name)}</div>
              <div class="pr">${esc(it.category)}</div>
            </div>
            <input class="input priceinput" data-item="${it.id}" type="number" step="0.5" min="0" inputmode="decimal"
              style="width:104px;text-align:right;padding:9px 11px" value="${p != null ? p : ''}"
              placeholder="নেই" title="দাম বসালে এই দোকানে পাওয়া যাবে; খালি রাখলে নেই" />
          </div>`;
        }).join('')}
      </div></div>
      <div class="hint"><b>দাম বসানো = এই দোকানে পাওয়া যায়।</b> ঘর খালি রাখলে বা ০ দিলে
        এই দোকান বাছলে জিনিসটা মেনুতেই দেখাবে না — ইউজার আর স্টাফ দুজনের কাছেই।</div>`
      : `<div class="hint">দোকানটা সেভ করার পর ঠিক করবেন এখানে কী কী পাওয়া যায় আর কত দাম।
          <b>নতুন দোকান খালি দিয়েই শুরু হয়</b> — যা যা যোগ করবেন, শুধু সেগুলোই দেখাবে।</div>`}`,
    footer: `<div class="btn-row">
      ${id ? `<button class="btn danger" data-act="shopdel" data-id="${id}">মুছুন</button>` : ''}
      <button class="btn primary" data-act="shopsave" data-id="${id}">সেভ</button>
    </div>`,
  });
}

// =========================================================== ৮. আইটেম ম্যানেজ
async function viewItems() {
  shell(`<div class="spin"></div>`, { title: 'আইটেম', back: 'more' });
  const [items, shops] = await Promise.all([api('/api/items?all=1'), api('/api/shops?all=1')]);
  S.items = items;
  S.shops = shops;
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
              <div class="sub">${esc(shopPriceText(i))}${
                i.options.length ? ' · ' + i.options.map((o) => esc(o.name)).join(', ') : ''}</div>
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
      <div class="row2">
        <div class="field"><label>নাম</label>
          <input class="input" id="i_name" value="${esc(it.name)}" ${RAW_TEXT} placeholder="যেমন: সিঙ্গারা" /></div>
        <div class="field"><label>ক্যাটাগরি</label><input class="input" id="i_cat" value="${esc(it.category)}" /></div>
      </div>
      <div class="section-title" style="margin-left:0">কোন দোকানে কত দাম</div>
      <div class="card"><div class="card-b tight">
        ${liveShops().map((s) => {
          const p = it.shop_prices ? it.shop_prices[s.id] : null;
          return `<div class="item ${p == null ? 'off' : ''}">
            <div class="ava">🏪</div>
            <div class="info"><div class="nm">${esc(s.name)}</div></div>
            <input class="input shopprice" data-shop="${s.id}" type="number" step="0.5" min="0" inputmode="decimal"
              style="width:104px;text-align:right;padding:9px 11px" value="${p != null ? p : ''}"
              placeholder="নেই" title="দাম বসালে এই দোকানে পাওয়া যাবে" />
          </div>`;
        }).join('')}
        ${liveShops().length === 0
          ? `<div class="empty">আগে একটা দোকান যোগ করুন</div>` : ''}
      </div></div>
      <div class="hint" style="margin-bottom:12px">যে দোকানে দাম বসাবেন, শুধু ওই দোকানেই জিনিসটা দেখাবে।
        ঘর খালি রাখলে ওই দোকানে নেই।</div>
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
    <p class="hint center">এক নামে দুজন থাকতে পারেন — চেনার জন্য <b>PIN</b> আলাদা, দুজনের কখনো এক হবে না।<br>
      নতুন কেউ নিজে থেকেও রেজিস্ট্রেশন করতে পারবেন (সেটিংস থেকে বন্ধ করা যায়)।</p>`,
    { title: 'ইউজার ও স্টাফ', back: 'more' });
  S.cache.users = users;
}

function userEditSheet(id) {
  const u = id ? S.cache.users.find((x) => x.id === id) : { name: '', role: 'user', active: 1 };
  sheet({
    title: id ? esc(u.name) : 'নতুন ইউজার',
    body: `
      <div class="field"><label>নাম</label>
        <input class="input" id="u_name" value="${esc(u.name)}" ${RAW_TEXT} autocomplete="off" />
        <div class="hint">যা লিখবেন হুবহু তাই সেভ হবে। এক নামে দুজন থাকতে পারেন — PIN আলাদা হলেই হলো।</div></div>
      <div class="row2">
        <div class="field"><label>PIN</label>
          <input class="input" id="u_pin" inputmode="numeric" maxlength="6" value="${esc(u.pin || '')}"
            placeholder="১–৬ সংখ্যা" /></div>
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
        <input type="checkbox" id="u_active" ${u.active ? 'checked' : ''} /> অ্যাকাউন্ট চালু</label>
      <div class="hint" style="margin-top:-6px">টিক তুলে দিলে অ্যাকাউন্ট <b>বন্ধ</b> — উনি আর ঢুকতে পারবেন না,
        কিন্তু তাঁর পুরোনো অর্ডার আর টাকার হিসাব সব থেকে যাবে। সাময়িকভাবে বন্ধ রাখতে এটাই ভালো।</div>` : ''}`,
    footer: `<div class="btn-row">
      ${id && id !== S.boot.user.id
        ? `<button class="btn danger" data-act="userdel" data-id="${id}"
            data-name="${esc(u.name)}">🗑️ মুছুন</button>` : ''}
      <button class="btn primary" data-act="usersave" data-id="${id}">সেভ</button>
    </div>`,
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
        if (!confirm('এই অর্ডারটা বাতিল করবেন?\n\nমুছে যাবে না — ইতিহাসে "বাতিল" হিসেবে থেকে যাবে, আর টাকা কাটা হবে না।')) return;
        await api('/api/orders/' + S.orderMeta.order.id, { method: 'DELETE' });
        toast('🚫 বাতিল হয়েছে — ইতিহাসে থেকে যাবে', 'ok'); return viewOrder();

      // সময় বাছাই — ইতিহাস আর টাকার খাতা
      case 'period':
        S.period = el.dataset.mode === 'all' ? { mode: 'all' } : { mode: 'month', month: el.dataset.month };
        return repaintPeriod();
      case 'ledgertab': return userLedgerSheet(id, el.dataset.tab);
      case 'ledgerback': S.ledgerBack = null; return moneyTodaySheet();

      // দোকান
      case 'setshop': {
        S.shopId = id; S.dirty = true;
        // নতুন দোকানে যা নেই সেগুলো কার্টে লুকিয়ে থাকলে মেনুতে দেখা যেত না, অথচ সেভের
        // সময় বাদ পড়ত — তাই এখনই সরিয়ে দিয়ে সোজাসুজি জানিয়ে দেওয়া
        const gone = [];
        for (const [key, l] of S.cart) {
          const it = S.items.find((i) => i.id === l.item_id);
          if (!it || !soldHere(it)) { gone.push(it ? it.name : 'একটা আইটেম'); S.cart.delete(key); }
        }
        const shop = S.shops.find((s) => s.id === id);
        if (gone.length) toast(`${shop?.name || 'এই দোকানে'} নেই, তাই কার্ট থেকে বাদ গেল: ${[...new Set(gone)].join(', ')}`, 'err');
        return paintOrder();
      }
      case 'shopedit': return shopEditSheet(id);
      case 'newitemhere': {
        // দোকানের ভেতর থেকেই নতুন জিনিস — নাম, দাম, ক্যাটাগরি দিলেই হয়ে যায়
        const shop = S.shops.find((x) => x.id === id);
        const cats = [...new Set(S.items.map((i) => i.category))];
        sheet({
          title: `+ ${esc(shop?.name || 'দোকান')}-এর নতুন আইটেম`,
          body: `
            <div class="field"><label>নাম</label>
              <input class="input" id="ni_name" ${RAW_TEXT} placeholder="যেমন: বুটের ডাল" /></div>
            <div class="row2">
              <div class="field"><label>এই দোকানে দাম (৳)</label>
                <input class="input" id="ni_price" type="number" step="0.5" inputmode="decimal" placeholder="২০" /></div>
              <div class="field"><label>ক্যাটাগরি</label>
                <input class="input" id="ni_cat" list="catlist" value="${esc(cats[0] || 'নাস্তা')}" />
                <datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
            </div>
            <div class="hint">দামটা শুধু <b>${esc(shop?.name || 'এই দোকান')}</b>-এর জন্য বসবে।
              অন্য দোকানেও জিনিসটা পাওয়া গেলে সেখানে গিয়ে আলাদা দাম বসিয়ে দিন —
              না বসালে ওই দোকানে জিনিসটা দেখাবে না।</div>`,
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
        await api('/api/items', {
          method: 'POST',
          body: {
            name,
            category: $('#ni_cat').value.trim() || 'নাস্তা',
            shop_prices: [{ shop_id: id, price }],
          },
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
          // দাম বসানো = এই দোকানে আছে; ঘর খালি = নেই
          const prices = [...document.querySelectorAll('.priceinput')].map((p) => ({
            item_id: Number(p.dataset.item),
            price: p.value === '' ? null : Number(p.value),
          }));
          await api(`/api/shops/${id}/prices`, { method: 'PUT', body: { prices } });
        }
        toast('✅ সেভ হয়েছে', 'ok'); closeSheet();
        if (!id && r.id) { await viewShops(); return shopEditSheet(r.id); }
        return viewShops();
      }
      case 'shopclearall':
        // এক চাপে সব ঘর খালি — তারপর যেগুলো এই দোকানে আছে সেগুলোই বসাবেন
        document.querySelectorAll('.priceinput').forEach((p) => {
          p.value = '';
          p.closest('.item')?.classList.add('off');
        });
        return toast('সব ঘর খালি করা হলো — এখন যেগুলো আছে সেগুলোর দাম বসান', 'ok');
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
                    <div class="nm">${esc(n.user_name)} ${String(n.updated_at) > seen ? '<span class="chip brand">নতুন</span>' : ''}${
                      n.accepted_at || n.status === 'purchased' || n.status === 'delivered'
                        ? ' <span class="chip ok">✅ গৃহীত</span>' : ' <span class="chip warn">⏳</span>'}</div>
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
      // স্টাফ অর্ডারটা গ্রহণ করলেন — ইউজার সাথে সাথেই দেখতে পাবেন
      case 'accept': {
        e.stopPropagation();
        const on = Number(el.dataset.v) === 1;
        await api(`/api/orders/${id}/accept`, { method: 'PATCH', body: { accepted: on } });
        toast(on ? '✅ গ্রহণ করা হলো' : '↩ গ্রহণ ফিরিয়ে নেওয়া হলো', 'ok');
        closeSheet();
        return viewToday();
      }
      case 'acceptall': {
        const left = (S.cache.orders || []).filter((o) => !o.accepted && o.status !== 'cancelled');
        if (!left.length) return toast('সব অর্ডারই গ্রহণ করা আছে', 'ok');
        if (!confirm(`${bn(left.length)} টি অর্ডার গ্রহণ করে নেবেন?`)) return;
        for (const o of left) await api(`/api/orders/${o.id}/accept`, { method: 'PATCH', body: { accepted: true } });
        toast(`✅ ${bn(left.length)} টি অর্ডার গ্রহণ করা হলো`, 'ok');
        return viewToday();
      }

      // পাওয়া যায়নি → বদলি
      case 'subline': e.stopPropagation(); return subSheet(id);
      case 'subsave': {
        const itemId = Number($('#sb_item')?.value) || null;
        const other = ($('#sb_other')?.value || '').trim();
        const priceRaw = $('#sb_price')?.value ?? '';
        if (!itemId && other && priceRaw === '') return toast('বদলি জিনিসটার দাম দিন', 'err');
        await api(`/api/order-lines/${id}/substitute`, {
          method: 'PATCH',
          body: {
            missing: true,
            item_id: itemId,
            name: itemId ? null : (other || null),
            qty: Number($('#sb_qty')?.value) || 0,
            unit_price: priceRaw === '' ? null : Number(priceRaw),
            note: $('#sb_note')?.value || '',
          },
        });
        toast('🔁 বসিয়ে দেওয়া হলো', 'ok');
        closeSheet(); return viewToday();
      }
      case 'subclear': {
        await api(`/api/order-lines/${id}/substitute`, { method: 'PATCH', body: { missing: false } });
        toast('↩ আগের মতোই করা হলো', 'ok');
        closeSheet(); return viewToday();
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
      case 'userledger':
        // টাকার পাতা থেকে এলে সেখানেই ফেরার বোতাম থাকবে
        S.ledgerBack = el.dataset.back || null;
        return userLedgerSheet(id);
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
        const open = S.ledgerSheet;
        await api('/api/ledger/' + id, { method: 'DELETE' });
        toast('মোছা হয়েছে', 'ok');
        // যার খাতা খোলা ছিল তারটাই আবার খুলুক — তালিকায় ফেরত গিয়ে খুঁজতে না হয়
        if (open) return userLedgerSheet(open.id, open.tab);
        closeSheet(); return viewMoney();
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
          name: $('#i_name').value,
          category: $('#i_cat').value || 'নাস্তা',
          available: $('#i_avail').checked ? 1 : 0, active: $('#i_active').checked ? 1 : 0,
          options: [...document.querySelectorAll('.optrow')].map((r) => ({
            name: r.querySelector('.o_n').value,
            price_delta: Number(r.querySelector('.o_d').value) || 0,
            is_default: r.querySelector('.o_def').checked ? 1 : 0,
          })).filter((o) => o.name.trim()),
          // দাম দোকান ধরে — যে ঘর খালি, ওই দোকানে জিনিসটা নেই
          shop_prices: [...document.querySelectorAll('.shopprice')].map((p) => ({
            shop_id: Number(p.dataset.shop),
            price: p.value === '' ? null : Number(p.value),
          })),
        };
        if (!body.name.trim()) return toast('আইটেমের নাম দিন', 'err');
        if (!body.shop_prices.some((p) => p.price > 0))
          return toast('অন্তত একটা দোকানে দাম বসান — নইলে কোথাও দেখাবে না', 'err');
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
      case 'userdel': {
        const nm = el.dataset.name || 'ইউজার';
        // মোছা মানে একেবারে মোছা — তাই দুবার জিজ্ঞেস করা হয়
        if (!confirm(`${nm}-কে একেবারে মুছে ফেলবেন?\n\n` +
          `তাঁর সব অর্ডার আর টাকার হিসাবও মুছে যাবে — পুরোনো রিপোর্টেও আর থাকবে না। ` +
          `এটা আর ফেরানো যাবে না।\n\nশুধু ঢোকা বন্ধ করতে চাইলে "মুছুন" নয় — ` +
          `"অ্যাকাউন্ট চালু"-র টিক তুলে দিন।`)) return;
        if (!confirm(`শেষবার — ${nm} ও তাঁর সব হিসাব মুছে যাবে। নিশ্চিত?`)) return;
        await api('/api/users/' + id, { method: 'DELETE' });
        toast(`🗑️ ${nm} মুছে ফেলা হলো`, 'ok');
        closeSheet(); return viewUsers();
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
  // "এই তারিখ থেকে আজ পর্যন্ত" — তারিখ বাছলেই সেই সময়ের হিসাব
  if (e.target.id === 'psince') {
    const v = e.target.value;
    if (!v) return;
    S.period = v > S.boot.today ? { mode: 'month', month: S.boot.today.slice(0, 7) } : { mode: 'since', from: v };
    return repaintPeriod();
  }
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
