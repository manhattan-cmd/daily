"use client";

import { fmtNum, fmtPct } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type ShareRow = {
  id: string;
  name: string;
  color: string;
  value: number;
  /** Biçimlenmiş değer (birimli); yoksa fmtNum(value) */
  display?: string;
  /** false: bu satırdan inilecek bir kademe yok (kalemin kendi girdileri) */
  drillable?: boolean;
  /** Oran modunda paydası — satırın kendi oranı bundan çıkar */
  outOf?: number;
};

/**
 * Etiketli yatay barlar — kimlik renkten değil, satırdaki isim + değer +
 * yüzdeden okunur (renk yalnızca süsler; CVD güvenliği için ikincil kodlama şart).
 *
 * İki mod var ve farkları matematiksel:
 * - `share` (varsayılan): satırlar bir bütünü paylaşır, yüzdeler %100 eder.
 * - `rate`: her satır KENDİ oranını çizer (8/10 → %80). Yüzdeler %100 etmez,
 *   etmemeli — "sabahları %80, akşamları %50" ikisi de kendi paydasında.
 *   Oran metriğinde pay modu kullanılamaz: ortalamaları/oranları toplayıp
 *   yüzdeye bölmek anlamsız bir rakam üretir.
 */
export function ShareBars({
  rows,
  emptyText = "No data in this range",
  onSelect,
  mode = "share",
  selectedId = null,
}: {
  rows: ShareRow[];
  emptyText?: string;
  /** Verilirse satırlar tıklanabilir olur (örn. alt kategoriye drill-down) */
  onSelect?: (id: string) => void;
  mode?: "share" | "rate";
  /** Süzgeç olarak seçili satır — diğerleri soluklaşır */
  selectedId?: string | null;
}) {
  const isRate = mode === "rate";
  const total = rows.reduce((s, r) => s + r.value, 0);
  // Oran modunda sıfır toplam boşluk değil bilgidir ("hiç evet yok")
  if (!rows.length || (!isRate && total <= 0)) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground/60">
        {emptyText}
      </p>
    );
  }
  const ratioOf = (r: ShareRow) => (r.outOf ? r.value / r.outOf : 0);
  const sorted = [...rows].sort((a, b) =>
    isRate ? ratioOf(b) - ratioOf(a) : b.value - a.value
  );

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((r) => {
        const pct = isRate ? ratioOf(r) * 100 : (r.value / total) * 100;
        // Kalemin kendi girdileri satırı tıklanabilir görünmesin
        const canDrill = !!onSelect && r.drillable !== false;
        // Bir satır süzgeç olarak seçiliyse diğerleri geri çekilir
        const dimmed = selectedId !== null && r.id !== selectedId;
        return (
          <button
            key={r.id}
            type="button"
            onClick={canDrill ? () => onSelect!(r.id) : undefined}
            aria-pressed={selectedId !== null ? r.id === selectedId : undefined}
            className={cn(
              "min-w-0 text-left transition-opacity",
              canDrill ? "cursor-pointer hover:opacity-70" : "cursor-default",
              dimmed && "opacity-40"
            )}
          >
            <div className="flex items-baseline gap-1.5 mb-1">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0 self-center"
                style={{ backgroundColor: r.color }}
              />
              <span className="text-xs font-medium truncate flex-1">
                {r.name}
              </span>
              {/* Oranda kalın rakam yüzdenin kendisi, payı yanında küçük durur —
                  "%80" ana bilgi, "8/10" onu doğrulayan ayrıntı */}
              <span className="text-xs font-semibold shrink-0">
                {isRate ? fmtPct(ratioOf(r)) : (r.display ?? fmtNum(r.value))}
              </span>
              <span className="shrink-0 min-w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                {isRate
                  ? `${fmtNum(r.value)}/${fmtNum(r.outOf ?? 0)}`
                  : `%${pct < 1 ? pct.toFixed(1) : Math.round(pct)}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  // Oranda sıfır gerçekten sıfır çizilir; pay modunda çok küçük
                  // dilimler görünsün diye alt sınır var
                  width: `${isRate ? pct : Math.max(pct, 1.5)}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
