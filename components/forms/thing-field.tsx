"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  createThing,
  currentThingValues,
  joinThingIds,
  splitThingIds,
  thingUsage,
} from "@/lib/db/things";
import { measureOf } from "@/lib/db/queries";
import { LedgerField } from "@/components/forms/ledger-field";
import { modAtomIcon } from "@/components/structure/mod-atom";
import {
  asThingField,
  Diamond,
  summaryOf,
  ThingHeader,
  ThingRail,
  useThingValues,
  type ThingCurrent,
} from "@/components/forms/thing-ui";
import { modColor } from "@/lib/mod-color";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Mod } from "@/types";

/** Aramasız gösterilen nesne sayısı */
const SHOWN = 6;

/**
 * Girdi formunda "Nesne" türündeki özelliğin alanı — "Hangi araba".
 *
 * Boşken: arama ve listenin nesneleri satır satır (en son kullanılan önde,
 * her satırda nesnenin güncel durumu: "53.485 km"); listede olmayan ad tek
 * dokunuşla eklenir — nesneler çoğu zaman girdi anında doğar.
 * Seçilince: nesnenin başlığı ve altında, başlıktan inen ipe asılı kendi
 * özellikleri ("Mevcut km", Son önerisi güncel değer). Yazılan değer bu
 * girdiye bu nesne için kaydedilir ve nesnenin güncel durumu olur.
 * Çoklu seçimde başlıklar alt alta, "Bir tane daha" ile yenisi.
 */
export function ThingField({
  collectionId,
  multiple,
  value,
  onChange,
  color,
  well,
  wellStyle,
}: {
  collectionId?: string;
  multiple?: boolean;
  value: string;
  onChange: (v: string) => void;
  color: string;
  /** LedgerField'in giriş yuvası sınıfı ve stili — aynı görünüm */
  well: string;
  wellStyle: React.CSSProperties;
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const ctx = useThingValues();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const selected = splitThingIds(value);

  const data = useLiveQuery(async () => {
    if (!collectionId) return null;
    const [collection, things, usage, mods] = await Promise.all([
      db.collections.get(collectionId),
      db.things.where("collectionId").equals(collectionId).toArray(),
      thingUsage(collectionId),
      db.mods.toArray(),
    ]);
    return { collection, things, usage, mods: new Map(mods.map((m) => [m.id, m])) };
  }, [collectionId]);

  const q = query.trim().toLocaleLowerCase("tr");
  const pool = (data?.things ?? [])
    .filter((th) => !selected.includes(th.id))
    .filter((th) => (q ? th.name.toLocaleLowerCase("tr").includes(q) : !th.archivedAt))
    .sort(
      (a, b) =>
        (data?.usage.get(b.id)?.last ?? b.createdAt) - (data?.usage.get(a.id)?.last ?? a.createdAt)
    );
  const shown = q ? pool : pool.slice(0, SHOWN);

  // Güncel durumlar — seçilenlerin "Son" önerisi ve satırların özeti
  const stateKey = [...selected, ...shown.map((th) => th.id)].join(",");
  const states = useLiveQuery(async () => {
    const out = new Map<string, ThingCurrent>();
    for (const id of stateKey ? stateKey.split(",") : []) out.set(id, await currentThingValues(id, ctx?.entryId));
    return out;
  }, [stateKey, ctx?.entryId]);

  if (!collectionId) {
    return <p className="text-[12px] text-muted-foreground">{t("objects.noList")}</p>;
  }
  if (!data) return null;

  const coll = data.collection;
  const listColor = coll?.color ?? color;
  const featureIds = coll?.modIds ?? [];
  const exact = (data.things ?? []).some((th) => th.name.toLocaleLowerCase("tr") === q);
  const pickerOpen = selected.length === 0 || (multiple && adding);
  const ink = brutal ? "text-[#111]" : "text-foreground";
  const sub = brutal ? "text-[#111]/55" : "text-muted-foreground";

  const pick = (thingId: string) => {
    onChange(multiple ? joinThingIds([...selected, thingId]) : thingId);
    setQuery("");
    setAdding(false);
  };
  const unpick = (thingId: string) => onChange(joinThingIds(selected.filter((x) => x !== thingId)));

  async function addNew() {
    const name = query.trim();
    if (!name || !collectionId) return;
    const th = await createThing({ collectionId, name });
    pick(th.id);
  }

  return (
    <div className="flex flex-col gap-2.5" data-thing-field="">
      {/* Seçilenler — başlık ve ipe asılı özellikleri */}
      {selected.map((sid) => {
        const th = data.things.find((x) => x.id === sid);
        const mods = [...featureIds, ...(th?.extraModIds ?? [])]
          .map((id) => data.mods.get(id))
          .filter((m): m is Mod => !!m && m.valueType !== "object");
        const cur = states?.get(sid) ?? {};
        return (
          <div key={sid} className="flex flex-col" data-thing-chip="">
            <ThingHeader
              name={th?.name ?? "?"}
              listName={coll?.name}
              color={listColor}
              icon={coll?.icon}
              brutal={brutal}
              onRemove={() => unpick(sid)}
              removeLabel={t("entry.removeFromEntry")}
            />
            {ctx && mods.length > 0 && (
              <ThingRail color={listColor} brutal={brutal}>
                {mods.map((m) => (
                  <LedgerField
                    key={m.id}
                    mod={asThingField(m, sid)}
                    icon={modAtomIcon({ name: m.name, entryType: measureOf(m) })}
                    color={modColor(m)}
                    value={ctx.get(sid, m.id) ?? (m.valueType === "boolean" ? "false" : "")}
                    onChange={(v) => ctx.set(sid, m.id, v)}
                    recent={cur[m.id] ? [cur[m.id].value] : []}
                    entryDate={ctx.entryDate}
                  />
                ))}
              </ThingRail>
            )}
          </div>
        );
      })}

      {multiple && selected.length > 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn("flex h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-bold", sub, "hover:bg-[var(--sf-2)]")}
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} />
          {t("objects.oneMore")}
        </button>
      )}

      {pickerOpen && (
        <>
          <label className={cn(well, "min-h-10 gap-2")} style={wellStyle}>
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
              className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/50"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("action.close")} className="text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className="flex flex-col gap-1.5">
            {q && !exact && (
              <button
                type="button"
                data-thing-create=""
                onClick={() => void addNew()}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-left text-[#111]",
                  brutal && "border-2 border-[#111] shadow-[2px_2px_0_#111]"
                )}
                style={{ background: `color-mix(in srgb, ${listColor} 30%, white)` }}
              >
                <Plus className="mx-1.5 h-5 w-5 shrink-0" strokeWidth={3} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[14px] font-black">{t("objects.createNamed", { name: query.trim() })}</span>
                  <span className="block truncate text-[11px] font-semibold opacity-60">{t("objects.newIn", { list: coll?.name ?? "" })}</span>
                </span>
              </button>
            )}
            {shown.map((th) => {
              const summary = summaryOf(states?.get(th.id), featureIds, data.mods);
              return (
                <button
                  key={th.id}
                  type="button"
                  data-thing-option=""
                  onClick={() => pick(th.id)}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors",
                    brutal ? "border-2 border-[#111] bg-white hover:bg-[#111]/5" : "bg-black/20 hover:bg-[var(--sf-2)]"
                  )}
                >
                  <Diamond color={listColor} icon={coll?.icon} size={28} muted={!!th.archivedAt} brutal={brutal} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={cn("block truncate text-[14px] font-extrabold", ink)}>{th.name}</span>
                    {(summary || th.archivedAt) && (
                      <span className={cn("block truncate text-[11px] font-semibold", sub)}>
                        {[summary, th.archivedAt ? t("objects.archivedTag") : ""].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {!q && pool.length > shown.length && (
              <p className={cn("px-1 text-[11.5px] font-semibold", sub)}>
                {t("objects.moreToSearch", { n: pool.length - shown.length })}
              </p>
            )}
            {!q && pool.length === 0 && (
              <p className={cn("px-1 text-[12px]", sub)}>{t("objects.typeToAdd")}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
