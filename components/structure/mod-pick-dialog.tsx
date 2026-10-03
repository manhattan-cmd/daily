"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Plus, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ENTRY_WINDOW_FOOTER,
  ENTRY_WINDOW_LARGE,
} from "@/components/ui/entry-window";
import {
  FormSection,
  NAME_INPUT,
} from "@/components/structure/structure-form-shell";
import {
  listMods,
  listModifiersForTarget,
  type ModMeasure,
  createMod,
  measureOf,
  attachMod,
  findModByName,
  type ModWithType,
} from "@/lib/db/queries";
import { MeasureEditor, isMeasureComplete } from "@/components/structure/measure-editor";
import { ModAtom, ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { MEASURE_KIND_META, uiKindOf } from "@/lib/measure-kinds";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

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
  onAttached,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "category" | "subcategory";
  targetId: string;
  targetName: string;
  /** Bir özellik eklendiğinde (seçilen ya da yeni yaratılan) çağrılır —
   * girdi kartı akışı bunu değer sorma adımına bağlar */
  onAttached?: (mod: ModWithType) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [name, setName] = useState("");
  const [measure, setMeasure] = useState<ModMeasure>({ valueType: "number" });
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Havuzda arama — yazdıkça süzülür
  const [search, setSearch] = useState("");
  // Ekleme ile kapanışta Radix odağı tetikleyiciye geri verir — bu, yeni
  // eklenen alanın autoFocus'unu çalar; bir kereliğine bastırılır
  const attachedRef = useRef(false);

  const pool = useLiveQuery(() => listMods(), []);
  const attached = useLiveQuery(
    () => listModifiersForTarget(targetType, targetId),
    [targetType, targetId]
  );
  const knownUnits = [
    ...new Set((pool ?? []).map((m) => m.unit?.trim()).filter((u): u is string => !!u)),
  ].sort((a, b) => a.localeCompare(b, "en"));

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setMode("pick");
        setName("");
        setMeasure({ valueType: "number" });
        setError(null);
        setExistingId(null);
        setSearch("");
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const attachedModIds = new Set(
    (attached ?? []).map((a) => a.modId).filter(Boolean)
  );
  const available = (pool ?? []).filter((m) => !attachedModIds.has(m.id));
  const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
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
    if (!name.trim() || !isMeasureComplete(measure)) return;
    setSaving(true);
    setError(null);
    setExistingId(null);
    try {
      const clash = await findModByName(name);
      if (clash) {
        if (attachedModIds.has(clash.id)) {
          setError(
            t("features.clashAttached", { name: clash.name, target: targetName })
          );
        } else {
          setError(t("features.nameClashOf", { name: clash.name }));
          setExistingId(clash.id);
        }
        return;
      }
      const { mod } = await createMod(name, measure);
      await attachMod(targetType, targetId, mod.id);
      attachedRef.current = true;
      onOpenChange(false);
      onAttached?.({ ...mod, entryType: measureOf(mod) });
    } finally {
      setSaving(false);
    }
  }

  // Kategori pencereleriyle aynı dil (bkz. structure-form-shell): kenarlarda
  // pay, üstte simge + başlık, bölmeler kendi kibar kutusunda, eylemler altta
  // sabit. Eskiden pencere ekranın iki kenarına dayanıyordu ve havuz, arama,
  // "yeni yarat" tek bir sıkışık başlık satırına doluşmuştu.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(ENTRY_WINDOW_LARGE, "gap-0")}
        // Yaratma görünümünde açıklama satırı yok — Radix'in uyarısı sussun
        // diye bağlantı bilinçli olarak boşa çekiliyor. Seçme görünümünde
        // özniteliğin hiç geçilmemesi gerek, yoksa Radix'in kendi kimliği
        // ezilir; bu yüzden koşullu yayma.
        {...(mode === "create" ? { "aria-describedby": undefined } : {})}
        // Açılışta klavye fırlamasın — arama ya da ad alanına dokununca açılır
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          if (attachedRef.current) {
            e.preventDefault();
            attachedRef.current = false;
          }
        }}
      >
        {/* Başlık — yaratmada çekirdek seçilen ölçüm türüyle değişir */}
        <div className="flex items-center gap-3.5 pb-5 pr-6">
          {mode === "create" ? (
            <button
              type="button"
              onClick={() => {
                setMode("pick");
                setError(null);
                setExistingId(null);
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[var(--sf-2)] text-foreground/80 transition-colors hover:bg-[var(--sf-3)]"
              aria-label={t("form.backToPool")}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/15 text-primary">
              <Plus className="h-6 w-6" strokeWidth={2.25} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 truncate text-[12px] font-medium text-muted-foreground">
              {targetName}
            </div>
            <DialogTitle className="flex items-center gap-2 truncate text-lg font-semibold tracking-tight">
              {mode === "create" && (
                <ModAtomCore
                  icon={MEASURE_KIND_META[uiKindOf(measure)].icon}
                  size="sm"
                />
              )}
              {mode === "create"
                ? name.trim() || t("features.createNew")
                : t("entry.addFeature")}
            </DialogTitle>
          </div>
        </div>
        {mode === "pick" && (
          <DialogDescription className="sr-only">
            {t("features.pickHint", { name: targetName })}
          </DialogDescription>
        )}

        <div className="flex flex-col gap-2.5 pb-6">
          {mode === "pick" ? (
            <>
              {/* Yeni özellik — havuzda yoksa ilk bakılan yer */}
              <button
                type="button"
                onClick={() => {
                  setMode("create");
                  if (search.trim()) setName(search.trim());
                }}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-primary/35 bg-primary/[0.06] px-3.5 py-3 text-left transition-colors hover:bg-primary/10"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {t("features.createNew")}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {t("features.pickHint", { name: targetName })}
                  </span>
                </span>
              </button>

              <FormSection label={t("features.pickFromPool")}>
                {/* Arama hep açık — eskiden büyütece basınca beliriyordu */}
                <label className="flex h-10 items-center gap-2 rounded-xl bg-[var(--sf-2)] px-3 ring-1 ring-inset ring-[var(--ln-1)] focus-within:ring-2 focus-within:ring-primary/50">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("features.searchPlaceholder")}
                    className="h-full min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="rounded-full p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                      aria-label={t("features.clearSearch")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </label>

                {/* Özellik atomları — dairesel çekirdekler, 4 sütun */}
                {filtered.length > 0 && (
                  <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
                    {filtered.map((m: ModWithType) => (
                      <ModAtom
                        key={m.id}
                        icon={modAtomIcon(m)}
                        name={m.name}
                        onClick={() => handleAttach(m.id)}
                        disabled={saving}
                      />
                    ))}
                  </div>
                )}

                {available.length === 0 && !search && (
                  <p className="py-2 text-center text-xs text-muted-foreground/70">
                    {t("features.allAttached")}
                  </p>
                )}
                {search && filtered.length === 0 && available.length > 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground/70">
                    {t("features.notInPool", {
                      q: search,
                      action: t("features.addNew"),
                    })}
                  </p>
                )}
              </FormSection>
            </>
          ) : (
            <>
              <FormSection label={t("features.name")}>
                {/* autoFocus yok — telefonda klavye ölçüm türü seçilmeden fırlıyordu */}
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                    setExistingId(null);
                  }}
                  className={NAME_INPUT}
                />
                {error && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90">
                    {error}
                    {existingId && (
                      <button
                        type="button"
                        onClick={() => handleAttach(existingId)}
                        className="mt-1.5 flex items-center gap-1 font-medium text-amber-100 hover:underline"
                      >
                        <Check className="h-3 w-3" />
                        {t("features.attachExisting")}
                      </button>
                    )}
                  </div>
                )}
              </FormSection>

              <FormSection label={t("measure.howMeasured")}>
                <MeasureEditor
                  value={measure}
                  onChange={setMeasure}
                  knownUnits={knownUnits}
                  hideLabel
                />
              </FormSection>
            </>
          )}
        </div>

        {/* Eylemler altta sabit — seçmede yalnız kapat, yaratmada oluştur */}
        <DialogFooter className={ENTRY_WINDOW_FOOTER}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("action.cancel")}
          </Button>
          {mode === "create" && (
            <Button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !isMeasureComplete(measure)}
            >
              {t("features.createAndAttach")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
