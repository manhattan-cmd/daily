"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { clearAdded, useAddedNotice } from "@/lib/added-toast";
import { deleteEntry } from "@/lib/db/queries";
import { useSkin } from "@/lib/skin";
import { useT } from "@/lib/i18n";

/** Bildirimin ekranda kalma süresi */
const SHOW_MS = 4000;

/**
 * Brütal tema: girdi kaydedilince tepede yeşil, kalın çerçeveli "EKLENDİ!"
 * etiketi ve GERİ AL. Diğer temalarda çizilmez (bugünkü davranış aynı).
 */
export function AddedToast() {
  const notice = useAddedNotice();
  const brutal = useSkin() === "brutal";
  const t = useT();

  useEffect(() => {
    if (!notice) return;
    const tm = setTimeout(clearAdded, SHOW_MS);
    return () => clearTimeout(tm);
  }, [notice]);

  if (!notice || !brutal) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-safe">
      <div
        role="status"
        className="animate-in pointer-events-auto mt-3 flex w-full items-center gap-2.5 rounded-2xl border-[3px] border-[#111] bg-[#7ae582] px-3 py-2 text-[#111] shadow-[5px_5px_0_#111]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-[#111] bg-white">
          <Check className="h-4 w-4" strokeWidth={3.5} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-black uppercase leading-5">{t("brut.added")}</b>
          <span className="block truncate text-[12px] font-bold">{notice.name}</span>
        </span>
        <button
          type="button"
          onClick={async () => {
            clearAdded();
            await deleteEntry(notice.entryId);
          }}
          className="shrink-0 rounded-lg border-2 border-[#111] bg-white px-2.5 py-1 text-[12px] font-black uppercase shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {t("action.undo")}
        </button>
      </div>
    </div>
  );
}
