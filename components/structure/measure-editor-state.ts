"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { listCollections } from "@/lib/db/things";
import { db } from "@/lib/db";
import {
  scaleChoices,
  scaleRangeOf,
  uiKindOf,
  type MeasureUiKind,
} from "@/lib/measure-kinds";
import { SCALE_PRESETS, type EntryValueType } from "@/types";
import type { ModMeasure } from "@/lib/db/queries";

/** Ölçüm ayarı kaydedilebilir mi (çoktan seçmeli en az iki seçenek ister) */
export function isMeasureComplete(m: ModMeasure): boolean {
  if (m.valueType === "select") return (m.choices?.length ?? 0) >= 2;
  if (m.valueType === "object") return !!m.collectionId || !!m.newCollection?.trim();
  return true;
}

/**
 * "Nasıl ölçülüyor" düzenleyicisinin durumu — sade ve brütal görünüm (bkz.
 * MeasureEditor, BrutMeasureEditor) aynı kuralla çalışsın diye tek yerde.
 */
export function useMeasureEditor(value: ModMeasure, onChange: (next: ModMeasure) => void) {
  const kind = uiKindOf(value);
  const [choiceDraft, setChoiceDraft] = useState("");
  /** Yalnızca hissi vermek için — kaydedilmez */
  const [demo, setDemo] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  // Nesne türü: listeler (içindeki nesne sayısıyla) ve yeni liste taslağı
  const collections = useLiveQuery(async () => {
    if (kind !== "object") return [];
    const [cs, things] = await Promise.all([listCollections(), db.things.toArray()]);
    return cs.map((c) => ({
      ...c,
      n: things.filter((x) => x.collectionId === c.id && !x.archivedAt).length,
    }));
  }, [kind]);
  // Yeni liste: yazılan ad yeterli, ayrıca "+" yok — liste özellik
  // kaydedilince açılır (bkz. settleMeasure). Eskiden ad yazılıp yanındaki
  // gri "+"ya basılması gerekiyordu; basılmazsa Oluştur kapalı kalıyordu,
  // basılınca da pencereden vazgeçilse bile liste açılmış oluyordu.
  const [collDraft, setCollDraft] = useState(value.newCollection ?? "");
  const [newOpen, setNewOpen] = useState(!!value.newCollection);
  const noLists = collections !== undefined && collections.length === 0;
  const showNew = newOpen || noLists;
  function typeCollection(v: string) {
    setCollDraft(v);
    // Var olan bir listenin adı yazıldıysa o seçilir, ikincisi açılmaz
    const n = v.trim().toLocaleLowerCase("tr");
    const match = (collections ?? []).find((c) => c.name.trim().toLocaleLowerCase("tr") === n);
    onChange({
      ...value,
      valueType: "object",
      collectionId: match?.id,
      newCollection: match || !v.trim() ? undefined : v,
    });
  }
  function pickCollection(id: string) {
    setNewOpen(false);
    setCollDraft("");
    onChange({ ...value, collectionId: id, newCollection: undefined });
  }
  function openNewCollection() {
    setNewOpen(true);
    onChange({
      ...value,
      collectionId: undefined,
      newCollection: collDraft.trim() ? collDraft : undefined,
    });
  }

  const choices = value.choices ?? [];
  const range = scaleRangeOf(choices);
  const steps = choices.length;
  const activePreset = SCALE_PRESETS.find((p) => p.choices.join() === choices.join());

  function pickKind(k: MeasureUiKind) {
    setDemo("");
    setCustomOpen(false);
    setCollDraft("");
    setNewOpen(false);
    if (k === "scale") {
      onChange({ valueType: "select", choices: SCALE_PRESETS[0].choices });
      return;
    }
    onChange({ valueType: k as EntryValueType });
  }

  const setRange = (min: number, max: number) =>
    onChange({ ...value, choices: scaleChoices(min, max) });

  const setLabel = (end: "low" | "high", v: string) =>
    onChange({ ...value, scaleLabels: { ...value.scaleLabels, [end]: v } });

  const addChoice = () => {
    const v = choiceDraft.trim();
    if (!v || choices.includes(v)) return;
    onChange({ ...value, choices: [...choices, v] });
    setChoiceDraft("");
  };
  const removeChoice = (c: string) =>
    onChange({ ...value, choices: choices.filter((x) => x !== c) });

  return {
    kind,
    choiceDraft,
    setChoiceDraft,
    demo,
    setDemo,
    customOpen,
    setCustomOpen,
    collections,
    collDraft,
    newOpen,
    noLists,
    showNew,
    typeCollection,
    pickCollection,
    openNewCollection,
    choices,
    range,
    steps,
    activePreset,
    pickKind,
    setRange,
    setLabel,
    addChoice,
    removeChoice,
  };
}
