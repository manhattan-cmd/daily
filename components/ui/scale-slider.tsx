"use client";

import { useRef } from "react";
import type { ScaleLabels } from "@/types";

/**
 * KAYDIRILAN ÖLÇEK — bütün ölçekler (1–5, −2…+2, 1–10).
 *
 * Kalın bir ray: seçilen değere kadar özelliğin renginde, koyulaşan bir
 * dolguyla dolar; beyaz, renkli halkalı bir başparmak. Rayın altında her
 * basamağın numarası — seçilen numara renkli ve büyük; ayrı bir "4 / 5"
 * satırına gerek kalmadı. En altta uçların anlamı. Raya dokunmak ya da
 * sürüklemek en yakın basamağa oturur; bir numaraya dokunmak onu seçer,
 * seçili numaraya yeniden dokunmak temizler.
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
  const trackRef = useRef<HTMLDivElement>(null);
  const n = choices.length;
  const idx = choices.indexOf(value);
  const has = idx >= 0;
  const pct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);

  function pick(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const i = Math.round(f * (n - 1));
    if (choices[i] !== value) onChange(choices[i]);
  }

  return (
    <div className="flex flex-col gap-1.5 px-1" data-no-swipe="">
      {/* Ray — dokun ya da sürükle */}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={Number(choices[0])}
        aria-valuemax={Number(choices[n - 1])}
        aria-valuenow={has ? Number(value) : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp")
            onChange(choices[Math.min(n - 1, (has ? idx : -1) + 1)]);
          if (e.key === "ArrowLeft" || e.key === "ArrowDown")
            onChange(choices[Math.max(0, (has ? idx : 1) - 1)]);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
        }}
        className="relative mx-2.5 h-10 cursor-pointer touch-none select-none outline-none"
      >
        {/* zemin */}
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-black/35 ring-1 ring-inset ring-[var(--ln-1)]" />
        {/* dolgu — açıktan koyuya */}
        {has && (
          <div
            className="absolute left-0 top-1/2 h-3 -translate-y-1/2 rounded-full transition-[width] duration-200 ease-out"
            style={{
              width: `${pct(idx)}%`,
              minWidth: 12,
              background: `linear-gradient(90deg, ${color}66, ${color})`,
            }}
          />
        )}
        {/* başparmak */}
        {has && (
          <span
            className="absolute top-1/2 h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-[left] duration-200 ease-out"
            style={{
              left: `${pct(idx)}%`,
              boxShadow: `0 0 0 4px ${color}, 0 4px 14px rgba(0,0,0,0.55)`,
            }}
          />
        )}
      </div>

      {/* Basamak numaraları — seçilen renkli ve büyük; dokunmak seçer */}
      <div className="relative mx-2.5 h-7">
        {choices.map((c, i) => {
          const on = i === idx;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(on ? "" : c)}
              aria-pressed={on}
              className="absolute top-0 flex h-7 min-w-7 -translate-x-1/2 items-center justify-center rounded-lg px-1 font-mono tabular-nums transition-[color,font-size] duration-150"
              style={{
                left: `${pct(i)}%`,
                fontSize: on ? 17 : 12.5,
                fontWeight: on ? 800 : 600,
                color: on ? color : "var(--muted-foreground)",
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Uçların anlamı */}
      {(labels?.low || labels?.high) && (
        <div className="flex justify-between gap-3 text-[11.5px] font-medium text-muted-foreground">
          <span>{labels?.low}</span>
          <span className="text-right">{labels?.high}</span>
        </div>
      )}
    </div>
  );
}
