"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MoonStar } from "lucide-react";
import { createEntry, getBuiltInTarget, listRecentModValues } from "@/lib/db/queries";
import { carryDTR, parseDTR } from "@/components/forms/datetime-range-input";
import { EntryShell } from "@/components/forms/entry-shell";
import { LedgerField } from "@/components/forms/ledger-field";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NoteEditorView } from "@/components/forms/note-editor";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { useSheetPresence } from "@/lib/use-sheet-presence";
import { ENTRY_WINDOW_COMPACT } from "@/components/ui/entry-window";
import { SheetFrame } from "@/components/ui/sheet-frame";

/** Uykunun rengi — kutular, ip ve Ekle düğmesi */
const ACCENT = "#8b5cf6";

interface SleepSheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
  /** Ekle ekranının sekmesinde (bkz. AddScreen, SheetFrame) */
  embedded?: boolean;
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

function SleepSheetBody({ date, open, onClose, embedded }: SleepSheetProps) {
  const t = useT();
  // null = kullanıcı saatlere dokunmadı → son uykunun saatleri gösterilir
  const [range, setRange] = useState<string | null>(null);
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setRange(null);
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
    const rangeMod = found.mods.find(
      (m) => (m.entryType.valueType ?? "number") === "datetime-range"
    );
    // Son uykunun (en yeni gece) saatleri — kullanıcı çoğu gece aynı
    // saatlerde yatıp kalkıyor; her seferinde çarkı çevirtmeyelim. Değerler
    // mod kimliğiyle, eski kayıtlar ölçü türüyle anahtarlı.
    let lastRange = "";
    if (rangeMod) {
      const recent = await listRecentModValues(found.sub.id, 1);
      const keys = [rangeMod.modId, rangeMod.entryTypeId, rangeMod.entryType.id];
      for (const k of keys) {
        const v = k ? recent[k]?.[0] : undefined;
        if (v) {
          lastRange = v;
          break;
        }
      }
    }
    return {
      sub: found.sub,
      rangeMod,
      qualityMod: found.mods.find(
        (m) => (m.entryType.valueType ?? "number") === "select"
      ),
      lastRange,
    };
  }, []);

  // Son saatler girilen güne taşınır (bitiş bu gün, başlangıç eski gün farkıyla)
  const carried = useMemo(
    () => (target?.lastRange ? carryDTR(target.lastRange, date) : ""),
    [target?.lastRange, date]
  );
  const rangeValue = range ?? carried;

  async function handleSave() {
    if (!target) return;
    setSaving(true);
    try {
      const typeValues: { entryTypeId?: string; modId?: string; value: string }[] = [];
      if (rangeValue && target.rangeMod) {
        typeValues.push({
          entryTypeId: target.rangeMod.entryTypeId,
          modId: target.rangeMod.modId,
          value: rangeValue,
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
      const { end } = parseDTR(rangeValue);
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
    /* Girdi formunun (açık defter) dili — bkz. EntryShell. Zaman ayrıca
       sorulmuyor: girdinin zamanı uyanma saati. */
    <SheetFrame
      embedded={embedded}
      open={open}
      onClose={onClose}
      className={cn(ENTRY_WINDOW_COMPACT, "h-[min(660px,calc(100dvh-3rem))] gap-0 overflow-hidden p-0")}
    >
        <EntryShell
          title={t("sleep.add")}
          overline={target?.sub.name}
          icon={MoonStar}
          accent={ACCENT}
          onClose={onClose}
          notes={notes}
          onOpenNote={() => setNoteOpen(true)}
          onSave={handleSave}
          saveLabel={saving ? t("entry.saving") : t("action.add")}
          saveDisabled={saving || !target}
        >
          {target === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("sleep.notFound")}
            </p>
          ) : target === undefined ? null : (
            <>
              {target.rangeMod && (
                <LedgerField
                  mod={target.rangeMod}
                  icon={modAtomIcon(target.rangeMod)}
                  color={ACCENT}
                  value={rangeValue}
                  onChange={setRange}
                  entryDate={date}
                />
              )}
              {target.qualityMod && (
                <LedgerField
                  mod={target.qualityMod}
                  icon={modAtomIcon(target.qualityMod)}
                  color={ACCENT}
                  value={quality}
                  onChange={setQuality}
                />
              )}
            </>
          )}
        </EntryShell>

        {/* Not yazma görünümü pencerenin tamamını kaplar (bkz. note-editor) */}
        {noteOpen && (
          <NoteEditorView
            value={notes}
            onChange={setNotes}
            onDone={() => setNoteOpen(false)}
            subtitle={target?.sub.name}
            accent={ACCENT}
            className="absolute inset-0 z-20 bg-card px-5 pb-6 pt-5"
          />
        )}
    </SheetFrame>
  );
}
