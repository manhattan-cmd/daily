"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Plus,
  Search,
  X,
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

/** Odak — id tabanlı, veri güncellemesine dayanıklı */
type Focus =
  | null
  | { type: "cat"; cat: Category }
  | { type: "sub"; sub: SubCategory };

type FocusRef =
  | null
  | { type: "cat"; id: string }
  | { type: "sub"; id: string };

type Node =
  | { kind: "cat"; cat: Category }
  | { kind: "sub"; sub: SubCategory };

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Bu sayıdan sonra arama kutusu çıkıyor */
const SEARCH_FROM = 10;
/** Bu sayıdan sonra A–Z bölümlere ayrılıyor */
const SECTIONS_FROM = 14;
/** Hızlı ekle ızgarası: iki satır × dört karo */
const QUICK_MAX = 8;

/**
 * Şeride elle sabitlenen kalemler (localStorage).
 *
 * Şerit kendiliğinden en çok kullanılanlarla doluyor ama bu her zaman
 * yetmiyor: yeni edinilen bir alışkanlık daha sayı biriktirmediği için
 * şeride giremiyor, oysa kullanıcının en çok gireceği yer tam da orası.
 * Sabitlenenler önde, kalan yerleri sıklık dolduruyor.
 *
 * Cihazda kalan bir görünüm tercihi olduğu için localStorage yetiyor —
 * Dexie'ye tablo açmak yedek/senkron yüzeyini de büyütürdü.
 */
const LS_PINS = "entrypicker:pins";

function readPins(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PINS) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return []; // okunamayan tercih sessizce boş sayılır
  }
}

/** Türkçe duyarlı bölüm başlığı — ada göre A–Z gruplaması */
function sectionKeyOf(name: string): string {
  const ch = name.trim().charAt(0).toLocaleUpperCase("tr");
  return /\p{L}/u.test(ch) ? ch : "#";
}
const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

/** Rengi ton çemberinde kaydır — aynı ailenin komşu tonları */
function shiftHue(hex: string, deg: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const [rr, gg, bb] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hx = (v: number) =>
    Math.round((v + mm) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hx(rr)}${hx(gg)}${hx(bb)}`;
}

type Row = {
  node: Node;
  id: string;
  name: string;
  icon?: string;
  color: string;
  /** Kaç alt kalemi var */
  kids: number;
  /** Aramada kalemin yolu ("Sağlık › Su") */
  path?: string;
};

/**
 * Girdi eklerken "nereye" sorusunun cevabı — aranabilir, kademeli bir liste.
 *
 * Bir süre burada bir sinir ağı vardı: kategoriler daireler, aralarında ışıyan
 * bağlar, sürüklenip yakınlaştırılan bir tuval. Harita olarak güzeldi ama
 * girdi eklemek SERİ bir iş — "koştum" demek için haritada gezinmek istemiyor
 * insan. Ağ Yapı > Harita'ya taşındı; burada kalan şey en kısa yol: dokun, in,
 * ekle.
 */
export function EntryPicker({
  groups,
  onPick,
  onPickCategory,
  onClose,
  onCreateCategory,
}: {
  groups: NetGroup[] | undefined;
  /**
   * Bir kaleme kayıt aç. Seçicinin tek çıkışı bu: yaprağa dokunmak, hızlı
   * ekle şeridi ve "buraya ekle" aynı yüzeyi açıyor.
   */
  onPick: (sub: SubCategory) => void;
  onPickCategory: (category: Category) => void;
  onClose: () => void;
  /** Ana kategori yaratma formunu aç — düğmesi kökteki yol izinin sağında */
  onCreateCategory?: () => void;
}) {
  const t = useT();
  const [focus, setFocus] = useState<FocusRef>(null);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  // Şeride elle eklenenler + onları seçtiren panel
  const [pins, setPins] = useState<string[]>(readPins);
  const [pinOpen, setPinOpen] = useState(false);

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

  // Sayım son 30 güne bakıyor (lib/usage): "sık kullanılanlar" şu anki
  // hayatı göstermeli, arşivi değil.
  // Önbellekli: sık kullanılanlar şeridi pencereyle birlikte gelsin
  const entryCounts =
    useCachedLiveQuery(USAGE_COUNTS_KEY, loadUsageCounts) ?? NO_COUNTS;

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

  const rows: Row[] = useMemo(() => {
    const n = nodes.length;
    const spread = Math.max(28, Math.min(72, 18 * (n - 1)));
    return nodes.map((node, i) => {
      const isCat = node.kind === "cat";
      return {
        node,
        id: isCat ? node.cat.id : node.sub.id,
        name: isCat ? node.cat.name : node.sub.name,
        icon: isCat ? node.cat.icon : node.sub.icon,
        color: isCat
          ? node.cat.color
          : n <= 1
            ? centerColor
            : shiftHue(centerColor, (i / (n - 1) - 0.5) * spread),
        kids: isCat
          ? topSubsByCat.get(node.cat.id)?.length ?? 0
          : childrenMap.get(node.sub.id)?.length ?? 0,
      };
    });
  }, [nodes, centerColor, topSubsByCat, childrenMap]);

  const q = norm(query);
  /** Bulunulan yerin altı var mı — sayfanın düzeni buna göre değişiyor */
  const hasKids = rows.length > 0;
  const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

  /**
   * Hızlı ekle — ağacın HER YERİNDEN, en çok kayıt alan kalemler.
   *
   * Bulunulan kademenin çocukları değil: kayıt "Sağlık > Su"ya giriliyor,
   * "Sağlık"a değil. Kökte gezinmeden oraya atlamak iki üç dokunuş
   * kazandırıyor — seçicinin bütün ölçüsü bu. Sayım kalemin KENDİ girdisi
   * (alt ağaç toplamı değil): dokunulunca kayıt oraya gidecek.
   *
   * Yalnız kökte ve arama yokken: bir dalın içine girmiş kullanıcı zaten
   * daraltmış oluyor.
   */
  const quick = useMemo(() => {
    if (q || focus != null) return [];
    // Önce elle sabitlenenler (kullanıcının sırasıyla), sonra sıklık
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
    return [...pinned, ...byUse].slice(0, QUICK_MAX).map((sub) => ({
      id: sub.id,
      name: sub.name,
      icon: sub.icon,
      color: catById.get(sub.categoryId)?.color ?? "#818cf8",
      parent: catById.get(sub.categoryId)?.name ?? "",
      sub,
    }));
  }, [visibleSubs, subById, entryCounts, catById, q, focus, pins]);

  /**
   * Şeride eklenebilecekler: bütün kalemler, sabitlenmişler en üstte.
   * Yol yazısı ("Spor › Koşu") aynı adı taşıyan iki kalemi ayırt ettiriyor.
   */
  const pinCandidates = useMemo(() => {
    const pathOf = (s: SubCategory) => {
      const parts: string[] = [];
      let cur = s.parentId ? subById.get(s.parentId) : undefined;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? subById.get(cur.parentId) : undefined;
      }
      const cat = catById.get(s.categoryId)?.name;
      return [cat, ...parts].filter(Boolean).join(" › ");
    };
    return visibleSubs
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
      });
  }, [visibleSubs, subById, catById, pins]);

  /**
   * A–Z bölümleri YALNIZ kökte. Bir kategorinin içinde kalemlerin sırası
   * kullanıcının kendi sırası (haritada sürükleyerek dizdiği sıra) ve o sıra
   * anlam taşıyor — alfabeye bölmek onu bozuyordu. Kökte ise kategori sayısı
   * arttıkça harfe göre aramak işe yarıyor.
   */
  const sections = useMemo(() => {
    if (q || focus != null || filtered.length < SECTIONS_FROM)
      return [{ key: "", items: filtered }];
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const k = sectionKeyOf(r.name);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return [...m.entries()]
      .sort((a, b) =>
        a[0] === "#" ? 1 : b[0] === "#" ? -1 : a[0].localeCompare(b[0], "en")
      )
      .map(([key, items]) => ({
        key,
        items: items.sort((x, y) => x.name.localeCompare(y.name, "en")),
      }));
  }, [filtered, q, focus]);

  const trail = useMemo(() => {
    const list: { label: string; focus: FocusRef }[] = [
      { label: t("structure.categories"), focus: null },
    ];
    if (focusObj == null) return list;
    if (focusObj.type === "cat") {
      list.push({
        label: focusObj.cat.name,
        focus: { type: "cat", id: focusObj.cat.id },
      });
      return list;
    }
    const chain: SubCategory[] = [];
    let cur: SubCategory | undefined = focusObj.sub;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    const cat = catById.get(focusObj.sub.categoryId);
    if (cat) list.push({ label: cat.name, focus: { type: "cat", id: cat.id } });
    for (const s of chain)
      list.push({ label: s.name, focus: { type: "sub", id: s.id } });
    return list;
  }, [focusObj, subById, catById, t]);

  /**
   * Bir satıra dokunmak. Altı VARSA içine giriliyor; altı YOKSA gezinilecek
   * bir şey kalmadığı için doğrudan ekleme formu açılıyor — orada özellikler,
   * not ve zaman açık duruyor.
   *
   * Bir ara altı olmayan kalem de bir "son durak" sayfası açıyordu ve
   * kullanıcı orada bir kez daha "Detay ekle"ye basıyordu: gidilecek yer
   * yokken sayfa göstermek fazladan bir dokunuş. Değer girmeden hızlı kayıt
   * isteyen "Hızlı ekle" şeridini kullanıyor, o yol duruyor.
   */
  function drill(node: Node) {
    const kids =
      node.kind === "cat"
        ? topSubsByCat.get(node.cat.id)?.length ?? 0
        : childrenMap.get(node.sub.id)?.length ?? 0;
    if (kids === 0) {
      if (node.kind === "cat") onPickCategory(node.cat);
      else onPick(node.sub);
      return;
    }
    setQuery("");
    setFocus(
      node.kind === "cat"
        ? { type: "cat", id: node.cat.id }
        : { type: "sub", id: node.sub.id }
    );
  }
  /** Bulunulan yerin kendisine kayıt — kategoriyse gizli kökü üzerinden */
  function pickHere() {
    if (focusObj == null) return;
    if (focusObj.type === "cat") onPickCategory(focusObj.cat);
    else onPick(focusObj.sub);
  }
  function openAddSub() {
    if (focusObj == null) return;
    if (focusObj.type === "cat") setAddSub({ categoryId: focusObj.cat.id });
    else
      setAddSub({
        categoryId: focusObj.sub.categoryId,
        parentId: focusObj.sub.id,
      });
  }

  const focusName =
    focusObj == null
      ? t("structure.categories")
      : focusObj.type === "cat"
        ? focusObj.cat.name
        : focusObj.sub.name;
  const focusIcon =
    focusObj == null
      ? undefined
      : focusObj.type === "cat"
        ? focusObj.cat.icon
        : focusObj.sub.icon;
  /** Gezinme listesinin başlığı; aramada yok, sonuçlar zaten kendini anlatıyor */
  const listLabel = q
    ? ""
    : focusObj != null
      ? t("entry.childrenOf", { name: focusName })
      : t("entry.allCategories");

  const structureHref =
    focusObj == null
      ? ""
      : focusObj.type === "cat"
        ? routes.structureCategory(focusObj.cat.id)
        : routes.structureSub(focusObj.sub.categoryId, focusObj.sub.id);

  /** Kademe değişince başlık ve gövde yeniden kurulup kısa bir itişle gelir */
  const focusKey = focus == null ? "root" : `${focus.type}:${focus.id}`;

  /** Bir üst kademe — yol izinin bir önceki basamağı */
  function goUp() {
    setQuery("");
    setFocus(trail.length > 1 ? trail[trail.length - 2].focus : null);
  }

  /**
   * Kökte arama BÜTÜN ağaçta. Eskiden yalnız bulunulan kademeyi süzüyordu:
   * "su" yazan kişi, Su'nun Sağlık'ın içinde olduğunu bilmek zorundaydı.
   * Şimdi kategoriler ve her derinlikteki kalemler birlikte geliyor; aynı adlı
   * iki kalem yollarıyla ("Sağlık › Su") ayrılıyor. Bir dalın içindeyken
   * arama yine o dalı süzüyor — orada kullanıcı zaten daraltmış.
   */
  const globalResults = useMemo<Row[] | null>(() => {
    if (!q || focus != null) return null;
    const pathOf = (s: SubCategory) => {
      const parts: string[] = [];
      let cur = s.parentId ? subById.get(s.parentId) : undefined;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? subById.get(cur.parentId) : undefined;
      }
      return [catById.get(s.categoryId)?.name, ...parts]
        .filter(Boolean)
        .join(" › ");
    };
    const cats = rows.filter((r) => norm(r.name).includes(q));
    const subs = visibleSubs
      .filter((s) => norm(s.name).includes(q))
      .slice(0, 40)
      .map<Row>((sub) => ({
        node: { kind: "sub", sub },
        id: sub.id,
        name: sub.name,
        icon: sub.icon,
        color: catById.get(sub.categoryId)?.color ?? "#818cf8",
        kids: childrenMap.get(sub.id)?.length ?? 0,
        path: pathOf(sub),
      }));
    return [...cats, ...subs];
  }, [q, focus, rows, visibleSubs, subById, catById, childrenMap]);

  // Kökte arama her zaman var (bütün ağaçta arıyor); dalın içinde yalnız
  // uzun listede
  const showSearch = focusObj == null || rows.length >= SEARCH_FROM;

  /*
   * TAM EKRAN GİRDİ EKLEME — sade bir düzen:
   *   üst çubuk (kapat/geri · yaratma) → büyük başlık → arama → gövde.
   * Gövde kökte "Hızlı ekle" ızgarası + kategoriler, bir dalın içinde
   * "Buraya ekle" + alt kalemler. Kutu içinde kutu yok: bölümler başlıkla
   * ayrılıyor, renk yalnız karolarda ve asli eylemde. Eski düzende başlık,
   * yol izi, gövde ayrı ayrı renkli pencerelerdeydi; ekran üç katman çerçeve
   * taşıyordu.
   */
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Üst çubuk — solda kapat (kökte) ya da bir üst kademe, sağda o
          kademeye yapı ekleme. Dalın içinde kapat ayrıca sağda: üç kademe
          derindeyken çıkmak için üç kez geri basmak gerekmesin. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        <button
          type="button"
          onClick={focusObj == null ? onClose : goUp}
          aria-label={focusObj == null ? t("action.close") : t("action.back")}
          className={ROUND}
        >
          {focusObj == null ? (
            <X className="h-[18px] w-[18px]" />
          ) : (
            <ArrowLeft className="h-[18px] w-[18px]" />
          )}
        </button>
        <div className="flex-1" />
        {focusObj == null
          ? onCreateCategory && (
              <button type="button" onClick={onCreateCategory} className={PILL}>
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                {t("entry.createCategory")}
              </button>
            )
          : (
              <button type="button" onClick={openAddSub} className={PILL}>
                <FolderPlus className="h-4 w-4" strokeWidth={2} />
                {t("tree.createSubcategory")}
              </button>
            )}
        {focusObj != null && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action.close")}
            className={ROUND}
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      {/* Başlık — kökte soru, dalın içinde bulunulan yer (karosu ve adıyla).
          Yol izi başlığın üstünde küçük ve sessiz: basamaklara dokunmak
          oraya döner. */}
      <div
        key={`h-${focusKey}`}
        className={cn("shrink-0 px-5 pb-4 pt-2", focusObj != null && "entry-push")}
      >
        {focusObj == null ? (
          <h2 className="text-[28px] font-bold leading-tight tracking-tight">
            {t("entry.pickTitle")}
          </h2>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-1 text-[12px] font-medium text-muted-foreground">
              {trail.slice(0, -1).map((tr, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setFocus(tr.focus);
                    }}
                    className="rounded px-0.5 transition-colors hover:text-foreground"
                  >
                    {tr.label}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Tile color={centerColor} icon={focusIcon} fallback={FolderOpen} size={40} />
              <h2 className="min-w-0 flex-1 truncate text-[24px] font-bold leading-tight tracking-tight">
                {focusName}
              </h2>
              {/* prefetch açıkça: pencere içindeki bağlantıda görünürlük
                  tabanlı önden çekme tetiklenmiyor, tıklamada bekleniyordu */}
              <Link
                href={structureHref}
                prefetch
                onClick={onClose}
                aria-label={t("tree.structurePage")}
                title={t("tree.structurePage")}
                className={ROUND}
              >
                <Layers className="h-[18px] w-[18px]" />
              </Link>
            </div>
          </>
        )}
      </div>

      {showSearch && (
        <div className="shrink-0 px-4 pb-3">
          <label className="flex h-12 items-center gap-2.5 rounded-2xl bg-[var(--sf-2)] px-4 ring-1 ring-inset ring-[var(--ln-1)] transition-shadow focus-within:ring-2 focus-within:ring-primary/50">
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                focusObj == null ? t("entry.searchAll") : t("action.search")
              }
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
      )}

      {/* Gövde — kademe ya da arama değişince bölümler peş peşe yeniden gelir */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div
          key={`b-${focusKey}-${q ? "q" : ""}`}
          className="entry-stagger flex flex-col gap-6"
        >
          {globalResults ? (
            globalResults.length === 0 ? (
              <p className="px-1 py-10 text-center text-sm text-muted-foreground">
                {t("entry.noMatch")}
              </p>
            ) : (
              <Group>
                {globalResults.map((r) => (
                  <PickRow key={r.id} row={r} onOpen={drill} />
                ))}
              </Group>
            )
          ) : (
            <>
              {focusObj == null && (
                <QuickGrid
                  items={quick}
                  onPick={onPick}
                  onEdit={() => setPinOpen(true)}
                />
              )}

              {/* Altı olan bir kalemin KENDİSİNE kayıt — asli eylem, kalemin
                  renginde. Altı yoksa bu sayfaya hiç gelinmiyor (drill
                  doğrudan formu açıyor). */}
              {focusObj != null && hasKids && (
                <button
                  type="button"
                  onClick={pickHere}
                  className="flex h-14 shrink-0 items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold transition-transform active:scale-[0.98]"
                  style={{
                    background: `${centerColor}1f`,
                    boxShadow: `inset 0 0 0 1px ${centerColor}40`,
                  }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: centerColor, color: inkOn(centerColor) }}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.75} />
                  </span>
                  {t("entry.addHere")}
                </button>
              )}

              {filtered.length === 0
                ? q && (
                    <p className="px-1 py-10 text-center text-sm text-muted-foreground">
                      {t("entry.noMatch")}
                    </p>
                  )
                : sections.map((sec) => (
                    <Group
                      key={sec.key}
                      label={sec.key || (sections.length === 1 ? listLabel : "")}
                    >
                      {sec.items.map((r) => (
                        <PickRow key={r.id} row={r} onOpen={drill} />
                      ))}
                    </Group>
                  ))}

              {focusObj == null && rows.length === 0 && (
                <p className="px-1 py-10 text-center text-sm text-muted-foreground">
                  {t("tree.noCategoriesYet")}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Şeride ekle ────────────────────────────────────────────────
          Ayrı bir diyalog değil, aynı yüzeyin üstünde bir panel: üst üste
          açılan diyaloglar bu uygulamada kırılgan. Seçilen kalem şeritte
          en öne geçiyor, tekrar dokunmak çıkarıyor. */}
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
/** Üst çubuğun yazılı düğmesi — yapı ekleme (kategori / alt kategori) */
const PILL =
  "flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--sf-2)] pl-3 pr-4 text-[13px] font-medium text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-3)] active:scale-95";

/** Bölüm — küçük sessiz başlık, altında çerçevesiz satırlar */
function Group({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0">
      {label && (
        <div className="mb-1 px-2 text-[12px] font-semibold text-muted-foreground">
          {label}
        </div>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/**
 * Liste satırı — çerçevesiz, dokununca hafifçe zeminlenir. Renk yalnız
 * karoda; sağdaki işaret dokununca ne olacağını söylüyor: altı varsa içine
 * girilir (ok), yoksa kayıt oraya eklenir (artı). Aramada altında yolu
 * yazar — aynı adlı iki kalem ayırt edilsin.
 */
function PickRow({ row: r, onOpen }: { row: Row; onOpen: (node: Node) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(r.node)}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-[var(--sf-1)] active:bg-[var(--sf-2)]"
    >
      <Tile
        color={r.color}
        icon={r.icon}
        fallback={r.kids > 0 ? FolderOpen : Folder}
        size={40}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-5 text-foreground">
          {r.name}
        </span>
        {r.path && (
          <span className="block truncate text-xs leading-4 text-muted-foreground">
            {r.path}
          </span>
        )}
      </span>
      {r.kids > 0 ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      ) : (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${r.color}22`, color: r.color }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

/**
 * Hızlı ekle — en çok kayıt aldığın (ve sabitlediğin) kalemler, IZGARA
 * olarak. Yatay şeritte dördüncü karodan sonrası ekranın dışında kalıyordu;
 * iki satırlık ızgarada sekizi birden görünüyor ve parmak hedefleri büyük.
 * Karolar açılışta peş peşe "pop" ile gelir.
 */
function QuickGrid({
  items,
  onPick,
  onEdit,
}: {
  items: { id: string; name: string; icon?: string; color: string; parent: string; sub: SubCategory }[];
  onPick: (sub: SubCategory) => void;
  /** Sabitlenenleri düzenle — sıklık her zaman doğru tahmin etmiyor */
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <div className="shrink-0">
      <div className="mb-2 flex items-center px-2">
        <span className="text-[12px] font-semibold text-muted-foreground">
          {t("entry.quickAdd")}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="-mr-1 ml-auto rounded-full px-2 py-0.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
          {items.length ? t("action.edit") : t("action.add")}
        </button>
      </div>
      {items.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onPick(it.sub)}
              title={`${it.parent} › ${it.name}`}
              className="entry-tile-pop flex min-w-0 flex-col items-center gap-1.5 rounded-2xl bg-[var(--sf-1)] px-1 pb-2.5 pt-3 ring-1 ring-inset ring-[var(--ln-1)] transition-transform active:scale-[0.94]"
              style={{ animationDelay: `${120 + i * 28}ms` }}
            >
              <Tile color={it.color} icon={it.icon} size={40} />
              <span className="block w-full truncate text-center text-[11px] font-medium leading-4 text-foreground">
                {it.name}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] py-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          {t("entry.pinTitle")}
        </button>
      )}
    </div>
  );
}
