const APP_VERSION = "v52";
const STATIC_CACHE = `zehnkampfrechner-static-${APP_VERSION}`;
const RUNTIME_CACHE = `zehnkampfrechner-runtime-${APP_VERSION}`;
const NAVIGATION_TIMEOUT_MS = 2000;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./vendor/chart.umd.min.js",
  "./imgs/analytics.png",
  "./imgs/BHX.jpeg",
  "./imgs/appIcon.png",
  "./imgs/comparison.png",
  "./imgs/comparison_sidebar.png",
  "./imgs/delete_profile.png",
  "./imgs/edit.png",
  "./imgs/Faustregeln.png",
  "./imgs/folder.png",
  "./imgs/import.png",
  "./imgs/new_profile.png",
  "./imgs/profile.png",
  "./imgs/synchronize.png",
  "./imgs/table_icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    }).then(() => self.clients.claim())
  );
});

async function getNavigationFallback(request) {
  return (await caches.match(request)) || caches.match("./index.html");
}

async function networkFirst(request, event) {
  let timeoutId;

  const networkResponsePromise = fetch(request).then(response => {
    if (!response || !response.ok) {
      throw new Error(`Navigation failed with status ${response?.status || "unknown"}.`);
    }
    return response;
  });

  const cacheUpdatePromise = networkResponsePromise.then(async response => {
    const runtimeCache = await caches.open(RUNTIME_CACHE);
    await runtimeCache.put(request, response.clone());
  });

  // Keep the request alive after the cached app has already been displayed.
  event.waitUntil(cacheUpdatePromise.catch(() => undefined));

  const networkResultPromise = networkResponsePromise.then(
    response => ({ type: "network", response }),
    () => ({ type: "error" })
  );
  const timeoutPromise = new Promise(resolve => {
    timeoutId = setTimeout(
      () => resolve({ type: "timeout" }),
      NAVIGATION_TIMEOUT_MS
    );
  });

  const firstResult = await Promise.race([networkResultPromise, timeoutPromise]);
  clearTimeout(timeoutId);

  if (firstResult.type === "network") {
    return firstResult.response;
  }

  const cachedResponse = await getNavigationFallback(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // On a first-ever visit no offline copy exists yet, so keep waiting for the network.
  if (firstResult.type === "timeout") {
    const eventualResult = await networkResultPromise;
    if (eventualResult.type === "network") {
      return eventualResult.response;
    }
  }

  return new Response("Die App ist derzeit weder online noch offline verfügbar.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

async function staleWhileRevalidate(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const staticCache = await caches.open(STATIC_CACHE);
  const cachedResponse =
    (await runtimeCache.match(request)) || (await staticCache.match(request));

  const networkFetch = fetch(request).then(networkResponse => {
    if (networkResponse && request.method === "GET") {
      runtimeCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  return cachedResponse || networkFetch;
}

self.addEventListener("fetch", event => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  const isNavigationRequest = request.mode === "navigate";

  if (isNavigationRequest) {
    event.respondWith(networkFirst(request, event));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
