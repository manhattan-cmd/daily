"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { allPeriod, parsePeriodKey, type Period } from "@/lib/period";
import { PeriodNav, PeriodTabs } from "./period-switcher";

/**
 * Kategori / alt kategori analizinin dönemi — ?p= (lib/period anahtarı),
 * yoksa "Tümü". Seçim URL'ye yazılır (geçmişe yeni kayıt açmadan): geri
 * dönüldüğünde ya da sayfa yenilendiğinde bakılan dönem korunur.
 */
export function useScopePeriod(): [Period, (p: Period) => void] {
  const params = useSearchParams();
  const [period, setPeriod] = useState<Period>(
    () => parsePeriodKey(params.get("p") ?? "all") ?? allPeriod()
  );
  const pick = (p: Period) => {
    setPeriod(p);
    const url = new URL(window.location.href);
    url.searchParams.set("p", p.key);
    url.searchParams.delete("range");
    window.history.replaceState(null, "", url.toString());
  };
  return [period, pick];
}

/** Ana analizdeki zaman menüsünün sayfa içi hali: ‹ dönem › ve altında
 *  Gün · Hafta · Ay · Yıl · Tümü */
export function ScopePeriodBar({
  period,
  onPick,
}: {
  period: Period;
  onPick: (p: Period) => void;
}) {
  return (
    <div
      data-scope-period=""
      className="mb-4 flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-3 pb-0 pt-2.5"
    >
      <PeriodNav period={period} onPick={onPick} />
      <PeriodTabs period={period} onPick={onPick} />
    </div>
  );
}
