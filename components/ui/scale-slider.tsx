"use client";

import { useRef } from "react";
import type { ScaleLabels } from "@/types";
import { useT } from "@/lib/i18n";

/**
 * KAYDIRILAN ÖLÇEK — 5'ten çok basamaklı ölçekler (1–10 gibi) için.
 *
 * Bölmeli şerit beş basamakta iyi, on basamakta her bölme parmaktan dar
 * kalıyordu; basamak arttıkça daha kötü. Burada tek bir ray: dokunulan ya
 * da sürüklenen yere en yakın basamağa oturur, seçilen değer büyük
 * yazılır. Ray boşken basamak noktaları soluk; seçince ray değere kadar
 * özelliğin renginde dolar.
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
    <div className="flex flex-col gap-2" data-no-swipe="">
      {/* Seçilen değer — büyük; boşken ne yapılacağı */}
      <div className="flex items-baseline justify-between px-0.5">
        <span className="flex items-baseline gap-1">
          <span
            className="font-mono text-[24px] font-bold leading-7"
            style={has ? { color } : undefined}
          >
            {has ? value : "—"}
          </span>
          <span className="font-mono text-[13px] font-semibold text-muted-foreground">
            {has ? `/ ${choices[n - 1]}` : t("entry.slideHint")}
          </span>
        </span>
        {has && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-full px-2 py-0.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
          >
            {t("entry.clear")}
          </button>
        )}
      </div>

      {/* Ray — dokun ya da sürükle; en yakın basamağa oturur */}
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
        className="relative h-11 cursor-pointer touch-none select-none outline-none"
      >
        {/* zemin */}
        <div className="absolute inset-x-3 top-1/2 h-2 -translate-y-1/2 rounded-full bg-black/30 ring-1 ring-inset ring-[var(--ln-1)]">
          {has && (
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
              style={{ width: `${pct(idx)}%`, background: color }}
            />
          )}
        </div>
        {/* basamak noktaları + başparmak */}
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2">
          {choices.map((c, i) => (
            <span
              key={c}
              className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${pct(i)}%`,
                background: has && i <= idx ? "rgba(255,255,255,0.75)" : "var(--ln-2)",
              }}
            />
          ))}
          {has && (
            <span
              className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-background transition-[left] duration-150"
              style={{ left: `${pct(idx)}%`, background: color, boxShadow: `0 0 14px ${color}88` }}
            />
          )}
        </div>
      </div>

      {/* Uçların anlamı ve sayıları */}
      <div className="flex justify-between px-0.5 text-[11px] text-muted-foreground">
        <span>
          <span className="font-mono">{choices[0]}</span>
          {labels?.low ? ` · ${labels.low}` : ""}
        </span>
        <span className="text-right">
          {labels?.high ? `${labels.high} · ` : ""}
          <span className="font-mono">{choices[n - 1]}</span>
        </span>
      </div>
    </div>
  );
}
