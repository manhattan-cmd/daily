"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Plus, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
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
  PreviewTile,
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
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { modColor } from "@/lib/mod-color";
import { db } from "@/lib/db";
import { MEASURE_KIND_META, uiKindOf } from "@/lib/measure-kinds";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Mod ekleme: havuzdaki atomlardan seç ya da yeni atom yarat (isim tekildir).
 * Aynı mod birden çok yerde paylaşılır — "Para" hem Market'te hem Bira'da.
 *
 * İki kullanım:
 *  - YAPI (varsayılan, persist): seçilenler hedefe kalıcı olarak bağlanır.
 *  - GİRDİ (persist=false): hiçbir şey bağlanmaz, seçilenler onPicked ile
 *    çağırana verilir — yalnız o girdinin formunda durur, yapıya dokunmaz.
 *    Yeni yaratılan özellik yine havuza girer (adı tekil, başka yerde de
 *    seçilebilsin) ama bu kaleme bağlanmaz.
 */
export function ModPickDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
  onAttached,
  persist = true,
  excludeModIds,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "category" | "subcategory";
  targetId: string;
  targetName: string;
  /** Bir özellik eklendiğinde (seçilen ya da yeni yaratılan) çağrılır —
   * girdi kartı akışı bunu değer sorma adımına bağlar */
  onAttached?: (mod: ModWithType) => void;
  /** false: yapıya bağlama, seçilenleri onPicked ile ver (girdiye özel) */
  persist?: boolean;
  /** persist=false iken listeden düşülecekler — formda zaten duranlar */
  excludeModIds?: string[];
  onPicked?: (mods: ModWithType[]) => void;
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
  // Seçilenler (dokunma sırasıyla) — "Ekle" hepsini birden bağlar. Eskiden
  // dokunmak anında ekleyip pencereyi kapatıyordu; birkaç özellik eklemek
  // için pencere her seferinde yeniden açılıyordu.
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  // Ekleme ile kapanışta Radix odağı tetikleyiciye geri verir — bu, yeni
  // eklenen alanın autoFocus'unu çalar; bir kereliğine bastırılır
  const attachedRef = useRef(false);

  const pool = useLiveQuery(() => listMods(), []);
  // Pencerenin rengi hedefin kategorisinden: başlık karosu ve asli eylemler
  // onun renginde. Renksiz gri bir pencere hangi kaleme eklendiğini
  // söylemiyordu.
  const target = useLiveQuery(async () => {
    if (targetType === "category") {
      const c = await db.categories.get(targetId);
      return c ? { color: c.color, icon: c.icon } : null;
    }
    const sub = await db.subcategories.get(targetId);
    const c = sub ? await db.categories.get(sub.categoryId) : undefined;
    return c ? { color: c.color, icon: sub?.icon ?? c.icon } : null;
  }, [targetType, targetId]);
  const accent = target?.color ?? "#6366f1";
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
        setSelected([]);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const attachedModIds = new Set(
    persist
      ? (attached ?? []).map((a) => a.modId).filter(Boolean)
      : excludeModIds ?? []
  );
  const available = (pool ?? []).filter((m) => !attachedModIds.has(m.id));
  const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
  const filtered = search
    ? available.filter((m) => norm(m.name).includes(norm(search)))
    : available;

  async function handleAttach(modId: string) {
    if (!persist) {
      const picked = (pool ?? []).find((m) => m.id === modId);
      attachedRef.current = true;
      onOpenChange(false);
      if (picked) onPicked?.([picked]);
      return;
    }
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

  /** Seçilenleri sırayla bağla. Çağırana ilk seçilen bildirilir — girdi
   *  akışları eklenen özelliğe odaklanıp değer soruyor, bir tanesi yeter. */
  async function handleAttachSelected() {
    if (selected.length === 0) return;
    if (!persist) {
      const byId = new Map((pool ?? []).map((m) => [m.id, m]));
      const picked = selected
        .map((id) => byId.get(id))
        .filter((m): m is ModWithType => !!m);
      attachedRef.current = true;
      onOpenChange(false);
      onPicked?.(picked);
      return;
    }
    setSaving(true);
    try {
      for (const id of selected) await attachMod(targetType, targetId, id);
      attachedRef.current = true;
      onOpenChange(false);
      const first = (pool ?? []).find((m) => m.id === selected[0]);
      if (first) onAttached?.(first);
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
      const withType = { ...mod, entryType: measureOf(mod) };
      if (!persist) {
        attachedRef.current = true;
        onOpenChange(false);
        onPicked?.([withType]);
        return;
      }
      await attachMod(targetType, targetId, mod.id);
      attachedRef.current = true;
      onOpenChange(false);
      onAttached?.(withType);
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
        // Açıklama satırı yok — Radix'in uyarısı sussun
        aria-describedby={undefined}
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
        <div className="flex items-center gap-3.5 pb-4 pr-6">
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
            <PreviewTile color={accent} icon={target?.icon} size={48} />
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 truncate text-[12px] font-medium text-muted-foreground">
              {targetName}
              {!persist && ` · ${t("entry.onlyThisEntry")}`}
            </div>
            <DialogTitle className="flex items-center gap-2 truncate text-lg font-semibold tracking-tight">
              {mode === "create" && (
                <ModAtomCore
                  icon={MEASURE_KIND_META[uiKindOf(measure)].icon}
                  size="sm"
                  color={accent}
                />
              )}
              {mode === "create"
                ? name.trim() || t("features.createNew")
                : t("entry.addFeature")}
            </DialogTitle>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pb-6">
          {mode === "pick" ? (
            <>
              <FormSection
                // Pencerenin kenarlarına yaklaşır: kartlar daha geniş, adlar rahat
                className="-mx-4 px-3"
                label={t("features.pickFromPool")}
                action={
                  // Havuzda yoksa yeni yarat — küçük bir kapsül; aranan ad
                  // yaratma formuna taşınır
                  <button
                    type="button"
                    onClick={() => {
                      setMode("create");
                      if (search.trim()) setName(search.trim());
                    }}
                    className="flex h-7 items-center gap-1 rounded-full pl-2 pr-2.5 text-[12px] font-semibold transition-opacity hover:opacity-85"
                    style={{
                      background: `${accent}2e`,
                      color: accent,
                      boxShadow: `inset 0 0 0 1px ${accent}55`,
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    {t("features.addNew")}
                  </button>
                }
              >
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
                  // Renkli daireler, üç sütun: dört sütunda adlar kesiliyordu,
                  // burada iki satıra kadar tam okunuyor. Her özellik kendi
                  // renginde hafif bir karenin içinde; dokunmak SEÇER — kare
                  // koyulaşır, çerçevesi belirginleşir, köşede tik belirir.
                  // Ekleme alttaki düğmeyle.
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {filtered.map((m: ModWithType) => {
                      const c = modColor(m);
                      const on = selected.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggle(m.id)}
                          aria-pressed={on}
                          disabled={saving}
                          className="relative flex flex-col items-center gap-2 rounded-2xl px-1.5 pb-2.5 pt-3 transition-all duration-200 active:scale-[0.94] disabled:opacity-50"
                          style={
                            on
                              ? {
                                  background: `${c}29`,
                                  boxShadow: `inset 0 0 0 1.5px ${c}`,
                                }
                              : {
                                  background: `${c}0f`,
                                  boxShadow: `inset 0 0 0 1px ${c}2e`,
                                }
                          }
                        >
                          {on && (
                            <span
                              className="entry-tile-pop absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white"
                              style={{ background: c }}
                            >
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                          )}
                          <ModAtomCore icon={modAtomIcon(m)} color={c} />
                          <span
                            className={cn(
                              "line-clamp-2 w-full break-words text-center text-[12px] font-medium leading-[15px]",
                              on ? "text-foreground" : "text-foreground/75"
                            )}
                          >
                            {m.name}
                          </span>
                        </button>
                      );
                    })}
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
          {mode === "pick" && (
            <Button
              onClick={handleAttachSelected}
              disabled={saving || selected.length === 0}
              className="text-white"
              style={{ backgroundColor: accent }}
            >
              {selected.length > 0
                ? `${t("action.add")} (${selected.length})`
                : t("action.add")}
            </Button>
          )}
          {mode === "create" && (
            <Button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !isMeasureComplete(measure)}
              className="text-white"
              style={{ backgroundColor: accent }}
            >
              {t("features.createAndAttach")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
