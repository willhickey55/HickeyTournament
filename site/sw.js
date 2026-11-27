/* Keeps the scoring pages working with no signal (Will, Oct 27).
   / and /history are saved on the phone the first time they load. After that:
   - with signal, the phone always gets the newest page from Vercel (and the saved copy is updated);
   - with no signal (or one bar that never answers), the saved copy opens instead of "no internet",
     so a reload or a restarted phone on the course goes straight back to the scorecard.
   Firebase's own code and the fonts are kept too, so the page can start without signal.
   Score data is NOT handled here: Firebase saves scores on the phone and sends them itself.
   Nothing here talks to Firestore, so it adds no reads. */
const CACHE = 'hickey-v1';
const PAGES = ['/', '/history'];
const WAIT_MS = 4000; // with signal this slow, open the saved page and update it in the background

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// The first visit loads before this worker is running, so the page tells it what to keep: its own address plus
// the Firebase code and fonts it just downloaded (they come from the browser's cache, so it's no extra download).
self.addEventListener('message', e => {
  const urls = (e.data && e.data.keep) || [];
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const raw of urls) {
      try {
        const u = new URL(raw, self.location.origin);
        const key = u.origin === self.location.origin ? (u.pathname.replace(/\/+$/, '') || '/') : u.href;
        if (u.origin === self.location.origin && !PAGES.includes(key)) continue;
        if (await cache.match(key)) continue;
        const res = await fetch(u.href, u.origin === self.location.origin ? {} : { mode: 'cors' });
        if (res.ok) await cache.put(key, res);
      } catch (_) { /* try again next visit */ }
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (req.mode === 'navigate' && u.origin === self.location.origin) {
    const key = u.pathname.replace(/\/+$/, '') || '/';
    if (PAGES.includes(key)) e.respondWith(page(req, key));
    return;
  }
  // Firebase's code (exact version in the URL, never changes) and Google Fonts
  if ((u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/'))
    || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(keep(req));
  }
});

/** Newest page when there's signal; the saved copy when there isn't. */
async function page(req, key) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(res => { if (res.ok) cache.put(key, res.clone()); return res; });
  const saved = await cache.match(key);
  if (!saved) return net; // first visit: nothing saved yet
  return Promise.race([
    net.catch(() => saved),
    new Promise(r => setTimeout(() => r(saved), WAIT_MS)),
  ]);
}

/** Saved copy first; fetch and save it the first time. */
async function keep(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
