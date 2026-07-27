"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  MoreHorizontal,
  PenLine,
  Plus,
} from "lucide-react";
import {
  setSubcategoryPos,
  setCategoryPos,
} from "@/lib/db/queries";
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

/** Odak — id tabanlı (sheet'te tutulur; form→geri odağı korur, veri güncellemesine dayanıklı) */
export type NetFocus =
  | null
  | { type: "cat"; id: string }
  | { type: "sub"; id: string };

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
 * Düğümler basılı tutulup sürüklenerek serbestçe yerleştirilir (netPos kalıcı).
 * Sayfa menüsü: Girdi ekle · Alt kategori aç · Yapı sayfası.
 */
export function EntryNetwork({
  groups,
  focus,
  onFocusChange,
  onSubSelect,
  onCategorySelect,
  onClose,
}: {
  groups: NetGroup[] | undefined;
  focus: NetFocus;
  onFocusChange: (focus: NetFocus) => void;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);

  // Sürükleme: basılı tut → serbest taşı → bırakınca netPos kaydolur
  const [drag, setDrag] = useState<{ id: string; kind: "cat" | "sub" } | null>(
    null
  );
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

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

  const focusObj: Focus = useMemo(() => {
    if (focus == null) return null;
    if (focus.type === "cat") {
      const c = catById.get(focus.id);
      return c ? { type: "cat", cat: c } : null;
    }
    const s = subById.get(focus.id);
    return s ? { type: "sub", sub: s } : null;
  }, [focus, catById, subById]);

  const centerColor =
    focusObj == null
      ? "#818cf8"
      : focusObj.type === "cat"
        ? focusObj.cat.color
        : catById.get(focusObj.sub.categoryId)?.color ?? "#818cf8";

  const nodes: Node[] = useMemo(() => {
    if (focusObj == null)
      return categories.map((cat) => ({ kind: "cat", cat }));
    if (focusObj.type === "cat")
      return (topSubsByCat.get(focusObj.cat.id) ?? []).map((sub) => ({
        kind: "sub",
        sub,
      }));
    return (childrenMap.get(focusObj.sub.id) ?? []).map((sub) => ({
      kind: "sub",
      sub,
    }));
  }, [focusObj, categories, topSubsByCat, childrenMap]);

  // Konum: kullanıcı sürükleyip kaydettiyse netPos, yoksa çokgen yuvası
  const positions = useMemo(() => {
    const n = nodes.length;
    const R = n <= 4 ? 104 : Math.min(128, 88 + n * 6);
    return nodes.map((node, i) => {
      const custom = node.kind === "cat" ? node.cat.netPos : node.sub.netPos;
      if (custom) return { x: custom.x, y: custom.y, custom: true };
      const a = angleFor(i, n);
      return { x: C + R * Math.cos(a), y: C + R * Math.sin(a), custom: false };
    });
  }, [nodes]);

  const nodeId = (node: Node) => (node.kind === "cat" ? node.cat.id : node.sub.id);
  // Sürüklenen düğüm anlık parmak konumunda gösterilir (ışın/çokgen de takip eder)
  const effPositions = positions.map((p, i) => {
    if (drag && dragPos && drag.id === nodeId(nodes[i])) return dragPos;
    return { x: p.x, y: p.y };
  });
  const anyCustom = positions.some((p) => p.custom) || drag != null;

  const trail = useMemo(() => {
    const t: { label: string; focus: NetFocus }[] = [
      { label: "Kategoriler", focus: null },
    ];
    if (focusObj == null) return t;
    if (focusObj.type === "cat") {
      t.push({
        label: focusObj.cat.name,
        focus: { type: "cat", id: focusObj.cat.id },
      });
      return t;
    }
    const chain: SubCategory[] = [];
    let cur: SubCategory | undefined = focusObj.sub;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    const cat = catById.get(focusObj.sub.categoryId);
    if (cat) t.push({ label: cat.name, focus: { type: "cat", id: cat.id } });
    for (const s of chain)
      t.push({ label: s.name, focus: { type: "sub", id: s.id } });
    return t;
  }, [focusObj, subById, catById]);

  // Sürükleme pencere olayları
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = CANVAS / rect.width;
      let x = (e.clientX - rect.left) * scale;
      let y = (e.clientY - rect.top) * scale;
      x = Math.max(28, Math.min(CANVAS - 28, x));
      y = Math.max(28, Math.min(CANVAS - 28, y));
      const np = { x, y };
      posRef.current = np;
      setDragPos(np);
    };
    const onUp = async () => {
      const p = posRef.current;
      const d = drag;
      setDrag(null);
      setDragPos(null);
      posRef.current = null;
      if (!d || !p) return;
      const pos = { x: Math.round(p.x), y: Math.round(p.y) };
      if (d.kind === "sub") await setSubcategoryPos(d.id, pos);
      else await setCategoryPos(d.id, pos);
    };
    const prevent = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", prevent);
    };
  }, [drag]);

  function startDrag(node: Node, p: { x: number; y: number }) {
    setDrag({ id: nodeId(node), kind: node.kind });
    setDragPos(p);
    posRef.current = p;
    navigator.vibrate?.(12);
  }
  function drill(node: Node) {
    onFocusChange(
      node.kind === "cat"
        ? { type: "cat", id: node.cat.id }
        : { type: "sub", id: node.sub.id }
    );
  }
  function addEntryHere() {
    if (focusObj == null) return;
    if (focusObj.type === "cat") onCategorySelect(focusObj.cat);
    else onSubSelect(focusObj.sub);
  }
  function openAddSub() {
    setMenuOpen(false);
    if (focusObj == null) return;
    if (focusObj.type === "cat") setAddSub({ categoryId: focusObj.cat.id });
    else
      setAddSub({
        categoryId: focusObj.sub.categoryId,
        parentId: focusObj.sub.id,
      });
  }
  function goStructure() {
    setMenuOpen(false);
    if (focusObj == null) return;
    const path =
      focusObj.type === "cat"
        ? `/structure/${focusObj.cat.id}`
        : `/structure/${focusObj.sub.categoryId}/${focusObj.sub.id}`;
    onClose();
    router.push(path);
  }

  const focusName =
    focusObj == null
      ? "Kategoriler"
      : focusObj.type === "cat"
        ? focusObj.cat.name
        : focusObj.sub.name;
  const hasNodes = nodes.length > 0;
  const polyPoints = effPositions.map((p) => `${p.x},${p.y}`).join(" ");

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
                onClick={() => onFocusChange(t.focus)}
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

        {focusObj != null ? (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Sayfa menüsü"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                menuOpen
                  ? "bg-primary/20 text-primary"
                  : "bg-white/8 text-muted-foreground hover:bg-white/12 hover:text-foreground"
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                {/* Arka planı karart */}
                <div
                  className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[1px]"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-9 z-40 w-60 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl">
                  {/* Bağlam başlığı — hangi sayfadayız */}
                  <div className="flex items-center gap-2.5 border-b border-border bg-white/[0.03] px-3 py-2.5">
                    <CategoryTileCore
                      color={centerColor}
                      icon={
                        focusObj.type === "cat"
                          ? focusObj.cat.icon
                          : focusObj.sub.icon
                      }
                      fallback={FolderOpen}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {focusName}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        {focusObj.type === "cat" ? "kategori" : "alt kategori"}
                      </div>
                    </div>
                  </div>

                  <MenuItem
                    icon={<PenLine className="h-4 w-4 text-primary" />}
                    title="Girdi ekle"
                    subtitle="Bu sayfaya kayıt ekle"
                    onClick={() => {
                      setMenuOpen(false);
                      addEntryHere();
                    }}
                  />
                  <MenuItem
                    icon={<FolderPlus className="h-4 w-4 text-muted-foreground" />}
                    title="Alt kategori aç"
                    subtitle="İçine yeni alt kategori"
                    onClick={openAddSub}
                  />
                  <MenuItem
                    icon={<Layers className="h-4 w-4 text-muted-foreground" />}
                    title="Yapı sayfası"
                    subtitle="Düzenle / taşı / sil"
                    onClick={goStructure}
                  />
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
        ref={canvasRef}
        className="relative mx-auto touch-none"
        style={{ width: CANVAS, height: CANVAS, maxWidth: "100%" }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox={`0 0 ${CANVAS} ${CANVAS}`}
          width="100%"
          height="100%"
        >
          {focusObj != null &&
            effPositions.map((p, i) => (
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
          {focusObj == null && effPositions.length === 2 && (
            <line
              x1={effPositions[0].x}
              y1={effPositions[0].y}
              x2={effPositions[1].x}
              y2={effPositions[1].y}
              stroke={`${centerColor}45`}
              strokeWidth={1.5}
            />
          )}
          {!anyCustom && effPositions.length >= 3 && (
            <polygon
              points={polyPoints}
              fill={`${centerColor}0f`}
              stroke={`${centerColor}50`}
              strokeWidth={1.5}
            />
          )}
        </svg>

        {/* Merkez düğüm — dokun: buraya ekle */}
        {focusObj != null && (
          <button
            onClick={addEntryHere}
            aria-label={`${focusName} · buraya ekle`}
            className="absolute z-10 flex flex-col items-center gap-1"
            style={{ left: C, top: C, transform: "translate(-50%,-50%)" }}
          >
            <span className="relative">
              <CategoryTileCore
                color={centerColor}
                icon={focusObj.type === "cat" ? focusObj.cat.icon : focusObj.sub.icon}
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

        {/* Çevre düğümler — dokun: gir · basılı tut: sürükle */}
        {nodes.map((node, i) => {
          const p = effPositions[i];
          const isCat = node.kind === "cat";
          const id = nodeId(node);
          const name = isCat ? node.cat.name : node.sub.name;
          const icon = isCat ? node.cat.icon : node.sub.icon;
          const nodeColor = isCat ? node.cat.color : centerColor;
          const hasKids =
            !isCat && (childrenMap.get(node.sub.id)?.length ?? 0) > 0;
          return (
            <NetNode
              key={id}
              x={p.x}
              y={p.y}
              color={nodeColor}
              icon={icon}
              name={name}
              hasKids={hasKids}
              isDragging={drag?.id === id}
              onTap={() => drill(node)}
              onDragStart={() => startDrag(node, p)}
            />
          );
        })}

        {focusObj == null && !hasNodes && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Henüz kategori yok. Sağ üstten ekle.
          </p>
        )}
      </div>

      {/* İpucu */}
      {focusObj != null ? (
        <p className="mt-1 text-center text-[11px] leading-snug text-muted-foreground/70">
          {hasNodes
            ? "Dokun: içine gir · ortadaki: buraya ekle · basılı tutup sürükle: taşı"
            : "Bu bir uç — ortadakine dokun ya da menüden “Girdi ekle”."}
        </p>
      ) : (
        hasNodes && (
          <p className="mt-1 text-center text-[11px] leading-snug text-muted-foreground/70">
            Dokun: içine gir · basılı tutup sürükle: yerini değiştir
          </p>
        )
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

function MenuItem({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-border/60 px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/5 active:bg-white/[0.07]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

/**
 * Ağ düğümü — dokun: içine gir; basılı tut (350ms): sürükleyerek yerini değiştir.
 * Erken hareket sürüklemeyi başlatmaz (dokunuş gibi kalır).
 */
function NetNode({
  x,
  y,
  color,
  icon,
  name,
  hasKids,
  isDragging,
  onTap,
  onDragStart,
}: {
  x: number;
  y: number;
  color: string;
  icon?: string;
  name: string;
  hasKids: boolean;
  isDragging: boolean;
  onTap: () => void;
  onDragStart: () => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const started = useRef(false);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <button
      onClick={() => {
        if (started.current) {
          started.current = false;
          return;
        }
        onTap();
      }}
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        started.current = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          started.current = true;
          onDragStart();
        }, 350);
      }}
      onPointerMove={(e) => {
        if (!downPos.current || started.current) return;
        if (
          Math.abs(e.clientX - downPos.current.x) > 8 ||
          Math.abs(e.clientY - downPos.current.y) > 8
        )
          clearHold();
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "absolute flex select-none flex-col items-center gap-0.5 transition-transform",
        isDragging ? "z-20 scale-110" : "z-0"
      )}
      style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
    >
      <span className="relative">
        <span
          className="block rounded-xl"
          style={
            isDragging
              ? { outline: `2px solid ${color}`, outlineOffset: "2px" }
              : undefined
          }
        >
          <CategoryTileCore
            color={color}
            icon={icon}
            fallback={hasKids ? FolderOpen : Folder}
          />
        </span>
        {hasKids && (
          <span
            className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background"
            style={{ backgroundColor: color }}
          />
        )}
      </span>
      <span className="max-w-[80px] truncate text-center text-[10px] font-medium leading-tight text-muted-foreground">
        {name}
      </span>
    </button>
  );
}
