"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import {
  createEntry,
  getBuiltInCategory,
  getOrCreateCategoryRootSub,
  measureOf,
  type CategoryModifierWithType,
} from "@/lib/db/queries";
import { currentThingValues, thingUsage } from "@/lib/db/things";
import { SheetFrame } from "@/components/ui/sheet-frame";
import { ENTRY_WINDOW_LARGE } from "@/components/ui/entry-window";
import { EntryShell } from "@/components/forms/entry-shell";
import { EntryTime } from "@/components/forms/entry-time";
import { LedgerField } from "@/components/forms/ledger-field";
import { NoteEditorView } from "@/components/forms/note-editor";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { asThingField, Diamond, summaryOf, type ThingCurrent } from "@/components/forms/thing-ui";
import { SymbolIcon } from "@/lib/icons";
import { modColor } from "@/lib/mod-color";
import { useSkin } from "@/lib/skin";
import { cn, toLocalDateTimeValue, toLocalDateValue } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Mod } from "@/types";

const ACCENT = "#14b8a6";

/** Sayfanın günü, şimdiki saatle */
function nowOn(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const n = new Date();
  return toLocalDateTimeValue(new Date(y, m - 1, d, n.getHours(), n.getMinutes(), 0, 0).getTime());
}

/** Listenin sembolü başlık karosunda — EntryShell Lucide bileşeni bekliyor */
function iconFor(name?: string): LucideIcon {
  if (!name) return Boxes;
  const C = ({ className }: { className?: string }) => (
    <span className={cn("flex items-center justify-center", className)}>
      <SymbolIcon name={name} size={22} style={{ color: "#fff" }} />
    </span>
  );
  return C as unknown as LucideIcon;
}

/**
 * NESNE GİRDİSİ — bir eylemden bağımsız, yalnız nesnenin durumu: "Sapiens'te
 * 214. sayfadayım", "Duster bugün 54.100 km'de". Ekle › Nesne ve nesne
 * sayfasının "Durum gir"i.
 *
 * Tasarım girdi formunun kendisi (EntryShell — uyku ve ruh hali de bunda):
 * renkli başlık bandı, zaman hapı, ipe asılı alanlar, not kutusu, altta
 * Ekle. Nesne seçilmemişse ipe asılı ilk alan nesne seçimi; seçilince başlık
 * nesnenin adı olur, alanlar onun özellikleri.
 *
 * Girdi yerleşik Nesneler kategorisinin kökünde durur; genel analizlerde
 * görünmez, nesnenin güncel durumunu ve analizini besler.
 */
export function ThingEntrySheet({
  open,
  onClose,
  date,
  thingId: fixedThing,
  embedded,
}: {
  open: boolean;
  onClose: () => void;
  /** Ekle ekranının sekmesinde (bkz. AddScreen, SheetFrame) */
  embedded?: boolean;
  /** Gün sayfasından: o günün tarihi */
  date?: string;
  /** Nesne sayfasından: nesne hazır seçili */
  thingId?: string;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  // Bugün — açılışta bir kez okunur (çizimde saat okumak saf değil)
  const [today] = useState(() => toLocalDateValue(Date.now()));
  const baseDate = date ?? today;
  const [thingId, setThingId] = useState<string | undefined>(fixedThing);
  const [collId, setCollId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [occurredAt, setOccurredAt] = useState(() => nowOn(baseDate));
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
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
      setNoteOpen(false);
      setOccurredAt(nowOn(baseDate));
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

  const activeColl = collId ?? data?.collections[0]?.id;
  const q = query.trim().toLocaleLowerCase("tr");
  const options = (data?.things ?? [])
    .filter((x) => x.collectionId === activeColl && !x.archivedAt)
    .filter((x) => !q || x.name.toLocaleLowerCase("tr").includes(q))
    .sort((a, b) => (data?.usage.get(b.id) ?? 0) - (data?.usage.get(a.id) ?? 0));

  // Güncel durumlar — seçilenin "Son" önerisi, seçicide satır özetleri
  const stateKey = thingId ?? options.slice(0, 40).map((x) => x.id).join(",");
  const states = useLiveQuery(async () => {
    const out = new Map<string, ThingCurrent>();
    for (const id of stateKey ? stateKey.split(",") : []) out.set(id, await currentThingValues(id));
    return out;
  }, [stateKey]);

  const th = data?.things.find((x) => x.id === thingId);
  const coll = th ? data?.collections.find((c) => c.id === th.collectionId) : undefined;
  const accent = coll?.color ?? ACCENT;
  const mods = th
    ? [...(coll?.modIds ?? []), ...(th.extraModIds ?? [])]
        .map((id) => data?.mods.get(id))
        .filter((m): m is Mod => !!m && m.valueType !== "object")
    : [];
  const cur = (thingId && states?.get(thingId)) || {};
  const filled = Object.values(vals).some((v) => v !== "" && v !== "false");

  async function save() {
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
        things: [{ thingId, values: Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== "")) }],
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const ink = brutal ? "text-[#111]" : "text-foreground";
  const sub = brutal ? "text-[#111]/55" : "text-muted-foreground";

  // Seçim alanının başlığı — girdi formundaki kutularla aynı (LedgerField custom)
  const pickerMod = {
    id: "thing-pick",
    targetType: "subcategory",
    targetId: "",
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    name: t("objects.pickThing"),
    entryType: { id: "thing-pick", name: t("objects.pickThing"), unit: "", valueType: "object", isBuiltIn: false, order: 0, createdAt: 0, updatedAt: 0 },
  } as CategoryModifierWithType;

  return (
    <SheetFrame
      embedded={embedded}
      open={open}
      onClose={onClose}
      className={cn(ENTRY_WINDOW_LARGE, "gap-0 overflow-hidden p-0")}
    >
        <EntryShell
          title={th?.name ?? t("objects.entryTitle")}
          overline={th ? coll?.name : t("add.thing")}
          icon={iconFor(coll?.icon)}
          accent={accent}
          onClose={onClose}
          time={<EntryTime occurredAt={occurredAt} onChange={setOccurredAt} baseDate={baseDate} accent={accent} />}
          notes={notes}
          onOpenNote={() => setNoteOpen(true)}
          onSave={save}
          saveLabel={saving ? t("entry.saving") : t("action.add")}
          saveDisabled={saving || !th || !filled}
        >
          {!th ? (
            // 1 — nesne seçimi, girdi formunun kutusunda
            <LedgerField
              mod={pickerMod}
              icon={Boxes}
              color={ACCENT}
              value=""
              onChange={() => {}}
              filled={false}
              custom={
                <div className="flex flex-col gap-2.5 px-4 pb-3 pt-2" data-thing-pick="">
                  {data && data.collections.length === 0 ? (
                    <p className={cn("text-[13px] leading-snug", sub)}>{t("objects.emptyBody")}</p>
                  ) : (
                    <>
                      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" data-collection-tabs="">
                        {(data?.collections ?? []).map((c) => {
                          const on = c.id === activeColl;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => {
                                setCollId(c.id);
                                setQuery("");
                              }}
                              className={cn(
                                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-extrabold",
                                brutal ? "border-2 border-[#111] text-[#111]" : on ? "text-[#111]" : "text-muted-foreground ring-1 ring-inset ring-[var(--ln-2)]"
                              )}
                              style={on ? { background: c.color ?? "#94a3b8" } : brutal ? { background: "#fff" } : undefined}
                            >
                              {c.icon && <SymbolIcon name={c.icon} size={13} style={{ color: "#111" }} />}
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                      <label
                        className={cn(
                          "flex h-9 items-center gap-2 rounded-lg px-2.5",
                          brutal ? "border-[1.5px] border-[#111] bg-white" : "bg-[var(--sf-2)] ring-1 ring-inset ring-[var(--ln-1)]"
                        )}
                      >
                        <Search className={cn("h-3.5 w-3.5 shrink-0", sub)} strokeWidth={2.4} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={t("action.search")}
                          className={cn("h-full min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none", ink)}
                        />
                        {query && (
                          <button type="button" onClick={() => setQuery("")} aria-label={t("action.close")} className={sub}>
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </label>
                      {/* Liste bir yere kadar büyür, sonra kendi içinde kayar */}
                      <div data-thing-list="" className="-mr-1 flex max-h-[min(300px,42vh)] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
                        {options.map((x) => {
                          const c = data?.collections.find((y) => y.id === x.collectionId);
                          const summary = summaryOf(states?.get(x.id), c?.modIds ?? [], data?.mods ?? new Map());
                          return (
                            <button
                              key={x.id}
                              type="button"
                              data-thing-option=""
                              onClick={() => setThingId(x.id)}
                              className={cn(
                                "flex min-h-12 shrink-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors",
                                brutal ? "border-2 border-[#111] bg-white hover:bg-[#111]/5" : "bg-black/20 hover:bg-[var(--sf-2)]"
                              )}
                            >
                              <Diamond color={c?.color ?? "#94a3b8"} icon={c?.icon} size={30} brutal={brutal} />
                              <span className="min-w-0 flex-1 leading-tight">
                                <span className={cn("block truncate text-[14px] font-extrabold", ink)}>{x.name}</span>
                                {summary && <span className={cn("block truncate text-[11px] font-semibold", sub)}>{summary}</span>}
                              </span>
                            </button>
                          );
                        })}
                        {options.length === 0 && <p className={cn("px-1 py-1 text-[12.5px]", sub)}>{t("stat.noData")}</p>}
                      </div>
                    </>
                  )}
                </div>
              }
            />
          ) : (
            // 2 — nesnenin özellikleri, girdi formundaki alanların aynısı
            <>
              {!fixedThing && (
                <button
                  type="button"
                  onClick={() => setThingId(undefined)}
                  className={cn("flex h-8 items-center gap-1 self-start rounded-full px-2.5 text-[12.5px] font-bold", sub, "hover:bg-[var(--sf-2)]")}
                >
                  <Boxes className="h-3.5 w-3.5" />
                  {t("objects.otherThing")}
                </button>
              )}
              {mods.length === 0 ? (
                <p className={cn("py-4 text-[13px]", sub)}>{t("objects.noFeaturesYet")}</p>
              ) : (
                mods.map((m) => (
                  <LedgerField
                    key={m.id}
                    mod={asThingField(m, th.id)}
                    icon={modAtomIcon({ name: m.name, entryType: measureOf(m) })}
                    color={modColor(m)}
                    value={vals[m.id] ?? (m.valueType === "boolean" ? "false" : "")}
                    onChange={(v) => setVals((p) => ({ ...p, [m.id]: v }))}
                    recent={cur[m.id] ? [cur[m.id].value] : []}
                    entryDate={occurredAt.slice(0, 10)}
                  />
                ))
              )}
            </>
          )}
        </EntryShell>

        {/* Not yazma görünümü pencerenin tamamını kaplar (bkz. note-editor) */}
        {noteOpen && (
          <NoteEditorView
            value={notes}
            onChange={setNotes}
            onDone={() => setNoteOpen(false)}
            subtitle={th?.name}
            accent={accent}
            className="absolute inset-0 z-20 bg-card px-5 pb-6 pt-5"
          />
        )}
    </SheetFrame>
  );
}
