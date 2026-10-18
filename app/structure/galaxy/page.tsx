"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Waypoints } from "lucide-react";
import { useT } from "@/lib/i18n";
import { StructureHeader } from "@/components/structure/structure-header";
import { type MapGroup } from "@/components/structure/neural-map";
import { GraphView } from "@/components/structure/graph-view";
import { TechTree } from "@/components/structure/tech-tree";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/lib/db";

/**
 * Harita — yapının sinir ağı.
 *
 * Eskiden burada kategorileri ortak özelliklerine göre birbirine bağlayan bir
 * "galaksi" duruyordu. Onun anlattığı şey (hangi iki kategori aynı şeyi
 * ölçüyor) haritaya değil analize aitti; harita ise hayatın kendi şeklini
 * göstermeli. Ağ bir süre girdi ekleme akışında yaşadı ve oraya ağır geldi —
 * kayıt eklemek seri bir iş, harita bakılacak bir şey. Yeri burası.
 */
const LAYOUT_KEY = "routine:map-layout";
type Layout = "tree" | "graph";
const loadLayout = (): Layout => {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === "graph" ? "graph" : "tree";
  } catch {
    return "tree";
  }
};

export default function MapPage() {
  const t = useT();
  const brutal = useSkin() === "brutal";
  // İki düzen: teknoloji ağacı (varsayılan) ve Obsidian tarzı serbest ağ
  const [layout, setLayoutState] = useState<Layout>(() =>
    typeof window === "undefined" ? "tree" : loadLayout()
  );
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try {
      window.localStorage.setItem(LAYOUT_KEY, l);
    } catch {}
  };
  const layoutSwitch = (
    <div className="mb-3">
      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider opacity-60">
        {t("graph.layout")}
      </div>
      <div className={cn("grid grid-cols-2 gap-1 p-0.5", brutal ? "rounded-md border-2 border-[#111]" : "rounded-lg bg-muted")}>
        {(["tree", "graph"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLayout(l)}
            className={cn(
              "rounded px-1.5 py-1 font-bold",
              layout === l && (brutal ? "bg-[#111] text-white" : "bg-card text-foreground shadow")
            )}
          >
            {l === "tree" ? t("graph.layoutTree") : t("graph.layoutGraph")}
          </button>
        ))}
      </div>
    </div>
  );
  const groups = useLiveQuery(async (): Promise<MapGroup[]> => {
    const [cats, subs] = await Promise.all([
      // Yerleşik akışlar haritada düğüm değil: kullanıcıya kategori olarak
      // sunulmuyorlar, kendi ekleme pencereleri var
      db.categories.orderBy("order").filter((c) => !c.isBuiltIn).toArray(),
      db.subcategories.toArray(),
    ]);
    return cats.map((category) => ({
      category,
      topSubs: subs
        .filter(
          (s) => s.categoryId === category.id && !s.parentId && !s.isCategoryRoot
        )
        .sort((a, b) => a.order - b.order),
      allSubs: subs.filter((s) => s.categoryId === category.id),
    }));
  }, []);

  const empty = groups?.length === 0;

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      <StructureHeader />

      <div className="relative flex flex-1 min-h-0 flex-col -mx-4 -mb-4 overflow-hidden">
        {groups === undefined ? null : empty ? (
          <div className="flex h-full items-center justify-center px-4">
            <EmptyState
              icon={Waypoints}
              title={t("map.empty")}
              description={t("map.emptyHint")}
            />
          </div>
        ) : (
          layout === "tree" ? (
            <TechTree groups={groups} layoutSwitch={layoutSwitch} />
          ) : (
            <GraphView groups={groups} layoutSwitch={layoutSwitch} />
          )
        )}
      </div>
    </div>
  );
}
