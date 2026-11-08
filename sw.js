const CACHE = 'nest-9';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Zuerst aus dem Netz (damit Updates ankommen), bei fehlendem oder langsamem Netz aus dem Speicher.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const cached = () => caches.match(e.request, { ignoreSearch: true });
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(async () => { const hit = await cached(); if (hit) finish(hit); }, 2500);
    fetch(e.request.url, { cache: 'no-cache' }).then((res) => {
      clearTimeout(timer);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      finish(res);
    }).catch(async () => {
      clearTimeout(timer);
      finish((await cached()) || Response.error());
    });
  }));
});
