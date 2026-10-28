"use client";

import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { migrateThingAttachments } from "@/lib/db/things";
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
import { applySkin, getSkin, useSkin } from "@/lib/skin";
import { BottomNav } from "./bottom-nav";
import { StatusBar } from "./status-bar";
import { AddedToast } from "./added-toast";
import { UndoBar } from "./undo-bar";
import { ConfirmHost } from "@/components/ui/confirm";
import { isNative, listenBackButton } from "@/lib/native";
import { warmSheetData } from "@/lib/db/live-cache";
import { prefetchPeriod } from "@/components/analytics/period-data";
import { weekPeriod } from "@/lib/period";
import { whenIdle } from "@/lib/db/day-cache";
import { applyStatusBarColor, statusBarColor } from "@/lib/skin-boot";
import { installNavDepth } from "@/lib/nav-depth";

/** Açılış kurulumu — sayfa ömründe bir kez (bkz. AppShell) */
let initOnce: Promise<void> | null = null;

export function AppShell({ children }: { children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const locale = useLocale();
  const skin = useSkin();

  // Sunucu her zaman lang="en" basar; etkin dili belgeye yansıt
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Görüntü teması — açılış betiği ilk çizimden önce yazıyor (lib/skin-boot);
  // burada tema değişince ve geliştirmede: Strict Mode'un yeniden kurulumu
  // <html>'in niteliklerini JSX'tekilere (brutal) sıfırlıyor. Çizimden önce
  // olsun diye layout effect.
  useLayoutEffect(() => {
    applySkin(skin);
    // İlk (hydration) çizim sunucunun teması (Brütal) ile yapılır; gerçek
    // temayla yeniden çizilince gizleme kalkar — yanlış düzen hiç görünmez
    if (skin === getSkin()) delete document.documentElement.dataset.skinPending;
  }, [skin]);

  // Telefonun durum çubuğu: Brütal'de ekranın tepesindekinin rengi (üst
  // menünün beyazı ya da krem döşeme), diğer temalarda temanın zemini (bkz.
  // statusBarColor). Açılışı betik boyuyor; burada sayfa ve tema değişince.
  const pathname = usePathname();
  const barColor = statusBarColor(pathname, skin);
  // "Geri" düğmeleri için uygulama içi adım sayacı (bkz. nav-depth)
  useEffect(() => installNavDepth(), []);
  useEffect(() => {
    const paper =
      getComputedStyle(document.documentElement).getPropertyValue("--background").trim() ||
      "#09090b";
    applyStatusBarColor(barColor ?? paper);
  }, [barColor, skin]);

  useEffect(() => {
    // Tek sefer: geliştirmede Strict Mode etkiyi iki kez çalıştırıyor ve iki
    // kurulum aynı anda koşunca hazır kategoriler ikişer ekleniyordu
    initOnce ??= (async () => {
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
      // Nesnelerin ilk sürümündeki iliştirmeler → Nesne türünde özellik
      await migrateThingAttachments();
      // En son: yerleşikler kurulduktan sonra ilk açılış örnekleri
      await ensureStarterData();
      // Süresi dolmuş silme günlüğü satırları (payload'lar yer kaplar)
      await purgeOldDeletions();
      // IndexedDB varsayılan olarak atılabilir bir önbellek — kalıcılık iste
      await ensurePersistentStorage();
    })().catch((err) => console.error("Init error", err));
  }, []);

  // Açılıştan sonra, boşta: girdi ekleme penceresinin verisi (liste beklemesin,
  // bkz. live-cache) ve bu haftanın analizi (Analiz'e ilk dokunuşta iskelet
  // görünmesin, bkz. period-data)
  useEffect(
    () =>
      whenIdle(() => {
        warmSheetData();
        void prefetchPeriod(weekPeriod(Date.now()));
      }, 1500),
    []
  );

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
        {/* Masaüstünde status bar — telefondakiyle aynı renkte */}
        <StatusBar color={barColor ?? undefined} />

        {/* İçerik — kaydırılabilir. Çubuğun yeri hep ayrılı: Android'de
            özel çubuk (globals.css, 6 px) yer kaplıyor; sayfa kısalıp
            çubuk kaybolunca (Özellikler'de tür süzünce) bütün ekran 6 px
            yana kayıp genişliyordu. */}
        <main
          ref={mainRef}
          data-app-main=""
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-gutter:stable]"
        >
          {children}
        </main>
        <Suspense fallback={null}>
          <ScrollReset target={mainRef} />
        </Suspense>

        {/* Silme sonrası geri alma şeridi — navigasyonun hemen üstünde */}
        <UndoBar />
        {/* Brütal temada "Eklendi" bildirimi */}
        <AddedToast />

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
