"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn, toLocalDateTimeValue } from "@/lib/utils";
import { intlTag, useT } from "@/lib/i18n";
import { TimeWheel } from "@/components/ui/time-wheel";

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

/** "YYYY-MM-DDTHH:mm" değerinin gününü kaydır, saat aynı kalsın */
function shiftDay(v: string, days: number): string {
  const [d = "", time = "12:00"] = v.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const nd = new Date(y, m - 1, dd + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}T${time}`;
}

/** Penceredeki gün yazısı — "8 Ekim Çarşamba" */
function prettyDay(v: string): string {
  const d = v.split("T")[0];
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(intlTag(), {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
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
        data-time-stamp=""
        className="mt-1 flex h-7 w-fit items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold transition-[background-color,transform] active:scale-95"
        style={{ background: `${accent}26`, color: accent }}
      >
        <Clock className="h-3.5 w-3.5" />
        <span className="font-mono">{summary}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div data-time-presets="" className="mt-2 grid w-full grid-cols-4 gap-1.5">
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
            data-time-pop=""
            className="zoom-in-95 animate-in flex w-full max-w-[320px] flex-col gap-3 rounded-3xl bg-card p-3 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.9)] ring-1 ring-[var(--ln-2)]"
          >
            {/* Gün — ‹ tarih ›; tarihe dokununca telefonun takvimi */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCustom(shiftDay(custom, -1))}
                aria-label={t("datetime.prevDay")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <label className="relative flex min-w-0 flex-1 cursor-pointer justify-center rounded-xl py-1.5 text-[15px] font-semibold transition-colors hover:bg-[var(--sf-2)]">
                <span className="truncate">{prettyDay(custom)}</span>
                <input
                  type="date"
                  value={custom.split("T")[0]}
                  onChange={(e) =>
                    e.target.value && setCustom(`${e.target.value}T${custom.split("T")[1] ?? "12:00"}`)
                  }
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  aria-label={t("entry.timeCustomTitle")}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <button
                type="button"
                onClick={() => setCustom(shiftDay(custom, 1))}
                aria-label={t("datetime.nextDay")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            {/* Saat — pencerenin içinde kendi çarkı (telefonun seçicisi uyumsuzdu) */}
            <TimeWheel
              value={custom.split("T")[1] ?? "12:00"}
              onChange={(time) => setCustom(`${custom.split("T")[0]}T${time}`)}
              accent={accent}
            />
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
