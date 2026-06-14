/* Mifuyu OS service worker — phone push notifications + fast/offline caching ❄️🦊 */

/* Bump CACHE whenever you want every device to discard its cached shell (e.g. a big rewrite).
   You don't need to bump it for normal deploys: navigations are network-first and assets are
   stale-while-revalidate, so updates land on their own — this is just the manual reset lever. */
const CACHE = "mifu-os-v1";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest", "./pet-widget/pet-widget.js",
  "./Logo.png", "./AYAYA.png", "./sakura.png", "./snowflake.png", "./fox.png", "./Kiko Sit.png"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // best-effort precache: a single missing file must not abort the whole install
    await Promise.allSettled(CORE.map(u => cache.add(u)));
  })());
});

self.addEventListener("activate", e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));   // drop old versions
  await clients.claim();
})()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                 // never touch writes (Supabase upserts, AI POSTs)
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;        // skip cross-origin: Supabase, fonts, YouTube, AI

  // HTML navigations → network-first so a new deploy is seen immediately; cache is the offline fallback.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Static same-origin assets → stale-while-revalidate: serve instantly from cache, refresh in the
  // background so the next load has the newest version without ever blocking on the network.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

self.addEventListener("push", e => {
  let d = { title: "❄️ Mifuyu OS", body: "You have a reminder 💗" };
  try { d = Object.assign(d, e.data ? e.data.json() : {}); }
  catch (_) { try { d.body = e.data.text(); } catch (__) {} }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: "sakura.png",
    badge: "sakura.png",
    tag: d.tag || undefined,
    data: { url: d.url || "." }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow((e.notification.data && e.notification.data.url) || ".");
  }));
});
