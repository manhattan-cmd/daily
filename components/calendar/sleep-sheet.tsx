"use client";

import { createElement, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MoonStar, X } from "lucide-react";
import { createEntry, getBuiltInTarget } from "@/lib/db/queries";
import {
  DateTimeRangeInput,
  parseDTR,
} from "@/components/forms/datetime-range-input";
import { ScaleInput } from "@/components/ui/scale-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NoteEditorView, ToneNoteSection } from "@/components/forms/note-editor";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { useSheetPresence } from "@/lib/use-sheet-presence";
import { ENTRY_WINDOW_COMPACT } from "@/components/ui/entry-window";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface SleepSheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
}

/** Yerleşik Uyku akışı: Ekle → Uyku. Gece Uykusu altına süre + kalite kaydeder. */
/**
 * Yalnız açıkken (ve kapanış animasyonu boyunca) DOM'da — kapalıyken
 * içerik ve canlı sorgular hiç kurulmaz (bkz. useSheetPresence).
 */
export function SleepSheet(props: SleepSheetProps) {
  const { mounted, visible } = useSheetPresence(props.open);
  return mounted ? <SleepSheetBody {...props} open={visible} /> : null;
}

function SleepSheetBody({ date, open, onClose }: SleepSheetProps) {
  const t = useT();
  const [range, setRange] = useState("");
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setRange("");
        setQuality("");
        setNotes("");
        setNoteOpen(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Yerleşik akışı anahtarıyla bul. Eskiden "ilk yerleşik kategori" alınıyordu;
  // Ruh hali eklenince sıra kurulumdan kuruluma değişip pencere kimi zaman
  // mutluluk ölçeğini açar olmuştu. Ruh hali penceresi zaten bu yardımcıyı
  // kullanıyor — ikisi aynı yoldan gitsin.
  const target = useLiveQuery(async () => {
    const found = await getBuiltInTarget("sleep");
    if (!found) return null;
    return {
      sub: found.sub,
      rangeMod: found.mods.find(
        (m) => (m.entryType.valueType ?? "number") === "datetime-range"
      ),
      qualityMod: found.mods.find(
        (m) => (m.entryType.valueType ?? "number") === "select"
      ),
    };
  }, []);

  async function handleSave() {
    if (!target) return;
    setSaving(true);
    try {
      const typeValues: { entryTypeId?: string; modId?: string; value: string }[] = [];
      if (range && target.rangeMod) {
        typeValues.push({
          entryTypeId: target.rangeMod.entryTypeId,
          modId: target.rangeMod.modId,
          value: range,
        });
      }
      if (quality && target.qualityMod) {
        typeValues.push({
          entryTypeId: target.qualityMod.entryTypeId,
          modId: target.qualityMod.modId,
          value: quality,
        });
      }

      // Uyanma saati varsa girdinin zamanı odur; yoksa günün o anki saati
      const { end } = parseDTR(range);
      let occurredAt: number;
      if (end) {
        occurredAt = new Date(end).getTime();
      } else {
        const [y, m, d] = date.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        const n = new Date();
        dt.setHours(n.getHours(), n.getMinutes(), 0, 0);
        occurredAt = dt.getTime();
      }

      await createEntry({
        subcategoryId: target.sub.id,
        typeValues,
        occurredAt,
        notes: notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Standart kayıt penceresi (bkz. entry-window): eskiden alttan açılan
          bir yüzeydi; Ekle menüsündeki pencereler kart pencereleriyle aynı.
          Kendi kapatma düğmesi başlıkta — standart çarpı gizli. */}
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          hideClose
          aria-describedby={undefined}
          className={cn(ENTRY_WINDOW_COMPACT, "gap-0 overflow-hidden p-0")}
        >


        <div className="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15">
            <MoonStar className="h-4.5 w-4.5 text-violet-300" />
          </span>
          <DialogTitle className="flex-1 text-base font-semibold tracking-tight">
            {t("sleep.add")}
          </DialogTitle>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-[var(--sf-3)] text-muted-foreground hover:bg-[var(--sf-4)] transition-colors"
            aria-label={t("action.close")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 flex flex-col gap-5 [&>*]:shrink-0">
          {target === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("sleep.notFound")}
            </p>
          ) : target === undefined ? null : (
            <>
              {target.rangeMod && (
                <div className="flex flex-col gap-1.5">
                  <label className="mb-0 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/50">
                    {/* Düzenleme penceresiyle aynı başlık: özelliğin simgesi + adı */}
                    {createElement(modAtomIcon(target.rangeMod), {
                      className: "h-3 w-3 shrink-0",
                    })}
                    {target.rangeMod.name ?? t("sleep.duration")}
                  </label>
                  <DateTimeRangeInput
                    value={range}
                    onChange={setRange}
                    entryDate={date}
                    tone="sleep"
                  />
                </div>
              )}

              {target.qualityMod && (
                <div className="flex flex-col gap-1.5">
                  <label className="mb-0 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/50">
                    {/* Düzenleme penceresiyle aynı başlık: özelliğin simgesi + adı */}
                    {createElement(modAtomIcon(target.qualityMod), {
                      className: "h-3 w-3 shrink-0",
                    })}
                    {target.qualityMod.name ?? t("sleep.quality")}
                  </label>
                  {/* Tek parça şerit — kart penceresindekiyle aynı (eskiden
                      üstünde anlamsız bir "ÖLÇEK" başlığı vardı) */}
                  <ScaleInput
                    choices={target.qualityMod.entryType.choices ?? []}
                    labels={target.qualityMod.mod?.scaleLabels}
                    value={quality}
                    onChange={setQuality}
                    color="#8b5cf6"
                  />
                </div>
              )}

              <ToneNoteSection
                id="sleep-note"
                tone="sleep"
                value={notes}
                onOpen={() => setNoteOpen(true)}
              />
            </>
          )}
        </div>

        <div className="px-5 pb-8 pt-3 shrink-0 border-t border-[var(--ln-2)]">
          <Button
            className="w-full bg-violet-600 hover:bg-violet-700"
            size="lg"
            onClick={handleSave}
            disabled={saving || !target}
          >
            {saving ? t("entry.saving") : t("action.add")}
          </Button>
        </div>

        {/* Not yazma görünümü pencerenin tamamını kaplar (bkz. note-editor) */}
        {noteOpen && (
          <NoteEditorView
            value={notes}
            onChange={setNotes}
            onDone={() => setNoteOpen(false)}
            subtitle={target?.sub.name}
            accent="#7c3aed"
            className="absolute inset-0 z-20 bg-card px-5 pb-6 pt-5"
          />
        )}
        </DialogContent>
      </Dialog>
    </>
  );
}
