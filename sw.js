/* Mifuyu OS service worker — phone push notifications ❄️🦊 */
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));

self.addEventListener("push", e => {
  let d = { title: "❄️ Mifuyu OS", body: "You have a reminder 💗" };
  try { d = Object.assign(d, e.data ? e.data.json() : {}); }
  catch (_) { try { d.body = e.data.text(); } catch (__) {} }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: "Sakura.png",
    badge: "Sakura.png",
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
