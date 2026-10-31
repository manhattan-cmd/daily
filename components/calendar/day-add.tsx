"use client";

import { useState } from "react";
import type { SubCategory } from "@/types";
import { AddScreen, type AddEntryOpts, type AddTab } from "@/components/calendar/add-screen";

type EntryOpts = {
  /** Aktivite sekmesiyle açılır */
  activityMode?: boolean;
  /** Var olan aktiviteye girdi: ad adımı atlanır */
  presetActivity?: { id: string; name: string } | null;
  /** Kalem seçili açılır (ana sayfanın hızlı ekle satırı) */
  presetSub?: SubCategory | null;
};

/**
 * Bir günün "Ekle"si — gün sayfası ile ana sayfa aynı ekranı kullanır (bkz.
 * AddScreen): tepede türler, altında seçilenin içeriği. Ana sayfada eskiden
 * yalnız "Girdi ekle" vardı: uyku, ruh hali, hedef, not için önce güne
 * gitmek gerekiyordu. Sonra ortak bir seçenek menüsü oldu, her satırı ayrı
 * bir pencere; şimdi tek ekran.
 *
 * `open` Ekle düğmesi için (Girdi sekmesinde açar), `openTab` başka bir
 * türle açmak için (gün sayfasının not bloğu), `openEntry`/`openGoal`
 * menü dışından (aktivite kartı, Yine ekle, başlarken adımları). `sheets`
 * sayfanın sonuna konur.
 */
export function useDayAdd(date: string) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AddTab>("entry");
  const [opts, setOpts] = useState<AddEntryOpts>({});

  const openTab = (next: AddTab = "entry", entryOpts: AddEntryOpts = {}) => {
    setOpts(entryOpts);
    setTab(next);
    setOpen(true);
  };

  const openEntry = (o: EntryOpts = {}) =>
    openTab(o.activityMode || o.presetActivity ? "activity" : "entry", {
      presetActivity: o.presetActivity ?? null,
      presetSub: o.presetSub ?? null,
    });

  const sheets = (
    <AddScreen date={date} open={open} onClose={() => setOpen(false)} tab={tab} entryOpts={opts} />
  );

  return {
    open: () => openTab("entry"),
    openTab,
    openEntry,
    openGoal: () => openTab("goal"),
    sheets,
  };
}
