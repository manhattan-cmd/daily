"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Layers } from "lucide-react";
import { listCategoryCounts, listUserCategories } from "@/lib/db/queries";
import { BrutCategoryCard, useIsBrutal } from "@/components/structure/brutal";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryForm } from "@/components/structure/category-form";
import { CategoryTile } from "@/components/structure/category-tile";
import {
  StructureAddButton,
  StructureHeader,
} from "@/components/structure/structure-header";
import { ExampleHint } from "@/components/structure/example-hint";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";

export default function StructurePage() {
  const t = useT();
  const categories = useLiveQuery(() => listUserCategories(), []);
  // Brütal temada kartlar alt kategori ve girdi sayısını da taşıyor
  const brutal = useIsBrutal();
  const counts = useLiveQuery(() => (brutal ? listCategoryCounts() : undefined), [brutal]);

  // Kategori ekleme girdi ekleme ekranındakiyle AYNI pencere (CategoryForm).
  // Eskiden burada açılır küçük bir menü vardı: hazır listeye dokununca
  // sormadan kategori açıyor, "kendin yaz" satırı sıkışık kalıyordu.
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <StructureHeader
        action={
          <StructureAddButton
            labelKey="structure.addCategory"
            onClick={() => setAddOpen(true)}
          />
        }
      />

      <ExampleHint />

      {categories === undefined ? null : categories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("structure.empty.title")}
          description={t("structure.empty.body")}
        />
      ) : brutal ? (
        <div className="grid grid-cols-2 gap-3 pb-2">
          {categories.map((cat) => (
            <BrutCategoryCard
              key={cat.id}
              href={routes.structureCategory(cat.id)}
              color={cat.color}
              icon={cat.icon}
              name={cat.name}
              subs={counts?.get(cat.id)?.subs ?? 0}
              entries={counts?.get(cat.id)?.entries ?? 0}
            />
          ))}
        </div>
      ) : (
        /* Kategori rafları — atomlarla aynı ızgara, kare karolar */
        <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
          {categories.map((cat) => (
            <CategoryTile
              key={cat.id}
              href={routes.structureCategory(cat.id)}
              color={cat.color}
              icon={cat.icon}
              name={cat.name}
            />
          ))}
        </div>
      )}
      <CategoryForm open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
