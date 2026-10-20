"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, Check, Plus, Search, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  createCollection,
  createThing,
  currentThingValues,
  effectiveLinksForSub,
  recentThingsForSub,
  thingUsage,
} from "@/lib/db/things";
import { measureOf, type AttachedThing, type CategoryModifierWithType } from "@/lib/db/queries";
import { LedgerField } from "@/components/forms/ledger-field";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { SymbolIcon } from "@/lib/icons";
import { modColor } from "@/lib/mod-color";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Collection, Mod, Thing } from "@/types";

/** LedgerField bir atama bekliyor — nesnenin özelliği için atama kılığı */
function asField(m: Mod, thingId: string): CategoryModifierWithType {
  return {
    id: `thing-${thingId}-${m.id}`,
    modId: m.id,
    targetType: "subcategory",
    targetId: "",
    order: 0,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    name: m.name,
    mod: m,
    entryType: measureOf(m),
  };
}

/**
 * Girdiye nesne iliştirme — girdi formunun "Nesneler" bölümü.
 *
 * Eylem kategoride (Okuma: süre), eylemin ilgili olduğu şey nesne (Sapiens).
 * İliştirilen her nesne kendi bloğunda, listesinin özellikleriyle açılır;
 * yazılan değer bu girdiye bu nesne için kaydedilir ve nesnenin güncel
 * durumu olur ("Bulunulan sayfa: 214"). Alanın "Son" önerisi nesnenin şu
 * anki değeri — km gibi biriken durumlarda yazmak yerine bakıp üstüne yazmak.
 *
 * Ekleme paneli formun içinde açılır (üst üste pencere kırılgan, bkz.
 * stacked-dialogs): bu kalemde son iliştirilenler, liste sekmeleri, arama,
 * yeni nesne; hiç liste yoksa orada liste de açılır.
 */
export function EntryThings({
  subcategoryId,
  entryId,
  entryDate,
  value,
  onChange,
}: {
  subcategoryId: string;
  /** Düzenlenen girdi — kendi değeri "son" diye önerilmesin */
  entryId?: string;
  entryDate?: string;
  value: AttachedThing[];
  onChange: (next: AttachedThing[]) => void;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const [open, setOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const [collections, things, mods, recent, links] = await Promise.all([
      db.collections.toArray(),
      db.things.toArray(),
      db.mods.toArray(),
      recentThingsForSub(subcategoryId),
      effectiveLinksForSub(subcategoryId),
    ]);
    collections.sort((a, b) => a.order - b.order);
    // Bağlı listelerin seçicisinde son kullanılan önde
    const usage = new Map<string, number>();
    for (const l of links)
      if (l.collectionId)
        for (const [tid, u] of await thingUsage(l.collectionId)) usage.set(tid, u.last);
    return {
      links,
      usage,
      collections,
      things,
      byThing: new Map(things.map((th) => [th.id, th])),
      byColl: new Map(collections.map((c) => [c.id, c])),
      mods: new Map(mods.map((m) => [m.id, m])),
      recent,
    };
  }, [subcategoryId]);

  // Yapıya bağlı ama bu girdiye henüz iliştirilmemiş nesneler: formda hazır,
  // sönük blok. Değer yazılınca ya da işaretlenince iliştirilir.
  const ghostIds = (data?.links ?? [])
    .filter((l) => l.thingId && !value.some((a) => a.thingId === l.thingId))
    .map((l) => l.thingId!)
    .filter((tid) => data?.byThing.get(tid) && !data.byThing.get(tid)!.archivedAt);

  // İliştirilen ve hazır bekleyen nesnelerin güncel değerleri — "Son" önerisi
  const attachedIds = [...value.map((a) => a.thingId), ...ghostIds].join(",");
  const current = useLiveQuery(async () => {
    const out = new Map<string, Record<string, { value: string; at: number }>>();
    for (const tid of attachedIds ? attachedIds.split(",") : [])
      out.set(tid, await currentThingValues(tid, entryId));
    return out;
  }, [attachedIds, entryId]);

  const attach = (thingId: string) => {
    if (!value.some((a) => a.thingId === thingId)) onChange([...value, { thingId, values: {} }]);
    setOpen(false);
  };
  const detach = (thingId: string) => onChange(value.filter((a) => a.thingId !== thingId));
  const setVal = (thingId: string, modId: string, v: string) =>
    onChange(
      value.some((a) => a.thingId === thingId)
        ? value.map((a) =>
            a.thingId === thingId ? { ...a, values: { ...a.values, [modId]: v } } : a
          )
        : [...value, { thingId, values: { [modId]: v } }]
    );

  if (!data) return null;

  // Bağlı listeler: o listeden henüz iliştirilen yoksa "hangisi?" satırı
  const listSlots = data.links
    .filter((l) => l.collectionId && data.byColl.get(l.collectionId))
    .filter(
      (l) => !value.some((a) => data.byThing.get(a.thingId)?.collectionId === l.collectionId)
    )
    .map((l) => data.byColl.get(l.collectionId!)!);

  const block = (thingId: string, values: Record<string, string>, ghost: boolean) => {
    const th = data.byThing.get(thingId);
    const coll = th ? data.byColl.get(th.collectionId) : undefined;
    const color = coll?.color ?? "#94a3b8";
    const modIds = [...(coll?.modIds ?? []), ...(th?.extraModIds ?? [])];
    const mods = modIds.map((id) => data.mods.get(id)).filter((m): m is Mod => !!m);
    const cur = current?.get(thingId) ?? {};
    return (
      <div
        key={thingId}
        data-attached-thing={ghost ? undefined : ""}
        data-ghost-thing={ghost ? "" : undefined}
        className={cn(
          "flex flex-col gap-2 rounded-2xl p-2.5 transition-opacity",
          brutal
            ? cn("border-2 border-[#111] bg-white", ghost ? "border-dashed" : "shadow-[3px_3px_0_#111]")
            : "ring-1 ring-inset"
        )}
        style={brutal ? undefined : { background: `${color}12`, ["--tw-ring-color" as string]: `${color}40` }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
              brutal && "border-[1.5px] border-[#111]",
              ghost && "opacity-60"
            )}
            style={{ background: color }}
          >
            {coll?.icon ? (
              <SymbolIcon name={coll.icon} size={19} style={{ color: "#111" }} />
            ) : (
              <Boxes className="h-[18px] w-[18px] text-[#111]" strokeWidth={2.4} />
            )}
          </span>
          <span className={cn("min-w-0 flex-1 leading-tight", ghost && "opacity-70")}>
            <span className={cn("block truncate text-[15px] font-black", brutal && "text-[#111]")}>
              {th?.name ?? "?"}
            </span>
            <span className={cn("block truncate text-[11px] font-semibold", brutal ? "text-[#111]/55" : "text-muted-foreground")}>
              {ghost ? t("objects.readyHere") : coll?.name}
            </span>
          </span>
          {/* İşaret: bu girdiye iliştirildi mi */}
          <button
            type="button"
            onClick={() => (ghost ? attach(thingId) : detach(thingId))}
            aria-pressed={!ghost}
            aria-label={ghost ? t("objects.attach") : t("entry.removeFromEntry")}
            data-thing-check=""
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
              brutal ? "border-2 border-[#111]" : "ring-1 ring-inset ring-[var(--ln-2)]"
            )}
            style={{ background: ghost ? (brutal ? "#fff" : "transparent") : color }}
          >
            {!ghost && <Check className="h-4 w-4 text-[#111]" strokeWidth={3.2} />}
          </button>
        </div>
        {mods.length > 0 ? (
          <div className={cn("flex flex-col gap-2", ghost && "opacity-75")}>
            {mods.map((m) => (
              <LedgerField
                key={m.id}
                mod={asField(m, thingId)}
                icon={modAtomIcon({ name: m.name, entryType: measureOf(m) })}
                color={modColor(m)}
                value={values[m.id] ?? (m.valueType === "boolean" ? "false" : "")}
                onChange={(v) => setVal(thingId, m.id, v)}
                recent={cur[m.id] ? [cur[m.id].value] : []}
                entryDate={entryDate}
              />
            ))}
          </div>
        ) : (
          !ghost && (
            <p className={cn("px-1 text-[11.5px]", brutal ? "text-[#111]/55" : "text-muted-foreground")}>
              {t("objects.noFeaturesYet")}
            </p>
          )
        )}
      </div>
    );
  };

  return (
    <section className="mt-5 flex flex-col gap-2" data-entry-things="">
      {(value.length > 0 || open || ghostIds.length > 0 || listSlots.length > 0) && (
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("objects.inEntry")}
        </h3>
      )}

      {value.map((a) => block(a.thingId, a.values, false))}
      {ghostIds.map((tid) => block(tid, {}, true))}

      {/* Bağlı listeler — "Kitaplarım: hangisi?" */}
      {listSlots.map((c) => {
        const opts = data.things
          .filter((th) => th.collectionId === c.id && !th.archivedAt && !value.some((a) => a.thingId === th.id))
          .sort((x, y) => (data.usage.get(y.id) ?? y.createdAt) - (data.usage.get(x.id) ?? x.createdAt))
          .slice(0, 8);
        return (
          <div
            key={c.id}
            data-list-slot=""
            className={cn(
              "flex flex-col gap-2 rounded-2xl p-2.5",
              brutal ? "border-2 border-dashed border-[#111] bg-white" : "ring-1 ring-inset ring-[var(--ln-2)]"
            )}
          >
            <span className={cn("px-1 text-[13px] font-black", brutal && "text-[#111]")}>
              {t("objects.whichOne", { list: c.name })}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {opts.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  data-slot-option=""
                  onClick={() => attach(th.id)}
                  className={cn(
                    "flex min-h-9 max-w-full items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13.5px] font-semibold",
                    brutal ? "border-2 border-[#111] bg-white text-[#111]" : "bg-black/25 text-muted-foreground ring-1 ring-inset ring-[var(--ln-2)]"
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]" style={{ background: c.color ?? "#94a3b8" }} />
                  <span className="truncate">{th.name}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex min-h-9 items-center gap-1 rounded-xl px-3 text-[13px] font-semibold text-muted-foreground hover:bg-[var(--sf-2)]"
              >
                <Search className="h-3.5 w-3.5" />
                {opts.length ? t("objects.more") : t("objects.typeToAdd")}
              </button>
            </div>
          </div>
        );
      })}

      {open ? (
        <ThingPicker
          collections={data.collections}
          things={data.things}
          recent={data.recent.filter((id) => !value.some((a) => a.thingId === id))}
          byThing={data.byThing}
          attachedIds={new Set(value.map((a) => a.thingId))}
          onPick={attach}
          onClose={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-add-thing=""
          className="flex h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
        >
          <Boxes className="h-4 w-4" />
          {t("objects.attach")}
        </button>
      )}
    </section>
  );
}

/** Form içinde açılan nesne seçici */
function ThingPicker({
  collections,
  things,
  recent,
  byThing,
  attachedIds,
  onPick,
  onClose,
}: {
  collections: Collection[];
  things: Thing[];
  recent: string[];
  byThing: Map<string, Thing>;
  attachedIds: Set<string>;
  onPick: (thingId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  // Varsayılan liste: bu kalemde son iliştirilenin listesi, yoksa ilki
  const [collId, setCollId] = useState<string | undefined>(
    () => (recent[0] ? byThing.get(recent[0])?.collectionId : undefined) ?? collections[0]?.id
  );
  const [query, setQuery] = useState("");
  const [listDraft, setListDraft] = useState("");
  const coll = collections.find((c) => c.id === collId);
  const color = coll?.color ?? "#94a3b8";

  const q = query.trim().toLocaleLowerCase("tr");
  const pool = useMemo(
    () =>
      things
        .filter((th) => th.collectionId === collId && !attachedIds.has(th.id))
        .filter((th) => (q ? th.name.toLocaleLowerCase("tr").includes(q) : !th.archivedAt))
        .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [things, collId, attachedIds, q]
  );
  const exact = things.some(
    (th) => th.collectionId === collId && th.name.toLocaleLowerCase("tr") === q
  );

  async function addNew() {
    if (!collId || !query.trim()) return;
    const th = await createThing({ collectionId: collId, name: query.trim() });
    onPick(th.id);
  }
  async function addList() {
    const name = listDraft.trim();
    if (!name) return;
    const c = await createCollection({ name });
    setCollId(c.id);
    setListDraft("");
  }

  const chip = (on: boolean) =>
    cn(
      "flex min-h-9 max-w-full items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13.5px] font-semibold transition-colors",
      brutal
        ? cn("border-2 border-[#111] text-[#111]", on ? "shadow-[2px_2px_0_#111]" : "bg-white")
        : on
          ? "text-white"
          : "bg-black/25 text-muted-foreground ring-1 ring-inset ring-[var(--ln-2)] hover:text-foreground"
    );

  return (
    <div
      data-thing-picker=""
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl p-3",
        brutal ? "border-2 border-[#111] bg-[#fff8e7] shadow-[3px_3px_0_#111]" : "bg-[var(--sf-1)] ring-1 ring-inset ring-[var(--ln-1)]"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-[13px] font-black", brutal && "text-[#111]")}>{t("objects.attach")}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--sf-2)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Bu kalemde son iliştirilenler — tek dokunuş */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground">{t("objects.recentHere")}</span>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((id) => {
              const th = byThing.get(id);
              const c = collections.find((x) => x.id === th?.collectionId);
              if (!th) return null;
              return (
                <button
                  key={id}
                  type="button"
                  data-thing-recent=""
                  onClick={() => onPick(id)}
                  className={chip(false)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c?.color ?? "#94a3b8" }} />
                  <span className="truncate">{th.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {collections.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] leading-snug text-muted-foreground">{t("objects.noListsHint")}</p>
          <ListInput value={listDraft} onChange={setListDraft} onSubmit={addList} brutal={brutal} />
        </div>
      ) : (
        <>
          {/* Liste sekmeleri */}
          <div className="flex flex-wrap gap-1.5" data-collection-tabs="">
            {collections.map((c) => {
              const on = c.id === collId;
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
                    "rounded-full px-3 py-1 text-[12.5px] font-extrabold",
                    brutal ? "border-2 border-[#111] text-[#111]" : on ? "text-white" : "text-muted-foreground ring-1 ring-inset ring-[var(--ln-2)]"
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
              "flex min-h-10 items-center gap-2 rounded-xl px-3",
              brutal ? "border-2 border-[#111] bg-white" : "bg-black/25 ring-1 ring-inset ring-[var(--ln-2)]"
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q && !exact) {
                  e.preventDefault();
                  void addNew();
                }
              }}
              placeholder={t("objects.searchIn", { list: coll?.name ?? "" })}
              aria-label={t("action.search")}
              className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/60"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {pool.map((th) => (
              <button
                key={th.id}
                type="button"
                data-thing-option=""
                onClick={() => onPick(th.id)}
                className={chip(false)}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{th.name}</span>
                {th.archivedAt && (
                  <span className="shrink-0 text-[10.5px] font-medium opacity-70">{t("objects.archivedTag")}</span>
                )}
              </button>
            ))}
            {q && !exact && (
              <button
                type="button"
                data-thing-create=""
                onClick={() => void addNew()}
                className={cn(chip(true), "font-bold")}
                style={{ background: brutal ? color : `${color}`, color: brutal ? "#111" : "#fff" }}
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2.6} />
                <span className="truncate">{t("objects.createNamed", { name: query.trim() })}</span>
              </button>
            )}
            {!q && pool.length === 0 && (
              <p className="px-1 text-[12px] text-muted-foreground">{t("objects.typeToAdd")}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ListInput({
  value,
  onChange,
  onSubmit,
  brutal,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  brutal: boolean;
}) {
  const t = useT();
  return (
    <div className="flex gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={t("measure.collectionPlaceholder")}
        aria-label={t("objects.addCollection")}
        className={cn(
          "h-10 min-w-0 flex-1 rounded-xl px-3 text-[14px] outline-none",
          brutal ? "border-2 border-[#111] bg-white text-[#111]" : "bg-black/25 ring-1 ring-inset ring-[var(--ln-2)]"
        )}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim()}
        aria-label={t("objects.addCollection")}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-40",
          brutal ? "border-2 border-[#111] bg-[#7ae582] text-[#111] shadow-[2px_2px_0_#111]" : "bg-primary/15 text-primary"
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={3} />
      </button>
    </div>
  );
}
