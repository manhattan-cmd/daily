"use client";

import { useRoutePath } from "@/lib/use-route-path";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { STRUCTURE_TABS, StructureTabs } from "./structure-tabs";
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
 */
export function StructureHeader({
  action,
  below,
}: {
  action?: React.ReactNode;
  /** Sekmelerin altında bloğun bir satırı daha (Kategoriler: konum yolu) */
  below?: React.ReactNode;
}) {
  const t = useT();
  const pathname = useRoutePath();
  const tab = STRUCTURE_TABS.find((x) => x.href === pathname);
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
    // Brütal: başlık bloğunun yeşil karosu (bkz. HeaderBlock) — gün
    // sayfasının Ekle karosunun dili: siyah karede artı, altında ne eklenecek
    return (
      <button
        type="button"
        onClick={onClick}
        data-brut-label=""
        className="flex h-full min-w-[84px] flex-col items-center justify-center gap-1.5 bg-[#7ae582] px-2.5 text-[#111] active:brightness-95"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#111] text-[#7ae582]">
          <Plus className="h-5 w-5" strokeWidth={3} />
        </span>
        <span className="whitespace-nowrap text-[12px] font-black leading-none">{t(labelKey)}</span>
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
