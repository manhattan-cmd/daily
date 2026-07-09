"use client";

import { useRouter } from "next/navigation";
import {
  allPeriod,
  dayPeriod,
  monthPeriod,
  weekPeriod,
  yearPeriod,
} from "@/lib/period";
import { cn } from "@/lib/utils";
import { PeriodJump } from "./period-jump";

/**
 * Dönem hızlı atlama çipleri — Bugün / Bu Hafta / Bu Ay / Bu Yıl / Tümü + Özel.
 * Görüntülenen dönem çiplerden biriyse o çip vurgulanır; "Bu Hafta" analiz
 * sekmesinin default görünümü olduğundan oraya /analytics ile gidilir (geri
 * yığınında tek giriş noktası kalsın diye).
 */
export function PeriodQuickNav({ activeKey }: { activeKey: string }) {
  const router = useRouter();
  const now = new Date().getTime();
  const chips: { label: string; key: string; href: string }[] = [
    { label: "Bugün", key: dayPeriod(now).key, href: "" },
    { label: "Bu Hafta", key: weekPeriod(now).key, href: "/analytics" },
    { label: "Bu Ay", key: monthPeriod(now).key, href: "" },
    { label: "Bu Yıl", key: yearPeriod(now).key, href: "" },
    { label: "Tümü", key: allPeriod().key, href: "" },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
      {chips.map((c) => {
        const active = activeKey === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() =>
              !active &&
              router.push(c.href || `/analytics/period/${c.key}`)
            }
            className={cn(
              "rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0",
              active
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {c.label}
          </button>
        );
      })}
      <PeriodJump />
    </div>
  );
}
