"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Uzun basma süresi — düğmenin içindeki yazıda kapsül böyle açılır */
const LONG_PRESS_MS = 450;

/**
 * AKILLI YAZI — sığmayan yazı KELİMENİN BİTTİĞİ yerde "…" ile kısalır;
 * yarım yazıya dokununca tam hâli küçük bir kapsülde açılır, boşluğa
 * dokununca kapanır.
 *
 * CSS'in kendi "…"su kelimeyi ortadan keser ("Ziyaret edilen ül…") ve tam
 * hâli göstermenin yolu yoktu. Burada görünmeyen bir ölçü kopyası
 * üzerinde kaç kelimenin `lines` satıra sığdığı bulunuyor; tek kelime bile
 * sığmıyorsa harf düzeyine iniliyor. Genişlik değişince yeniden ölçülür.
 *
 * Kelime HİÇBİR ZAMAN satır sonunda bölünmez: hem ölçüde hem yazıda
 * overflow-wrap normal. Eskiden ölçü kopyası break-words'tü; iki satırlık
 * yazıda tek uzun kelime ölçüde bölünüp "sığıyor" sayılıyor, ekranda da
 * "Subscriptio / ns" diye bölünüyordu. Şimdi genişlik de ölçülüyor.
 *
 * `minSize`: en uzun kelime genişliğe sığmıyorsa yazı önce bu puntoya kadar
 * küçülür ("Correspondence" dar karoda bütün kalsın), ancak o da yetmezse
 * kısaltılır. Verilmezse küçülmez.
 *
 * `interactive`: yazı bir düğmenin içinde (raydaki durak, liste satırı) —
 * dokunmak düğmenin işini yapsın; kapsül UZUN BASINCA açılır.
 */
export function SmartText({
  text,
  lines = 1,
  className,
  interactive = false,
  minSize,
}: {
  text: string;
  lines?: number;
  className?: string;
  interactive?: boolean;
  minSize?: number;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  const [cut, setCut] = useState(false);
  /** Küçültülmüş punto (px) — null: sınıftaki punto */
  const [size, setSize] = useState<number | null>(null);
  const [pop, setPop] = useState<{ host: Element; left: number; top: number } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallow = useRef(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const m = measureRef.current;
    if (!wrap || !m) return;
    const fit = () => {
      const base = parseFloat(getComputedStyle(wrap).fontSize) || 14;
      const tooWide = () => m.scrollWidth > m.clientWidth + 1;
      m.style.fontSize = "";
      m.textContent = text;
      // En uzun kelime sığmıyor: önce punto küçülür (minSize'a kadar)
      let px = base;
      if (minSize && minSize < base && tooWide()) {
        px = Math.max(minSize, Math.floor(((base * m.clientWidth) / m.scrollWidth) * 4) / 4);
        m.style.fontSize = `${px}px`;
        while (px > minSize && tooWide()) {
          px = Math.max(minSize, px - 0.25);
          m.style.fontSize = `${px}px`;
        }
      }
      const lh = parseFloat(getComputedStyle(m).lineHeight) || px * 1.25;
      const maxH = lh * lines + 1;
      const fits = () => m.scrollHeight <= maxH && !tooWide();
      const done = (out: string, isCut: boolean) => {
        // Kopya boşaltılır: yazı sayfada iki kez durmasın (arama, ekran okuyucu)
        m.textContent = "";
        m.style.fontSize = "";
        setShown(out);
        setCut(isCut);
        setSize(px < base ? px : null);
      };
      if (fits()) return done(text, false);
      const words = text.split(/\s+/);
      let lo = 0;
      let hi = words.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        m.textContent = words.slice(0, mid).join(" ") + "…";
        if (fits()) lo = mid;
        else hi = mid - 1;
      }
      let out = words.slice(0, Math.max(1, lo)).join(" ") + "…";
      m.textContent = out;
      // Tek kelime bile sığmıyor — harf düzeyinde
      if (lo === 0 || !fits()) {
        const w = words[0];
        let c = w.length - 1;
        while (c > 1) {
          out = w.slice(0, c) + "…";
          m.textContent = out;
          if (fits()) break;
          c--;
        }
      }
      done(out, true);
    };
    fit();
    // Yazı tipi geç yüklenirse ölçü eski tiple yapılmış olur
    let live = true;
    document.fonts?.ready.then(() => live && fit());
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [text, lines, minSize]);

  /** Kapsülü pencerenin (diyalog ya da sayfa) içinde, yazının altında aç */
  function openPop() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const host = wrap.closest('[role="dialog"]') ?? document.body;
    const hr = host.getBoundingClientRect();
    const r = wrap.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left - hr.left, hr.width - 280 - 8));
    setPop({ host, left, top: r.bottom - hr.top + 6 });
  }

  const handlers = !cut
    ? {}
    : interactive
      ? {
          onPointerDown: () => {
            swallow.current = false;
            press.current = setTimeout(() => {
              swallow.current = true;
              openPop();
            }, LONG_PRESS_MS);
          },
          onPointerUp: () => press.current && clearTimeout(press.current),
          onPointerLeave: () => press.current && clearTimeout(press.current),
          onPointerCancel: () => press.current && clearTimeout(press.current),
          onClickCapture: (e: React.MouseEvent) => {
            // Uzun basış kapsülü açtı — düğmenin işi çalışmasın
            if (swallow.current) {
              e.stopPropagation();
              e.preventDefault();
              swallow.current = false;
            }
          },
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        }
      : {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            openPop();
          },
        };

  return (
    <span
      ref={wrapRef}
      className={cn(
        "relative block min-w-0",
        cut && !interactive && "cursor-pointer",
        cut && "select-none [-webkit-touch-callout:none]",
        className
      )}
      title={cut ? text : undefined}
      {...handlers}
    >
      {/* Küçülen yazı blok: satır yüksekliği kendi puntosundan, ölçüdeki gibi */}
      {size ? (
        <span className="block [overflow-wrap:normal] [word-break:normal]" style={{ fontSize: size }}>
          {shown}
        </span>
      ) : (
        <span className="[overflow-wrap:normal] [word-break:normal]">{shown}</span>
      )}
      {/* Ölçü kopyası — aynı yazı biçimi ve genişlik, görünmez; kelime bölmez */}
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-x-0 top-0 block [overflow-wrap:normal] [word-break:normal]"
      />
      {cut && <span className="sr-only">{text}</span>}
      {pop &&
        createPortal(
          <>
            <span
              className="absolute inset-0 z-[80]"
              onClick={(e) => {
                e.stopPropagation();
                setPop(null);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <span
              role="tooltip"
              className="animate-in fade-in zoom-in-95 absolute z-[81] block w-max max-w-[min(280px,calc(100%-16px))] break-words rounded-2xl bg-card px-3.5 py-2 text-[13.5px] font-medium leading-[19px] text-foreground shadow-[0_14px_32px_-10px_rgba(0,0,0,0.85)] ring-1 ring-[var(--ln-2)]"
              style={{ left: pop.left, top: pop.top }}
              onClick={(e) => e.stopPropagation()}
            >
              {text}
            </span>
          </>,
          pop.host
        )}
    </span>
  );
}
