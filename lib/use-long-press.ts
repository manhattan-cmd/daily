"use client";

import { useRef } from "react";

/**
 * Basılı tutma jesti — gün sayfasında girdi kartlarında toplu seçimi başlatır.
 * Erken parmak hareketi (sayfayı kaydırma) basmayı iptal eder; jest
 * tetiklendiyse `consume()` sonraki click'i yutar, böylece kart düzenlemeye
 * açılmaz.
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
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    /** Jest tetiklendiyse true döner ve bayrağı sıfırlar */
    consume: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        start.current = { x: e.clientX, y: e.clientY };
        fired.current = false;
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(12);
          onLongPress();
        }, delay);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!start.current || fired.current) return;
        if (
          Math.abs(e.clientX - start.current.x) > moveTolerance ||
          Math.abs(e.clientY - start.current.y) > moveTolerance
        )
          clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}
