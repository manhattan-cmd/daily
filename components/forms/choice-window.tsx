"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";
import { FIELD_TONES, type FieldTone } from "@/components/forms/field-tone";

/**
 * Seçenek penceresi — aralık penceresiyle aynı iskelet: üstte küçük başlık,
 * ortada seçenekler, altta özet/ipucu şeridi.
 *
 * Uyku kalitesi çıplak bir düğme dizisiyken süre penceresinin yanında yarım
 * kalmış duruyordu; ikisi de aynı çerçeveye girince form tek parça okunuyor.
 * Seçili değere yeniden dokunmak seçimi kaldırır — kalite zorunlu değil.
 */
export function ChoiceWindow({
  choices,
  value,
  onChange,
  captionKey,
  hintKey,
  tone = "default",
}: {
  choices: string[];
  value: string;
  onChange: (v: string) => void;
  captionKey: MessageKey;
  hintKey: MessageKey;
  tone?: FieldTone;
}) {
  const t = useT();
  const skin = FIELD_TONES[tone];
  // Sayısal ölçekte "4/5" okunur; sözel seçeneklerde yalnız seçilen yazar
  const isScale = choices.every((c) => /^\d+$/.test(c));

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border", skin.shell)}
      style={{ borderColor: skin.shellBorder }}
    >
      <div className={cn("flex items-center gap-1.5 px-4 pt-3", skin.caption)}>
        <Sparkles className="h-3 w-3" />
        <span className="text-[9px] font-bold uppercase tracking-[0.15em]">
          {t(captionKey)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3.5 pt-2.5">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(value === c ? "" : c)}
            className={cn(
              "flex h-11 min-w-11 flex-1 items-center justify-center rounded-xl border px-3 text-sm font-semibold tabular-nums transition-colors",
              value === c ? skin.choiceOn : skin.choiceOff
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Aralık penceresindeki süre şeridinin karşılığı — iki pencere aynı
          iskelette dursun diye */}
      <div
        className={cn("flex items-center gap-2 border-t px-4 py-2.5", skin.strip)}
        style={{ borderTopColor: skin.lineBorder }}
      >
        {value ? (
          <>
            <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full", skin.dot)} />
            <span className="text-xs text-muted-foreground">
              {isScale ? `${value}/${choices.length}` : value}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/40">{t(hintKey)}</span>
        )}
      </div>
    </div>
  );
}
