// Routine — service worker. Uygulama tamamen istemci tarafı (IndexedDB) çalıştığı için
// asıl iş "app shell"i (HTML kabuğu + statik varlıklar) önbelleklemek: sunucu çevrimdışıyken
// de uygulama açılsın, veriler zaten cihazda.
const CACHE_VERSION = "v1";
const CACHE_NAME = `routine-${CACHE_VERSION}`;

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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigasyonlar (sayfa yüklemeleri): önce ağ, olmazsa önbellekten aynı sayfa,
  // o da yoksa app shell ("/") — böylece çevrimdışıyken daha önce açılmış bir
  // sayfa görülür, hiç açılmamışsa en azından uygulama kabuğu yüklenir.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ??
            (await caches.match("/")) ??
            Response.error()
        )
    );
    return;
  }

  // Diğer same-origin GET istekleri (statik JS/CSS/font/ikon): stale-while-revalidate —
  // önbellek varsa hemen onu ver, arka planda tazele; yoksa ağdan çekip önbelleğe koy.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});
