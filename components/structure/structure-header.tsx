"use client";

import { useRoutePath } from "@/lib/use-route-path";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { STRUCTURE_TABS, StructureTabs, structureTabIndex } from "./structure-tabs";
import { useT, type MessageKey } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Yapı bölümünün üst menüsü — bütün Yapı sayfalarının ortak bandı.
 *
 * Brütalde şerit — Ana Sayfa, Takvim, Gün ve Analiz'inki gibi (bkz.
 * AnalysisMenu, WeekStrip): kenardan kenara Yapı sarısı, altında tek kalın
 * siyah çizgi, durum çubuğu da sarı (bkz. statusBarColor). İçinde yalnız
 * sekmeler, alt menünün aynası (simge ve ad, seçili olanın simgesi kalkık
 * beyaz kapsülde); boyu Ana Sayfa'nın ve Takvim'in şeridi kadar. Yapışkan.
 *
 * Sayfanın adı, sayısı, Ara ve Ekle karoları, konum yolu gövdenin
 * tepesindeki sayfa başında (bkz. StructureHead). Eskiden sekmelerin altında
 * şeridin içinde beyaz bir karttı: şerit 117 px tutuyordu, öbür sayfaların
 * şeridinden yarı boy uzundu.
 *
 * Sade temalarda başlık + eylem + sekmeler (bkz. PageHeader).
 */
export function StructureHeader({
  action,
  below,
}: {
  /** Sade temalar: başlığın sağı */
  action?: React.ReactNode;
  /** Sade temalar: sekmelerin altı */
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
        {/* Ad sayfa başında (bkz. StructureHead); şeritte sekmeler */}
        <StructureTabs />
      </header>
    );
  }
  return (
    <PageHeader
      title={t(tab?.key ?? "structure.title")}
      icon={tab?.icon}
      iconFill
      overline={t("nav.structure")}
      action={action}
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
  large = false,
}: {
  labelKey: MessageKey;
  onClick: () => void;
  /** Bir boy büyük — pencerenin başlık satırında (bkz. ModPickDialog) */
  large?: boolean;
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
        className={cn(
          "flex shrink-0 items-center rounded-full bg-[#7ae582] font-black leading-none text-[#111] active:translate-x-px active:translate-y-px active:shadow-none",
          large
            ? "h-[38px] gap-1.5 border-2 pl-1 pr-3.5 text-[14.5px] shadow-[2px_2px_0_#111]"
            : "h-[30px] gap-1 border-[1.5px] pl-[3px] pr-2.5 text-[12.5px] shadow-[1.5px_1.5px_0_#111]"
        )}
        style={{ borderColor: "#111" }}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-[#111] text-[#7ae582]",
            large ? "h-[28px] w-[28px]" : "h-[22px] w-[22px]"
          )}
        >
          <Plus className={large ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={3.2} />
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
