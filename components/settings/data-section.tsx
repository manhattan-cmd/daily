"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Download,
  Upload,
  ShieldAlert,
  CheckCircle2,
  GitMerge,
  Replace,
  Share2,
  HardDrive,
  X,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  exportBackup,
  downloadBackup,
  backupToBlob,
  backupFileName,
  parseBackupFile,
  restoreBackup,
  summarizeBackup,
  type BackupPayload,
  type RestoreMode,
} from "@/lib/db/backup";
import {
  agoLabel,
  daysSince,
  ensurePersistentStorage,
  formatBytes,
  markBackupTaken,
  useLastBackupAt,
  type StorageHealth,
} from "@/lib/storage-health";
import { Button } from "@/components/ui/button";

const fmt = (n: number) => n.toLocaleString("tr-TR");

export function DataSection() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);
  /** Dosya seçildi, kullanıcı nasıl yükleyeceğini seçiyor */
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastBackupAt = useLastBackupAt();

  useEffect(() => {
    let alive = true;
    ensurePersistentStorage().then((h) => {
      if (alive) setHealth(h);
    });
    return () => {
      alive = false;
    };
  }, []);

  const counts = useLiveQuery(async () => {
    const [categories, entries, notes, goals] = await Promise.all([
      db.categories.count(),
      db.entries.count(),
      db.notes.count(),
      db.goals.count(),
    ]);
    return { categories, entries, notes, goals };
  }, []);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      const payload = await exportBackup();
      downloadBackup(payload);
      markBackupTaken(payload.exportedAt);
      const { total } = summarizeBackup(payload);
      setMessage({ type: "ok", text: `Yedek indirildi — ${fmt(total)} kayıt.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Yedek alınamadı.",
      });
    } finally {
      setExporting(false);
    }
  }

  /**
   * Yedeği telefonun paylaş menüsüne verir — kullanıcı Drive'a, iCloud'a,
   * kendine WhatsApp'a gönderebilir. Sunucu tutmadan dayanıklılık kazanmanın
   * en ucuz yolu bu; mağaza sürümünde de aynı menü çıkar.
   */
  async function handleShare() {
    setExporting(true);
    setMessage(null);
    try {
      const payload = await exportBackup();
      const file = new File(
        [backupToBlob(payload)],
        backupFileName(payload.exportedAt),
        { type: "application/json" }
      );
      if (!navigator.canShare?.({ files: [file] })) {
        downloadBackup(payload);
        markBackupTaken(payload.exportedAt);
        setMessage({
          type: "ok",
          text: "Bu cihazda paylaşma desteklenmiyor — yedek indirildi.",
        });
        return;
      }
      await navigator.share({ files: [file], title: "Routine yedeği" });
      markBackupTaken(payload.exportedAt);
      setMessage({ type: "ok", text: "Yedek paylaşıldı." });
    } catch (err) {
      // Kullanıcı paylaş menüsünü kapattıysa hata sayma
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Yedek paylaşılamadı.",
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // aynı dosya tekrar seçilebilsin
    if (!file) return;

    setMessage(null);
    try {
      setPending(parseBackupFile(await file.text()));
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Dosya okunamadı.",
      });
    }
  }

  async function runRestore(mode: RestoreMode) {
    if (!pending) return;
    setImporting(true);
    setMessage(null);
    try {
      const result = await restoreBackup(pending, mode);
      setPending(null);
      setMessage({
        type: "ok",
        text:
          mode === "replace"
            ? `Yedek geri yüklendi — ${fmt(result.written)} kayıt.`
            : `Birleştirildi — ${fmt(result.written)} kayıt yazıldı` +
              (result.skipped
                ? `, ${fmt(result.skipped)} kayıt cihazdaki sürümü daha yeni olduğu için atlandı.`
                : "."),
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Geri yüklenemedi.",
      });
    } finally {
      setImporting(false);
    }
  }

  const summary = pending ? summarizeBackup(pending) : null;

  return (
    <>
      <div className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tüm verilerin (kategoriler, özellikler, girdiler, notlar, hedefler)
          yalnızca bu cihazda saklanıyor. Tarayıcı verisi silinirse ya da telefon
          değişirse geri dönüşü olmaz — düzenli yedek almanı öneririz.
        </p>

        {/* Depolama sağlığı — verinin cihazda ne kadar güvende durduğu */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Cihazdaki depolama</span>
                {health && (
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                      (health.persisted
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-400")
                    }
                  >
                    {health.persisted ? "kalıcı" : "kalıcı değil"}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {health
                  ? `${formatBytes(health.usage)} kullanılıyor${
                      health.quota ? ` · kota ${formatBytes(health.quota)}` : ""
                    }`
                  : "Ölçülüyor..."}
              </div>
            </div>
          </div>

          {health && !health.persisted && (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-400/90">
              Tarayıcı bu veriyi kalıcı saymıyor: yer daralırsa ya da uygulamayı
              uzun süre açmazsan silinebilir.{" "}
              {!health.standalone &&
                "Uygulamayı ana ekrana eklersen kalıcı olur. "}
              Yine de düzenli yedek al.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
            <span className="text-muted-foreground">Son yedek</span>
            <span
              className={
                lastBackupAt === null || daysSince(lastBackupAt) >= 14
                  ? "font-semibold text-amber-400"
                  : "font-medium"
              }
            >
              {lastBackupAt === null ? "hiç alınmadı" : agoLabel(lastBackupAt)}
            </span>
          </div>
        </div>

        {/* Dışa Aktar */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">Yedek İndir</div>
              <div className="text-xs text-muted-foreground">
                {counts
                  ? `${fmt(counts.categories)} kategori · ${fmt(counts.entries)} girdi · ${fmt(counts.notes)} not · ${fmt(counts.goals)} hedef`
                  : "Yükleniyor..."}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleShare}
              disabled={exporting}
            >
              <Share2 className="h-4 w-4" />
              {exporting ? "Hazırlanıyor..." : "Paylaş / Buluta at"}
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              aria-label="JSON olarak indir"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Paylaş menüsünden Drive, iCloud ya da kendine mesaj — yedek senin
            bulutunda durur, bizde bir kopyası olmaz.
          </p>
        </div>

        {/* İçe Aktar */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Upload className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">Yedekten Geri Yükle</div>
              <div className="text-xs text-muted-foreground">
                Dosyayı seç, sonra nasıl yükleneceğine karar ver
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            Dosya Seç
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Seçilen yedek — özet + nasıl yükleneceği. Tarayıcının confirm
            kutusu yerine sayfanın kendi paneli: ne geldiği tablo tablo görünür. */}
        {summary && pending && (
          <div className="animate-in rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">Yedek okundu</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(pending.exportedAt).toLocaleString("tr-TR", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}{" "}
                  · sürüm {pending.version}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPending(null)}
                aria-label="Vazgeç"
                disabled={importing}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {(
                [
                  ["Kategori", summary.counts.categories],
                  ["Alt kategori", summary.counts.subcategories],
                  ["Girdi", summary.counts.entries],
                  ["Değer", summary.counts.entryValues],
                  ["Not", summary.counts.notes],
                  ["Hedef", summary.counts.goals],
                  ["Özellik", summary.counts.mods],
                  ["Aktivite", summary.counts.activities],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{fmt(n)}</dd>
                </div>
              ))}
            </dl>

            {pending.version < 2 && (
              <p className="mb-3 text-[11px] leading-relaxed text-amber-400/90">
                Bu eski bir yedek (sürüm {pending.version}) — notlar o sürümde
                yedeklenmiyordu. Değiştirerek yüklersen cihazdaki notlar
                silinir.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => runRestore("merge")}
                disabled={importing}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60"
              >
                <GitMerge className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Birleştir{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (önerilen)
                    </span>
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    Yedek mevcut verinin üzerine eklenir. Aynı kaydın yeni olanı
                    kalır, cihazdaki fazladan kayıtlar silinmez.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => runRestore("replace")}
                disabled={importing}
                className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3 text-left transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                <Replace className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-destructive">
                    Değiştir
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    Cihazdaki TÜM veri silinip yerine bu yedek konur. Geri
                    alınamaz.
                  </span>
                </span>
              </button>
            </div>

            {importing && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Yükleniyor…
              </p>
            )}
          </div>
        )}

        {message && (
          <div
            className={
              "flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm " +
              (message.type === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive")
            }
          >
            {message.type === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}
      </div>
    </>
  );
}
