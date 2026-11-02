"use client";

import { useRoutePath } from "@/lib/use-route-path";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { STRUCTURE_TABS, StructureTabs, structureTabIndex } from "./structure-tabs";
import { useT, type MessageKey } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";

/**
 * Yapı bölümünün başlığı — dört alt sayfanın ortak üst bandı.
 *
 * Başlık, seçili sekmenin adı: dört sayfa da "Yapı" başlığı taşıyıp altına
 * birer açıklama cümlesi yazıyordu ("Kategoriler — rutinin ana başlıkları").
 * Cümleler bandı şişiriyor, hepsi de altındaki menünün zaten söylediği şeyi
 * söylüyordu. Başlığın kendisi hangi sayfada olduğunu söylerse cümleye gerek
 * kalmıyor.
 *
 * Brütalde kategori ve alt kategori sayfaları da bu başlıkla açılır: Yapı →
 * Kategoriler'le aynı yükseklikte, aynı sekmelerle; altındaki konum yolu
 * (bkz. StructureTrail) hep aynı hizada, yalnız yol uzar. Geri karosu yok —
 * yukarı yoldan çıkılır; sağdaki yeşil karo bulunulan yere ekler (+ Kategori,
 * + Alt kategori).
 *
 * Brütalde üst menü şerit — Ana Sayfa, Gün ve Analiz'inki gibi (bkz.
 * AnalysisMenu, WeekStrip): kenardan kenara Yapı sarısı, altında tek kalın
 * siyah çizgi, durum çubuğu da sarı (bkz. statusBarColor). En üstte
 * sekmeler, alt menünün aynası (simge ve ad, seçili olanın simgesi kalkık
 * beyaz kapsülde); altında tek beyaz kart: solda bulunulan yer (konum yolu
 * ya da sekmenin sayısı, bkz. StructureHere), sağda küçük yeşil ekle
 * kapsülü. Yapışkan.
 *
 * Eskiden sekmelerin üstünde 22 px sekmenin adı ve iri yeşil ekle kapsülü
 * vardı: ad seçili sekmenin söylediğini yineliyordu, menü Kategoriler'de
 * 169 px tutuyordu. Ad kalkınca ekle düğmesi bulunulan yerin satırına indi
 * — neye ekleneceği hemen yanında yazıyor.
 */
export function StructureHeader({
  action,
  below,
}: {
  action?: React.ReactNode;
  /** Beyaz kartın solu — konum yolu (bkz. StructureTrail) ya da StructureHere */
  below?: React.ReactNode;
}) {
  const t = useT();
  const pathname = useRoutePath();
  const tab = STRUCTURE_TABS[structureTabIndex(pathname)];
  const brutal = useSkin() === "brutal";
  if (brutal) {
    return (
      <header
        data-yapi-nav=""
        // -mx-4: main'in kenar payını aşıp kenardan kenara (alt menü gibi)
        className="sticky top-0 z-30 -mx-4 border-b-[3px] border-[#111] bg-[#ffd23f] pt-[env(safe-area-inset-top,0px)]"
      >
        {/* Ad görünmüyor (seçili sekme söylüyor), ekran okuyucu için duruyor */}
        <h1 className="sr-only">{t(tab?.key ?? "structure.title")}</h1>
        <StructureTabs />
        {(below || action) && (
          <div className="px-2.5 pb-2.5">
            <div
              data-yapi-here=""
              className="flex items-center overflow-hidden rounded-[12px] border-2 bg-white shadow-[2px_2px_0_#111]"
              style={{ borderColor: "#111" }}
            >
              <div className="min-w-0 flex-1">{below}</div>
              {action && <div className="shrink-0 pr-1.5">{action}</div>}
            </div>
          </div>
        )}
      </header>
    );
  }
  return (
    <PageHeader
      title={t(tab?.key ?? "structure.title")}
      // Brütal: sekmenin şekli (kare = kategori, daire = özellik…) ve bölüm
      icon={tab?.icon}
      iconFill
      overline={t("nav.structure")}
      action={action}
      // Brütal: bölümün kendi bandı (sarı zemin, tram benekleri) — bkz. globals.css
      className="yapi-band"
      nav={
        <>
          <StructureTabs />
          {below}
        </>
      }
    />
  );
}

/**
 * Yapı'daki ekleme düğmesi — dört sayfada tek biçim.
 *
 * Kategoriler sayfasındakinin üstünde yalnız bir "+" vardı, Özellikler'de
 * "Yeni Özellik", Notlar'da "New note" yazıyordu: aynı işi yapan üç ayrı
 * düğme. Artık hepsi "+ <ne eklenecekse>" — basmadan önce ne olacağı belli.
 */
export function StructureAddButton({
  labelKey,
  onClick,
}: {
  labelKey: MessageKey;
  onClick: () => void;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  if (brutal) {
    // Brütal: beyaz kartın sağındaki küçük yeşil kapsül (bkz. StructureHeader)
    // — siyah yuvarlakta artı, yanında ne eklenecek
    return (
      <button
        type="button"
        onClick={onClick}
        data-brut-label=""
        className="flex h-[30px] shrink-0 items-center gap-1 rounded-full border-[1.5px] bg-[#7ae582] pl-[3px] pr-2.5 text-[12.5px] font-black leading-none text-[#111] shadow-[1.5px_1.5px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none"
        style={{ borderColor: "#111" }}
      >
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#111] text-[#7ae582]">
          <Plus className="h-3.5 w-3.5" strokeWidth={3.2} />
        </span>
        <span className="whitespace-nowrap">{t(labelKey)}</span>
      </button>
    );
  }
  return (
    <Button size="sm" onClick={onClick} data-brut-label="" className="gap-1.5">
      <Plus className="h-3.5 w-3.5" />
      {t(labelKey)}
    </Button>
  );
}

/**
 * Beyaz kartın solu, konum yolu olmayan sekmelerde (Özellikler, Nesneler,
 * Notlar) — sekmenin şekli Yapı sarısında, yanında kaç tane olduğu:
 * "● 25 özellik". Sekmenin adı yazmıyor, seçili sekme zaten söylüyor.
 * Kategoriler'deki konum yolunun ilk sayfasıyla aynı biçim.
 */
export function StructureHere({ text }: { text?: string }) {
  const pathname = useRoutePath();
  const tab = STRUCTURE_TABS[structureTabIndex(pathname)];
  return (
    <div className="flex h-10 items-center gap-2 whitespace-nowrap pl-3.5 pr-2 text-[13.5px] font-black leading-none text-[#111]">
      {tab && (
        <tab.icon aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} fill="#ffd23f" />
      )}
      {/* Sayı yüklenene dek boş kalır, satır yüksekliği değişmez */}
      {text && <span className="crumb-in truncate">{text}</span>}
    </div>
  );
}
