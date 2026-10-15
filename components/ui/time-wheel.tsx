"use client";

import { useEffect, useRef } from "react";

const ITEM = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
/** Döngü için sütun kaç kez art arda dizilir; görünüm hep ortadakinde tutulur */
const COPIES = 5;
const MID = Math.floor(COPIES / 2);

/**
 * SAAT ÇARKI — saat ve dakika için iki dikey kaydırmalı sütun. Telefonun
 * kendi saat seçicisi pencerenin diliyle uyuşmuyordu; çark pencerenin
 * içinde, kalemin renginde. Ortadaki satır seçilen değer; kenarlar söner.
 * Kaydırmak ya da bir rakama dokunmak seçer.
 *
 * Sütunlar DÖNGÜLÜ: 59'dan sonra 00, 23'ten sonra 00 gelir. Satırlar birkaç
 * kez art arda dizili; kaydırma durunca görünüm sessizce ortadaki kopyadaki
 * aynı satıra alınır, uçlara hiç varılmaz.
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
  const n = items.length;
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
    el.scrollTop = (MID * n + idx) * ITEM;
  }, [idx, n]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    if (settle.current) clearTimeout(settle.current);
    // Kaydırma durunca en yakın satıra oturan değeri bildir
    settle.current = setTimeout(() => {
      const row = Math.min(COPIES * n - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      const v = row % n;
      const mid = MID * n + v;
      if (row !== mid) {
        // Başka bir kopyadaysa ortadakine sessizce geç — döngü uçsuz kalsın
        el.scrollTop = mid * ITEM;
      } else if (Math.abs(el.scrollTop - row * ITEM) > 1) {
        // Yarıda kalan kaydırma satıra otursun
        el.scrollTo({ top: row * ITEM, behavior: "smooth" });
      }
      if (items[v] !== value) {
        fromScroll.current = true;
        onChange(items[v]);
      }
    }, 90);
  }

  const rows = Array.from({ length: COPIES * n }, (_, i) => i);

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
      {rows.map((i) => {
        const it = items[i % n];
        const on = i % n === idx;
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={on && Math.floor(i / n) === MID}
            tabIndex={Math.floor(i / n) === MID ? 0 : -1}
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
