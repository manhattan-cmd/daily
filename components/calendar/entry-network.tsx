"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  PenLine,
  Plus,
} from "lucide-react";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { CategoryForm } from "@/components/structure/category-form";
import { cn } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

export type NetGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

type Focus =
  | null
  | { type: "cat"; cat: Category }
  | { type: "sub"; sub: SubCategory };

type Node =
  | { kind: "cat"; cat: Category }
  | { kind: "sub"; sub: SubCategory };

const CANVAS = 300;
const C = CANVAS / 2;

/** Çokgen köşe açısı (ekran koordinatı) — 2 sağ/sol, 3 üçgen, 4 kare... */
function angleFor(i: number, n: number): number {
  if (n === 1) return Math.PI / 2;
  const deg = -90 + 180 / n + (i * 360) / n;
  return (deg * Math.PI) / 180;
}

/**
 * Girdi ekleme v2 — ağ tabanlı gezinme. Kök: ana kategoriler ağ olarak. Bir
 * düğüme dokun → onun "sayfası": ortada kendisi, çevresinde çocukları çokgen ağ.
 * Yaprakta ağ yok. Ortadakine (ya da menüden "Girdi ekle") dokun → forma geçer.
 * Breadcrumb ile yukarı; sayfa menüsünde "Girdi ekle" / "Alt kategori aç".
 */
export function EntryNetwork({
  groups,
  onSubSelect,
  onCategorySelect,
}: {
  groups: NetGroup[] | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
}) {
  const [focus, setFocus] = useState<Focus>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);

  const categories = useMemo(
    () => (groups ?? []).map((g) => g.category),
    [groups]
  );
  const visibleSubs = useMemo(
    () =>
      (groups ?? []).flatMap((g) => g.allSubs).filter((s) => !s.isCategoryRoot),
    [groups]
  );
  const childrenMap = useMemo(() => {
    const m = new Map<string, SubCategory[]>();
    for (const s of visibleSubs) {
      if (!s.parentId) continue;
      const arr = m.get(s.parentId) ?? [];
      arr.push(s);
      m.set(s.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    return m;
  }, [visibleSubs]);
  const subById = useMemo(
    () => new Map(visibleSubs.map((s) => [s.id, s])),
    [visibleSubs]
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const topSubsByCat = useMemo(
    () => new Map((groups ?? []).map((g) => [g.category.id, g.topSubs])),
    [groups]
  );

  const centerColor =
    focus == null
      ? "#818cf8"
      : focus.type === "cat"
        ? focus.cat.color
        : catById.get(focus.sub.categoryId)?.color ?? "#818cf8";

  const nodes: Node[] = useMemo(() => {
    if (focus == null) return categories.map((cat) => ({ kind: "cat", cat }));
    if (focus.type === "cat")
      return (topSubsByCat.get(focus.cat.id) ?? []).map((sub) => ({
        kind: "sub",
        sub,
      }));
    return (childrenMap.get(focus.sub.id) ?? []).map((sub) => ({
      kind: "sub",
      sub,
    }));
  }, [focus, categories, topSubsByCat, childrenMap]);

  const positions = useMemo(() => {
    const n = nodes.length;
    const R = n <= 4 ? 104 : Math.min(128, 88 + n * 6);
    return nodes.map((_, i) => {
      const a = angleFor(i, n);
      return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
    });
  }, [nodes]);

  const trail = useMemo(() => {
    const t: { label: string; focus: Focus }[] = [
      { label: "Kategoriler", focus: null },
    ];
    if (focus == null) return t;
    if (focus.type === "cat") {
      t.push({ label: focus.cat.name, focus });
      return t;
    }
    const chain: SubCategory[] = [];
    let cur: SubCategory | undefined = focus.sub;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    const cat = catById.get(focus.sub.categoryId);
    if (cat) t.push({ label: cat.name, focus: { type: "cat", cat } });
    for (const s of chain) t.push({ label: s.name, focus: { type: "sub", sub: s } });
    return t;
  }, [focus, subById, catById]);

  function drill(node: Node) {
    setFocus(
      node.kind === "cat"
        ? { type: "cat", cat: node.cat }
        : { type: "sub", sub: node.sub }
    );
  }
  function addEntryHere() {
    if (focus == null) return;
    if (focus.type === "cat") onCategorySelect(focus.cat);
    else onSubSelect(focus.sub);
  }
  function openAddSub() {
    setMenuOpen(false);
    if (focus == null) return;
    if (focus.type === "cat") setAddSub({ categoryId: focus.cat.id });
    else setAddSub({ categoryId: focus.sub.categoryId, parentId: focus.sub.id });
  }

  const focusName =
    focus == null
      ? "Kategoriler"
      : focus.type === "cat"
        ? focus.cat.name
        : focus.sub.name;
  const hasNodes = nodes.length > 0;
  const polyPoints = positions.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col">
      {/* Breadcrumb + sayfa menüsü */}
      <div className="mb-2 flex items-center gap-1">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
          {trail.map((t, i) => (
            <span key={i} className="flex shrink-0 items-center">
              {i > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
              <button
                onClick={() => setFocus(t.focus)}
                className={cn(
                  "max-w-[120px] truncate rounded px-1.5 py-0.5 text-xs transition-colors",
                  i === trail.length - 1
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            </span>
          ))}
        </div>

        {focus != null ? (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Sayfa menüsü"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      addEntryHere();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                  >
                    <PenLine className="h-4 w-4 text-primary" />
                    Girdi ekle
                  </button>
                  <button
                    onClick={openAddSub}
                    className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    Alt kategori aç
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAddCatOpen(true)}
            aria-label="Yeni kategori"
            className="flex h-7 items-center gap-1 rounded-full bg-white/8 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/12 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Kategori
          </button>
        )}
      </div>

      {/* Ağ tuvali */}
      <div
        className="relative mx-auto"
        style={{ width: CANVAS, height: CANVAS, maxWidth: "100%" }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox={`0 0 ${CANVAS} ${CANVAS}`}
          width="100%"
          height="100%"
        >
          {focus != null &&
            positions.map((p, i) => (
              <line
                key={i}
                x1={C}
                y1={C}
                x2={p.x}
                y2={p.y}
                stroke={`${centerColor}40`}
                strokeWidth={1.5}
              />
            ))}
          {positions.length === 2 && (
            <line
              x1={positions[0].x}
              y1={positions[0].y}
              x2={positions[1].x}
              y2={positions[1].y}
              stroke={`${centerColor}45`}
              strokeWidth={1.5}
            />
          )}
          {positions.length >= 3 && (
            <polygon
              points={polyPoints}
              fill={`${centerColor}0f`}
              stroke={`${centerColor}50`}
              strokeWidth={1.5}
            />
          )}
        </svg>

        {/* Merkez düğüm — dokun: buraya ekle */}
        {focus != null && (
          <button
            onClick={addEntryHere}
            aria-label={`${focusName} · buraya ekle`}
            className="absolute z-10 flex flex-col items-center gap-1"
            style={{ left: C, top: C, transform: "translate(-50%,-50%)" }}
          >
            <span className="relative">
              <CategoryTileCore
                color={centerColor}
                icon={focus.type === "cat" ? focus.cat.icon : focus.sub.icon}
                fallback={FolderOpen}
                size="lg"
              />
              <span
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-white"
                style={{ backgroundColor: centerColor }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
              </span>
            </span>
            <span className="max-w-[104px] truncate text-center text-xs font-semibold">
              {focusName}
            </span>
          </button>
        )}

        {/* Çevre düğümler */}
        {nodes.map((node, i) => {
          const p = positions[i];
          const isCat = node.kind === "cat";
          const id = isCat ? node.cat.id : node.sub.id;
          const name = isCat ? node.cat.name : node.sub.name;
          const icon = isCat ? node.cat.icon : node.sub.icon;
          const nodeColor = isCat ? node.cat.color : centerColor;
          const hasKids =
            !isCat && (childrenMap.get(node.sub.id)?.length ?? 0) > 0;
          return (
            <button
              key={id}
              onClick={() => drill(node)}
              className="absolute flex flex-col items-center gap-0.5"
              style={{ left: p.x, top: p.y, transform: "translate(-50%,-50%)" }}
            >
              <span className="relative">
                <CategoryTileCore
                  color={nodeColor}
                  icon={icon}
                  fallback={hasKids ? FolderOpen : Folder}
                />
                {hasKids && (
                  <span
                    className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: nodeColor }}
                  />
                )}
              </span>
              <span className="max-w-[80px] truncate text-center text-[10px] font-medium leading-tight text-muted-foreground">
                {name}
              </span>
            </button>
          );
        })}

        {focus == null && !hasNodes && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Henüz kategori yok. Sağ üstten ekle.
          </p>
        )}
      </div>

      {/* İpucu */}
      {focus != null && (
        <p className="mt-1 text-center text-[11px] leading-snug text-muted-foreground/70">
          {hasNodes
            ? "Çevredekine dokun → içine gir · ortadakine dokun → buraya ekle"
            : "Bu bir uç — ortadakine dokun ya da menüden “Girdi ekle”."}
        </p>
      )}

      {/* Alt kategori aç */}
      <SubCategoryForm
        open={addSub !== null}
        onOpenChange={(o) => {
          if (!o) setAddSub(null);
        }}
        categoryId={addSub?.categoryId ?? ""}
        parentSubcategoryId={addSub?.parentId}
        categoryName={addSub ? catById.get(addSub.categoryId)?.name : undefined}
      />

      {/* Yeni kategori (kök) */}
      <CategoryForm open={addCatOpen} onOpenChange={setAddCatOpen} />
    </div>
  );
}
