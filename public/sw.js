// Routine — service worker. Uygulama tamamen istemci tarafı (IndexedDB) çalıştığı için
// asıl iş "app shell"i (HTML kabuğu + statik varlıklar) önbelleklemek: sunucu çevrimdışıyken
// de uygulama açılsın, veriler zaten cihazda.
//
// Önbellek stratejisi (bayat "eski tasarım" parlamasını önlemek için kritik):
//   • /_next/static ve /icons → içerik-hash'li, gerçekten değişmez: cache-first.
//     (URL değişince içerik de değişir; bayat sunmak imkânsız.)
//   • Navigasyon HTML'i, RSC/flight verisi ve diğer her şey → network-first.
//     (Bunları önbellekten "önce" sunmak, yeni sürüm yayınlandıktan sonra eski
//      build'in parçalarını gösterip "sonra kendiliğinden düzelme" yaşatıyordu.)
const CACHE_VERSION = "v2";
const CACHE_NAME = `routine-${CACHE_VERSION}`;
const APP_SHELL = "/";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Sürüm değişince eski önbellekleri (ör. routine-v1) tamamen sil — birikmiş
  // eski build parçaları böylece temizlenir.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Yanıtı arka planda önbelleğe koy — yönlendirilmiş/opak yanıtları atla, hatayı yut.
function putInCache(request, response) {
  if (!response || response.status !== 200 || response.redirected) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}

// Cache-first: değişmez varlıklar için — varsa hemen önbellekten, yoksa ağdan çek + sakla.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  putInCache(request, response);
  return response;
}

// Network-first: taze içerik şart olan istekler için — ağ başarısızsa önbelleğe düş.
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    putInCache(request, response);
    return response;
  } catch {
    return (await caches.match(request)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Değişmez, hash'li varlıklar → cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigasyonlar (tam sayfa yüklemeleri) → network-first; çevrimdışıysa daha önce
  // açılmış aynı sayfa, o da yoksa app shell ("/") ile en azından uygulama açılsın.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(request, response);
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ??
            (await caches.match(APP_SHELL)) ??
            Response.error()
        )
    );
    return;
  }

  // Kalan her şey (RSC/flight verisi, manifest, vb.) → network-first.
  event.respondWith(networkFirst(request));
});
