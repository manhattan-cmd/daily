"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, List as ListIcon, Pencil, Trash2 } from "lucide-react";
import {
  getCategory,
  deleteCategory,
  structureSummary,
  listCategoryTree,
  getOrCreateCategoryRootSub,
} from "@/lib/db/queries";
import type { SubCategory } from "@/types";
import { toLocalDateValue } from "@/lib/utils";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { BrutSubsBlock, summaryStats, useIsBrutal } from "@/components/structure/brutal";
import { StructureHeader } from "@/components/structure/structure-header";
import { StructureHead } from "@/components/structure/structure-head";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { ModifierSection } from "@/components/structure/modifier-section";
import { SubCategoryTree } from "@/components/structure/subcategory-tree";
import { RecentEntriesSection } from "@/components/structure/recent-entries-section";
import { AnalysisSection } from "@/components/structure/analysis-section";
import { routes } from "@/lib/routes";
import { Layer, PageSheet } from "@/components/ui/layer";

export function CategoryDetailPage({
  params,
}: {
  params: { categoryId: string };
}) {
  const { categoryId } = params;
  const t = useT();
  const router = useRouter();

  const category = useLiveQuery(() => getCategory(categoryId), [categoryId]);

  const [subFormOpen, setSubFormOpen] = useState(false);
  // Ağaçtan gelen ekleme hedefi — undefined kök seviye demek
  const [newParentId, setNewParentId] = useState<string | undefined>();
  const [catFormOpen, setCatFormOpen] = useState(false);
  // Hiç girdisi yokken boş Son girdiler penceresinin Girdi ekle'si
  const [entryOpen, setEntryOpen] = useState(false);
  const [entrySub, setEntrySub] = useState<SubCategory | null>(null);
  const [today] = useState(() => toLocalDateValue());

  // Brütal tema: renkli başlık kartı ve sayılar
  const brutal = useIsBrutal();
  // Brütal: alt kategoriler Yapı → Kategoriler kartlarındaki ağaç biçiminde
  const tree = useLiveQuery(() => (brutal ? listCategoryTree() : undefined), [brutal]);
  const summary = useLiveQuery(
    () => (brutal ? structureSummary(categoryId) : undefined),
    [brutal, categoryId]
  );

  async function onDeleteCategory() {
    if (!category) return;
    const ok = await confirmDialog({
      title: t("confirm.deleteCategory", { name: category.name }),
      body: `${t("confirm.deleteCategoryBody")} ${t("confirm.undoHint")}`,
      destructive: true,
    });
    if (!ok) return;
    await deleteCategory(categoryId);
    router.push("/structure");
  }


  // Özellik atomları — Brütalde alt kategorilerin ardında (kullanıcının
  // sırası: özet · alt kategoriler · özellikler), sade temalarda önünde
  const features = category && (
    <ModifierSection targetType="category" targetId={categoryId} targetName={category.name} />
  );

  return (
    <>
      {/* Brütal: üst menü krem döşemede; özet bloğu ve bölümler ekranı
          kaplayan sayfa zemininde (bkz. PageSheet) */}
      <PageSheet
        top={brutal ? (
          /* Yapı'nın şeridi; sayfa başı ve konum yolu gövdede (bkz.
             StructureHead). Analiz · düzenle · sil özet bloğunda; ekle karosu
             yok — Alt kategoriler bloğunun yeşil karosu ekliyor */
          <StructureHeader />
        ) : (
      <PageHeader
        title={category?.name ?? "..."}
        description={t("tree.subcategoriesAndFeatures")}
        back="/structure"
        action={
          category && (
            <div className="flex items-center gap-0.5">
              {/* Analiz sayfa düzeyinde — "son girdilerin analizi" sanılmasın */}
              <Link
                href={routes.analyticsCategory(categoryId)}
                aria-label={`${category.name} analizi`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <BarChart3 className="h-4 w-4" />
              </Link>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setCatFormOpen(true)}
                aria-label={t("tree.editCategory")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={onDeleteCategory}
                aria-label={t("tree.deleteCategory")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />
        )}
      >
      {/* Brütal: sayfa başı (bkz. StructureHead) — kategorinin renginde adı,
          Düzenle ve Sil, sayıları; en altta Analiz bandı ve alt kategorilerin
          girdi payı */}
      {brutal && category && (
        <StructureHead
          lead={{ kind: "thing", color: category.color, icon: category.icon, overline: t("brut.category"), title: category.name }}
          edit={() => setCatFormOpen(true)}
          remove={onDeleteCategory}
          stats={summaryStats(summary, t)}
          link={{
            href: routes.analyticsCategory(categoryId),
            label: t("yhead.insights.category"),
            color: "#8ea6ff",
            icon: BarChart3,
            bars: tree?.subs
              .filter((s) => s.categoryId === categoryId && !s.parentId)
              .map((s) => ({ key: s.id, color: category.color, title: s.name, weight: tree.counts.get(s.id) ?? 0 }))
              .filter((b) => b.weight > 0),
          }}
        />
      )}

      {!brutal && features}

      {/* Alt kategori ağacı — hiyerarşi iç içe açılır. Brütal: ana sayfanın
          blok dili (bkz. BrutSubsBlock) */}
      {category && brutal && (
        <BrutSubsBlock
          category={category}
          subs={tree?.subs}
          counts={tree?.counts}
          onAdd={() => {
            setNewParentId(undefined);
            setSubFormOpen(true);
          }}
        />
      )}
      {brutal && features}
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
            onAddChild={(parentSubId) => {
              setNewParentId(parentSubId);
              setSubFormOpen(true);
            }}
          />
        </section>
        </Layer>
      )}

      {/* Analiz — özelliklerin nasıl inceleneceği, kullanıcının seçimi */}
      {category && (
        <AnalysisSection categoryId={categoryId} analyticsHref={routes.analyticsCategory(categoryId)} />
      )}

      {/* Son girdiler + analize kısayol. Brütal, hiç girdi yokken boş
          pencere (alt kategori sayfasındaki gibi): Girdi ekle alt kategorisi
          olmayan kategoride doğrudan kategorinin formunu, alt kategorisi
          varsa kalem seçimini açar */}
      {brutal && summary && summary.entries === 0 ? (
        <>
          <SummaryBlock
            className="mb-4"
            compact
            lead={{
              kind: "count",
              color: "#ffb38a",
              glyph: ListIcon,
              overline: t("home.recentEntries"),
              value: "0",
              unit: t("home.entries"),
            }}
            stats={[]}
          >
            <SummaryEmpty
              text={t("brut.noEntries")}
              action={{
                label: t("home.addEntry"),
                onClick: async () => {
                  const hasSubs = !!tree?.subs.some((s) => s.categoryId === categoryId);
                  setEntrySub(hasSubs ? null : await getOrCreateCategoryRootSub(categoryId));
                  setEntryOpen(true);
                },
              }}
            />
          </SummaryBlock>
          <DayEntrySheet date={today} open={entryOpen} onClose={() => setEntryOpen(false)} presetSub={entrySub} />
        </>
      ) : (
        <RecentEntriesSection
          scope="category"
          categoryId={categoryId}
          selfName={category?.name}
          color={category?.color}
          total={summary?.entries}
        />
      )}
      </PageSheet>

      <SubCategoryForm
        open={subFormOpen}
        onOpenChange={(o) => {
          setSubFormOpen(o);
          if (!o) setNewParentId(undefined);
        }}
        categoryId={categoryId}
        parentSubcategoryId={newParentId}
        categoryName={category?.name}
      />

      <CategoryForm
        open={catFormOpen}
        onOpenChange={setCatFormOpen}
        category={category ?? undefined}
      />
    </>
  );
}
