"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, RotateCcw } from "lucide-react";
import { cn, toLocalDateTimeValue } from "@/lib/utils";
import { intlTag, useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { TimeWheel } from "@/components/ui/time-wheel";

/** Şu an — çizimde değil açılışta/olayda okunur, saf kalsın diye modülde */
const nowDate = () => new Date();
const DAY = 86400000;

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (v: string) => v.split("T")[0] ?? "";
const timeOf = (v: string) => v.split("T")[1] ?? "12:00";

/** "YYYY-MM-DDTHH:mm" değerinin gününü kaydır, saat aynı kalsın */
function shiftDay(v: string, days: number): string {
  const [y, m, dd] = dayOf(v).split("-").map(Number);
  const nd = new Date(y, m - 1, dd + days);
  return `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}T${timeOf(v)}`;
}

/** Günün başlangıcı (yerel) */
const dayStart = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** Gerçek bugüne göre kaç gün ötede (DST'ye karşı yuvarlanır) */
const offsetFrom = (ymd: string, todayMs: number) => Math.round((dayStart(ymd) - todayMs) / DAY);

const shortDay = (ymd: string) =>
  new Date(dayStart(ymd)).toLocaleDateString(intlTag(), { day: "numeric", month: "short" });

/** Penceredeki büyük gün yazısı — "12 Ekim Pazartesi" */
const longDay = (ymd: string) =>
  new Date(dayStart(ymd)).toLocaleDateString(intlTag(), { day: "numeric", month: "long", weekday: "long" });

const todayStartMs = () => {
  const n = nowDate();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
};

/**
 * GİRDİNİN ZAMANI — başlığın altında tek bir çubuk ("Dün · 12:03"). Dokununca
 * zaman penceresi açılır: büyük gün yazısı (dokununca telefonun takvimi),
 * hızlı seçimler (Önceki gün · Şu an · Sonraki gün), saat çarkı.
 *
 * Bütün adlar GERÇEK bugüne göre: eskiden seçenekler sayfanın gününe göre
 * "Dün · Şimdi · Yarın" diye yazıyordu; dünün sayfasında "Şimdi" aslında
 * dünü seçiyordu ve girdi sanılandan başka güne düşüyordu. Eski bir günün
 * sayfasından açılınca varsayılan o gün; gün değiştirildiyse pencerede
 * "Sayfanın günü"ne tek dokunuşla dönülür.
 */
export function EntryTime({
  occurredAt,
  onChange,
  baseDate,
  accent,
}: {
  /** "YYYY-MM-DDTHH:mm" */
  occurredAt: string;
  onChange: (v: string) => void;
  /** Girdinin açıldığı sayfanın günü ("YYYY-MM-DD") */
  baseDate: string;
  accent: string;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  // Bugün — açılışta okunur; pencere her açılışta tazeler (gece yarısı geçtiyse)
  const [todayMs, setTodayMs] = useState(todayStartMs);
  const [draft, setDraft] = useState<string | null>(null);
  // "Şu an"ın değeri — dokunulduğu anda yazılır, çizimde okunmaz
  const [nowValue, setNowValue] = useState<string | null>(null);

  /** Gün adı: Bugün / Dün / Yarın, yoksa "12 Eki" */
  const dayName = (ymd: string) => {
    const off = offsetFrom(ymd, todayMs);
    return off === 0
      ? t("entry.timeToday")
      : off === -1
        ? t("entry.timeYesterday")
        : off === 1
          ? t("entry.timeTomorrow")
          : shortDay(ymd);
  };
  /** Büyük yazının yanındaki göreli etiket */
  const relative = (ymd: string) => {
    const off = offsetFrom(ymd, todayMs);
    if (Math.abs(off) <= 1) return dayName(ymd);
    return off < 0 ? t("entry.timeDaysAgo", { n: -off }) : t("entry.timeDaysLater", { n: off });
  };

  const open = () => {
    setTodayMs(todayStartMs());
    setNowValue(null);
    const n = nowDate();
    setDraft(occurredAt || `${baseDate}T${pad(n.getHours())}:${pad(n.getMinutes())}`);
  };
  const close = () => setDraft(null);
  const commit = () => {
    if (draft) onChange(draft);
    close();
  };
  const toNow = () => {
    const n = nowDate();
    const v = toLocalDateTimeValue(
      new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), 0, 0).getTime()
    );
    setNowValue(v);
    setDraft(v);
  };

  const summary = occurredAt ? `${dayName(dayOf(occurredAt))} · ${timeOf(occurredAt)}` : "—";

  // ── Biçim ──
  const quick = (on: boolean) =>
    cn(
      "relative flex h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-5 leading-none transition-[background-color,transform] active:scale-[0.97]",
      brutal
        ? on
          ? "border-2 border-[#111] bg-[#111] text-[#FFF4DC]"
          : "border-2 border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111]"
        : on
          ? "text-white"
          : "bg-[var(--sf-2)] text-foreground hover:bg-[var(--sf-3)]"
    );

  const dDay = draft ? dayOf(draft) : "";
  const prev = draft ? shiftDay(draft, -1) : "";
  const next = draft ? shiftDay(draft, 1) : "";
  const onPage = dDay === baseDate;
  const nowOn = !!draft && draft === nowValue;

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        data-time-stamp=""
        className="mt-1 flex h-7 w-fit max-w-full items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold transition-[background-color,transform] active:scale-95"
        style={{ background: `${accent}26`, color: accent }}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>

      {/* Zaman penceresi — formun üstünde ortada; boşluğa dokunmak = vazgeç */}
      {draft !== null && (
        <div
          data-no-swipe=""
          className="animate-in fade-in absolute inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]"
          onClick={close}
        >
          <div
            role="dialog"
            aria-label={t("entry.time")}
            onClick={(e) => e.stopPropagation()}
            data-time-window=""
            className={cn(
              "zoom-in-95 animate-in flex w-full max-w-[330px] flex-col gap-3 p-4",
              brutal
                ? "rounded-[20px] border-[3px] border-[#111] bg-[#FFF4DC] text-[#111] shadow-[6px_6px_0_#111]"
                : "rounded-3xl bg-card shadow-[0_24px_60px_-16px_rgba(0,0,0,0.9)] ring-1 ring-[var(--ln-2)]"
            )}
          >
            {/* Başlık: etiket ve göreli gün */}
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-[11px] font-bold uppercase tracking-[0.12em]", brutal ? "text-[#111]/60" : "text-muted-foreground")}>
                {t("entry.time")}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                  brutal ? "border-[1.5px] border-[#111] bg-[#FFD23F] text-[#111]" : "text-white"
                )}
                style={brutal ? undefined : { background: accent }}
              >
                {relative(dDay)}
              </span>
            </div>
            {/* Büyük gün — dokununca telefonun takvimi */}
            <label className={cn("relative -mt-1 block cursor-pointer rounded-xl", !brutal && "hover:bg-[var(--sf-2)]")}>
              <span className={cn("block text-[22px] leading-tight tracking-tight", brutal ? "font-black" : "font-semibold")}>
                {longDay(dDay)}
              </span>
              <input
                type="date"
                value={dDay}
                onChange={(e) => e.target.value && setDraft(`${e.target.value}T${timeOf(draft)}`)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                aria-label={t("entry.timePickDay")}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {/* İpucu satırı — yüksekliği sabit: gün sayfanın gününden ayrıldıysa
                aynı yerde geri dönüş düğmesi (pencere büyüyüp küçülmesin) */}
            <div className="-mt-2.5 flex h-7 items-center">
              {onPage ? (
                <span className={cn("text-xs", brutal ? "font-semibold text-[#111]/60" : "text-muted-foreground")}>
                  {t("entry.timePickDay")}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDraft(`${baseDate}T${timeOf(draft)}`)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-bold",
                    brutal ? "border-[1.5px] border-[#111] bg-white text-[#111]" : "bg-[var(--sf-2)] text-foreground"
                  )}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("entry.timeBackToPage", { day: shortDay(baseDate) })}
                </button>
              )}
            </div>

            {/* Hızlı seçimler — kısa sabit adlar, altında gidilecek gün */}
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={quick(false)} onClick={() => setDraft(prev)}>
                <ChevronLeft className="absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70" />
                <span className="text-xs font-bold">{t("entry.timePrev")}</span>
                <span className="text-[10.5px] font-medium opacity-65">{shortDay(dayOf(prev))}</span>
              </button>
              <button
                type="button"
                className={quick(nowOn)}
                style={!brutal && nowOn ? { background: accent } : undefined}
                onClick={toNow}
              >
                <span className="text-xs font-bold">{t("entry.timeAtNow")}</span>
                <span className="text-[10.5px] font-medium opacity-65">{t("entry.timeToday")}</span>
              </button>
              <button type="button" className={quick(false)} onClick={() => setDraft(next)}>
                <span className="text-xs font-bold">{t("entry.timeNext")}</span>
                <span className="text-[10.5px] font-medium opacity-65">{shortDay(dayOf(next))}</span>
                <ChevronRight className="absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70" />
              </button>
            </div>

            {/* Saat — kendi çarkı (telefonun seçicisi pencereyle uyumsuzdu) */}
            <TimeWheel value={timeOf(draft)} onChange={(time) => setDraft(`${dDay}T${time}`)} accent={accent} />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={close}
                className={cn(
                  "h-11 rounded-2xl text-[14px]",
                  brutal
                    ? "border-2 border-[#111] bg-white font-black text-[#111] shadow-[3px_3px_0_#111]"
                    : "bg-[var(--sf-2)] font-semibold text-foreground/85 hover:bg-[var(--sf-3)]"
                )}
              >
                {t("action.cancel")}
              </button>
              <button
                type="button"
                onClick={commit}
                className={cn(
                  "h-11 rounded-2xl text-[14px] transition-opacity active:opacity-85",
                  brutal
                    ? "border-2 border-[#111] bg-[#FFD23F] font-black text-[#111] shadow-[3px_3px_0_#111]"
                    : "font-semibold text-white"
                )}
                style={brutal ? undefined : { background: accent }}
              >
                {t("action.ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
