"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { periodLabel, shiftPeriod, type Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PeriodTabs } from "./period-switcher";

/** Analiz'in rengi — alt menüdeki sekmesi, üst menüsü, durum çubuğu (bkz. statusBarColor) */
export const ANALYSIS_COLOR = "#8ea6ff";

/** Şu an — bileşen dışında: çizim saf kalsın */
const nowMs = () => Date.now();

/**
 * Analizlerin üst menüsü (Brütal) — Ana Sayfa ve Gün sayfasınınki gibi
 * şerit: kenardan kenara Analiz mavisi, altında tek kalın siyah çizgi;
 * durum çubuğu da aynı mavi. İçinde yalnız bölümün adı. Yapışkan değil:
 * kaydırınca ekranın üstünde pencerenin üst bölümü kalır (dönem, dönem
 * türleri, Yer · Özellik — bkz. AnalysisHead).
 *
 * Önce dönem ve türleri burada, seçiciler en alt satırdaydı (155 px,
 * yapışkan); kullanıcı tarih ve yer seçiminin pencerenin ayrı üst bölümünde
 * toplanmasını istedi.
 */
export function AnalysisMenu({ title }: { title: string }) {
  return (
    <header
      data-an-nav=""
      // -mx-4: main'in kenar payını aşıp kenardan kenara (alt menü gibi)
      className="-mx-4 border-b-[3px] border-[#111] pt-[env(safe-area-inset-top,0px)]"
      style={{ background: ANALYSIS_COLOR }}
    >
      <div className="flex items-center justify-center pb-[13px] pt-3.5">
        <h1 className="truncate text-[20px] font-black leading-none tracking-[-0.02em] text-[#111]">{title}</h1>
      </div>
    </header>
  );
}

/** Bölüm bantlarının tram benekleri (bkz. SummaryBlock link) */
const BAND = {
  backgroundColor: ANALYSIS_COLOR,
  backgroundImage: "radial-gradient(rgba(17, 17, 17, 0.16) 1.2px, transparent 1.5px)",
  backgroundSize: "11px 11px",
};

/**
 * Analiz penceresinin üst bölümü (Brütal) — Gün sayfasının ve Ana Sayfa'nın
 * başlık çubuğu gibi, beyaz sayfa zemininin (bkz. PageSheet) tepesinde
 * kenardan kenara; benekli Analiz mavisi, altında 3 px kalın çizgi. İçinde
 * analizlerde gezinmenin hepsi:
 *
 *  1. ‹ dönemin adı › — altında kısa özeti ("10 girdi · 6/7. gün"); ileri
 *     ok tamamen gelecekteki döneme gitmez.
 *  2. Dönem türleri (Gün · Hafta · Ay · Yıl · Tümü) ve tarihe atlama.
 *  3. Yer · Özellik seçicileri beyaz kartta.
 *
 * Yapışkan: analizlerde aşağı inerken ekranın üstünde kalır. Yerinde
 * dururken köşeleri pencereninkiyle bir; yapışınca düz — yuvarlak köşelerin
 * arkasından kayan kartlar görünmesin.
 *
 * `children` yokken (yüklenirken) seçicilerin yerinde aynı boyda boş kart:
 * baş gelince sayfa zıplamasın.
 */
export function AnalysisHead({
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

  // Yapıştı mı — başın hemen üstündeki işaret (zeminin üst payı) ekranın
  // tepesinden çıkınca baş yapışmıştır
  const mark = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = mark.current;
    const root = document.querySelector("[data-app-main]");
    if (!el || !root) return;
    const io = new IntersectionObserver(
      ([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0)),
      { root, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Zeminin üst payı (12 px) — başın yapıştığını söyleyen işaret */}
      <div ref={mark} aria-hidden className="-mt-3 h-3" />
      <div
        data-an-head=""
        data-stuck={stuck ? "" : undefined}
        // Zeminin yan payını (6 px) aşıp kenardan kenara
        className={cn(
          "sticky top-0 z-20 -mx-1.5 mb-4 border-b-[3px] border-[#111] text-[#111]",
          stuck ? "rounded-none" : "rounded-t-[18px]"
        )}
        style={BAND}
      >
        <div className="flex items-stretch px-1">
          <Arrow icon={ChevronLeft} label={t("insights.previousPeriod")} disabled={!prev} onClick={() => go(prev)} />
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center pb-0.5 pt-3 text-center">
            <h2 className="max-w-full truncate text-[19px] font-black leading-none tracking-[-0.02em]">
              {periodLabel(period, locale)}
            </h2>
            <p className="mt-[6px] h-3 max-w-full truncate text-[11.5px] font-bold leading-3 text-[#111]/65">{sub}</p>
          </div>
          <Arrow icon={ChevronRight} label={t("insights.nextPeriod")} disabled={nextDisabled} onClick={() => go(next)} />
        </div>
        <PeriodTabs period={period} onPick={onPick} strip />
        <div className="px-2.5 pb-2.5">
          {children ?? <div className="h-[46px] rounded-[12px] border-2 border-[#111] bg-white shadow-[2px_2px_0_#111]" />}
        </div>
      </div>
    </>
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
