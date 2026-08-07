"use client";

/**
 * Tek sayılık istatistik kutusu — etiket + değer (+ dönem alt yazısı).
 * Değer orantılı rakamlarla (tabular değil) — büyük boyutta daha dengeli okunur.
 */
export function StatTile({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5">
        {accent && (
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: accent }}
          />
        )}
        {/* Etiket ve alt yazı kırpılmaz, sarar: dar kutularda "Daily avg."
            gibi kısaltmalara ya da yarım kalan yazıya gerek kalmasın */}
        <span className="text-[11px] font-medium leading-tight text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1 truncate text-xl font-semibold leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div className="mt-1 text-[10px] leading-tight text-muted-foreground/70">
          {sub}
        </div>
      )}
    </div>
  );
}
