"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Waypoints } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/page-header";
import { StructureTabs } from "@/components/structure/structure-tabs";
import { NeuralMap, type MapGroup } from "@/components/structure/neural-map";
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
export default function MapPage() {
  const t = useT();
  const groups = useLiveQuery(async (): Promise<MapGroup[]> => {
    const [cats, subs] = await Promise.all([
      db.categories.orderBy("order").toArray(),
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
      <PageHeader title={t("structure.title")} description={t("map.lead")} />
      <StructureTabs />

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
          <NeuralMap groups={groups} />
        )}
      </div>
    </div>
  );
}
