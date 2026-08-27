"use client";

import { cn } from "@/lib/utils";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";

/**
 * Alan penceresi — yerleşik akışların ortak çerçevesi: üstte küçük başlık
 * şeridi, ortada gövde, altta özet/ipucu şeridi.
 *
 * Uyku aralığı, uyku kalitesi, mutluluk skalası ve duygular hep bu iskelette.
 * Eskiden her pencere kendi kenarlığını ve şeritlerini yazıyordu; ton eklenince
 * (mor/pembe) aynı sınıf demeti dört yerde tekrar ediyordu.
 *
 * `shrink-0` şart: pencereler esnek bir sütunun çocukları, varsayılan olarak
 * sıkışabiliyorlar. Alttaki pencere büyüyünce üstteki eziliyor, yüzler ve
 * rakamlar kırpılıyordu.
 */
export function FieldWindow({
  caption,
  footer,
  tone = "default",
  children,
}: {
  caption?: string;
  footer?: React.ReactNode;
  tone?: FieldTone;
  children: React.ReactNode;
}) {
  const skin = FIELD_TONES[tone];
  return (
    <div
      className={cn("shrink-0 overflow-hidden rounded-2xl border", skin.shell)}
    >
      {caption && (
        <div
          className={cn(
            "px-4 pt-3 text-[9px] font-bold uppercase tracking-[0.15em]",
            skin.caption
          )}
        >
          {caption}
        </div>
      )}
      {children}
      {footer && (
        <div
          className={cn(
            "flex items-center gap-2 border-t px-4 py-2.5",
            skin.line,
            skin.strip
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
