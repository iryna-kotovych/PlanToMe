// PlanToMe service worker: keeps the app shell available offline.
// The page registers /sw.js?v=<deployment>, so each deployment installs a
// fresh worker, and the old caches are dropped when it activates.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `plantome-${VERSION}`;
const SHELL = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch("/", { cache: "reload" });
      if (!page.ok) throw new Error(`App shell request failed: ${page.status}`);
      const html = await page.clone().text();
      await cache.put("/", page);
      // Also keep the scripts and styles the shell loads, so the first
      // offline launch works.
      const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s<>)]+/g));
      await Promise.all(
        [...SHELL, ...assets].map((url) => cache.add(url).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("plantome-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Live data and update checks always go to the network.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/version.json" ||
    url.pathname === "/sw.js"
  ) {
    return;
  }
  event.respondWith(
    url.pathname.startsWith("/_next/static/")
      ? cacheFirst(request)
      : networkFirst(request),
  );
});

// Build files have content hashes in their names, so a cached copy never goes stale.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// Pages and other files: fresh when online, the last copy when offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) ??
      (request.mode === "navigate" ? await cache.match("/") : undefined);
    if (cached) return cached;
    throw error;
  }
}
