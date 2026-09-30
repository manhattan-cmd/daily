import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/security-policy";

/**
 * İki çıktı, tek kod:
 * - Web (Vercel): varsayılan derleme.
 * - Mobil uygulama (Capacitor): `BUILD_TARGET=mobile` ile düz statik dosyalar
 *   (out/). Uygulama sunucu kullanmıyor — veri cihazdaki IndexedDB'de — o
 *   yüzden her sayfa önceden üretilebiliyor. Değişken kimlikler bu yüzden
 *   adresin yolunda değil sorgusunda (bkz. lib/routes).
 *
 * trailingSlash: her sayfa `sayfa/index.html` olarak çıkar; uygulamanın
 * içindeki dosya sunucusu klasör adresini oradan bulur.
 *
 * Güvenlik başlıkları (lib/security-policy) yalnız web production'da: mobil
 * derlemede başlık yok, CSP sayfaya <meta> olarak gömülü (app/layout); dev'de
 * hızlı yenileme eval kullandığı için CSP onu kırardı.
 */
const mobile = process.env.BUILD_TARGET === "mobile";
const production = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = mobile
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
      // Yalnız performans profili için (PROFILE=1): küçültülmüş kodu kaynağa eşler
      productionBrowserSourceMaps: process.env.PROFILE === "1",
    }
  : {
      // "X-Powered-By: Next.js" — sürüm bilgisini ele vermesin
      poweredByHeader: false,
      async headers() {
        if (!production) return [];
        return [{ source: "/:path*", headers: SECURITY_HEADERS }];
      },
    };

export default nextConfig;
