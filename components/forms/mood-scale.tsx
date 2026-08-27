"use client";

import { cn } from "@/lib/utils";
import { ScaleFace } from "@/lib/icons/emotions";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";

const ACCENT = "#f472b6";

/**
 * Mutluluk skalası — basamaklar rakamla değil yüzle.
 *
 * Rakamlar ("1 2 3 4 5") ölçeğin ne demek olduğunu söylemiyordu: "3 iyi mi
 * kötü mü" diye düşünmek gerekiyordu. Yüzler mutsuzdan mutluya bir yön
 * çiziyor, altındaki uç etiketleri (Awful/Great) de o yönü adlandırıyor.
 * Yüzler emoji değil kendi setimiz (lib/icons/emotions) — duygu ızgarasıyla
 * aynı ailede.
 *
 * Basamak sayısı seçeneklerden geliyor; yüz dizisi kaç basamak olursa olsun
 * ona göre örnekleniyor (bkz. scaleFace).
 */
export function MoodScale({
  choices,
  value,
  onChange,
  tone = "mood",
}: {
  choices: string[];
  value: string;
  onChange: (v: string) => void;
  tone?: FieldTone;
}) {
  const skin = FIELD_TONES[tone];
  return (
    <div className="flex gap-1.5 px-4 pb-3.5 pt-2.5">
      {choices.map((c, i) => {
        const on = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(on ? "" : c)}
            aria-pressed={on}
            aria-label={c}
            className={cn(
              "flex flex-1 items-center justify-center rounded-xl border py-2.5 transition-colors",
              on ? "border-transparent" : skin.choiceOff
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
            <ScaleFace
              index={i}
              total={choices.length}
              size={26}
              className={on ? undefined : "text-muted-foreground"}
              style={on ? { color: ACCENT } : undefined}
            />
          </button>
        );
      })}
    </div>
  );
}
