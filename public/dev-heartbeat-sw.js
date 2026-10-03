// Casaku dev-heartbeat service worker.
// Registered from /developer after login. Uses Periodic Background Sync
// (Chrome Android with PWA installed) to ping the heartbeat endpoint even
// when the tab is closed / phone screen is off. When phone loses internet
// or battery dies, no ping goes out and the server marks status offline.

const CACHE_KEY = "dev-heartbeat-config-v1";

async function readConfig() {
  const cache = await caches.open(CACHE_KEY);
  const res = await cache.match("config");
  if (!res) return null;
  try { return await res.json(); } catch { return null; }
}

async function writeConfig(cfg) {
  const cache = await caches.open(CACHE_KEY);
  await cache.put("config", new Response(JSON.stringify(cfg), { headers: { "Content-Type": "application/json" } }));
}

async function ping() {
  const cfg = await readConfig();
  if (!cfg?.url) return;
  try {
    await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: "sw", ts: Date.now() }),
      keepalive: true,
    });
  } catch (_) { /* offline, skip */ }
}

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SET_CONFIG" && data.url) {
    event.waitUntil(writeConfig({ url: data.url }).then(() => ping()));
  } else if (data.type === "PING_NOW") {
    event.waitUntil(ping());
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "dev-heartbeat") event.waitUntil(ping());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "dev-heartbeat") event.waitUntil(ping());
});
