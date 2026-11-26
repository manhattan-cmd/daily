import { describe, expect, it } from "vitest";
import { filterEntriesByTag, inheritedTags, nextTagColor, subsWithTag, TAG_COLORS } from "./tags";
import { reconcileBackup } from "./db/backup-merge";
import type { BackupData } from "./db/backup";

/**
 * Senaryo: Harcamalar › Faturalar › Elektrik, Harcamalar › Market ve
 * Spor › Salon üyeliği. "Sabit ödemeler" Faturalar'a ve Salon üyeliğine
 * takılı; "Sağlık" Spor kategorisinin kendisine.
 */
const cats = [
  { id: "c-harcama", name: "Harcamalar" },
  { id: "c-spor", name: "Spor", tagIds: ["t-saglik"] },
];
const subs = [
  { id: "s-fatura", categoryId: "c-harcama", name: "Faturalar", tagIds: ["t-sabit"] },
  { id: "s-elektrik", categoryId: "c-harcama", parentId: "s-fatura", name: "Elektrik" },
  { id: "s-market", categoryId: "c-harcama", name: "Market" },
  { id: "s-salon", categoryId: "c-spor", name: "Salon üyeliği", tagIds: ["t-sabit"] },
  { id: "s-kosu", categoryId: "c-spor", name: "Koşu" },
];
const entries = [
  { id: "e1", subcategoryId: "s-elektrik" },
  { id: "e2", subcategoryId: "s-market" },
  { id: "e3", subcategoryId: "s-salon" },
  { id: "e4", subcategoryId: "s-kosu" },
  { id: "e5", subcategoryId: "s-fatura" },
];

describe("etiket mirası", () => {
  it("alt kategoriye takılan alt ağacına, kategoriye takılan bütün kalemlerine iner", () => {
    expect([...subsWithTag("t-sabit", cats, subs)].sort()).toEqual(["s-elektrik", "s-fatura", "s-salon"]);
    expect([...subsWithTag("t-saglik", cats, subs)].sort()).toEqual(["s-kosu", "s-salon"]);
    expect(subsWithTag("t-yok", cats, subs).size).toBe(0);
  });

  it("formda üstünden gelenler en yakın sahibinin adıyla", () => {
    const subById = new Map(subs.map((s) => [s.id, s]));
    const catById = new Map(cats.map((c) => [c.id, c]));
    // Elektrik'in altına yeni kalem: Faturalar'dan Sabit ödemeler
    expect(inheritedTags("c-harcama", "s-elektrik", subById, catById)).toEqual([{ id: "t-sabit", from: "Faturalar" }]);
    // Salon üyeliğinin altına: kategoriden Sağlık + Salon'dan Sabit
    expect(inheritedTags("c-spor", "s-salon", subById, catById)).toEqual([
      { id: "t-sabit", from: "Salon üyeliği" },
      { id: "t-saglik", from: "Spor" },
    ]);
    // Kategorinin kökü
    expect(inheritedTags("c-harcama", undefined, subById, catById)).toEqual([]);
  });
});

describe("analizin etiket süzgeci", () => {
  const tagged = subsWithTag("t-sabit", cats, subs);
  it("yalnız: farklı kategorilerdeki etiketli kalemler birlikte", () => {
    expect(filterEntriesByTag(entries, { tagId: "t-sabit", mode: "only" }, tagged).map((e) => e.id)).toEqual(["e1", "e3", "e5"]);
  });
  it("hariç: eski Sabitler hariç anahtarı gibi", () => {
    expect(filterEntriesByTag(entries, { tagId: "t-sabit", mode: "exclude" }, tagged).map((e) => e.id)).toEqual(["e2", "e4"]);
  });
  it("süzgeç yoksa dokunmaz", () => {
    expect(filterEntriesByTag(entries, null, null)).toBe(entries);
  });
});

describe("etiket rengi", () => {
  it("en az kullanılan renk, eşitlikte sıradaki", () => {
    expect(nextTagColor([])).toBe(TAG_COLORS[0]);
    expect(nextTagColor([{ color: TAG_COLORS[0] }])).toBe(TAG_COLORS[1]);
    const all = TAG_COLORS.map((color) => ({ color }));
    expect(nextTagColor([...all, { color: TAG_COLORS[0] }])).toBe(TAG_COLORS[1]);
  });
});

describe("yedek birleştirmede etiketler", () => {
  it("başka cihazın aynı adlı etiketi buradakine bağlanır, kalemlerin tagIds'i çevrilir", () => {
    const t = 1;
    const data = {
      categories: [{ id: "X1", name: "Harcamalar", color: "#fff", order: 1, createdAt: t, updatedAt: t }],
      subcategories: [
        { id: "Y1", categoryId: "X1", name: "Faturalar", order: 1, createdAt: t, updatedAt: t, tagIds: ["T1", "T2"] },
      ],
      tags: [
        { id: "T1", name: "sabit ödemeler ", color: "#ffd23f", order: 1, createdAt: t, updatedAt: t },
        { id: "T2", name: "Yeni etiket", color: "#7dd3fc", order: 2, createdAt: t, updatedAt: t },
      ],
      fields: [],
      globalDimensions: [],
      entryTypes: [],
      categoryModifiers: [],
      mods: [],
      entries: [],
      entryValues: [],
      goals: [],
    } as BackupData;
    const { data: out } = reconcileBackup(data, {
      categories: [{ id: "c-harcama", name: "Harcamalar" }],
      subcategories: [{ id: "s-fatura", categoryId: "c-harcama", name: "Faturalar" }],
      mods: [],
      entryTypes: [],
      globalDimensions: [],
      categoryModifiers: [],
      tags: [{ id: "t-sabit", name: "Sabit ödemeler" }],
    });
    expect(out.tags!.map((x) => x.id)).toEqual(["t-sabit", "T2"]);
    expect(out.subcategories[0]).toMatchObject({ id: "s-fatura", tagIds: ["t-sabit", "T2"] });
  });
});
