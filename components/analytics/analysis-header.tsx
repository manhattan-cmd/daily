"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { periodLabel, shiftPeriod, type Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import { useLocale, useT } from "@/lib/i18n";
import { PeriodTabs } from "./period-switcher";

/** Analiz'in rengi — alt menüdeki sekmesi, üst menüsü, durum çubuğu (bkz. statusBarColor) */
export const ANALYSIS_COLOR = "#8ea6ff";

/** Şu an — bileşen dışında: çizim saf kalsın */
const nowMs = () => Date.now();

/**
 * Analizlerin üst menüsü (Brütal) — Ana Sayfa ve Gün sayfasınınki gibi
 * (bkz. HomeMenu, WeekStrip): alt menünün aynası, kenardan kenara Analiz
 * mavisinde şerit, altında tek kalın siyah çizgi; durum çubuğu da aynı mavi.
 * Üstte iki uçta sönük ‹ › (önceki / sonraki dönem), arada dönemin adı ve
 * kısa özeti; altında dönem türleri düz yazı, seçili olan alt menünün seçili
 * sekmesi gibi kalkık beyaz kapsülde; en altta verilen satır (Yer · Özellik
 * seçicileri ya da konum yolu) tek beyaz kartta. Yapışkan.
 *
 * Önce Takvim'inki gibi ortak çizgili bir bloktu: ‹ › iki uzun beyaz sütun,
 * sekmeler ve seçiciler hücre hücre — kaba ve uzun duruyordu, üstündeki
 * krem boşluk durum çubuğundan ayrılıyordu.
 *
 * `period` yoksa (hiç girdi yokken) yalnız başlık.
 */
export function AnalysisMenu({
  period,
  onPick,
  sub,
  below,
  title,
}: {
  period?: Period;
  /** Verilirse dönem URL'ye gitmek yerine buraya bildirilir (sayfa içi seçici) */
  onPick?: (p: Period) => void;
  /** Dönemin adının altındaki satır */
  sub?: ReactNode;
  /** En alttaki satır */
  below?: ReactNode;
  /** Dönem yokken başlık */
  title?: string;
}) {
  const t = useT();
  // Etiket bu dille — period.label sunucuyla tutmuyordu (bkz. periodLabel)
  const locale = useLocale();
  const router = useRouter();
  const go = (p: Period | null) => {
    if (!p) return;
    if (onPick) onPick(p);
    else router.push(routes.period(p.key));
  };
  const prev = period ? shiftPeriod(period, -1) : null;
  const next = period ? shiftPeriod(period, 1) : null;
  // Tamamen gelecekte kalan döneme gidilmez; "Tümü"nün yönü yok
  const nextDisabled = !next || next.start > nowMs();

  return (
    <header
      data-an-nav=""
      // -mx-4: main'in kenar payını aşıp kenardan kenara (alt menü gibi)
      className="sticky top-0 z-30 -mx-4 border-b-[3px] border-[#111] pt-[env(safe-area-inset-top,0px)]"
      style={{ background: ANALYSIS_COLOR }}
    >
      {period ? (
        <>
          <div className="flex items-stretch px-1">
            <Arrow icon={ChevronLeft} label={t("insights.previousPeriod")} disabled={!prev} onClick={() => go(prev)} />
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center pb-1 pt-2.5 text-center">
              <h1 className="max-w-full truncate text-[20px] font-black leading-none tracking-[-0.02em] text-[#111]">
                {periodLabel(period, locale)}
              </h1>
              {sub && <p className="mt-[6px] max-w-full truncate text-[11.5px] font-bold leading-none text-[#111]/65">{sub}</p>}
            </div>
            <Arrow icon={ChevronRight} label={t("insights.nextPeriod")} disabled={nextDisabled} onClick={() => go(next)} />
          </div>
          <PeriodTabs period={period} onPick={onPick} strip />
        </>
      ) : (
        <div className="flex items-center justify-center py-3.5">
          <h1 className="truncate text-[20px] font-black leading-none tracking-[-0.02em] text-[#111]">{title}</h1>
        </div>
      )}
      {below && <div className="px-2.5 pb-2.5">{below}</div>}
    </header>
  );
}

/** Komşu dönem — alt menünün seçili olmayan simgesi gibi sönük ok */
function Arrow({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex w-10 shrink-0 items-center justify-center pt-1.5 text-[#111]/60 active:text-[#111] disabled:text-[#111]/20"
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
}
