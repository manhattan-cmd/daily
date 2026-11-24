"use client";

import { type HTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { periodLabel, shiftPeriod, type Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import { useLocale, useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Analiz'in rengi — alt menüdeki sekmesi, üst menüsü, durum çubuğu (bkz. statusBarColor) */
export const ANALYSIS_COLOR = "#8ea6ff";

/** Şu an — bileşen dışında: çizim saf kalsın */
const nowMs = () => Date.now();

/** Şeridin ortak kabuğu — kenardan kenara Analiz mavisi, altında kalın çizgi */
function Band({
  sticky = false,
  className,
  children,
  ...rest
}: { sticky?: boolean; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <header
      data-an-nav=""
      // -mx-4: main'in kenar payını aşıp kenardan kenara (alt menü gibi)
      className={cn(sticky ? "sticky top-0 z-30" : "relative", "-mx-4 border-b-[3px] border-[#111] pt-[env(safe-area-inset-top,0px)]", className)}
      style={{ background: ANALYSIS_COLOR }}
      {...rest}
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

/** Dönem türünün adı — şeridin özetinde */
const KIND_LABEL: Record<Period["kind"], MessageKey> = {
  day: "range.day",
  week: "range.week",
  month: "range.month",
  year: "range.year",
  all: "insights.all",
  custom: "period.custom",
};

/**
 * Analizlerin üst menüsü (Brütal) — Takvim'in ve Gün'ün şeridi gibi ince:
 * kenardan kenara Analiz mavisi, altında kalın çizgi, yapışkan. İki uçta
 * sönük ‹ › (önceki / sonraki dönem; tamamen gelecekteki döneme gidilmez),
 * ortada dönemin adı, altında neye bakıldığı: siyah dönem türü etiketi,
 * yerin kapsülü (kare = kategori, kendi renginde) ve varsa özelliğinki
 * (daire = özellik).
 *
 * Seçimler (yer, dönem türü, özellik) artık sayfanın başında (bkz.
 * PeriodView'in baş bloğu) — ana sayfa ve gün sayfası gibi: üstte ince
 * menü, beyaz zeminin tepesinde baş, altında pencereler. Eskiden hepsi bu
 * şeridin içinde, küçültülebilen tek çerçeveli bir bloktu (182 px, yapışkan);
 * küçükken kalan hali şimdiki şerit. Kaydırınca baş yukarıda kalır, şerit
 * neye bakıldığını söylemeye devam eder.
 */
export function AnalysisDeck({
  period,
  onPick,
  scope,
}: {
  period: Period;
  /** Verilirse dönem URL'ye gitmek yerine buraya bildirilir (sayfa içi seçici) */
  onPick?: (p: Period) => void;
  /** Neye bakılıyor — yer (kategorinin rengiyle) ve varsa özellik */
  scope?: DeckScope;
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
      <div className="flex items-stretch px-1">
        <StripArrow icon={ChevronLeft} label={t("insights.previousPeriod")} disabled={!prev} onClick={() => go(prev)} />
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center pb-[10px] pt-[11px] text-center text-[#111]">
          <h2 data-an-period="" className="max-w-full truncate text-[19px] font-black leading-none tracking-[-0.02em]">
            {periodLabel(period, locale)}
          </h2>
          <div data-an-scope="" className="mt-[6px] flex h-[19px] max-w-full items-center justify-center gap-1">
            <span className="shrink-0 rounded-[5px] bg-[#111] px-1.5 py-[3px] text-[10px] font-black leading-none text-white">
              {t(KIND_LABEL[period.kind])}
            </span>
            {scope && <ScopeChip name={scope.place.name} color={scope.place.color} shape="square" />}
            {scope?.feature && <ScopeChip name={scope.feature.name} color={scope.feature.color} shape="circle" />}
          </div>
        </div>
        <StripArrow icon={ChevronRight} label={t("insights.nextPeriod")} disabled={nextDisabled} onClick={() => go(next)} />
      </div>
    </Band>
  );
}

/** Şeridin özeti — neye bakılıyor */
export type DeckScope = {
  place: { name: string; color: string };
  feature?: { name: string; color: string };
};

/** Özetin kapsülü — rengin açık tonunda zemin, önünde rengin kendisiyle şekli */
function ScopeChip({ name, color, shape }: { name: string; color: string; shape: "square" | "circle" }) {
  return (
    <span
      className="flex min-w-0 items-center gap-1 rounded-full border-[1.5px] py-[1px] pl-1 pr-1.5 text-[11px] font-extrabold leading-[14px] text-[#111]"
      style={{ borderColor: "#111", background: `color-mix(in srgb, ${color} 38%, white)` }}
    >
      <span
        aria-hidden
        className={cn("h-2.5 w-2.5 shrink-0 border-[1.5px]", shape === "circle" ? "rounded-full" : "rounded-[3px]")}
        style={{ background: color, borderColor: "#111" }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Komşu dönem — Takvim'in ay okları gibi sönük, çerçevesiz */
function StripArrow({
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
      className="flex w-10 shrink-0 items-center justify-center text-[#111]/60 active:text-[#111] disabled:opacity-30"
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
}
