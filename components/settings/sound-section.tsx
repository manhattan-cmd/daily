"use client";

import { Volume2 } from "lucide-react";
import { playEntrySound, setSoundOn, useSoundOn, type EntrySoundKind } from "@/lib/sound";
import { useSkin } from "@/lib/skin";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const PREVIEWS: { kind: EntrySoundKind; label: MessageKey }[] = [
  { kind: "add", label: "settings.soundAdd" },
  { kind: "entry", label: "settings.soundEntry" },
  { kind: "mood", label: "settings.soundMood" },
  { kind: "sleep", label: "settings.soundSleep" },
  { kind: "goal", label: "settings.soundGoal" },
];

/**
 * Girdi sesleri: aç/kapat ve sesleri dinleme. Kapalıyken girdi eklenince
 * yalnız kısa bir titreşim kalıyor.
 */
export function SoundSection() {
  const t = useT();
  const on = useSoundOn();
  const brutal = useSkin() === "brutal";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setSoundOn(!on)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sf-2)]">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("settings.sound")}</div>
          <div className="text-xs text-muted-foreground">{t("settings.soundHint")}</div>
        </div>
        <span
          className={cn(
            "relative h-6 w-10 shrink-0 rounded-full transition-colors",
            brutal ? "border-2 border-[#111]" : "",
            on ? (brutal ? "bg-[#7be08a]" : "bg-foreground") : brutal ? "bg-white" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
              brutal ? "border-2 border-[#111] bg-white" : "bg-background",
              on ? "right-0.5" : "left-0.5"
            )}
          />
        </span>
      </button>

      {on && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="mr-1 text-xs text-muted-foreground">{t("settings.soundTry")}</span>
          {PREVIEWS.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => playEntrySound(p.kind)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                brutal
                  ? "border-2 border-[#111] bg-white text-[#111] active:translate-x-px active:translate-y-px"
                  : "bg-[var(--sf-2)] hover:bg-[var(--sf-3)]"
              )}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
