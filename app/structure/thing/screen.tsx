"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ArchiveRestore, ChevronRight, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  addThingExtraMod,
  deleteThing,
  findThingByName,
  currentThingValues,
  removeThingExtraMod,
  renameThing,
  setThingArchived,
  thingEntries,
} from "@/lib/db/things";
import { measureOf } from "@/lib/db/queries";
import { BrutHeroCard, BrutTopStrip } from "@/components/structure/brutal";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { ThingEntrySheet } from "@/components/forms/thing-entry-sheet";
import { Dialog } from "@/components/ui/dialog";
import {
  FormActions,
  FormSection,
  NAME_INPUT,
  StructureFormShell,
} from "@/components/structure/structure-form-shell";
import { confirmDialog } from "@/components/ui/confirm";
import { modColor } from "@/lib/mod-color";
import { routes } from "@/lib/routes";
import { toLocalDateValue, withUnit } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Mod } from "@/types";
import { PageSheet } from "@/components/ui/layer";

const H2 = "mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function ThingScreen({ thingId }: { thingId: string }) {
  const t = useT();
  const router = useRouter();
  const [pickOpen, setPickOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const th = await db.things.get(thingId);
    if (!th) return null;
    const c = await db.collections.get(th.collectionId);
    const modIds = [...(c?.modIds ?? []), ...(th.extraModIds ?? [])];
    const [mods, values, entries, subs, cats, allMods] = await Promise.all([
      db.mods.bulkGet(modIds),
      currentThingValues(thingId),
      thingEntries(thingId),
      db.subcategories.toArray(),
      db.categories.toArray(),
      db.mods.toArray(),
    ]);
    // Her girdinin kendi değerleri (o güne ait olanlar): ücret, durum…
    const shown = entries.slice(0, 200);
    const modById = new Map(allMods.map((m) => [m.id, m]));
    const evs = await db.entryValues.where("entryId").anyOf(shown.map((e) => e.id)).toArray();
    // Önce bu nesne için yazılanlar ("214. sayfa"), sonra girdinin kendi
    // değerleri; başka nesnelere ait olanlar atlanır
    evs.sort((a, b) => Number(b.thingId === thingId) - Number(a.thingId === thingId));
    const facts = new Map<string, string[]>();
    for (const v of evs) {
      const m = v.modId ? modById.get(v.modId) : undefined;
      if (!m || m.valueType === "object" || v.value === "") continue;
      if (v.thingId && v.thingId !== thingId) continue;
      const text =
        m.valueType === "boolean"
          ? v.value === "true" ? m.name : null
          : m.valueType === "number"
            ? m.unit
              ? withUnit(Number(v.value).toLocaleString("tr-TR"), m.unit)
              : `${m.name} ${Number(v.value).toLocaleString("tr-TR")}`
            : m.valueType === "datetime-range"
              ? null
              : v.value;
      if (text) facts.set(v.entryId, [...(facts.get(v.entryId) ?? []), text]);
    }
    return {
      th,
      c,
      mods: mods.filter((m): m is Mod => !!m),
      current: values,
      entries: shown,
      total: entries.length,
      facts,
      subs: new Map(subs.map((s) => [s.id, s])),
      cats: new Map(cats.map((x) => [x.id, x])),
    };
  }, [thingId]);

  if (data === undefined) return null;
  if (data === null) return <PageSheet top={<BrutTopStrip back="/structure/objects" />} />;
  const { th, c, mods, entries, total, facts, subs, cats } = data;
  const { current } = data;
  const color = c?.color ?? "#94a3b8";
  const back = c ? routes.structureCollection(c.id) : "/structure/objects";
  const extra = new Set(th.extraModIds ?? []);


  async function onDelete() {
    const ok = await confirmDialog({
      title: t("objects.confirmDelete", { name: th.name }),
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteThing(thingId);
    if (res.ok) {
      router.push(back);
      return;
    }
    await confirmDialog({
      title: th.name,
      body: t("objects.deleteBlocked", { n: res.entries }),
      confirmLabel: t("action.ok"),
    });
  }

  return (
    <PageSheet
      top={
        <BrutTopStrip
          back={back}
          trail={c?.name}
          analyticsHref={routes.analyticsThing(thingId)}
          onEdit={() => setRenameOpen(true)}
          onDelete={onDelete}
        />
      }
    >
      <BrutHeroCard color={color} icon={c?.icon} overline={c?.name ?? ""} title={th.name} />

      {/* Arşiv durumu */}
      <div className="-mt-2 mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setThingArchived(thingId, !th.archivedAt)}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[#111] bg-white px-3 text-[13.5px] font-extrabold text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {th.archivedAt ? (
            <ArchiveRestore className="h-4 w-4" strokeWidth={2.6} />
          ) : (
            <Archive className="h-4 w-4" strokeWidth={2.6} />
          )}
          {th.archivedAt ? t("objects.unarchive") : t("objects.doArchive")}
        </button>
        {th.archivedAt && (
          <p className="text-[11.5px] leading-snug text-muted-foreground">{t("objects.archivedNote")}</p>
        )}
      </div>

      {/* Özellikler — güncel durum, son girdisinden; yeni değer "Durum gir"le
          girdi olarak yazılır (geçmişi kalır) */}
      <section className="mb-6">
        <h2 className={H2}>{t("objects.thingFeatures")}</h2>
        <div className="flex flex-col gap-2">
          {mods.map((m) => {
            const cur = current[m.id];
            const n = cur ? Number(cur.value) : NaN;
            const shown = !cur
              ? "—"
              : m.valueType === "boolean"
                ? cur.value === "true" ? t("entry.yes") : t("entry.no")
                : m.valueType === "number" && Number.isFinite(n)
                  ? withUnit(n.toLocaleString("tr-TR"), m.unit)
                  : cur.value;
            return (
              <div
                key={m.id}
                data-thing-state=""
                className="flex items-center gap-3 rounded-xl border-2 border-[#111] bg-white px-3 py-2.5 text-[#111]"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#111]"
                  style={{ background: modColor(m) }}
                >
                  {(() => {
                    const Icon = modAtomIcon({ name: m.name, entryType: measureOf(m) });
                    return <Icon className="h-4 w-4 text-[#111]" strokeWidth={2.4} />;
                  })()}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12px] font-bold text-[#111]/60">{m.name}</span>
                  <span className="block truncate text-[17px] font-black">{shown}</span>
                </span>
                {cur && (
                  <span className="shrink-0 text-[11px] font-semibold text-[#111]/50">
                    {new Date(cur.at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </span>
                )}
                {extra.has(m.id) && (
                  <button
                    type="button"
                    onClick={() => removeThingExtraMod(thingId, m.id)}
                    aria-label={t("entry.removeFromEntry")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#111]/50 hover:bg-[#111]/5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {mods.length > 0 && (
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              data-log-state=""
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[#111] bg-[#ffd23f] text-[15px] font-black text-[#111] shadow-[3px_3px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Plus className="h-5 w-5" strokeWidth={3} />
              {t("objects.logState")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPickOpen(true)}
            className="flex h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            {t("entry.addFeature")}
          </button>
        </div>
      </section>

      {/* Bu nesnenin girdileri — kategoriden bağımsız tek zaman çizgisi */}
      <section className="mb-8">
        <h2 className={H2}>
          {t("objects.entries")} · {total}
        </h2>
        {entries.length === 0 ? (
          <p className="px-1 text-[12px] text-muted-foreground">{t("objects.noEntries")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {entries.map((e) => {
              const sub = subs.get(e.subcategoryId);
              const cat = sub ? cats.get(sub.categoryId) : undefined;
              const date = toLocalDateValue(e.occurredAt);
              const path = sub?.isCategoryRoot ? cat?.name : [cat?.name, sub?.name].filter(Boolean).join(" › ");
              return (
                <Link
                  key={e.id}
                  href={routes.day(date)}
                  prefetch={false}
                  data-thing-entry=""
                  className="flex items-center gap-3 rounded-xl border-2 border-[#111] bg-white px-3 py-2 text-[#111]"
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: cat?.color ?? color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-extrabold leading-5">{path}</span>
                    <span className="block text-[11px] font-semibold tabular-nums text-[#111]/55">
                      {new Date(e.occurredAt).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </span>
                    {facts.get(e.id) && (
                      <span className="block truncate text-[12px] font-bold text-[#111]/80">
                        {facts.get(e.id)!.join(" · ")}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-40" strokeWidth={2.6} />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <ThingEntrySheet open={logOpen} onClose={() => setLogOpen(false)} thingId={thingId} />
      <ModPickDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        targetType="category"
        targetId={thingId}
        targetName={th.name}
        persist={false}
        contextLabel={t("objects.onlyThis")}
        excludeModIds={mods.map((m) => m.id)}
        onPicked={async (picked) => {
          for (const m of picked) await addThingExtraMod(thingId, m.id);
        }}
      />
      <RenameForm
        open={renameOpen}
        onOpenChange={setRenameOpen}
        name={th.name}
        color={color}
        icon={c?.icon}
        onSave={async (name) => {
          const clash = c ? await findThingByName(c.id, name) : undefined;
          if (clash && clash.id !== thingId) return false;
          await renameThing(thingId, name);
          return true;
        }}
      />
    </PageSheet>
  );
}

function RenameForm({
  open,
  onOpenChange,
  name: initial,
  color,
  icon,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  color: string;
  icon?: string;
  onSave: (name: string) => Promise<boolean>;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  const [clash, setClash] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initial);
      setClash(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StructureFormShell
        color={color}
        icon={icon}
        title={name.trim() || initial}
        eyebrow={t("objects.rename")}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await onSave(name)) onOpenChange(false);
          else setClash(true);
        }}
        footer={
          <FormActions
            submitLabel={t("action.save")}
            cancelLabel={t("action.cancel")}
            disabled={!name.trim()}
            onCancel={() => onOpenChange(false)}
          />
        }
      >
        <FormSection label={t("tree.name")}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setClash(false);
            }}
            className={NAME_INPUT}
          />
          {clash && (
            <p className="text-[12px] font-semibold text-amber-600">
              {t("features.nameClashOf", { name: name.trim() })}
            </p>
          )}
        </FormSection>
      </StructureFormShell>
    </Dialog>
  );
}
