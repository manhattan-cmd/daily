import { db } from "./index";
import type {
  Activity,
  Category,
  SubCategory,
  Field,
  GlobalDimension,
  EntryType,
  CategoryModifier,
  Mod,
  Entry,
  EntryValue,
  Goal,
} from "@/types";

/** Yedek dosyası biçimi değiştiğinde artır — restoreBackup ileride sürüme göre dallanabilir */
export const BACKUP_VERSION = 1;

export interface BackupData {
  categories: Category[];
  subcategories: SubCategory[];
  fields: Field[];
  globalDimensions: GlobalDimension[];
  entryTypes: EntryType[];
  categoryModifiers: CategoryModifier[];
  mods: Mod[];
  entries: Entry[];
  entryValues: EntryValue[];
  goals: Goal[];
  /** v10+ — eski yedeklerde bulunmayabilir */
  activities?: Activity[];
}

export interface BackupPayload {
  app: "routine";
  version: number;
  exportedAt: number;
  data: BackupData;
}

/** Tüm tabloları tek bir JSON-serileştirilebilir nesnede toplar. */
export async function exportBackup(): Promise<BackupPayload> {
  const [
    categories,
    subcategories,
    fields,
    globalDimensions,
    entryTypes,
    categoryModifiers,
    mods,
    entries,
    entryValues,
    goals,
    activities,
  ] = await Promise.all([
    db.categories.toArray(),
    db.subcategories.toArray(),
    db.fields.toArray(),
    db.globalDimensions.toArray(),
    db.entryTypes.toArray(),
    db.categoryModifiers.toArray(),
    db.mods.toArray(),
    db.entries.toArray(),
    db.entryValues.toArray(),
    db.goals.toArray(),
    db.activities.toArray(),
  ]);
  return {
    app: "routine",
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: {
      categories,
      subcategories,
      fields,
      globalDimensions,
      entryTypes,
      categoryModifiers,
      mods,
      entries,
      entryValues,
      goals,
      activities,
    },
  };
}

/** Tarayıcıya routine-yedek-YYYY-MM-DD.json olarak indirtir. */
export function downloadBackup(payload: BackupPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date(payload.exportedAt).toISOString().slice(0, 10);
  a.href = url;
  a.download = `routine-yedek-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Dosya içeriğini doğrular ve ayrıştırır; biçim uymuyorsa açıklayıcı hata fırlatır. */
export function parseBackupFile(text: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Dosya geçerli bir JSON değil.");
  }
  const p = parsed as Partial<BackupPayload> | null;
  if (!p || typeof p !== "object" || p.app !== "routine" || !p.data) {
    throw new Error("Bu dosya bir Routine yedeği gibi görünmüyor.");
  }
  return p as BackupPayload;
}

/**
 * Mevcut tüm veriyi siler ve yedekteki veriyle değiştirir. Geri alınamaz —
 * çağıran taraf kullanıcıdan onay almalı.
 */
export async function restoreBackup(payload: BackupPayload): Promise<void> {
  const { data } = payload;
  await db.transaction(
    "rw",
    [
      db.categories,
      db.subcategories,
      db.fields,
      db.globalDimensions,
      db.entryTypes,
      db.categoryModifiers,
      db.mods,
      db.entries,
      db.entryValues,
      db.goals,
      db.activities,
    ],
    async () => {
      await Promise.all([
        db.categories.clear(),
        db.subcategories.clear(),
        db.fields.clear(),
        db.globalDimensions.clear(),
        db.entryTypes.clear(),
        db.categoryModifiers.clear(),
        db.mods.clear(),
        db.entries.clear(),
        db.entryValues.clear(),
        db.goals.clear(),
        db.activities.clear(),
      ]);
      await Promise.all([
        data.categories?.length ? db.categories.bulkPut(data.categories) : null,
        data.subcategories?.length ? db.subcategories.bulkPut(data.subcategories) : null,
        data.fields?.length ? db.fields.bulkPut(data.fields) : null,
        data.globalDimensions?.length
          ? db.globalDimensions.bulkPut(data.globalDimensions)
          : null,
        data.entryTypes?.length ? db.entryTypes.bulkPut(data.entryTypes) : null,
        data.categoryModifiers?.length
          ? db.categoryModifiers.bulkPut(data.categoryModifiers)
          : null,
        data.mods?.length ? db.mods.bulkPut(data.mods) : null,
        data.entries?.length ? db.entries.bulkPut(data.entries) : null,
        data.entryValues?.length ? db.entryValues.bulkPut(data.entryValues) : null,
        data.goals?.length ? db.goals.bulkPut(data.goals) : null,
        data.activities?.length ? db.activities.bulkPut(data.activities) : null,
      ]);
    }
  );
}
