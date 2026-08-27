"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Smile, X } from "lucide-react";
import { createEntry, getBuiltInTarget } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmotionPicker } from "@/components/forms/emotion-picker";
import { FieldWindow } from "@/components/forms/field-window";
import { MoodScale } from "@/components/forms/mood-scale";
import { FIELD_TONES } from "@/components/forms/field-tone";

interface MoodSheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
}

const ACCENT = "#f472b6";
const SKIN = FIELD_TONES.mood;

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
export function MoodSheet({ date, open, onClose }: MoodSheetProps) {
  const t = useT();
  const [level, setLevel] = useState("");
  /** Seçili duygular, ham değer biçiminde ("Happy|70") — kayda olduğu gibi gider */
  const [emotions, setEmotions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setLevel("");
        setEmotions([]);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

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
  const pickedCount = emotions.length;
  const nothingPicked = !level && pickedCount === 0;
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

      // Kayıt sayfanın gününe, o anki saatle düşer: gün içinde birden çok
      // kayıt sıralanabilsin diye
      const [y, m, d] = date.split("-").map(Number);
      const when = new Date(y, m - 1, d);
      const nowTime = new Date();
      when.setHours(nowTime.getHours(), nowTime.getMinutes(), 0, 0);

      await createEntry({
        subcategoryId: target.sub.id,
        typeValues,
        occurredAt: when.getTime(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px]",
          "flex flex-col rounded-t-3xl border-t border-white/8 bg-background",
          "shadow-[0_-8px_40px_rgba(0,0,0,0.6)]",
          "transition-transform duration-300 ease-out",
          "max-h-[85vh]",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-[3px] w-10 rounded-full bg-white/15" />
        </div>

        <div className="flex shrink-0 items-center gap-3 px-5 pb-4 pt-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: `${ACCENT}26` }}
          >
            <Smile className="h-[18px] w-[18px]" style={{ color: ACCENT }} />
          </span>
          <h2 className="flex-1 text-base font-semibold tracking-tight">
            {t("mood.add")}
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/12"
            aria-label={t("action.close")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-6">
          {target === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("mood.missing")}
            </p>
          ) : target === undefined ? null : (
            <>
              {scaleChoices.length > 0 && (
                <FieldWindow
                  tone="mood"
                  caption={t("mood.levelPrompt")}
                  footer={
                    scaleLabels?.low || scaleLabels?.high ? (
                      <span className="flex flex-1 justify-between text-[11px] text-muted-foreground/70">
                        <span>{scaleLabels?.low}</span>
                        <span>{scaleLabels?.high}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">
                        {t("mood.levelHint")}
                      </span>
                    )
                  }
                >
                  <MoodScale
                    choices={scaleChoices}
                    value={level}
                    onChange={setLevel}
                  />
                </FieldWindow>
              )}

              {emotionChoices.length > 0 && (
                <FieldWindow
                  tone="mood"
                  caption={t("mood.emotions")}
                  footer={
                    pickedCount > 0 ? (
                      <>
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            SKIN.dot
                          )}
                        />
                        <span className="text-xs text-muted-foreground">
                          {t("mood.selectedCount", { count: pickedCount })}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">
                        {t("mood.emotionsHint")}
                      </span>
                    )
                  }
                >
                  <EmotionPicker
                    choices={emotionChoices}
                    values={emotions}
                    onChange={setEmotions}
                  />
                </FieldWindow>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-white/8 px-5 pb-8 pt-3">
          <Button
            className="w-full"
            size="lg"
            style={{ backgroundColor: ACCENT, color: "#0b0c10" }}
            onClick={handleSave}
            disabled={saving || !target || nothingPicked}
          >
            {saving ? t("entry.saving") : t("action.add")}
          </Button>
        </div>
      </div>
    </>
  );
}
