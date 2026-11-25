"use client";

import { Volume2 } from "lucide-react";
import { playEntrySound, setSoundOn, useSoundOn, type EntrySoundKind } from "@/lib/sound";
import { useSkin, isBlockSkin } from "@/lib/skin";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { SettingsBlock, SettingsCell, SettingsSwitch, settingsPill } from "./settings-block";

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
  const brutal = isBlockSkin(useSkin());

  // Brütal: blok — anahtar başın yanındaki karoda; açıkken altında sesleri
  // dinleme kapsülleri
  if (brutal) {
    return (
      <SettingsBlock
        color="#7ae582"
        icon={Volume2}
        title={t("settings.sound")}
        hint={t("settings.soundHint")}
        action={<SettingsSwitch on={on} onChange={setSoundOn} label={t("settings.sound")} />}
      >
        {on && (
          <SettingsCell className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-bold text-ink/55">{t("settings.soundTry")}</span>
            {PREVIEWS.map((p) => (
              <button key={p.kind} type="button" onClick={() => playEntrySound(p.kind)} className={settingsPill}>
                {t(p.label)}
              </button>
            ))}
          </SettingsCell>
        )}
      </SettingsBlock>
    );
  }

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
            brutal ? "border-2 border-line" : "",
            on ? (brutal ? "bg-fill-[#7be08a]" : "bg-foreground") : brutal ? "bg-paper" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
              brutal ? "border-2 border-line bg-paper" : "bg-background",
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
                  ? "border-2 border-line bg-paper text-ink active:translate-x-px active:translate-y-px"
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
