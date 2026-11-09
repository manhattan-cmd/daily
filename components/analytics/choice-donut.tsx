"use client";

import { Cell, Pie, PieChart } from "recharts";
import { DONUT_SLICES, fmtNum, fmtPct } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useIsBrutal } from "@/components/structure/brutal";

/** Dilimlerin tonu — en büyük dilim tam renk, küçüldükçe açılır */
const SHADES = [1, 0.7, 0.48, 0.32, 0.2];
const OTHER_FILL = "#9ca3af";
const SIZE = 132;

/**
 * Dağılımın halka çizimi — bir bütünün payları (hangi öğün, hangi araba).
 *
 * Yalnız uygun yerde sunuluyor (bkz. lib/analytics chartFormsFor): sırasız
 * etiketlerde, en çok 8 ayrı değerde, bir girdinin tek değer taşıdığı yerde.
 * Beşten çok dilim olursa ilk beşi kalır, kalanı "Diğer"de toplanır — küçük
 * dilimler açıyla okunmuyor.
 *
 * Adlar dilimlerin üstünde değil yanındaki listede: telefonda dilim
 * etiketleri birbirine biniyor. Satıra dokunmak yatay çubuktaki gibi o
 * seçeneği süzgeç yapar; seçili olmayan dilimler soluklaşır.
 */
export function ChoiceDonut({
  rows,
  color,
  selected,
  onSelect,
  cells = false,
}: {
  rows: { choice: string; count: number }[];
  color: string;
  selected: string | null;
  onSelect: (choice: string | null) => void;
  /** Brütal blok hücresi — beyaz zeminde, kendi kartı yok */
  cells?: boolean;
}) {
  const t = useT();
  const brutal = useIsBrutal();
  const total = rows.reduce((a, r) => a + r.count, 0);

  const slices =
    rows.length > DONUT_SLICES + 1
      ? [
          ...rows.slice(0, DONUT_SLICES).map((r) => ({ ...r, other: false })),
          {
            choice: t("chart.other"),
            count: rows.slice(DONUT_SLICES).reduce((a, r) => a + r.count, 0),
            other: true,
          },
        ]
      : rows.map((r) => ({ ...r, other: false }));

  const fillOf = (other: boolean) => (other ? OTHER_FILL : color);
  const shadeOf = (i: number, choice: string, other: boolean) => {
    const base = other ? 0.35 : (SHADES[i] ?? 0.2);
    return selected && choice !== selected ? base * 0.3 : base;
  };

  if (!total) {
    return (
      <div className={cn("py-6 text-center text-xs text-muted-foreground", cells && "bg-white")}>
        {t("stat.noData")}
      </div>
    );
  }

  return (
    <div data-donut="" className={cn("flex items-center gap-4", cells && "bg-white px-3.5 py-3")}>
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <PieChart width={SIZE} height={SIZE} accessibilityLayer={false}>
          <Pie
            data={slices}
            dataKey="count"
            nameKey="choice"
            innerRadius={38}
            outerRadius={62}
            startAngle={90}
            endAngle={-270}
            stroke={brutal ? "#111" : "var(--card)"}
            strokeWidth={brutal ? 1.5 : 2}
            isAnimationActive={false}
          >
            {slices.map((s, i) => (
              <Cell key={s.choice} fill={fillOf(s.other)} fillOpacity={shadeOf(i, s.choice, s.other)} />
            ))}
          </Pie>
        </PieChart>
        {/* Halkanın ortasında bütünün kendisi */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-[19px] font-extrabold leading-none tabular-nums", brutal && "text-[#111]")}>
            {fmtNum(total)}
          </span>
          <span className={cn("mt-1 text-[10px] font-semibold leading-none", brutal ? "text-[#111]/60" : "text-muted-foreground")}>
            {t("chart.donutTotal")}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {slices.map((s, i) => {
          const on = selected === s.choice;
          return (
            <li key={s.choice}>
              <button
                type="button"
                disabled={s.other}
                onClick={() => onSelect(on ? null : s.choice)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left",
                  on && (brutal ? "bg-[#111]/[0.07]" : "bg-[var(--sf-2)]"),
                  s.other && "cursor-default"
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-3 w-3 shrink-0 rounded-[3px]", brutal && "border-[1.5px] border-[#111]")}
                  style={{
                    backgroundColor: fillOf(s.other),
                    opacity: brutal ? 1 : shadeOf(i, s.choice, s.other),
                    // Brütalde kare çerçeveli; tonu rengin kendisinden
                    ...(brutal
                      ? { backgroundColor: `color-mix(in srgb, ${fillOf(s.other)} ${Math.round(shadeOf(i, s.choice, s.other) * 100)}%, #fff)` }
                      : {}),
                  }}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12.5px] leading-tight",
                    on ? "font-extrabold" : "font-semibold",
                    brutal ? "text-[#111]" : "text-foreground"
                  )}
                >
                  {s.choice}
                </span>
                <span className={cn("shrink-0 text-[11.5px] font-bold tabular-nums", brutal ? "text-[#111]/70" : "text-muted-foreground")}>
                  {fmtPct(s.count / total)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
