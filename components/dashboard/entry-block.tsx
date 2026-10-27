"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Brütal girdi kartlarının ortak çerçevesi — ana sayfanın blok dili küçük
 * ölçekte: kart siyah zeminli tek blok, hücreler arasında ortak ince
 * çizgiler (1.5 px; kartlar küçük ve kibar kalsın diye blokların 2 px'i
 * değil). Üstte künye kendi renginde, altında beyaz hücreler.
 *
 * Değerler hücrenin içinde KAPSÜL olarak kalır (kullanıcı kararı): bir
 * dönem değerler de hücre hücre denendi, kapsül mantığı daha iyi bulundu.
 * Girdi, uyku, ruh hali ve aktivite kartları bunu kullanır.
 */
export const ENTRY_BLOCK_CLS =
  "relative grid w-full select-none touch-manipulation gap-[1.5px] overflow-hidden rounded-[12px] border-[1.5px] border-[#111] bg-[#111] text-left text-[#111] shadow-[2px_2px_0_#111]";

/** Künye — renkli hücre: beyaz kare karoda simge, ad, altında bağlam, sağda saat */
export function EntryBlockHead({
  color,
  icon,
  title,
  sub,
  right,
}: {
  color: string;
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[7px] px-2 py-[5px]" style={{ background: color }}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-white text-[#111] shadow-[inset_0_0_0_1.5px_#111]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="break-words text-[12.5px] font-bold leading-snug">{title}</div>
        {sub && (
          <div className="mt-0.5 truncate text-[8.5px] font-bold uppercase leading-none tracking-[0.12em] opacity-75">
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

/** Künyenin sağındaki saat / tarih */
export function EntryBlockTime({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap text-[9.5px] font-semibold leading-none tabular-nums">{children}</span>
  );
}

/** Beyaz hücre — kapsüller, not, satırlar */
export function EntryBlockCell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bg-white px-2 py-1.5", className)}>{children}</div>;
}
