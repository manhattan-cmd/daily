"use client";

import { useState } from "react";
import { Link2, Pencil } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import {
  CardAction,
  NoteCapsule,
  ValueCapsuleRow,
} from "@/components/dashboard/entry-parts";
import { cn, formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/lib/use-long-press";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/**
 * Paralel girdi kartı — aynı olayın birden çok kategorideki perspektifi.
 *
 * Girdi kartıyla aynı dil: künye üstte (sembol düşeyde ortalı, ad + kategori,
 * sağda tarih ve düzenle), altında saç teli çizgiyle ayrılmış bölüm. Değerler
 * ve notlar kapsül. Kartın çerçevesi menekşe kalıyor — bu renk kategoriyi
 * değil "paralel" olma halini anlatıyor.
 *
 * Değer renkleri anlam taşıyor: ORTAK değerler menekşe (bir kategoriye ait
 * değiller, olayın kendisine ait), perspektife özel değerler o perspektifin
 * kategori renginde.
 *
 * Karta dokunmak ana perspektifi düzenler; her perspektif satırının kendi
 * kalemi var. Silme yok: paralel grupta "sil" hangi perspektif belirsiz
 * kalıyor, o iş düzenleme penceresindeki perspektif listesinden yürüyor.
 * `selection` verilirse basılı tutma tüm perspektifleri tek kart olarak seçer.
 */
const VIOLET = "#8b5cf6";

export function LinkedEntryCard({
  entries,
  selection,
}: {
  entries: EntryWithContext[];
  selection?: EntrySelection;
}) {
  const t = useT();
  const [editingEntry, setEditingEntry] = useState<EntryWithContext | null>(null);
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const shared = entries[0];

  // Ortak değer: aynı özellik ≥2 perspektifte varsa. Anahtar özelliğin
  // kendisi; entryTypeId yalnız v18 öncesi kayıtlarda var.
  const typeIdCount = new Map<string, number>();
  const firstValueByTypeId = new Map<string, EntryWithContext["values"][number]>();
  for (const entry of entries) {
    const seenInEntry = new Set<string>();
    for (const v of entry.values) {
      if (!v.entryType) continue;
      const key = v.modId ?? v.entryTypeId;
      if (!key) continue;
      if (!seenInEntry.has(key)) {
        typeIdCount.set(key, (typeIdCount.get(key) ?? 0) + 1);
        seenInEntry.add(key);
        if (!firstValueByTypeId.has(key)) firstValueByTypeId.set(key, v);
      }
    }
  }
  const sharedTypeIds = new Set(
    [...typeIdCount.entries()].filter(([, n]) => n >= 2).map(([tid]) => tid)
  );
  const sharedValues = [...sharedTypeIds]
    .map((tid) => firstValueByTypeId.get(tid)!)
    .filter(Boolean);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditingEntry(shared)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditingEntry(shared);
        }}
        {...(selection && !selection.active ? longPress : {})}
        aria-label={`${shared.subcategory.name} girdisini düzenle`}
        className={cn(
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border px-2.5 py-2 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        style={{
          borderColor: `${VIOLET}42`,
          background: `linear-gradient(135deg, ${VIOLET}1f, ${VIOLET}08 45%, transparent)`,
        }}
      >
        {/* Künye */}
        <div className="flex items-center gap-2">
          <EntryIcon
            category={shared.category}
            subcategory={shared.subcategory}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="break-words text-[13px] font-semibold leading-snug">
                {shared.subcategory.name}
              </span>
              <Link2
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: `${VIOLET}b3` }}
              />
            </div>
            <div
              className="mt-0.5 truncate text-[9px] font-semibold uppercase leading-none tracking-[0.12em]"
              style={{ color: `${VIOLET}cc` }}
            >
              {t("linked.perspectiveCount", { n: entries.length })}
            </div>
          </div>

          <div className="-mr-1 flex shrink-0 items-center gap-1">
            <span className="whitespace-nowrap px-0.5 text-[10px] leading-none tabular-nums text-muted-foreground/70">
              {formatDateTime(shared.occurredAt)}
            </span>
            <CardAction
              icon={Pencil}
              label={t("action.edit")}
              onClick={() => setEditingEntry(shared)}
            />
          </div>
        </div>

        {/* Ortak değerler — bir kategoriye değil olayın kendisine ait */}
        {sharedValues.length > 0 && (
          <ValueCapsuleRow
            values={sharedValues}
            color={VIOLET}
            className="mt-2 border-t border-white/[0.07] pt-2"
          />
        )}

        {/* Perspektifler — her biri kendi kategori renginde */}
        <div className="mt-2.5 flex flex-col gap-2 border-t border-white/[0.07] pt-2.5">
          {entries.map((entry) => {
            const ownValues = entry.values.filter(
              (v) =>
                v.entryType && !sharedTypeIds.has(v.modId ?? v.entryTypeId ?? "")
            );
            return (
              <div key={entry.id}>
                <div className="flex items-center gap-2">
                  <EntryIcon category={entry.category} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                    {entry.category.name}
                  </span>
                  <CardAction
                    icon={Pencil}
                    label={`${entry.category.name} perspektifini düzenle`}
                    onClick={() => setEditingEntry(entry)}
                  />
                </div>
                {(ownValues.length > 0 || entry.notes) && (
                  <div className="mt-1.5 pl-[38px]">
                    {ownValues.length > 0 && (
                      <ValueCapsuleRow
                        values={ownValues}
                        color={entry.category.color}
                      />
                    )}
                    {entry.notes && (
                      <div className={cn(ownValues.length > 0 && "mt-1.5")}>
                        <NoteCapsule
                          text={entry.notes}
                          color={entry.category.color}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={`${shared.subcategory.name} paralel girdisini seç`}
          />
        )}
      </div>

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          open
          onOpenChange={(open) => {
            if (!open) setEditingEntry(null);
          }}
        />
      )}
    </>
  );
}
