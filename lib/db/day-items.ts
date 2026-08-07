import {
  deleteEntries,
  deleteGoals,
  deleteNotes,
  moveEntriesToDate,
  moveGoalsToDate,
  moveNotesToDate,
} from "./queries";
import { newBatchId } from "./deletions";

/**
 * Gün sayfasındaki öğe türleri tek yerden.
 *
 * Bunlar ayrı tablolarda yaşıyor (girdi, hedef, not) ama gün sayfasında aynı
 * muameleyi görüyorlar: seçilir, başka güne taşınır, birlikte silinir.
 * Eskiden her tür bu davranışların HER BİRİNDE elle yazılıydı — seçim anahtarı,
 * id ayıklama, taşıma çağrısı, silme çağrısı, "tümünü seç" listesi. Yeni bir
 * tür eklemek on ayrı yeri hatırlamak demekti.
 *
 * Artık tür burada tanımlanır, gün sayfası ve toplu işlemler bu kayıttan
 * okur. Yeni bir tür eklemek: DAY_ITEM_TYPES'a bir satır + kartını çizmek.
 */

export type DayItemKind = "entry" | "goal" | "note";

export interface DayItemType {
  kind: DayItemKind;
  /** Seçili id'leri başka bir güne taşır */
  move: (ids: string[], date: string) => Promise<void>;
  /** Seçili id'leri siler; aynı batchId ile çağrılırsa tek "Geri al" grubu olur */
  remove: (ids: string[], batchId: string) => Promise<unknown>;
}

export const DAY_ITEM_TYPES: readonly DayItemType[] = [
  { kind: "entry", move: moveEntriesToDate, remove: deleteEntries },
  { kind: "goal", move: moveGoalsToDate, remove: deleteGoals },
  { kind: "note", move: moveNotesToDate, remove: deleteNotes },
] as const;

export const DAY_ITEM_KINDS = DAY_ITEM_TYPES.map((t) => t.kind);

/** Seçim anahtarı — türler ayrı tablolarda olduğu için id'ler tek başına yetmez */
export const dayItemKey = (kind: DayItemKind, id: string) => `${kind}:${id}`;

/** Seçim kümesinden bir türün id'lerini ayıklar */
export function idsOfKind(
  selection: Iterable<string>,
  kind: DayItemKind
): string[] {
  const prefix = `${kind}:`;
  return [...selection]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

/** Seçim kümesini türlere böler */
export function splitSelection(
  selection: Iterable<string>
): Record<DayItemKind, string[]> {
  const keys = [...selection];
  return Object.fromEntries(
    DAY_ITEM_KINDS.map((k) => [k, idsOfKind(keys, k)])
  ) as Record<DayItemKind, string[]>;
}

/** Seçili gün öğelerini başka bir güne taşır */
export async function moveDayItems(
  selection: Iterable<string>,
  date: string
): Promise<void> {
  const split = splitSelection(selection);
  for (const type of DAY_ITEM_TYPES) {
    const ids = split[type.kind];
    if (ids.length) await type.move(ids, date);
  }
}

/**
 * Seçili gün öğelerini siler. Hepsi TEK grupta silinir ki "Geri al" üçünü
 * birden döndürsün.
 */
export async function deleteDayItems(
  selection: Iterable<string>
): Promise<string> {
  const split = splitSelection(selection);
  const batchId = newBatchId();
  for (const type of DAY_ITEM_TYPES) {
    const ids = split[type.kind];
    if (ids.length) await type.remove(ids, batchId);
  }
  return batchId;
}
