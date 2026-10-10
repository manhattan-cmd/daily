"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScanSearch } from "lucide-react";
import type { ScaleLabels } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";

/** Bundan az basamakta her basamağın raydaki noktası görünür */
const TICK_EACH_MAX = 11;
/** Basamak başına bundan dar yer kalıyorsa basılı tutunca hassas ayar açılır */
const FINE_BELOW_PX = 16;
/** Hassas ayarda bir basamağın genişliği */
const FINE_STEP_PX = 14;
/** Parmak bu kadar süre (yaklaşık) yerinde kalırsa odaklanır */
const HOLD_MS = 380;
/** "Yerinde" sayılan oynama payı */
const HOLD_SLOP_PX = 5;
/** Hassas ayarda kenara bu kadar yaklaşınca cetvel kendiliğinden kayar */
const EDGE_PX = 22;

type Fine = { anchorX: number; anchorIdx: number };

/**
 * KAYDIRILAN ÖLÇEK — her ölçekte (1–5, −2…+2, 1–10, 1–100, 1–1000…) AYNI
 * görünüm; tek kontrol ray:
 *  1. solda seçilen değer (büyük, özelliğin renginde; "/ en büyük" küçük);
 *     değere dokunmak temizler. Boşken "kaydır ya da dokun".
 *  2. ray: boşken de görünür; ≤ 11 basamakta her basamak bir nokta,
 *     büyükte çeyrekler. Dolgu başlangıçtan değere; iki yönlü ölçekte
 *     (−2…+2) SIFIRDAN değere.
 *  3. uçların sayısı ve anlamı.
 *
 * HASSAS AYAR — eskiden iki büyük − / + düğmesi vardı, tasarımı bozuyordu.
 * Şimdi parmak rayda bir yerde kısa süre DURURSA (ilk dokunuşta ya da kaba
 * sürükleyip durunca) ray o noktada CETVELE açılır: basamaklar parmağa
 * yetecek genişlikte, ana çizgilerde sayılar; parmak artık tek tek basamak
 * gezer, kenara gelince cetvel kendiliğinden kayar. Bırakınca ray geri
 * gelir. Yalnız basamaklar parmağa dar düşen ölçeklerde (1–100, 1–1000…);
 * 1–5'te ray zaten yeterince iri.
 *
 * Pencerenin "sola kaydır = kapat" hareketiyle çakışmasın diye
 * `data-no-swipe`: dokunuş bu bileşenin.
 */
export function ScaleSlider({
  choices,
  labels,
  value,
  onChange,
  color = "#6366f1",
  endSlots,
}: {
  choices: string[];
  labels?: ScaleLabels;
  value: string;
  onChange: (v: string) => void;
  color?: string;
  /** Uç adlarının yerine konacak öğeler (ölçek düzenlerken yazılabilir alanlar) */
  endSlots?: { low: ReactNode; high: ReactNode };
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fine, setFine] = useState<Fine | null>(null);
  const [railW, setRailW] = useState(0);
  const n = choices.length;
  const idx = choices.indexOf(value);
  const has = idx >= 0;
  const pct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);

  // İki yönlü ölçek (−2…+2): dolgu sıfırdan başlar, değer işaretli yazılır
  const first = Number(choices[0]);
  const last = Number(choices[n - 1]);
  const bipolar = first < 0 && last > 0;
  const zeroIdx = bipolar ? choices.indexOf("0") : -1;
  const origin = zeroIdx >= 0 ? zeroIdx : 0;
  const signed = (v: string) => (bipolar && Number(v) > 0 ? `+${v}` : v.replace("-", "−"));

  // Rayın genişliği — hassas ayarın gerekip gerekmediği buna bağlı
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRailW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fineAllowed = n > 2 && railW > 0 && railW / (n - 1) < FINE_BELOW_PX;

  // Son değer — zamanlayıcılar eski kapanışı görmesin
  const idxRef = useRef(idx);
  useEffect(() => {
    idxRef.current = idx;
  });
  const set = (i: number) => {
    const k = Math.min(n - 1, Math.max(0, i));
    if (k === idxRef.current) return;
    idxRef.current = k;
    onChange(choices[k]);
  };

  /** Basılı tutma ve kenar kaydırma durumu (çizime girmez) */
  const press = useRef<{
    holdX: number;
    lastRel: number;
    hold: ReturnType<typeof setTimeout> | null;
    pan: ReturnType<typeof setInterval> | null;
    fine: Fine | null;
  }>({ holdX: 0, lastRel: 0, hold: null, pan: null, fine: null });

  const stopTimers = () => {
    const p = press.current;
    if (p.hold) clearTimeout(p.hold);
    if (p.pan) clearInterval(p.pan);
    p.hold = null;
    p.pan = null;
  };
  useEffect(() => stopTimers, []);

  const relX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r ? clientX - r.left : 0;
  };

  function pickCoarse(clientX: number) {
    const w = trackRef.current?.clientWidth ?? 1;
    const f = Math.min(1, Math.max(0, relX(clientX) / w));
    set(Math.round(f * (n - 1)));
  }

  function armHold(clientX: number) {
    const p = press.current;
    if (p.hold) clearTimeout(p.hold);
    p.holdX = clientX;
    if (!fineAllowed) return;
    p.hold = setTimeout(() => {
      // Odak: parmağın altındaki basamak cetvelin merkezi olur
      const f: Fine = { anchorX: p.lastRel, anchorIdx: Math.max(0, idxRef.current) };
      p.fine = f;
      setFine(f);
      navigator.vibrate?.(8);
    }, HOLD_MS);
  }

  function moveFine(rel: number) {
    const p = press.current;
    const f = p.fine;
    if (!f) return;
    set(f.anchorIdx + Math.round((rel - f.anchorX) / FINE_STEP_PX));
    // Kenarda: cetvel kendiliğinden kayar, parmak yerinde kalsa da değer ilerler
    const w = trackRef.current?.clientWidth ?? 0;
    const dir = rel < EDGE_PX ? -1 : rel > w - EDGE_PX ? 1 : 0;
    if (dir === 0) {
      if (p.pan) clearInterval(p.pan);
      p.pan = null;
    } else if (!p.pan) {
      let ticks = 0;
      p.pan = setInterval(() => {
        const cur = p.fine;
        if (!cur) return;
        // Uzun tutunca hızlanır — 1–1000 ölçekte yüzlerce basamak beklenmesin
        ticks++;
        const size = ticks < 15 ? 1 : ticks < 40 ? 2 : Math.max(5, Math.round(n / 200));
        const next: Fine = { ...cur, anchorIdx: Math.min(n - 1, Math.max(0, cur.anchorIdx + dir * size)) };
        p.fine = next;
        setFine(next);
        set(next.anchorIdx + Math.round((p.lastRel - next.anchorX) / FINE_STEP_PX));
      }, 70);
    }
  }

  function endPress() {
    stopTimers();
    press.current.fine = null;
    setFine(null);
    setDragging(false);
  }

  // Raydaki noktalar: küçük ölçekte her basamak, büyükte çeyrekler
  const ticks =
    n <= TICK_EACH_MAX
      ? Array.from({ length: Math.max(0, n - 2) }, (_, i) => pct(i + 1))
      : [25, 50, 75];
  const lo = Math.min(pct(origin), has ? pct(idx) : pct(origin));
  const hi = Math.max(pct(origin), has ? pct(idx) : pct(origin));

  // Cetvel (hassas ayar): görünen basamaklar ve konumları
  const ruler: { k: number; x: number; major: boolean }[] = [];
  if (fine) {
    const span = Math.ceil(railW / FINE_STEP_PX) + 2;
    for (let k = fine.anchorIdx - span; k <= fine.anchorIdx + span; k++) {
      if (k < 0 || k >= n) continue;
      const x = fine.anchorX + (k - fine.anchorIdx) * FINE_STEP_PX;
      if (x < -FINE_STEP_PX || x > railW + FINE_STEP_PX) continue;
      const v = Number(choices[k]);
      ruler.push({ k, x, major: Number.isFinite(v) ? v % 5 === 0 : k % 5 === 0 });
    }
  }
  const fineX = fine && has ? fine.anchorX + (idx - fine.anchorIdx) * FINE_STEP_PX : 0;

  // Brütal tema: 11'e kadar basamakta her basamak tok bir düğme; seçilen
  // özelliğin renginde ve gölgesine oturmuş. Dokunmak seçer, yeniden dokunmak
  // temizler. Büyük ölçekte ray (hassas ayarıyla) kalır.
  if (brutal && n <= TICK_EACH_MAX) {
    return (
      <div className="flex flex-col gap-1.5" data-no-swipe="">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {choices.map((c) => {
            const on = c === value;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? "" : c)}
                className={cn(
                  "flex h-10 min-w-0 items-center justify-center rounded-[9px] border-2 border-[#111] font-mono font-bold tabular-nums text-[#111] transition-transform",
                  n > 7 ? "text-[12.5px]" : "text-[15px]"
                )}
                style={
                  on
                    ? { background: color, color: "#fff", transform: "translate(2px, 2px)" }
                    : { background: "#ffffff", boxShadow: "2px 2px 0 #111" }
                }
              >
                {signed(c)}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between gap-3 text-[10.5px] font-black uppercase tracking-wide text-[#111]">
          <span className="min-w-0">{signed(choices[0])}{labels?.low ? ` · ${labels.low}` : ""}</span>
          <span className="min-w-0 text-right">{labels?.high ? `${labels.high} · ` : ""}{signed(choices[n - 1])}</span>
        </div>
        {endSlots && (
          <div className="flex items-center gap-2">{endSlots.low}{endSlots.high}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex select-none flex-col gap-1 px-0.5" data-no-swipe="">
      {/* 1 — değer; sağda hassas ayarın ipucu */}
      <div className="flex h-9 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-1">
          {has ? (
            <>
              {/* Değere dokunmak temizler */}
              <button
                type="button"
                onClick={() => onChange("")}
                aria-label={t("entry.clear")}
                title={t("entry.clear")}
                className="rounded-md text-[28px] font-bold leading-8 tracking-tight tabular-nums transition-opacity active:opacity-60"
                style={{ color }}
              >
                {signed(value)}
              </button>
              {!bipolar && (
                <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
                  / {choices[n - 1]}
                </span>
              )}
            </>
          ) : (
            <span className="text-[13px] font-medium text-muted-foreground/75">
              {t("entry.slideHint")}
            </span>
          )}
        </div>
        {fineAllowed &&
          (fine ? (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
              style={{ color, background: `${color}24` }}
            >
              <ScanSearch className="h-3.5 w-3.5" />
              {t("entry.fineMode")}
            </span>
          ) : (
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground/60">
              {t("entry.holdFine")}
            </span>
          ))}
      </div>

      {/* 2 — ray: dokun, sürükle; dur → hassas ayar */}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={has ? Number(value) : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          const cur = idxRef.current;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") set(cur < 0 ? origin : cur + 1);
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") set(cur < 0 ? origin : cur - 1);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          press.current.lastRel = relX(e.clientX);
          pickCoarse(e.clientX);
          armHold(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const rel = relX(e.clientX);
          press.current.lastRel = rel;
          if (press.current.fine) {
            moveFine(rel);
            return;
          }
          pickCoarse(e.clientX);
          // Parmak yeniden durursa yeniden odaklanmaya hazır ol
          if (Math.abs(e.clientX - press.current.holdX) > HOLD_SLOP_PX) armHold(e.clientX);
        }}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => e.preventDefault()}
        className="relative mx-[11px] h-11 cursor-pointer touch-none select-none outline-none [-webkit-touch-callout:none]"
      >
        {/* Normal ray — hassas ayarda söner */}
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{ opacity: fine ? 0 : 1 }}
        >
          {/* zemin — boşken de görünür */}
          <div
            className="absolute -inset-x-[11px] top-1/2 h-2.5 -translate-y-1/2 rounded-full"
            style={{ background: `${color}24`, boxShadow: `inset 0 0 0 1px ${color}2e` }}
          />
          {/* dolgu — başlangıçtan (iki yönlüde sıfırdan) değere */}
          {has && hi > lo && (
            <div
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full"
              style={{
                left: `${lo}%`,
                width: `${hi - lo}%`,
                background: bipolar ? color : `linear-gradient(90deg, ${color}80, ${color})`,
                transition: dragging ? "none" : "left 200ms, width 200ms",
                // Başlangıç ucu rayın ucuna yaslansın
                ...(origin === 0 ? { left: -11, width: `calc(${hi}% + 11px)` } : null),
              }}
            />
          )}
          {/* basamak noktaları */}
          {ticks.map((p) => {
            const lit = has && p >= lo && p <= hi;
            const center = bipolar && Math.abs(p - pct(origin)) < 0.01;
            return (
              <span
                key={p}
                aria-hidden
                className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${p}%`,
                  width: center ? 6 : 4,
                  height: center ? 6 : 4,
                  background: lit ? "rgba(255,255,255,0.6)" : `${color}99`,
                }}
              />
            );
          })}
          {/* başparmak */}
          {has && (
            <span
              className="pointer-events-none absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              style={{
                left: `${pct(idx)}%`,
                boxShadow: `0 0 0 3px ${color}, 0 2px 8px rgba(0,0,0,0.45)`,
                transition: dragging ? "none" : "left 200ms",
              }}
            />
          )}
        </div>

        {/* Cetvel — parmağın durduğu yerde açılan yakın görünüm */}
        {fine && (
          <div
            aria-hidden
            className="animate-in fade-in pointer-events-none absolute -inset-x-[11px] inset-y-0 rounded-xl duration-150"
            style={{
              background: `${color}14`,
              boxShadow: `inset 0 0 0 1px ${color}40`,
              maskImage: "linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 18px), transparent)",
              WebkitMaskImage: "linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 18px), transparent)",
            }}
          >
            <div className="absolute inset-y-0 left-[11px] right-[11px]">
              {ruler.map(({ k, x, major }) => {
                const on = has && (bipolar ? k >= Math.min(origin, idx) && k <= Math.max(origin, idx) : k <= idx);
                return (
                  <span key={k} className="absolute bottom-1.5" style={{ left: x }}>
                    <span
                      className="absolute bottom-0 w-[2px] -translate-x-1/2 rounded-full"
                      style={{
                        height: major ? 14 : 7,
                        background: on ? color : `${color}70`,
                      }}
                    />
                    {major && (
                      <span
                        className="absolute bottom-[17px] -translate-x-1/2 text-[10px] font-semibold tabular-nums leading-none"
                        style={{ color: k === idx ? color : "var(--muted-foreground)" }}
                      >
                        {signed(choices[k])}
                      </span>
                    )}
                  </span>
                );
              })}
              {/* İğne — seçilen basamak */}
              {has && (
                <span className="absolute inset-y-0" style={{ left: fineX }}>
                  <span
                    className="absolute bottom-1 top-1 w-[3px] -translate-x-1/2 rounded-full"
                    style={{ background: color, boxShadow: `0 0 10px ${color}` }}
                  />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3 — uçların sayısı ve anlamı */}
      {endSlots ? (
        <div className="flex items-center gap-2 text-[12px] leading-4 text-muted-foreground">
          <span className="shrink-0 font-semibold tabular-nums text-foreground/70">{signed(choices[0])}</span>
          {endSlots.low}
          {endSlots.high}
          <span className="shrink-0 font-semibold tabular-nums text-foreground/70">{signed(choices[n - 1])}</span>
        </div>
      ) : (
        <div className="flex justify-between gap-3 text-[12px] leading-4 text-muted-foreground">
          <span className="min-w-0">
            <span className="font-semibold tabular-nums text-foreground/70">{signed(choices[0])}</span>
            {labels?.low ? <span className="ml-1.5">{labels.low}</span> : null}
          </span>
          <span className="min-w-0 text-right">
            {labels?.high ? <span className="mr-1.5">{labels.high}</span> : null}
            <span className="font-semibold tabular-nums text-foreground/70">{signed(choices[n - 1])}</span>
          </span>
        </div>
      )}
    </div>
  );
}
