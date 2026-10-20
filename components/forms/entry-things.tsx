"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Plus, Search, X } from "lucide-react";
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
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Collection, Mod, Thing } from "@/types";

/** Panelde aramasız gösterilen satır sayısı */
const SHOWN = 8;

type Current = Record<string, { value: string; at: number }>;

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

/** Nesnenin şekli — baklava (kare kategori, daire özellik) */
function Diamond({
  color,
  icon,
  size = 34,
  muted = false,
  brutal,
}: {
  color: string;
  icon?: string;
  size?: number;
  muted?: boolean;
  brutal: boolean;
}) {
  const inner = Math.round(size * 0.68);
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span
        className={cn(
          "absolute rotate-45 rounded-[7px]",
          brutal && "border-2 border-[#111]",
          muted && "opacity-45"
        )}
        style={{ width: inner, height: inner, background: color }}
      />
      {icon && (
        <span className={cn("relative", muted && "opacity-60")}>
          <SymbolIcon name={icon} size={Math.round(size * 0.42)} style={{ color: "#111" }} />
        </span>
      )}
    </span>
  );
}

/** Nesnenin güncel durumunun tek satırı: "53.485 km · Sabah" */
function summaryOf(cur: Current | undefined, modIds: string[], mods: Map<string, Mod>): string {
  if (!cur) return "";
  return modIds
    .map((id) => {
      const m = mods.get(id);
      const c = cur[id];
      if (!m || !c) return null;
      if (m.valueType === "boolean") return c.value === "true" ? m.name : null;
      if (m.valueType === "datetime-range") return null;
      if (m.valueType === "number") {
        const n = Number(c.value);
        const s = Number.isFinite(n) ? n.toLocaleString("tr-TR") : c.value;
        return m.unit ? `${s} ${m.unit}` : `${m.name} ${s}`;
      }
      return c.value;
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
}

/**
 * Girdiye nesne iliştirme — girdi formunun "Nesneler" bölümü.
 *
 * Eylem kategoride (Okuma: süre), eylemin ilgili olduğu şey nesne (Sapiens).
 * Tasarım formun kendi dilini izler: özellikler kategori başlığından inen
 * ipe asılı, iliştirilen nesnenin özellikleri de nesnenin başlığından inen
 * kendi renginde ipe asılı — kart içinde kart yok. Üç hâl, üç ayrı görünüm:
 *  - iliştirilen nesne: başlık + ipe asılı alanlar (Son önerisi güncel değer)
 *  - kaleme bağlı, henüz iliştirilmemiş nesne: tek satır, güncel durumu ve
 *    dolu "Ekle" düğmesiyle
 *  - kaleme bağlı liste: tek satır, yana kayan nesne çipleri
 * Ekleme paneli formun içinde açılır (üst üste pencere kırılgan): bu kalemde
 * son kullanılanlar, liste sekmeleri, arama, satır satır sonuçlar.
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
  // Panel bir listeyle açılabilir (bağlı listenin "Ara" çipi)
  const [openColl, setOpenColl] = useState<string | undefined>();

  const data = useLiveQuery(async () => {
    const [collections, things, mods, recent, links] = await Promise.all([
      db.collections.toArray(),
      db.things.toArray(),
      db.mods.toArray(),
      recentThingsForSub(subcategoryId),
      effectiveLinksForSub(subcategoryId),
    ]);
    collections.sort((a, b) => a.order - b.order);
    // Seçicilerde son kullanılan önde
    const usage = new Map<string, number>();
    for (const c of collections)
      for (const [tid, u] of await thingUsage(c.id)) usage.set(tid, u.last);
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

  // Kaleme bağlı, henüz iliştirilmemiş nesneler
  const ghostIds = (data?.links ?? [])
    .filter((l) => l.thingId && !value.some((a) => a.thingId === l.thingId))
    .map((l) => l.thingId!)
    .filter((tid) => data?.byThing.get(tid) && !data.byThing.get(tid)!.archivedAt);

  // Güncel durumlar — iliştirilenlerin "Son" önerisi, hazır bekleyenlerin özeti
  const curKey = [...value.map((a) => a.thingId), ...ghostIds].join(",");
  const current = useLiveQuery(async () => {
    const out = new Map<string, Current>();
    for (const tid of curKey ? curKey.split(",") : []) out.set(tid, await currentThingValues(tid, entryId));
    return out;
  }, [curKey, entryId]);

  const attach = (thingId: string) => {
    if (!value.some((a) => a.thingId === thingId)) onChange([...value, { thingId, values: {} }]);
    setOpen(false);
  };
  const detach = (thingId: string) => onChange(value.filter((a) => a.thingId !== thingId));
  const setVal = (thingId: string, modId: string, v: string) =>
    onChange(value.map((a) => (a.thingId === thingId ? { ...a, values: { ...a.values, [modId]: v } } : a)));

  if (!data) return null;

  const modIdsOf = (th?: Thing) => {
    const coll = th ? data.byColl.get(th.collectionId) : undefined;
    return [...(coll?.modIds ?? []), ...(th?.extraModIds ?? [])];
  };

  // Bağlı listeler: o listeden henüz iliştirilen yoksa "hangisi?" satırı
  const listSlots = data.links
    .filter((l) => l.collectionId && data.byColl.get(l.collectionId))
    .filter((l) => !value.some((a) => data.byThing.get(a.thingId)?.collectionId === l.collectionId))
    .map((l) => data.byColl.get(l.collectionId!)!);

  const ink = brutal ? "text-[#111]" : "text-foreground";
  const sub = brutal ? "text-[#111]/55" : "text-muted-foreground";
  const hasAny = value.length > 0 || ghostIds.length > 0 || listSlots.length > 0;

  const openPicker = (collId?: string) => {
    setOpenColl(collId);
    setOpen(true);
  };

  return (
    <section className="mt-6 flex flex-col gap-3" data-entry-things="">
      {hasAny && (
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("objects.inEntry")}
            {value.length > 0 && <span className="ml-1.5 opacity-60">{value.length}</span>}
          </h3>
        </div>
      )}

      {/* İliştirilen nesneler — başlık + kendi renginde ipe asılı alanlar */}
      {value.map((a) => {
        const th = data.byThing.get(a.thingId);
        const coll = th ? data.byColl.get(th.collectionId) : undefined;
        const color = coll?.color ?? "#94a3b8";
        const mods = modIdsOf(th).map((id) => data.mods.get(id)).filter((m): m is Mod => !!m);
        const cur = current?.get(a.thingId) ?? {};
        return (
          <div key={a.thingId} data-attached-thing="" className="flex flex-col">
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-2xl py-1.5 pl-1.5 pr-1",
                brutal ? "border-2 border-[#111] bg-white shadow-[3px_3px_0_#111]" : "ring-1 ring-inset"
              )}
              style={brutal ? undefined : { background: `${color}14`, ["--tw-ring-color" as string]: `${color}55` }}
            >
              <Diamond color={color} icon={coll?.icon} brutal={brutal} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className={cn("block truncate text-[15px] font-black", ink)}>{th?.name ?? "?"}</span>
                <span className={cn("block truncate text-[11px] font-semibold", sub)}>{coll?.name}</span>
              </span>
              <button
                type="button"
                onClick={() => detach(a.thingId)}
                aria-label={t("entry.removeFromEntry")}
                data-thing-remove=""
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  brutal ? "text-[#111]/60 hover:bg-[#111]/5" : "text-muted-foreground hover:bg-[var(--sf-2)]"
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {mods.length > 0 ? (
              <div className="relative ml-[22px] flex flex-col gap-2 pl-3 pt-2">
                {/* İp — nesnenin başlığından iner, özelliklerini ona bağlar */}
                <span
                  aria-hidden
                  className="absolute bottom-4 left-0 top-0 w-[2px] -translate-x-1/2 rounded-full"
                  style={{ background: brutal ? "#111" : `${color}80` }}
                />
                {mods.map((m) => (
                  <LedgerField
                    key={m.id}
                    mod={asField(m, a.thingId)}
                    icon={modAtomIcon({ name: m.name, entryType: measureOf(m) })}
                    color={modColor(m)}
                    value={a.values[m.id] ?? (m.valueType === "boolean" ? "false" : "")}
                    onChange={(v) => setVal(a.thingId, m.id, v)}
                    recent={cur[m.id] ? [cur[m.id].value] : []}
                    entryDate={entryDate}
                  />
                ))}
              </div>
            ) : (
              <p className={cn("ml-[22px] pl-3 pt-1.5 text-[11.5px]", sub)}>{t("objects.noFeaturesYet")}</p>
            )}
          </div>
        );
      })}

      {/* Kaleme bağlı, iliştirilmemiş nesne — tek satır, durumu ve Ekle */}
      {ghostIds.map((tid) => {
        const th = data.byThing.get(tid)!;
        const coll = data.byColl.get(th.collectionId);
        const color = coll?.color ?? "#94a3b8";
        const summary = summaryOf(current?.get(tid), modIdsOf(th), data.mods);
        return (
          <div
            key={tid}
            data-ghost-thing=""
            className={cn(
              "flex items-center gap-2.5 rounded-2xl py-1.5 pl-1.5 pr-1.5",
              brutal ? "border-2 border-dashed border-[#111]/50 bg-white/60" : "ring-1 ring-inset ring-[var(--ln-2)]"
            )}
          >
            <Diamond color={color} icon={coll?.icon} muted brutal={brutal} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className={cn("block truncate text-[14.5px] font-extrabold", ink, "opacity-80")}>{th.name}</span>
              <span className={cn("block truncate text-[11px] font-semibold", sub)}>
                {summary
                  ? `${summary} · ${formatDate(Math.max(...Object.values(current?.get(tid) ?? {}).map((c) => c.at)))}`
                  : t("objects.readyShort")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => attach(tid)}
              data-thing-check=""
              className={cn(
                "flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-[13px] font-black text-[#111]",
                brutal && "border-2 border-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              )}
              style={{ background: color }}
            >
              <Plus className="h-4 w-4" strokeWidth={3} />
              {t("action.add")}
            </button>
          </div>
        );
      })}

      {/* Kaleme bağlı liste — "Arabalarım: hangisi?", yana kayan çipler */}
      {listSlots.map((c) => {
        const color = c.color ?? "#94a3b8";
        const opts = data.things
          .filter((th) => th.collectionId === c.id && !th.archivedAt && !value.some((a) => a.thingId === th.id))
          .sort((x, y) => (data.usage.get(y.id) ?? y.createdAt) - (data.usage.get(x.id) ?? x.createdAt));
        return (
          <div
            key={c.id}
            data-list-slot=""
            className={cn(
              "flex flex-col gap-2 rounded-2xl py-2 pl-1.5",
              brutal ? "border-2 border-dashed border-[#111]/50 bg-white/60" : "ring-1 ring-inset ring-[var(--ln-2)]"
            )}
          >
            <div className="flex items-center gap-2 pr-3">
              <Diamond color={color} icon={c.icon} size={26} muted brutal={brutal} />
              <span className={cn("min-w-0 flex-1 truncate text-[13.5px] font-black", ink)}>
                {t("objects.whichOne", { list: c.name })}
              </span>
            </div>
            <div className="-mr-px flex gap-1.5 overflow-x-auto pb-0.5 pl-1 pr-3 [scrollbar-width:none]">
              {opts.slice(0, 12).map((th) => (
                <button
                  key={th.id}
                  type="button"
                  data-slot-option=""
                  onClick={() => attach(th.id)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold",
                    brutal ? "border-2 border-[#111] bg-white text-[#111]" : "bg-[var(--sf-2)] ring-1 ring-inset ring-[var(--ln-2)]"
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]" style={{ background: color }} />
                  {th.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => openPicker(c.id)}
                className={cn("flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-[13px] font-semibold", sub)}
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
          usage={data.usage}
          mods={data.mods}
          recent={data.recent.filter((id) => !value.some((a) => a.thingId === id))}
          byThing={data.byThing}
          attachedIds={new Set(value.map((a) => a.thingId))}
          initialColl={openColl}
          onPick={attach}
          onClose={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => openPicker()}
          data-add-thing=""
          className={cn(
            // Çerçevesiz: üstteki hazır nesne ve liste satırları zaten kesikli
            "flex min-h-12 items-center gap-2.5 rounded-2xl px-1.5 text-left transition-colors",
            brutal ? "text-[#111] hover:bg-[#111]/5" : "text-muted-foreground hover:bg-[var(--sf-2)] hover:text-foreground"
          )}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
            <span className={cn("absolute h-[22px] w-[22px] rotate-45 rounded-[6px] border-2 border-dashed", brutal ? "border-[#111]/60" : "border-current")} />
            <Plus className="relative h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[14px] font-extrabold">{t("objects.attach")}</span>
            <span className={cn("block truncate text-[11px] font-medium", sub)}>{t("objects.attachHint")}</span>
          </span>
        </button>
      )}
    </section>
  );
}

/** Form içinde açılan nesne seçici */
function ThingPicker({
  collections,
  things,
  usage,
  mods,
  recent,
  byThing,
  attachedIds,
  initialColl,
  onPick,
  onClose,
}: {
  collections: Collection[];
  things: Thing[];
  usage: Map<string, number>;
  mods: Map<string, Mod>;
  recent: string[];
  byThing: Map<string, Thing>;
  attachedIds: Set<string>;
  initialColl?: string;
  onPick: (thingId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  // Varsayılan liste: istenen, yoksa bu kalemde son iliştirilenin listesi, yoksa ilki
  const [collId, setCollId] = useState<string | undefined>(
    () => initialColl ?? (recent[0] ? byThing.get(recent[0])?.collectionId : undefined) ?? collections[0]?.id
  );
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [listDraft, setListDraft] = useState("");
  const coll = collections.find((c) => c.id === collId);
  const color = coll?.color ?? "#94a3b8";
  const ink = brutal ? "text-[#111]" : "text-foreground";
  const sub = brutal ? "text-[#111]/55" : "text-muted-foreground";

  const q = query.trim().toLocaleLowerCase("tr");
  const pool = useMemo(
    () =>
      things
        .filter((th) => th.collectionId === collId && !attachedIds.has(th.id))
        .filter((th) => (q ? th.name.toLocaleLowerCase("tr").includes(q) : !th.archivedAt))
        .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name, "tr")),
    [things, collId, attachedIds, q, usage]
  );
  const shown = q || all ? pool : pool.slice(0, SHOWN);
  const exact = things.some((th) => th.collectionId === collId && th.name.toLocaleLowerCase("tr") === q);

  // Satırlardaki güncel durum — yalnız görünenler için
  const shownKey = shown.map((th) => th.id).join(",");
  const states = useLiveQuery(async () => {
    const out = new Map<string, Current>();
    for (const id of shownKey ? shownKey.split(",") : []) out.set(id, await currentThingValues(id));
    return out;
  }, [shownKey]);

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

  return (
    <div
      data-thing-picker=""
      className={cn(
        "flex flex-col gap-3 rounded-2xl p-3",
        brutal ? "border-2 border-[#111] bg-white shadow-[4px_4px_0_#111]" : "bg-[var(--sf-1)] ring-1 ring-inset ring-[var(--ln-1)]"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-[15px] font-black", ink)}>{t("objects.attach")}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className={cn("flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--sf-2)]", sub)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Bu kalemde son iliştirilenler — tek dokunuş */}
      {recent.length > 0 && !q && (
        <div className="flex flex-col gap-1.5">
          <span className={cn("text-[11px] font-bold uppercase tracking-wider", sub)}>{t("objects.recentHere")}</span>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
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
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold",
                    brutal ? "border-2 border-[#111] text-[#111]" : "ring-1 ring-inset ring-[var(--ln-2)]"
                  )}
                  style={{ background: `color-mix(in srgb, ${c?.color ?? "#94a3b8"} 22%, white)` }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]" style={{ background: c?.color ?? "#94a3b8" }} />
                  {th.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {collections.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className={cn("text-[12.5px] leading-snug", sub)}>{t("objects.noListsHint")}</p>
          <ListInput value={listDraft} onChange={setListDraft} onSubmit={addList} brutal={brutal} />
        </div>
      ) : (
        <>
          {/* Liste sekmeleri — yana kayar */}
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]" data-collection-tabs="">
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
                    setAll(false);
                  }}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-extrabold transition-colors",
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
              "flex h-11 items-center gap-2 rounded-xl px-3",
              brutal ? "border-2 border-[#111] bg-white" : "bg-black/25 ring-1 ring-inset ring-[var(--ln-2)]"
            )}
          >
            <Search className={cn("h-4 w-4 shrink-0", sub)} />
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
              className={cn("h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50", ink)}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("action.close")} className={sub}>
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className={cn("flex flex-col", brutal ? "gap-1.5" : "divide-y divide-border/50")}>
            {/* Yeni nesne — yazılan ad listede yoksa en üstte */}
            {q && !exact && (
              <button
                type="button"
                data-thing-create=""
                onClick={() => void addNew()}
                className={cn(
                  "flex min-h-12 items-center gap-2.5 rounded-xl px-2 text-left",
                  brutal && "border-2 border-[#111] shadow-[2px_2px_0_#111]"
                )}
                style={{ background: `color-mix(in srgb, ${color} 30%, white)` }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                  <Plus className="h-5 w-5 text-[#111]" strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1 leading-tight text-[#111]">
                  <span className="block truncate text-[14px] font-black">{t("objects.createNamed", { name: query.trim() })}</span>
                  <span className="block truncate text-[11px] font-semibold opacity-60">{t("objects.newIn", { list: coll?.name ?? "" })}</span>
                </span>
              </button>
            )}
            {shown.map((th) => {
              const summary = summaryOf(states?.get(th.id), coll?.modIds ?? [], mods);
              return (
                <button
                  key={th.id}
                  type="button"
                  data-thing-option=""
                  onClick={() => onPick(th.id)}
                  className={cn(
                    "flex min-h-12 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors",
                    brutal ? "border-2 border-[#111] bg-white hover:bg-[#111]/5" : "hover:bg-[var(--sf-2)]"
                  )}
                >
                  <Diamond color={color} icon={coll?.icon} size={30} muted={!!th.archivedAt} brutal={brutal} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={cn("block truncate text-[14px] font-extrabold", ink)}>{th.name}</span>
                    {(summary || th.archivedAt) && (
                      <span className={cn("block truncate text-[11px] font-semibold", sub)}>
                        {[summary, th.archivedAt ? t("objects.archivedTag") : ""].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <Plus className={cn("h-4 w-4 shrink-0", sub)} strokeWidth={2.6} />
                </button>
              );
            })}
            {!q && pool.length === 0 && (
              <p className={cn("px-1 py-2 text-[12.5px]", sub)}>{t("objects.typeToAdd")}</p>
            )}
          </div>
          {!q && !all && pool.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className={cn("flex items-center justify-center gap-1 py-1 text-[12.5px] font-bold", sub)}
            >
              <ChevronDown className="h-4 w-4" />
              {t("objects.showAll", { n: pool.length })}
            </button>
          )}
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
