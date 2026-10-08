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
 * `interactive`: yazı bir düğmenin içinde (raydaki durak, liste satırı) —
 * dokunmak düğmenin işini yapsın; kapsül UZUN BASINCA açılır.
 */
export function SmartText({
  text,
  lines = 1,
  className,
  interactive = false,
}: {
  text: string;
  lines?: number;
  className?: string;
  interactive?: boolean;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  const [cut, setCut] = useState(false);
  const [pop, setPop] = useState<{ host: Element; left: number; top: number } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallow = useRef(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const m = measureRef.current;
    if (!wrap || !m) return;
    const fit = () => {
      const lh = parseFloat(getComputedStyle(m).lineHeight) || 20;
      const maxH = lh * lines + 1;
      m.textContent = text;
      if (m.scrollHeight <= maxH) {
        m.textContent = "";
        setShown(text);
        setCut(false);
        return;
      }
      const words = text.split(/\s+/);
      let lo = 0;
      let hi = words.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        m.textContent = words.slice(0, mid).join(" ") + "…";
        if (m.scrollHeight <= maxH) lo = mid;
        else hi = mid - 1;
      }
      let out = words.slice(0, Math.max(1, lo)).join(" ") + "…";
      m.textContent = out;
      // Tek kelime bile sığmıyor — harf düzeyinde
      if (lo === 0 || m.scrollHeight > maxH) {
        const w = words[0];
        let c = w.length - 1;
        while (c > 1) {
          out = w.slice(0, c) + "…";
          m.textContent = out;
          if (m.scrollHeight <= maxH) break;
          c--;
        }
      }
      // Kopya boşaltılır: yazı sayfada iki kez durmasın (arama, ekran okuyucu)
      m.textContent = "";
      setShown(out);
      setCut(true);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [text, lines]);

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
      {shown}
      {/* Ölçü kopyası — aynı yazı biçimi ve genişlik, görünmez */}
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-x-0 top-0 block break-words"
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
