"use client";

import { useRouter } from "next/navigation";
import {
  allPeriod,
  dayPeriod,
  monthPeriod,
  weekPeriod,
  yearPeriod,
} from "@/lib/period";
import { SectionNav, chipClass } from "@/components/ui/section-nav";
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
    { label: "Today", key: dayPeriod(now).key, href: "" },
    { label: "This week", key: weekPeriod(now).key, href: "/analytics" },
    { label: "This month", key: monthPeriod(now).key, href: "" },
    { label: "This year", key: yearPeriod(now).key, href: "" },
    { label: "All", key: allPeriod().key, href: "" },
  ];

  return (
    <SectionNav>
      {chips.map((c) => {
        const active = activeKey === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() =>
              !active && router.push(c.href || `/analytics/period/${c.key}`)
            }
            className={chipClass(active)}
            aria-current={active ? "page" : undefined}
          >
            {c.label}
          </button>
        );
      })}
      <PeriodJump />
    </SectionNav>
  );
}
