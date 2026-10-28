"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { getRangeDaySummary } from "@/lib/db/queries";
import { prefetchDayOnPress } from "@/lib/db/day-cache";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { bandDots } from "@/components/ui/header-block";
import { cn, toLocalDateValue } from "@/lib/utils";

/**
 * Gün sayfasının üst menüsü (Brütal) — başlık değil, yalnız gezinme: iki
 * uçta Takvim'in yeşilinde önceki / sonraki gün, aralarında haftanın yedi
 * günü ortak çizgili hücrelerde (günün kısa adı, numarası, altında o gün
 * girdi alan kategorilerin renkleri — takvimdeki işaretler gibi). Açık gün
 * siyah, bugün yeşil etiketli; dokununca o gün.
 *
 * İlk denemede bunun üstünde ay ve yıl yazan bir başlık hücresi vardı;
 * kullanıcıya göre gereksiz — gün sayfası kendini anlatıyor (tarih hemen
 * altındaki özet bloğunda), tepedeki iş gezinmek.
 */
export function WeekStrip({ date }: { date: string }) {
  const t = useT();
  const tag = intlTag(useLocale());
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const shift = (n: number) => toLocalDateValue(new Date(y, m - 1, d + n).getTime());
  // Pazartesiden başlar
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const start = days[0].getTime();
  const end = new Date(days[6].getFullYear(), days[6].getMonth(), days[6].getDate(), 23, 59, 59, 999).getTime();
  const summary = useLiveQuery(() => getRangeDaySummary(start, end, 3), [start, end]);
  const today = toLocalDateValue();

  return (
    <nav data-week-strip="" aria-label={t("nav.calendar")} className="flex gap-[2px]">
      <Arrow icon={ChevronLeft} date={shift(-1)} label={t("day.prev")} />
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-[2px]">
        {days.map((x) => {
          const key = toLocalDateValue(x.getTime());
          const on = key === date;
          const isToday = key === today;
          const colors = summary?.get(key)?.colors ?? [];
          return (
            <Link
              key={key}
              href={routes.day(key)}
              prefetch={false}
              {...prefetchDayOnPress(key)}
              aria-current={on ? "date" : undefined}
              aria-label={x.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" })}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 pb-2 pt-2.5",
                on ? "bg-[#111] text-[#fff4dc]" : "bg-white text-[#111] active:bg-[#f5f1e8]"
              )}
            >
              <span className={cn("text-[9.5px] font-black uppercase leading-none tracking-wider", !on && "opacity-55")}>
                {x.toLocaleDateString(tag, { weekday: "short" }).replace(".", "")}
              </span>
              <span
                className={cn(
                  "rounded-[6px] px-1 font-mono text-[16px] font-bold leading-[20px] tabular-nums",
                  on ? "text-[#7ae582]" : isToday && "bg-[#7ae582]"
                )}
              >
                {x.getDate()}
              </span>
              {/* Girdi alan kategoriler — boş günde yer tutucu, satır zıplamasın */}
              <span className="flex h-[6px] items-center gap-[2px]">
                {colors.map((c, i) => (
                  <span
                    key={i}
                    className={cn("h-[6px] w-[6px] rounded-full", !on && "border border-[#111]")}
                    style={{ background: c }}
                  />
                ))}
              </span>
            </Link>
          );
        })}
      </div>
      <Arrow icon={ChevronRight} date={shift(1)} label={t("day.next")} />
    </nav>
  );
}

/** Komşu gün — Takvim'in yeşilinde benekli dik karo */
function Arrow({ icon: Icon, date, label }: { icon: LucideIcon; date: string; label: string }) {
  return (
    <Link
      href={routes.day(date)}
      prefetch={false}
      {...prefetchDayOnPress(date)}
      aria-label={label}
      title={label}
      className="flex w-[38px] shrink-0 items-center justify-center text-[#111] active:brightness-95"
      style={bandDots("#7ae582")}
    >
      <Icon className="h-5 w-5" strokeWidth={2.75} />
    </Link>
  );
}
