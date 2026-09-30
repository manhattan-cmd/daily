"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ensureBuiltInDimensions,
  ensureBuiltInCategories,
  seedDefaultFeatures,
  ensureStarterData,
} from "@/lib/db/queries";
import { purgeOldDeletions } from "@/lib/db/deletions";
import { ensurePersistentStorage } from "@/lib/storage-health";
import { useLocale } from "@/lib/i18n";
import { applySkin, useSkin } from "@/lib/skin";
import { BottomNav } from "./bottom-nav";
import { StatusBar } from "./status-bar";
import { UndoBar } from "./undo-bar";
import { ConfirmHost } from "@/components/ui/confirm";
import { isNative, listenBackButton } from "@/lib/native";

export function AppShell({ children }: { children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const locale = useLocale();
  const skin = useSkin();

  // Sunucu her zaman lang="en" basar; etkin dili belgeye yansıt
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Görüntü teması — sunucu çıktısında yok, ilk çizimde kök öğeye yazılıyor
  useEffect(() => {
    applySkin(skin);
  }, [skin]);

  useEffect(() => {
    (async () => {
      await ensureBuiltInDimensions();
      // Ölçü havuzu v18'de görünmez oldu (ölçüm özelliğin üzerinde), artık
      // beslenmiyor. Hazır özellikler yalnız bomboş kuruluma ekilir —
      // silinen özellik geri gelmesin diye.
      await seedDefaultFeatures();
      // Yerleşik akışlar (Uyku, Ruh hali): kategorileri, kalemleri ve
      // özellik bağları hepsi burada kuruluyor. Bağlama işi eskiden ayrı bir
      // adımdaydı (`ensureDefaultModifiers`) ve v19'daki Türkçe→İngilizce ad
      // devrinden sonra hiçbir şeyi eşleştiremiyordu — temiz kurulumda Uyku
      // penceresi bomboş açılıyordu.
      await ensureBuiltInCategories();
      // En son: yerleşikler kurulduktan sonra ilk açılış örnekleri
      await ensureStarterData();
      // Süresi dolmuş silme günlüğü satırları (payload'lar yer kaplar)
      await purgeOldDeletions();
      // IndexedDB varsayılan olarak atılabilir bir önbellek — kalıcılık iste
      await ensurePersistentStorage();
    })().catch((err) => console.error("Init error", err));
  }, []);

  // Mobil uygulamada Android geri tuşu: önce açık pencere, sonra sayfa
  useEffect(() => (isNative() ? listenBackButton() : undefined), []);

  // Service worker yalnızca production'da — dev'de Turbopack'in HMR'ıyla çakışır.
  // Mobil uygulamada hiç yok: dosyalar zaten uygulamanın içinde.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (isNative()) return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    // 'load' zaten geçmiş olabilir (effect, mount sonrası tetiklenir) — o zaman hemen kaydet
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return (
    /* Desktop: dış alan */
    <div className="min-h-screen bg-[#050507] md:flex md:items-center md:justify-center md:p-8">
      {/* Telefon çerçevesi */}
      <div
        className="
          relative flex flex-col overflow-hidden bg-background
          /* Mobil: tam ekran */
          h-dvh w-full
          /* Masaüstü: telefon boyutu + çerçeve. Kısa ekranlarda (dizüstü)
             844px pencereyi aşıp alt navigasyonu dışarıda bırakıyordu —
             yüksekliği görünür alana kıstırıyoruz (md:p-8 payı düşülür). */
          md:h-[min(844px,calc(100dvh-4rem))] md:w-[390px] md:rounded-[3rem] md:border md:border-[var(--ln-2)]
          md:shadow-[0_0_0_10px_#111115,0_40px_80px_rgba(0,0,0,0.9)]
        "
      >
        {/* Masaüstünde status bar */}
        <StatusBar />

        {/* İçerik — kaydırılabilir */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
        >
          {children}
        </main>
        <Suspense fallback={null}>
          <ScrollReset target={mainRef} />
        </Suspense>

        {/* Silme sonrası geri alma şeridi — navigasyonun hemen üstünde */}
        <UndoBar />

        {/* Onay katmanı — tek örnek; her yerden confirmDialog() ile çağrılır */}
        <ConfirmHost />

        {/* Bottom nav — flex'in altına yapışık */}
        <BottomNav />
      </div>
    </div>
  );
}

/**
 * Kaydırma document'te değil ana kapta — Next'in sayfa geçişindeki otomatik
 * başa alması orada işlemez, adres değişince kendimiz başa alırız (yoksa yeni
 * sayfa öncekinin kaydırma konumunda, başlığı görünmeden açılır).
 *
 * Sorgu da adresin parçası: gün, not ve kategori sayfaları kimliği sorguda
 * taşıyor (bkz. lib/routes); günden güne geçişte yol aynı kalıyor.
 */
function ScrollReset({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    target.current?.scrollTo({ top: 0 });
  }, [pathname, query, target]);
  return null;
}
