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

/** Dönem satırının zemini — Analiz mavisinin açığı (Ara'daki dönem satırının şeftalisi gibi) */
const PERIOD_TINT = "#e4e9ff";

/** Şu an — bileşen dışında: çizim saf kalsın */
const nowMs = () => Date.now();

/** Şeridin ortak kabuğu — kenardan kenara Analiz mavisi, altında kalın çizgi */
function Band({ sticky = false, children }: { sticky?: boolean; children: ReactNode }) {
  return (
    <header
      data-an-nav=""
      // -mx-4: main'in kenar payını aşıp kenardan kenara (alt menü gibi)
      className={
        (sticky ? "sticky top-0 z-30 " : "") +
        "-mx-4 border-b-[3px] border-[#111] pt-[env(safe-area-inset-top,0px)]"
      }
      style={{ background: ANALYSIS_COLOR }}
    >
      {children}
    </header>
  );
}

/** Hiç girdi yokken (dönem yok) — yalnız bölümün adı */
export function AnalysisMenu({ title }: { title: string }) {
  return (
    <Band>
      <div className="flex items-center justify-center pb-[13px] pt-3.5">
        <h1 className="truncate text-[20px] font-black leading-none tracking-[-0.02em] text-[#111]">{title}</h1>
      </div>
    </Band>
  );
}

/**
 * Analizlerin üst bölümü (Brütal) — kontrol bloğu. Kenardan kenara Analiz
 * mavisinde yapışkan şerit (durum çubuğu da mavi); içinde Ara'nın süzgeç
 * bloğunun dilinde tek çerçeveli blok, satırları arasında ortak 2 px çizgi:
 *
 *  1. Dönem türü — eşit bölmeli anahtar (Gün · Hafta · Ay · Yıl · Tümü),
 *     seçili bölme siyah; sonda takvim bölmesi (tarihe ya da aralığa atla).
 *  2. Dönem — açık mavi satırda çerçeveli ‹ › düğmeleri, ortada dönemin adı
 *     ve kısa özeti ("38 girdi · 6/7. gün"); ileri düğme tamamen
 *     gelecekteki döneme gitmez.
 *  3. Yer · Özellik — iki hücre (bkz. ScopePickers).
 *
 * Analizlerde aşağı inerken ekranın üstünde kalır; altındaki beyaz zeminde
 * yalnız analizler. Bölümün adı yazmıyor — alt menü ve bloğun kendisi
 * nerede olunduğunu söylüyor (okuyucu için gizli başlık var).
 *
 * Önceki denemeler: şeritte dönem + türler + seçiciler (155 px); seçiciler
 * pencerenin benekli başlık çubuğunda; üstte "Analiz" şeridi, altında
 * benekli çubukta soluk oklar, kapsül sekmeler ve gölgeli kart — üç ayrı
 * dil üst üste, kullanıcı beğenmedi.
 *
 * `children` yokken (yüklenirken) seçicilerin yerinde aynı boyda boş satır:
 * seçiciler gelince blok zıplamasın.
 */
export function AnalysisDeck({
  period,
  onPick,
  sub,
  children,
}: {
  period: Period;
  /** Verilirse dönem URL'ye gitmek yerine buraya bildirilir (sayfa içi seçici) */
  onPick?: (p: Period) => void;
  /** Dönemin adının altındaki satır */
  sub?: ReactNode;
  /** Yer · Özellik seçicileri */
  children?: ReactNode;
}) {
  const t = useT();
  // Etiket bu dille — period.label sunucuyla tutmuyordu (bkz. periodLabel)
  const locale = useLocale();
  const router = useRouter();
  const go = (p: Period | null) => {
    if (!p) return;
    if (onPick) onPick(p);
    else router.push(routes.period(p.key), { scroll: false });
  };
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  // Tamamen gelecekte kalan döneme gidilmez; "Tümü"nün yönü yok
  const nextDisabled = !next || next.start > nowMs();

  return (
    <Band sticky>
      <h1 className="sr-only">{t("nav.insights")}</h1>
      <div className="px-2.5 pb-2.5 pt-2.5">
        <section
          data-an-deck=""
          aria-label={t("insights.period")}
          className="grid grid-cols-1 gap-[2px] overflow-hidden rounded-[16px] border-2 border-[#111] bg-[#111] text-[#111] shadow-[3px_3px_0_#111]"
        >
          <div className="bg-white p-1.5">
            <PeriodTabs period={period} onPick={onPick} deck />
          </div>
          <div className="flex items-center gap-2 px-1.5 py-1.5" style={{ background: PERIOD_TINT }}>
            <Arrow icon={ChevronLeft} label={t("insights.previousPeriod")} disabled={!prev} onClick={() => go(prev)} />
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-[16px] font-black leading-tight tracking-tight">{periodLabel(period, locale)}</h2>
              <p className="h-[14px] truncate text-[11px] font-bold leading-[14px] text-[#111]/60">{sub}</p>
            </div>
            <Arrow icon={ChevronRight} label={t("insights.nextPeriod")} disabled={nextDisabled} onClick={() => go(next)} />
          </div>
          {children ?? <div className="h-[48px] bg-white" />}
        </section>
      </div>
    </Band>
  );
}

/** Komşu dönem — çerçeveli kare düğme (Ara'nın dönem okları gibi) */
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-[#111] bg-white text-[#111] shadow-[1.5px_1.5px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-25 disabled:shadow-none"
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.75} />
    </button>
  );
}
