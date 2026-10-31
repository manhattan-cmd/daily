"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Boxes,
  MoonStar,
  NotebookPen,
  Package,
  PenLine,
  Smile,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { createNote } from "@/lib/db/queries";
import { intlTag, useLocale, useT, type MessageKey } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { useSheetPresence } from "@/lib/use-sheet-presence";
import { cn } from "@/lib/utils";
import type { BuiltInCategoryKey, SubCategory } from "@/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ENTRY_SCREEN } from "@/components/ui/entry-window";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { MoodSheet } from "@/components/calendar/mood-sheet";
import { SleepSheet } from "@/components/calendar/sleep-sheet";
import { NoteWindow } from "@/components/notes/note-window";
import { ThingEntrySheet } from "@/components/forms/thing-entry-sheet";
import { AddGoalSheet } from "@/components/goals/add-goal-sheet";

export type AddTab = "entry" | "mood" | "sleep" | "note" | "thing" | "goal" | "activity";

export type AddEntryOpts = {
  /** Var olan aktiviteye girdi: Aktivite sekmesi, ad adımı atlanır */
  presetActivity?: { id: string; name: string } | null;
  /** Kalem seçili açılır (ana sayfanın Yine ekle satırı) */
  presetSub?: SubCategory | null;
};

type TabDef = {
  key: AddTab;
  label: MessageKey;
  icon: LucideIcon;
  /** Brütalde şeridin rengi — türün kendi tonu */
  color: string;
  /** Yerleşik akış: kategorisi silinmişse sekme çıkmaz */
  builtIn?: BuiltInCategoryKey;
};

/** Sıra: en sık yapılan önde; aktivite en sonda (ileride girdinin çoklu seçimine katılacak) */
const TABS: TabDef[] = [
  { key: "entry", label: "add.entry", icon: PenLine, color: "#7ae582" },
  { key: "mood", label: "add.mood", icon: Smile, color: "#ff8fab", builtIn: "mood" },
  { key: "sleep", label: "add.sleep", icon: MoonStar, color: "#c9b8ff", builtIn: "sleep" },
  { key: "note", label: "add.note", icon: NotebookPen, color: "#ffb38a" },
  { key: "thing", label: "add.thing", icon: Package, color: "#8fe0d4", builtIn: "objects" },
  { key: "goal", label: "add.goal", icon: Target, color: "#ffd23f" },
  { key: "activity", label: "add.activity", icon: Boxes, color: "#8ec5ff" },
];

type AddScreenProps = {
  date: string;
  open: boolean;
  onClose: () => void;
  /** Açılış sekmesi */
  tab: AddTab;
  entryOpts: AddEntryOpts;
};

/**
 * EKLE EKRANI — gün sayfasının ve ana sayfanın Ekle'si buraya açılır.
 * Tam ekran (girdi seçicisiyle aynı ölçü, bkz. ENTRY_SCREEN); tepede şerit:
 * kapat, "Ekle" ve sayfanın günü, altında türler — girdi, ruh hali, uyku,
 * not, nesne, hedef, aktivite. Altında seçilen türün bugünkü penceresinin
 * içi, olduğu gibi (bkz. SheetFrame): girdi seçicisi ve formu, ruh hali,
 * uyku… Kaydedince ekran kapanır.
 *
 * Eskiden Ekle önce bir seçenek paneli açıyor, her satır ayrı bir pencereye
 * gidiyordu; pencerelerin görünüşü ve kapanışı farklıydı, yanlış tür
 * seçilince kapatıp yeniden açmak gerekiyordu. Şimdi tür değiştirmek tek
 * dokunuş. Bir kez açılan sekme ekran kapanana kadar kurulu kalır: başka
 * sekmeye bakıp dönünce yazılan kaybolmaz.
 *
 * Bu ilk adım (2026-10-31): sekmelerin içi bugünkü pencereler. Öneri sayfası
 * ve sonraki adımlar (sık eklenenler, kategori blokları, çoklu seçim): bkz.
 * proje notları.
 */
export function AddScreen(props: AddScreenProps) {
  const { mounted, visible } = useSheetPresence(props.open);
  return mounted ? <AddScreenBody {...props} open={visible} /> : null;
}

function AddScreenBody({ date, open, onClose, tab: initialTab, entryOpts }: AddScreenProps) {
  const t = useT();
  const tag = intlTag(useLocale());
  const brutal = useSkin() === "brutal";
  const [tab, setTab] = useState<AddTab>(initialTab);
  // Açılmış sekmeler — ekran kapanana kadar kurulu kalır
  const [visited, setVisited] = useState<AddTab[]>([initialTab]);
  // Not sekmesi bir not açar; ilk ziyarette oluşturulur, boş kalırsa
  // çıkarken atılır (bkz. NoteWindow)
  const [noteId, setNoteId] = useState<string | null>(null);
  const noteAsked = useRef(false);

  // Yerleşik akışların varlığı — kategorisi silinmişse sekmesi çıkmaz
  const builtInKeys = useLiveQuery(async () => {
    const cats = await db.categories.filter((c) => !!c.isBuiltIn).toArray();
    // Anahtarı henüz doldurulmamış tek yerleşik = eski kurulumdaki Uyku
    return new Set<BuiltInCategoryKey>(cats.map((c) => c.builtInKey ?? "sleep"));
  }, []);
  const tabs = TABS.filter((d) => !d.builtIn || !builtInKeys || builtInKeys.has(d.builtIn));
  const active = TABS.find((d) => d.key === tab) ?? TABS[0];

  const ensureNote = () => {
    if (noteAsked.current) return;
    noteAsked.current = true;
    void createNote(date).then((n) => setNoteId(n.id));
  };
  // Not sekmesiyle açıldıysa (gün sayfasının not bloğu) not hemen kurulur
  useEffect(() => {
    if (initialTab === "note") ensureNote();
    // yalnız açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (k: AddTab) => {
    setTab(k);
    setVisited((v) => (v.includes(k) ? v : [...v, k]));
    if (k === "note") ensureNote();
  };

  const [y, m, d] = date.split("-").map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString(tag, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function body(k: AddTab) {
    switch (k) {
      case "entry":
        return (
          <DayEntrySheet
            embedded
            date={date}
            open={open}
            onClose={onClose}
            presetSub={entryOpts.presetSub ?? null}
          />
        );
      case "activity":
        return (
          <DayEntrySheet
            embedded
            date={date}
            open={open}
            onClose={onClose}
            activityMode={!entryOpts.presetActivity}
            presetActivity={entryOpts.presetActivity ?? null}
          />
        );
      case "mood":
        return <MoodSheet embedded date={date} open={open} onClose={onClose} />;
      case "sleep":
        return <SleepSheet embedded date={date} open={open} onClose={onClose} />;
      case "thing":
        return <ThingEntrySheet embedded date={date} open={open} onClose={onClose} />;
      case "goal":
        return <AddGoalSheet embedded date={date} open={open} onClose={onClose} />;
      case "note":
        return noteId ? <NoteWindow embedded noteId={noteId} open={open} onClose={onClose} /> : null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose aria-describedby={undefined} className={ENTRY_SCREEN}>
        <DialogTitle className="sr-only">{t("day.add")}</DialogTitle>
        <div
          data-add-screen=""
          className="entry-screen-in flex h-full min-h-0 flex-col overflow-hidden bg-background md:rounded-[3rem]"
        >
          {brutal ? (
            <header
              data-add-nav=""
              className="shrink-0 border-b-[3px] border-[#111] pt-[env(safe-area-inset-top,0px)] transition-colors duration-200"
              style={{ background: active.color }}
            >
              <div className="flex h-12 items-center gap-2.5 pl-3 pr-4 pt-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("action.close")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border-2 bg-white text-[#111] shadow-[2px_2px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none"
                  style={{ borderColor: "#111" }}
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={2.75} />
                </button>
                <div className="min-w-0 flex-1 leading-none">
                  <div className="text-[19px] font-black tracking-[-0.02em] text-[#111]">{t("day.add")}</div>
                  <div className="mt-1 truncate text-[11.5px] font-bold text-[#111]/60">{dayLabel}</div>
                </div>
              </div>
              <nav
                aria-label={t("day.add")}
                className="grid px-1 pb-2 pt-1"
                style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
              >
                {tabs.map((d) => {
                  const on = d.key === tab;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => pick(d.key)}
                      aria-current={on ? "page" : undefined}
                      className="flex min-w-0 flex-col items-center gap-[5px] pt-1 text-[#111]"
                    >
                      <span
                        className={cn(
                          "box-content flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] px-[8px] py-[2px] transition-transform",
                          on ? "-translate-y-0.5 bg-white shadow-[2px_2px_0_#111]" : "text-[#111]/60"
                        )}
                        // Çerçeve rengi satır içi: katmansız "* { border-color }" kuralı border-transparent'ı eziyor
                        style={{ borderColor: on ? "#111" : "transparent" }}
                      >
                        <d.icon className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                      </span>
                      <span
                        className={cn(
                          "w-full truncate text-center text-[10.5px] leading-none tracking-[-0.01em]",
                          on ? "font-black" : "font-bold text-[#111]/65"
                        )}
                      >
                        {t(d.label)}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </header>
          ) : (
            <header
              data-add-nav=""
              className="shrink-0 border-b border-[var(--ln-1)] pt-[env(safe-area-inset-top,0px)]"
            >
              <div className="flex h-12 items-center gap-3 px-4 pt-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("action.close")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--sf-2)] text-foreground/80 transition-colors hover:bg-[var(--sf-3)]"
                >
                  <X className="h-[17px] w-[17px]" />
                </button>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[17px] font-bold tracking-tight">{t("day.add")}</div>
                  <div className="truncate text-[12px] text-muted-foreground">{dayLabel}</div>
                </div>
              </div>
              <nav aria-label={t("day.add")} className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2.5 pt-1">
                {tabs.map((d) => {
                  const on = d.key === tab;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => pick(d.key)}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
                        on ? "bg-[var(--sf-3)] text-foreground" : "text-muted-foreground hover:bg-[var(--sf-2)]"
                      )}
                    >
                      <d.icon className="h-4 w-4 shrink-0" />
                      {t(d.label)}
                    </button>
                  );
                })}
              </nav>
            </header>
          )}

          <div className="relative flex min-h-0 flex-1 flex-col">
            {visited.map((k) => (
              <div
                key={k}
                data-add-tab={k}
                className={cn("min-h-0 flex-1 flex-col", k === tab ? "flex" : "hidden")}
              >
                {body(k)}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
