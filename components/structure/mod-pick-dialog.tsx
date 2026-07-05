"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowUpRight, Check, Plus, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listMods,
  listModifiersForTarget,
  listEntryTypes,
  createMod,
  attachMod,
  findModByName,
  type ModWithType,
} from "@/lib/db/queries";
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";
import { MEASURE_KIND_META } from "@/lib/measure-kinds";
import { cn } from "@/lib/utils";

/**
 * Mod ekleme: havuzdaki atomlardan seç ya da yeni atom yarat (isim tekildir).
 * Aynı mod birden çok yerde paylaşılır — "Para" hem Market'te hem Bira'da.
 */
export function ModPickDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
  onGoToMeasures,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "category" | "subcategory";
  targetId: string;
  targetName: string;
  onGoToMeasures?: () => void;
}) {
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [name, setName] = useState("");
  const [measureId, setMeasureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pool = useLiveQuery(() => listMods(), []);
  const attached = useLiveQuery(
    () => listModifiersForTarget(targetType, targetId),
    [targetType, targetId]
  );
  const measures = useLiveQuery(() => listEntryTypes(), []);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setMode("pick");
        setName("");
        setMeasureId(null);
        setError(null);
        setExistingId(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const attachedModIds = new Set(
    (attached ?? []).map((a) => a.modId).filter(Boolean)
  );
  const available = (pool ?? []).filter((m) => !attachedModIds.has(m.id));

  async function handleAttach(modId: string) {
    setSaving(true);
    try {
      await attachMod(targetType, targetId, modId);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!name.trim() || !measureId) return;
    setSaving(true);
    setError(null);
    setExistingId(null);
    try {
      const clash = await findModByName(name);
      if (clash) {
        if (attachedModIds.has(clash.id)) {
          setError(`"${clash.name}" zaten var ve ${targetName} içinde ekli.`);
        } else {
          setError(`"${clash.name}" adında bir mod zaten var.`);
          setExistingId(clash.id);
        }
        return;
      }
      const { mod } = await createMod(name, measureId);
      await attachMod(targetType, targetId, mod.id);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {mode === "create" && (
              <button
                onClick={() => { setMode("pick"); setError(null); setExistingId(null); }}
                className="h-6 w-6 -ml-1 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Havuza dön"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {mode === "create" ? "Yeni mod yarat" : "Mod ekle"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Mod adı tekildir — aynı mod her yerde paylaşılır"
              : `${targetName} için havuzdan seç ya da yeni yarat`}
          </DialogDescription>
        </DialogHeader>

        {mode === "pick" ? (
          <>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Havuzdaki tüm modlar zaten ekli.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {available.map((m: ModWithType) => (
                  <button
                    key={m.id}
                    onClick={() => handleAttach(m.id)}
                    disabled={saving}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99] disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        {m.name}
                        {m.isBuiltIn && (
                          <Sparkles className="h-3 w-3 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {m.entryType.name !== m.name && `${m.entryType.name} · `}
                        {ENTRY_VALUE_TYPE_LABELS[m.entryType.valueType ?? "number"]}
                        {m.entryType.unit
                          ? ` · ${m.entryType.unit}`
                          : m.entryType.choices?.length
                          ? ` · ${m.entryType.choices.join(", ")}`
                          : null}
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setMode("create")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-primary hover:border-primary/50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Yeni mod yarat
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mod-name-input">Mod adı</Label>
              <Input
                id="mod-name-input"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); setExistingId(null); }}
                placeholder="örn. Yürüyüş süresi"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Ölçüsü</Label>
              <div className="flex flex-wrap gap-2">
                {(measures ?? []).map((t) => {
                  const KindIcon = MEASURE_KIND_META[t.valueType ?? "number"].icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setMeasureId(t.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                        measureId === t.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <KindIcon className="h-3.5 w-3.5 opacity-60" />
                      {t.name}
                      {t.unit && (
                        <span className="text-xs opacity-60">({t.unit})</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {onGoToMeasures && (
                <button
                  onClick={onGoToMeasures}
                  className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Yeni ölçü türü oluştur
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90">
                {error}
                {existingId && (
                  <button
                    onClick={() => handleAttach(existingId)}
                    className="mt-1.5 flex items-center gap-1 font-medium text-amber-100 hover:underline"
                  >
                    <Check className="h-3 w-3" />
                    Var olan modu ekle
                  </button>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                İptal
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving || !name.trim() || !measureId}
              >
                Yarat ve ekle
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
