"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ScaleLabels } from "@/types";
import {
  SCALE_STEP_KEYS,
  ScaleFace,
  scaleColor,
  scaleEndText,
  scaleLabelsAreDefault,
} from "@/lib/icons/emotions";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";

/**
 * Mutluluk skalası — basamaklar rakamla değil yüzle.
 *
 * Rakamlar ("1 2 3 4 5") ölçeğin ne demek olduğunu söylemiyordu: "3 iyi mi
 * kötü mü" diye düşünmek gerekiyordu. Yüzler mutsuzdan mutluya bir yön
 * çiziyor; her yüz kendi renginde (mor → mavi → gri → yeşil → sarı, bkz.
 * SCALE_COLORS) ve beş basamaklı skalada altında adı yazıyor (Berbat · Kötü ·
 * Eh işte · İyi · Harika). Ad, yüzün ifadesini yoruma bırakmıyor.
 *
 * Seçim yapılınca öteki yüzler geri çekiliyor: beş renkli yüzün arasında
 * hangisinin seçili olduğu yalnız çerçeveden okunmuyordu.
 *
 * Uç etiketleri (`labels`) yalnız kullanıcı onları değiştirdiyse ya da
 * skala beş basamaklı değilse yazılıyor; yerleşik "Awful/Great" zaten
 * birinci ve beşinci basamağın adı.
 */
export function MoodScale({
  choices,
  value,
  onChange,
  labels,
  tone = "mood",
}: {
  choices: string[];
  value: string;
  onChange: (v: string) => void;
  /** Özelliğin uç etiketleri (scaleLabels) */
  labels?: ScaleLabels;
  tone?: FieldTone;
}) {
  const t = useT();
  const skin = FIELD_TONES[tone];
  const n = choices.length;
  const named = n === SCALE_STEP_KEYS.length && scaleLabelsAreDefault(labels);
  const low = named ? "" : scaleEndText(labels?.low, t);
  const high = named ? "" : scaleEndText(labels?.high, t);
  const anyOn = value !== "" && choices.includes(value);

  return (
    <>
      <div data-mood-scale="" className="flex gap-1.5 px-4 pb-3 pt-2">
        {choices.map((c, i) => {
          const on = value === c;
          const color = scaleColor(i, n);
          const name = named ? t(SCALE_STEP_KEYS[i]) : undefined;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(on ? "" : c)}
              aria-pressed={on}
              aria-label={name ? `${c} · ${name}` : c}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border py-2 transition-[opacity,background-color]",
                !on && skin.choiceOff
              )}
              style={
                on
                  ? {
                      background: `${color}47`,
                      borderColor: color,
                      boxShadow: `inset 0 0 0 1px ${color}`,
                    }
                  : undefined
              }
            >
              <ScaleFace
                index={i}
                total={n}
                size={n > 7 ? 20 : 28}
                style={{ opacity: anyOn && !on ? 0.55 : 1 }}
              />
              {name && (
                <span
                  className={cn(
                    "w-full truncate px-0.5 text-center text-[10px] leading-3",
                    on ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                  )}
                >
                  {name}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {(low || high) && (
        <div className="-mt-1.5 flex justify-between px-4 pb-3 text-[11.5px] font-medium text-muted-foreground">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
    </>
  );
}
