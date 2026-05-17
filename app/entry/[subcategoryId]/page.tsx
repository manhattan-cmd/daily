"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, FolderOpen, Folder } from "lucide-react";
import Link from "next/link";
import { getSubCategory, listEntryTypes, createEntry } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import {
  EntryFormFields,
  isRowValid,
  type TypeValueRow,
} from "@/components/forms/entry-form-fields";
import type { EntryType, SubCategory, Category } from "@/types";

export default function EntrySubcategoryPage({
  params,
}: {
  params: Promise<{ subcategoryId: string }>;
}) {
  const { subcategoryId } = use(params);

  const data = useLiveQuery(async () => {
    const sub = await getSubCategory(subcategoryId);
    if (!sub) return null;
    const cat = await db.categories.get(sub.categoryId);
    const allSubs = await db.subcategories.toArray();
    const children = allSubs
      .filter((s) => s.parentId === subcategoryId)
      .sort((a, b) => a.order - b.order);
    const childrenWithMeta = children.map((c) => ({
      sub: c,
      hasChildren: allSubs.some((s) => s.parentId === c.id),
    }));
    const entryTypes = await listEntryTypes();

    const path: SubCategory[] = [];
    let current: SubCategory | undefined = sub;
    while (current) {
      path.unshift(current);
      if (!current.parentId) break;
      current = await db.subcategories.get(current.parentId);
    }

    return { sub, cat, children: childrenWithMeta, entryTypes, path };
  }, [subcategoryId]);

  if (!data) return null;

  const backHref = data.sub.parentId
    ? `/entry/${data.sub.parentId}`
    : "/entry";

  if (data.children.length > 0) {
    return (
      <NavigationView
        sub={data.sub}
        cat={data.cat}
        children={data.children}
        path={data.path}
        backHref={backHref}
      />
    );
  }

  return (
    <EntryCreateView
      sub={data.sub}
      cat={data.cat}
      initialTypes={data.entryTypes}
      path={data.path}
      backHref={backHref}
    />
  );
}

function NavigationView({
  sub,
  cat,
  children,
  path,
  backHref,
}: {
  sub: SubCategory;
  cat: Category | undefined;
  children: { sub: SubCategory; hasChildren: boolean }[];
  path: SubCategory[];
  backHref: string;
}) {
  return (
    <>
      <PageHeader title={sub.name} description={cat?.name} back={backHref} />
      <Breadcrumb path={path} catName={cat?.name} />
      <div className="flex flex-col gap-2 mt-4">
        {children.map(({ sub: child, hasChildren }) => {
          const Icon = hasChildren ? FolderOpen : Folder;
          return (
            <Link
              key={child.id}
              href={`/entry/${child.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-card/80 active:scale-[0.99]"
            >
              <div
                className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: cat ? `${cat.color}22` : "#6366f122",
                }}
              >
                <Icon
                  className="h-5 w-5"
                  style={{ color: cat?.color ?? "#6366f1" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{child.name}</div>
                {hasChildren && (
                  <div className="text-xs text-muted-foreground">
                    Alt kategoriler var
                  </div>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Breadcrumb({
  path,
  catName,
}: {
  path: SubCategory[];
  catName?: string;
}) {
  if (path.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mt-1">
      {catName && (
        <>
          <span>{catName}</span>
          <ChevronRight className="h-3 w-3" />
        </>
      )}
      {path.map((p, i) => (
        <span key={p.id} className="flex items-center gap-1">
          <span
            className={
              i === path.length - 1 ? "text-foreground font-medium" : ""
            }
          >
            {p.name}
          </span>
          {i < path.length - 1 && <ChevronRight className="h-3 w-3" />}
        </span>
      ))}
    </div>
  );
}

function EntryCreateView({
  sub,
  cat,
  initialTypes,
  path,
  backHref,
}: {
  sub: SubCategory;
  cat: Category | undefined;
  initialTypes: EntryType[];
  path: SubCategory[];
  backHref: string;
}) {
  const router = useRouter();

  const [types, setTypes] = useState<EntryType[]>(initialTypes);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<TypeValueRow[]>([
    { entryTypeId: "", value: "" },
  ]);
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [showDate, setShowDate] = useState(false);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);

  const validRows = rows.filter((r) => {
    const t = types.find((t) => t.id === r.entryTypeId);
    return isRowValid(r, t);
  });
  const isFormValid = title.trim() && validRows.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    setSaving(true);
    try {
      await createEntry({
        subcategoryId: sub.id,
        title: title.trim(),
        typeValues: validRows.map((r) => ({
          entryTypeId: r.entryTypeId,
          value: r.value.trim(),
        })),
        occurredAt: showDate ? new Date(occurredAt).getTime() : undefined,
        notes: notes.trim() || undefined,
      });
      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={sub.name} description={cat?.name} back={backHref} />
      <Breadcrumb path={path} catName={cat?.name} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-4 pb-4">
        <EntryFormFields
          types={types}
          onTypesChange={setTypes}
          title={title}
          onTitleChange={setTitle}
          rows={rows}
          onRowsChange={setRows}
          occurredAt={occurredAt}
          onOccurredAtChange={setOccurredAt}
          showDate={showDate}
          onShowDateChange={setShowDate}
          notes={notes}
          onNotesChange={setNotes}
          showNotes={showNotes}
          onShowNotesChange={setShowNotes}
        />

        <Button
          type="submit"
          size="lg"
          disabled={saving || !isFormValid}
          className="mt-2"
        >
          Kaydet
        </Button>
      </form>
    </>
  );
}
