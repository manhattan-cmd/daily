"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { ScaleLabels } from "@/types";
import { useT } from "@/lib/i18n";

/** Bundan az basamakta her basamağın raydaki noktası görünür */
const TICK_EACH_MAX = 11;

/**
 * KAYDIRILAN ÖLÇEK — her ölçekte (1–5, −2…+2, 1–10, 1–100, 1–1000…) AYNI
 * görünüm, üç satır:
 *  1. solda seçilen değer (büyük, özelliğin renginde; "/ en büyük" küçük),
 *     sağda tek kapsülde − / + (basılı tutunca hızlanır, adım büyür);
 *     değere dokunmak temizler. Boşken yalnız "kaydır ya da dokun".
 *  2. ray: boşken de görünür (özelliğin renginde soluk zemin); ≤ 11
 *     basamakta her basamak rayda bir nokta — 3'ün beşte üç olduğu
 *     okunur; büyük ölçekte çeyrek noktaları. Dolgu başlangıçtan değere;
 *     −2…+2 gibi iki yönlü ölçekte SIFIRDAN değere. Başparmak beyaz,
 *     renkli halkalı.
 *  3. uçların sayısı ve anlamı.
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
}: {
  choices: string[];
  labels?: ScaleLabels;
  value: string;
  onChange: (v: string) => void;
  color?: string;
}) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
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

  function pick(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const i = Math.round(f * (n - 1));
    if (choices[i] !== value) onChange(choices[i]);
  }

  // − / + — basılı tutunca hızlanan adım
  const idxRef = useRef(idx);
  useEffect(() => {
    idxRef.current = idx;
  });
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(() => stopHold, []);
  function step(dir: 1 | -1, size = 1) {
    const cur = idxRef.current;
    // Boşken ilk dokunuş başlangıç noktasına (iki yönlüde sıfıra) oturur
    const next =
      cur < 0 ? origin : Math.min(n - 1, Math.max(0, cur + dir * size));
    idxRef.current = next;
    onChange(choices[next]);
  }
  function startHold(dir: 1 | -1) {
    step(dir);
    let delay = 380;
    let count = 0;
    const tick = () => {
      // Uzun basışta adım da büyür — 1–1000 ölçekte yüzlerce adım beklenmesin
      count++;
      const size = count < 12 ? 1 : count < 30 ? Math.max(1, Math.round(n / 200)) : Math.max(1, Math.round(n / 100));
      step(dir, size);
      delay = Math.max(35, delay * 0.8);
      hold.current = setTimeout(tick, delay);
    };
    hold.current = setTimeout(tick, delay);
  }

  // Raydaki noktalar: küçük ölçekte her basamak, büyükte çeyrekler
  const ticks =
    n <= TICK_EACH_MAX
      ? Array.from({ length: Math.max(0, n - 2) }, (_, i) => pct(i + 1))
      : [25, 50, 75];
  const lo = Math.min(pct(origin), has ? pct(idx) : pct(origin));
  const hi = Math.max(pct(origin), has ? pct(idx) : pct(origin));
  const stepBtn =
    "flex h-full w-10 items-center justify-center text-foreground/80 transition-colors active:bg-white/10";

  return (
    <div className="flex flex-col gap-1 px-0.5" data-no-swipe="">
      {/* 1 — değer ve ince ayar */}
      <div className="flex h-10 items-center gap-3">
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
        {/* Tek kapsül — iki büyük daire yerine */}
        <div
          className="flex h-9 shrink-0 items-stretch overflow-hidden rounded-full bg-black/25 ring-1 ring-inset"
          style={{ ["--tw-ring-color" as string]: `${color}40` }}
        >
          <button type="button" aria-label="−" className={stepBtn} onPointerDown={() => startHold(-1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={(e) => e.preventDefault()}>
            <Minus className="h-4 w-4" />
          </button>
          <span aria-hidden className="my-2 w-px" style={{ background: `${color}40` }} />
          <button type="button" aria-label="+" className={stepBtn} onPointerDown={() => startHold(1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={(e) => e.preventDefault()}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2 — ray: dokun ya da sürükle */}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={has ? Number(value) : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") step(1);
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") step(-1);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        className="relative mx-[11px] h-9 cursor-pointer touch-none select-none outline-none"
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

      {/* 3 — uçların sayısı ve anlamı */}
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
    </div>
  );
}
