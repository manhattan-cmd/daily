import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./search";

const q = (s: string) => normalizeSearch(s.trim());

describe("normalizeSearch", () => {
  it("büyük harfi küçültür", () => {
    expect(normalizeSearch("Kahve")).toBe("kahve");
  });

  it("Türkçe İ'yi birleşik nokta bırakmadan i yapar", () => {
    // Ham toLowerCase burada "i" + U+0307 üretir; kullanıcı onu yazamaz
    expect(normalizeSearch("İstanbul")).toBe("istanbul");
    expect(normalizeSearch("İstanbul")).not.toContain("\u0307");
  });

  it("noktasız ı'yı i'ye eşler", () => {
    expect(normalizeSearch("Işık")).toBe("isik");
  });

  it("şapkalı harfleri sadeleştirir", () => {
    expect(normalizeSearch("Öğle Çayı")).toBe("ogle cayi");
    expect(normalizeSearch("café")).toBe("cafe");
  });

  it("dil değişse de aynı sonucu verir", () => {
    // toLocaleLowerCase varsayılan dile bırakılsaydı "I" Türkçede "ı" olurdu
    expect(normalizeSearch("IST")).toBe("ist");
  });
});

describe("matchesSearch", () => {
  it("boş sorgu her şeyle eşleşir", () => {
    expect(matchesSearch("herhangi bir metin", "")).toBe(true);
  });

  it("parça eşleşmesi yapar", () => {
    expect(matchesSearch("Sabah kahvesi", q("kahve"))).toBe(true);
    expect(matchesSearch("Sabah kahvesi", q("çay"))).toBe(false);
  });

  it("aksansız yazılan sorgu aksanlı metni bulur", () => {
    expect(matchesSearch("Öğle yemeği", q("ogle"))).toBe(true);
    expect(matchesSearch("Işıklar kapandı", q("isik"))).toBe(true);
    expect(matchesSearch("İzmir gezisi", q("izmir"))).toBe(true);
  });

  it("aksanlı yazılan sorgu da bulur", () => {
    expect(matchesSearch("Ogle yemegi", q("öğle"))).toBe(true);
  });

  it("sorgunun başındaki boşluk elenmiş sayılır", () => {
    expect(matchesSearch("Kahve", q("  kahve  "))).toBe(true);
  });
});
