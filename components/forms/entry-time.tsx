"use client";

import { useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { DateTimeInput } from "@/components/forms/datetime-range-input";
import { cn, toLocalDateTimeValue } from "@/lib/utils";
import { intlTag, useT } from "@/lib/i18n";

/** Hazır anlar — çizimde değil açılışta bir kez okunur, saf kalsın diye modülde */
const nowDate = () => new Date();

type PresetKey = "yday" | "now" | "tmrw";

/** Dün / Şimdi / Yarın — `baseDate` gününe göre, şu anki saatle */
function presetsFor(baseDate: string) {
  const [y, m, d] = baseDate.split("-").map(Number);
  const n = nowDate();
  const at = (day: number) =>
    toLocalDateTimeValue(new Date(y, m - 1, day, n.getHours(), n.getMinutes(), 0, 0).getTime());
  return [
    { key: "yday" as PresetKey, value: at(d - 1) },
    { key: "now" as PresetKey, value: at(d) },
    { key: "tmrw" as PresetKey, value: at(d + 1) },
  ];
}

/** Hapın yazısı — gün temel günse yalnız saat, değilse "5 Eki · 14:20" */
function momentLabel(occurredAt: string, baseDate: string): string {
  const [d = "", time = ""] = occurredAt.split("T");
  if (d === baseDate) return time;
  const day = new Date(d + "T00:00:00").toLocaleDateString(intlTag(), {
    day: "numeric",
    month: "short",
  });
  return `${day} · ${time}`;
}

/**
 * GİRDİNİN ZAMANI — başlığın altında küçük bir hap ("Şimdi · 14:20").
 * Dokununca altında dört seçenek: Dün · Şimdi · Yarın · Özel. "Özel"
 * pencerenin üstünde ortalanmış küçük bir PENCERE açar: gün ve saat seçilir,
 * "Tamam" uygular, "Vazgeç" ya da boşluğa dokunmak bırakır.
 *
 * Ekleme formu ile düzenleme penceresi aynı bileşeni kullanır. Pencere,
 * en yakın konumlu kabın (form penceresi / diyalog) tamamını kaplar —
 * kap kaymıyor olmalı (gövde kendi içinde kayar).
 */
export function EntryTime({
  occurredAt,
  onChange,
  baseDate,
  accent,
}: {
  occurredAt: string;
  onChange: (v: string) => void;
  /** Dün / Şimdi / Yarın'ın göre alındığı gün ("YYYY-MM-DD") */
  baseDate: string;
  accent: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  // Seçenekler açıldığı anda hesaplanır — "şimdi" kaymasın
  const [presets, setPresets] = useState(() => presetsFor(baseDate));
  const active = presets.find((p) => p.value === occurredAt)?.key ?? null;
  const label = (k: PresetKey) =>
    k === "yday" ? t("entry.timeYesterday") : k === "now" ? t("entry.timeNow") : t("entry.timeTomorrow");
  const clock = occurredAt.split("T")[1] ?? "";
  const summary = active ? `${label(active)} · ${clock}` : momentLabel(occurredAt, baseDate);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!open) setPresets(presetsFor(baseDate));
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="mt-1 flex h-7 w-fit items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold transition-[background-color,transform] active:scale-95"
        style={{ background: `${accent}26`, color: accent }}
      >
        <Clock className="h-3.5 w-3.5" />
        <span className="font-mono">{summary}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 grid w-full grid-cols-4 gap-1.5">
          {presets.map((p) => {
            const on = active === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChange(p.value);
                  setOpen(false);
                }}
                aria-pressed={on}
                className={cn(
                  "flex h-9 min-w-0 items-center justify-center rounded-xl px-1 text-[13px] font-semibold transition-colors",
                  !on && "bg-[var(--sf-2)] text-muted-foreground hover:text-foreground"
                )}
                style={on ? { background: accent, color: "#fff" } : undefined}
              >
                {label(p.key)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustom(occurredAt)}
            className={cn(
              "flex h-9 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[13px] font-semibold transition-colors",
              active ? "bg-[var(--sf-2)] text-muted-foreground hover:text-foreground" : "text-white"
            )}
            style={active ? undefined : { background: accent }}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {t("entry.timeCustom")}
          </button>
        </div>
      )}

      {/* Özel zaman penceresi — pencerenin üstünde ortada; boşluk = vazgeç */}
      {custom !== null && (
        <div
          data-no-swipe=""
          className="animate-in fade-in absolute inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]"
          onClick={() => setCustom(null)}
        >
          <div
            role="dialog"
            aria-label={t("entry.timeCustomTitle")}
            onClick={(e) => e.stopPropagation()}
            className="zoom-in-95 animate-in flex w-full max-w-[340px] flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.9)] ring-1 ring-[var(--ln-2)]"
          >
            <div className="flex items-center gap-2 px-1">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: `${accent}26`, color: accent }}
              >
                <Clock className="h-4 w-4" />
              </span>
              <span className="text-[16px] font-bold tracking-tight">{t("entry.timeCustomTitle")}</span>
            </div>
            <DateTimeInput value={custom} onChange={setCustom} />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCustom(null)}
                className="h-11 rounded-2xl bg-[var(--sf-2)] text-[14px] font-semibold text-foreground/85 transition-colors hover:bg-[var(--sf-3)]"
              >
                {t("action.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(custom);
                  setCustom(null);
                  setOpen(false);
                }}
                className="h-11 rounded-2xl text-[14px] font-semibold text-white transition-opacity active:opacity-85"
                style={{ background: accent }}
              >
                {t("action.ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
