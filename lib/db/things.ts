import { nanoid } from "nanoid";
import { db } from "./index";
import type { Collection, Entry, Thing, ThingValue } from "@/types";

/**
 * NESNELER — koleksiyonlar, üyeleri ve üyelerin özellik değerleri.
 *
 * Girdiye bağ "object" türündeki bir özellikle kuruluyor: değer nesnenin
 * kimliği, çoklu seçimde kimlikler virgülle ayrılıyor (nanoid virgül
 * üretmez). Ayrı bir bağ tablosu yerine bu biçim seçildi çünkü girdi formu,
 * düzenleme, paralel perspektif ve yedek değeri zaten tek metin olarak
 * taşıyor — hepsi değişmeden çalışıyor.
 */

const id = () => nanoid(12);
const now = () => Date.now();

/** "a1,b2" → ["a1","b2"] */
export const splitThingIds = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const joinThingIds = (ids: string[]): string => [...new Set(ids)].join(",");

const norm = (s: string) => s.trim().toLocaleLowerCase("tr");

// ============ Koleksiyonlar ============

export async function listCollections(): Promise<Collection[]> {
  const all = await db.collections.toArray();
  return all.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function getCollection(collectionId: string): Promise<Collection | undefined> {
  return db.collections.get(collectionId);
}

export async function findCollectionByName(name: string): Promise<Collection | undefined> {
  const n = norm(name);
  return (await db.collections.toArray()).find((c) => norm(c.name) === n);
}

export async function createCollection(input: {
  name: string;
  icon?: string;
  color?: string;
}): Promise<Collection> {
  const count = await db.collections.count();
  const c: Collection = {
    id: id(),
    name: input.name.trim(),
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.color ? { color: input.color } : {}),
    modIds: [],
    order: count + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.collections.add(c);
  return c;
}

export async function updateCollection(
  collectionId: string,
  patch: Partial<Pick<Collection, "name" | "icon" | "color">>
): Promise<void> {
  await db.collections.update(collectionId, {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
  });
}

/** Koleksiyona özellik ekle — her nesne bunu taşır */
export async function addCollectionMod(collectionId: string, modId: string): Promise<void> {
  const c = await db.collections.get(collectionId);
  if (!c || c.modIds.includes(modId)) return;
  await db.collections.update(collectionId, { modIds: [...c.modIds, modId] });
}

/** Özelliği koleksiyondan çıkar; nesnelerdeki değerleri de silinir */
export async function removeCollectionMod(collectionId: string, modId: string): Promise<void> {
  const c = await db.collections.get(collectionId);
  if (!c) return;
  const thingIds = (await db.things.where("collectionId").equals(collectionId).toArray())
    .filter((th) => !th.extraModIds?.includes(modId))
    .map((th) => th.id);
  await db.transaction("rw", [db.collections, db.thingValues], async () => {
    await db.collections.update(collectionId, { modIds: c.modIds.filter((m) => m !== modId) });
    if (thingIds.length) {
      const ids = new Set(thingIds);
      await db.thingValues
        .where("modId")
        .equals(modId)
        .filter((v) => ids.has(v.thingId))
        .delete();
    }
  });
}

/** Bu koleksiyondan seçtiren özellikler (object türü) */
export async function objectModsOf(collectionId: string) {
  return (await db.mods.toArray()).filter(
    (m) => m.valueType === "object" && m.collectionId === collectionId
  );
}

/**
 * Koleksiyonu sil — yalnız boşsa ve hiçbir özellik ondan seçtirmiyorsa.
 * Dolu koleksiyonu sessizce silmek geçmiş girdilerin bağını koparırdı.
 */
export async function deleteCollection(
  collectionId: string
): Promise<{ ok: true } | { ok: false; things: number; mods: number }> {
  const [things, mods] = await Promise.all([
    db.things.where("collectionId").equals(collectionId).count(),
    objectModsOf(collectionId),
  ]);
  if (things || mods.length) return { ok: false, things, mods: mods.length };
  await db.collections.delete(collectionId);
  return { ok: true };
}

// ============ Nesneler ============

export async function listThings(collectionId: string): Promise<Thing[]> {
  const all = await db.things.where("collectionId").equals(collectionId).toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export async function getThing(thingId: string): Promise<Thing | undefined> {
  return db.things.get(thingId);
}

export async function findThingByName(
  collectionId: string,
  name: string
): Promise<Thing | undefined> {
  const n = norm(name);
  return (await db.things.where("collectionId").equals(collectionId).toArray()).find(
    (th) => norm(th.name) === n
  );
}

export async function createThing(input: {
  collectionId: string;
  name: string;
  values?: Record<string, string>;
}): Promise<Thing> {
  const th: Thing = {
    id: id(),
    collectionId: input.collectionId,
    name: input.name.trim(),
    createdAt: now(),
    updatedAt: now(),
  };
  const values: ThingValue[] = Object.entries(input.values ?? {})
    .filter(([, v]) => v !== "")
    .map(([modId, value]) => ({ id: id(), thingId: th.id, modId, value, updatedAt: now() }));
  await db.transaction("rw", [db.things, db.thingValues], async () => {
    await db.things.add(th);
    if (values.length) await db.thingValues.bulkAdd(values);
  });
  return th;
}

export async function renameThing(thingId: string, name: string): Promise<void> {
  await db.things.update(thingId, { name: name.trim() });
}

export async function setThingArchived(thingId: string, archived: boolean): Promise<void> {
  await db.things.update(thingId, { archivedAt: archived ? now() : undefined });
}

/** Yalnız bu nesneye özellik ekle / çıkar */
export async function addThingExtraMod(thingId: string, modId: string): Promise<void> {
  const th = await db.things.get(thingId);
  if (!th || th.extraModIds?.includes(modId)) return;
  await db.things.update(thingId, { extraModIds: [...(th.extraModIds ?? []), modId] });
}

export async function removeThingExtraMod(thingId: string, modId: string): Promise<void> {
  const th = await db.things.get(thingId);
  if (!th) return;
  await db.transaction("rw", [db.things, db.thingValues], async () => {
    await db.things.update(thingId, {
      extraModIds: (th.extraModIds ?? []).filter((m) => m !== modId),
    });
    await db.thingValues.where("[thingId+modId]").equals([thingId, modId]).delete();
  });
}

export async function listThingValues(thingId: string): Promise<Record<string, string>> {
  const rows = await db.thingValues.where("thingId").equals(thingId).toArray();
  return Object.fromEntries(rows.map((r) => [r.modId, r.value]));
}

/** Nesnenin bir özelliğine değer yaz; boş değer kaydı siler */
export async function setThingValue(thingId: string, modId: string, value: string): Promise<void> {
  await db.transaction("rw", [db.thingValues, db.things], async () => {
    const existing = await db.thingValues.where("[thingId+modId]").equals([thingId, modId]).first();
    if (value === "") {
      if (existing) await db.thingValues.delete(existing.id);
    } else if (existing) {
      await db.thingValues.update(existing.id, { value });
    } else {
      await db.thingValues.add({ id: id(), thingId, modId, value, updatedAt: now() });
    }
    await db.things.update(thingId, { updatedAt: now() });
  });
}

/** Nesneye bağlı girdiler — kategorilerden bağımsız, yeniden eskiye */
export async function thingEntries(thingId: string): Promise<Entry[]> {
  const th = await db.things.get(thingId);
  if (!th) return [];
  const modIds = (await objectModsOf(th.collectionId)).map((m) => m.id);
  if (!modIds.length) return [];
  const vals = await db.entryValues.where("modId").anyOf(modIds).toArray();
  const entryIds = [
    ...new Set(vals.filter((v) => splitThingIds(v.value).includes(thingId)).map((v) => v.entryId)),
  ];
  const entries = (await db.entries.bulkGet(entryIds)).filter((e): e is Entry => !!e);
  return entries.sort((a, b) => b.occurredAt - a.occurredAt);
}

/** Koleksiyondaki her nesnenin girdi sayısı ve son kullanımı */
export async function thingUsage(
  collectionId: string
): Promise<Map<string, { count: number; last: number }>> {
  const modIds = (await objectModsOf(collectionId)).map((m) => m.id);
  const out = new Map<string, { count: number; last: number }>();
  if (!modIds.length) return out;
  const vals = await db.entryValues.where("modId").anyOf(modIds).toArray();
  const entries = await db.entries.bulkGet([...new Set(vals.map((v) => v.entryId))]);
  const at = new Map(entries.filter((e): e is Entry => !!e).map((e) => [e.id, e.occurredAt]));
  for (const v of vals) {
    const t = at.get(v.entryId);
    if (t === undefined) continue;
    for (const tid of splitThingIds(v.value)) {
      const u = out.get(tid) ?? { count: 0, last: 0 };
      u.count++;
      u.last = Math.max(u.last, t);
      out.set(tid, u);
    }
  }
  return out;
}

/**
 * Nesneyi sil — yalnız hiçbir girdide geçmiyorsa. Geçiyorsa arşivlemek
 * doğru yol: girdiler bağlı kalır, seçicide görünmez.
 */
export async function deleteThing(
  thingId: string
): Promise<{ ok: true } | { ok: false; entries: number }> {
  const used = await thingEntries(thingId);
  if (used.length) return { ok: false, entries: used.length };
  await db.transaction("rw", [db.things, db.thingValues], async () => {
    await db.thingValues.where("thingId").equals(thingId).delete();
    await db.things.delete(thingId);
  });
  return { ok: true };
}
