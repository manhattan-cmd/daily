"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Smile } from "lucide-react";
import { createEntry, getBuiltInTarget } from "@/lib/db/queries";
import { cn, toLocalDateTimeValue } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmotionPicker } from "@/components/forms/emotion-picker";
import { MoodScale } from "@/components/forms/mood-scale";
import { NoteEditorView } from "@/components/forms/note-editor";
import { EntryShell } from "@/components/forms/entry-shell";
import { EntryTime } from "@/components/forms/entry-time";
import { LedgerField } from "@/components/forms/ledger-field";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { useSheetPresence } from "@/lib/use-sheet-presence";
import { ENTRY_WINDOW_LARGE } from "@/components/ui/entry-window";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface MoodSheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
}

const ACCENT = "#f472b6";

/** Sayfanın günü, şimdiki saatle — zaman hapının başlangıcı */
function nowOn(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const n = new Date();
  return toLocalDateTimeValue(new Date(y, m - 1, d, n.getHours(), n.getMinutes(), 0, 0).getTime());
}

/**
 * Yerleşik Ruh hali akışı: Ekle → Ruh hali.
 *
 * İki özelliği var, her biri kendi penceresinde — uyku akışındaki süre/kalite
 * pencereleriyle aynı iskelet (üstte başlık şeridi, ortada gövde, altta özet),
 * yalnız ton pembe: mutluluk skalası ve duygular.
 *
 * Duygular ayrı bir kavram DEĞİL, seçenekli bir özelliğin seçenekleri; tek
 * farkı birden çok seçilebilmesi ve her seçimin bir YOĞUNLUK taşıması.
 * Yoğunluk için yeni bir ölçüm türü uydurulmadı, değerin kendisinde duruyor
 * ("Happy|70" — bkz. lib/choice-level). Analiz tarafı duyguyu yine etiketiyle
 * grupluyor, "ne kadar" bilgisi de kayıtta kalıyor.
 *
 * Duygu ızgarası ve yoğunluk çubukları EmotionPicker'da; düzenleme penceresi
 * de aynı bileşeni kullanıyor ki iki yerde iki ayrı duygu arayüzü olmasın.
 *
 * Yüzler emoji değil kendi setimiz (lib/icons/emotions): emoji her cihazda
 * başka çiziliyor ve kendi rengini dayatıyor. Burada rengi duygunun kendisi
 * veriyor, ızgara bir renk haritası gibi okunuyor.
 *
 * Gün içinde istenildiği kadar kayıt açılabilir: ruh hali sabah ve akşam aynı
 * olmuyor, her kayıt kendi saatini taşıyor.
 */
/**
 * Yalnız açıkken (ve kapanış animasyonu boyunca) DOM'da — kapalıyken
 * içerik ve canlı sorgular hiç kurulmaz (bkz. useSheetPresence).
 */
export function MoodSheet(props: MoodSheetProps) {
  const { mounted, visible } = useSheetPresence(props.open);
  return mounted ? <MoodSheetBody {...props} open={visible} /> : null;
}

function MoodSheetBody({ date, open, onClose }: MoodSheetProps) {
  const t = useT();
  const [level, setLevel] = useState("");
  /** Seçili duygular, ham değer biçiminde ("Happy|70") — kayda olduğu gibi gider */
  const [emotions, setEmotions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Gün içinde birden çok kayıt sıralansın diye her kayıt kendi saatini
  // taşıyor; girdi formundaki hap (Dün · Şimdi · Yarın · Özel)
  const [occurredAt, setOccurredAt] = useState(() => nowOn(date));

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setOccurredAt(nowOn(date));
        setLevel("");
        setEmotions([]);
        setNotes("");
        setNoteOpen(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, date]);

  const target = useLiveQuery(async () => {
    const found = await getBuiltInTarget("mood");
    if (!found) return null;
    const scale = found.mods.find(
      (m) =>
        (m.entryType.valueType ?? "number") === "select" &&
        (m.entryType.choices ?? []).every((c) => /^\d+$/.test(c))
    );
    const feelings = found.mods.find(
      (m) =>
        m !== scale &&
        (m.entryType.valueType ?? "number") === "select" &&
        (m.entryType.choices ?? []).length > 0
    );
    return { sub: found.sub, scale, feelings };
  }, []);

  const scaleChoices = target?.scale?.entryType.choices ?? [];
  const emotionChoices = target?.feelings?.entryType.choices ?? [];

  // Yalnız not da bir kayıt — düzenleme penceresinde olduğu gibi
  const nothingPicked = !level && emotions.length === 0 && !notes.trim();
  const scaleLabels = target?.scale?.mod?.scaleLabels;

  async function handleSave() {
    if (!target || saving) return;
    setSaving(true);
    try {
      const typeValues: { entryTypeId?: string; modId?: string; value: string }[] =
        [];
      if (level && target.scale) {
        typeValues.push({
          entryTypeId: target.scale.entryTypeId,
          modId: target.scale.modId,
          value: level,
        });
      }
      // Her duygu ayrı bir değer satırı — aynı özellikten birden çok değer.
      // Yoğunluk değerin içinde taşınıyor (seçici zaten o biçimde veriyor).
      for (const value of emotions) {
        if (!target.feelings) break;
        typeValues.push({
          entryTypeId: target.feelings.entryTypeId,
          modId: target.feelings.modId,
          value,
        });
      }

      await createEntry({
        subcategoryId: target.sub.id,
        typeValues,
        occurredAt: new Date(occurredAt).getTime(),
        notes: notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Girdi formunun (açık defter) dili — bkz. EntryShell. Yüzler ve
          duygu ızgarası kendi girişleri; kutunun başlığı ve rengi ortak. */}
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className={cn(ENTRY_WINDOW_LARGE, "gap-0 overflow-hidden p-0")}
      >
        <EntryShell
          title={t("mood.add")}
          overline={target?.sub.name}
          icon={Smile}
          accent={ACCENT}
          onClose={onClose}
          time={
            <EntryTime
              occurredAt={occurredAt}
              onChange={setOccurredAt}
              baseDate={date}
              accent={ACCENT}
            />
          }
          notes={notes}
          onOpenNote={() => setNoteOpen(true)}
          onSave={handleSave}
          saveLabel={saving ? t("entry.saving") : t("action.add")}
          saveDisabled={saving || !target || nothingPicked}
        >
          {target === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("mood.missing")}
            </p>
          ) : target === undefined ? null : (
            <>
              {target.scale && scaleChoices.length > 0 && (
                <LedgerField
                  mod={target.scale}
                  icon={modAtomIcon(target.scale)}
                  color={ACCENT}
                  value={level}
                  onChange={setLevel}
                  custom={
                    <>
                      <MoodScale choices={scaleChoices} value={level} onChange={setLevel} />
                      {(scaleLabels?.low || scaleLabels?.high) && (
                        <div className="-mt-1.5 flex justify-between px-4 pb-3 text-[11.5px] font-medium text-muted-foreground">
                          <span>{scaleLabels?.low}</span>
                          <span>{scaleLabels?.high}</span>
                        </div>
                      )}
                    </>
                  }
                />
              )}
              {target.feelings && emotionChoices.length > 0 && (
                <LedgerField
                  mod={target.feelings}
                  icon={modAtomIcon(target.feelings)}
                  color={ACCENT}
                  value={emotions.join(",")}
                  onChange={() => {}}
                  filled={emotions.length > 0}
                  custom={
                    <EmotionPicker
                      choices={emotionChoices}
                      values={emotions}
                      onChange={setEmotions}
                      // Büyük pencere: ızgaranın tamamı kaydırmadan görünsün
                      gridHeight={400}
                    />
                  }
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
      </DialogContent>
    </Dialog>
  );
}
