"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { STRUCTURE_TABS, StructureTabs } from "./structure-tabs";
import { useT, type MessageKey } from "@/lib/i18n";

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
  const pathname = usePathname();
  const tab = STRUCTURE_TABS.find((x) => x.href === pathname);
  return (
    <PageHeader
      title={t(tab?.key ?? "structure.title")}
      action={action}
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
  return (
    <Button size="sm" onClick={onClick} className="gap-1.5">
      <Plus className="h-3.5 w-3.5" />
      {t(labelKey)}
    </Button>
  );
}
