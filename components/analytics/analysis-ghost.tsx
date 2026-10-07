"use client";

import { ArrowUp } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Henüz kategori seçilmemişken kademe yığınının YERİNİ tutan hayalet kart.
 * Açıklama paragrafı yerine açılacak analizin silüetini gösterir: kesik
 * çizgili çerçeve, soluk çubuklar ve bir çizgi grafiği. Ortadaki yukarı ok
 * dağılım satırlarını işaret eder — "oradan seç, burası dolar".
 *
 * Silüet en büyük kategorinin renginde; karta basmak doğrudan onu açar
 * (seçmeyi bilmeyen için kestirme).
 */
export function AnalysisGhost({
  color,
  onPick,
}: {
  /** En büyük kategorinin rengi */
  color: string;
  /** Karta basılınca en büyük kategoriyi aç */
  onPick: () => void;
}) {
  const t = useT();
  const bars = [0.85, 0.6, 0.42, 0.28];
  return (
    <button
      type="button"
      onClick={onPick}
      className="ghost-in relative w-full overflow-hidden rounded-2xl border border-dashed border-[var(--ln-2)] p-4 text-left active:scale-[0.99] transition-transform"
    >
      {/* Silüet — açılacak analizin kaba hatları */}
      <div aria-hidden className="pointer-events-none flex flex-col gap-3 opacity-[0.22]">
        <div className="h-2.5 w-28 rounded-full bg-muted-foreground/60" />
        <div className="flex flex-col gap-2">
          {bars.map((w, i) => (
            <div key={i} className="h-2 rounded-full" style={{ width: `${w * 100}%`, background: color }} />
          ))}
        </div>
        <svg viewBox="0 0 300 70" className="mt-1 h-16 w-full" preserveAspectRatio="none">
          <path
            d="M0 52 C30 46 45 30 75 34 S120 58 150 44 S200 12 230 22 S275 40 300 18"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M0 52 C30 46 45 30 75 34 S120 58 150 44 S200 12 230 22 S275 40 300 18 L300 70 L0 70 Z"
            fill={color}
            opacity="0.25"
          />
        </svg>
      </div>

      {/* Yönlendirme — silüetin ortasında, yukarıyı gösteren ok */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center"
        // Yazı silüet çizgilerine binmesin: ortası zemin rengine söner
        style={{
          background:
            "radial-gradient(ellipse 62% 58% at 50% 50%, var(--background) 55%, transparent 100%)",
        }}
      >
        <span
          className="ghost-arrow flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}55` }}
        >
          <ArrowUp className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold">{t("insights.pickCategory")}</span>
        <span className="text-[11px] text-muted-foreground">{t("insights.pickCategoryHint")}</span>
      </div>
    </button>
  );
}
