"use client";

import { cn } from "@/lib/utils";

/** Bundan az basamakta her basamak bir nokta; fazlasında ince ray */
const DOTS_MAX = 10;

/**
 * ÖLÇEK GÖSTERGESİ — kaydedilmiş bir ölçek değerinin KÜÇÜK okunuşu (girdi
 * kartı, hedef kartı). Girişteki kaydırılan rayın (ScaleSlider) küçük
 * kardeşi; her ölçekte aynı dil:
 *  - değer ve tavanı: "7/10", iki yönlü ölçekte işaretli "+1" (tavan yok),
 *  - yanında küçük ray: ≤ 10 basamakta noktalar (uyku kartındaki gibi),
 *    fazlasında ince dolgu çubuğu; iki yönlüde sıfırdan değere.
 * Eskiden kartta yalnız sayı yazıyordu ("3 Şiddet") — 3'ün kaçta kaç
 * olduğu okunmuyordu.
 */
export function ScaleMeter({
  value,
  choices,
  color,
  className,
  valueClassName = "text-[13px]",
}: {
  value: string;
  choices: string[];
  color: string;
  className?: string;
  valueClassName?: string;
}) {
  const n = choices.length;
  const idx = choices.indexOf(value);
  const first = Number(choices[0]);
  const last = Number(choices[n - 1]);
  const bipolar = first < 0 && last > 0;
  const zero = bipolar ? Math.max(0, choices.indexOf("0")) : 0;
  const signed = (v: string) => (bipolar && Number(v) > 0 ? `+${v}` : v.replace("-", "−"));
  const pct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("font-semibold leading-none tabular-nums", valueClassName)} style={{ color }}>
        {signed(value)}
        {!bipolar && (
          <span className="text-[0.77em] font-medium text-muted-foreground/70">/{choices[n - 1]}</span>
        )}
      </span>
      {idx < 0 ? null : n <= DOTS_MAX ? (
        <span aria-hidden className="inline-flex items-center gap-[3px]">
          {choices.map((c, i) => {
            const lit = bipolar
              ? (i >= Math.min(zero, idx) && i <= Math.max(zero, idx))
              : i <= idx;
            return (
              <span
                key={c}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color, opacity: lit ? 1 : 0.22 }}
              />
            );
          })}
        </span>
      ) : (
        <span aria-hidden className="relative h-1.5 w-8 overflow-hidden rounded-full" style={{ background: `${color}38` }}>
          <span
            className="absolute inset-y-0 rounded-full"
            style={{
              background: color,
              left: `${Math.min(pct(zero), pct(idx))}%`,
              width: `${Math.max(Math.abs(pct(idx) - pct(zero)), 6)}%`,
            }}
          />
        </span>
      )}
    </span>
  );
}
