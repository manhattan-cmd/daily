import { describe, expect, it } from "vitest";
import { reconcileBackup, type DeviceStructure } from "./backup-merge";
import type { BackupData } from "./backup";

/**
 * Senaryo: kullanıcı uygulamayı açtı (tohum kuruldu), sonra BAŞKA bir
 * kurulumda alınmış bir yedeği birleştiriyor. İki taraftaki yapı aynı şeyi
 * anlatıyor ama kimlikleri bambaşka.
 */

const t = 1000;

const device: DeviceStructure = {
  categories: [
    { id: "c-harcama", name: "Harcamalar" },
    { id: "c-beslenme", name: "Beslenme" },
    { id: "c-uyku", name: "Sleep", builtInKey: "sleep" },
  ],
  subcategories: [
    { id: "s-faturalar", categoryId: "c-harcama", name: "Faturalar" },
    {
      id: "s-fatura-su",
      categoryId: "c-harcama",
      parentId: "s-faturalar",
      name: "Su",
    },
    { id: "s-icme-su", categoryId: "c-beslenme", name: "Su" },
    { id: "s-kok", categoryId: "c-harcama", name: "Harcamalar", isCategoryRoot: true },
  ],
  mods: [
    { id: "m-para", name: "Para" },
    { id: "m-bardak", name: "Bardak" },
  ],
  entryTypes: [],
  globalDimensions: [],
  categoryModifiers: [
    { id: "a-1", targetType: "category", targetId: "c-harcama", modId: "m-para" },
  ],
};

/** Aynı yapı, başka kimliklerle — "öteki kurulumun" yedeği */
const backup = (): BackupData =>
  ({
    categories: [
      { id: "X1", name: "Harcamalar", color: "#fff", order: 1, createdAt: t, updatedAt: t },
      { id: "X2", name: "Beslenme", color: "#fff", order: 2, createdAt: t, updatedAt: t },
      // Yerleşik akış ÖTEKİ kurulumda Türkçe adlandırılmış
      {
        id: "X3",
        name: "Uyku",
        color: "#fff",
        order: 3,
        isBuiltIn: true,
        builtInKey: "sleep",
        createdAt: t,
        updatedAt: t,
      },
    ],
    subcategories: [
      { id: "Y1", categoryId: "X1", name: "Faturalar", order: 1, createdAt: t, updatedAt: t },
      { id: "Y2", categoryId: "X1", parentId: "Y1", name: "Su", order: 1, createdAt: t, updatedAt: t },
      { id: "Y3", categoryId: "X2", name: "Su", order: 1, createdAt: t, updatedAt: t },
      { id: "Y4", categoryId: "X2", name: "Kefir", order: 2, createdAt: t, updatedAt: t },
    ],
    mods: [
      { id: "Z1", name: "Para", valueType: "number", createdAt: t, updatedAt: t },
      { id: "Z2", name: "Kalori", valueType: "number", createdAt: t, updatedAt: t },
    ],
    entryTypes: [],
    globalDimensions: [],
    fields: [],
    categoryModifiers: [
      { id: "A1", targetType: "category", targetId: "X1", modId: "Z1", order: 1, createdAt: t, updatedAt: t },
      { id: "A2", targetType: "subcategory", targetId: "Y4", modId: "Z2", order: 1, createdAt: t, updatedAt: t },
    ],
    entries: [
      { id: "E1", subcategoryId: "Y2", occurredAt: t, createdAt: t, updatedAt: t },
      { id: "E2", subcategoryId: "Y3", occurredAt: t, createdAt: t, updatedAt: t },
      { id: "E3", subcategoryId: "Y4", occurredAt: t, createdAt: t, updatedAt: t },
    ],
    entryValues: [
      { id: "V1", entryId: "E1", modId: "Z1", value: "120", updatedAt: t },
      { id: "V2", entryId: "E3", modId: "Z2", value: "80", updatedAt: t },
    ],
    goals: [
      {
        id: "G1",
        date: "2026-09-01",
        subcategoryId: "Y3",
        targets: [{ modId: "Z1", targetValue: "5" }],
        createdAt: t,
        updatedAt: t,
      },
    ],
    activities: [],
    notes: [],
  }) as unknown as BackupData;

describe("reconcileBackup — yapı ada göre eşlenir", () => {
  const { data, matched } = reconcileBackup(backup(), device);

  it("aynı adlı kategori cihazdakine bağlanır, ikinci kopya oluşmaz", () => {
    expect(data.categories.map((c) => c.id)).toContain("c-harcama");
    expect(data.categories.map((c) => c.id)).toContain("c-beslenme");
  });

  it("yerleşik akış ADINDAN bağımsız eşleşir — 'Uyku' ile 'Sleep' aynı şey", () => {
    const uyku = data.categories.find((c) => c.builtInKey === "sleep");
    expect(uyku?.id).toBe("c-uyku");
  });

  it("aynı ad iki ayrı yerdeyse doğru olanla eşleşir", () => {
    const faturaSu = data.subcategories.find((s) => s.parentId);
    expect(faturaSu?.id).toBe("s-fatura-su"); // Harcamalar › Faturalar › Su
    const icmeSu = data.subcategories.find(
      (s) => s.categoryId === "c-beslenme" && s.name === "Su"
    );
    expect(icmeSu?.id).toBe("s-icme-su"); // Beslenme › Su
  });

  it("cihazda olmayan kalem yeni gelir, kimliği korunur", () => {
    const kefir = data.subcategories.find((s) => s.name === "Kefir");
    expect(kefir?.id).toBe("Y4");
    expect(kefir?.categoryId).toBe("c-beslenme"); // üstü yine de eşleşmiş kategoriye bağlanır
  });

  it("özellik havuzu ada göre eşleşir; yeni özellik kimliğini korur", () => {
    expect(data.mods.find((m) => m.name === "Para")?.id).toBe("m-para");
    expect(data.mods.find((m) => m.name === "Kalori")?.id).toBe("Z2");
  });

  it("girdiler cihazdaki kaleme takılır", () => {
    expect(data.entries.map((e) => e.subcategoryId)).toEqual([
      "s-fatura-su",
      "s-icme-su",
      "Y4",
    ]);
  });

  it("girdiler ada göre EŞLENMEZ — kimlikleri ve sayıları aynı kalır", () => {
    expect(data.entries.map((e) => e.id)).toEqual(["E1", "E2", "E3"]);
  });

  it("değerler ve hedefler cihazdaki özelliği gösterir", () => {
    expect(data.entryValues.find((v) => v.id === "V1")?.modId).toBe("m-para");
    expect(data.entryValues.find((v) => v.id === "V2")?.modId).toBe("Z2");
    expect(data.goals[0].targets[0].modId).toBe("m-para");
    expect(data.goals[0].subcategoryId).toBe("s-icme-su");
  });

  it("aynı (hedef + özellik) ataması tek kayda iner", () => {
    const att = data.categoryModifiers.find((a) => a.targetId === "c-harcama");
    expect(att?.id).toBe("a-1");
  });

  it("kaç yapı kaydının kopyalanmaktan kurtulduğunu bildirir", () => {
    // 2 kategori + 1 yerleşik + 3 kalem (Faturalar, iki Su) + 1 özellik + 1 atama
    expect(matched).toBe(8);
  });
});

describe("reconcileBackup — kendi cihazının yedeği", () => {
  it("kimlikler zaten tuttuğunda hiçbir şey değişmez", () => {
    const own = {
      categories: [
        { id: "c-harcama", name: "Harcamalar", color: "#fff", order: 1, createdAt: t, updatedAt: t },
      ],
      subcategories: [],
      mods: [],
      entryTypes: [],
      globalDimensions: [],
      fields: [],
      categoryModifiers: [],
      entries: [],
      entryValues: [],
      goals: [],
      activities: [],
      notes: [],
    } as unknown as BackupData;
    const { data, matched } = reconcileBackup(own, device);
    expect(data.categories[0].id).toBe("c-harcama");
    expect(matched).toBe(0);
  });
});

describe("reconcileBackup — boş cihaz", () => {
  it("yapı yoksa yedek olduğu gibi kalır", () => {
    const empty: DeviceStructure = {
      categories: [],
      subcategories: [],
      mods: [],
      entryTypes: [],
      globalDimensions: [],
      categoryModifiers: [],
    };
    const { data, matched } = reconcileBackup(backup(), empty);
    expect(matched).toBe(0);
    expect(data.categories.map((c) => c.id)).toEqual(["X1", "X2", "X3"]);
    expect(data.entries.map((e) => e.subcategoryId)).toEqual(["Y2", "Y3", "Y4"]);
  });
});
