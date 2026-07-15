"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { EntryWithContext, EntryType } from "@/types";
import { deleteEntry } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/utils";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { QuickModAdd } from "@/components/forms/quick-mod-add";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";

/**
 * Gün/ana sayfa girdi kartı — uyku kartıyla aynı dil: kategori renginde degrade
 * zemin, karta dokununca düzenleme açılır, silme köşedeki hover ikonu.
 * İç içe buton olmaması için kart div[role=button] (QuickModAdd gerçek buton).
 */
export function EntryCard({ entry }: { entry: EntryWithContext }) {
  const [editOpen, setEditOpen] = useState(false);
  const color = entry.category.color;
  const isRoot = !!entry.subcategory.isCategoryRoot;

  async function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Bu girdiyi silmek istediğinden emin misin?")) return;
    await deleteEntry(entry.id);
  }

  const typedValues = entry.values.filter((v) => v.entryTypeId && v.entryType);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditOpen(true);
        }}
        className="group relative w-full cursor-pointer overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
        style={{
          borderColor: `${color}28`,
          background: `linear-gradient(135deg, ${color}1f, ${color}08 45%, transparent)`,
        }}
        aria-label={`${entry.subcategory.name} girdisini düzenle`}
      >
        <div className="flex items-start gap-2.5">
          <EntryIcon category={entry.category} subcategory={entry.subcategory} />
          <div className="flex-1 min-w-0">
            {/* Üst satır: kategori etiketi (kök girdide gizli) + saat */}
            <div className="flex items-center gap-1.5 text-[10px] leading-none">
              {!isRoot && (
                <>
                  <span
                    className="font-semibold uppercase tracking-[0.14em] truncate"
                    style={{ color: `${color}cc` }}
                  >
                    {entry.category.name}
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                </>
              )}
              <span className="text-muted-foreground/70 shrink-0">
                {formatDateTime(entry.occurredAt)}
              </span>
            </div>
            <div className="mt-0.5 text-sm font-semibold truncate">
              {isRoot ? entry.category.name : entry.subcategory.name}
            </div>

            {/* Değer chipleri + hızlı mod ekle — karta tıklama düzenleme
                açtığından iç etkileşimler kabarcıklanmadan durdurulur */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {typedValues.map((v) => (
                <ValueChip
                  key={v.id}
                  value={v.value}
                  label={v.mod?.name ?? v.entryType!.name}
                  entryType={v.entryType!}
                />
              ))}
              <span
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <QuickModAdd
                  subcategoryId={entry.subcategoryId}
                  subcategoryName={entry.subcategory.name}
                  categoryId={entry.category.id}
                />
              </span>
            </div>

            {entry.notes && (
              <p className="mt-1 text-xs text-muted-foreground">
                {entry.notes}
              </p>
            )}
          </div>
        </div>

        {/* Sil — uyku kartındaki desen: köşede, hover'da belirir */}
        <span
          role="button"
          tabIndex={0}
          onClick={onDelete}
          onKeyDown={(e) => {
            if (e.key === "Enter") onDelete(e as unknown as React.MouseEvent);
          }}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60 hover:!text-destructive hover:bg-destructive/10"
          aria-label="Girdiyi sil"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      </div>

      <EditEntryModal
        entry={entry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

function ValueChip({
  value,
  label,
  entryType,
}: {
  value: string;
  label: string;
  entryType: EntryType;
}) {
  const vt = entryType.valueType ?? "number";

  if (vt === "datetime-range") {
    const { start, end } = parseDTR(value);
    const startTime = start?.split("T")[1]?.slice(0, 5);
    const endTime = end?.split("T")[1]?.slice(0, 5);
    const duration = calcDTRDuration(start, end);
    const shortDuration = duration
      ? duration
          .replace(" saat", "s")
          .replace(" dakika", "dk")
          .replace("s dk", "s")
      : null;

    return (
      <div className="flex items-center gap-1.5 rounded-md bg-muted/80 px-1.5 py-0.5">
        {startTime && (
          <span className="text-[13px] font-semibold tabular-nums">{startTime}</span>
        )}
        {startTime && endTime && (
          <span className="text-xs text-muted-foreground">→</span>
        )}
        {endTime && (
          <span className="text-[13px] font-semibold tabular-nums">{endTime}</span>
        )}
        {shortDuration && (
          <span className="text-xs text-muted-foreground ml-0.5">
            · {shortDuration}
          </span>
        )}
        {!startTime && !endTime && (
          <span className="text-xs text-muted-foreground">{label}</span>
        )}
      </div>
    );
  }

  let display = value;
  if (vt === "boolean") display = value === "true" ? "Evet" : "Hayır";

  return (
    <div className="flex items-baseline gap-1 rounded-md bg-muted/80 px-1.5 py-0.5">
      <span className="text-[13px] font-semibold tabular-nums">{display}</span>
      {vt === "number" && entryType.unit && (
        <span className="text-xs text-muted-foreground">{entryType.unit}</span>
      )}
      <span className="ml-0.5 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
