"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { ScaleLabels } from "@/types";
import { useT } from "@/lib/i18n";


/**
 * KAYDIRILAN ÖLÇEK — her ölçekte (1–5, −2…+2, 1–10, 1–100, 1–1000…) AYNI
 * görünüm:
 *  - üstte seçilen değer büyük ("7 / 10", "556 / 1000"), iki yanında − / +
 *    (basılı tutunca hızlanır, adım büyür); değere dokunmak temizler,
 *  - kalın ray: seçilen değere kadar özelliğin renginde, koyulaşan dolgu;
 *    beyaz, renkli halkalı başparmak; dokun ya da sürükle,
 *  - uçlarda en küçük / en büyük sayı ve anlamları.
 * Eskiden küçük ölçekte rayın altında her basamağın numarası vardı, büyükte
 * yoktu — iki ayrı görünüm standart değildi.
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
    const next =
      cur < 0 ? (dir > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, cur + dir * size));
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

  const stepBtn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--sf-2)] text-foreground/80 ring-1 ring-inset ring-[var(--ln-1)] transition-[background-color,transform] active:scale-90";

  return (
    <div className="flex flex-col gap-1.5 px-1" data-no-swipe="">
      {/* Seçilen değer + ince ayar (− / +) */}
      {(
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="−"
            className={stepBtn}
            onPointerDown={() => startHold(-1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
            {/* Değere dokunmak temizler */}
            <button
              type="button"
              disabled={!has}
              onClick={() => onChange("")}
              aria-label={t("entry.clear")}
              title={t("entry.clear")}
              className="rounded-lg px-1 font-mono text-[28px] font-bold leading-8 tabular-nums transition-opacity enabled:active:opacity-60"
              style={{ color: has ? color : "var(--muted-foreground)" }}
            >
              {has ? value : "—"}
            </button>
            {has ? (
              <span className="font-mono text-[13px] font-semibold text-muted-foreground">
                / {choices[n - 1]}
              </span>
            ) : (
              <span className="whitespace-nowrap text-[12px] font-medium text-muted-foreground">
                {t("entry.slideHint")}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="+"
            className={stepBtn}
            onPointerDown={() => startHold(1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Ray — dokun ya da sürükle */}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={Number(choices[0])}
        aria-valuemax={Number(choices[n - 1])}
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
        className="relative mx-2.5 h-10 cursor-pointer touch-none select-none outline-none"
      >
        {/* zemin */}
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-black/35 ring-1 ring-inset ring-[var(--ln-1)]" />
        {/* dolgu — açıktan koyuya; sürüklerken gecikmesiz */}
        {has && (
          <div
            className="absolute left-0 top-1/2 h-3 -translate-y-1/2 rounded-full ease-out"
            style={{
              width: `${pct(idx)}%`,
              minWidth: 12,
              background: `linear-gradient(90deg, ${color}66, ${color})`,
              transition: dragging ? "none" : "width 200ms",
            }}
          />
        )}
        {/* başparmak — değer büyük ölçekte üstte yazılı, balona gerek yok */}
        {has && (
          <span
            className="absolute top-1/2 h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ease-out"
            style={{
              left: `${pct(idx)}%`,
              boxShadow: `0 0 0 4px ${color}, 0 4px 14px rgba(0,0,0,0.55)`,
              transition: dragging ? "none" : "left 200ms",
            }}
          />
        )}
      </div>

      {/* Uçlarda sayılar ve anlamları */}
      <div className="mx-1 flex justify-between gap-3 text-[11.5px] font-medium text-muted-foreground">
        <span>
          <span className="font-mono font-semibold">{choices[0]}</span>
          {labels?.low ? ` · ${labels.low}` : ""}
        </span>
        <span className="text-right">
          {labels?.high ? `${labels.high} · ` : ""}
          <span className="font-mono font-semibold">{choices[n - 1]}</span>
        </span>
      </div>
    </div>
  );
}
