"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowUpRight, Check, Plus, Search, X } from "lucide-react";
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
  onAttached,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "category" | "subcategory";
  targetId: string;
  targetName: string;
  onGoToMeasures?: () => void;
  /** Bir özellik eklendiğinde (seçilen ya da yeni yaratılan) çağrılır —
   * girdi kartı akışı bunu değer sorma adımına bağlar */
  onAttached?: (mod: ModWithType) => void;
}) {
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [name, setName] = useState("");
  const [measureId, setMeasureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Havuzda arama — büyüteç açar, yazdıkça süzülür
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Ekleme ile kapanışta Radix odağı tetikleyiciye geri verir — bu, yeni
  // eklenen alanın autoFocus'unu çalar; bir kereliğine bastırılır
  const attachedRef = useRef(false);

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
        setSearchOpen(false);
        setSearch("");
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const attachedModIds = new Set(
    (attached ?? []).map((a) => a.modId).filter(Boolean)
  );
  const available = (pool ?? []).filter((m) => !attachedModIds.has(m.id));
  const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
  const filtered = search
    ? available.filter((m) => norm(m.name).includes(norm(search)))
    : available;

  async function handleAttach(modId: string) {
    setSaving(true);
    try {
      await attachMod(targetType, targetId, modId);
      attachedRef.current = true;
      onOpenChange(false);
      const picked = (pool ?? []).find((m) => m.id === modId);
      if (picked) onAttached?.(picked);
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
          setError(`"${clash.name}" adında bir özellik zaten var.`);
          setExistingId(clash.id);
        }
        return;
      }
      const { mod } = await createMod(name, measureId);
      await attachMod(targetType, targetId, mod.id);
      attachedRef.current = true;
      onOpenChange(false);
      const measure = (measures ?? []).find((t) => t.id === measureId);
      if (measure) onAttached?.({ ...mod, entryType: measure });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-4 max-h-[80dvh] overflow-y-auto"
        onCloseAutoFocus={(e) => {
          if (attachedRef.current) {
            e.preventDefault();
            attachedRef.current = false;
          }
        }}
      >
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
            {mode === "create" ? "Yeni özellik yarat" : "Özellik ekle"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Özellik adı tekildir — aynı özellik her yerde paylaşılır"
              : `"${targetName}" ile ilgili kaydetmek ve takip etmek istediğin özellikleri seç ya da yarat.`}
          </DialogDescription>
        </DialogHeader>

        {mode === "pick" ? (
          <>
            {/* Havuz başlığı + yeni yarat + arama */}
            <div className="flex items-center justify-between gap-2 -mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Havuzdan seç
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setMode("create");
                    if (search.trim()) setName(search.trim());
                  }}
                  className="flex h-7 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <Plus className="h-3 w-3" />
                  Yeni yarat
                </button>
                <button
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    if (searchOpen) setSearch("");
                  }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                    searchOpen
                      ? "bg-primary/15 text-primary"
                      : "bg-white/8 text-muted-foreground hover:bg-white/12 hover:text-foreground"
                  )}
                  aria-label={searchOpen ? "Aramayı kapat" : "Özellik ara"}
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {searchOpen && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Özellik ara..."
                  autoFocus
                  className="h-9 pl-9 pr-8"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 hover:text-foreground transition-colors"
                    aria-label="Aramayı temizle"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Özellik atomları — küçük, sık, ortalanmış modüler kutular */}
            <div className="grid grid-cols-3 gap-2">
              {filtered.map((m: ModWithType) => {
                const KindIcon =
                  MEASURE_KIND_META[m.entryType.valueType ?? "number"].icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleAttach(m.id)}
                    disabled={saving}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 transition-all hover:border-primary/40 hover:bg-muted active:scale-[0.94] disabled:opacity-50"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full"
                      style={{
                        background:
                          "radial-gradient(circle at 32% 28%, rgba(129,140,248,0.28), rgba(129,140,248,0.08) 70%)",
                        boxShadow: "inset 0 0 0 1px rgba(129,140,248,0.18)",
                      }}
                    >
                      <KindIcon
                        className="h-4 w-4 text-primary"
                        strokeWidth={1.75}
                      />
                    </span>
                    <span className="w-full truncate text-center text-xs font-medium leading-tight">
                      {m.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {available.length === 0 && !search && (
              <p className="text-xs text-muted-foreground/70 -mt-1">
                Havuzdaki tüm özellikler zaten ekli — yenisini yaratabilirsin.
              </p>
            )}
            {search && filtered.length === 0 && available.length > 0 && (
              <p className="text-xs text-muted-foreground/70 -mt-1">
                &bdquo;{search}&rdquo; havuzda yok — <span className="font-medium">Yeni yarat</span> bu adla oluşturur.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mod-name-input">Özellik adı</Label>
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
                    Var olan özelliği ekle
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
