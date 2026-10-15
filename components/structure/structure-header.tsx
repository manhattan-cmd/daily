"use client";

import { useRoutePath } from "@/lib/use-route-path";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { STRUCTURE_TABS, StructureTabs } from "./structure-tabs";
import { useT, type MessageKey } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";

/**
 * Yapı bölümünün başlığı — dört alt sayfanın ortak üst bandı.
 *
 * Başlık, seçili sekmenin adı: dört sayfa da "Yapı" başlığı taşıyıp altına
 * birer açıklama cümlesi yazıyordu ("Kategoriler — rutinin ana başlıkları").
 * Cümleler bandı şişiriyor, hepsi de altındaki menünün zaten söylediği şeyi
 * söylüyordu. Başlığın kendisi hangi sayfada olduğunu söylerse cümleye gerek
 * kalmıyor.
 */
export function StructureHeader({ action }: { action?: React.ReactNode }) {
  const t = useT();
  const pathname = useRoutePath();
  const tab = STRUCTURE_TABS.find((x) => x.href === pathname);
  return (
    <PageHeader
      title={t(tab?.key ?? "structure.title")}
      action={action}
      // Brütal: bölümün kendi bandı (sarı zemin, tram benekleri) — bkz. globals.css
      className="yapi-band"
      nav={<StructureTabs />}
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
    // Brütal: alt kategori sayfasındaki ekleme düğmesinin dili — yeşil,
    // çerçeveli, gölgeli; başlığın hizasında
    return (
      <button
        type="button"
        onClick={onClick}
        data-brut-label=""
        className={cn(
          "flex h-10 items-center gap-1.5 rounded-xl border-2 border-[#111] bg-[#7ae582] px-3 text-[14px] font-black text-[#111]",
          "shadow-[3px_3px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={3} />
        {t(labelKey)}
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
