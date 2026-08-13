import { describe, expect, it } from "vitest";
import {
  USAGE_WINDOW_DAYS,
  usageIntensity,
  usageLevel,
  usageRate,
  usageSince,
} from "./usage";

describe("usageRate — ölçü sayı değil ritim", () => {
  it("girdi sayısını günlük orana çeviriyor", () => {
    expect(usageRate(30, 30)).toBe(1);
    expect(usageRate(15, 30)).toBe(0.5);
    expect(usageRate(0, 30)).toBe(0);
    expect(usageRate(-4, 30)).toBe(0);
  });

  it("PENCEREDEN BAĞIMSIZ: aynı ritim, aynı basamak", () => {
    // Sabit sayı eşikleri pencereye yapışıktı; pencere büyüyünce bütün
    // anlamlar kayıyordu. Aynı alışkanlık 30 günlük ve 90 günlük pencerede
    // aynı basamağı vermeli.
    for (const perDay of [0.02, 0.1, 0.3, 0.9, 2]) {
      const a = usageLevel(usageRate(perDay * 30, 30));
      const b = usageLevel(usageRate(perDay * 90, 90));
      expect(a).toBe(b);
    }
  });
});

describe("usageLevel", () => {
  it("hiç girdi yoksa sıfırıncı basamak", () => {
    expect(usageLevel(0)).toBe(0);
    expect(usageLevel(-1)).toBe(0);
  });

  it("eşikler gün cinsinden okunuyor", () => {
    expect(usageLevel(1 / 30)).toBe(1); // ayda bir
    expect(usageLevel(1 / 20)).toBe(1);
    expect(usageLevel(1 / 7)).toBe(2); // haftada bir
    expect(usageLevel(1 / 4)).toBe(2);
    expect(usageLevel(1 / 2)).toBe(3); // iki günde bir
    expect(usageLevel(0.99)).toBe(3);
    expect(usageLevel(1)).toBe(4); // günde bir ve üstü
    expect(usageLevel(5)).toBe(4);
  });
});

describe("usageIntensity", () => {
  it("seyrek dal da görünüyor, yoğun dal ekranı yakmıyor", () => {
    expect(usageIntensity(0)).toBe(0);
    // Ayda bir uğranan dal görünür bir tabana oturuyor
    expect(usageIntensity(1 / 30)).toBeGreaterThan(0.12);
    expect(usageIntensity(1 / 30)).toBeLessThan(0.25);
    // Günde bir yüksek ama tavan değil
    expect(usageIntensity(1)).toBeGreaterThan(0.7);
    expect(usageIntensity(1)).toBeLessThan(0.95);
    // Üstü doygunlaşıyor
    expect(usageIntensity(2)).toBe(1);
    expect(usageIntensity(20)).toBe(1);
  });

  it("artan ritim artan yoğunluk — kazanç azalarak", () => {
    // Aynı miktarda artışın kazancı yukarı çıktıkça azalıyor: seyrek dallar
    // arasındaki fark görünür kalıyor, yoğun dallar birbirine yaklaşıyor.
    const step = 0.1;
    let prev = usageIntensity(0);
    let prevGain = Infinity;
    for (let r = step; r <= 1.5; r += step) {
      const cur = usageIntensity(r);
      const gain = cur - prev;
      expect(cur).toBeGreaterThanOrEqual(prev);
      expect(gain).toBeLessThanOrEqual(prevGain + 1e-9);
      prev = cur;
      prevGain = gain;
    }
  });
});

describe("usageSince", () => {
  it("pencere tam otuz gün geriye gidiyor", () => {
    const now = Date.UTC(2026, 7, 31);
    expect((now - usageSince(now)) / (24 * 60 * 60 * 1000)).toBe(
      USAGE_WINDOW_DAYS
    );
  });
});
