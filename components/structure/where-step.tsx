"use client";

import { ArrowLeft, Check, Lock } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { SymbolIcon } from "@/lib/icons";
import { SmartText } from "@/components/ui/smart-text";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export interface WhereRow {
  id: string;
  name: string;
  icon?: string;
  /** 0 = hedefin doğrudan çocuğu */
  depth: number;
  parentId?: string;
  /** Bu kalemde zaten bağlı olan özellikler */
  has: Set<string>;
}

const MAX_INDENT = 5;
const tint = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, white)`;

/**
 * "Nereye eklensin?" — brütal temada özellik ekleme penceresinin ikinci adımı.
 *
 * Ağaç Yapı sekmesindeki kategori kartının aynısı (bkz. BrutCategoryTree):
 * solda kategorinin renginde sırt şeridi, en üstte hedefin kendisi, altında
 * kılavuz çizgileriyle girintili dallar. Fark, her satırın sağındaki onay
 * kutusu. Hedef satırı kilitli — özellik oraya eklendiği için hep alır.
 * Başlık bandı ve alt düğmeler diğer brütal pencerelerle aynı
 * (data-entry-hero / data-entry-foot kuralları).
 */
export function BrutWhereStep({
  color,
  icon,
  targetName,
  featureNames,
  rows,
  chosen,
  pending,
  saving,
  onToggle,
  onToggleAll,
  onBack,
  onCancel,
  onConfirm,
}: {
  color: string;
  icon?: string;
  targetName: string;
  featureNames: string[];
  rows: WhereRow[];
  chosen: Set<string>;
  /** Eklenecek özellik id'leri — yeni yaratılan için boş */
  pending: string[];
  saving: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const allOn = rows.every((r) => chosen.has(r.id));
  const alreadyOf = (r: WhereRow) =>
    pending.length > 0 && pending.every((m) => r.has.has(m));
  const count = rows.filter((r) => alreadyOf(r) || chosen.has(r.id)).length;

  const box = (on: boolean, locked = false, muted = false) => (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-[#111]",
        on && !locked && !muted && "shadow-[2px_2px_0_#111]"
      )}
      style={{ background: on ? (locked || muted ? tint(color, 45) : color) : "white" }}
    >
      {on &&
        (locked ? (
          <Lock className="h-3 w-3 text-[#111]" strokeWidth={3} />
        ) : (
          <Check className="h-4 w-4 text-[#111]" strokeWidth={3.5} />
        ))}
    </span>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-struct-form="">
      <div data-entry-hero="" className="shrink-0" style={{ ["--hero-c" as string]: color }}>
        <div className="h-4" />
        <div className="flex items-center gap-3 px-4 pb-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("action.back")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" strokeWidth={2.6} />
          </button>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] text-muted-foreground">
              {featureNames.join(" · ")}
            </div>
            <DialogTitle asChild>
              <div>
                <SmartText
                  text={t("features.whereTitle")}
                  lines={2}
                  className="text-[19px] font-bold leading-6"
                />
              </div>
            </DialogTitle>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-6 pt-5">
        <div className="flex items-end justify-between gap-3">
          <p className="text-[13px] font-semibold leading-snug text-[#111]/70">
            {t("features.whereHint", { name: targetName })}
          </p>
          <button
            type="button"
            onClick={onToggleAll}
            className="shrink-0 rounded-full border-2 border-[#111] bg-white px-3 py-1 text-[12px] font-extrabold text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {allOn ? t("features.whereNone") : t("features.whereAll")}
          </button>
        </div>

        <section className="flex overflow-hidden rounded-2xl border-2 border-[#111] bg-white shadow-[4px_4px_0_#111]">
          {/* Sırt şeridi */}
          <span className="w-3.5 shrink-0 border-r-2 border-[#111]" style={{ background: color }} />
          <div className="min-w-0 flex-1 px-1.5 pb-2 pt-1.5">
            {/* Hedefin kendisi — hep alır */}
            <div className="flex items-center gap-3 rounded-xl p-2 text-[#111]">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-[#111]"
                style={{ background: color }}
              >
                {icon && <SymbolIcon name={icon} size={20} style={{ color: "#111" }} />}
              </span>
              <span className="min-w-0 flex-1">
                <SmartText
                  text={targetName}
                  className="block text-[16px] font-black leading-tight tracking-tight"
                />
                <span className="block text-[11px] font-semibold text-[#111]/55">
                  {t("features.whereCount", { n: count, total: rows.length })}
                </span>
              </span>
              {box(true, true)}
            </div>

            {rows.map((r) => {
              const depth = r.depth + 1;
              const indent = 15 + (Math.min(depth, MAX_INDENT) - 1) * 16;
              const already = alreadyOf(r);
              const on = already || chosen.has(r.id);
              const rowIcon = r.icon ?? icon;
              return (
                <div key={r.id} className="flex" style={{ paddingLeft: indent }}>
                  {/* Kılavuz çizgisi — kategorinin renginde */}
                  <span
                    className="w-[2px] shrink-0 rounded-full"
                    style={{ background: depth === 1 ? color : tint(color, 50) }}
                  />
                  <button
                    type="button"
                    data-where=""
                    aria-pressed={on}
                    disabled={already || saving}
                    onClick={() => onToggle(r.id)}
                    className={cn(
                      "ml-2 flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1 text-left text-[13.5px] text-[#111] hover:bg-[#111]/5 active:bg-[#111]/10 disabled:hover:bg-transparent",
                      depth === 1 ? "font-bold" : "font-medium"
                    )}
                  >
                    <span
                      className={cn(
                        "flex shrink-0 items-center justify-center border-[1.5px] border-[#111] transition-opacity",
                        depth === 1 ? "h-6 w-6 rounded-[7px]" : "h-5 w-5 rounded-md",
                        !on && "opacity-40"
                      )}
                      style={{ background: tint(color, 55) }}
                    >
                      {rowIcon && (
                        <SymbolIcon
                          name={rowIcon}
                          size={depth === 1 ? 13 : 11}
                          style={{ color: "#111" }}
                        />
                      )}
                    </span>
                    {depth > MAX_INDENT && (
                      <span className="-mr-1 shrink-0 rounded-[5px] bg-[#111] px-1 font-mono text-[10px] font-extrabold leading-[16px] text-[#FFF4DC]">
                        {depth}
                      </span>
                    )}
                    <SmartText
                      text={r.name}
                      className={cn(
                        "min-w-0 flex-1 transition-opacity",
                        !on && "line-through decoration-2 opacity-45"
                      )}
                    />
                    {already && (
                      <span className="shrink-0 rounded-full border-[1.5px] border-[#111]/25 px-2 py-px text-[10.5px] font-extrabold text-[#111]/60">
                        {t("features.alreadyHas")}
                      </span>
                    )}
                    {box(on, false, already)}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div
        data-entry-foot=""
        className="flex shrink-0 gap-2.5 px-4 pt-3"
        style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-12 shrink-0 rounded-2xl px-4 text-[15px] font-extrabold"
        >
          {t("action.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl disabled:opacity-50"
          style={{ background: "#ffd23f" }}
        >
          <Check className="h-5 w-5 shrink-0" strokeWidth={2.75} />
          <span className="truncate">{t("action.add")}</span>
        </button>
      </div>
    </div>
  );
}
