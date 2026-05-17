"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Sparkles, FolderOpen, Folder } from "lucide-react";
import { db } from "@/lib/db";
import { listCategories } from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { SubCategory } from "@/types";

export default function EntryIndexPage() {
  const data = useLiveQuery(async () => {
    const cats = await listCategories();
    const allSubs = await db.subcategories.toArray();

    return cats.map((cat) => {
      const topSubs = allSubs
        .filter((s) => s.categoryId === cat.id && !s.parentId)
        .sort((a, b) => a.order - b.order);
      const withChildren = topSubs.map((sub) => ({
        sub,
        hasChildren: allSubs.some((s) => s.parentId === sub.id),
      }));
      return { category: cat, subcategories: withChildren };
    }).filter((g) => g.subcategories.length > 0);
  }, []);

  return (
    <>
      <PageHeader title="Girdi ekle" description="Bir kategori seç" />

      {data === undefined ? null : data.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Önce yapıyı oluştur"
          description="Girdi yapabilmek için en az bir kategori ve alt kategoriye ihtiyacın var."
          action={
            <Button asChild>
              <Link href="/structure">Yapıya git</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {data.map(({ category, subcategories }) => (
            <section key={category.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category.name}
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {subcategories.map(({ sub, hasChildren }) => (
                  <SubCategoryRow
                    key={sub.id}
                    sub={sub}
                    hasChildren={hasChildren}
                    categoryColor={category.color}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function SubCategoryRow({
  sub,
  hasChildren,
  categoryColor,
}: {
  sub: SubCategory;
  hasChildren: boolean;
  categoryColor: string;
}) {
  const Icon = hasChildren ? FolderOpen : Folder;
  return (
    <Link
      href={`/entry/${sub.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-card/80 active:scale-[0.99]"
    >
      <div
        className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${categoryColor}22` }}
      >
        <Icon className="h-5 w-5" style={{ color: categoryColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{sub.name}</div>
        {hasChildren && (
          <div className="text-xs text-muted-foreground">Alt kategoriler var</div>
        )}
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </Link>
  );
}
