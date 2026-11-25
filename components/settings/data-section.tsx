"use client";

import { intlTag, useT } from "@/lib/i18n";
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
import { isNative, shareFileNative } from "@/lib/native";
import { APP_NAME } from "@/lib/brand";
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
import { useSkin, isBlockSkin } from "@/lib/skin";
import { SettingsBlock, SettingsCell, settingsButton } from "./settings-block";
import { blockFill, fillStyle } from "@/lib/fill";

const fmt = (n: number) => n.toLocaleString(intlTag());

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
  const brutal = isBlockSkin(useSkin());

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
      // Mobil uygulamada indirme yok — paylaşım menüsünden kaydedilir
      if (isNative()) {
        const r = await shareFileNative(
          backupFileName(payload.exportedAt),
          JSON.stringify(payload, null, 2),
          `${APP_NAME} backup`
        );
        if (r === "cancelled") return;
      } else {
        downloadBackup(payload);
      }
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
      if (isNative()) {
        const r = await shareFileNative(
          backupFileName(payload.exportedAt),
          JSON.stringify(payload, null, 2),
          `${APP_NAME} backup`
        );
        if (r === "cancelled") return;
        markBackupTaken(payload.exportedAt);
        setMessage({ type: "ok", text: "Backup shared." });
        return;
      }
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
      await navigator.share({ files: [file], title: `${APP_NAME} backup` });
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
            ? t("backup.replaceDone", { n: fmt(result.written) })
            : t("backup.mergeDone", { n: fmt(result.written) }) +
              (result.matched
                ? " " + t("backup.mergeMatched", { n: fmt(result.matched) })
                : "") +
              (result.skipped
                ? " " + t("backup.mergeSkipped", { n: fmt(result.skipped) })
                : ""),
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

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      onChange={handleFileChange}
    />
  );
  const backupOld = lastBackupAt === null || daysSince(lastBackupAt) >= 14;

  // Brütal: tek blok — açıklama, cihazdaki depolama, yedek al, geri yükle
  // ve seçilen yedeğin paneli alt alta beyaz hücrelerde (bkz. SettingsBlock)
  if (brutal) {
    return (
      <SettingsBlock color="#ffb38a" icon={HardDrive} title={t("settings.dataSection")}>
        <SettingsCell className="text-[12.5px] font-bold leading-snug text-ink/65">{t("backup.intro")}</SettingsCell>

        {/* Depolama sağlığı — verinin cihazda ne kadar güvende durduğu */}
        <SettingsCell>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[14px] font-black leading-tight">{t("backup.deviceStorage")}</span>
            {health && (
              <span
                className="shrink-0 rounded-full border-[1.5px] border-line px-2 py-[3px] text-[10.5px] font-black leading-none"
                style={{ background: health.persisted ? blockFill("#7ae582") : blockFill("#ffd23f") }}
              >
                {health.persisted ? t("backup.persistent") : t("backup.notPersistent")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] font-bold text-ink/55">
            {health
              ? t("backup.usage", { used: formatBytes(health.usage) }) +
                (health.quota ? ` · ${t("backup.quota", { quota: formatBytes(health.quota) })}` : "")
              : t("backup.measuring")}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 border-t-[1.5px] border-dashed border-ink/20 pt-2 text-[12px] font-bold">
            <span className="text-ink/55">{t("backup.lastBackup")}</span>
            <span className={backupOld ? "font-black text-[var(--warn-ink)]" : "font-black"}>
              {lastBackupAt === null ? t("backup.never") : agoLabel(lastBackupAt)}
            </span>
          </div>
        </SettingsCell>
        {health && !health.persisted && (
          <SettingsCell className="bg-fill-[#fff1c2] text-[11.5px] font-bold leading-snug text-[var(--warn-ink-2)]">
            {t("backup.evictWarn")} {!health.standalone && `${t("backup.addToHome")} `}
            {t("backup.backupAnyway")}
          </SettingsCell>
        )}

        {/* Yedek al — paylaş menüsü (Drive, iCloud, mesaj) ya da dosya */}
        <SettingsCell>
          <div className="text-[14px] font-black leading-tight">{t("backup.download")}</div>
          <p className="mt-0.5 text-[11.5px] font-bold text-ink/55">
            {counts
              ? t("backup.counts", {
                  c: fmt(counts.categories),
                  e: fmt(counts.entries),
                  n: fmt(counts.notes),
                  g: fmt(counts.goals),
                })
              : t("backup.loading")}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={exporting}
              className={`${settingsButton} flex-1`}
              style={fillStyle("#ffd23f")}
            >
              <Share2 className="h-4 w-4" strokeWidth={2.75} />
              {exporting ? t("backup.preparing") : t("backup.share")}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              aria-label={t("backup.downloadJson")}
              title={t("backup.downloadJson")}
              className={`${settingsButton} w-11 bg-paper px-0`}
            >
              <Download className="h-4 w-4" strokeWidth={2.75} />
            </button>
          </div>
          <p className="mt-2 text-[11px] font-semibold leading-snug text-ink/55">{t("backup.shareHint")}</p>
        </SettingsCell>

        {/* Geri yükle */}
        <SettingsCell>
          <div className="text-[14px] font-black leading-tight">{t("backup.restore")}</div>
          <p className="mt-0.5 text-[11.5px] font-bold text-ink/55">{t("backup.pickHint")}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={`${settingsButton} mt-2.5 w-full bg-paper`}
          >
            <Upload className="h-4 w-4" strokeWidth={2.75} />
            {t("backup.chooseFile")}
          </button>
          {fileInput}
        </SettingsCell>

        {/* Seçilen yedek — ne geldiği ve nasıl yükleneceği */}
        {summary && pending && (
          <>
            <SettingsCell className="bg-floor">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-black leading-tight">{t("backup.loaded")}</div>
                  <div className="mt-0.5 text-[11.5px] font-bold text-ink/55">
                    {new Date(pending.exportedAt).toLocaleString(intlTag(), { dateStyle: "long", timeStyle: "short" })} · v
                    {pending.version}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  aria-label={t("action.cancel")}
                  disabled={importing}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg active:bg-ink/10"
                >
                  <X className="h-4 w-4" strokeWidth={2.75} />
                </button>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] font-bold">
                {(
                  [
                    ["Kategori", summary.counts.categories],
                    ["Alt kategori", summary.counts.subcategories],
                    ["Girdi", summary.counts.entries],
                    ["Value", summary.counts.entryValues],
                    ["Not", summary.counts.notes],
                    ["Planlı girdi", summary.counts.goals],
                    ["Özellik", summary.counts.mods],
                    ["Aktivite", summary.counts.activities],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-ink/55">{label}</dt>
                    <dd className="font-mono tabular-nums">{fmt(n)}</dd>
                  </div>
                ))}
              </dl>
              {pending.version < 2 && (
                <p className="mt-2 text-[11.5px] font-bold leading-snug text-[var(--warn-ink-2)]">
                  This is an older backup (version {pending.version}) — notes weren&rsquo;t included back then. Replacing will
                  delete the notes on this device.
                </p>
              )}
            </SettingsCell>
            <button
              type="button"
              onClick={() => runRestore("merge")}
              disabled={importing}
              className="flex items-start gap-2.5 bg-fill-[#dff7e3] px-3 py-2.5 text-left text-ink active:brightness-95 disabled:opacity-60"
            >
              <GitMerge className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.75} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-black leading-tight">
                  {t("backup.merge")} <span className="text-[11px] font-bold text-ink/55">{t("backup.recommended")}</span>
                </span>
                <span className="mt-0.5 block text-[11.5px] font-bold leading-snug text-ink/60">{t("backup.mergeBody")}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => runRestore("replace")}
              disabled={importing}
              className="flex items-start gap-2.5 bg-fill-[#ffe1de] px-3 py-2.5 text-left text-ink active:brightness-95 disabled:opacity-60"
            >
              <Replace className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-ink)]" strokeWidth={2.75} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-black leading-tight text-[var(--danger-ink)]">{t("backup.replace")}</span>
                <span className="mt-0.5 block text-[11.5px] font-bold leading-snug text-ink/60">{t("backup.replaceBody")}</span>
              </span>
            </button>
            {importing && <SettingsCell className="text-center text-[12px] font-bold text-ink/55">Loading…</SettingsCell>}
          </>
        )}

        {message && (
          <SettingsCell
            className={
              "flex items-start gap-2 text-[12.5px] font-bold leading-snug " +
              (message.type === "ok" ? "bg-fill-[#dff7e3]" : "bg-fill-[#ffe1de] text-[var(--danger-ink)]")
            }
          >
            {message.type === "ok" ? (
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0" strokeWidth={2.75} />
            ) : (
              <ShieldAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2.75} />
            )}
            <span className="min-w-0">{message.text}</span>
          </SettingsCell>
        )}
      </SettingsBlock>
    );
  }


  return (
    <>
      <div className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("backup.intro")}
        </p>

        {/* Depolama sağlığı — verinin cihazda ne kadar güvende durduğu */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sf-2)]">
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
                    {health.persisted ? t("backup.persistent") : t("backup.notPersistent")}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {health
                  ? t("backup.usage", { used: formatBytes(health.usage) }) +
                    (health.quota ? ` · ${t("backup.quota", { quota: formatBytes(health.quota) })}` : "")
                  : t("backup.measuring")}
              </div>
            </div>
          </div>

          {health && !health.persisted && (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-400/90">
              {t("backup.evictWarn")}{" "}
              {!health.standalone && `${t("backup.addToHome")} `}
              {t("backup.backupAnyway")}
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
              {lastBackupAt === null ? t("backup.never") : agoLabel(lastBackupAt)}
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
                  ? t("backup.counts", {
                      c: fmt(counts.categories),
                      e: fmt(counts.entries),
                      n: fmt(counts.notes),
                      g: fmt(counts.goals),
                    })
                  : t("backup.loading")}
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
              {exporting ? t("backup.preparing") : t("backup.share")}
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
            {t("backup.shareHint")}
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
                {t("backup.pickHint")}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {t("backup.chooseFile")}
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--sf-3)] hover:text-foreground"
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
                  ["Planlı girdi", summary.counts.goals],
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
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-[var(--sf-2)] disabled:opacity-60"
              >
                <GitMerge className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {t("backup.merge")}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {t("backup.recommended")}
                    </span>
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {t("backup.mergeBody")}
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
                    {t("backup.replace")}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {t("backup.replaceBody")}
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
