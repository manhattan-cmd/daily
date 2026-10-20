"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import {
  createEntry,
  getBuiltInCategory,
  getOrCreateCategoryRootSub,
  measureOf,
} from "@/lib/db/queries";
import { currentThingValues, thingUsage } from "@/lib/db/things";
import { Dialog } from "@/components/ui/dialog";
import {
  FormActions,
  FormSection,
  StructureFormShell,
} from "@/components/structure/structure-form-shell";
import { LedgerField } from "@/components/forms/ledger-field";
import { DateTimeInput } from "@/components/forms/datetime-range-input";
import { modAtomIcon } from "@/components/structure/mod-atom";
import {
  asThingField,
  Diamond,
  summaryOf,
  type ThingCurrent,
} from "@/components/forms/thing-ui";
import { modColor } from "@/lib/mod-color";
import { useSkin } from "@/lib/skin";
import { cn, toLocalDateTimeValue } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Mod } from "@/types";

/** Sayfanın günü, şimdiki saatle */
function nowOn(date?: string): string {
  const n = new Date();
  if (!date) return toLocalDateTimeValue(n.getTime());
  const [y, m, d] = date.split("-").map(Number);
  return toLocalDateTimeValue(new Date(y, m - 1, d, n.getHours(), n.getMinutes(), 0, 0).getTime());
}

/**
 * NESNE GİRDİSİ — bir eylemden bağımsız, yalnız nesnenin durumu: "Duster
 * bugün 54.100 km'de", "Sapiens'te 214. sayfadayım". Uyku ve ruh hali gibi
 * Ekle menüsünden; nesne sayfasının "Durum gir"i de bunu açar.
 *
 * Girdi yerleşik Nesneler kategorisinin kökünde durur ve genel analizlerde
 * görünmez; nesnenin güncel durumunu ve analizini besler. İki görünüm aynı
 * pencerede (üst üste pencere kırılgan): önce nesne seçimi, sonra
 * nesnenin özellikleri, zaman ve not.
 */
export function ThingEntrySheet({
  open,
  onClose,
  date,
  thingId: fixedThing,
}: {
  open: boolean;
  onClose: () => void;
  /** Gün sayfasından: o günün tarihi */
  date?: string;
  /** Nesne sayfasından: nesne hazır seçili */
  thingId?: string;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const [thingId, setThingId] = useState<string | undefined>(fixedThing);
  const [collId, setCollId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [occurredAt, setOccurredAt] = useState(() => nowOn(date));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Açılışta sıfırla
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setThingId(fixedThing);
      setQuery("");
      setVals({});
      setNotes("");
      setOccurredAt(nowOn(date));
    }
  }

  const data = useLiveQuery(async () => {
    if (!open) return null;
    const [collections, things, mods] = await Promise.all([
      db.collections.toArray(),
      db.things.toArray(),
      db.mods.toArray(),
    ]);
    collections.sort((a, b) => a.order - b.order);
    const usage = new Map<string, number>();
    for (const c of collections) for (const [tid, u] of await thingUsage(c.id)) usage.set(tid, u.last);
    return { collections, things, usage, mods: new Map(mods.map((m) => [m.id, m])) };
  }, [open]);

  const current = useLiveQuery(
    async () => (thingId ? await currentThingValues(thingId) : ({} as ThingCurrent)),
    [thingId]
  );

  const th = data?.things.find((x) => x.id === thingId);
  const coll = th ? data?.collections.find((c) => c.id === th.collectionId) : undefined;
  const activeColl = collId ?? data?.collections[0]?.id;
  const color = coll?.color ?? "#14b8a6";
  const mods = th
    ? [...(coll?.modIds ?? []), ...(th.extraModIds ?? [])]
        .map((id) => data?.mods.get(id))
        .filter((m): m is Mod => !!m && m.valueType !== "object")
    : [];
  const filled = Object.values(vals).some((v) => v !== "" && v !== "false");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!thingId || !filled) return;
    setSaving(true);
    try {
      const cat = await getBuiltInCategory("objects");
      if (!cat) return;
      const root = await getOrCreateCategoryRootSub(cat.id);
      await createEntry({
        subcategoryId: root.id,
        occurredAt: new Date(occurredAt).getTime(),
        notes: notes.trim() || undefined,
        things: [
          {
            thingId,
            values: Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== "")),
          },
        ],
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const q = query.trim().toLocaleLowerCase("tr");
  const ink = brutal ? "text-[#111]" : "text-foreground";
  const sub = brutal ? "text-[#111]/55" : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <StructureFormShell
        color={color}
        icon={coll?.icon}
        title={th?.name ?? t("objects.entryTitle")}
        eyebrow={th ? `${coll?.name ?? ""} · ${t("objects.entryEyebrow")}` : t("objects.entryEyebrow")}
        onSubmit={save}
        footer={
          <FormActions
            submitLabel={t("action.save")}
            cancelLabel={th && !fixedThing ? t("action.back") : t("action.cancel")}
            disabled={!th || !filled || saving}
            onCancel={() => (th && !fixedThing ? setThingId(undefined) : onClose())}
          />
        }
      >
        {!th ? (
          // 1 — nesne seçimi
          data && data.collections.length === 0 ? (
            <p className={cn("text-[13px] leading-snug", sub)}>{t("objects.emptyBody")}</p>
          ) : (
            <FormSection label={t("objects.pickThing")}>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" data-collection-tabs="">
                {(data?.collections ?? []).map((c) => {
                  const on = c.id === activeColl;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCollId(c.id)}
                      className={cn(
                        "flex h-8 shrink-0 items-center rounded-full px-3 text-[12.5px] font-extrabold",
                        brutal ? "border-2 border-[#111] text-[#111]" : on ? "text-[#111]" : "text-muted-foreground ring-1 ring-inset ring-[var(--ln-2)]"
                      )}
                      style={on ? { background: c.color ?? "#94a3b8" } : brutal ? { background: "#fff" } : undefined}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <label
                className={cn(
                  "flex h-11 items-center gap-2 rounded-xl px-3",
                  brutal ? "border-2 border-[#111] bg-white" : "bg-black/25 ring-1 ring-inset ring-[var(--ln-2)]"
                )}
              >
                <Search className={cn("h-4 w-4", sub)} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("action.search")}
                  className={cn("h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none", ink)}
                />
              </label>
              <div className="flex flex-col gap-1.5">
                {(data?.things ?? [])
                  .filter((x) => x.collectionId === activeColl && !x.archivedAt)
                  .filter((x) => !q || x.name.toLocaleLowerCase("tr").includes(q))
                  .sort((a, b) => (data?.usage.get(b.id) ?? 0) - (data?.usage.get(a.id) ?? 0))
                  .map((x) => {
                    const c = data?.collections.find((y) => y.id === x.collectionId);
                    return (
                      <button
                        key={x.id}
                        type="button"
                        data-thing-option=""
                        onClick={() => setThingId(x.id)}
                        className={cn(
                          "flex min-h-12 items-center gap-2.5 rounded-xl px-1.5 text-left",
                          brutal ? "border-2 border-[#111] bg-white hover:bg-[#111]/5" : "hover:bg-[var(--sf-2)]"
                        )}
                      >
                        <Diamond color={c?.color ?? "#94a3b8"} icon={c?.icon} size={30} brutal={brutal} />
                        <span className={cn("min-w-0 flex-1 truncate text-[14px] font-extrabold", ink)}>{x.name}</span>
                      </button>
                    );
                  })}
              </div>
            </FormSection>
          )
        ) : (
          // 2 — nesnenin özellikleri
          <>
            {current && summaryOf(current, coll?.modIds ?? [], data?.mods ?? new Map()) && (
              <p className={cn("px-1 text-[12.5px] font-semibold", sub)}>
                {t("objects.current")}: {summaryOf(current, coll?.modIds ?? [], data?.mods ?? new Map())}
              </p>
            )}
            {mods.length === 0 ? (
              <p className={cn("px-1 text-[13px]", sub)}>{t("objects.noFeaturesYet")}</p>
            ) : (
              <div className="flex flex-col gap-2" data-thing-entry-fields="">
                {mods.map((m) => (
                  <LedgerField
                    key={m.id}
                    mod={asThingField(m, th.id)}
                    icon={modAtomIcon({ name: m.name, entryType: measureOf(m) })}
                    color={modColor(m)}
                    value={vals[m.id] ?? (m.valueType === "boolean" ? "false" : "")}
                    onChange={(v) => setVals((p) => ({ ...p, [m.id]: v }))}
                    recent={current?.[m.id] ? [current[m.id].value] : []}
                    entryDate={occurredAt.slice(0, 10)}
                  />
                ))}
              </div>
            )}
            <FormSection label={t("entry.time")}>
              <DateTimeInput value={occurredAt} onChange={setOccurredAt} />
            </FormSection>
            <FormSection label={t("entry.note")}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t("entry.notePlaceholder")}
                className={cn(
                  "w-full resize-none rounded-xl px-3 py-2.5 text-[14px] outline-none",
                  brutal ? "border-2 border-[#111] bg-white text-[#111]" : "bg-[var(--sf-2)] ring-1 ring-inset ring-[var(--ln-1)]"
                )}
              />
            </FormSection>
          </>
        )}
      </StructureFormShell>
    </Dialog>
  );
}
