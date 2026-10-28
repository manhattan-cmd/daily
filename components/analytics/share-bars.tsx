"use client";

import { fmtNum, fmtPct } from "@/lib/analytics";
import { ChevronRight } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type ShareRow = {
  id: string;
  name: string;
  color: string;
  /** Sembol adı — blok satırında (cells) rengin karosunda */
  icon?: string;
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
 * Üç mod var ve farkları matematiksel:
 * - `share` (varsayılan): satırlar bir bütünü paylaşır, yüzdeler %100 eder.
 * - `rate`: her satır KENDİ oranını çizer (8/10 → %80). Yüzdeler %100 etmez,
 *   etmemeli — "sabahları %80, akşamları %50" ikisi de kendi paydasında.
 * - `level`: satırın değeri bir SKALA üzerindeki yeri (1–5 arası ortalama).
 *   Bar boyu değerin aralık içindeki konumu, sağdaki rakam kayıt sayısı.
 *
 * Oran ve skalada pay modu kullanılamaz: ortalamaları toplayıp yüzdeye bölmek
 * anlamsız bir rakam üretir — 3 ve 4 ortalamalı iki kalem "%43 / %57" çıkar.
 */
export function ShareBars({
  rows,
  emptyText = "No data in this range",
  onSelect,
  mode = "share",
  range,
  selectedId = null,
  nudge = false,
  cells = false,
}: {
  rows: ShareRow[];
  emptyText?: string;
  /** Verilirse satırlar tıklanabilir olur (örn. alt kategoriye drill-down) */
  onSelect?: (id: string) => void;
  mode?: "share" | "rate" | "level";
  /** level modunda barın ölçeği (skalanın alt/üst ucu) */
  range?: { min: number; max: number };
  /** Süzgeç olarak seçili satır — diğerleri soluklaşır */
  selectedId?: string | null;
  /** Satır oklarını sırayla bir kez sağa it — "bunlara basılır" ipucu */
  nudge?: boolean;
  /**
   * Brütal blok hücresi (bkz. SummaryBlock): satırlar beyaz hücrede alt
   * alta, aralarında ince siyah çizgi; solda rengin karosu (kare = kategori),
   * adın altında çerçeveli çubuk. Kartçıklar ve gölgeleri yok.
   */
  cells?: boolean;
}) {
  const isRate = mode === "rate";
  const isLevel = mode === "level" && !!range;
  const total = rows.reduce((s, r) => s + r.value, 0);
  // Oran ve skalada sıfır toplam boşluk değil bilgidir ("hiç evet yok",
  // "ortalama tam alt uçta")
  if (!rows.length || (!isRate && !isLevel && total <= 0)) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground/60">
        {emptyText}
      </p>
    );
  }
  const ratioOf = (r: ShareRow) => (r.outOf ? r.value / r.outOf : 0);
  const levelOf = (r: ShareRow) =>
    range && range.max > range.min
      ? Math.min(1, Math.max(0, (r.value - range.min) / (range.max - range.min)))
      : 0;
  const sorted = [...rows].sort((a, b) =>
    isRate ? ratioOf(b) - ratioOf(a) : b.value - a.value
  );

  if (cells) {
    return (
      <div data-share-cells="" className="flex flex-col bg-white">
        {sorted.map((r, i) => {
          const pct = isRate ? ratioOf(r) * 100 : isLevel ? levelOf(r) * 100 : (r.value / total) * 100;
          const canDrill = !!onSelect && r.drillable !== false;
          const dimmed = selectedId !== null && r.id !== selectedId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={canDrill ? () => onSelect!(r.id) : undefined}
              aria-pressed={selectedId !== null ? r.id === selectedId : undefined}
              className={cn(
                "flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left text-[#111] transition-opacity",
                i > 0 && "border-t-[1.5px]",
                canDrill ? "active:bg-[#f5f1e8]" : "cursor-default",
                dimmed && "opacity-40"
              )}
              style={i > 0 ? { borderTopColor: "#111" } : undefined}
            >
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border-2"
                style={{ background: r.color, borderColor: "#111" }}
              >
                {r.icon && <SymbolIcon name={r.icon} size={16} style={{ color: "#111" }} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-black leading-tight">{r.name}</span>
                  <b className="shrink-0 font-mono text-[13px] font-bold leading-tight tabular-nums">
                    {isRate ? fmtPct(ratioOf(r)) : (r.display ?? fmtNum(r.value))}
                  </b>
                  <span className="w-10 shrink-0 text-right font-mono text-[10.5px] font-bold leading-tight text-[#111]/55">
                    {isRate
                      ? `${fmtNum(r.value)}/${fmtNum(r.outOf ?? 0)}`
                      : isLevel
                        ? fmtNum(r.outOf ?? 0)
                        : `%${pct < 1 ? pct.toFixed(1) : Math.round(pct)}`}
                  </span>
                </span>
                <span
                  className="mt-1.5 block h-[9px] overflow-hidden rounded-full border-[1.5px] bg-[#f5f1e8]"
                  style={{ borderColor: "#111" }}
                >
                  <span
                    className="block h-full border-r-[1.5px] transition-[width] duration-300"
                    style={{
                      width: `${isRate || isLevel ? pct : Math.max(pct, 1.5)}%`,
                      background: r.color,
                      borderRightColor: pct > 0 ? "#111" : "transparent",
                    }}
                  />
                </span>
              </span>
              {canDrill ? (
                <ChevronRight
                  className={cn("h-4 w-4 shrink-0", nudge && "chevron-nudge")}
                  strokeWidth={2.75}
                  style={nudge ? { animationDelay: `${700 + i * 90}ms` } : undefined}
                />
              ) : (
                onSelect && <span aria-hidden className="w-4 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", onSelect ? "-mx-1.5 gap-1.5" : "gap-3")}>
      {sorted.map((r, i) => {
        const pct = isRate
          ? ratioOf(r) * 100
          : isLevel
            ? levelOf(r) * 100
            : (r.value / total) * 100;
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
            // Dokunulabilir satır bir KARTÇIK: kendi zemini, sağda ok, basınca
            // hafifçe içe göçer. Çıplak çizgiyken incelemek için basılacağı
            // anlaşılmıyordu. Seçili satır kendi renginde çerçevelenir.
            data-share-row=""
            className={cn(
              "flex min-w-0 items-center gap-2 text-left transition-[opacity,transform,background-color]",
              onSelect && "rounded-xl px-2.5 py-2",
              canDrill
                ? "cursor-pointer bg-[var(--sf-1)] ring-1 ring-inset ring-[var(--ln-1)] hover:bg-[var(--sf-2)] active:scale-[0.985]"
                : "cursor-default",
              dimmed && "opacity-40"
            )}
            style={
              canDrill && selectedId === r.id
                ? {
                    background: `${r.color}1a`,
                    boxShadow: `inset 0 0 0 1px ${r.color}80`,
                  }
                : undefined
            }
          >
            <div className="min-w-0 flex-1">
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
              {/* Skalada yüzde YAZILMAZ — "3,4 ortalamanın %60'ı" diye bir şey
                  yok; sağdaki rakam kaç kayda dayandığını söyler */}
              <span className="shrink-0 min-w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                {isRate
                  ? `${fmtNum(r.value)}/${fmtNum(r.outOf ?? 0)}`
                  : isLevel
                    ? fmtNum(r.outOf ?? 0)
                    : `%${pct < 1 ? pct.toFixed(1) : Math.round(pct)}`}
              </span>
            </div>
            <div data-share-track="" className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  // Oran ve skalada sıfır gerçekten sıfır çizilir; pay modunda
                  // çok küçük dilimler görünsün diye alt sınır var
                  width: `${isRate || isLevel ? pct : Math.max(pct, 1.5)}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
            </div>
            {canDrill && (
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground/60",
                  nudge && "chevron-nudge"
                )}
                style={{
                  ...(selectedId === r.id ? { color: r.color } : null),
                  ...(nudge ? { animationDelay: `${700 + i * 90}ms` } : null),
                }}
              />
            )}
            {/* Oku olmayan satır (kalemin kendi girdileri) okun yerini boş
                tutar — yoksa değerleri ok kadar sağa kayıp hizadan çıkıyordu */}
            {onSelect && !canDrill && <span aria-hidden className="w-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
