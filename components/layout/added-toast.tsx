"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { clearAdded, useAddedNotice, type AddedNotice } from "@/lib/added-toast";
import { deleteEntry } from "@/lib/db/queries";
import { useSkin } from "@/lib/skin";
import { useT } from "@/lib/i18n";

/** Bildirimin ekranda kalma süresi (eskiden 4 sn — fazla uzun bulundu) */
const SHOW_MS = 2600;
/** Yukarı kayarak çıkış süresi — globals.css `.added-out` ile aynı */
const LEAVE_MS = 240;

/**
 * Brütal tema: girdi kaydedilince tepede yeşil, çerçeveli tek satırlık
 * "… eklendi" etiketi ve GERİ AL. Yukarıdan iner, süresi dolunca yukarı
 * kayarak kaybolur. Eskiden iki satırlık, ekran genişliğinde bir tabelaydı
 * ve bir anda yok oluyordu. Diğer temalarda çizilmez.
 */
export function AddedToast() {
  const notice = useAddedNotice();
  const brutal = useSkin() === "brutal";
  if (!notice || !brutal) return null;
  // Her yeni bildirim kendi çıkış durumuyla başlasın
  return <ToastBody key={`${notice.entryId}:${notice.at}`} notice={notice} />;
}

function ToastBody({ notice }: { notice: AddedNotice }) {
  const t = useT();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const out = setTimeout(() => setLeaving(true), SHOW_MS);
    const gone = setTimeout(clearAdded, SHOW_MS + LEAVE_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-safe">
      <div
        role="status"
        data-added-toast=""
        className={`${leaving ? "added-out" : "added-in"} pointer-events-auto mt-2.5 flex min-w-0 max-w-full items-center gap-2 rounded-xl border-2 border-[#111] bg-[#7ae582] py-1 pl-1 pr-1 text-[#111] shadow-[3px_3px_0_#111]`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-[#111] bg-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
        </span>
        <span className="min-w-0 truncate text-[13px] font-black leading-5">
          {t("entry.added", { name: notice.name })}
        </span>
        <button
          type="button"
          onClick={async () => {
            setLeaving(true);
            setTimeout(clearAdded, LEAVE_MS);
            await deleteEntry(notice.entryId);
          }}
          className="h-7 shrink-0 rounded-lg border-2 border-[#111] bg-white px-2 text-[11px] font-black uppercase shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {t("action.undo")}
        </button>
      </div>
    </div>
  );
}
