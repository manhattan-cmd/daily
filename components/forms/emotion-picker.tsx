"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmotionFace, emotionLook } from "@/lib/icons/emotions";
import { LevelBar } from "@/components/forms/level-bar";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";
import {
  LEVEL_DEFAULT,
  packChoiceLevel,
  splitChoiceLevel,
} from "@/lib/choice-level";

/**
 * Duygu seçici — ızgara + seçilenlerin yoğunluk çubukları.
 *
 * İlk tasarımda seçilen kutucuk BULUNDUĞU YERDE tam satıra açılıyordu. Tek
 * duyguda hoş duruyordu ama birkaç duygu seçilince ızgara çubuklarla bölünüp
 * okunmaz hale geliyordu: hangi kutucuğun nerede olduğu her seçimde değişiyor,
 * göz listeyi kaybediyordu. Şimdi ızgara SABİT — seçilen kutucuk yerinde kalıp
 * kendi rengine boyanıyor — çubuklar ızgaranın altında tek bir yerde
 * toplanıyor. Sıra ızgaranın sırası, yani çubuk listesi de her seçimde
 * yeniden dizilmiyor.
 *
 * Izgara kendi içinde kaydırılıyor: 16 duygu dört satır tutuyor ve pencerenin
 * tamamını yiyip üstteki mutluluk penceresini sıkıştırıyordu. Yükseklik bir
 * satırı yarıda kesecek şekilde sınırlı — kaydırılabildiği oradan anlaşılıyor.
 *
 * Değer biçimi ham EntryValue biçimiyle aynı: "Happy" ya da "Happy|70"
 * (bkz. lib/choice-level). Böylece hem ekleme hem düzenleme penceresi aynı
 * diziyi doğrudan kaydedebiliyor.
 */
export function EmotionPicker({
  choices,
  values,
  onChange,
  tone = "mood",
}: {
  choices: string[];
  values: string[];
  onChange: (values: string[]) => void;
  tone?: FieldTone;
}) {
  const t = useT();
  const skin = FIELD_TONES[tone];

  /** Seçilenler: etiket → yoğunluk (null = eski kayıt, yoğunluksuz) */
  const picked = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const raw of values) {
      const { label, level } = splitChoiceLevel(raw);
      if (label) map.set(label, level);
    }
    return map;
  }, [values]);

  /** Izgara sırasında yaz; listede olmayan (elle/eski) etiketler sona eklenir */
  function emit(next: Map<string, number | null>) {
    const known = choices.filter((c) => next.has(c));
    const unknown = [...next.keys()].filter((k) => !choices.includes(k));
    onChange(
      [...known, ...unknown].map((k) => packChoiceLevel(k, next.get(k) ?? null))
    );
  }

  function toggle(label: string) {
    const next = new Map(picked);
    if (next.has(label)) next.delete(label);
    else next.set(label, LEVEL_DEFAULT);
    emit(next);
  }

  function setLevel(label: string, level: number) {
    const next = new Map(picked);
    next.set(label, level);
    emit(next);
  }

  const selected = [
    ...choices.filter((c) => picked.has(c)),
    ...[...picked.keys()].filter((k) => !choices.includes(k)),
  ];

  return (
    <>
      {/* Izgara — kendi içinde kaydırılır, seçim onu yeniden dizmez */}
      <div className="no-scrollbar max-h-[200px] overflow-y-auto overscroll-contain px-4 pb-3 pt-2.5">
        <div className="grid grid-cols-4 gap-1.5">
          {choices.map((c) => {
            const look = emotionLook(c);
            const on = picked.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={on}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border py-2 transition-colors",
                  !on && skin.choiceOff
                )}
                style={
                  on
                    ? {
                        borderColor: `${look.color}80`,
                        background: `${look.color}24`,
                      }
                    : undefined
                }
              >
                <EmotionFace
                  name={c}
                  size={22}
                  style={{ color: look.color, opacity: on ? 1 : 0.62 }}
                />
                <span
                  className={cn(
                    "w-full truncate px-0.5 text-center text-[9px] font-medium leading-3",
                    on ? "text-foreground" : undefined
                  )}
                >
                  {c}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Yoğunluklar — hepsi tek yerde, ızgaranın altında */}
      {selected.length > 0 && (
        <div
          className={cn("flex flex-col gap-1.5 border-t px-4 py-3", skin.line)}
        >
          {selected.map((c) => {
            const look = emotionLook(c);
            const level = picked.get(c) ?? LEVEL_DEFAULT;
            return (
              <div
                key={c}
                className="rounded-xl border px-3 py-2"
                style={{
                  borderColor: `${look.color}59`,
                  background: `${look.color}12`,
                }}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    aria-label={t("mood.removeEmotion", { name: c })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform active:scale-90"
                  >
                    <EmotionFace
                      name={c}
                      size={24}
                      style={{ color: look.color }}
                    />
                  </button>
                  <span className="flex-1 truncate text-[13px] font-semibold">
                    {c}
                  </span>
                  <span
                    className="shrink-0 text-[13px] font-bold tabular-nums"
                    style={{ color: look.color }}
                  >
                    {level}
                  </span>
                </div>
                <LevelBar
                  value={level}
                  onChange={(v) => setLevel(c, v)}
                  color={look.color}
                  label={t("mood.intensityOf", { name: c })}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
