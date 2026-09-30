/**
 * İçerik Güvenlik Politikası (CSP) — web başlığı ve mobil <meta> aynı listeden.
 *
 * Uygulama hiçbir dış sunucuyla konuşmuyor; veri cihazda. Politika bunu
 * garantiye çeviriyor: bir gün bir açık çıksa bile sayfa dışarıya istek
 * atamaz, dışarıdan betik ya da görsel yükleyemez. Somut sebep yedekten geri
 * yükleme: özel hazırlanmış bir yedekteki "renk" değeri (ör. `red),url(…)`)
 * stil üzerinden dış bir adrese istek attırıp cihazın IP'sini sızdırabiliyordu.
 *
 * 'unsafe-inline' (script): Next statik derlemede sayfayı başlatan betikleri
 * satır içi gömüyor; nonce/hash statik çıktıda kurulamıyor. Enjeksiyon yolu
 * zaten yok (HTML doğrudan basılmıyor), bu satır savunmanın ikinci katmanı.
 * 'unsafe-inline' (style): renkler ve animasyonlar satır içi stil.
 *
 * Yeni bir dış kaynak eklenirse (senkron sunucusu, canlı güncelleme servisi)
 * connect-src'ye O adres eklenmeli — yoksa sessizce engellenir.
 */
const directives: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

const join = (d: Record<string, string[]>) =>
  Object.entries(d)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");

/** Mobil uygulama — <meta> ile; frame-ancestors meta'da geçersiz, gömülemez zaten */
export const CSP_META = join(directives);

/** Web — HTTP başlığı; başka sitenin çerçevesine gömülmeyi de yasaklar */
export const CSP_HEADER = join({ ...directives, "frame-ancestors": ["'none'"] });

/** Web'e CSP ile birlikte giden diğer güvenlik başlıkları */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: CSP_HEADER },
  // Eski tarayıcılar frame-ancestors'u bilmiyor
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Başka siteye giden bağlantıda adresin yalnız kökü gider (sorgudaki
  // kimlikler — not/gün/kategori — dışarı sızmaz)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Uygulama bu donanımlara hiç erişmiyor; kapalı kalsınlar
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];
