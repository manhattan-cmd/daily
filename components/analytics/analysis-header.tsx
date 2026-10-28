"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HeaderBlock, HeaderOverline, HeaderTile, HeaderTitle } from "@/components/ui/header-block";
import { periodLabel, shiftPeriod, type Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import { useLocale, useT } from "@/lib/i18n";
import { PeriodTabs } from "./period-switcher";

/** Analiz'in rengi — alt menüdeki sekmesi, başlığı, Kategori dağılımı bloğu */
export const ANALYSIS_COLOR = "#8ea6ff";

/** Şu an — bileşen dışında: çizim saf kalsın */
const nowMs = () => Date.now();

/**
 * Analiz'in başlığı (Brütal) — Takvim'in başlık bloğunun dili: iki yanda
 * ‹ › karoları (önceki / sonraki dönem), ortada mavi benekli hücrede ANALİZ
 * etiketi, dönemin adı ve altında kısa özeti (kaç girdi, devam eden dönemde
 * kaçıncı gün). Altında dönem sekmeleri hücre hücre (Yapı sekmeleri gibi),
 * en altta verilen satır — Yer ve Özellik seçicileri.
 *
 * Eskiden ortada ince oklu bir tarih kapsülü, altında çerçeveli bir sekme
 * rayı ve gölgeli seçici kartı vardı: bloğun içinde üç ayrı çerçeve.
 */
export function AnalysisHeader({
  period,
  sub,
  below,
}: {
  period: Period;
  /** Dönemin adının altındaki satır */
  sub?: ReactNode;
  /** Sekmelerin altındaki son satır (seçiciler) */
  below?: ReactNode;
}) {
  const t = useT();
  // Etiket bu dille — period.label sunucuyla tutmuyordu (bkz. periodLabel)
  const locale = useLocale();
  const router = useRouter();
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  // Tamamen gelecekte kalan döneme gidilmez; "Tümü"nün yönü yok
  const nextDisabled = !next || next.start > nowMs();
  const label = periodLabel(period, locale);
  return (
    <HeaderBlock
      color={ANALYSIS_COLOR}
      center
      leading={
        <HeaderTile
          icon={ChevronLeft}
          onClick={() => prev && router.push(routes.period(prev.key))}
          disabled={!prev}
          ariaLabel={t("insights.previousPeriod")}
          width={46}
        />
      }
      trailing={
        <HeaderTile
          icon={ChevronRight}
          onClick={() => next && router.push(routes.period(next.key))}
          disabled={nextDisabled}
          ariaLabel={t("insights.nextPeriod")}
          width={46}
        />
      }
      rows={
        <>
          <PeriodTabs period={period} cells />
          {below}
        </>
      }
    >
      <HeaderOverline color={ANALYSIS_COLOR} center>
        {t("nav.insights")}
      </HeaderOverline>
      {/* Gün dönemi uzun ("10 Eylül 2026 Perşembe") — iki satıra sarıp
          başlığı uzatmasın diye biraz küçük */}
      <HeaderTitle size={label.length > 19 ? 18 : 22} center>
        {label}
      </HeaderTitle>
      {sub && <p className="mt-1 truncate text-[12px] font-bold leading-tight text-[#111]/70">{sub}</p>}
    </HeaderBlock>
  );
}
