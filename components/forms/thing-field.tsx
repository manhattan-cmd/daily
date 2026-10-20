"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  createThing,
  joinThingIds,
  splitThingIds,
  thingUsage,
} from "@/lib/db/things";
import { formatDTRDisplay } from "@/components/forms/datetime-range-input";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Mod } from "@/types";

/** Aramasız gösterilen nesne sayısı — gerisi aramayla */
const SHOWN = 8;

/**
 * Girdi formunda "Nesne" türündeki özelliğin alanı.
 *
 * Seçilenler üstte çip; her çipin altında nesnenin kendi özellikleri okunur
 * halde ("1000 mg · Sabah+Akşam") — bunlar girdide tekrar yazılmaz. Altta
 * arama ve aktif nesneler (en son kullanılan önde). Arşivdekiler yalnız
 * aramada, etiketle çıkar. Listede olmayan ad tek dokunuşla eklenir: nesneler
 * çoğu zaman girdi anında doğar (yeni müşteri, yeni kitap), formu bırakıp
 * Yapı'ya gitmek gerekmesin.
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
  const [query, setQuery] = useState("");
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

  // Seçilen nesnelerin özellikleri — okunur özet
  const facts = useLiveQuery(async () => {
    if (!selected.length) return new Map<string, { modId: string; value: string }[]>();
    const rows = await db.thingValues.where("thingId").anyOf(selected).toArray();
    const out = new Map<string, { modId: string; value: string }[]>();
    for (const r of rows) out.set(r.thingId, [...(out.get(r.thingId) ?? []), r]);
    return out;
  }, [value]);

  const byId = useMemo(
    () => new Map((data?.things ?? []).map((th) => [th.id, th])),
    [data]
  );

  if (!collectionId) {
    return <p className="text-[12px] text-muted-foreground">{t("objects.noList")}</p>;
  }

  const q = query.trim().toLocaleLowerCase("tr");
  const pool = (data?.things ?? [])
    .filter((th) => !selected.includes(th.id))
    .filter((th) => (q ? th.name.toLocaleLowerCase("tr").includes(q) : !th.archivedAt))
    .sort(
      (a, b) =>
        (data?.usage.get(b.id)?.last ?? b.createdAt) - (data?.usage.get(a.id)?.last ?? a.createdAt)
    );
  const shown = q ? pool : pool.slice(0, SHOWN);
  const exact = (data?.things ?? []).some((th) => th.name.toLocaleLowerCase("tr") === q);
  const activeCount = (data?.things ?? []).filter((th) => !th.archivedAt).length;
  const listOpen = multiple || selected.length === 0;

  const pick = (thingId: string) => {
    onChange(multiple ? joinThingIds([...selected, thingId]) : thingId);
    setQuery("");
  };
  const unpick = (thingId: string) =>
    onChange(joinThingIds(selected.filter((x) => x !== thingId)));

  async function addNew() {
    const name = query.trim();
    if (!name || !collectionId) return;
    const th = await createThing({ collectionId, name });
    pick(th.id);
  }

  const fact = (modId: string, v: string): string | null => {
    const m: Mod | undefined = data?.mods.get(modId);
    if (!m) return null;
    if (m.valueType === "boolean") return v === "true" ? m.name : null;
    if (m.valueType === "datetime-range") return formatDTRDisplay(v);
    if (m.valueType === "object") return null;
    return m.valueType === "number" && m.unit ? `${v} ${m.unit}` : v;
  };

  return (
    <div className="flex flex-col gap-2" data-thing-field="">
      {/* Seçilenler */}
      {selected.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {selected.map((sid) => {
            const th = byId.get(sid);
            const order = data?.collection?.modIds ?? [];
            const lines = (facts?.get(sid) ?? [])
              .sort((a, b) => order.indexOf(a.modId) - order.indexOf(b.modId))
              .map((r) => fact(r.modId, r.value))
              .filter(Boolean);
            return (
              <div
                key={sid}
                data-thing-chip=""
                className={cn(well, "items-center gap-2 py-2")}
                style={{ ...wellStyle, boxShadow: `inset 0 0 0 1.5px ${color}` }}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold leading-5">
                    {th?.name ?? "?"}
                  </span>
                  {lines.length > 0 && (
                    <span className="block truncate text-[11.5px] font-medium text-muted-foreground">
                      {lines.join(" · ")}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => unpick(sid)}
                  aria-label={t("entry.removeFromEntry")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--sf-2)] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {listOpen && (
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
              placeholder={
                activeCount
                  ? t("objects.search", { n: activeCount })
                  : t("objects.newIn", { list: data?.collection?.name ?? "" })
              }
              aria-label={t("action.search")}
              className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/50"
            />
          </label>

          {(shown.length > 0 || (q && !exact)) && (
            <div className="flex flex-wrap gap-1.5">
              {shown.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  data-thing-option=""
                  onClick={() => pick(th.id)}
                  className="flex min-h-9 max-w-full items-center gap-1.5 rounded-xl bg-black/25 px-3 py-1.5 text-[13.5px] font-semibold text-muted-foreground ring-1 ring-inset hover:text-foreground"
                  style={{ ["--tw-ring-color" as string]: `${color}40` }}
                >
                  <span className="truncate">{th.name}</span>
                  {th.archivedAt && (
                    <span className="shrink-0 text-[10.5px] font-medium opacity-70">
                      {t("objects.archivedTag")}
                    </span>
                  )}
                </button>
              ))}
              {q && !exact && (
                <button
                  type="button"
                  data-thing-create=""
                  onClick={() => void addNew()}
                  className="flex min-h-9 max-w-full items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13.5px] font-bold"
                  style={{ background: `${color}26`, color, boxShadow: `inset 0 0 0 1.5px ${color}` }}
                >
                  <Plus className="h-4 w-4 shrink-0" strokeWidth={2.6} />
                  <span className="truncate">{t("objects.createNamed", { name: query.trim() })}</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
