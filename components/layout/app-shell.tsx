"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  ensureBuiltInDimensions,
  ensureBuiltInCategories,
  seedDefaultFeatures,
  ensureStarterData,
} from "@/lib/db/queries";
import { purgeOldDeletions } from "@/lib/db/deletions";
import { ensurePersistentStorage } from "@/lib/storage-health";
import { useLocale } from "@/lib/i18n";
import { BottomNav } from "./bottom-nav";
import { StatusBar } from "./status-bar";
import { UndoBar } from "./undo-bar";
import { ConfirmHost } from "@/components/ui/confirm";

export function AppShell({ children }: { children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const locale = useLocale();

  // Sunucu her zaman lang="en" basar; etkin dili belgeye yansıt
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Kaydırma document'te değil bu container'da — Next'in sayfa geçişindeki
  // otomatik başa alması burada işlemez, rota değişince kendimiz başa alırız
  // (yoksa yeni sayfa önceki sayfanın kaydırma konumunda, başlığı görünmeden açılır)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

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

  // Service worker yalnızca production'da — dev'de Turbopack'in HMR'ıyla çakışır
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
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
          md:h-[min(844px,calc(100dvh-4rem))] md:w-[390px] md:rounded-[3rem] md:border md:border-white/10
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
