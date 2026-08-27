"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { LEVEL_MAX, LEVEL_MIN, LEVEL_STEP } from "@/lib/choice-level";

/**
 * Yoğunluk çubuğu — 0–100.
 *
 * Native `<input type="range">` değil: tarayıcının başlığı kendi thumb'ını
 * dayatıyor, koyu zeminde uygulamanın diliyle uyuşmuyordu ve rengi duyguya
 * göre değiştirmek her tarayıcıda ayrı sözde-eleman demekti.
 *
 * Sürüklerken işaretçi yakalanır (setPointerCapture): parmak çubuğun dışına
 * taşsa da değer takip eder ve alttaki sayfa kaymaya başlamaz. Klavye de
 * çalışır — çubuk role="slider" ve ok tuşlarıyla adımlanır.
 */
export function LevelBar({
  value,
  onChange,
  color,
  label,
  className,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
  label: string;
  className?: string;
  /** "sm": kutucuğun üstünde açılan balon için daha ince çubuk ve tutamak */
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  const trackRef = useRef<HTMLDivElement>(null);

  function valueAt(clientX: number): number {
    const el = trackRef.current;
    if (!el) return value;
    const box = el.getBoundingClientRect();
    const ratio = box.width ? (clientX - box.left) / box.width : 0;
    const raw = LEVEL_MIN + ratio * (LEVEL_MAX - LEVEL_MIN);
    const snapped = Math.round(raw / LEVEL_STEP) * LEVEL_STEP;
    return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, snapped));
  }

  function commit(clientX: number) {
    const next = valueAt(clientX);
    if (next !== value) {
      navigator.vibrate?.(3);
      onChange(next);
    }
  }

  const pct = ((value - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN)) * 100;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={LEVEL_MIN}
      aria-valuemax={LEVEL_MAX}
      aria-valuenow={value}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        commit(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) commit(e.clientX);
      }}
      onKeyDown={(e) => {
        const step = e.key === "PageUp" || e.key === "PageDown" ? 20 : LEVEL_STEP;
        if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp")
          onChange(Math.min(LEVEL_MAX, value + step));
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown")
          onChange(Math.max(LEVEL_MIN, value - step));
        else if (e.key === "Home") onChange(LEVEL_MIN);
        else if (e.key === "End") onChange(LEVEL_MAX);
        else return;
        e.preventDefault();
      }}
      className={cn(
        // touch-none: çubukta sürüklerken sayfa kaymasın
        "relative flex w-full touch-none items-center outline-none",
        sm ? "h-5" : "h-7",
        className
      )}
    >
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-white/[0.08]",
          sm ? "h-2" : "h-2.5"
        )}
      >
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {/* Tutamak — çubuğun ucunda, dokunma alanı çubuğun tamamı */}
      <span
        className={cn(
          "pointer-events-none absolute -translate-x-1/2 rounded-full border-2 shadow-md",
          sm ? "h-[14px] w-[14px]" : "h-[18px] w-[18px]"
        )}
        style={{
          left: `${pct}%`,
          borderColor: color,
          background: "#12131a",
        }}
      />
    </div>
  );
}
