"use client";

import { useT } from "@/lib/i18n";
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

const fmt = (n: number) => n.toLocaleString("en-US");

export function DataSection() {
  const t = useT();
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
      setMessage({ type: "ok", text: `Backup downloaded — ${fmt(total)} records.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not create the backup.",
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
          text: "Sharing isn't supported on this device — the backup was downloaded.",
        });
        return;
      }
      await navigator.share({ files: [file], title: "Routine backup" });
      markBackupTaken(payload.exportedAt);
      setMessage({ type: "ok", text: "Backup shared." });
    } catch (err) {
      // Kullanıcı paylaş menüsünü kapattıysa hata sayma
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not share the backup.",
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
        text: err instanceof Error ? err.message : "Could not read the file.",
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
            ? `Backup restored — ${fmt(result.written)} records.`
            : `Merged — ${fmt(result.written)} records written` +
              (result.skipped
                ? `, ${fmt(result.skipped)} skipped because this device had a newer version.`
                : "."),
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not restore.",
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
          All of your data (categories, features, entries, notes, goals) is stored on this device only. If browser data is cleared or you switch phones, there is no way back — take backups regularly.
        </p>

        {/* Depolama sağlığı — verinin cihazda ne kadar güvende durduğu */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t("backup.deviceStorage")}</span>
                {health && (
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                      (health.persisted
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-400")
                    }
                  >
                    {health.persisted ? "persistent" : "not persistent"}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {health
                  ? `${formatBytes(health.usage)} used${
                      health.quota ? ` · quota ${formatBytes(health.quota)}` : ""
                    }`
                  : "Measuring..."}
              </div>
            </div>
          </div>

          {health && !health.persisted && (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-400/90">
              The browser doesn&rsquo;t treat this data as persistent: it can be evicted if space runs low or you don&rsquo;t open the app for a while.{" "}
              {!health.standalone &&
                "Add the app to your home screen to make it persistent. "}
              Take regular backups anyway.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
            <span className="text-muted-foreground">{t("backup.lastBackup")}</span>
            <span
              className={
                lastBackupAt === null || daysSince(lastBackupAt) >= 14
                  ? "font-semibold text-amber-400"
                  : "font-medium"
              }
            >
              {lastBackupAt === null ? "never" : agoLabel(lastBackupAt)}
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
              <div className="font-medium">{t("backup.download")}</div>
              <div className="text-xs text-muted-foreground">
                {counts
                  ? `${fmt(counts.categories)} categories · ${fmt(counts.entries)} entries · ${fmt(counts.notes)} notes · ${fmt(counts.goals)} goals`
                  : "Loading..."}
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
              {exporting ? "Preparing..." : "Share / send to cloud"}
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              aria-label={t("backup.downloadJson")}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Use the share sheet for Drive, iCloud or a message to yourself — the
            backup lives in your cloud, we keep no copy.
          </p>
        </div>

        {/* İçe Aktar */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Upload className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t("backup.restore")}</div>
              <div className="text-xs text-muted-foreground">
                Pick a file, then choose how to load it
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            Choose file
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
                <div className="font-medium">{t("backup.loaded")}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(pending.exportedAt).toLocaleString("en-US", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}{" "}
                  · version {pending.version}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPending(null)}
                aria-label="Cancel"
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
                  ["Value", summary.counts.entryValues],
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
                This is an older backup (version {pending.version}) — notes weren&rsquo;t included back then. Replacing will delete the notes on this device.
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
                    Merge{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (recommended)
                    </span>
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    The backup is added on top of your data. The newer version of each record wins; extra records on this device are kept.
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
                    Replace
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    ALL data on this device is deleted and replaced by this backup. Cannot be undone.
                  </span>
                </span>
              </button>
            </div>

            {importing && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Loading…
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
