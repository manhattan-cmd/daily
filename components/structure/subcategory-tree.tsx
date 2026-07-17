"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Folder, FolderOpen, Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { cn } from "@/lib/utils";
import type { EntryType, SubCategory } from "@/types";

type SubMods = { name?: string; entryType: EntryType }[];
type TreeData = {
  childrenMap: Map<string, SubCategory[]>;
  modsBySub: Map<string, SubMods>;
};

/**
 * Alt kategori ağacı — hiyerarşi iç içe açılır satırlarla. Her satır: kare
 * raf çekirdeği + ad + satırın kendi özellik atomları (minik daireler).
 * Ok, çocukları kategori renginde kılavuz çizgisiyle yerinde açar; her
 * seviyenin sonunda o seviyeye ekleme satırı vardır.
 */
export function SubCategoryTree({
  categoryId,
  color,
  parentId,
  onAddChild,
}: {
  categoryId: string;
  color: string;
  /** undefined: kategorinin kök alt kategorileri; dolu: bu düğümün çocukları */
  parentId?: string;
  /** parentSubId undefined ise kök seviyeye ekleme istenmiştir */
  onAddChild: (parentSubId?: string) => void;
}) {
  const data = useLiveQuery(async (): Promise<TreeData> => {
    const [subs, atts, mods, types] = await Promise.all([
      db.subcategories.where("categoryId").equals(categoryId).toArray(),
      db.categoryModifiers.toArray(),
      db.mods.toArray(),
      db.entryTypes.toArray(),
    ]);
    const visible = subs.filter((s) => !s.isCategoryRoot);
    const subIds = new Set(visible.map((s) => s.id));
    const modById = new Map(mods.map((m) => [m.id, m]));
    const typeById = new Map(types.map((t) => [t.id, t]));

    const modsBySub = new Map<string, SubMods>();
    for (const a of atts) {
      if (a.targetType !== "subcategory" || !subIds.has(a.targetId)) continue;
      const mod = a.modId ? modById.get(a.modId) : undefined;
      const entryType = typeById.get(mod?.entryTypeId ?? a.entryTypeId ?? "");
      if (!entryType) continue;
      const list = modsBySub.get(a.targetId) ?? [];
      list.push({ name: mod?.name, entryType });
      modsBySub.set(a.targetId, list);
    }

    const childrenMap = new Map<string, SubCategory[]>();
    for (const s of visible) {
      const key = s.parentId ?? "";
      const list = childrenMap.get(key) ?? [];
      list.push(s);
      childrenMap.set(key, list);
    }
    for (const list of childrenMap.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return { childrenMap, modsBySub };
  }, [categoryId]);

  if (!data) return null;
  const roots = data.childrenMap.get(parentId ?? "") ?? [];

  return (
    <div className="flex flex-col gap-0.5">
      {roots.map((sub) => (
        <TreeNode
          key={sub.id}
          sub={sub}
          depth={0}
          categoryId={categoryId}
          color={color}
          data={data}
          onAddChild={onAddChild}
        />
      ))}
      <AddRow
        label={
          roots.length === 0 ? "İlk alt kategoriyi ekle" : "Alt kategori ekle"
        }
        onClick={() => onAddChild(undefined)}
      />
    </div>
  );
}

function TreeNode({
  sub,
  depth,
  categoryId,
  color,
  data,
  onAddChild,
}: {
  sub: SubCategory;
  depth: number;
  categoryId: string;
  color: string;
  data: TreeData;
  onAddChild: (parentSubId?: string) => void;
}) {
  const kids = data.childrenMap.get(sub.id) ?? [];
  const mods = data.modsBySub.get(sub.id) ?? [];
  // Kökler dolu geliyorsa hiyerarşi ilk bakışta görünsün
  const [open, setOpen] = useState(depth === 0 && kids.length > 0);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        <Link
          href={`/structure/${categoryId}/${sub.id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-all hover:bg-white/5 active:scale-[0.99]"
        >
          <CategoryTileCore
            color={color}
            icon={sub.icon}
            fallback={kids.length > 0 ? FolderOpen : Folder}
            size="sm"
          />
          <span className="truncate text-sm font-medium">{sub.name}</span>

          {/* Satırın kendi atomları — minik daireler */}
          {mods.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
              {mods.slice(0, 3).map((m, i) => {
                const Icon = modAtomIcon(m);
                return (
                  <span
                    key={i}
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle at 32% 28%, rgba(129,140,248,0.30), rgba(129,140,248,0.07) 72%)",
                      boxShadow: "inset 0 0 0 1px rgba(129,140,248,0.22)",
                    }}
                  >
                    <Icon className="h-3 w-3 text-primary" strokeWidth={1.75} />
                  </span>
                );
              })}
              {mods.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{mods.length - 3}
                </span>
              )}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label={open ? `${sub.name} dalını kapat` : `${sub.name} dalını aç`}
          aria-expanded={open}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open && "rotate-90"
            )}
          />
        </button>
      </div>

      {/* Çocuklar — kategori renginde kılavuz çizgisiyle iç içe */}
      {open && (
        <div
          className="ml-[21px] flex flex-col gap-0.5 border-l pl-2.5"
          style={{ borderColor: `${color}2e` }}
        >
          {kids.map((child) => (
            <TreeNode
              key={child.id}
              sub={child}
              depth={depth + 1}
              categoryId={categoryId}
              color={color}
              data={data}
              onAddChild={onAddChild}
            />
          ))}
          <AddRow
            label={kids.length === 0 ? "İçine alt kategori ekle" : "Ekle"}
            onClick={() => onAddChild(sub.id)}
          />
        </div>
      )}
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 transition-colors group-hover:border-primary/50 group-hover:text-primary">
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      {label}
    </button>
  );
}
