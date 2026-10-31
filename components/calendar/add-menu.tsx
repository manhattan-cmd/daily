"use client";

import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Gün sayfasının ve ana sayfanın "Ekle" düğmesi — dokununca Ekle ekranı
 * açılır (bkz. AddScreen): tepede türler (girdi, ruh hali, uyku, not, nesne,
 * hedef, aktivite), altında seçilenin içeriği.
 *
 * Önce dairesel bir yay menüsüydü (altı seçenekte geometri tutmadı), sonra
 * düğmenin altına açılan bir seçenek paneli: her satır ayrı bir pencere
 * açıyordu; yanlış tür seçilince kapatıp menüyü yeniden açmak gerekiyordu.
 * Artık tür ekranın içinde seçiliyor.
 */
export function AddButton({
  onOpen,
  tile = false,
}: {
  onOpen: () => void;
  /** Brütal gün özetinin kare hücresi (bkz. SummaryBlock): hücreyi doldurur */
  tile?: boolean;
}) {
  const t = useT();
  if (tile) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#7ae582] text-[#111] active:bg-[#5fd36a]"
        aria-label={t("day.add")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111] text-[#7ae582]">
          <Plus className="h-6 w-6" strokeWidth={3} />
        </span>
        <span className="text-[13px] font-black leading-none">{t("day.add")}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
    >
      <Plus className="h-4 w-4" />
      {t("day.add")}
    </button>
  );
}
