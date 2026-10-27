"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Pencil, Plus, Trash2 } from "lucide-react";
import { SummaryBlock, SummaryTile } from "@/components/ui/summary-block";
import { getSubCategory, getCategory, listCategoryTree, structureSummary } from "@/lib/db/queries";
import { BrutSubsBlock, BrutThingSummary, BrutTopStrip, useIsBrutal } from "@/components/structure/brutal";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { toLocalDateValue } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import { SubCategoryTree } from "@/components/structure/subcategory-tree";
import { DeleteSubCategoryDialog } from "@/components/structure/delete-subcategory-dialog";
import { RecentEntriesSection } from "@/components/structure/recent-entries-section";
import { AnalysisSection } from "@/components/structure/analysis-section";
import { routes } from "@/lib/routes";
import { Layer, PageSheet } from "@/components/ui/layer";

export function SubCategoryDetailPage({
  params,
}: {
  params: { categoryId: string; subcategoryId: string };
}) {
  const t = useT();
  const { categoryId, subcategoryId } = params;
  const router = useRouter();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);
  const subcategory = useLiveQuery(
    () => getSubCategory(subcategoryId),
    [subcategoryId]
  );
  // Silme diyaloğu "sadece bunu sil" seçeneğinde içindekilerin taşınacağı üst
  const parentSub = useLiveQuery(
    () => (subcategory?.parentId ? getSubCategory(subcategory.parentId) : undefined),
    [subcategory?.parentId]
  );

  const [subFormOpen, setSubFormOpen] = useState(false);
  // Formun hedefi: kendisi (düzenleme) ya da ağaçtan seçilen ebeveyne yeni çocuk
  const [editingSelf, setEditingSelf] = useState(false);
  const [newParentId, setNewParentId] = useState<string>(subcategoryId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [today] = useState(() => toLocalDateValue());

  // Brütal tema: büyük başlık, üç renkli kutu, altta "Girdi ekle"
  const brutal = useIsBrutal();
  // Brütal: alt kategoriler Yapı → Kategoriler kartlarındaki ağaç biçiminde
  const tree = useLiveQuery(() => (brutal ? listCategoryTree() : undefined), [brutal]);
  const summary = useLiveQuery(
    () => (brutal ? structureSummary(categoryId, subcategoryId) : undefined),
    [brutal, categoryId, subcategoryId]
  );

  const backPath = subcategory?.parentId
    ? routes.structureSub(categoryId, subcategory.parentId)
    : routes.structureCategory(categoryId);

  const deleteParentName = subcategory?.parentId
    ? parentSub?.name ?? category?.name ?? "parent category"
    : category?.name ?? "kategori";

  return (
    <>
      {/* Brütal: üst menü krem döşemede; özet bloğu ve bölümler ekranı
          kaplayan sayfa zemininde (bkz. PageSheet) */}
      <PageSheet
        top={brutal ? (
          <BrutTopStrip
            back={backPath}
            trail={subcategory?.parentId ? parentSub?.name : category?.name}
            analyticsHref={routes.analyticsSub(categoryId, subcategoryId)}
            onEdit={() => {
              setEditingSelf(true);
              setSubFormOpen(true);
            }}
            onDelete={() => setDeleteOpen(true)}
            onAddSub={() => {
              setEditingSelf(false);
              setNewParentId(subcategoryId);
              setSubFormOpen(true);
            }}
          />
        ) : (
      <PageHeader
        title={subcategory?.name ?? "..."}
        description={category?.name}
        back={backPath}
        action={
          subcategory && (
            <div className="flex items-center gap-0.5">
              {/* Analiz sayfa düzeyinde — "son girdilerin analizi" sanılmasın */}
              <Link
                href={routes.analyticsSub(categoryId, subcategoryId)}
                aria-label={`${subcategory.name} analizi`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <BarChart3 className="h-4 w-4" />
              </Link>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => {
                  setEditingSelf(true);
                  setSubFormOpen(true);
                }}
                aria-label={t("tree.editSubcategory")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                aria-label={t("tree.deleteSubcategory")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />
        )}
      >
      {/* Brütal: başlık ve sayılar tek blokta (bkz. BrutThingSummary) */}
      {brutal && subcategory && (
        <BrutThingSummary
          color={category?.color ?? "#ffd23f"}
          icon={subcategory.icon ?? category?.icon}
          overline={parentSub?.name ?? category?.name ?? ""}
          title={subcategory.name}
          summary={summary}
          className="mb-4"
        />
      )}

      {/* Özellik atomları */}
      {subcategory && (
        <ModifierSection
          targetType="subcategory"
          targetId={subcategoryId}
          targetName={subcategory.name}
        />
      )}

      {/* Çocuk alt kategori ağacı. Brütal: ana sayfanın blok dili (bkz. BrutSubsBlock) */}
      {category && brutal && (
        <BrutSubsBlock
          category={category}
          subs={tree?.subs}
          counts={tree?.counts}
          rootId={subcategoryId}
          onAdd={() => {
            setEditingSelf(false);
            setNewParentId(subcategoryId);
            setSubFormOpen(true);
          }}
        />
      )}
      {category && !brutal && (
        <Layer bare className="mb-6">
        <section>
          <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("structure.subcategories")}
          </h2>
          <SubCategoryTree
            categoryId={categoryId}
            categoryName={category.name}
            color={category.color}
            parentId={subcategoryId}
            parentName={subcategory?.name}
            onAddChild={(parentSubId) => {
              setEditingSelf(false);
              setNewParentId(parentSubId ?? subcategoryId);
              setSubFormOpen(true);
            }}
          />
        </section>
        </Layer>
      )}

      {/* Analiz — özelliklerin nasıl inceleneceği, kullanıcının seçimi */}
      {category && (
        <AnalysisSection
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          analyticsHref={routes.analyticsSub(categoryId, subcategoryId)}
        />
      )}

      {/* Son girdiler + analize kısayol */}
      {/* Brütal, hiç girdi yokken: Son girdiler bloğu boş haliyle — yanında
          yeşil İlk girdiyi ekle karosu, kalemin formu doğrudan açılır */}
      {brutal && summary && summary.entries === 0 ? (
        <>
          <SummaryBlock
            className="mb-4"
            lead={{
              kind: "count",
              color: "#ffb38a",
              overline: t("home.recentEntries"),
              value: "0",
              unit: t("home.entries"),
            }}
            action={<SummaryTile color="#7ae582" icon={Plus} label={t("brut.firstEntry")} onClick={() => setEntryOpen(true)} />}
            stats={[]}
          >
            <p className="bg-white px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[#111]/65">
              {t("brut.noEntriesHint")}
            </p>
          </SummaryBlock>
          <DayEntrySheet
            date={today}
            open={entryOpen && !!subcategory}
            onClose={() => setEntryOpen(false)}
            presetSub={subcategory ?? null}
          />
        </>
      ) : (
      <RecentEntriesSection
        scope="subcategory"
        categoryId={categoryId}
        subcategoryId={subcategoryId}
        selfName={subcategory?.name}
        color={category?.color}
        total={summary?.entries}
      />
      )}
      </PageSheet>

      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={(o) => {
          setSubFormOpen(o);
          if (!o) {
            setEditingSelf(false);
            setNewParentId(subcategoryId);
          }
        }}
        categoryId={categoryId}
        parentSubcategoryId={editingSelf ? undefined : newParentId}
        categoryName={category?.name}
        subcategory={editingSelf ? subcategory : undefined}
      />

      <DeleteSubCategoryDialog
        sub={deleteOpen ? subcategory ?? null : null}
        parentName={deleteParentName}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push(backPath)}
      />
    </>
  );
}
