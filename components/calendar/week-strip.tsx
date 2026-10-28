"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { getRangeDaySummary } from "@/lib/db/queries";
import { prefetchDayOnPress } from "@/lib/db/day-cache";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn, toLocalDateValue } from "@/lib/utils";

/**
 * Gün sayfasının üst menüsü (Brütal) — başlık değil, yalnız gezinme; alt
 * menünün aynası: kenardan kenara beyaz şerit, altında tek kalın siyah
 * çizgi, hücre çerçevesi yok. İki uçta önceki / sonraki gün, aralarında
 * haftanın yedi günü (kısa adı, numarası, altında o gün girdi alan
 * kategorilerin renkleri). Açık günün numarası alt menünün seçili sekmesi
 * gibi Takvim'in yeşilinde çerçeveli, kalkık küçük kapsülde; bugün yalnız
 * çerçeveli; henüz gelmemiş günler soluk. Dokununca o gün. Yapışkan.
 *
 * Önce üstünde ay ve yıl yazan bir başlık hücresi vardı (gereksiz: gün
 * sayfası kendini anlatıyor, tarih altındaki özet bloğunda), sonra ortak
 * çizgili kalın bir blok oldu — kullanıcı alt menü gibi ince, kibar
 * istedi.
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
    <header
      data-day-nav=""
      // -mx-4: main'in kenar payını aşıp kenardan kenara (alt menü gibi)
      className="sticky top-0 z-30 -mx-4 border-b-[3px] border-[#111] bg-white pt-[env(safe-area-inset-top,0px)]"
    >
      <nav data-week-strip="" aria-label={t("nav.calendar")} className="flex items-stretch px-1">
        <Arrow icon={ChevronLeft} date={shift(-1)} label={t("day.prev")} />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {days.map((x) => {
            const key = toLocalDateValue(x.getTime());
            const on = key === date;
            const isToday = key === today;
            // Anahtarlar YYYY-MM-DD: sözlük sırası tarih sırası
            const future = key > today;
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
                  "flex min-w-0 flex-col items-center gap-[3px] pb-[7px] pt-2 text-[#111]",
                  future && !on && "opacity-35"
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase leading-none tracking-wide",
                    on ? "text-[#111]" : "text-[#111]/50"
                  )}
                >
                  {x.toLocaleDateString(tag, { weekday: "short" }).replace(".", "")}
                </span>
                <span
                  className={cn(
                    "rounded-full border-[1.5px] px-[7px] font-mono text-[14px] font-bold leading-[19px] tabular-nums transition-transform",
                    on ? "-translate-y-px bg-[#7ae582] shadow-[2px_2px_0_#111]" : !isToday && "text-[#111]/75"
                  )}
                  // Çerçeve rengi satır içi: globals.css'teki katmansız
                  // "* { border-color }" kuralı border-transparent'ı eziyor
                  style={{ borderColor: on || isToday ? "#111" : "transparent" }}
                >
                  {x.getDate()}
                </span>
                {/* Girdi alan kategoriler — boş günde yer tutucu, satır zıplamasın */}
                <span className="flex h-1 items-center gap-[2px]">
                  {colors.map((c, i) => (
                    <span key={i} className="h-1 w-1 rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
        <Arrow icon={ChevronRight} date={shift(1)} label={t("day.next")} />
      </nav>
    </header>
  );
}

/** Komşu gün — alt menünün seçili olmayan simgesi gibi sönük ok */
function Arrow({ icon: Icon, date, label }: { icon: LucideIcon; date: string; label: string }) {
  return (
    <Link
      href={routes.day(date)}
      prefetch={false}
      {...prefetchDayOnPress(date)}
      aria-label={label}
      title={label}
      className="flex w-9 shrink-0 items-center justify-center text-[#111]/50 active:text-[#111]"
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} />
    </Link>
  );
}
