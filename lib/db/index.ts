import Dexie, { type Table } from "dexie";
import type {
  Activity,
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
  Note,
  Deletion,
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
  notes!: Table<Note, string>;
  deletions!: Table<Deletion, string>;

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
              .update(mod.id, { name: typeName.get(mod.entryTypeId!) ?? "Mod" });
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
        const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
        const nid = () =>
          Math.random().toString(36).slice(2, 10) +
          Math.random().toString(36).slice(2, 6);
        const now = Date.now();

        const types = await tx.table<EntryType, string>("entryTypes").toArray();
        const typeById = new Map(types.map((t) => [t.id, t]));

        // 1) Her ölçü türünden 1:1 havuz modu (eski "listeden Mesafe seç" davranışını korur)
        // valueType burada yer tutucu: bu sürümde ölçüm entryTypeId'den okunuyor,
        // modun kendi üzerine v18 göçünde kopyalanacak.
        const poolByName = new Map<string, Mod>();
        const modsTable = tx.table<Mod, string>("mods");
        for (const t of types) {
          const mod: Mod = {
            id: nid(),
            name: t.name,
            valueType: "number",
            entryTypeId: t.id,
            isBuiltIn: t.isBuiltIn,
            createdAt: now,
            updatedAt: now,
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
            a.name ?? typeById.get(a.entryTypeId!)?.name ?? "Mod";
          let mod = poolByName.get(norm(rawName));
          if (mod && mod.entryTypeId !== a.entryTypeId!) {
            // Aynı ad farklı ölçüyle çakışıyor — ölçü adıyla ayrıştır
            const typeName = typeById.get(a.entryTypeId!)?.name ?? "ölçü";
            const altName = `${rawName} (${typeName})`;
            mod = poolByName.get(norm(altName));
            if (!mod) {
              mod = {
                id: nid(),
                name: altName,
                valueType: "number",
                entryTypeId: a.entryTypeId,
                createdAt: now,
                updatedAt: now,
              };
              await modsTable.add(mod);
              poolByName.set(norm(altName), mod);
            }
          } else if (!mod) {
            mod = {
              id: nid(),
              name: rawName.trim(),
              valueType: "number",
              entryTypeId: a.entryTypeId,
              createdAt: now,
              updatedAt: now,
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
    // v11 — geri alınan "özel analizler" denemesinden kalan tablo. IndexedDB
    // sürüm numarası geri çekilemediğinden (v11'e yükselmiş DB'ler VersionError
    // almasın diye) şema satırı duruyor; tablo şu an kullanılmıyor.
    this.version(11).stores({
      analysisWidgets: "id, [targetType+targetId], modId, createdAt",
    });
    // v12 — Notlar: gün sayfasının serbest yazım katmanı. Not = başlık +
    // paragraf blokları (gömülü); etiketler paragraf düzeyinde, havuzu noteTags.
    this.version(12).stores({
      notes: "id, date, createdAt, updatedAt",
      noteTags: "id, name, order, createdAt",
    });
    // v13 — (geri alındı) Not için yapay zekâ bağlantıları + ayarlar denemesi.
    this.version(13).stores({
      noteConnections: "id, aId, bId, [aId+bId], updatedAt",
      settings: "key",
    });
    // v14 — Not yapay zekâ sistemi kaldırıldı; tablolar düşürülür.
    // (Kullanıcı sistemi beğenmedi; not sistemi yeniden düşünülecek.)
    this.version(14).stores({
      noteConnections: null,
      settings: null,
    });
    // v15 — Not etiket sistemi kaldırıldı (bağ sistemi onun yerini aldı);
    // noteTags tablosu düşürülür, bloklardaki tagIds alanları temizlenir.
    this.version(15)
      .stores({
        noteTags: null,
      })
      .upgrade(async (tx) => {
        const notes = await tx.table<Note, string>("notes").toArray();
        for (const n of notes) {
          if (!n.blocks.some((b) => "tagIds" in b)) continue;
          const blocks = n.blocks.map((b) => {
            const rest = { ...b } as Record<string, unknown>;
            delete rest.tagIds;
            return rest;
          });
          await tx.table("notes").update(n.id, { blocks });
        }
      });
    // v16 — Her kayıtta updatedAt. Bir kısım tabloda hiç yoktu (entryValues'ta
    // createdAt bile yok). "Hangi kayıt daha yeni" sorusunu cevaplayamayan bir
    // şema yedek birleştirmesini de ileride cihazlar arası senkronu da
    // imkânsız kılıyor. Alan her tabloda indeksleniyor ki "şu tarihten sonra
    // değişenler" ucuz bir sorgu olsun.
    this.version(16)
      .stores({
        categories: "id, name, order, createdAt, updatedAt",
        subcategories:
          "id, categoryId, parentId, name, order, createdAt, updatedAt",
        fields: "id, subcategoryId, type, order, createdAt, updatedAt",
        globalDimensions: "id, name, type, updatedAt",
        entries:
          "id, subcategoryId, occurredAt, createdAt, title, linkedGroupId, activityId, updatedAt",
        entryValues: "id, entryId, fieldId, entryTypeId, modId, updatedAt",
        entryTypes: "id, name, isBuiltIn, order, createdAt, updatedAt",
        categoryModifiers:
          "id, targetType, targetId, entryTypeId, modId, createdAt, [targetType+targetId], updatedAt",
        mods: "id, name, entryTypeId, createdAt, updatedAt",
        goals: "id, date, subcategoryId, createdAt, updatedAt",
        activities: "id, name, occurredAt, createdAt, updatedAt",
        notes: "id, date, createdAt, updatedAt",
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        const tables = [
          "categories",
          "subcategories",
          "fields",
          "globalDimensions",
          "entries",
          "entryValues",
          "entryTypes",
          "categoryModifiers",
          "mods",
          "goals",
          "activities",
          "notes",
        ];
        for (const name of tables) {
          await tx
            .table(name)
            .toCollection()
            .modify((r: { updatedAt?: number; createdAt?: number }) => {
              if (typeof r.updatedAt !== "number") {
                r.updatedAt = r.createdAt ?? now;
              }
            });
        }
      });
    // v17 — Silme günlüğü. Silinen kayıt tam kopyasıyla burada durur:
    // kullanıcı "Geri al" diyebilsin, ileride senkron da "bu kayıt silindi"
    // bilgisini taşıyabilsin (yoksa silinen kayıt diğer cihazdan geri gelir).
    this.version(17).stores({
      deletions: "id, batchId, table, recordId, deletedAt, updatedAt",
    });
    // v18 — Ölçü ayrı bir sistem olmaktan çıkar: nasıl ölçüldüğü (tür, birim,
    // seçenekler) özelliğin KENDİ üzerinde durur.
    //
    // Sebep kullanıcının kendi verisinden çıktı: 16 özelliğin 6'sının adı
    // ölçüsünün adının aynısıydı (Para→Para, Kalori→Kalori, Ağırlık→Ağırlık…)
    // — form, cevabı olmayan bir isim soruyordu. Paylaşılan ölçülerin de
    // analitik karşılığı yoktu; kategoriler arası toplama ölçüden değil,
    // özelliğin birden çok yere takılı olmasından geliyor.
    //
    // entryTypes tablosu ve entryTypeId alanları BİLEREK duruyor: bu sürüm
    // veri silmez, yalnızca ölçümü modun üzerine kopyalar. Beğenilmezse
    // dönüş yolu açık kalsın (kod geri alınır + yedek geri yüklenir).
    this.version(18)
      .stores({
        mods: "id, name, entryTypeId, valueType, createdAt, updatedAt",
      })
      .upgrade(async (tx) => {
        const types = await tx.table<EntryType, string>("entryTypes").toArray();
        const byId = new Map(types.map((t) => [t.id, t]));
        await tx
          .table("mods")
          .toCollection()
          .modify((m: Mod) => {
            const t = m.entryTypeId ? byId.get(m.entryTypeId) : undefined;
            m.valueType = t?.valueType ?? "number";
            if (t?.unit) m.unit = t.unit;
            if (t?.choices?.length) m.choices = t.choices;
          });

        // Hedefler de ölçü id'siyle anahtarlanmıştı. Artık anahtar özelliğin
        // kendisi; modId'si eksik olan eski hedeflere onu doldur, yoksa
        // düzenleme ekranı hedefi tanıyamaz ve boş açılır.
        const mods = await tx.table<Mod, string>("mods").toArray();
        const modByType = new Map(
          mods.filter((m) => m.entryTypeId).map((m) => [m.entryTypeId!, m.id])
        );
        await tx
          .table("goals")
          .toCollection()
          .modify((g: Goal) => {
            for (const target of g.targets) {
              if (target.modId || !target.entryTypeId) continue;
              const modId = modByType.get(target.entryTypeId);
              if (modId) target.modId = modId;
            }
          });
      });
    // v19 — "Yerleşik özellik" sınıfı kalktı. Uygulamayla gelen özellikler de
    // kullanıcının kendi yarattıkları gibi: adı değişir, ölçümü değişir,
    // silinir. İşaret temizlenir.
    //
    // Türkçe→İngilizce ad devri de buraya taşındı. Eskiden her açılışta
    // çalışıyordu; ad düzenlenebilir olunca kullanıcı "Money"yi "Para" yapsa
    // bir sonraki açılışta geri alınırdı. Göç tek sefer çalışır.
    this.version(19).upgrade(async (tx) => {
      const table = tx.table<Mod, string>("mods");
      const mods = await table.toArray();
      const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
      const taken = new Set(mods.map((m) => norm(m.name)));
      const renameOf = new Map(
        [
          ["Uyku Aralığı", "Sleep Duration"],
          ["Uyku Süresi", "Sleep Duration"],
          ["Uyku Kalitesi", "Sleep Quality"],
          ["Para", "Money"],
          ["Süre", "Duration"],
          ["Mesafe", "Distance"],
          ["Miktar", "Quantity"],
          ["Ağırlık", "Weight"],
          ["Kalori", "Calories"],
        ].map(([from, to]) => [norm(from), to])
      );

      for (const m of mods) {
        const to = renameOf.get(norm(m.name));
        // Hedef ad zaten kullanımdaysa dokunma — ad tekilliği bozulmasın
        const rename = to && !taken.has(norm(to)) ? to : undefined;
        if (rename) taken.add(norm(rename));
        await table.update(m.id, {
          isBuiltIn: undefined,
          ...(rename ? { name: rename } : {}),
        });
      }
    });

    this.stampTimestamps();
  }

  /**
   * updatedAt'i tek yerden damgalar — 25 ayrı yazma noktasının hepsinin bunu
   * elle yapmasını beklemek, er geç birinin unutulması demekti.
   *
   * Yaratmada: alan zaten doluysa dokunulmaz — yedek geri yüklemesi kendi
   * damgalarını korumalı, yoksa "hangisi yeni" bilgisi ithal anında yanardı.
   * Güncellemede: değişiklik seti updatedAt'i zaten taşıyorsa (yine geri
   * yükleme) korunur, taşımıyorsa şimdiki zaman yazılır.
   */
  private stampTimestamps(): void {
    for (const table of this.tables) {
      table.hook("creating", this.stampCreating);
      table.hook("updating", this.stampUpdating);
    }
  }

  private stampCreating = (_pk: unknown, obj: { updatedAt?: number }): void => {
    if (typeof obj.updatedAt !== "number") obj.updatedAt = Date.now();
  };

  private stampUpdating = (mods: object) =>
    "updatedAt" in mods ? undefined : { updatedAt: Date.now() };

  /**
   * Damgalama kapalıyken çalıştırır — toplu içe aktarma için.
   *
   * İki sebep: (1) yedekteki kayıtlar kendi zaman damgalarını taşır, üzerine
   * yazmak "hangisi yeni" bilgisini yok eder; (2) hook'lara abone olmak
   * Dexie'nin toplu yazma optimizasyonunu devre dışı bırakıyor — 12 bin
   * kayıtlık geri yükleme 9 sn'den saniyenin altına iniyor.
   */
  async withoutStamping<T>(fn: () => Promise<T>): Promise<T> {
    for (const table of this.tables) {
      table.hook("creating").unsubscribe(this.stampCreating);
      table.hook("updating").unsubscribe(this.stampUpdating);
    }
    try {
      return await fn();
    } finally {
      this.stampTimestamps();
    }
  }
}

export const db = new RoutineDB();
