"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  Link2,
  NotebookPen,
  Plus,
  Repeat,
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
import { SHORT_MONTHS } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import { AliasEditor } from "@/components/notes/alias-editor";
import {
  DateTimeInput,
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import { ParallelPickList } from "@/components/forms/parallel-pick-dialog";
import {
  cn,
  formatDateTime,
  toLocalDateTimeValue,
  toLocalDateValue,
} from "@/lib/utils";
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";
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

  // Satır anahtarı: isimli mod değerleri için modId, girdiye özel ölçüler için "t:<typeId>"
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of entry.values) {
      if (v.entryTypeId) init[v.modId ?? `t:${v.entryTypeId}`] = v.value;
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

  // Modal kapanınca adım akışı sıfırlanır (component EntryCard'da hep mount)
  useEffect(() => {
    if (!open) {
      setPStep(null);
      setPQueue([]);
      setPValues({});
      setNewParallels([]);
      setPickerView(false);
    }
  }, [open]);

  const pValueKey = (m: CategoryModifierWithType) => m.modId ?? m.id;
  const pSharedKey = (m: CategoryModifierWithType) => m.modId ?? m.entryTypeId;

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
      const typeValues: { entryTypeId: string; value: string; modId?: string }[] = [];
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
    if (!confirm(`Delete the "${sib.subName}" perspective and its entry?`)) return;
    await deleteEntry(sib.id);
  }

  const [addModOpen, setAddModOpen] = useState(false);
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
    entryTypeId: string;
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
      if (!v.modId || !v.entryTypeId) continue;
      if (removedKeys.has(v.modId) || seen.has(v.modId)) continue;
      const t = v.entryType ?? entryTypeMap.get(v.entryTypeId);
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
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setEntryAliases(entry.id, aliases);
      const typeValues = rows
        .filter((r) => (values[r.key] ?? "") !== "")
        .map((r) => ({
          entryTypeId: r.entryTypeId,
          modId: r.modId,
          value: values[r.key],
        }));
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
        for (const tv of typeValues) carry[tv.modId ?? tv.entryTypeId] = tv.value;
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
                        value={pValues[pValueKey(m)] ?? ""}
                        onChange={(v) =>
                          setPValues((prev) => ({
                            ...prev,
                            [pValueKey(m)]: v,
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
                className="group -m-1 flex min-w-0 flex-1 items-start gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-white/5"
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
                value={values[row.key] ?? ""}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [row.key]: v }))
                }
                onRemove={() => handleRemove(row.key)}
                isShared={!!row.modId && siblingModIds.has(row.modId)}
                entryDate={entryDate}
                autoFocus={row.key === focusKey}
              />
            ))}

            {availableToAdd.length > 0 && (
              <button
                type="button"
                onClick={() => setAddModOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Bu girdiye özellik ekle
              </button>
            )}

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

            {/* ── Not — her zaman altta ── */}
            <div className="border-t border-white/[0.06] pt-3">
              <label
                htmlFor="edit-entry-note"
                className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50"
              >
                <NotebookPen className="h-3 w-3" />
                Not
              </label>
              <textarea
                id="edit-entry-note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("entry.notePlaceholder")}
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
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

      {/* Add-mod picker — sibling dialog to avoid nesting issues */}
      <Dialog open={addModOpen} onOpenChange={setAddModOpen}>
        <DialogContent className="gap-4 max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Bu girdiye özellik ekle
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                Yalnızca bu girdi için geçerli olacak
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {availableToAdd.map((m) => (
              <button
                key={m.id}
                onClick={() => handleAddMod(m.id)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{m.name}</div>
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
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModInput({
  label,
  entryType,
  value,
  onChange,
  onRemove,
  isShared = false,
  entryDate,
  autoFocus = false,
}: {
  label: string;
  entryType: EntryType;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  isShared?: boolean;
  entryDate?: string;
  /** Yeni eklenen özellik: alan görünüme kaydırılır, yazı alanları odaklanır */
  autoFocus?: boolean;
}) {
  const t = useT();
  const vt = entryType.valueType ?? "number";
  const today = toLocalDateValue();
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
        <label className="text-sm font-medium">
          {label}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {label !== entryType.name && `${entryType.name} `}
            {entryType.unit && `(${entryType.unit})`}
          </span>
        </label>
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

      {vt === "number" && (
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          step="any"
          autoFocus={autoFocus}
        />
      )}

      {vt === "text" && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("entry.textPlaceholder")}
          autoFocus={autoFocus}
        />
      )}

      {vt === "boolean" && (
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "false" : "true")}
          className={cn(
            "flex h-10 w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors",
            value === "true"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-input text-muted-foreground"
          )}
        >
          {value === "true" ? t("entry.yes") : t("entry.no")}
        </button>
      )}

      {vt === "select" && (
        <div className="flex flex-wrap gap-2">
          {(entryType.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(choice)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                value === choice
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-input text-muted-foreground hover:text-foreground"
              )}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {vt === "datetime-range" && (
        <DateTimeRangeInput
          value={value}
          onChange={onChange}
          entryDate={entryDate ?? today}
        />
      )}
    </div>
  );
}
