"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Folder, FolderOpen, Plus, X } from "lucide-react";
import { CategoryTileCore } from "@/components/structure/category-tile";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, SubCategory } from "@/types";

type Focus =
  | { type: "sub"; sub: SubCategory }
  | { type: "cat"; cat: Category };

const BOX = 300;
const CENTER = BOX / 2;

/** Çocuk açısı (ekran koordinatı, y aşağı) — 2 sağ/sol, 3 üçgen, 4 kare... */
function childAngle(i: number, n: number): number {
  if (n === 1) return Math.PI / 2; // tek çocuk: altta
  const deg = -90 + 180 / n + (i * 360) / n;
  return (deg * Math.PI) / 180;
}

/**
 * DENEME: Radyal keşif penceresi. Bir alt kategoriye basınca açılır; ortada o
 * düğüm, çevresinde çocukları çokgen köşelerinde. Üstte bir üst kategori (çıkış).
 * Ortadakine dokun → oraya girdi ekle. Çocuk: varsa içine in, yoksa seç (form).
 */
export function RadialExplorer({
  initialSub,
  catById,
  subById,
  childrenMap,
  topSubsByCat,
  onSelectSub,
  onSelectCat,
  onClose,
}: {
  initialSub: SubCategory;
  catById: Map<string, Category>;
  subById: Map<string, SubCategory>;
  childrenMap: Map<string, SubCategory[]>;
  topSubsByCat: Map<string, SubCategory[]>;
  onSelectSub: (sub: SubCategory) => void;
  onSelectCat: (cat: Category) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [focus, setFocus] = useState<Focus>({ type: "sub", sub: initialSub });
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const color =
    focus.type === "cat"
      ? focus.cat.color
      : catById.get(focus.sub.categoryId)?.color ?? "#818cf8";
  const focusName = focus.type === "cat" ? focus.cat.name : focus.sub.name;

  const children: SubCategory[] = useMemo(
    () =>
      focus.type === "cat"
        ? topSubsByCat.get(focus.cat.id) ?? []
        : childrenMap.get(focus.sub.id) ?? [],
    [focus, topSubsByCat, childrenMap]
  );

  const parent: Focus | null = useMemo(() => {
    if (focus.type === "cat") return null;
    if (focus.sub.parentId) {
      const p = subById.get(focus.sub.parentId);
      return p ? { type: "sub", sub: p } : null;
    }
    const cat = catById.get(focus.sub.categoryId);
    return cat ? { type: "cat", cat } : null;
  }, [focus, subById, catById]);

  const positions = useMemo(() => {
    const n = children.length;
    const R = n <= 4 ? 100 : Math.min(126, 84 + n * 6);
    return children.map((_, i) => {
      const a = childAngle(i, n);
      return { x: CENTER + R * Math.cos(a), y: CENTER + R * Math.sin(a) };
    });
  }, [children]);

  function selectFocus() {
    if (focus.type === "cat") onSelectCat(focus.cat);
    else onSelectSub(focus.sub);
  }
  function tapChild(child: SubCategory) {
    if ((childrenMap.get(child.id)?.length ?? 0) > 0)
      setFocus({ type: "sub", sub: child });
    else onSelectSub(child);
  }

  const polygonPoints = positions.map((p) => `${p.x},${p.y}`).join(" ");

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[80] flex items-center justify-center px-4 transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Arka plan — dokununca kapan */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Pencere */}
      <div
        className={cn(
          "relative z-10 w-full max-w-[360px] rounded-3xl border border-white/10 bg-background/95 p-4 shadow-2xl transition-transform duration-200",
          shown ? "scale-100" : "scale-95"
        )}
        style={{ boxShadow: `0 0 0 1px ${color}22, 0 24px 60px rgba(0,0,0,.7)` }}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/12"
          aria-label={t("tree.closeWindow")}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Bir üst kategori — çıkış */}
        <div className="flex justify-center pb-1 pt-1">
          {parent ? (
            <button
              onClick={() => setFocus(parent)}
              aria-label={`Up: ${parent.type === "cat" ? parent.cat.name : parent.sub.name}`}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              {parent.type === "cat" ? parent.cat.name : parent.sub.name}
            </button>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
              en üst
            </span>
          )}
        </div>

        {/* Radyal alan */}
        <div
          className="relative mx-auto"
          style={{ width: BOX, height: BOX, maxWidth: "100%" }}
        >
          {/* Çokgen + ışınlar */}
          <svg
            className="pointer-events-none absolute inset-0"
            viewBox={`0 0 ${BOX} ${BOX}`}
            width="100%"
            height="100%"
          >
            {positions.map((p, i) => (
              <line
                key={i}
                x1={CENTER}
                y1={CENTER}
                x2={p.x}
                y2={p.y}
                stroke={`${color}40`}
                strokeWidth={1.5}
              />
            ))}
            {positions.length >= 3 && (
              <polygon
                points={polygonPoints}
                fill={`${color}0f`}
                stroke={`${color}55`}
                strokeWidth={1.5}
              />
            )}
          </svg>

          {/* Merkez düğüm — dokun: buraya ekle */}
          <button
            onClick={selectFocus}
            aria-label={`${focusName} · buraya ekle`}
            className="absolute z-10 flex flex-col items-center gap-1"
            style={{ left: CENTER, top: CENTER, transform: "translate(-50%,-50%)" }}
          >
            <span className="relative">
              <CategoryTileCore
                color={color}
                icon={focus.type === "cat" ? focus.cat.icon : focus.sub.icon}
                fallback={FolderOpen}
                size="lg"
              />
              <span
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-white"
                style={{ backgroundColor: color }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
              </span>
            </span>
            <span className="max-w-[92px] truncate text-center text-xs font-semibold">
              {focusName}
            </span>
          </button>

          {/* Çocuklar — çokgen köşelerinde */}
          {children.map((child, i) => {
            const p = positions[i];
            const hasKids = (childrenMap.get(child.id)?.length ?? 0) > 0;
            return (
              <button
                key={child.id}
                onClick={() => tapChild(child)}
                className="absolute flex flex-col items-center gap-0.5"
                style={{ left: p.x, top: p.y, transform: "translate(-50%,-50%)" }}
              >
                <span className="relative">
                  <CategoryTileCore
                    color={color}
                    icon={child.icon}
                    fallback={hasKids ? FolderOpen : Folder}
                  />
                  {hasKids && (
                    <span
                      className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </span>
                <span className="max-w-[76px] truncate text-center text-[10px] font-medium leading-tight text-muted-foreground">
                  {child.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* İpucu */}
        <p className="pt-1 text-center text-[11px] text-muted-foreground/70">
          Ortadakine dokun → buraya ekle · çevredekine dokun → içine gir
        </p>
      </div>
    </div>,
    document.body
  );
}
