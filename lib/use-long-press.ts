"use client";

import { useRef } from "react";

/**
 * Jest tetiklendikten sonra gelen click'i — hedefi ne olursa olsun — yutar.
 * Parmak basılıyken birkaç piksel kayınca bırakma anındaki click alttaki
 * karta düşebiliyor ve onu da seçiyordu; yakalama fazında durdurunca hiçbir
 * kart görmüyor. Click hiç gelmezse zamanlayıcı dinleyiciyi temizler.
 */
function swallowNextClick() {
  if (typeof window === "undefined") return;
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    cleanup();
  };
  const cleanup = () => {
    window.removeEventListener("click", onClick, true);
    clearTimeout(timeout);
  };
  const timeout = setTimeout(cleanup, 700);
  window.addEventListener("click", onClick, true);
}

/**
 * Basılı tutma jesti — gün sayfasında girdi kartlarında toplu seçimi başlatır.
 * Erken parmak hareketi (sayfayı kaydırma) basmayı iptal eder. Jest
 * tetiklendiğinde basma sırasında oluşmuş metin seçimi temizlenir ve sonraki
 * click yutulur; böylece ne kart düzenlemeye açılır ne de komşu kart seçilir.
 *
 * Kartlara `select-none touch-manipulation` da verilmeli — yoksa tarayıcı
 * basma sırasında metin seçmeye başlayıp alttaki karta taşırıyor.
 */
export function useLongPress({
  onLongPress,
  delay = 400,
  moveTolerance = 8,
}: {
  onLongPress: () => void;
  delay?: number;
  moveTolerance?: number;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        navigator.vibrate?.(12);
        window.getSelection?.()?.removeAllRanges();
        swallowNextClick();
        onLongPress();
      }, delay);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current || !timer.current) return;
      if (
        Math.abs(e.clientX - start.current.x) > moveTolerance ||
        Math.abs(e.clientY - start.current.y) > moveTolerance
      )
        clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
