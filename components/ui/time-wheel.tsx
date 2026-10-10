"use client";

import { useEffect, useRef } from "react";

const ITEM = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * SAAT ÇARKI — saat ve dakika için iki dikey kaydırmalı sütun. Telefonun
 * kendi saat seçicisi pencerenin diliyle uyuşmuyordu; çark pencerenin
 * içinde, kalemin renginde. Ortadaki satır seçilen değer; kenarlar söner.
 * Kaydırmak ya da bir rakama dokunmak seçer.
 */
export function TimeWheel({
  value,
  onChange,
  accent,
}: {
  /** "HH:mm" */
  value: string;
  onChange: (v: string) => void;
  accent: string;
}) {
  const [h = "00", m = "00"] = value.split(":");
  return (
    <div className="relative flex items-center justify-center gap-1">
      {/* Seçili satırın bandı — iki sütunun arkasında */}
      <div
        aria-hidden
        data-wheel-band=""
        className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-2xl"
        style={{ height: ITEM, background: `${accent}1f`, boxShadow: `inset 0 0 0 1px ${accent}40` }}
      />
      <Column items={HOURS} value={h} onChange={(v) => onChange(`${v}:${m}`)} accent={accent} label="saat" />
      <span className="relative z-[1] -mt-1 font-mono text-[30px] font-bold" style={{ color: accent }}>
        :
      </span>
      <Column items={MINUTES} value={m} onChange={(v) => onChange(`${h}:${v}`)} accent={accent} label="dakika" />
    </div>
  );
}

function Column({
  items,
  value,
  onChange,
  accent,
  label,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  accent: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, items.indexOf(value));
  // Değişiklik kaydırmadan geldiyse sütunu yeniden konumlama (parmağın altından kaçmasın)
  const fromScroll = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    el.scrollTop = idx * ITEM;
  }, [idx]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    if (settle.current) clearTimeout(settle.current);
    // Kaydırma durunca en yakın satıra oturan değeri bildir
    settle.current = setTimeout(() => {
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      // Yarıda kalan kaydırma satıra otursun
      if (Math.abs(el.scrollTop - i * ITEM) > 1) el.scrollTo({ top: i * ITEM, behavior: "smooth" });
      if (items[i] !== value) {
        fromScroll.current = true;
        onChange(items[i]);
      }
    }, 90);
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={label}
      className="no-scrollbar relative z-[1] w-[76px] snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{
        height: ITEM * VISIBLE,
        paddingBlock: (ITEM * (VISIBLE - 1)) / 2,
        touchAction: "pan-y",
        maskImage: "linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent)",
      }}
    >
      {items.map((it, i) => {
        const on = i === idx;
        return (
          <button
            key={it}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: "smooth" })}
            className="flex w-full snap-center items-center justify-center font-mono font-bold tabular-nums transition-[color,font-size]"
            style={{
              height: ITEM,
              // Pencerenin "dokunuş benim" kuralını (data-no-swipe) bu satırlarda
              // aş — yoksa çark parmakla kaymaz
              touchAction: "pan-y",
              fontSize: on ? 30 : 22,
              color: on ? accent : "var(--muted-foreground)",
            }}
          >
            {it}
          </button>
        );
      })}
    </div>
  );
}
