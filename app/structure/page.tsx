"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Layers } from "lucide-react";
import { listCategories } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryQuickAdd } from "@/components/structure/category-quick-add";
import { CategoryTile } from "@/components/structure/category-tile";
import { StructureTabs } from "@/components/structure/structure-tabs";

export default function StructurePage() {
  const categories = useLiveQuery(() => listCategories(), []);

  const existingNames = new Set(categories?.map((c) => c.name) ?? []);

  return (
    <>
      <PageHeader
        title="Yapı"
        description="Kategoriler — rutinin ana başlıkları"
        action={<CategoryQuickAdd existingNames={existingNames} />}
      />

      <StructureTabs className="-mt-2 mb-5" />

      {categories === undefined ? null : categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Henüz kategori yok"
          description="+ butonuna bas, listeden seç ya da kendin yaz."
        />
      ) : (
        /* Kategori rafları — atomlarla aynı ızgara, kare karolar */
        <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
          {categories.map((cat) => (
            <CategoryTile
              key={cat.id}
              href={`/structure/${cat.id}`}
              color={cat.color}
              icon={cat.icon}
              name={cat.name}
            />
          ))}
        </div>
      )}
    </>
  );
}
