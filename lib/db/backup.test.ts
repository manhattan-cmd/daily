import { describe, expect, it } from "vitest";
import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  backupFileName,
  parseBackupFile,
  summarizeBackup,
  type BackupPayload,
} from "./backup";

const payload = (data: Partial<BackupPayload["data"]>): BackupPayload => ({
  app: "routine",
  version: BACKUP_VERSION,
  exportedAt: Date.parse("2026-07-15T10:00:00"),
  data: data as BackupPayload["data"],
});

describe("yedek biçimi", () => {
  it("notlar yedeğe DAHİL — v12'de eklenip yedeğe girmemişlerdi", () => {
    expect(BACKUP_TABLES).toContain("notes");
  });

  it("kullanıcı verisini taşıyan tabloların hepsi listede", () => {
    for (const t of [
      "categories",
      "subcategories",
      "entries",
      "entryValues",
      "goals",
      "activities",
      "notes",
      "mods",
      "entryTypes",
      "categoryModifiers",
      "fields",
      "globalDimensions",
    ]) {
      expect(BACKUP_TABLES, t).toContain(t);
    }
  });

  it("silme günlüğü yedeğe girmez — silinmiş kayıtların kopyası taşınmaz", () => {
    expect(BACKUP_TABLES).not.toContain("deletions");
  });
});

describe("parseBackupFile", () => {
  it("geçerli yedeği okur", () => {
    const p = parseBackupFile(JSON.stringify(payload({ notes: [] })));
    expect(p.app).toBe("routine");
  });

  it("JSON olmayan dosyayı reddeder", () => {
    expect(() => parseBackupFile("bu bir json değil")).toThrow();
  });

  it("başka uygulamanın dosyasını reddeder", () => {
    expect(() => parseBackupFile('{"app":"başka","data":{}}')).toThrow();
  });

  it("data alanı olmayan dosyayı reddeder", () => {
    expect(() => parseBackupFile('{"app":"routine"}')).toThrow();
  });

  it("daha yeni sürümü açıkça reddeder", () => {
    const future = JSON.stringify({
      app: "routine",
      version: BACKUP_VERSION + 1,
      exportedAt: 0,
      data: {},
    });
    expect(() => parseBackupFile(future)).toThrow(/güncelle|update/i);
  });

  it("eski sürümü kabul eder — geriye dönük okunabilirlik", () => {
    const old = JSON.stringify({
      app: "routine",
      version: 1,
      exportedAt: 0,
      data: { categories: [] },
    });
    expect(parseBackupFile(old).version).toBe(1);
  });
});

describe("summarizeBackup", () => {
  it("tablo tablo sayar ve toplamı verir", () => {
    const s = summarizeBackup(
      payload({
        categories: [{ id: "c1" }, { id: "c2" }],
        notes: [{ id: "n1" }],
      } as unknown as BackupPayload["data"])
    );
    expect(s.counts.categories).toBe(2);
    expect(s.counts.notes).toBe(1);
    expect(s.counts.entries).toBe(0);
    expect(s.total).toBe(3);
  });

  it("eksik tabloları sıfır sayar, patlamaz", () => {
    const s = summarizeBackup(payload({}));
    expect(s.total).toBe(0);
  });
});

describe("backupFileName", () => {
  it("YEREL günü kullanır — toISOString gününü kaydırıyordu", () => {
    // Yerel saatle 15 Temmuz 00:30; UTC'ye çevrilse 14 Temmuz olabilirdi
    const t = new Date(2026, 6, 15, 0, 30).getTime();
    expect(backupFileName(t)).toBe("routine-yedek-2026-07-15.json");
  });
});
