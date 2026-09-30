import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Mobil uygulama (Capacitor) ayarları.
 *
 * Uygulama kendi dosyalarını İÇİNDE taşıyor (webDir: out — `npm run
 * build:mobile` üretir); Vercel adresini açmıyor. Sebep ölçümde çıktı: web
 * sürümünde her sayfa geçişi internetin cevabını bekliyordu, mobil ağda
 * geçiş başına 200–350 ms. Gömülü dosyalar diskten anında geliyor, internet
 * olmadan da açılıyor. Veri zaten cihazdaki IndexedDB'de.
 *
 * appId Play Store'daki kalıcı kimlik — ilk yüklemeden sonra değişmez.
 */
const config: CapacitorConfig = {
  appId: "app.routine.lifelog",
  appName: "Routine",
  webDir: "out",
  backgroundColor: "#09090b",
  android: {
    // Açılışta beyaz parlama olmasın — uygulamanın koyu zemini
    backgroundColor: "#09090b",
  },
};

export default config;
