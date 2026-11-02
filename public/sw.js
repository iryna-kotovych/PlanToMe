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
// On a network that connects but never answers, pages fall back to the saved
// copy after this long.
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch("/", { cache: "reload" });
      // Redirected means signed out: that is the sign-in page, not the app.
      // Browsers refuse redirected responses for pages, so never keep one.
      if (!page.ok || page.redirected) {
        throw new Error(`App shell request failed: ${page.status}`);
      }
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
  // Live data, sign-in and update checks always go to the network.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
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

// Pages and other files: fresh when online, the last copy when offline or
// when a page takes too long.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fromNetwork = fetch(request).then(async (response) => {
    if (response.ok && !response.redirected) {
      await cache.put(request, response.clone());
    }
    return response;
  });
  // A late failure after the saved copy was served is expected, not an error.
  fromNetwork.catch(() => {});
  try {
    return request.mode === "navigate"
      ? await Promise.race([fromNetwork, rejectAfter(PAGE_TIMEOUT_MS)])
      : await fromNetwork;
  } catch {
    const saved = await savedCopy(cache, request);
    // Nothing saved yet: keep waiting for a slow network rather than fail.
    return saved ?? fromNetwork;
  }
}

async function savedCopy(cache, request) {
  const exact = await cache.match(request);
  if (exact) return exact;
  // The app shell also stands in for "/" with a query string. Other pages,
  // such as sign-in, don't fall back to it: the app would just send the
  // visitor back to sign-in, over and over.
  const isHome = new URL(request.url).pathname === "/";
  return request.mode === "navigate" && isHome ? cache.match("/") : undefined;
}

function rejectAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Timed out")), ms);
  });
}
