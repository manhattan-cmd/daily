"use client";

import { cn } from "@/lib/utils";
import type { ScaleLabels } from "@/types";

/** Tek satıra sığdırmaya çalıştığımız üst sınır; üstünde sarmalanır */
const ROW_LIMIT = 10;

/**
 * Skala girişi — uçları anlamlı, basamakları eşit genişlikte tek şerit.
 *
 * Çoktan seçmeliden ayrı bir bileşen olmasının sebebi: skala SIRALI. "3",
 * "4"ten küçüktür ve uçların bir anlamı vardır. Serbest çip bulutu bu sırayı
 * göstermiyordu; kullanıcı 1–5 arası sayılara bakıp hangi ucun iyi olduğunu
 * bilemiyordu. Uç etiketleri (kötü → harika) tam da bunun için.
 */
export function ScaleInput({
  choices,
  labels,
  value,
  onChange,
}: {
  choices: string[];
  labels?: ScaleLabels;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!choices.length) return null;
  const wrap = choices.length > ROW_LIMIT;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        // Sarmalanınca yerleşim sınıfları değişiyor; testler biçime değil
        // bu kancaya baksın
        data-scale-strip=""
        className={cn(
          "gap-1",
          wrap ? "flex flex-wrap" : "grid",
          !wrap && "grid-flow-col auto-cols-fr"
        )}
      >
        {choices.map((c) => {
          const active = value === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(active ? "" : c)}
              aria-pressed={active}
              className={cn(
                "min-w-8 rounded-lg border py-2 text-center text-sm font-medium tabular-nums transition-colors",
                wrap && "px-2.5",
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-input text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          );
        })}
      </div>

      {(labels?.low || labels?.high) && (
        <div className="flex items-start justify-between gap-3 px-0.5 text-[10px] leading-tight text-muted-foreground/70">
          <span className="truncate">{labels.low}</span>
          <span className="truncate text-right">{labels.high}</span>
        </div>
      )}
    </div>
  );
}
