"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Brütal girdi kartlarının ortak çerçevesi — ana sayfanın blok dili küçük
 * ölçekte: kart siyah zeminli tek blok, hücreler arasında ortak çizgiler.
 * Üstte künye kendi renginde, altında beyaz hücreler. 2 px çerçeve ve 3 px
 * sert gölge (önce 1.5 / 2 px idi — kartlar sayfanın bloklarının yanında
 * sönük kalıyordu); kapsüller yine yuvarlak, tatlı.
 *
 * Değerler hücrenin içinde KAPSÜL olarak kalır (kullanıcı kararı): bir
 * dönem değerler de hücre hücre denendi, kapsül mantığı daha iyi bulundu.
 * Girdi, uyku, ruh hali ve aktivite kartları bunu kullanır.
 */
export const ENTRY_BLOCK_CLS =
  "relative grid w-full select-none touch-manipulation gap-[2px] overflow-hidden rounded-[14px] border-2 border-[#111] bg-[#111] text-left text-[#111] shadow-[3px_3px_0_#111]";

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
    <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: color }}>
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-white text-[#111] shadow-[inset_0_0_0_2px_#111,1.5px_1.5px_0_#111]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="break-words text-[13px] font-extrabold leading-snug tracking-[-0.01em]">{title}</div>
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

/** Künyenin sağındaki saat / tarih — beyaz, çerçeveli küçük etiket */
export function EntryBlockTime({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-[6px] border-[1.5px] border-[#111] bg-white px-1.5 py-[3px] font-mono text-[9.5px] font-bold leading-none tabular-nums">
      {children}
    </span>
  );
}

/** Beyaz hücre — kapsüller, not, satırlar */
export function EntryBlockCell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bg-white px-2.5 py-2", className)}>{children}</div>;
}
