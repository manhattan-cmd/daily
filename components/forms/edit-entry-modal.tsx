"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  LayoutGrid,
  Link2,
  NotebookPen,
  Plus,
  Repeat,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
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
import { db } from "@/lib/db";
import {
  createEntry,
  deleteEntry,
  linkEntryToGroup,
  listModifiersForTarget,
  updateEntry,
  getLinkedSiblingModIds,
  listEntryTypes,
  listEntryBacklinks,
  listMods,
  setEntryAliases,
  updateSubCategory,
  type CategoryModifierWithType,
  type ModWithType,
  type ParallelSub,
} from "@/lib/db/queries";
import { Switch } from "@/components/ui/switch";
import { OptionsMenu, PanelBlock } from "@/components/forms/form-options";
import { isNumericChoiceSet, SHORT_MONTHS } from "@/lib/analytics";
import { ModAtom, modAtomIcon } from "@/components/structure/mod-atom";
import { modColor } from "@/lib/mod-color";
import {
  MEASURE_KIND_META,
  MEASURE_UI_KINDS,
  uiKindOf,
  type MeasureUiKind,
} from "@/lib/measure-kinds";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import { AliasEditor } from "@/components/notes/alias-editor";
import {
  DateTimeInput,
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import { ParallelPickList } from "@/components/forms/parallel-pick-dialog";
import { ChoiceWindow } from "@/components/forms/choice-window";
import { EmotionPicker } from "@/components/forms/emotion-picker";
import { FieldWindow } from "@/components/forms/field-window";
import { MoodScale } from "@/components/forms/mood-scale";
import { colorSkin, FIELD_TONES } from "@/components/forms/field-tone";
import { splitChoiceLevel } from "@/lib/choice-level";
import type { FieldTone } from "@/components/forms/field-tone";
import {
  cn,
  formatDateTime,
  toLocalDateTimeValue,
  toLocalDateValue,
} from "@/lib/utils";
import type { EntryWithContext, EntryType } from "@/types";

interface EditEntryModalProps {
  entry: EntryWithContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Başlık menüsünden açılan bölümler — aynı anda yalnız biri açık kalır */
type Panel = "time" | "parallel" | "alias" | "regular" | "delete";

/** Zaman satırının etiketi — gün girdinin günüyse yalnız saat, değilse gün de */
function occurredAtLabel(
  occurredAt: string,
  entryDate: string,
  emptyLabel: string
): string {
  const [d = "", t = ""] = occurredAt.split("T");
  if (!t) return emptyLabel;
  if (d === entryDate) return t;
  const dt = new Date(d + "T00:00:00");
  return `${SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()} · ${t}`;
}

export function EditEntryModal({
  entry,
  open,
  onOpenChange,
}: EditEntryModalProps) {
  const t = useT();
  // Yerleşik uyku girdisi düzenlenirken alanlar da uykunun moruna boyanır —
  // kart, ekleme penceresi ve düzenleme penceresi aynı dili konuşsun
  // Yerleşik akışın rengi: uyku moru, ruh hali pembesi. Anahtarı olmayan tek
  // yerleşik eski kurulumdaki Uyku.
  const fieldTone: FieldTone = !entry.category.isBuiltIn
    ? "default"
    : (entry.category.builtInKey ?? "sleep") === "mood"
      ? "mood"
      : "sleep";
  // Sıradan girdilerde alanlar kategori renginde; yerleşiklerin kendi sabit
  // tonu var, orada serbest renk verilmez.
  const fieldColor =
    fieldTone === "default" ? entry.category.color || undefined : undefined;
  // Özellik ekleme yüzeyinin tonu — kategorisi renksizse uygulamanın moru
  const accent = fieldColor ?? "#818cf8";
  const router = useRouter();
  const mods = useLiveQuery(
    () => listModifiersForTarget("subcategory", entry.subcategoryId),
    [entry.subcategoryId]
  );
  const siblingModIds =
    (useLiveQuery(() => getLinkedSiblingModIds(entry.id), [entry.id]) ??
      new Set<string>());
  const allEntryTypes = useLiveQuery(() => listEntryTypes(), []);
  const poolMods = useLiveQuery(() => listMods(), []);
  // Girdi tarafı backlink — bu girdiyi anan notlar
  const entryBacklinks = useLiveQuery(
    () => listEntryBacklinks(entry.id),
    [entry.id]
  );

  // Satır anahtarı: isimli mod değerleri için modId, girdiye özel ölçüler için
  // "t:<typeId>". Değer DİZİ: bir girdi aynı özellikten birden çok değer
  // taşıyabiliyor (ruh halinde bir kayıtta üç duygu). Tek dizeyken satır son
  // değeri gösteriyor, kaydetmek de öbürlerini siliyordu. Tek değerli
  // özelliklerde dizi tek elemanlı — davranış aynı.
  const [values, setValues] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const v of entry.values) {
      if (!v.modId && !v.entryTypeId) continue;
      (init[v.modId ?? `t:${v.entryTypeId}`] ??= []).push(v.value);
    }
    return init;
  });

  // Bu girdiden çıkarılan satırlar (kategoriden değil)
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

  // Girdiye özel eklenen havuz modları (bu oturumda)
  const [extraModIds, setExtraModIds] = useState<string[]>([]);
  // Yeni eklenen özelliğin alanı — görünüme kaydırılıp odaklanır
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Modsuz eski değerler (migrasyon öncesi kalıntı) — ölçüyle gösterilir
  const [extraTypeIds] = useState<string[]>(() =>
    entry.values
      .filter((v) => v.entryTypeId && !v.modId && v.value)
      .map((v) => v.entryTypeId!)
  );

  // Paralel perspektifler: mevcut kardeşler (linkedGroup) + bu oturumda eklenenler.
  // Seçici ayrı bir dialog DEĞİL, bu dialog'un içinde bir görünüm — üst üste iki
  // Radix dialog'u kırılgandı (alttaki kendini kapatıp akışı limboda bırakıyordu)
  const [newParallels, setNewParallels] = useState<ParallelSub[]>([]);
  const [pickerView, setPickerView] = useState(false);

  // Kaydet sonrası adım adım perspektif formu — ekleme akışıyla aynı davranış:
  // her yeni perspektifin kendi modları sorulur, ana girdiden taşınan ortak
  // atomlar kilitli gösterilir
  const [pStep, setPStep] = useState<{
    sub: ParallelSub;
    index: number;
    total: number;
    groupId: string;
    carry: Record<string, string>;
  } | null>(null);
  const [pQueue, setPQueue] = useState<ParallelSub[]>([]);
  const [pValues, setPValues] = useState<Record<string, string>>({});
  const [pSaving, setPSaving] = useState(false);
  // Akışta en az bir perspektif girdisi yaratıldı mı — ana girdi ancak o zaman
  // (ve akışın SONUNDA) gruba bağlanır; erken bağlamak kartı LinkedEntryCard'a
  // çevirip bu modalı unmount ediyor
  const pCreated = useRef(false);
  const pStepSubId = pStep?.sub.id ?? "";
  const stepMods =
    useLiveQuery(
      async () =>
        pStepSubId
          ? listModifiersForTarget("subcategory", pStepSubId)
          : ([] as CategoryModifierWithType[]),
      [pStepSubId]
    ) ?? [];

  // Modal kapanınca adım akışı sıfırlanır (component EntryCard'da hep mount).
  // Render sırasında ayarlama — effect'te setState kademeli render demek.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setPStep(null);
      setPQueue([]);
      setPValues({});
      setNewParallels([]);
      setPickerView(false);
    }
  }

  const pValueKey = (m: CategoryModifierWithType) => m.modId ?? m.id;
  const pSharedKey = (m: CategoryModifierWithType) => m.modId ?? m.entryTypeId ?? m.id;

  async function advanceParallel(
    queue: ParallelSub[],
    groupId: string,
    index: number,
    total: number,
    carry: Record<string, string>
  ) {
    if (!queue.length) {
      setPStep(null);
      setPQueue([]);
      setPValues({});
      onOpenChange(false);
      // Ana girdi en son bağlanır (yalnızca gerçekten perspektif yaratıldıysa)
      if (pCreated.current && !entry.linkedGroupId) {
        await linkEntryToGroup(entry.id, groupId);
      }
      return;
    }
    setPQueue(queue.slice(1));
    setPValues({});
    setPStep({ sub: queue[0], index: index + 1, total, groupId, carry });
  }

  async function handleParallelStepSave() {
    if (!pStep) return;
    setPSaving(true);
    try {
      const typeValues: { entryTypeId?: string; value: string; modId?: string }[] = [];
      const carryNext = { ...pStep.carry };
      const used = new Set<string>();
      for (const m of stepMods) {
        const key = pSharedKey(m);
        if (used.has(key)) continue;
        const v = pStep.carry[key] ?? pValues[pValueKey(m)] ?? "";
        if (v === "") continue;
        typeValues.push({ entryTypeId: m.entryTypeId, modId: m.modId, value: v });
        carryNext[key] = v;
        used.add(key);
      }
      await createEntry({
        subcategoryId: pStep.sub.id,
        typeValues,
        occurredAt: new Date(occurredAt).getTime(),
        linkedGroupId: pStep.groupId,
      });
      pCreated.current = true;
      await advanceParallel(
        pQueue,
        pStep.groupId,
        pStep.index,
        pStep.total,
        carryNext
      );
    } finally {
      setPSaving(false);
    }
  }
  const siblings =
    useLiveQuery(async () => {
      if (!entry.linkedGroupId) return [];
      const sibs = await db.entries
        .where("linkedGroupId")
        .equals(entry.linkedGroupId)
        .filter((e) => e.id !== entry.id)
        .toArray();
      const out: { id: string; subcategoryId: string; catName: string; subName: string }[] = [];
      for (const s of sibs) {
        const sub = await db.subcategories.get(s.subcategoryId);
        const cat = sub ? await db.categories.get(sub.categoryId) : undefined;
        out.push({
          id: s.id,
          subcategoryId: s.subcategoryId,
          catName: cat?.name ?? "—",
          subName: sub?.isCategoryRoot ? (cat?.name ?? "—") : (sub?.name ?? "—"),
        });
      }
      return out;
    }, [entry.id, entry.linkedGroupId]) ?? [];

  // Seçicide gizlenecekler: girdinin kendisi + zaten perspektifi olan altlar
  const hiddenSubIds = new Set([
    entry.subcategoryId,
    ...siblings.map((s) => s.subcategoryId),
  ]);

  async function removeSibling(sib: { id: string; subName: string }) {
    const ok = await confirmDialog({
      title: t("confirm.deletePerspective", { name: sib.subName }),
      body: `${t("confirm.deletePerspectiveBody")} ${t("confirm.undoHint")}`,
      destructive: true,
    });
    if (!ok) return;
    await deleteEntry(sib.id);
  }

  const [addModOpen, setAddModOpen] = useState(false);
  const [modQuery, setModQuery] = useState("");
  const [aliases, setAliases] = useState<string[]>(entry.aliases ?? []);
  const [notes, setNotes] = useState(entry.notes ?? "");
  // İkincil ayarlar başlıktaki menüden açılır — aynı anda yalnız biri
  const [panel, setPanel] = useState<Panel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  // t("entry.regular") alt kategori özelliğidir; canlı okunur ve anında yazılır
  const liveSub = useLiveQuery(
    () => db.subcategories.get(entry.subcategoryId),
    [entry.subcategoryId]
  );
  const isRegular = !!(liveSub ?? entry.subcategory).isRegular;
  const regularScopeName = entry.subcategory.isCategoryRoot
    ? entry.category.name
    : entry.subcategory.name;
  /** Mevcut kardeş perspektifler + bu oturumda eklenenler */
  const totalParallels = siblings.length + newParallels.length;

  // Kök girdiler kategoriye aittir; gizli kök alt kategorisinin sayfası yok
  const structureName = entry.subcategory.isCategoryRoot
    ? entry.category.name
    : entry.subcategory.name;
  const structureHref = entry.subcategory.isCategoryRoot
    ? `/structure/${entry.category.id}`
    : `/structure/${entry.category.id}/${entry.subcategoryId}`;
  // Yerel biçim şart: kaydederken `new Date(occurredAt)` bunu yerel okuyor —
  // toISOString ile üretilirse her kayıtta zaman UTC farkı kadar kayıyordu
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalDateTimeValue(entry.occurredAt)
  );
  const [saving, setSaving] = useState(false);

  const entryTypeMap = useMemo(() => {
    const map = new Map<string, EntryType>();
    for (const t of allEntryTypes ?? []) map.set(t.id, t);
    return map;
  }, [allEntryTypes]);

  // Sıralı satır listesi: alt kategorinin isimli modları, sonra girdiye özel ölçüler
  type Row = {
    key: string;
    modId?: string;
    entryTypeId?: string;
    label: string;
    entryType: EntryType;
  };
  const poolModMap = useMemo(() => {
    const map = new Map<string, ModWithType>();
    for (const m of poolMods ?? []) map.set(m.id, m);
    return map;
  }, [poolMods]);

  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    const result: Row[] = [];
    // Alt kategoriye atanmış modlar
    for (const a of mods ?? []) {
      const key = a.modId ?? a.id;
      if (removedKeys.has(key) || seen.has(key)) continue;
      result.push({
        key,
        modId: a.modId,
        entryTypeId: a.entryTypeId,
        label: a.name ?? a.entryType.name,
        entryType: a.entryType,
      });
      seen.add(key);
    }
    // Atanmamış ama bu girdide değeri olan havuz modları
    for (const v of entry.values) {
      if (!v.modId) continue;
      if (removedKeys.has(v.modId) || seen.has(v.modId)) continue;
      const t =
        v.entryType ?? (v.entryTypeId ? entryTypeMap.get(v.entryTypeId) : undefined);
      if (!t) continue;
      result.push({
        key: v.modId,
        modId: v.modId,
        entryTypeId: v.entryTypeId,
        label: v.mod?.name ?? poolModMap.get(v.modId)?.name ?? t.name,
        entryType: t,
      });
      seen.add(v.modId);
    }
    // Bu oturumda girdiye özel eklenen havuz modları
    for (const modId of extraModIds) {
      if (removedKeys.has(modId) || seen.has(modId)) continue;
      const m = poolModMap.get(modId);
      if (!m) continue;
      result.push({
        key: modId,
        modId,
        entryTypeId: m.entryTypeId,
        label: m.name,
        entryType: m.entryType,
      });
      seen.add(modId);
    }
    // Migrasyon öncesi modsuz değerler
    for (const typeId of extraTypeIds) {
      const key = `t:${typeId}`;
      if (removedKeys.has(key) || seen.has(key)) continue;
      const t = entryTypeMap.get(typeId);
      if (!t) continue;
      result.push({ key, entryTypeId: typeId, label: t.name, entryType: t });
      seen.add(key);
    }
    return result;
  }, [mods, extraModIds, extraTypeIds, removedKeys, entry.values, entryTypeMap, poolModMap]);

  // Girdiye özel eklenebilecek havuz modları
  const availableToAdd = useMemo(() => {
    const visibleModIds = new Set(rows.map((r) => r.modId).filter(Boolean));
    return (poolMods ?? []).filter((m) => !visibleModIds.has(m.id));
  }, [poolMods, rows]);

  const entryDate = toLocalDateValue(entry.occurredAt);

  function handleRemove(key: string) {
    setRemovedKeys((prev) => new Set([...prev, key]));
  }

  function handleAddMod(modId: string) {
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      next.delete(modId);
      return next;
    });
    setExtraModIds((prev) =>
      prev.includes(modId) ? prev : [...prev, modId]
    );
    setFocusKey(modId);
    setAddModOpen(false);
    setModQuery("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setEntryAliases(entry.id, aliases);
      const typeValues = rows.flatMap((r) =>
        (values[r.key] ?? [])
          .filter((value) => value !== "")
          .map((value) => ({
            entryTypeId: r.entryTypeId,
            modId: r.modId,
            value,
          }))
      );
      await updateEntry(entry.id, {
        typeValues,
        occurredAt: new Date(occurredAt).getTime(),
        notes: notes.trim() || undefined,
      });
      // Yeni perspektifler — ekleme akışındaki gibi her biri için form açılır;
      // güncellenen değerler ortak atomlara kilitli taşınır. Grup id'si bellekte
      // üretilir, ana girdiye akışın sonunda yazılır (advanceParallel).
      if (newParallels.length) {
        const groupId = entry.linkedGroupId ?? nanoid(12);
        pCreated.current = false;
        const carry: Record<string, string> = {};
        for (const tv of typeValues)
          carry[tv.modId ?? tv.entryTypeId ?? ""] = tv.value;
        const queue = [...newParallels];
        setNewParallels([]);
        setPQueue(queue.slice(1));
        setPValues({});
        setPStep({
          sub: queue[0],
          index: 1,
          total: queue.length,
          groupId,
          carry,
        });
        return; // modal açık kalır, perspektif adımına geçilir
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto gap-5">
          {pStep ? (
            /* Perspektif adımı — ekleme akışındaki t("action.saveAndContinue") davranışı */
            <>
              <DialogHeader>
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-violet-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">
                    {pStep.sub.categoryName}
                    {pStep.total > 1 && ` · ${pStep.index}/${pStep.total}`}
                  </span>
                </div>
                <DialogTitle>
                  {pStep.sub.isCategoryRoot
                    ? pStep.sub.categoryName
                    : pStep.sub.name}
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {stepMods.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-4 text-center text-sm text-muted-foreground">
                    Bu perspektifte mod yok — doğrudan kaydedebilirsin
                  </p>
                ) : (
                  stepMods.map((m) => {
                    const carried = pStep.carry[pSharedKey(m)];
                    const label = m.name ?? m.entryType.name;
                    if (carried !== undefined && carried !== "") {
                      const vt = m.entryType.valueType ?? "number";
                      const display =
                        vt === "boolean"
                          ? carried === "true"
                            ? t("entry.yes")
                            : t("entry.no")
                          : vt === "datetime-range"
                            ? formatDTRDisplay(carried)
                            : carried;
                      return (
                        <div key={m.id} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">
                              {label}
                              {m.entryType.unit && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  ({m.entryType.unit})
                                </span>
                              )}
                            </label>
                            <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400/70">
                              <Link2 className="h-3 w-3" />
                              ana girdiden
                            </span>
                          </div>
                          <div className="flex h-10 items-center rounded-xl border border-violet-500/30 bg-violet-500/8 px-3 text-sm text-muted-foreground/80 select-none">
                            {display}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <ModInput
                        key={m.id}
                        label={label}
                        entryType={m.entryType}
                        values={
                          pValues[pValueKey(m)] ? [pValues[pValueKey(m)]] : []
                        }
                        onChange={(v) =>
                          setPValues((prev) => ({
                            ...prev,
                            [pValueKey(m)]: v[0] ?? "",
                          }))
                        }
                        entryDate={entryDate}
                      />
                    );
                  })
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={pSaving}
                  onClick={() =>
                    advanceParallel(
                      pQueue,
                      pStep.groupId,
                      pStep.index,
                      pStep.total,
                      pStep.carry
                    )
                  }
                >
                  Geç
                </Button>
                <Button
                  onClick={handleParallelStepSave}
                  disabled={pSaving}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {pSaving
                    ? t("entry.saving")
                    : pStep.index < pStep.total
                      ? t("action.saveAndContinue")
                      : t("action.save")}
                </Button>
              </DialogFooter>
            </>
          ) : pickerView ? (
            /* Perspektif seçici görünümü — aynı dialog içinde, üst üste dialog yok */
            <>
              <DialogHeader>
                <DialogTitle>{t("entry.pickParallel")}</DialogTitle>
                <DialogDescription>
                  Bu girdiyi hangi kategoride de takip etmek istersin?
                </DialogDescription>
              </DialogHeader>

              <ParallelPickList
                excludeCategoryId={entry.category.id}
                hiddenSubIds={hiddenSubIds}
                selected={newParallels}
                onAdd={(ps) => setNewParallels((prev) => [...prev, ps])}
                onRemove={(id) =>
                  setNewParallels((prev) => prev.filter((p) => p.id !== id))
                }
              />

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPickerView(false)}
                  disabled={saving}
                >
                  Geri
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setPickerView(false);
                    // Seçim varsa akış hemen başlar: düzenlemeler kaydedilir,
                    // her perspektif için adım formu açılır
                    if (newParallels.length) void handleSave();
                  }}
                >
                  {saving
                    ? t("entry.saving")
                    : newParallels.length
                      ? t("action.continue")
                      : t("action.gotIt")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
          <DialogHeader>
            <div className="flex items-start gap-2">
              {/* Başlığa dokunmak kalemin yapı sayfasına götürür — oradan
                  özellikleri, alt kalemleri, son girdileri ve analizi görülür */}
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  router.push(structureHref);
                }}
                className="group -m-1 flex min-w-0 flex-1 items-start gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-[var(--sf-2)]"
                aria-label={`${structureName} yapı sayfasına git`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: `${entry.category.color}cc` }}
                  >
                    {entry.category.name}
                  </span>
                  <DialogTitle className="truncate">{structureName}</DialogTitle>
                </span>
                <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
              </button>
              {/* Kapatma çarpısı sağ üstte — menü onun soluna */}
              <OptionsMenu
                className="mr-7"
                touched={
                  occurredAt.slice(0, 10) !== entryDate ||
                  totalParallels > 0 ||
                  aliases.length > 0 ||
                  isRegular
                }
                items={[
                  {
                    key: "time",
                    icon: Clock,
                    title: t("entry.time"),
                    subtitle: occurredAtLabel(occurredAt, entryDate, t("entry.time")),
                    active: panel === "time",
                    onSelect: () => togglePanel("time"),
                  },
                  {
                    key: "parallel",
                    icon: Link2,
                    title: t("entry.parallel"),
                    subtitle: totalParallels
                      ? `${totalParallels} perspektif`
                      : t("entry.alsoLog"),
                    active: panel === "parallel",
                    onSelect: () => togglePanel("parallel"),
                  },
                  {
                    key: "alias",
                    icon: Tags,
                    title: t("entry.aliases"),
                    subtitle: aliases.length
                      ? aliases.join(", ")
                      : t("entry.aliasesHint"),
                    active: panel === "alias",
                    onSelect: () => togglePanel("alias"),
                  },
                  {
                    key: "regular",
                    icon: Repeat,
                    title: t("entry.regular"),
                    subtitle: isRegular
                      ? t("entry.regularOn")
                      : t("entry.regularOff"),
                    active: panel === "regular",
                    onSelect: () => togglePanel("regular"),
                  },
                  {
                    key: "delete",
                    icon: Trash2,
                    title: t("entry.delete"),
                    subtitle: t("entry.deleteHint"),
                    tone: "destructive",
                    active: panel === "delete",
                    onSelect: () => togglePanel("delete"),
                  },
                ]}
              />
            </div>

            {/* Girdinin kayıtlı olduğu gün — dokununca o günün sayfası */}
            <Link
              href={`/calendar/${toLocalDateValue(entry.occurredAt)}`}
              onClick={() => onOpenChange(false)}
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card/60 py-1 pl-2.5 pr-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CalendarDays className="h-3 w-3" />
              {formatDateTime(entry.occurredAt)}
              <ChevronRight className="h-3 w-3 opacity-50" />
            </Link>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* ── Özellikler: modalın ana gövdesi ── */}
            {rows.map((row) => (
              <ModInput
                key={row.key}
                label={row.label}
                entryType={row.entryType}
                values={values[row.key] ?? []}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [row.key]: v }))
                }
                onRemove={() => handleRemove(row.key)}
                isShared={!!row.modId && siblingModIds.has(row.modId)}
                entryDate={entryDate}
                autoFocus={row.key === focusKey}
                tone={fieldTone}
                color={fieldColor}
              />
            ))}

            {/* Yerleşik akışların (uyku, ruh hali) alanları sabittir: havuzdan
                rastgele bir özellik eklemek bu formlara ait değil. Boşalan yer
                duygu ızgarasına gidiyor (bkz. ModInput gridHeight). */}
            {availableToAdd.length > 0 && fieldTone === "default" &&
              (addModOpen ? (
                <AddModPanel
                  mods={availableToAdd}
                  color={accent}
                  query={modQuery}
                  onQuery={setModQuery}
                  onPick={handleAddMod}
                  onClose={() => {
                    setAddModOpen(false);
                    setModQuery("");
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddModOpen(true)}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium text-foreground transition-all hover:brightness-125 active:scale-[0.99]"
                  style={{ background: `${accent}14`, borderColor: `${accent}40` }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${accent}2e`, color: accent }}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  {t("entry.addFeatureHere")}
                </button>
              ))}

            {/* ── Menüden açılan bölümler ── */}
            {panel === "time" && (
              <PanelBlock
                icon={Clock}
                title={t("entry.time")}
                onClose={() => setPanel(null)}
              >
                <DateTimeInput value={occurredAt} onChange={setOccurredAt} />
              </PanelBlock>
            )}

            {panel === "parallel" && (
              <PanelBlock
                icon={Link2}
                title={t("entry.parallel")}
                onClose={() => setPanel(null)}
              >
                <div className="flex flex-col gap-2">
                  {siblings.map((sib) => (
                    <div
                      key={sib.id}
                      className="flex items-center gap-3 rounded-xl border border-violet-500/50 bg-violet-500/10 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0 leading-tight">
                        <span className="text-xs text-muted-foreground">
                          {sib.catName}
                        </span>
                        <span className="text-xs text-muted-foreground mx-1">/</span>
                        <span className="text-sm font-medium">{sib.subName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSibling(sib)}
                        className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
                        aria-label={`${sib.subName} perspektifini sil`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {newParallels.map((ps) => (
                    <div
                      key={ps.id}
                      className="flex items-center gap-3 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0 leading-tight">
                        <span className="text-xs text-muted-foreground">
                          {ps.categoryName}
                        </span>
                        <span className="text-xs text-muted-foreground mx-1">/</span>
                        <span className="text-sm font-medium">
                          {ps.isCategoryRoot ? ps.categoryName : ps.name}
                        </span>
                        <span className="ml-1.5 text-[10px] text-violet-300/60">
                          kaydedince detayları sorulacak
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setNewParallels((prev) =>
                            prev.filter((p) => p.id !== ps.id)
                          )
                        }
                        className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                        aria-label={`${ps.name} paralel perspektifini kaldır`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickerView(true)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-500/30 py-2.5 text-sm font-medium text-violet-300/80 transition-colors hover:border-violet-500/50 hover:text-violet-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {totalParallels > 0 ? t("entry.anotherPerspective") : t("entry.pickPerspective")}
                  </button>
                </div>
              </PanelBlock>
            )}

            {panel === "alias" && (
              <PanelBlock
                icon={Tags}
                title={t("entry.aliases")}
                onClose={() => setPanel(null)}
              >
                <AliasEditor aliases={aliases} onChange={setAliases} />
              </PanelBlock>
            )}

            {panel === "regular" && (
              <PanelBlock
                icon={Repeat}
                title={t("entry.regular")}
                onClose={() => setPanel(null)}
              >
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-input px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {regularScopeName} düzenli kalem
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Kira, fatura gibi sabit kalemler analizlerde tek dokunuşla
                      hariç tutulabilir. Bu ayar tek girdiye değil,{" "}
                      <span className="text-foreground/80">
                        {regularScopeName}
                      </span>{" "}
                      altındaki tüm girdilere işler.
                    </p>
                  </div>
                  <Switch
                    checked={isRegular}
                    onCheckedChange={(v) =>
                      updateSubCategory(entry.subcategoryId, { isRegular: v })
                    }
                  />
                </div>
              </PanelBlock>
            )}

            {panel === "delete" && (
              <PanelBlock
                icon={Trash2}
                title={t("entry.delete")}
                onClose={() => setPanel(null)}
              >
                <div className="rounded-xl border border-destructive/30 bg-destructive/[0.07] p-3">
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {structureName}
                    </span>{" "}
                    girdisi değerleriyle birlikte kalıcı olarak silinecek.
                    {siblings.length > 0 &&
                      ` Its parallel perspectives (${siblings.length}) stay in place.`}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      variant="outline"
                      className="h-9 flex-1"
                      onClick={() => setPanel(null)}
                      disabled={deleting}
                    >
                      Vazgeç
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-9 flex-1"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        try {
                          await deleteEntry(entry.id);
                          onOpenChange(false);
                        } finally {
                          setDeleting(false);
                        }
                      }}
                    >
                      {deleting ? t("entry.deleting") : t("action.delete")}
                    </Button>
                  </div>
                </div>
              </PanelBlock>
            )}

            {/* ── Not — her zaman altta. Yerleşik akışta o akışın tonunda:
                 uyku formunun içinde tek başına nötr duran bir kutu kalmasın. ── */}
            <div className="border-t border-[var(--ln-1)] pt-3">
              <FieldLabel
                htmlFor="edit-entry-note"
                icon={NotebookPen}
                tone={fieldTone}
                color={fieldColor}
              >
                {t("entry.note")}
              </FieldLabel>
              <textarea
                id="edit-entry-note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("entry.notePlaceholder")}
                rows={2}
                className={cn(
                  "w-full resize-none rounded-xl border px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring",
                  fieldTone !== "default" && FIELD_TONES[fieldTone].shell,
                  fieldTone === "default" && !fieldColor && "bg-input"
                )}
                style={{
                  borderColor: fieldColor
                    ? colorSkin(fieldColor).shellBorder
                    : FIELD_TONES[fieldTone].shellBorder,
                  background: fieldColor
                    ? colorSkin(fieldColor).shellBg
                    : undefined,
                }}
              />
            </div>

            {/* Notlarda geçiyor — girdi tarafı backlink */}
            {entryBacklinks && entryBacklinks.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notlarda geçiyor
                  </span>
                </div>
                {entryBacklinks.map((n) => {
                  const label =
                    (n.title ?? "").trim() ||
                    n.blocks.map((b) => b.text.trim()).find(Boolean) ||
                    t("entry.note");
                  return (
                    <Link
                      key={n.id}
                      href={`/notes/${n.id}`}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-card/70"
                    >
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground/60">
                        {n.date.slice(5)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              İptal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? t("entry.saving")
                : newParallels.length > 0
                  ? t("action.saveAndContinue")
                  : t("action.save")}
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}

/**
 * Girdiye özellik ekleme — kartın İÇİNDE, butonun yerinde açılır.
 *
 * Önceden üstüne ikinci bir pencere açılıyordu (üst üste Dialog kırılgan) ve
 * her satırda ad + ölçü türü + birim + seçenekler yazıyordu: seçerken bakılan
 * şey yalnız ad, gerisi kalabalıktı. Artık havuzdaki gibi renkli atomlar —
 * aynı özellik her ekranda aynı renk ve simgeyle tanınıyor.
 */
function AddModPanel({
  mods,
  color,
  query,
  onQuery,
  onPick,
  onClose,
}: {
  mods: ModWithType[];
  color: string;
  query: string;
  onQuery: (q: string) => void;
  onPick: (modId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  // Tür filtresi — "süre gibi bir sayı mıydı, evet/hayır mı?" diye hatırlanan
  // özelliği adını bilmeden bulmak için. Yalnız havuzda olan türler çıkar.
  const [kind, setKind] = useState<MeasureUiKind | null>(null);
  const [kindOpen, setKindOpen] = useState(false);
  const kindRef = useRef<HTMLDivElement>(null);
  // Dışarı dokununca / Esc ile kapanır. Radix Select yerine elle: liste
  // Dialog'un içinde, kutunun üstünde açılıyor — portal ve odak tuzağı gerekmiyor
  useEffect(() => {
    if (!kindOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!kindRef.current?.contains(e.target as Node)) setKindOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setKindOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [kindOpen]);
  const kinds = MEASURE_UI_KINDS.filter((k) =>
    mods.some((m) => uiKindOf(m.entryType) === k)
  );
  const q = query.trim().toLocaleLowerCase("tr");
  const shown = mods.filter(
    (m) =>
      (!q || m.name.toLocaleLowerCase("tr").includes(q)) &&
      (!kind || uiKindOf(m.entryType) === kind)
  );
  const skin = colorSkin(color);
  const KindIcon = kind ? MEASURE_KIND_META[kind].icon : null;
  return (
    <div className="animate-in flex flex-col gap-1.5">
      {/* Başlık kutunun dışında, formdaki diğer alanların başlığıyla aynı:
          seçici de bir alan gibi okunuyor, "+" ne yapıldığını söylüyor */}
      <div className="flex items-center justify-between">
        <FieldLabel icon={Plus} tone="default" color={color}>
          {t("entry.addFeatureHere")}
        </FieldLabel>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className="rounded-md p-0.5 text-muted-foreground/40 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className="relative rounded-2xl border p-3"
        style={{ background: skin.shellBg, borderColor: skin.shellBorder }}
      >
        {/* Arama + tür filtresi tek satırda: filtre ayrı bir çip sırası
            olunca kutunun üstü kalabalıklaşıyordu. Tür listesi hapın altında,
            ızgaranın üstüne açılıyor — telefonun kendi seçim penceresi
            uygulamanın diliyle uyuşmuyordu. */}
        {(mods.length > 8 || kinds.length > 1) && (
          // Çerçeve dış kutuda, yazı alanı esnek: kapsül türün tam adı kadar
          // uzayabiliyor ve yazılan metin onun altına girmiyor
          <div className="relative mb-2 flex h-9 items-center gap-1 rounded-lg border border-border bg-input pl-9 pr-1 transition-colors focus-within:ring-2 focus-within:ring-ring">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={t("features.search")}
              className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 focus-visible:ring-0"
            />
            {kinds.length > 1 && (
              <div ref={kindRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setKindOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={kindOpen}
                  aria-label={t("measure.howMeasured")}
                  className="flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--ln-2)] px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  style={
                    kind
                      ? { background: `${color}2e`, borderColor: `${color}66`, color }
                      : undefined
                  }
                >
                  {KindIcon && <KindIcon className="h-3 w-3 shrink-0" />}
                  {kind ? t(MEASURE_KIND_META[kind].labelKey) : t("features.allKinds")}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0 opacity-70 transition-transform",
                      kindOpen && "rotate-180"
                    )}
                  />
                </button>

                {kindOpen && (
                  <div
                    role="listbox"
                    className="animate-in absolute right-0 top-[calc(100%+8px)] z-20 w-[190px] rounded-[14px] border border-border bg-card p-1 shadow-2xl"
                  >
                    {[null, ...kinds].map((k) => {
                      const on = k === kind;
                      const Icon = k ? MEASURE_KIND_META[k].icon : LayoutGrid;
                      const n = k
                        ? mods.filter((m) => uiKindOf(m.entryType) === k).length
                        : mods.length;
                      return (
                        <button
                          key={k ?? "all"}
                          type="button"
                          role="option"
                          aria-selected={on}
                          onClick={() => {
                            setKind(k);
                            setKindOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors",
                            !on && "hover:bg-[var(--sf-2)]"
                          )}
                          style={on ? { background: `${color}1f` } : undefined}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                            style={{
                              background: on ? `${color}33` : "var(--sf-2)",
                              color: on ? color : undefined,
                            }}
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-[12px] font-medium"
                            style={on ? { color } : undefined}
                          >
                            {k ? t(MEASURE_KIND_META[k].labelKey) : t("features.allKinds")}
                          </span>
                          <span className="text-[10.5px] tabular-nums text-muted-foreground/60">
                            {n}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sabit yükseklik: süzgeç ya da arama sonucu daralınca kutu ve
            altındaki form zıplamasın. Boş sonuç mesajı da bu alanın içinde. */}
        <div className="h-[244px] overflow-y-auto overscroll-contain">
          {shown.length > 0 ? (
            <div className="grid grid-cols-4 gap-x-1 gap-y-0.5">
              {shown.map((m) => (
                <ModAtom
                  key={m.id}
                  icon={modAtomIcon(m)}
                  name={m.name}
                  color={modColor(m)}
                  onClick={() => onPick(m.id)}
                />
              ))}
            </div>
          ) : (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground/70">
              {t("entry.noFeatureMatch")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Alan etiketi — küçük sembol + seyrek harfli büyük yazı.
 *
 * Yerleşik akışlarda (uyku, ruh hali) bütün alanlar bu biçimde: "Sleep
 * Duration", "Sleep Quality" ve "Not" farklı boy ve ağırlıklarda yazılınca
 * form üç ayrı dilde konuşuyordu. Sembol özelliğin kendi atom simgesi
 * (modAtomIcon — ay, yıldız, kalp), rengi de akışın tonu.
 */
function FieldLabel({
  icon: Icon,
  tone,
  color,
  htmlFor,
  children,
}: {
  icon: LucideIcon;
  tone: FieldTone;
  /** Sabit ton yerine serbest renk — sıradan girdide kategori rengi */
  color?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        !color &&
          (tone === "default"
            ? "text-muted-foreground/50"
            : FIELD_TONES[tone].caption)
      )}
      style={color ? { color: colorSkin(color).caption } : undefined}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {children}
    </label>
  );
}

/**
 * Tek özelliğin giriş satırı.
 *
 * Değer DİZİ: çok seçimli özellikler (ruh halindeki duygular) aynı satırda
 * birden çok değer taşıyor. Tek değerli türler dizinin ilk elemanını okuyup
 * tek elemanlı dizi yazıyor — çağıran taraf iki ayrı yol tutmuyor.
 */
function ModInput({
  label,
  entryType,
  values,
  onChange,
  onRemove,
  isShared = false,
  entryDate,
  autoFocus = false,
  tone = "default",
  color,
}: {
  label: string;
  entryType: EntryType;
  values: string[];
  onChange: (v: string[]) => void;
  onRemove?: () => void;
  isShared?: boolean;
  entryDate?: string;
  /** Yeni eklenen özellik: alan görünüme kaydırılır, yazı alanları odaklanır */
  autoFocus?: boolean;
  /** Yerleşik akışın rengi — uyku ve ruh hali alanları kendi penceresinde */
  tone?: FieldTone;
  /** Sıradan girdilerde kategori rengi; alan penceresi bununla boyanır */
  color?: string;
}) {
  const t = useT();
  const vt = entryType.valueType ?? "number";
  const today = toLocalDateValue();
  const value = values[0] ?? "";
  const setOne = (v: string) => onChange(v === "" ? [] : [v]);
  // Ruh halindeki duygular: sayısal OLMAYAN seçenekli özellik. Ekleme
  // penceresi de aynı kuralla ayırıyor (sayısal seçenekler = mutluluk skalası).
  const isEmotionRow =
    tone === "mood" && vt === "select" && !isNumericChoiceSet(entryType.choices);
  const scrolledRef = useRef(false);
  const scrollOnMount = (el: HTMLDivElement | null) => {
    if (el && autoFocus && !scrolledRef.current) {
      scrolledRef.current = true;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  return (
    <div className="flex flex-col gap-1.5" ref={scrollOnMount}>
      <div className="flex items-center justify-between">
        <FieldLabel
          icon={modAtomIcon({ name: label, entryType })}
          tone={tone}
          color={color}
        >
          {label}
          {entryType.unit && ` (${entryType.unit})`}
        </FieldLabel>
        <div className="flex items-center gap-2">
          {isShared && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400/70">
              <Link2 className="h-3 w-3" />
              tüm perspektifler
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label={t("entry.removeFromEntry")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sayı/metin/evet-hayır: renk verilmişse alan kendi penceresinde ve
          kategori renginde — uyku/ruh hali formlarındaki iskeletin sıradan
          girdideki karşılığı. Renk yoksa (paralel adım) eski düz kutular. */}
      {vt === "number" &&
        (color ? (
          <FieldWindow color={color}>
            <div className="px-4 pb-3 pt-2.5">
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setOne(e.target.value)}
                placeholder="0"
                step="any"
                autoFocus={autoFocus}
                className="w-full bg-transparent text-xl font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30"
              />
            </div>
          </FieldWindow>
        ) : (
          <Input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setOne(e.target.value)}
            placeholder="0"
            step="any"
            autoFocus={autoFocus}
          />
        ))}

      {vt === "text" &&
        (color ? (
          <FieldWindow color={color}>
            <div className="px-4 pb-3 pt-2.5">
              <input
                value={value}
                onChange={(e) => setOne(e.target.value)}
                placeholder={t("entry.textPlaceholder")}
                autoFocus={autoFocus}
                className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </FieldWindow>
        ) : (
          <Input
            value={value}
            onChange={(e) => setOne(e.target.value)}
            placeholder={t("entry.textPlaceholder")}
            autoFocus={autoFocus}
          />
        ))}

      {vt === "boolean" &&
        (color ? (
          <FieldWindow color={color}>
            <div className="px-4 pb-3 pt-2.5">
              <button
                type="button"
                onClick={() => setOne(value === "true" ? "false" : "true")}
                className="flex h-10 w-full items-center justify-center rounded-xl border text-sm font-semibold transition-colors"
                style={
                  value === "true"
                    ? {
                        borderColor: colorSkin(color).shellBorder,
                        background: colorSkin(color).fieldBg,
                        color,
                      }
                    : {
                        borderColor: colorSkin(color).fieldBorder,
                        color: "var(--muted-foreground)",
                      }
                }
              >
                {value === "true" ? t("entry.yes") : t("entry.no")}
              </button>
            </div>
          </FieldWindow>
        ) : (
          <button
            type="button"
            onClick={() => setOne(value === "true" ? "false" : "true")}
            className={cn(
              "flex h-10 w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors",
              value === "true"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-input text-muted-foreground"
            )}
          >
            {value === "true" ? t("entry.yes") : t("entry.no")}
          </button>
        ))}

      {/* Duygular: ekleme penceresindekinin AYNI bileşeni — ızgara sabit,
          yoğunluk çubukları altta toplanıyor. İki yerde iki ayrı duygu
          arayüzü tutmak, birinde yapılan her düzeltmeyi ötekinde unutmak
          demekti. */}
      {vt === "select" && isEmotionRow ? (
        <FieldWindow tone="mood">
          <EmotionPicker
            choices={entryType.choices ?? []}
            values={values}
            onChange={onChange}
            /* "Özellik ekle" satırı ruh halinde gizli; boşalan yer buraya.
               Ekleme penceresinden yüksek ama son satırı yarıda kesiyor:
               ızgara kendi içinde kayıyor ve modalın tamamını uzatmıyor.
               Tamamını sığdıran bir yükseklik denendi, o zaman da alan
               kaydırılamaz oluyordu. */
            gridHeight={272}
          />
        </FieldWindow>
      ) : null}

      {/* Mutluluk skalası: rakam değil yüz — ekleme penceresiyle aynı bileşen */}
      {vt === "select" && !isEmotionRow && tone === "mood" ? (
        <FieldWindow
          tone="mood"
          caption={t("mood.levelPrompt")}
          footer={
            <span className="text-xs text-muted-foreground/50">
              {t("mood.levelHint")}
            </span>
          }
        >
          <MoodScale
            choices={entryType.choices ?? []}
            value={value}
            onChange={setOne}
          />
        </FieldWindow>
      ) : null}

      {vt === "select" &&
        !isEmotionRow &&
        tone !== "mood" &&
        (tone === "sleep" ? (
          <ChoiceWindow
            choices={entryType.choices ?? []}
            value={value}
            onChange={setOne}
            captionKey="field.scale"
            hintKey="sleep.qualityHint"
            tone={tone}
          />
        ) : (
          <ChoiceButtons
            choices={entryType.choices ?? []}
            value={value}
            onChange={setOne}
            color={color}
          />
        ))}

      {vt === "datetime-range" && (
        <DateTimeRangeInput
          value={value}
          onChange={setOne}
          entryDate={entryDate ?? today}
          tone={tone}
          color={color}
        />
      )}
    </div>
  );
}

/**
 * Seçenek düğmeleri — renk verilmişse pencere içinde ve kategori renginde.
 *
 * Seçili düğmenin rengi satır içi: sınıfla verilen kenarlık rengi
 * globals.css'teki katmansız `*` kuralı yüzünden uygulanmıyor (bkz.
 * sleep-card), ayrıca kategori rengi çalışma anında belli oluyor.
 */
function ChoiceButtons({
  choices,
  value,
  onChange,
  color,
}: {
  choices: string[];
  value: string;
  onChange: (v: string) => void;
  color?: string;
}) {
  const cs = color ? colorSkin(color) : null;
  const row = (
    <div className={cn("flex flex-wrap gap-2", cs && "px-4 pb-3.5 pt-2.5")}>
      {choices.map((choice) => {
        // Değer yoğunluk taşıyabilir ("Happy|70"); eşleşme etikete bakar,
        // seçili olan yeniden tıklanırsa yoğunluk korunur
        const { label: picked, level } = splitChoiceLevel(value);
        const on = picked === choice;
        return (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(on ? value : choice)}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
              !cs &&
                (on
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-input text-muted-foreground hover:text-foreground"),
              cs && !on && "text-muted-foreground hover:text-foreground"
            )}
            style={
              cs
                ? on
                  ? {
                      borderColor: cs.shellBorder,
                      background: cs.fieldBg,
                      color: color,
                    }
                  : { borderColor: cs.fieldBorder }
                : undefined
            }
          >
            {choice}
            {on && level !== null && (
              <span className="ml-1.5 text-xs opacity-70">%{level}</span>
            )}
          </button>
        );
      })}
    </div>
  );
  return cs ? <FieldWindow color={color}>{row}</FieldWindow> : row;
}
