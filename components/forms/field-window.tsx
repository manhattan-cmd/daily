"use client";

import { cn } from "@/lib/utils";
import {
  colorSkin,
  FIELD_TONES,
  type FieldTone,
} from "@/components/forms/field-tone";

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
  color,
  children,
}: {
  caption?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: FieldTone;
  /** Sabit ton yerine serbest renk (sıradan girdilerde kategori rengi) */
  color?: string;
  children: React.ReactNode;
}) {
  const skin = FIELD_TONES[tone];
  const cs = color ? colorSkin(color) : null;
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-2xl border",
        !cs && skin.shell
      )}
      style={{
        borderColor: cs ? cs.shellBorder : skin.shellBorder,
        background: cs ? cs.shellBg : undefined,
      }}
    >
      {caption && (
        <div
          className={cn(
            "px-4 pt-3 text-[9px] font-bold uppercase tracking-[0.15em]",
            !cs && skin.caption
          )}
          style={cs ? { color: cs.caption } : undefined}
        >
          {caption}
        </div>
      )}
      {children}
      {footer && (
        <div
          className={cn(
            "flex items-center gap-2 border-t px-4 py-2.5",
            !cs && skin.strip
          )}
          style={{
            borderTopColor: cs ? cs.lineBorder : skin.lineBorder,
            background: cs ? cs.stripBg : undefined,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
