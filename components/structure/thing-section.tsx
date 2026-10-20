"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import Link from "next/link";
import { Boxes, Check, Layers, Plus } from "lucide-react";
import { db } from "@/lib/db";
import {
  effectiveLinksForSub,
  linkToStructure,
  listStructureLinks,
  unlinkStructure,
} from "@/lib/db/things";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ENTRY_WINDOW_LARGE } from "@/components/ui/entry-window";
import { confirmDialog } from "@/components/ui/confirm";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Collection, StructureThing, Thing } from "@/types";

/** Nesnenin şekli: baklava — kare kategori, daire özellik (bkz. atom ızgarası) */
function ThingAtomCore({ color, icon, list }: { color: string; icon?: string; list?: boolean }) {
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
      <span
        className={cn(
          "absolute inset-[6px] rotate-45 rounded-[9px] border-2 border-[#111] shadow-[2px_2px_0_#111]",
          list && "outline-dashed outline-2 outline-offset-2 outline-[#111]/40"
        )}
        style={{ background: color }}
      />
      <span className="relative text-[#111]">
        {icon ? (
          <SymbolIcon name={icon} size={18} style={{ color: "#111" }} />
        ) : list ? (
          <Layers className="h-[18px] w-[18px]" strokeWidth={2.4} />
        ) : (
          <Boxes className="h-[18px] w-[18px]" strokeWidth={2.4} />
        )}
      </span>
    </span>
  );
}

/**
 * Kategori / kalem sayfasının "Nesneler" bölümü — Özellikler'in kardeşi.
 *
 * Buraya bağlanan nesne bu kalemin girdi formunda hazır çıkar (özellik gibi);
 * bağlanan LİSTE formda "hangisi?" seçicisi olarak çıkar — kitaplar gibi
 * sürekli değişen nesnelerde asıl kullanışlı olan bu. Kategoriye bağlanan
 * alt kalemlerde de çıkar: alt kalem sayfasında soluk ve "üstten" notuyla.
 */
export function ThingSection({
  targetType,
  targetId,
}: {
  targetType: "category" | "subcategory";
  targetId: string;
}) {
  const t = useT();
  const [pickOpen, setPickOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const links =
      targetType === "subcategory"
        ? await effectiveLinksForSub(targetId)
        : (await listStructureLinks("category", targetId)).map((l) => ({
            ...l,
            inherited: false,
            from: "",
          }));
    const [collections, things] = await Promise.all([
      db.collections.toArray(),
      db.things.toArray(),
    ]);
    collections.sort((a, b) => a.order - b.order);
    return {
      links,
      collections,
      things,
      coll: new Map(collections.map((c) => [c.id, c])),
      thing: new Map(things.map((th) => [th.id, th])),
    };
  }, [targetType, targetId]);

  if (!data) return null;
  const own = data.links.filter((l) => !l.inherited);

  async function remove(l: StructureThing, name: string) {
    const ok = await confirmDialog({
      title: name,
      body: t("objects.unlinkBody"),
      confirmLabel: t("objects.unlink"),
      destructive: true,
    });
    if (ok) await unlinkStructure(l.id);
  }

  return (
    <section className="mb-6" data-thing-section="">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("objects.title")}
      </h2>
      <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
        {data.links.map((l) => {
          const th = l.thingId ? data.thing.get(l.thingId) : undefined;
          const c = data.coll.get(th?.collectionId ?? l.collectionId ?? "");
          const name = th?.name ?? c?.name ?? "?";
          return (
            <button
              key={l.id}
              type="button"
              data-thing-link=""
              disabled={l.inherited}
              onClick={() => remove(l, name)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl px-1 py-2 transition-all hover:bg-[var(--sf-2)] active:scale-[0.92] disabled:active:scale-100",
                l.inherited && "opacity-55"
              )}
            >
              <ThingAtomCore color={c?.color ?? "#94a3b8"} icon={c?.icon} list={!th} />
              <span className="w-full truncate text-center text-[11px] font-medium leading-tight">
                {name}
              </span>
              <span className="w-full truncate text-center text-[9.5px] leading-tight text-muted-foreground">
                {l.inherited ? t("objects.fromAbove", { name: l.from }) : th ? c?.name : t("objects.wholeList")}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPickOpen(true)}
          data-thing-link-add=""
          className="group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-[var(--sf-2)] active:scale-[0.92]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center">
            <span className="flex h-9 w-9 rotate-45 items-center justify-center rounded-[9px] border-2 border-dashed border-primary/45 text-primary/70">
              <Plus className="h-4 w-4 -rotate-45" strokeWidth={2} />
            </span>
          </span>
          <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
            {t("objects.link")}
          </span>
        </button>
      </div>
      {data.links.length === 0 && (
        <p className="mt-1 px-1 text-[11.5px] leading-snug text-muted-foreground">{t("objects.linkHint")}</p>
      )}

      <LinkDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        collections={data.collections}
        things={data.things}
        linked={new Set(own.map((l) => (l.thingId ? `t:${l.thingId}` : `c:${l.collectionId}`)))}
        onToggle={async (ref, on) => {
          if (on) await linkToStructure(targetType, targetId, ref);
          else {
            const l = own.find((x) =>
              "thingId" in ref ? x.thingId === ref.thingId : x.collectionId === ref.collectionId
            );
            if (l) await unlinkStructure(l.id);
          }
        }}
      />
    </section>
  );
}

function LinkDialog({
  open,
  onOpenChange,
  collections,
  things,
  linked,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  collections: Collection[];
  things: Thing[];
  linked: Set<string>;
  onToggle: (ref: { thingId: string } | { collectionId: string }, on: boolean) => void;
}) {
  const t = useT();
  const row = (on: boolean, label: string, sub: string | null, color: string, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      data-link-option=""
      onClick={onClick}
      className="flex min-h-[44px] items-center gap-3 rounded-xl border-2 border-[#111] bg-white px-3 py-2 text-left text-[#111]"
      style={on ? { background: `color-mix(in srgb, ${color} 35%, white)` } : undefined}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-[#111]"
        style={{ background: on ? color : "white" }}
      >
        {on && <Check className="h-4 w-4" strokeWidth={3.5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold leading-5">{label}</span>
        {sub && <span className="block truncate text-[11px] font-semibold text-[#111]/55">{sub}</span>}
      </span>
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(ENTRY_WINDOW_LARGE, "gap-3")} aria-describedby={undefined}>
        <DialogTitle className="pr-8 text-lg font-black">{t("objects.link")}</DialogTitle>
        <p className="-mt-1 text-[12.5px] leading-snug text-muted-foreground">{t("objects.linkDialogHint")}</p>
        {collections.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {t("objects.emptyBody")}{" "}
            <Link href="/structure/objects" className="font-bold underline">
              {t("objects.title")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-4 overflow-y-auto pb-2">
            {collections.map((c) => {
              const color = c.color ?? "#94a3b8";
              const mine = things
                .filter((th) => th.collectionId === c.id && !th.archivedAt)
                .sort((a, b) => a.name.localeCompare(b.name, "tr"));
              return (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <span className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {c.name}
                  </span>
                  {row(
                    linked.has(`c:${c.id}`),
                    t("objects.wholeListNamed", { name: c.name }),
                    t("objects.wholeListHint"),
                    color,
                    () => onToggle({ collectionId: c.id }, !linked.has(`c:${c.id}`)),
                    `c-${c.id}`
                  )}
                  {mine.map((th) =>
                    row(
                      linked.has(`t:${th.id}`),
                      th.name,
                      null,
                      color,
                      () => onToggle({ thingId: th.id }, !linked.has(`t:${th.id}`)),
                      th.id
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="h-11 rounded-xl border-2 border-[#111] bg-[#ffd23f] text-[15px] font-black text-[#111] shadow-[2px_2px_0_#111]"
        >
          {t("action.ok")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
