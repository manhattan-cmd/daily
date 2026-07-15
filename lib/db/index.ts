import Dexie, { type Table } from "dexie";
import type {
  Activity,
  AnalysisWidget,
  Category,
  SubCategory,
  Field,
  Entry,
  EntryValue,
  EntryType,
  GlobalDimension,
  CategoryModifier,
  Mod,
  Goal,
} from "@/types";

export class RoutineDB extends Dexie {
  categories!: Table<Category, string>;
  subcategories!: Table<SubCategory, string>;
  fields!: Table<Field, string>;
  globalDimensions!: Table<GlobalDimension, string>;
  entries!: Table<Entry, string>;
  entryValues!: Table<EntryValue, string>;
  entryTypes!: Table<EntryType, string>;
  categoryModifiers!: Table<CategoryModifier, string>;
  mods!: Table<Mod, string>;
  goals!: Table<Goal, string>;
  activities!: Table<Activity, string>;
  analysisWidgets!: Table<AnalysisWidget, string>;

  constructor() {
    super("RoutineDB");
    this.version(1).stores({
      categories: "id, name, order, createdAt",
      subcategories: "id, categoryId, name, order, createdAt",
      fields: "id, subcategoryId, type, order, createdAt",
      globalDimensions: "id, name, type",
      entries: "id, subcategoryId, occurredAt, createdAt",
      entryValues: "id, entryId, fieldId",
    });
    this.version(2).stores({
      subcategories: "id, categoryId, parentId, name, order, createdAt",
    });
    this.version(3).stores({
      entries: "id, subcategoryId, occurredAt, createdAt, entryTypeId",
      entryTypes: "id, name, isBuiltIn, order, createdAt",
    });
    this.version(4).stores({
      entries: "id, subcategoryId, occurredAt, createdAt, title",
      entryValues: "id, entryId, fieldId, entryTypeId",
    });
    this.version(5).stores({
      categoryModifiers: "id, targetType, targetId, entryTypeId, createdAt",
    });
    this.version(6).stores({
      entries: "id, subcategoryId, occurredAt, createdAt, title, linkedGroupId",
    });
    this.version(7).stores({
      goals: "id, date, subcategoryId, createdAt",
    });
    // v8 — İsimli modlar: modlar hiyerarşinin atomu olur.
    // Mevcut modlara ölçü türünün adı verilir; mevcut değerler alt kategorinin
    // aynı ölçülü moduna bağlanır.
    this.version(8)
      .stores({
        categoryModifiers:
          "id, targetType, targetId, entryTypeId, createdAt, [targetType+targetId]",
        entryValues: "id, entryId, fieldId, entryTypeId, modId",
      })
      .upgrade(async (tx) => {
        const types = await tx.table<EntryType, string>("entryTypes").toArray();
        const typeName = new Map(types.map((t) => [t.id, t.name]));

        const mods = await tx
          .table<CategoryModifier, string>("categoryModifiers")
          .toArray();
        for (const mod of mods) {
          if (!mod.name) {
            await tx
              .table("categoryModifiers")
              .update(mod.id, { name: typeName.get(mod.entryTypeId) ?? "Mod" });
          }
        }

        // entryTypeId → alt kategorideki mod eşleşmesi (yoksa kategori seviyesinde ara)
        const subs = await tx.table<SubCategory, string>("subcategories").toArray();
        const subById = new Map(subs.map((s) => [s.id, s]));
        const entries = await tx.table<Entry, string>("entries").toArray();
        const entryById = new Map(entries.map((e) => [e.id, e]));
        const modLookup = new Map<string, string>();
        for (const mod of mods) {
          modLookup.set(`${mod.targetType}:${mod.targetId}:${mod.entryTypeId}`, mod.id);
        }

        const values = await tx.table<EntryValue, string>("entryValues").toArray();
        for (const v of values) {
          if (v.modId || !v.entryTypeId) continue;
          const entry = entryById.get(v.entryId);
          if (!entry) continue;
          const sub = subById.get(entry.subcategoryId);
          if (!sub) continue;
          const modId =
            modLookup.get(`subcategory:${sub.id}:${v.entryTypeId}`) ??
            modLookup.get(`category:${sub.categoryId}:${v.entryTypeId}`);
          if (modId) await tx.table("entryValues").update(v.id, { modId });
        }
      });
    // v9 — Global mod havuzu: mod artık kategoriye ait değil, adı tekil bir atomdur.
    // Kategorilere "atama" ile bağlanır (categoryModifiers.modId), değerler havuz
    // modunu işaret eder.
    this.version(9)
      .stores({
        mods: "id, name, entryTypeId, createdAt",
        categoryModifiers:
          "id, targetType, targetId, entryTypeId, modId, createdAt, [targetType+targetId]",
      })
      .upgrade(async (tx) => {
        const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
        const nid = () =>
          Math.random().toString(36).slice(2, 10) +
          Math.random().toString(36).slice(2, 6);
        const now = Date.now();

        const types = await tx.table<EntryType, string>("entryTypes").toArray();
        const typeById = new Map(types.map((t) => [t.id, t]));

        // 1) Her ölçü türünden 1:1 havuz modu (eski "listeden Mesafe seç" davranışını korur)
        const poolByName = new Map<string, Mod>();
        const modsTable = tx.table<Mod, string>("mods");
        for (const t of types) {
          const mod: Mod = {
            id: nid(),
            name: t.name,
            entryTypeId: t.id,
            isBuiltIn: t.isBuiltIn,
            createdAt: now,
          };
          await modsTable.add(mod);
          poolByName.set(norm(t.name), mod);
        }

        // 2) v8 isimli atamaları havuza tekilleştir; atamalara modId yaz
        const attachments = await tx
          .table<CategoryModifier, string>("categoryModifiers")
          .toArray();
        const oldAttachmentToMod = new Map<string, string>();
        for (const a of attachments) {
          const rawName =
            a.name ?? typeById.get(a.entryTypeId)?.name ?? "Mod";
          let mod = poolByName.get(norm(rawName));
          if (mod && mod.entryTypeId !== a.entryTypeId) {
            // Aynı ad farklı ölçüyle çakışıyor — ölçü adıyla ayrıştır
            const typeName = typeById.get(a.entryTypeId)?.name ?? "ölçü";
            const altName = `${rawName} (${typeName})`;
            mod = poolByName.get(norm(altName));
            if (!mod) {
              mod = {
                id: nid(),
                name: altName,
                entryTypeId: a.entryTypeId,
                createdAt: now,
              };
              await modsTable.add(mod);
              poolByName.set(norm(altName), mod);
            }
          } else if (!mod) {
            mod = {
              id: nid(),
              name: rawName.trim(),
              entryTypeId: a.entryTypeId,
              createdAt: now,
            };
            await modsTable.add(mod);
            poolByName.set(norm(rawName), mod);
          }
          oldAttachmentToMod.set(a.id, mod.id);
          await tx.table("categoryModifiers").update(a.id, { modId: mod.id });
        }

        // 3) Aynı hedefe aynı mod birden çok kez atanmışsa tekilleştir
        const seen = new Set<string>();
        for (const a of attachments) {
          const modId = oldAttachmentToMod.get(a.id)!;
          const key = `${a.targetType}:${a.targetId}:${modId}`;
          if (seen.has(key)) {
            await tx.table("categoryModifiers").delete(a.id);
          } else {
            seen.add(key);
          }
        }

        // 4) Değerlerin modId'lerini eski atamadan havuz moduna çevir;
        //    modsuz değerleri ölçüsünün havuz moduna bağla
        const values = await tx.table<EntryValue, string>("entryValues").toArray();
        for (const v of values) {
          let newModId: string | undefined;
          if (v.modId && oldAttachmentToMod.has(v.modId)) {
            newModId = oldAttachmentToMod.get(v.modId);
          } else if (!v.modId && v.entryTypeId) {
            const typeName = typeById.get(v.entryTypeId)?.name;
            if (typeName) newModId = poolByName.get(norm(typeName))?.id;
          }
          if (newModId && newModId !== v.modId) {
            await tx.table("entryValues").update(v.id, { modId: newModId });
          }
        }
      });
    // v10 — Aktiviteler: girdileri tek oturum altında toplayan konteyner.
    // entries'e activityId indeksi eklenir (veri dönüşümü gerekmez).
    this.version(10).stores({
      activities: "id, name, occurredAt, createdAt",
      entries:
        "id, subcategoryId, occurredAt, createdAt, title, linkedGroupId, activityId",
    });
    // v11 — Analiz widget'ları: kullanıcının analizde görmek istediği
    // (mod × yöntem) seçimleri, kategori/alt kategori başına.
    this.version(11).stores({
      analysisWidgets: "id, [targetType+targetId], modId, createdAt",
    });
  }
}

export const db = new RoutineDB();
