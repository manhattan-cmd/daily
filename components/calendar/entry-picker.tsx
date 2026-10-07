"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  X,
  LayoutList,
  PanelRight,
} from "lucide-react";
import {
  loadUsageCounts,
  USAGE_COUNTS_KEY,
  useCachedLiveQuery,
} from "@/lib/db/live-cache";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, SubCategory } from "@/types";
import { routes } from "@/lib/routes";

export type NetGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Hızlı ekle bölmesindeki en fazla kalem */
const QUICK_MAX = 8;
/** Rayın ilk durağı — kategori değil, hızlı ekle bölmesi */
const QUICK = "quick";
/** Olay işleyicisinde okunan saat — çizim saf kalsın diye modül düzeyinde */
const tapClock = () => performance.now();
/** İki dokunuş arası bu kadar kısaysa çift dokunuş */
const DOUBLE_TAP_MS = 280;
/** Rayın genişliği; form yandan açıkken yalnız simgelere daralır */
const RAIL_W = 96;
export const RAIL_COMPACT_W = 64;

/**
 * Hızlı eklemeye elle sabitlenen kalemler (localStorage).
 *
 * Bölme kendiliğinden en çok kullanılanlarla doluyor ama bu her zaman
 * yetmiyor: yeni edinilen bir alışkanlık daha sayı biriktirmediği için
 * oraya giremiyor, oysa kullanıcının en çok gireceği yer tam da orası.
 * Sabitlenenler önde, kalan yerleri sıklık dolduruyor.
 *
 * Cihazda kalan bir görünüm tercihi olduğu için localStorage yetiyor —
 * Dexie'ye tablo açmak yedek/senkron yüzeyini de büyütürdü.
 */
const LS_PINS = "entrypicker:pins";
/** Rayda en son bakılan durak — pencere yeniden açılınca oradan başlar */
const LS_RAIL = "entrypicker:rail";

/*
 * GÖRÜNÜM: "ray" (sağda kategori rayı, form soldan pencere) ya da "raf"
 * (tek uzun sayfa, her kategori bir raf; form eskisi gibi bütün yüzeyi
 * kaplar). İkisi de deneniyor; seçim cihazda kalır, ⋯ menüsünden değişir.
 * Seçici de girdi penceresi de aynı değeri okur (form nasıl açılacak).
 */
export type EntryLayout = "ray" | "raf";
const LS_LAYOUT = "entrypicker:layout";
const layoutListeners = new Set<() => void>();
function readLayout(): EntryLayout {
  if (typeof window === "undefined") return "raf";
  try {
    return localStorage.getItem(LS_LAYOUT) === "ray" ? "ray" : "raf";
  } catch {
    return "raf";
  }
}
export function setEntryLayout(v: EntryLayout) {
  try {
    localStorage.setItem(LS_LAYOUT, v);
  } catch {
    /* kalıcı yazılamazsa da bu oturumda geçerli olsun diye aşağıda */
  }
  memLayout = v;
  layoutListeners.forEach((l) => l());
}
let memLayout: EntryLayout | null = null;
export function useEntryLayout(): EntryLayout {
  return useSyncExternalStore(
    (cb) => {
      layoutListeners.add(cb);
      return () => layoutListeners.delete(cb);
    },
    () => memLayout ?? readLayout(),
    () => "raf"
  );
}

function readPins(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PINS) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return []; // okunamayan tercih sessizce boş sayılır
  }
}
function readRail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LS_RAIL);
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

type Result =
  | { kind: "cat"; cat: Category }
  | { kind: "sub"; sub: SubCategory; path: string; kids: number };

/**
 * Girdi eklerken "nereye" sorusunun cevabı — RAY düzeni.
 *
 * Solda dikey kategori rayı, sağda seçilen kategorinin BÜTÜN kalemleri.
 * Eskiden her kademe yeni bir sayfaydı: "Harcamalar › Yemek › Dışardan
 * Yemek" için iki sayfa ileri, yanlışta iki sayfa geri. Şimdi sayfa hiç
 * değişmiyor; kategoriye dokunmak yalnız sağ bölmeyi değiştiriyor, alt
 * kalemler kendi grubunda girintili duruyor. Kategori adları rayda hep
 * okunur.
 *
 * Bir süre burada bir sinir ağı vardı (Yapı > Harita'ya taşındı): girdi
 * eklemek SERİ bir iş, seçicinin ölçüsü hız.
 */
export function EntryPicker({
  groups,
  onPick,
  onPickCategory,
  onClose,
  onCreateCategory,
  compact = false,
  onRailNavigate,
}: {
  groups: NetGroup[] | undefined;
  /**
   * Bir kaleme kayıt aç. Seçicinin tek çıkışı bu: kaleme dokunmak, hızlı
   * ekle ve dalın kendisi aynı yüzeyi açıyor.
   */
  onPick: (sub: SubCategory) => void;
  onPickCategory: (category: Category) => void;
  onClose: () => void;
  /** Ana kategori yaratma formunu aç — ⋯ menüsünde */
  onCreateCategory?: () => void;
  /**
   * Form sağdan açık: ray simgelere daralır, arama ve başlık formun
   * altında kalır. Raya dokunmak formu kapatıp oraya gider.
   */
  compact?: boolean;
  onRailNavigate?: () => void;
}) {
  const t = useT();
  const layout = useEntryLayout();
  const [rail, setRailState] = useState<string>(() => readRail() ?? QUICK);
  // Kullanıcı raya kendisi dokunduysa boş "Hızlı ekle"den kaçırılmaz
  const [railTouched, setRailTouched] = useState(false);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  /*
   * İLERLEYEN RAY. Bölme her seferinde TEK kat gösterir; alt kalemi olan
   * bir dala basınca dal raya, kategorisinin altına bir iple ilişir ve
   * bölme onun sayfasına geçer. Raydaki her basamak bir geri dönüş noktası.
   * path: seçili kategorinin altında inilen dallar (kökten derine).
   */
  const [path, setPath] = useState<string[]>([]);
  const paneRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  /*
   * ÇİFT DOKUNUŞ. Kategoriye ya da dala çift dokunmak onun KENDİSİNE kayıt
   * açar (eskiden başlıktaki "+ genel" düğmesiydi; o yere "+ alt kategori"
   * geldi). Raydaki duraklarda tek dokunuş hemen çalışır, ikincisi kaydı
   * açar. Bölmedeki dalda tek dokunuş dalı raya taşıyıp bölmeyi değiştirdiği
   * için kısa bir süre ikinci dokunuş beklenir — yoksa ikinci dokunuş
   * değişen bölmede başka bir kaleme düşerdi.
   */
  const lastTap = useRef<{ key: string; t: number } | null>(null);
  const pendingDrill = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => {
    if (pendingDrill.current) clearTimeout(pendingDrill.current.timer);
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  // Dala basınca karosu bölmeden raydaki yerine uçar (bkz. useLayoutEffect)
  const fly = useRef<{ id: string; rect: DOMRect; node: HTMLElement } | null>(null);
  // Hızlı eklemeye elle eklenenler + onları seçtiren panel
  const [pins, setPins] = useState<string[]>(readPins);
  const [pinOpen, setPinOpen] = useState(false);

  function setRail(id: string) {
    setRailState(id);
    setRailTouched(true);
    setPath([]);
    try {
      localStorage.setItem(LS_RAIL, id);
    } catch {
      /* kalıcı yazılamazsa oturum boyunca geçerli */
    }
  }

  function togglePin(id: string) {
    setPins((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem(LS_PINS, JSON.stringify(next));
      } catch {
        /* kalıcı yazılamazsa oturum boyunca geçerli */
      }
      return next;
    });
  }

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

  /** Kalemin yolu — "Harcamalar › Yemek"; aynı adlı iki kalemi ayırır */
  const pathOf = useMemo(
    () => (s: SubCategory) => {
      const parts: string[] = [];
      let cur = s.parentId ? subById.get(s.parentId) : undefined;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? subById.get(cur.parentId) : undefined;
      }
      return [catById.get(s.categoryId)?.name, ...parts]
        .filter(Boolean)
        .join(" › ");
    },
    [subById, catById]
  );

  // Sayım son 30 güne bakıyor (lib/usage): "sık kullanılanlar" şu anki
  // hayatı göstermeli, arşivi değil.
  const entryCounts =
    useCachedLiveQuery(USAGE_COUNTS_KEY, loadUsageCounts) ?? NO_COUNTS;

  /**
   * Hızlı ekle — ağacın HER YERİNDEN, en çok kayıt alan kalemler. Önce
   * elle sabitlenenler (kullanıcının sırasıyla), sonra sıklık. Sayım
   * kalemin KENDİ girdisi: dokunulunca kayıt oraya gidecek.
   */
  const quick = useMemo(() => {
    const pinned = pins
      .map((id) => subById.get(id))
      .filter((s): s is SubCategory => !!s);
    const seen = new Set(pinned.map((s) => s.id));
    const byUse = visibleSubs
      .filter((s) => !seen.has(s.id))
      .map((sub) => ({ sub, n: entryCounts.get(sub.id) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((x) => x.sub);
    return [...pinned, ...byUse].slice(0, QUICK_MAX);
  }, [visibleSubs, subById, entryCounts, pins]);

  /** Hızlı eklemeye eklenebilecekler: bütün kalemler, sabitlenmişler üstte */
  const pinCandidates = useMemo(
    () =>
      visibleSubs
        .map((sub) => ({
          id: sub.id,
          name: sub.name,
          icon: sub.icon,
          color: catById.get(sub.categoryId)?.color ?? "#818cf8",
          path: pathOf(sub),
        }))
        .sort((a, b) => {
          const pa = pins.indexOf(a.id);
          const pb = pins.indexOf(b.id);
          if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
          return a.path.localeCompare(b.path, "en") || a.name.localeCompare(b.name, "en");
        }),
    [visibleSubs, catById, pins, pathOf]
  );

  /*
   * Gösterilen durak. Hızlı ekle boşken (yeni kullanıcı, sabitleme yok)
   * açılış ilk kategoriye düşer — boş bir bölmeyle karşılamasın. Kullanıcı
   * raydan "Hızlı"ya kendisi dokunduysa boş hâli (sabitleme düğmesiyle)
   * görür. Silinmiş bir kategori hatırlanmışsa da yine ilk kategoriye.
   */
  const firstCat = categories[0]?.id ?? QUICK;
  const railSel =
    rail === QUICK
      ? quick.length === 0 && !railTouched
        ? firstCat
        : QUICK
      : catById.has(rail)
        ? rail
        : firstCat;
  const selCat = railSel === QUICK ? null : catById.get(railSel) ?? null;
  /** Rayda ilişik duran dallar — silinmiş ya da başka kategoriye ait olan düşer */
  const pathNodes = selCat
    ? path
        .map((id) => subById.get(id))
        .filter((x): x is SubCategory => !!x && x.categoryId === selCat.id)
    : [];
  const node = pathNodes[pathNodes.length - 1] ?? null;
  /** Bölmenin gösterdiği katın kalemleri */
  const level = selCat
    ? node
      ? childrenMap.get(node.id) ?? []
      : topSubsByCat.get(selCat.id) ?? []
    : [];
  const nodeKey = node ? node.id : railSel;

  /** Arama BÜTÜN ağaçta — kategoriler ve her derinlikteki kalemler */
  const q = norm(query);
  const results = useMemo<Result[] | null>(() => {
    if (!q) return null;
    const cats = categories
      .filter((c) => norm(c.name).includes(q))
      .map<Result>((cat) => ({ kind: "cat", cat }));
    const subs = visibleSubs
      .filter((s) => norm(s.name).includes(q))
      .slice(0, 40)
      .map<Result>((sub) => ({
        kind: "sub",
        sub,
        path: pathOf(sub),
        kids: childrenMap.get(sub.id)?.length ?? 0,
      }));
    return [...cats, ...subs];
  }, [q, categories, visibleSubs, childrenMap, pathOf]);

  /**
   * Arama sonucuna dokunmak: kategori → rayda o kategori; alt kalemi olan
   * bir dal → kategorisi açılır ve dal bütün yoluyla raya ilişir (altına
   * bakmak isteyen dalı arıyor); yaprak → doğrudan form.
   */
  function openResult(r: Result) {
    setQuery("");
    if (r.kind === "cat") {
      setRail(r.cat.id);
      return;
    }
    if (r.kids === 0) {
      onPick(r.sub);
      return;
    }
    setRail(r.sub.categoryId);
    const chain: string[] = [];
    let cur: SubCategory | undefined = r.sub;
    while (cur) {
      chain.unshift(cur.id);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    setPath(chain);
  }

  function isDoubleTap(key: string): boolean {
    const now = tapClock();
    const last = lastTap.current;
    if (last && last.key === key && now - last.t < DOUBLE_TAP_MS) {
      lastTap.current = null;
      return true;
    }
    lastTap.current = { key, t: now };
    return false;
  }

  /** Bölmede alt kalemi olan dala dokunuş: tekse in, çiftse kendisine kayıt */
  function tapBranch(sub: SubCategory, el: HTMLElement) {
    const p = pendingDrill.current;
    if (p) clearTimeout(p.timer);
    pendingDrill.current = null;
    if (p?.id === sub.id) {
      onPick(sub);
      return;
    }
    pendingDrill.current = {
      id: sub.id,
      timer: setTimeout(() => {
        pendingDrill.current = null;
        drill(sub, el);
      }, DOUBLE_TAP_MS),
    };
  }

  /** Bir dala in — karosu raydaki yerine uçacak */
  function drill(sub: SubCategory, from: HTMLElement) {
    const tile = from.querySelector<HTMLElement>("[data-tile]");
    if (tile)
      fly.current = {
        id: sub.id,
        rect: tile.getBoundingClientRect(),
        node: tile.cloneNode(true) as HTMLElement,
      };
    setPath(pathNodes.map((p) => p.id).concat(sub.id));
  }

  /*
   * İLİŞME HAREKETİ. Basılan dalın karosunun bir kopyası bölmedeki yerinden
   * raydaki yeni basamağın karosuna kayıp küçülür; varınca kopya kalkar,
   * gerçek karo görünür. Kopya pencerenin kendi kutusuna eklenir: pencere
   * dönüşümlü (transform) olduğu için sabit konum ona göre kayardı.
   */
  useLayoutEffect(() => {
    const f = fly.current;
    fly.current = null;
    const root = rootRef.current;
    if (!f || !root || f.id !== node?.id) return;
    // Ray döngüde: aynı basamak her kopyada var — görünen yere en yakını
    const railBox = railRef.current?.getBoundingClientRect();
    const mid = railBox ? railBox.top + railBox.height / 2 : 0;
    let target: HTMLElement | null = null;
    let best = Infinity;
    for (const el of root.querySelectorAll<HTMLElement>(
      `[data-rail-node="${f.id}"] [data-tile]`
    )) {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < best) {
        best = d;
        target = el;
      }
    }
    if (!target) return;
    target.scrollIntoView({ block: "nearest" });
    const rr = root.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const clone = f.node;
    Object.assign(clone.style, {
      position: "absolute",
      left: `${f.rect.left - rr.left}px`,
      top: `${f.rect.top - rr.top}px`,
      margin: "0",
      zIndex: "50",
      pointerEvents: "none",
      transformOrigin: "top left",
    });
    root.appendChild(clone);
    target.style.opacity = "0";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anim = clone.animate(
      [
        { transform: "none" },
        {
          transform: `translate(${tr.left - f.rect.left}px, ${tr.top - f.rect.top}px) scale(${tr.width / f.rect.width})`,
        },
      ],
      { duration: reduce ? 0 : 440, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" }
    );
    const done = () => {
      clone.remove();
      target.style.opacity = "";
    };
    anim.onfinish = done;
    return () => {
      anim.cancel();
      done();
    };
  }, [node?.id]);

  /*
   * SONSUZ RAY. Duraklar kopyalanıp alt alta diziliyor; kaydırma ortadaki
   * kopyanın yarısından taşınca görünmeden bir kopya boyu geri alınıyor.
   * Böylece ray ne üstte ne altta bitiyor: istenen kategori başparmağın
   * rahat ettiği yüksekliğe getirilip basılabiliyor. Çok az kategoride
   * (ikiden az) döngü yok.
   */
  const railCopies = categories.length < 2 ? 1 : categories.length < 6 ? 5 : 3;
  const railMid = Math.floor(railCopies / 2);
  const copyHeight = () => {
    const el = railRef.current;
    const a = el?.querySelector<HTMLElement>('[data-rail-copy="0"]');
    const b = el?.querySelector<HTMLElement>('[data-rail-copy="1"]');
    return a && b ? b.offsetTop - a.offsetTop : 0;
  };
  const showRail = !results;
  useLayoutEffect(() => {
    const el = railRef.current;
    if (!el || railCopies === 1) return;
    el.scrollTop = copyHeight() * railMid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRail, railCopies]);
  function onRailScroll() {
    const el = railRef.current;
    const h = copyHeight();
    if (!el || !h || railCopies === 1) return;
    if (el.scrollTop < h * (railMid - 0.5)) el.scrollTop += h;
    else if (el.scrollTop > h * (railMid + 0.5)) el.scrollTop -= h;
  }

  // Kat değişince bölme başa döner
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [nodeKey]);

  const structureHref = selCat ? routes.structureCategory(selCat.id) : "";

  return (
    <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col">
      {/* Üst çubuk — SAĞDA kapat (ray gibi sağ başparmağın altında), ortada
          soru, solda yapı işlemleri (⋯). Yapı kurmak girdi eklemeye gelen
          kişinin ilk işi değil; eskiden "Kategori yarat" ekranın en görünür
          düğmesiydi. */}
      <div className="flex shrink-0 flex-row-reverse items-center gap-2 px-4 pb-1 pt-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className={ROUND}
        >
          <X className="h-[18px] w-[18px]" />
        </button>
        <h2
          className={cn(
            "min-w-0 flex-1 truncate text-center text-[17px] font-bold tracking-tight transition-opacity duration-200",
            compact && "opacity-0"
          )}
        >
          {t("entry.pickTitle")}
        </h2>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={t("entry.moreActions")}
          aria-expanded={menuOpen}
          className={ROUND}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div
        className={cn(
          "shrink-0 px-4 pb-3 pt-2 transition-opacity duration-200",
          compact && "pointer-events-none opacity-0"
        )}
      >
        <label className="flex h-11 items-center gap-2.5 rounded-2xl bg-[var(--sf-2)] px-4 ring-1 ring-inset ring-[var(--ln-1)] transition-shadow focus-within:ring-2 focus-within:ring-primary/50">
          <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("entry.searchAll")}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("action.close")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sf-4)] text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      </div>

      {results ? (
        /* Aramada ray çekilir: sonuçlar yollarıyla birlikte tam genişlikte */
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {results.length === 0 ? (
            <p className="px-1 py-10 text-center text-sm text-muted-foreground">
              {t("entry.noMatch")}
            </p>
          ) : (
            <div className="entry-stagger flex flex-col">
              {results.map((r) =>
                r.kind === "cat" ? (
                  <PaneRow
                    key={r.cat.id}
                    color={r.cat.color}
                    icon={r.cat.icon}
                    name={r.cat.name}
                    sub={t("structure.categories")}
                    onClick={() => openResult(r)}
                  />
                ) : (
                  <PaneRow
                    key={r.sub.id}
                    color={catById.get(r.sub.categoryId)?.color ?? "#818cf8"}
                    icon={r.sub.icon}
                    name={r.sub.name}
                    sub={r.path}
                    onClick={() => openResult(r)}
                  />
                )
              )}
            </div>
          )}
        </div>
      ) : layout === "raf" ? (
        <ShelfBody
          categories={categories}
          topSubsByCat={topSubsByCat}
          childrenMap={childrenMap}
          quick={quick}
          catById={catById}
          onPick={onPick}
          onPickCategory={onPickCategory}
          onEditQuick={() => setPinOpen(true)}
          onAddSub={(categoryId, parentId) => setAddSub({ categoryId, parentId })}
        />
      ) : (
        /* Ray SAĞDA: sağ elle tutan kişinin başparmağı kategorilerin
           üstünde. Form soldan gelip rayın yanında durur. */
        <div className="relative flex min-h-0 flex-1 flex-row-reverse">
          {/* Rayı bölmeden ayıran ince çizgi — uçlarda söner, kayan rayla
              birlikte kaymaz */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 w-px transition-opacity",
              compact && "opacity-0"
            )}
            style={{
              right: RAIL_W,
              background:
                "linear-gradient(to bottom, transparent, var(--ln-2) 10%, var(--ln-2) 90%, transparent)",
            }}
          />
          {/* RAY — hızlı ekle + kategoriler. Seçili durak kendi renginde
              zeminlenir; adlar hep okunur. */}
          <nav
            ref={railRef}
            onScroll={onRailScroll}
            onClickCapture={compact ? () => onRailNavigate?.() : undefined}
            className="no-scrollbar flex shrink-0 flex-col overflow-y-auto overscroll-contain pl-2 pr-2 transition-[width] duration-300 ease-out"
            style={{ width: compact ? RAIL_COMPACT_W : RAIL_W }}
          >
            {Array.from({ length: railCopies }, (_, copy) => (
              <div
                key={copy}
                data-rail-copy={copy}
                // Ekran okuyucu ortadaki kopyayı okur; ötekiler yalnız döngü için
                aria-hidden={copy !== railMid || undefined}
                className="flex shrink-0 flex-col gap-1 pb-1"
              >
                <RailItem
                  active={railSel === QUICK}
                  activeBg="var(--sf-3)"
                  label={t("entry.quickShort")}
                  compact={compact}
                  onClick={() => setRail(QUICK)}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[var(--sf-3)]">
                    <Star className="h-[21px] w-[21px] fill-amber-400 text-amber-400" />
                  </span>
                </RailItem>
                {categories.map((c) => (
                  <div key={c.id} className="flex shrink-0 flex-col">
                    <RailItem
                      active={railSel === c.id}
                      activeBg={pathNodes.length && railSel === c.id ? `${c.color}17` : `${c.color}29`}
                      label={c.name}
                      compact={compact}
                      onClick={() => {
                        if (isDoubleTap(`c:${c.id}`)) return onPickCategory(c);
                        if (railSel === c.id) setPath([]);
                        else setRail(c.id);
                      }}
                    >
                      <Tile color={c.color} icon={c.icon} size={44} />
                    </RailItem>
                    {/* İnilen dallar kategorinin altına bir iple ilişik durur;
                        basamağa basmak o kata döner, çift dokunmak kendisine
                        kayıt açar */}
                    {railSel === c.id && pathNodes.length > 0 && (
                      <div className="relative flex flex-col gap-0.5 pb-1 pt-0.5">
                        <span
                          aria-hidden
                          className="absolute -top-1 bottom-6 left-1/2 w-[2px] -translate-x-1/2 rounded-full"
                          style={{ background: `${c.color}66` }}
                        />
                        {pathNodes.map((p, i) => {
                          const last = i === pathNodes.length - 1;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              data-rail-node={p.id}
                              onClick={() => {
                                if (isDoubleTap(`s:${p.id}`)) return onPick(p);
                                setPath(path.slice(0, i + 1));
                              }}
                              aria-pressed={last}
                              className="entry-tile-pop relative flex flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 pt-1.5 transition-[background-color,transform] active:scale-95"
                              style={last ? { background: `${c.color}29` } : undefined}
                            >
                              <span data-tile className="shrink-0">
                                <Tile color={c.color} icon={p.icon} size={34} />
                              </span>
                              <span
                                className={cn(
                                  "block w-full truncate text-center text-[10.5px] leading-[14px]",
                                  last ? "font-semibold text-foreground" : "text-muted-foreground",
                                  compact && "hidden"
                                )}
                              >
                                {p.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </nav>

          {/* BÖLME — seçilen durağın bütün kalemleri */}
          <div
            ref={paneRef}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pl-3 pr-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            <div key={nodeKey} className={cn("entry-stagger flex flex-col", node && "entry-push")}>
              {selCat == null ? (
                <>
                  <PaneHead
                    title={t("entry.quickAdd")}
                    action={
                      <button
                        type="button"
                        onClick={() => setPinOpen(true)}
                        className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10"
                      >
                        {quick.length ? t("action.edit") : t("action.add")}
                      </button>
                    }
                  />
                  {quick.length > 0 ? (
                    quick.map((sub) => (
                      <PaneRow
                        key={sub.id}
                        color={catById.get(sub.categoryId)?.color ?? "#818cf8"}
                        icon={sub.icon}
                        name={sub.name}
                        sub={pathOf(sub)}
                        onClick={() => onPick(sub)}
                      />
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPinOpen(true)}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] py-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      {t("entry.pinTitle")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Başlıkta bu kata alt kategori açma. Kendisine kayıt
                      artık çift dokunuşla (raydaki durak ya da bölmedeki dal) */}
                  <PaneHead
                    title={node ? node.name : selCat.name}
                    action={
                      <button
                        type="button"
                        onClick={() =>
                          setAddSub({ categoryId: selCat.id, parentId: node?.id })
                        }
                        className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-[var(--sf-2)] px-2.5 text-[12px] font-semibold text-muted-foreground transition-[transform,color] hover:text-foreground active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
                        {t("entry.subShort")}
                      </button>
                    }
                  />
                  {level.map((sub) => {
                    const kids = childrenMap.get(sub.id)?.length ?? 0;
                    return (
                      <PaneRow
                        key={sub.id}
                        color={selCat.color}
                        icon={sub.icon}
                        name={sub.name}
                        sub={kids ? t("entry.subCount", { n: kids }) : undefined}
                        branch={kids > 0}
                        onClick={(e) => (kids ? tapBranch(sub, e.currentTarget) : onPick(sub))}
                      />
                    );
                  })}
                  {level.length === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAddSub({ categoryId: selCat.id, parentId: node?.id })
                      }
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] py-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <FolderPlus className="h-4 w-4" />
                      {t("tree.createSubcategory")}
                    </button>
                  )}
                </>
              )}
              {categories.length === 0 && (
                <p className="px-1 py-10 text-center text-sm text-muted-foreground">
                  {t("tree.noCategoriesYet")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ⋯ — yapı işlemleri. Ayrı diyalog değil, aynı yüzeyde küçük bir
          menü: üst üste açılan diyaloglar bu uygulamada kırılgan. */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="animate-in fade-in zoom-in-95 absolute left-4 top-[60px] z-40 flex min-w-[220px] flex-col overflow-hidden rounded-2xl border border-[var(--ln-2)] bg-card p-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]">
            {onCreateCategory && (
              <MenuItem
                icon={<Plus className="h-4 w-4" strokeWidth={2.25} />}
                label={t("entry.createCategory")}
                onClick={() => {
                  setMenuOpen(false);
                  onCreateCategory();
                }}
              />
            )}
            <MenuItem
              icon={
                layout === "raf" ? (
                  <PanelRight className="h-4 w-4" />
                ) : (
                  <LayoutList className="h-4 w-4" />
                )
              }
              label={layout === "raf" ? t("entry.layoutToRay") : t("entry.layoutToRaf")}
              onClick={() => {
                setMenuOpen(false);
                setEntryLayout(layout === "raf" ? "ray" : "raf");
              }}
            />
            {layout === "ray" && selCat && (
              <MenuItem
                icon={<FolderPlus className="h-4 w-4" />}
                label={t("tree.createSubcategory")}
                hint={node ? node.name : selCat.name}
                onClick={() => {
                  setMenuOpen(false);
                  setAddSub({ categoryId: selCat.id, parentId: node?.id });
                }}
              />
            )}
            {layout === "ray" && selCat && (
              /* prefetch açıkça: pencere içindeki bağlantıda görünürlük
                 tabanlı önden çekme tetiklenmiyor */
              <Link
                href={structureHref}
                prefetch
                onClick={onClose}
                className={MENU_ITEM}
              >
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block">{t("tree.structurePage")}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {selCat.name}
                  </span>
                </span>
              </Link>
            )}
          </div>
        </>
      )}

      {/* ── Hızlı eklemeye ekle ─────────────────────────────────────────
          Ayrı bir diyalog değil, aynı yüzeyin üstünde bir panel. Seçilen
          kalem bölmede en öne geçiyor, tekrar dokunmak çıkarıyor. */}
      {pinOpen && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/50"
            onClick={() => setPinOpen(false)}
          />
          <div className="animate-in absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-2xl border-t border-[var(--ln-2)] bg-background">
            <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight">
                  {t("entry.pinTitle")}
                </div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">
                  {t("entry.pinHint")}
                </div>
              </div>
              <button
                onClick={() => setPinOpen(false)}
                aria-label={t("action.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sf-2)] text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-6">
              <div className="overflow-hidden rounded-xl border border-[var(--ln-1)] bg-[var(--sf-1)]">
                {pinCandidates.map((c) => {
                  const on = pins.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => togglePin(c.id)}
                      aria-pressed={on}
                      className="flex min-h-[56px] w-full items-center gap-3 border-t border-[var(--ln-1)] px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-[var(--sf-2)] active:bg-[var(--sf-3)]"
                    >
                      <Tile color={c.color} icon={c.icon} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-5 text-foreground">
                          {c.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
                          {c.path}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                          on ? "text-white" : "bg-[var(--sf-2)] text-muted-foreground/50"
                        )}
                        style={on ? { backgroundColor: c.color } : undefined}
                      >
                        {on ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        ) : (
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <SubCategoryForm
        open={addSub !== null}
        onOpenChange={(o) => {
          if (!o) setAddSub(null);
        }}
        categoryId={addSub?.categoryId ?? ""}
        parentSubcategoryId={addSub?.parentId}
        categoryName={addSub ? catById.get(addSub.categoryId)?.name : undefined}
      />
    </div>
  );
}

/**
 * Karonun üstünde okunacak mürekkep. Sarı, limon, açık turkuaz gibi
 * renklerde beyaz simge kayboluyor; parlaklığa göre siyaha dönüyor.
 */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return L > 0.45 ? "#0b0c10" : "#ffffff";
}

/**
 * Kalemin karosu — DOLU renk, üstünde okunur bir simge.
 *
 * İki uçtan da dönüldü. Önce dışa ışıyan bir haleydi ve liste boyunca
 * tekrarlayınca sayfa uzay boşluğuna dönüyordu; sonra rengi %16 alfaya
 * indirdik ve bu sefer her şey soldu. Doğrusu ortada değil, başka bir
 * yerde: renk TAM doygun ama ışımıyor. Karo listenin renk çıpası,
 * gerisi nötr kalıyor.
 */
function Tile({
  color,
  icon,
  fallback: Fallback = Folder,
  size = 40,
}: {
  color: string;
  icon?: string;
  fallback?: typeof Folder;
  size?: number;
}) {
  const ink = inkOn(color);
  const glyph = Math.round(size * 0.5);
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: color,
        // Üstten gelen ince ışık + koyu çeper: dolu renk yassı durmasın
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
      }}
    >
      {icon ? (
        <SymbolIcon name={icon} size={glyph} style={{ color: ink }} />
      ) : (
        <Fallback
          style={{ color: ink, width: glyph, height: glyph }}
          strokeWidth={2}
        />
      )}
    </span>
  );
}

/** Üst çubuğun yuvarlak simge düğmesi */
const ROUND =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sf-2)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-3)] active:scale-95";
const MENU_ITEM =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium transition-colors hover:bg-[var(--sf-2)] active:bg-[var(--sf-3)]";

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={MENU_ITEM}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && (
          <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}

/**
 * RAF görünümü — tek uzun sayfa. Üstte raflara atlatan sakin bir sekme
 * şeridi; altında önce hızlı ekle, sonra her kategori bir raf.
 *
 * İlk denemede kalemler farklı genişlikte haplardı, her hapın sembolü ayrı
 * renkteydi, her rafın "+ genel"i renkli bir çipti: ekranda aynı anda on
 * renk ve hizasız satırlar — "korkunç karışık". Şimdi her raf 4 sütunlu
 * DÜZGÜN bir ızgara, renk yalnız karolarda (seçicinin her yerindeki karo
 * dili), başlıklar sessiz. Altı olan dal klasör gibi açılır: kendi satırının
 * hemen altında, bütün satırı kaplayan bir kutu; içinde önce dalın kendisi
 * ("Genel"), sonra alt kalemler. Aynı anda tek dal yolu açık kalır.
 */
const SHELF_COLS = 4;

function ShelfBody({
  categories,
  topSubsByCat,
  childrenMap,
  quick,
  catById,
  onPick,
  onPickCategory,
  onEditQuick,
  onAddSub,
}: {
  categories: Category[];
  topSubsByCat: Map<string, SubCategory[]>;
  childrenMap: Map<string, SubCategory[]>;
  quick: SubCategory[];
  catById: Map<string, Category>;
  onPick: (sub: SubCategory) => void;
  onPickCategory: (cat: Category) => void;
  onEditQuick: () => void;
  onAddSub: (categoryId: string, parentId?: string) => void;
}) {
  const t = useT();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** Açık dal yolu — kökten derine; başka dala basmak öncekini kapatır */
  const [openPath, setOpenPath] = useState<string[]>([]);
  // Şeritte vurgulanan raf — sayfa kaydıkça güncellenir
  const [active, setActive] = useState<string>(QUICK);

  function toggle(id: string, depth: number) {
    setOpenPath((prev) =>
      prev[depth] === id ? prev.slice(0, depth) : [...prev.slice(0, depth), id]
    );
  }

  function jump(id: string) {
    const body = bodyRef.current;
    const sec = body?.querySelector<HTMLElement>(`[data-shelf="${id}"]`);
    if (!body || !sec) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.scrollTo({ top: sec.offsetTop - 4, behavior: reduce ? "auto" : "smooth" });
  }

  function onScroll() {
    const body = bodyRef.current;
    if (!body) return;
    let cur = QUICK;
    for (const el of body.querySelectorAll<HTMLElement>("[data-shelf]")) {
      if (el.offsetTop - 24 <= body.scrollTop) cur = el.dataset.shelf ?? cur;
    }
    if (cur !== active) {
      setActive(cur);
      stripRef.current
        ?.querySelector(`[data-jump="${cur}"]`)
        ?.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }

  /**
   * Bir kalem ızgarası. Açık dalın kutusu, dalın bulunduğu SATIRIN sonuna
   * (bütün satırı kaplayarak) yerleşir — klasör gibi.
   */
  function grid(items: SubCategory[], color: string, depth: number, lead?: React.ReactNode) {
    const cells: React.ReactNode[] = [];
    if (lead) cells.push(lead);
    let panel: React.ReactNode = null;
    let panelAfter = -1;
    items.forEach((sub) => {
      const kids = childrenMap.get(sub.id) ?? [];
      const isOpen = openPath[depth] === sub.id;
      cells.push(
        <ShelfTile
          key={sub.id}
          color={color}
          icon={sub.icon}
          label={sub.name}
          count={kids.length || undefined}
          open={isOpen}
          onClick={() => (kids.length ? toggle(sub.id, depth) : onPick(sub))}
        />
      );
      if (isOpen && kids.length) {
        const idx = cells.length - 1;
        panelAfter = Math.min(
          Math.ceil((idx + 1) / SHELF_COLS) * SHELF_COLS - 1,
          items.length + (lead ? 1 : 0) - 1
        );
        panel = (
          <div
            key={`${sub.id}-in`}
            className="entry-stagger col-span-full rounded-2xl bg-[var(--sf-1)] p-1.5 ring-1 ring-inset ring-[var(--ln-1)]"
          >
            {grid(
              kids,
              color,
              depth + 1,
              <ShelfTile
                key={`${sub.id}-self`}
                color={color}
                label={t("entry.general")}
                self
                onClick={() => onPick(sub)}
              />
            )}
          </div>
        );
      }
    });
    if (panel) cells.splice(panelAfter + 1, 0, panel);
    return <div className="grid grid-cols-4 gap-x-1 gap-y-2">{cells}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Atlama şeridi — yazı sekmeleri; renk yalnız küçük noktada */}
      <div
        ref={stripRef}
        className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto px-3 pb-2"
      >
        {[{ id: QUICK, name: t("entry.quickShort"), color: "#fbbf24" }, ...categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))].map(
          (s) => (
            <button
              key={s.id}
              type="button"
              data-jump={s.id}
              onClick={() => jump(s.id)}
              aria-pressed={active === s.id}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                active === s.id
                  ? "bg-[var(--sf-3)] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </button>
          )
        )}
      </div>

      <div
        ref={bodyRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40vh)" }}
      >
        <div className="entry-stagger flex flex-col gap-7 pt-2">
          <section data-shelf={QUICK} className="flex flex-col gap-2">
            <ShelfHead
              title={t("entry.quickAdd")}
              action={quick.length ? t("action.edit") : t("action.add")}
              onAction={onEditQuick}
            />
            {quick.length > 0 ? (
              <div className="grid grid-cols-4 gap-x-1 gap-y-2">
                {quick.map((sub) => (
                  <ShelfTile
                    key={sub.id}
                    color={catById.get(sub.categoryId)?.color ?? "#818cf8"}
                    icon={sub.icon}
                    label={sub.name}
                    onClick={() => onPick(sub)}
                  />
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={onEditQuick}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] py-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                {t("entry.pinTitle")}
              </button>
            )}
          </section>

          {categories.map((c) => {
            const top = topSubsByCat.get(c.id) ?? [];
            return (
              <section key={c.id} data-shelf={c.id} className="flex flex-col gap-2">
                <ShelfHead
                  title={c.name}
                  color={c.color}
                  action={`+ ${t("entry.general")}`}
                  onAction={() => onPickCategory(c)}
                />
                {top.length > 0 ? (
                  grid(
                    top,
                    c.color,
                    0
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => onAddSub(c.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <FolderPlus className="h-4 w-4" />
                    {t("tree.createSubcategory")}
                  </button>
                )}
              </section>
            );
          })}
          {categories.length === 0 && (
            <p className="px-1 py-10 text-center text-sm text-muted-foreground">
              {t("tree.noCategoriesYet")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Rafın başlığı — sessiz: küçük renk noktası, ad, sağda yazı düğmesi */
function ShelfHead({
  title,
  color,
  action,
  onAction,
}: {
  title: string;
  color?: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-1.5">
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
      <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight">{title}</h3>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
      >
        {action}
      </button>
    </div>
  );
}

/**
 * Izgara karosu — dolu renkli kare + altında ad. Altı olan dalda köşede
 * sayısı; açıkken karo çerçevelenir. `self`: açılan dalın kendisine kayıt
 * (kesik çerçeveli artı).
 */
function ShelfTile({
  color,
  icon,
  label,
  count,
  open,
  self,
  onClick,
}: {
  color: string;
  icon?: string;
  label: string;
  count?: number;
  open?: boolean;
  self?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={count ? !!open : undefined}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0.5 pb-1.5 pt-2 transition-[background-color,transform] hover:bg-[var(--sf-1)] active:scale-[0.95]"
    >
      <span className="relative">
        {self ? (
          <span
            className="flex h-12 w-12 items-center justify-center rounded-[14px] border-[1.5px] border-dashed"
            style={{ borderColor: `${color}99`, color }}
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </span>
        ) : (
          <span
            className="block rounded-[14px] transition-shadow"
            style={open ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${color}` } : undefined}
          >
            <Tile color={color} icon={icon} size={48} />
          </span>
        )}
        {count ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-background px-1 text-[10px] font-bold tabular-nums text-foreground ring-1 ring-[var(--ln-2)]">
            {count}
          </span>
        ) : null}
      </span>
      <span className="line-clamp-2 w-full text-center text-[11.5px] font-medium leading-[14px] text-foreground/90 first-letter:uppercase">
        {label}
      </span>
    </button>
  );
}

/** Rayın bir durağı — karo ve altında adı; seçili durak zeminlenir */
function RailItem({
  active,
  activeBg,
  label,
  compact,
  onClick,
  children,
}: {
  active: boolean;
  activeBg: string;
  label: string;
  /** Form açıkken yalnız karo — ad gizli */
  compact?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={compact ? label : undefined}
      className={cn(
        "flex shrink-0 flex-col items-center gap-1 rounded-2xl px-0.5 transition-[background-color,transform] active:scale-95",
        compact ? "py-1.5" : "pb-1.5 pt-2"
      )}
      style={active ? { background: activeBg } : undefined}
    >
      {children}
      <span
        className={cn(
          "block w-full truncate text-center text-[11px] leading-[14px]",
          active ? "font-semibold text-foreground" : "text-muted-foreground",
          compact && "hidden"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Bölmenin başlığı — durağın adı, sağda bir eylem */
function PaneHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1.5 pb-2 pt-1.5">
      <h3 className="min-w-0 flex-1 truncate text-[19px] font-bold tracking-tight">
        {title}
      </h3>
      {action}
    </div>
  );
}

/**
 * Bölme satırı — çerçevesiz, dokununca hafifçe zeminlenir. Altı olmayan
 * kalem kaydı açar; altı olan dal (branch, sağda ok) raya ilişip kendi
 * katını açar — dalın KENDİSİNE kayıt bölme başlığındaki "+ genel"de.
 */
function PaneRow({
  color,
  icon,
  name,
  sub,
  branch,
  onClick,
}: {
  color: string;
  icon?: string;
  name: string;
  sub?: string;
  branch?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-[var(--sf-2)] active:bg-[var(--sf-3)]"
    >
      <span data-tile className="shrink-0">
        <Tile color={color} icon={icon} fallback={branch ? FolderOpen : Folder} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-5 text-foreground">
          {name}
        </span>
        {sub && (
          <span className="block truncate text-xs leading-4 text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
      {branch && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
    </button>
  );
}
