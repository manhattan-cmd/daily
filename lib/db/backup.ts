import type { Table } from "dexie";
import { db, type RoutineDB } from "./index";
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
  Note,
} from "@/types";

/**
 * Yedek biçimi sürümü.
 *   1 — ilk biçim (notlar YOKTU: v12'de eklenen notes tablosu yedeğe hiç girmiyordu)
 *   2 — tam kopya: notes dahil, tablo listesi tek kaynaktan üretiliyor
 *
 * Yedek yalnızca "geçici bir çözüm" değil: web sürümünden mağaza sürümüne
 * geçerken kullanıcının verisini taşıyacak köprü de bu dosya. Bu yüzden
 * eksiksiz olması derleme zamanında garanti altına alınır (bkz. Uncovered).
 */
export const BACKUP_VERSION = 2;

/**
 * Yedeğe giren tablolar — dışa aktarma, geri yükleme ve temizleme hep bu tek
 * listeden çalışır. Yeni bir tablo eklenip buraya yazılmazsa aşağıdaki tip
 * kontrolü derlemeyi kırar; "tabloyu yedeğe eklemeyi unutma" hatası bir daha
 * sessizce yaşanmaz.
 */
export const BACKUP_TABLES = [
  "categories",
  "subcategories",
  "fields",
  "globalDimensions",
  "entryTypes",
  "categoryModifiers",
  "mods",
  "entries",
  "entryValues",
  "goals",
  "activities",
  "notes",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/**
 * Bilerek yedeğe alınmayan tablolar. deletions = silme günlüğü: içinde silinmiş
 * kayıtların tam kopyaları var, yedeği şişirir ve yeni cihazda anlamı yok
 * (mezar taşları ancak senkron geldiğinde işe yarar, dosya taşımada değil).
 */
type NotBackedUpTable = "deletions";

/** RoutineDB üzerindeki Dexie tablolarının adları */
type DbTableName = {
  [K in keyof RoutineDB]: RoutineDB[K] extends Table ? K : never;
}[keyof RoutineDB];

/**
 * Yedeğe alınmayan tablo kalırsa derleme kırılır ve hata metni eksik tablonun
 * adını söyler: Type 'true' is not assignable to type
 * '["BU TABLOLAR YEDEĞE EKLENMELİ", "notes"]'
 */
type Uncovered = Exclude<DbTableName, BackupTable | NotBackedUpTable>;
const _allTablesCovered: Uncovered extends never
  ? true
  : ["BU TABLOLAR YEDEĞE EKLENMELİ", Uncovered] = true;
void _allTablesCovered;

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
  /** v2+ — sürüm 1 yedeklerinde notlar hiç yok */
  notes?: Note[];
}

export interface BackupPayload {
  app: "routine";
  version: number;
  exportedAt: number;
  data: BackupData;
}

/** Geri yükleme davranışı */
export type RestoreMode =
  /** Cihazdaki her şey silinir, yerine yedek konur */
  | "replace"
  /** Yedek mevcut verinin üzerine eklenir; çakışan kayıtta yeni olan kazanır */
  | "merge";

export interface RestoreResult {
  mode: RestoreMode;
  /** Yazılan kayıt sayısı */
  written: number;
  /** Birleştirmede cihazdaki sürümü daha yeni olduğu için atlanan kayıt sayısı */
  skipped: number;
}

/** Kayıtla ilgili en son zaman damgası — birleştirmede "hangisi yeni" kararı */
function stampOf(record: unknown): number {
  const r = record as { updatedAt?: number; createdAt?: number };
  return r?.updatedAt ?? r?.createdAt ?? 0;
}

type AnyRecord = { id: string };

const tableOf = (name: BackupTable) =>
  db.table(name) as unknown as Table<AnyRecord, string>;

const rowsOf = (data: BackupData, name: BackupTable): AnyRecord[] =>
  (
    (data as unknown as Record<string, AnyRecord[] | undefined>)[name] ?? []
  ).filter((r) => r && typeof r.id === "string");

/** Tüm tabloları tek bir JSON-serileştirilebilir nesnede toplar. */
export async function exportBackup(): Promise<BackupPayload> {
  const data = {} as Record<BackupTable, AnyRecord[]>;
  await Promise.all(
    BACKUP_TABLES.map(async (name) => {
      data[name] = await tableOf(name).toArray();
    })
  );
  return {
    app: "routine",
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: data as unknown as BackupData,
  };
}

/** Yedek dosyasının adı — tarihi içerir, sıralanınca kronolojik durur. */
export function backupFileName(exportedAt: number): string {
  const d = new Date(exportedAt);
  const p = (n: number) => String(n).padStart(2, "0");
  return `routine-yedek-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export function backupToBlob(payload: BackupPayload): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

/** Tarayıcıya routine-yedek-YYYY-MM-DD.json olarak indirtir. */
export function downloadBackup(payload: BackupPayload): void {
  const url = URL.createObjectURL(backupToBlob(payload));
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName(payload.exportedAt);
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
  if (typeof p.version === "number" && p.version > BACKUP_VERSION) {
    throw new Error(
      "Bu yedek uygulamanın daha yeni bir sürümünden. Önce uygulamayı güncelle."
    );
  }
  return p as BackupPayload;
}

/** Yedekteki kayıtların tablo tablo sayımı — kullanıcıya "ne geliyor" diye göstermek için. */
export function summarizeBackup(payload: BackupPayload): {
  total: number;
  counts: Record<BackupTable, number>;
} {
  const counts = {} as Record<BackupTable, number>;
  let total = 0;
  for (const name of BACKUP_TABLES) {
    const n = rowsOf(payload.data, name).length;
    counts[name] = n;
    total += n;
  }
  return { total, counts };
}

/**
 * Yedeği cihaza yazar.
 *
 * mode = "replace": mevcut TÜM veri silinir, yerine yedek konur. Geri alınamaz —
 * çağıran taraf kullanıcıdan onay almalı.
 *
 * mode = "merge": yedek mevcut verinin üzerine eklenir. Aynı id'li kayıtta
 * zaman damgası yeni olan kazanır; cihazdaki sürüm daha yeniyse dokunulmaz.
 * Cihazda olup yedekte olmayan kayıtlar silinmez.
 */
export async function restoreBackup(
  payload: BackupPayload,
  mode: RestoreMode = "replace"
): Promise<RestoreResult> {
  const { data } = payload;
  const tables = BACKUP_TABLES.map(tableOf);
  let written = 0;
  let skipped = 0;

  // Damgalama kapalı: kayıtlar yedekteki zaman damgalarıyla girmeli
  await db.withoutStamping(() =>
    db.transaction("rw", tables, async () => {
      if (mode === "replace") {
        await Promise.all(BACKUP_TABLES.map((name) => tableOf(name).clear()));
        for (const name of BACKUP_TABLES) {
          const rows = rowsOf(data, name);
          if (!rows.length) continue;
          await tableOf(name).bulkPut(rows);
          written += rows.length;
        }
        return;
      }

      for (const name of BACKUP_TABLES) {
        const rows = rowsOf(data, name);
        if (!rows.length) continue;
        const table = tableOf(name);
        const existing = await table.bulkGet(rows.map((r) => r.id));
        const toPut = rows.filter((row, i) => {
          const current = existing[i];
          if (!current) return true;
          // Eşitlikte yedek kazanır: aynı damgalı kayıtlar zaten aynı içeriktir
          if (stampOf(row) >= stampOf(current)) return true;
          skipped++;
          return false;
        });
        if (toPut.length) await table.bulkPut(toPut);
        written += toPut.length;
      }
    })
  );

  return { mode, written, skipped };
}
