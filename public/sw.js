// Routine — service worker. Uygulama tamamen istemci tarafı (IndexedDB) çalıştığı için
// asıl iş "app shell"i (HTML kabuğu + statik varlıklar) önbelleklemek: sunucu çevrimdışıyken
// de uygulama açılsın, veriler zaten cihazda.
//
// Önbellek stratejisi (bayat "eski tasarım" parlamasını önlemek için kritik):
//   • /_next/static → içerik-hash'li, gerçekten değişmez: cache-first.
//     (URL değişince içerik de değişir; bayat sunmak imkânsız.)
//   • /icons → network-first. Adları sabit (icon-512.png): logo değişince aynı
//     adla yenileniyor, cache-first eski logoyu sonsuza dek sunuyordu. Manifest
//     onları içerik özetli ?v= ekiyle istiyor (scripts/make-icons.mjs yazar).
//   • Navigasyon HTML'i, RSC/flight verisi ve diğer her şey → network-first.
//     (Bunları önbellekten "önce" sunmak, yeni sürüm yayınlandıktan sonra eski
//      build'in parçalarını gösterip "sonra kendiliğinden düzelme" yaşatıyordu.)
//   • Stil dosyaları (/_next/static/*.css) da network-first: telefonda yeni
//     sürümün kodu çalışırken Ana Sayfa bandı eski renkte kalmıştı. Küçükler,
//     ağdan almak ucuz; çevrimdışıysa önbellek.
// v3: o bayat önbellek bir kez tamamen silinsin.
// v4: eski logonun önbellekteki ikonları silinsin (Kutu maskotuna geçiş).
const CACHE_VERSION = "v4";
const CACHE_NAME = `routine-${CACHE_VERSION}`;
const APP_SHELL = "/";

// İkonlar burada yok: manifest onları ?v= ekiyle istiyor, ilk istekte önbelleğe girerler
const PRECACHE_URLS = ["/", "/manifest.webmanifest"];

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

  // Stil dosyaları → network-first (bkz. üstteki not)
  if (url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".css")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Değişmez, hash'li varlıklar → cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
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
