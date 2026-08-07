"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthDaySummary } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { swallowNextClick } from "@/lib/use-long-press";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const t = useT();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const summary = useLiveQuery(
    () => getMonthDaySummary(year, month),
    [year, month]
  );

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  /**
   * Yatay kaydırmayla ay değiştirme — sayfanın herhangi bir yerinden başlar.
   * Parmak birebir takip edilir; eşiği (55px) geçince ay, kayıp-solarak
   * çıkıp karşı taraftan girer. Dikey hareket baskınsa jestten çekilir ki
   * sayfanın kendi kaydırması bozulmasın.
   */
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  const busy = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [fade, setFade] = useState(1);
  const [gliding, setGliding] = useState(false);

  /** Çıkış-giriş animasyonu: mevcut ay kayıp solar, yeni ay karşı taraftan gelir */
  function glide(dir: -1 | 1) {
    if (busy.current) return;
    busy.current = true;
    const w = rootRef.current?.clientWidth ?? 340;
    const out = dir * w * 0.3;
    setGliding(true);
    setDx(out);
    setFade(0);
    window.setTimeout(() => {
      if (dir < 0) nextMonth();
      else prevMonth();
      // Karşı tarafa ışınla (animasyonsuz), sonra yerine süzül
      setGliding(false);
      setDx(-out);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setGliding(true);
          setDx(0);
          setFade(1);
          window.setTimeout(() => {
            busy.current = false;
          }, 180);
        })
      );
    }, 140);
  }

  const swipeHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (busy.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      swipeStart.current = { x: e.clientX, y: e.clientY };
      swiping.current = false;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = swipeStart.current;
      if (!s) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (!swiping.current) {
        if (Math.abs(mx) < 10 || Math.abs(mx) <= Math.abs(my)) {
          // Dikey ağır basıyorsa jestten çekil
          if (Math.abs(my) > 10) swipeStart.current = null;
          return;
        }
        swiping.current = true;
        setGliding(false);
      }
      const w = rootRef.current?.clientWidth ?? 340;
      const clamped = Math.max(-w * 0.6, Math.min(w * 0.6, mx));
      setDx(clamped);
      // Eşiğe yaklaştıkça hafifçe soluyor — bırakınca ne olacağını sezdirir
      setFade(1 - Math.min(0.55, Math.abs(clamped) / (w * 0.9)));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = swipeStart.current;
      swipeStart.current = null;
      if (!s || !swiping.current) return;
      swiping.current = false;
      // Yatay jest başladıysa bu bir dokunuş değildir: eşiği geçmese bile
      // parmağın altındaki gün açılmasın
      swallowNextClick();
      const total = e.clientX - s.x;
      if (total <= -55) return glide(-1);
      if (total >= 55) return glide(1);
      setGliding(true);
      setDx(0);
      setFade(1);
    },
    onPointerCancel: () => {
      swipeStart.current = null;
      swiping.current = false;
      setGliding(true);
      setDx(0);
      setFade(1);
    },
  };

  /** Kaydırmayla birlikte hareket eden içerik (ay adı + ızgara) */
  const glideStyle: React.CSSProperties = {
    transform: dx ? `translate3d(${dx}px,0,0)` : undefined,
    opacity: fade,
    transition: gliding
      ? "transform 180ms cubic-bezier(0.22,1,0.36,1), opacity 180ms ease-out"
      : "none",
    willChange: "transform, opacity",
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayJS = new Date(year, month, 1).getDay(); // 0=Sun
  const firstDayMon = firstDayJS === 0 ? 6 : firstDayJS - 1; // Mon=0

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayMon; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    /* Jest sayfanın tamamında: ızgaranın dışından da kaydırılabilir */
    <div
      ref={rootRef}
      {...swipeHandlers}
      // min-h-full: jest alanı içerikle sınırlı kalmasın, altındaki boşluktan
      // da kaydırılabilsin
      className="flex min-h-full touch-pan-y select-none flex-col overflow-hidden pt-10 pb-4"
    >
      {/* Ay gezintisi — oklar sabit kalır, ay adı içerikle birlikte kayar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={prevMonth}
          className="h-10 w-10 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("selection.previousDay")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="text-center" style={glideStyle}>
          <h1 className="text-xl font-semibold tracking-tight">
            {MONTHS[month]}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">{year}</p>
        </div>

        <button
          onClick={nextMonth}
          className="h-10 w-10 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("selection.nextDay")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div style={glideStyle}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="flex items-center justify-center py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="aspect-square" />;

          const isToday = isCurrentMonth && day === today.getDate();
          const info = summary?.get(day);
          const colors = info?.colors ?? [];
          const hasEntries = !!info;

          return (
            <Link
              key={day}
              href={`/calendar/${dateStr(day)}`}
              // Bağlantılar varsayılan olarak sürüklenebilir; tarayıcının yerel
              // sürükleme jesti kaydırmayı yarıda kesiyordu
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              aria-label={
                hasEntries
                  ? `${day} ${MONTHS[month]} · ${info!.count} girdi`
                  : `${day} ${MONTHS[month]}`
              }
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-2xl transition-all active:scale-95",
                isToday
                  ? "bg-foreground text-background"
                  : hasEntries
                    ? "bg-white/[0.04] hover:bg-white/[0.08]"
                    : "hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "text-sm leading-none",
                  isToday
                    ? "font-semibold text-background"
                    : hasEntries
                      ? "font-medium text-foreground"
                      : "text-muted-foreground/40"
                )}
              >
                {day}
              </span>

              {/* O gün dokunulan kategorilerin renkleri — en çok girdisi olan başta */}
              {colors.length > 0 && (
                <span className="absolute bottom-[5px] flex items-center gap-[3px]">
                  {colors.map((c, ci) => (
                    <span
                      key={ci}
                      className="h-[4px] w-[4px] rounded-full"
                      style={{
                        backgroundColor: c,
                        // Beyaz "bugün" zemininde açık renkler kaybolmasın
                        boxShadow: isToday ? `0 0 0 0.5px ${c}` : undefined,
                      }}
                    />
                  ))}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      </div>
    </div>
  );
}
