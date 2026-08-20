"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Smile, X } from "lucide-react";
import { createEntry, getBuiltInTarget } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface MoodSheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
}

const ACCENT = "#f472b6";

/** Skalanın her basamağının yüzü — sayı tek başına "3 neydi?" sorusunu bırakıyor */
const FACES = ["😞", "🙁", "😐", "🙂", "😄"];

/**
 * Yerleşik Ruh hali akışı: Ekle → Ruh hali.
 *
 * Uyku ile aynı kurulum — altta sıradan bir kategori, kullanıcıya ayrı bir
 * şey gibi sunuluyor. İki özelliği var: mutluluk (skala) ve duygular.
 *
 * Duygular ayrı bir kavram DEĞİL, seçenekli bir özelliğin seçenekleri; tek
 * farkı birden çok seçilebilmesi. Her seçilen duygu kendi değer satırı
 * olarak yazılıyor — depolama bunu zaten kaldırıyordu, yeni bir ölçüm türü
 * uydurmaya gerek kalmadı.
 *
 * Gün içinde istenildiği kadar kayıt açılabilir: ruh hali sabah ve akşam
 * aynı olmuyor, her kayıt kendi saatini taşıyor.
 */
export function MoodSheet({ date, open, onClose }: MoodSheetProps) {
  const t = useT();
  const [level, setLevel] = useState("");
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

  function toggleEmotion(name: string) {
    setEmotions((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  }

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
      // Her duygu ayrı bir değer satırı — aynı özellikten birden çok değer
      for (const emotion of emotions) {
        if (!target.feelings) break;
        typeValues.push({
          entryTypeId: target.feelings.entryTypeId,
          modId: target.feelings.modId,
          value: emotion,
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

  const scaleChoices = target?.scale?.entryType.choices ?? [];
  const emotionChoices = target?.feelings?.entryType.choices ?? [];
  const nothingPicked = !level && emotions.length === 0;

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

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pb-6">
          {target === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("mood.missing")}
            </p>
          ) : target === undefined ? null : (
            <>
              {scaleChoices.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: ACCENT }}
                  >
                    {t("mood.level")}
                  </label>
                  {/* Basamaklar eşit paylı: skala bir sıra, tek tek düğme
                      değil. Yüz sayının ne demek olduğunu söylüyor. */}
                  <div className="flex gap-1.5">
                    {scaleChoices.map((c, i) => {
                      const on = level === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setLevel(on ? "" : c)}
                          aria-pressed={on}
                          className={cn(
                            "flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors",
                            on
                              ? "border-transparent"
                              : "border-white/[0.09] bg-white/[0.04] hover:bg-white/[0.07]"
                          )}
                          style={
                            on
                              ? {
                                  background: `${ACCENT}2b`,
                                  boxShadow: `inset 0 0 0 1px ${ACCENT}80`,
                                }
                              : undefined
                          }
                        >
                          <span className="text-[19px] leading-6">
                            {FACES[i] ?? "🙂"}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] font-semibold leading-4",
                              on ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {c}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {(target.scale?.mod?.scaleLabels?.low ||
                    target.scale?.mod?.scaleLabels?.high) && (
                    <div className="flex justify-between px-1 text-[10.5px] text-muted-foreground">
                      <span>{target.scale?.mod?.scaleLabels?.low}</span>
                      <span>{target.scale?.mod?.scaleLabels?.high}</span>
                    </div>
                  )}
                </div>
              )}

              {emotionChoices.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline gap-2">
                    <label
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: ACCENT }}
                    >
                      {t("mood.emotions")}
                    </label>
                    <span className="text-[10.5px] text-muted-foreground">
                      {emotions.length > 0
                        ? t("mood.selectedCount", { count: emotions.length })
                        : t("mood.emotionsHint")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {emotionChoices.map((c) => {
                      const on = emotions.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleEmotion(c)}
                          aria-pressed={on}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                            on
                              ? "text-foreground"
                              : "bg-white/[0.05] text-muted-foreground hover:bg-white/[0.09] hover:text-foreground"
                          )}
                          style={
                            on
                              ? {
                                  background: `${ACCENT}2b`,
                                  boxShadow: `inset 0 0 0 1px ${ACCENT}80`,
                                }
                              : undefined
                          }
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
