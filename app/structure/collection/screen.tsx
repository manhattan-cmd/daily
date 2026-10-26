"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { db } from "@/lib/db";
import {
  addCollectionMod,
  createThing,
  deleteCollection,
  findThingByName,
  removeCollectionMod,
  thingUsage,
} from "@/lib/db/things";
import { measureOf } from "@/lib/db/queries";
import { BrutHeroCard, BrutTopStrip } from "@/components/structure/brutal";
import { CollectionForm } from "@/components/structure/collection-form";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { ModAtom, ModAtomAdd, modAtomIcon } from "@/components/structure/mod-atom";
import { SmartText } from "@/components/ui/smart-text";
import { confirmDialog } from "@/components/ui/confirm";
import { modColor } from "@/lib/mod-color";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Thing } from "@/types";
import { PageSheet } from "@/components/ui/layer";

const H2 = "mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function CollectionScreen({ collectionId }: { collectionId: string }) {
  const t = useT();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const c = await db.collections.get(collectionId);
    if (!c) return null;
    const [mods, things, usage] = await Promise.all([
      db.mods.bulkGet(c.modIds),
      db.things.where("collectionId").equals(collectionId).toArray(),
      thingUsage(collectionId),
    ]);
    things.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return { c, mods: mods.filter((m) => !!m), things, usage };
  }, [collectionId]);

  if (data === undefined) return null;
  if (data === null) {
    return <PageSheet top={<BrutTopStrip back="/structure/objects" />} />;
  }
  const { c, mods, things, usage } = data;
  const color = c.color ?? "#94a3b8";
  const active = things.filter((th) => !th.archivedAt);
  const archived = things.filter((th) => th.archivedAt);

  async function addThing() {
    const name = draft.trim();
    if (!name) return;
    const existing = await findThingByName(collectionId, name);
    if (!existing) await createThing({ collectionId, name });
    setDraft("");
  }

  async function onDelete() {
    const res = await deleteCollection(collectionId);
    if (res.ok) {
      router.push("/structure/objects");
      return;
    }
    await confirmDialog({
      title: c.name,
      body: t("objects.deleteCollectionBlocked", { things: res.things, mods: res.mods }),
      confirmLabel: t("action.ok"),
    });
  }

  const row = (th: Thing) => {
    const u = usage.get(th.id);
    return (
      <Link
        key={th.id}
        href={routes.structureThing(th.id)}
        prefetch={false}
        data-thing-row=""
        className="flex min-h-[48px] items-center gap-3 rounded-xl border-2 border-[#111] bg-white px-3 py-2 text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <span
          className={cn("h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-[#111]", th.archivedAt && "opacity-40")}
          style={{ background: color }}
        />
        <span className="min-w-0 flex-1">
          <SmartText text={th.name} className={cn("block text-[15px] font-extrabold leading-5", th.archivedAt && "opacity-60")} />
          <span className="block text-[11px] font-semibold text-[#111]/55">
            {u ? t("objects.usedIn", { n: u.count }) : t("objects.never")}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-40" strokeWidth={2.6} />
      </Link>
    );
  };

  return (
    <PageSheet
      top={
        <BrutTopStrip
          back="/structure/objects"
          analyticsHref={routes.analyticsCollection(collectionId)}
          onEdit={() => setEditOpen(true)}
          onDelete={onDelete}
        />
      }
    >
      <BrutHeroCard
        color={color}
        icon={c.icon}
        overline={t("objects.count", { n: things.length, active: active.length })}
        title={c.name}
      />

      {/* Her nesnenin özellikleri */}
      <section className="mb-6">
        <h2 className={H2}>{t("objects.features")}</h2>
        <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
          {mods.map((m) => (
            <ModAtom
              key={m!.id}
              icon={modAtomIcon({ name: m!.name, entryType: measureOf(m!) })}
              name={m!.name}
              color={modColor(m!)}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: m!.name,
                  body: t("objects.removeFeatureBody"),
                  confirmLabel: t("action.delete"),
                  destructive: true,
                });
                if (ok) await removeCollectionMod(collectionId, m!.id);
              }}
            />
          ))}
          <ModAtomAdd label={t("entry.addFeature")} onClick={() => setPickOpen(true)} />
        </div>
        <p className="mt-1 px-1 text-[11.5px] text-muted-foreground">{t("objects.featuresHint")}</p>
      </section>

      {/* Nesneler */}
      <section className="mb-6 flex flex-col gap-2">
        <h2 className={cn(H2, "self-start")}>
          {t("objects.active")} · {active.length}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addThing();
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("objects.add")}
            aria-label={t("objects.add")}
            className="h-11 min-w-0 flex-1 rounded-xl border-2 border-[#111] bg-white px-3 text-[15px] text-[#111] outline-none placeholder:text-[#111]/40"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={t("objects.add")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-[#7ae582] text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
          >
            <Plus className="h-5 w-5" strokeWidth={3} />
          </button>
        </form>
        {active.length === 0 && (
          <p className="px-1 text-[12px] text-muted-foreground">{t("objects.empty")}</p>
        )}
        {active.map(row)}

        {archived.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setArchiveOpen((o) => !o)}
              aria-expanded={archiveOpen}
              className="mt-2 flex items-center gap-1.5 self-start px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", archiveOpen && "rotate-180")} />
              {t("objects.archive")} · {archived.length}
            </button>
            {archiveOpen && archived.map(row)}
          </>
        )}
      </section>

      <CollectionForm open={editOpen} onOpenChange={setEditOpen} collection={c} />
      <ModPickDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        targetType="category"
        targetId={collectionId}
        targetName={c.name}
        persist={false}
        contextLabel={t("objects.everyObject")}
        excludeModIds={c.modIds}
        onPicked={async (picked) => {
          for (const m of picked) await addCollectionMod(collectionId, m.id);
        }}
      />
    </PageSheet>
  );
}
