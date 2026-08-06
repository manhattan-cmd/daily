import { nanoid } from "nanoid";
import { db } from "./index";
import type { Deletion } from "@/types";

/** Günlükte tutma süresi — sonrası temizlenir (payload'lar yer kaplar) */
const KEEP_MS = 30 * 86400000;

/** "Geri al" şeridinin görünür kaldığı süre */
export const UNDO_WINDOW_MS = 12000;

export const newBatchId = () => nanoid(10);

/** Kullanıcıya sayılırken anlamlı olan tablolar — entryValues gibi bağlı kayıtlar sayılmaz */
const COUNTED: Record<string, [tekil: string, cogul: string]> = {
  entries: ["girdi", "girdi"],
  notes: ["not", "not"],
  goals: ["hedef", "hedef"],
  categories: ["kategori", "kategori"],
  subcategories: ["alt kategori", "alt kategori"],
  activities: ["aktivite", "aktivite"],
  mods: ["özellik", "özellik"],
};

/**
 * Silinen kayıtları günlüğe yazar. Silme işlemiyle AYNI transaction içinden
 * çağrılmalı (çağıran taraf db.deletions'ı transaction tablolarına eklemeli),
 * yoksa silme başarılı olup günlük yazılamayabilir.
 */
export async function logDeletions(
  table: string,
  records: Array<{ id: string }>,
  batchId: string
): Promise<void> {
  if (!records.length) return;
  const deletedAt = Date.now();
  const rows: Deletion[] = records.map((record) => ({
    id: nanoid(12),
    batchId,
    table,
    recordId: record.id,
    deletedAt,
    payload: record,
    updatedAt: deletedAt,
  }));
  await db.deletions.bulkAdd(rows);
}

export interface UndoableBatch {
  batchId: string;
  deletedAt: number;
  /** "3 girdi · 1 not" */
  label: string;
}

/**
 * Geri alınabilecek en son silme grubu — süresi geçmişse null.
 * Canlı sorgu olarak kullanılır: herhangi bir yerde silme olduğunda şerit çıkar.
 */
export async function latestUndoableBatch(): Promise<UndoableBatch | null> {
  const newest = await db.deletions.orderBy("deletedAt").last();
  if (!newest) return null;
  if (Date.now() - newest.deletedAt > UNDO_WINDOW_MS) return null;

  const rows = await db.deletions
    .where("batchId")
    .equals(newest.batchId)
    .toArray();
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!COUNTED[r.table]) continue;
    counts.set(r.table, (counts.get(r.table) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([table, n]) => {
    const [tekil, cogul] = COUNTED[table];
    return `${n} ${n === 1 ? tekil : cogul}`;
  });
  return {
    batchId: newest.batchId,
    deletedAt: newest.deletedAt,
    label: parts.length ? parts.join(" · ") : `${rows.length} kayıt`,
  };
}

/**
 * Bir silme grubunu geri alır: kayıtlar kendi zaman damgalarıyla yerine konur
 * (damgalama kapalı — geri alınan kayıt "az önce değişmiş" gibi görünmemeli),
 * günlük satırları silinir.
 */
export async function undoBatch(batchId: string): Promise<number> {
  const rows = await db.deletions.where("batchId").equals(batchId).toArray();
  if (!rows.length) return 0;

  const byTable = new Map<string, unknown[]>();
  for (const r of rows) {
    if (!r.payload) continue;
    const list = byTable.get(r.table) ?? [];
    list.push(r.payload);
    byTable.set(r.table, list);
  }

  const tables = [...byTable.keys()].map((t) => db.table(t));
  await db.withoutStamping(() =>
    db.transaction("rw", [...tables, db.deletions], async () => {
      for (const [name, payloads] of byTable) {
        await db.table(name).bulkPut(payloads);
      }
      await db.deletions.bulkDelete(rows.map((r) => r.id));
    })
  );
  return rows.length;
}

/** Süresi dolmuş günlük satırlarını temizler — açılışta çağrılır. */
export async function purgeOldDeletions(): Promise<void> {
  const cutoff = Date.now() - KEEP_MS;
  await db.deletions.where("deletedAt").below(cutoff).delete();
}
