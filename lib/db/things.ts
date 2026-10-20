import { nanoid } from "nanoid";
import { db } from "./index";
import type { Collection, Entry, Thing, ThingValue } from "@/types";

/**
 * NESNELER — koleksiyonlar, üyeleri ve üyelerin özellik değerleri.
 *
 * Nesne girdiye İLİŞTİRİLİR (entry.thingIds): eylem kategoride (Okuma),
 * eylemin ilgili olduğu şey nesne (Sapiens). Girdide nesne için yazılan
 * değerler entryValues içinde thingId ile durur ("Bulunulan sayfa: 214")
 * ve nesnenin güncel durumu bunlardan okunur. Nesne sayfasında elle yazılan
 * değer (thingValues) başlangıç ya da düzeltme değeridir.
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
  const entries = await db.entries.where("thingIds").equals(thingId).toArray();
  return entries.sort((a, b) => b.occurredAt - a.occurredAt);
}

/** Koleksiyondaki her nesnenin girdi sayısı ve son kullanımı */
export async function thingUsage(
  collectionId: string
): Promise<Map<string, { count: number; last: number }>> {
  const ids = (await db.things.where("collectionId").equals(collectionId).primaryKeys()) as string[];
  const out = new Map<string, { count: number; last: number }>();
  if (!ids.length) return out;
  const set = new Set(ids);
  const entries = await db.entries.where("thingIds").anyOf(ids).distinct().toArray();
  for (const e of entries) {
    for (const tid of e.thingIds ?? []) {
      if (!set.has(tid)) continue;
      const u = out.get(tid) ?? { count: 0, last: 0 };
      u.count++;
      u.last = Math.max(u.last, e.occurredAt);
      out.set(tid, u);
    }
  }
  return out;
}

/**
 * Nesnenin güncel değerleri — her özellik için en yeni kayıt: girdilerde
 * o nesne için yazılan değer (zamanı girdinin zamanı) ya da nesne sayfasında
 * elle yazılan değer (zamanı yazıldığı an). Duster'ın "mevcut km"si son
 * sürüş girdisindeki km'dir. `exceptEntryId`: düzenlenen girdinin kendi
 * değeri "son" diye önerilmesin.
 */
export async function currentThingValues(
  thingId: string,
  exceptEntryId?: string
): Promise<Record<string, { value: string; at: number }>> {
  // Girdiler kendi aralarında girdinin saatine göre sıralanır (dünkü
  // sürüşü bugün girmek bugünkünü ezmesin); elle yazılan değer ancak en
  // son girdi KAYDEDİLDİKTEN sonra yazıldıysa geçerli — girdi saati dakikaya
  // yuvarlı olduğundan saatle kıyaslamak aynı dakikadaki düzeltmeyi yanlış
  // tarafa koyuyordu.
  const best: Record<string, { value: string; at: number; saved: number }> = {};
  const vals = (await db.entryValues.where("thingId").equals(thingId).toArray()).filter(
    (v) => v.modId && v.value !== "" && v.entryId !== exceptEntryId
  );
  if (vals.length) {
    const entries = await db.entries.bulkGet([...new Set(vals.map((v) => v.entryId))]);
    const byId = new Map(entries.filter((e): e is Entry => !!e).map((e) => [e.id, e]));
    for (const v of vals) {
      const e = byId.get(v.entryId);
      if (!e) continue;
      const cur = best[v.modId!];
      if (!cur || cur.at <= e.occurredAt)
        best[v.modId!] = { value: v.value, at: e.occurredAt, saved: e.createdAt };
    }
  }
  const out: Record<string, { value: string; at: number }> = {};
  for (const [modId, b] of Object.entries(best)) out[modId] = { value: b.value, at: b.at };
  for (const v of await db.thingValues.where("thingId").equals(thingId).toArray()) {
    if (v.value === "") continue;
    const b = best[v.modId];
    if (!b || v.updatedAt > b.saved) out[v.modId] = { value: v.value, at: v.updatedAt };
  }
  return out;
}

/** Bu kalemin son girdilerine iliştirilmiş nesneler — formda ilk öneri */
export async function recentThingsForSub(subcategoryId: string, limit = 6): Promise<string[]> {
  const entries = await db.entries.where("subcategoryId").equals(subcategoryId).toArray();
  entries.sort((a, b) => b.occurredAt - a.occurredAt);
  const out: string[] = [];
  for (const e of entries.slice(0, 40))
    for (const tid of e.thingIds ?? []) if (!out.includes(tid)) out.push(tid);
  return out.slice(0, limit);
}

/**
 * Nesneyi sil — yalnız hiçbir girdiye iliştirilmemişse. İliştirildiyse
 * arşivlemek doğru yol: girdiler bağlı kalır, seçicide görünmez.
 */
export async function deleteThing(
  thingId: string
): Promise<{ ok: true } | { ok: false; entries: number }> {
  const used = await db.entries.where("thingIds").equals(thingId).count();
  if (used) return { ok: false, entries: used };
  await db.transaction("rw", [db.things, db.thingValues], async () => {
    await db.thingValues.where("thingId").equals(thingId).delete();
    await db.things.delete(thingId);
  });
  return { ok: true };
}
