"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload, ShieldAlert, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import {
  exportBackup,
  downloadBackup,
  parseBackupFile,
  restoreBackup,
} from "@/lib/db/backup";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export default function BackupPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const counts = useLiveQuery(async () => {
    const [categories, entries, goals] = await Promise.all([
      db.categories.count(),
      db.entries.count(),
      db.goals.count(),
    ]);
    return { categories, entries, goals };
  }, []);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      const payload = await exportBackup();
      downloadBackup(payload);
      setMessage({ type: "ok", text: "Yedek indirildi." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Yedek alınamadı.",
      });
    } finally {
      setExporting(false);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // aynı dosya tekrar seçilebilsin
    if (!file) return;

    setMessage(null);
    try {
      const text = await file.text();
      const payload = parseBackupFile(text);

      const summary = [
        payload.data.categories?.length ?? 0,
        payload.data.entries?.length ?? 0,
        payload.data.goals?.length ?? 0,
      ];
      const confirmed = confirm(
        `Bu yedek ${summary[0]} kategori, ${summary[1]} girdi, ${summary[2]} hedef içeriyor.\n\n` +
          "İçe aktarırsan telefonundaki MEVCUT TÜM VERİ silinip bunun yerine bu yedek yüklenecek. " +
          "Bu işlem geri alınamaz.\n\nDevam edilsin mi?"
      );
      if (!confirmed) return;

      setImporting(true);
      await restoreBackup(payload);
      setMessage({ type: "ok", text: "Yedek geri yüklendi." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Dosya okunamadı.",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Yedekleme"
        description="Verilerini dışa aktar veya geri yükle"
        back="/structure"
      />

      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tüm verilerin (kategoriler, alt kategoriler, modlar, girdiler,
          hedefler) yalnızca bu cihazda saklanıyor. Tarayıcı verisi
          silinirse ya da telefon değişirse geri dönüşü olmaz — düzenli
          yedek almanı öneririz.
        </p>

        {/* Dışa Aktar */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">Yedek İndir</div>
              <div className="text-xs text-muted-foreground">
                {counts
                  ? `${counts.categories} kategori · ${counts.entries} girdi · ${counts.goals} hedef`
                  : "Yükleniyor..."}
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={handleExport} disabled={exporting}>
            {exporting ? "Hazırlanıyor..." : "JSON Olarak İndir"}
          </Button>
        </div>

        {/* İçe Aktar */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Upload className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">Yedekten Geri Yükle</div>
              <div className="text-xs text-muted-foreground">
                Mevcut tüm veriyi siler, yedekle değiştirir
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleImportClick}
            disabled={importing}
          >
            {importing ? "Geri yükleniyor..." : "Dosya Seç ve Geri Yükle"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

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
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            {message.text}
          </div>
        )}
      </div>
    </>
  );
}
