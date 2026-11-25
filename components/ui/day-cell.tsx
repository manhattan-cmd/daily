"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { toLocalDateValue } from "@/lib/utils";

/** Dünün anahtarı — bileşen dışında: çizim saf kalsın (yaz saatinde de doğru gün) */
function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateValue(d.getTime());
}

/**
 * Gün etiketi — "Bugün", "Dün", "19 Kasım Perşembe"; bu yıl değilse yılı da.
 * Ara'nın, Yapı › Girdiler'in ve Yapı › Notlar'ın gün hücrelerinde aynı
 * yazılış (bkz. DayCell).
 */
export function useDayLabel(): (key: string) => string {
  const t = useT();
  const tag = intlTag(useLocale());
  const today = toLocalDateValue();
  const yesterday = yesterdayKey();
  const thisYear = new Date().getFullYear();
  return (key: string) => {
    if (key === today) return t("datetime.today");
    if (key === yesterday) return t("datetime.yesterday");
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: y === thisYear ? undefined : "numeric",
    });
  };
}

/**
 * Bir günün hücresi (Brütal) — blok içinde (bkz. SummaryBlock) beyaz hücre:
 * tepesinde siyah tarih etiketi, saç teli çizgi ve o günün sayısı; altında
 * o günün kartları. Günler arasında bloğun kalın çizgisi.
 *
 * Tarih satırı gün sayfasına gider (bkz. routes.day): o günün bütününe —
 * öbür girdilerine, uykusuna, notlarına — bakmak için. Dokunma alanı
 * satırın tamamı (etiket tek başına 22 px, parmağa küçük).
 *
 * Önce Ara'nın sonuçlarındaydı; Yapı › Girdiler ve Notlar'da günler krem
 * ara satırdı, girdiler ayrı hücrede: iki tarih arasında tek girdi kalınca
 * hangi güne ait olduğu okunmuyordu.
 */
export function DayCell({
  day,
  label,
  count,
  onOpen,
  children,
}: {
  /** YYYY-MM-DD */
  day: string;
  /** useDayLabel'dan */
  label: string;
  count: string;
  /** Gün sayfasına geçmeden (Ara kaydırma yerini saklıyor) */
  onOpen?: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <section aria-label={label} className="flex flex-col gap-2 bg-paper px-2.5 pb-2.5 pt-2 text-ink">
      <Link
        href={routes.day(day)}
        prefetch={false}
        data-day-link={day}
        onClick={onOpen}
        aria-label={t("search.openDay", { day: label })}
        className="-mx-1.5 -my-1 flex items-center gap-2 rounded-[12px] px-1.5 py-1 active:bg-ink/[0.06]"
      >
        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-well py-[5px] pl-2.5 pr-1.5 text-[11.5px] font-black leading-none text-[#fff4dc]">
          {label}
          <ChevronRight aria-hidden className="h-3 w-3" strokeWidth={3} />
        </span>
        <span aria-hidden className="h-[1.5px] min-w-0 flex-1 rounded-full bg-ink/12" />
        <span className="shrink-0 font-mono text-[11px] font-bold text-ink/45">{count}</span>
      </Link>
      {children}
    </section>
  );
}

/** Kayıtları güne böl — sıra korunur (liste zaten yeniden eskiye) */
export function groupByDay<T>(items: T[], dayOf: (item: T) => string): { key: string; items: T[] }[] {
  const days: { key: string; items: T[] }[] = [];
  for (const it of items) {
    const key = dayOf(it);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(it);
    else days.push({ key, items: [it] });
  }
  return days;
}
