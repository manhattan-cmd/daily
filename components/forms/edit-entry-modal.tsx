"use client";

import { createElement, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Link2,
  NotebookPen,
  Plus,
  Repeat,
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
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import {
  ENTRY_WINDOW_COMPACT,
  ENTRY_WINDOW_FOOTER,
  ENTRY_WINDOW_LARGE,
} from "@/components/ui/entry-window";
import { NoteEditorView, NotePreview } from "@/components/forms/note-editor";
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
  listMods,
  listRecentModValues,
  updateSubCategory,
  type CategoryModifierWithType,
  type ModWithType,
  type ParallelSub,
} from "@/lib/db/queries";
import { Switch } from "@/components/ui/switch";
import { OptionsMenu, PanelBlock } from "@/components/forms/form-options";
import { isNumericChoiceSet, SHORT_MONTHS } from "@/lib/analytics";
import { modAtomIcon } from "@/components/structure/mod-atom";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import {
  DateTimeInput,
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import { ParallelPickList } from "@/components/forms/parallel-pick-dialog";
import { ToggleSwitch } from "@/components/ui/scale-input";
import { ScaleSlider } from "@/components/ui/scale-slider";
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
import { routes } from "@/lib/routes";
import { LedgerField } from "@/components/forms/ledger-field";
import { EntryTime } from "@/components/forms/entry-time";
import { SmartText } from "@/components/ui/smart-text";
import { SymbolIcon } from "@/lib/icons";
import { modColor } from "@/lib/mod-color";

interface EditEntryModalProps {
  entry: EntryWithContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NO_RECENT: Record<string, string[]> = {};

/** Başlık menüsünden açılan bölümler — aynı anda yalnız biri açık kalır */
type Panel = "time" | "parallel" | "regular" | "delete";

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
  // Pencerenin rengi — yerleşiklerde akışın rengi (ekleme penceresiyle aynı),
  // sıradanda kategorinin; renksizse uygulamanın moru
  const accent =
    fieldTone === "sleep"
      ? "#8b5cf6"
      : fieldTone === "mood"
        ? "#f472b6"
        : (fieldColor ?? "#818cf8");
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
  // Pencere bunlar gelince açılır (bkz. aşağıdaki Dialog). Alt kategori bu
  // listede değil: silinmişse sorgu hiç dolmaz, pencere hiç açılmazdı.
  const ready =
    mods !== undefined && allEntryTypes !== undefined && poolMods !== undefined;

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
  // Not yazma görünümü — formun yerine aynı pencerede (bkz. note-editor)
  const [noteOpen, setNoteOpen] = useState(false);

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
      setNoteOpen(false);
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
    ? routes.structureCategory(entry.category.id)
    : routes.structureSub(entry.category.id, entry.subcategoryId);
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


  const entryDate = toLocalDateValue(entry.occurredAt);
  /** Zaman seçeneklerinde Dün / Şimdi / Yarın bugüne göre */
  const todayDate = toLocalDateValue();
  // Her girdi açık defter görünümünde — uyku ve ruh hali de (ekleme
  // pencereleriyle aynı dil); ruh halinin yüzleri ve duyguları kutuya
  // kendi girişi olarak konur
  const isLedger = !pStep && !pickerView;
  const isBuiltInTone = fieldTone !== "default";
  const recent =
    useLiveQuery(() => listRecentModValues(entry.subcategoryId), [entry.subcategoryId]) ??
    NO_RECENT;
  const attachedModIds = useMemo(
    () => new Set((mods ?? []).map((m) => m.modId).filter((x): x is string => !!x)),
    [mods]
  );
  /** Satırı açık defter kutusunun beklediği biçime çevir */
  const rowAsMod = (r: Row) =>
    ({
      id: r.key,
      modId: r.modId,
      entryTypeId: r.entryTypeId,
      name: r.label,
      entryType: r.entryType,
      mod: r.modId ? poolModMap.get(r.modId) : undefined,
    }) as unknown as CategoryModifierWithType;

  function handleRemove(key: string) {
    setRemovedKeys((prev) => new Set([...prev, key]));
  }

  /** Özellik ekleme penceresinden gelenler — yalnız bu girdiye (yapıya
   *  bağlanmaz). Çarpıyla kaldırılmış biri seçilirse geri gelir. */
  function handleAddMods(modIds: string[]) {
    if (modIds.length === 0) return;
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      modIds.forEach((id) => next.delete(id));
      return next;
    });
    setExtraModIds((prev) => [
      ...prev,
      ...modIds.filter((id) => !prev.includes(id)),
    ]);
    setFocusKey(modIds[0]);
  }

  async function handleSave() {
    setSaving(true);
    try {
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

  // Menüden açılan bölümler (perspektif, düzenli, sil) — iki görünüm de kullanır
  const panels = (
    <>
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

    </>
  );

  return (
    <>
      {/* İçeriği belirleyen listeler gelene kadar pencere görünmez: kart
          pencereyi artık dokununca yüklüyor, sorgular gelmeden açılırsa önce
          boş görünüp sonra dolardı. Bekleme birkaç on ms. */}
      <Dialog open={open && ready} onOpenChange={onOpenChange}>
        <DialogContent
          hideClose={isLedger}
          className={cn(
            // Ruh hali Ekle menüsündeki gibi büyük pencerede; diğerleri kısa
            fieldTone === "mood" ? ENTRY_WINDOW_LARGE : ENTRY_WINDOW_COMPACT,
            "gap-5",
            // Açık defter görünümü: kap kaymaz, gövde kendi içinde kayar
            // (zamanın "Özel" penceresi kabı kaplar)
            isLedger && "h-[min(660px,calc(100dvh-3rem))] gap-0 overflow-hidden p-0"
          )}
        >
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

              <DialogFooter className={ENTRY_WINDOW_FOOTER}>
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

              <DialogFooter className={ENTRY_WINDOW_FOOTER}>
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
          ) : isLedger ? (
            /*
              SIRADAN GİRDİNİN DÜZENLEMESİ — ekleme formunun dili: başlıkta
              kalemin karosu, yolu ve adı; altında zaman hapı; gövde açık
              defter (aynı LedgerField kutuları, aynı kurallar); altta not ve
              Kaydet. Başlık ve alt düğmeler sabit, yalnız gövde kayar.
              Uyku ve ruh hali de burada: renkleri akışın rengi, ruh halinin
              yüzleri ve duygu ızgarası kutunun kendi girişi.
            */
            <div className="relative flex min-h-0 flex-1 flex-col">
              <DialogTitle className="sr-only">{structureName}</DialogTitle>
              {/* Tepede kategorinin renginde ışık */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
                style={{
                  background: `radial-gradient(120% 90% at 15% 0%, ${accent}40 0%, ${accent}14 45%, transparent 75%)`,
                }}
              />
              {/* Üst şerit — seçenekler solda, kapat sağda */}
              <div className="flex h-12 shrink-0 items-center justify-between px-3 pt-1.5">
                <OptionsMenu
                  align="left"
                  touched={totalParallels > 0 || isRegular}
                  items={[
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
                      key: "regular",
                      icon: Repeat,
                      title: t("entry.regular"),
                      subtitle: isRegular ? t("entry.regularOn") : t("entry.regularOff"),
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
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label={t("action.close")}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sf-2)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-3)] active:scale-95"
                >
                  <X className="h-[17px] w-[17px]" />
                </button>
              </div>

              {/* Başlık — karo, yol, ad (dokununca kalemin yapı sayfası), zaman */}
              <div className="flex shrink-0 items-start gap-3 px-4 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(structureHref);
                  }}
                  aria-label={`${structureName} yapı sayfasına git`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] transition-transform active:scale-95"
                  style={{
                    backgroundColor: accent,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
                  }}
                >
                  <SymbolIcon
                    name={entry.subcategory.isCategoryRoot ? entry.category.icon : entry.subcategory.icon}
                    size={22}
                    style={{ color: "#fff" }}
                  />
                </button>
                <div className="min-w-0 flex-1 leading-tight">
                  <SmartText
                    text={entry.subcategory.isCategoryRoot ? t("entry.general") : entry.category.name}
                    className="text-[12px] font-medium text-muted-foreground"
                  />
                  <SmartText
                    text={structureName}
                    lines={2}
                    className="text-[19px] font-bold leading-6 tracking-tight"
                  />
                  <EntryTime
                    occurredAt={occurredAt}
                    onChange={setOccurredAt}
                    baseDate={todayDate}
                    accent={accent}
                  />
                </div>
              </div>

              {/* Gövde — açık defter */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4">
                <div className="relative ml-[22px] flex flex-col gap-2 pl-3">
                  <span
                    aria-hidden
                    className="absolute -top-2.5 bottom-4 left-0 w-[2px] -translate-x-1/2 rounded-full"
                    style={{ background: `${accent}59` }}
                  />
                  {rows.map((row) => {
                    const m = rowAsMod(row);
                    const rowVals = values[row.key] ?? [];
                    const setRow = (v: string) =>
                      setValues((prev) => ({ ...prev, [row.key]: v === "" ? [] : [v] }));
                    // Ruh hali: sayısal seçenek = mutluluk yüzleri, değilse duygular
                    const moodSelect =
                      fieldTone === "mood" && (row.entryType.valueType ?? "number") === "select";
                    const emotionRow = moodSelect && !isNumericChoiceSet(row.entryType.choices);
                    return (
                      <LedgerField
                        key={row.key}
                        mod={m}
                        icon={modAtomIcon({ name: row.label, entryType: row.entryType })}
                        color={isBuiltInTone ? accent : modColor(m.mod ?? { name: row.label })}
                        filled={moodSelect ? rowVals.length > 0 : undefined}
                        custom={
                          emotionRow ? (
                            <EmotionPicker
                              choices={row.entryType.choices ?? []}
                              values={rowVals}
                              onChange={(vs) => setValues((prev) => ({ ...prev, [row.key]: vs }))}
                              gridHeight={400}
                            />
                          ) : moodSelect ? (
                            <>
                              <MoodScale
                                choices={row.entryType.choices ?? []}
                                value={rowVals[0] ?? ""}
                                onChange={setRow}
                              />
                              {(m.mod?.scaleLabels?.low || m.mod?.scaleLabels?.high) && (
                                <div className="-mt-1.5 flex justify-between px-4 pb-3 text-[11.5px] font-medium text-muted-foreground">
                                  <span>{m.mod?.scaleLabels?.low}</span>
                                  <span>{m.mod?.scaleLabels?.high}</span>
                                </div>
                              )}
                            </>
                          ) : undefined
                        }
                        value={rowVals[0] ?? ""}
                        onChange={(v) =>
                          setValues((prev) => ({ ...prev, [row.key]: v === "" ? [] : [v] }))
                        }
                        recent={recent[row.modId ?? row.entryTypeId ?? ""] ?? []}
                        entryDate={entryDate}
                        entryOnly={!!row.modId && !attachedModIds.has(row.modId)}
                        dense={rows.length >= 5}
                        onRemove={isBuiltInTone ? undefined : () => handleRemove(row.key)}
                        autoFocus={row.key === focusKey}
                      />
                    );
                  })}
                  {/* Yerleşik akışların özellikleri sabit — havuzdan ekleme yok */}
                  {!isBuiltInTone && (
                  <button
                    type="button"
                    onClick={() => setAddModOpen(true)}
                    className="flex h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    {t("entry.addFeature")}
                  </button>
                  )}
                </div>

                {panels}

                {/* Not — tam genişlik, ilk üç satırı okunur */}
                <div className="mt-4 flex shrink-0 flex-col gap-1.5">
                  <div className="px-1 text-[12px] font-semibold text-muted-foreground">
                    {t("entry.note")}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoteOpen(true)}
                    className="flex min-h-[76px] w-full items-start gap-2.5 rounded-2xl bg-[var(--sf-1)] px-3.5 py-3 text-left ring-1 ring-inset ring-[var(--ln-1)] transition-colors hover:bg-[var(--sf-2)]"
                  >
                    <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span
                      className={cn(
                        "line-clamp-3 min-w-0 whitespace-pre-wrap break-words text-[14px] leading-5",
                        notes ? "text-foreground" : "text-muted-foreground/70"
                      )}
                    >
                      {notes || t("entry.notePlaceholder")}
                    </span>
                  </button>
                </div>
              </div>

              {/* Alt — vazgeç ve kaydet (kalemin renginde) */}
              <div
                className="grid shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-[var(--ln-1)] px-4 pt-3"
                style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" }}
              >
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                  className="h-12 rounded-2xl bg-[var(--sf-2)] px-5 text-[14px] font-semibold text-foreground/85 transition-colors hover:bg-[var(--sf-3)]"
                >
                  {t("action.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-60"
                  style={{ background: accent }}
                >
                  {!saving && <Check className="h-5 w-5" strokeWidth={2.75} />}
                  {saving
                    ? t("entry.saving")
                    : newParallels.length > 0
                      ? t("action.saveAndContinue")
                      : t("action.save")}
                </button>
              </div>

              {noteOpen && (
                <NoteEditorView
                  value={notes}
                  onChange={setNotes}
                  onDone={() => setNoteOpen(false)}
                  subtitle={structureName}
                  accent={accent}
                  className="absolute inset-0 z-20 bg-background px-5 pb-6 pt-5"
                />
              )}
            </div>
          ) : (
            <>
          {noteOpen && (
            <NoteEditorView
              value={notes}
              onChange={setNotes}
              onDone={() => setNoteOpen(false)}
              subtitle={structureName}
              accent={fieldColor}
              className="pb-6"
            />
          )}
          {/* Not yazılırken form gizlenir ama kurulu kalır — dönünce her şey
              bıraktığı gibi (açık panel, girilen değerler) */}
          <div className={cn("contents", noteOpen && "hidden")}>
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
              href={routes.day(toLocalDateValue(entry.occurredAt))}
              onClick={() => onOpenChange(false)}
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card/60 py-1 pl-2.5 pr-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CalendarDays className="h-3 w-3" />
              {formatDateTime(entry.occurredAt)}
              <ChevronRight className="h-3 w-3 opacity-50" />
            </Link>
          </DialogHeader>

          {/* flex-1: pencere sabit boyda; artan yer not kutusuna gider (aşağıda),
              not ile Kaydet arasında boşluk kalmaz */}
          <div className="flex flex-1 flex-col gap-4">
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
            {/* Girdiye özel ekleme — uygulamanın her yerindeki özellik ekleme
                penceresi (yalnız bu girdi modunda). Eskiden burada kartın
                içinde açılan ayrı, eski bir seçici vardı. */}
            {fieldTone === "default" && (
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

            {panels}

            {/* ── Not — her zaman altta. Yerleşik akışta o akışın tonunda:
                 uyku formunun içinde tek başına nötr duran bir kutu kalmasın.
                 Pencerede artan yeri doldurur (flex-1): kısa bir girdide
                 Kaydet'le arasında boşluk yerine daha geniş bir not kutusu. ── */}
            <div className="flex flex-1 flex-col border-t border-[var(--ln-1)] pt-3">
              <FieldLabel
                htmlFor="edit-entry-note"
                icon={NotebookPen}
                tone={fieldTone}
                color={fieldColor}
              >
                {t("entry.note")}
              </FieldLabel>
              <NotePreview
                id="edit-entry-note"
                value={notes}
                onOpen={() => setNoteOpen(true)}
                className={cn(
                  "py-2",
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
          </div>

          <DialogFooter className={ENTRY_WINDOW_FOOTER}>
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
          </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ModPickDialog
        open={addModOpen}
        onOpenChange={setAddModOpen}
        targetType="subcategory"
        targetId={entry.subcategory.id}
        targetName={structureName}
        persist={false}
        excludeModIds={rows
          .map((r) => r.modId)
          .filter((x): x is string => !!x)}
        onPicked={(picked) => handleAddMods(picked.map((m) => m.id))}
      />
    </>
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
/** Yerleşik akışların sabit rengi — alanlar (anahtar, şerit) bununla boyanır */
const TONE_COLOR: Record<FieldTone, string> = {
  default: "#6366f1",
  sleep: "#8b5cf6",
  mood: "#f472b6",
};

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

  // Ruh halinde başlık kutunun İÇİNDE (ekleme penceresindeki gibi): dışarıda
  // ayrı bir başlık satırı iki kutuya ~60 px ekliyor, duygu ızgarası pencereye
  // kaydırmadan sığmıyordu. Yerleşik özellik olduğu için çıkarma çarpısı da yok.
  const captionInside = tone === "mood" && !isShared;
  // Alanın rengi: sıradan girdide kategori, uykuda mor, ruh halinde pembe
  const fieldColor = color ?? TONE_COLOR[tone];

  // Evet/hayır TEK SATIR: simge + ad + anahtar. Eskiden başlık + tam
  // genişlikte "Evet/Hayır" düğmesiydi; birkaç tanesi alt alta gelince form
  // özellik değil dağınık düğmeler gibi duruyordu.
  if (vt === "boolean") {
    const on = value === "true";
    return (
      <div
        ref={scrollOnMount}
        className="flex items-center gap-3 rounded-2xl py-2.5 pl-3 pr-2 transition-colors"
        style={{
          background: `${fieldColor}${on ? "1a" : "0d"}`,
          boxShadow: `inset 0 0 0 1px ${fieldColor}${on ? "59" : "2e"}`,
        }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${fieldColor}26`, color: fieldColor }}
        >
          {createElement(modAtomIcon({ name: label, entryType }), {
            className: "h-4 w-4",
            strokeWidth: 2,
          })}
        </span>
        <button
          type="button"
          onClick={() => setOne(on ? "false" : "true")}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
        >
          {label}
        </button>
        <ToggleSwitch
          checked={on}
          onChange={(v) => setOne(v ? "true" : "false")}
          color={fieldColor}
          label={label}
        />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
            aria-label={t("entry.removeFromEntry")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" ref={scrollOnMount}>
      {!captionInside && (
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
      )}

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

      {/* Duygular: ekleme penceresindekinin AYNI bileşeni — ızgara sabit,
          yoğunluk çubukları altta toplanıyor. İki yerde iki ayrı duygu
          arayüzü tutmak, birinde yapılan her düzeltmeyi ötekinde unutmak
          demekti. */}
      {vt === "select" && isEmotionRow ? (
        <FieldWindow
          tone="mood"
          caption={captionInside ? t("mood.emotions") : undefined}
        >
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
        (isNumericChoiceSet(entryType.choices) ? (
          <ScaleSlider
            choices={entryType.choices ?? []}
            value={value}
            onChange={setOne}
            color={fieldColor ?? undefined}
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
