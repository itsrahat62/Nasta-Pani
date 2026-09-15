/* খুব হালকা service worker — শুধু অ্যাপ শেল ক্যাশে রাখে, API নয় */
// ফাইল বদলালে এই নামটা বাড়িয়ে দিন — পুরোনো ক্যাশ মুছে নতুন শেল বসে।
// (ভার্সন বাড়ালে ফাইলের সাইজ যদি একই থাকে, তবুও ডিপ্লয় হবে — ওয়ার্কফ্লোতে
//  --ignore-time তুলে দেওয়া হয়েছে, নইলে সমান-সাইজের বদল আপলোড হতো না।)
const CACHE = 'nasta-v3';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // API সবসময় লাইভ
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
