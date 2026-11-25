"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ArchiveRestore, BarChart3, ChevronRight, Circle, Diamond, List as ListIcon, Plus, X } from "lucide-react";
import { SummaryBlock, SummaryEmpty, SummaryTile } from "@/components/ui/summary-block";
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
import { lastEntry } from "@/components/structure/brutal";
import { StructureHeader } from "@/components/structure/structure-header";
import { StructureHead, headNum, periodStarts } from "@/components/structure/structure-head";
import { ObjectTrail } from "@/components/structure/structure-trail";
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
import { blockInk, fillStyle } from "@/lib/fill";

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
      month: entries.filter((e) => e.occurredAt >= periodStarts().month).length,
      lastAt: entries[0]?.occurredAt as number | undefined,
      facts,
      subs: new Map(subs.map((s) => [s.id, s])),
      cats: new Map(cats.map((x) => [x.id, x])),
    };
  }, [thingId]);

  if (data === undefined) return null;
  if (data === null)
    return (
      <PageSheet top={<StructureHeader />}>{null}</PageSheet>
    );
  const { th, c, mods, entries, total, month, lastAt, facts, subs, cats } = data;
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
    // Yapı'nın şeridi ve sayfa başı (bkz. StructureHead) — konum yolunda
    // liste › nesne; analiz · düzenle · sil özet bloğunda (bkz. liste sayfası)
    <PageSheet top={<StructureHeader />}>
      {/* Sayfa başı (bkz. StructureHead) — nesnenin adı listesinin renginde,
          Düzenle ve Sil; altında "↳ Kitaplarım" (bunun içinde), sayıları ve
          Analiz bandı */}
      <StructureHead
        lead={{ kind: "thing", color, icon: c?.icon, glyph: c?.icon ? undefined : Diamond, overline: t("yhead.thing"), title: th.name }}
        edit={() => setRenameOpen(true)}
        remove={onDelete}
        rows={<ObjectTrail collection={c} thing={th} ancestors />}
        stats={[
          { label: t("brut.entries"), value: headNum(total), color: "#8ea6ff" },
          { label: t("brut.thisMonth"), value: headNum(month), color: "#7ae582" },
          { label: t("brut.lastEntry"), ...lastEntry(lastAt, t), color: "#ffb38a" },
        ]}
        link={{ href: routes.analyticsThing(thingId), label: t("yhead.insights.thing"), color: "#8ea6ff", icon: BarChart3 }}
      />

      {/* Arşiv durumu */}
      <div className="-mt-2 mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setThingArchived(thingId, !th.archivedAt)}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-line bg-paper px-3 text-[13.5px] font-extrabold text-ink shadow-[2px_2px_0_var(--shade)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
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
      <SummaryBlock
        className="mb-4"
        compact
        lead={{
          kind: "count",
          color: "#c9b8ff",
          glyph: Circle,
          overline: t("objects.thingFeatures"),
          value: String(mods.length),
          unit: t("struct.features.unit"),
        }}
        action={<SummaryTile compact color="#7ae582" icon={Plus} label={t("entry.addFeature")} onClick={() => setPickOpen(true)} />}
        stats={[]}
      >
        {mods.length === 0 && (
          <SummaryEmpty text={t("struct.features.empty")} action={{ label: t("action.add"), onClick: () => setPickOpen(true) }} />
        )}
        {mods.length > 0 && (
        <div data-thing-states="" className="flex flex-col gap-2 bg-paper p-2.5">
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
                className="flex items-center gap-3 rounded-xl border-2 border-line bg-paper px-3 py-2.5 text-ink"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line"
                  style={fillStyle(modColor(m))}
                >
                  {(() => {
                    const Icon = modAtomIcon({ name: m.name, entryType: measureOf(m) });
                    return <Icon style={{ color: blockInk(modColor(m)) }} className="h-4 w-4 text-ink" strokeWidth={2.4} />;
                  })()}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12px] font-bold text-ink/60">{m.name}</span>
                  <span className="block truncate text-[17px] font-black">{shown}</span>
                </span>
                {cur && (
                  <span className="shrink-0 text-[11px] font-semibold text-ink/50">
                    {new Date(cur.at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </span>
                )}
                {extra.has(m.id) && (
                  <button
                    type="button"
                    onClick={() => removeThingExtraMod(thingId, m.id)}
                    aria-label={t("entry.removeFromEntry")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-ink/5"
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
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-fill-[#ffd23f] text-[15px] font-black text-ink shadow-[3px_3px_0_var(--shade)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Plus className="h-5 w-5" strokeWidth={3} />
              {t("objects.logState")}
            </button>
          )}
        </div>
        )}
      </SummaryBlock>

      {/* Bu nesnenin girdileri — kategoriden bağımsız tek zaman çizgisi */}
      <SummaryBlock
        className="mb-8"
        compact
        lead={{
          kind: "count",
          color: "#ffb38a",
          glyph: ListIcon,
          overline: t("objects.entries"),
          value: String(total),
          unit: t("home.entries"),
        }}
        stats={[]}
      >
        {entries.length === 0 ? (
          <SummaryEmpty text={t("objects.noEntries")} />
        ) : (
          <div data-thing-entries="" className="flex flex-col gap-1.5 bg-paper p-2.5">
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
                  className="flex items-center gap-3 rounded-xl border-2 border-line bg-paper px-3 py-2 text-ink"
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: cat?.color ?? color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-extrabold leading-5">{path}</span>
                    <span className="block text-[11px] font-semibold tabular-nums text-ink/55">
                      {new Date(e.occurredAt).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </span>
                    {facts.get(e.id) && (
                      <span className="block truncate text-[12px] font-bold text-ink/80">
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
      </SummaryBlock>

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
