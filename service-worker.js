const APP_VERSION = "v12";
const STATIC_CACHE = `zehnkampfrechner-static-${APP_VERSION}`;
const RUNTIME_CACHE = `zehnkampfrechner-runtime-${APP_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./imgs/appIcon.png",
  "./imgs/comparison.png",
  "./imgs/delete_profile.png",
  "./imgs/edit.png",
  "./imgs/Faustregeln.png",
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

async function networkFirst(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && request.method === "GET") {
      runtimeCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return caches.match("./index.html");
  }
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
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
