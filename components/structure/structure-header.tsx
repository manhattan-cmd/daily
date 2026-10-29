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
 * siyah çizgi, durum çubuğu da sarı (bkz. statusBarColor). Üstte solda
 * sekmenin adı, sağda yeşil ekle kapsülü; altında sekmeler alt menünün
 * aynası (simge ve ad, seçili olanın simgesi kalkık beyaz kapsülde); en
 * altta konum yolu tek beyaz kartta. Yapışkan. Önceki hali ortak çizgili
 * kalın bir bloktu: simge karosu, YAPI etiketi, hücre hücre sekmeler.
 */
export function StructureHeader({
  action,
  below,
}: {
  action?: React.ReactNode;
  /** Sekmelerin altında bloğun son satırı — konum yolu (bkz. StructureTrail) */
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
        <div className="flex min-h-[50px] items-center gap-3 pl-4 pr-3 pt-2">
          <h1 className="min-w-0 flex-1 truncate text-[22px] font-black leading-none tracking-[-0.02em] text-[#111]">
            {t(tab?.key ?? "structure.title")}
          </h1>
          {action}
        </div>
        <StructureTabs />
        {below && (
          <div className="px-2.5 pb-2.5">
            <div className="overflow-hidden rounded-[12px] border-2 bg-white shadow-[2px_2px_0_#111]" style={{ borderColor: "#111" }}>
              {below}
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
    // Brütal: şeridin sağındaki yeşil kapsül (bkz. StructureHeader) —
    // siyah yuvarlakta artı, yanında ne eklenecek
    return (
      <button
        type="button"
        onClick={onClick}
        data-brut-label=""
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 bg-[#7ae582] pl-1.5 pr-3.5 text-[13px] font-black leading-none text-[#111] shadow-[2px_2px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none"
        style={{ borderColor: "#111" }}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111] text-[#7ae582]">
          <Plus className="h-4 w-4" strokeWidth={3} />
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
