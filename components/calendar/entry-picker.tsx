"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Compass,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Plus,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getEntryCountsBySubcategory } from "@/lib/db/queries";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { HScroll } from "@/components/ui/h-scroll";
import { SymbolIcon } from "@/lib/icons";
import { usageSince } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, SubCategory } from "@/types";

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
/** Sık girilen kategoriler çipleri bu sayıdan sonra anlamlı */
const FREQ_CATS_FROM = 5;
/** Hızlı ekle şeridinde en fazla bu kadar kart durur */
const QUICK_MAX = 10;

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
  const entryCounts =
    useLiveQuery(() => getEntryCountsBySubcategory(usageSince()), []) ??
    NO_COUNTS;

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
   * Sık girilen kategoriler — uzun kategori listesinde aşağıda kalanlara
   * kısayol. Hızlı ekle şeridiyle karışmıyor çünkü işi başka: o doğrudan
   * KAYIT açıyor, bu kategorinin İÇİNE giriyor. Biçimi de ayrı (çip), yani
   * altındaki tam listenin tekrarı gibi okunmuyor.
   *
   * Sayım kategorinin bütün alt ağacı. Kısa listede çıkmıyor: beş kalemlik
   * bir listeye kısayol koymak yer kaybı.
   */
  const hotCats = useMemo(() => {
    if (q || focus != null || rows.length < FREQ_CATS_FROM) return [];
    const weight = new Map<string, number>();
    for (const g of groups ?? [])
      weight.set(
        g.category.id,
        g.allSubs.reduce((n, s) => n + (entryCounts.get(s.id) ?? 0), 0)
      );
    const hot = rows
      .filter((r) => (weight.get(r.id) ?? 0) > 0)
      .sort((a, b) => (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0))
      .slice(0, 6);
    return hot.length >= 2 ? hot : [];
  }, [rows, groups, entryCounts, q, focus]);

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
        ? `/structure/${focusObj.cat.id}`
        : `/structure/${focusObj.sub.categoryId}/${focusObj.sub.id}`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Sayfanın başlığı = BULUNULAN YER. Buradaki eski başlık ("Ne eklemek
          istersin?") her kademede aynı şeyi söylediği için kalkmıştı, ama
          yerine hiçbir şey koymayınca üst taraf boş kaldı. Bulunulan yerin
          adı hem boşluğu dolduruyor hem yol izinden farklı bir iş yapıyor:
          iz nereden geldiğini, başlık nerede olduğunu söylüyor. Kalemin
          kendi simgesi ve rengiyle — sayfanın kime ait olduğu bir bakışta
          okunuyor.

          KENDİ PENCERESİNDE. Çıplak bir satırken iki sorunu vardı: karosu
          12px'ten başlıyordu, oysa aşağıda her şey (pusula, HIZLI EKLE
          şimşeği, bölüm başlıkları) 28px'lik ortak omurgada duruyor — tek
          başına o hizanın dışında kalıyordu. İkincisi altındaki ince çizgi
          yolu ayırmaya yetmiyor, tam tersine başlığı yola yapıştırıyordu.
          Pencere ikisini birden çözüyor: `px-4` ile karo 28px'e oturuyor
          (12 kenar + 16 dolgu) ve iki pencere arasındaki boşluk bir çizgiden
          daha net ayırıyor. Çizgi bu yüzden kalktı. */}
      <div
        // Sol dolgu 16 (omurgayı tutuyor), sağ 12: pencere satıra 8px
        // eklediği için "Kişisel Bakım ve Sağlık" kırpılmaya başlamıştı.
        // Sağdan ve aralardan kısmak yeter — sol hizanın bozulması olmaz.
        className="mx-3 mb-2.5 flex shrink-0 items-center gap-1.5 rounded-2xl py-2.5 pl-4 pr-3"
        style={{
          background: `${centerColor}0d`,
          boxShadow: `inset 0 0 0 1px ${centerColor}24`,
        }}
      >
        <Tile color={centerColor} icon={focusIcon} fallback={FolderOpen} size={28} />
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-7 tracking-tight">
          {focusName}
        </h2>

        {/* Yaratma eylemi başlığın hizasında: sayfanın SAHİBİNE bir şey
            ekliyor, o yüzden yeri onun satırı. Kökte ana kategori açıyor,
            bir dalın içinde o dala alt kategori — aynı iş, farklı kademe,
            o yüzden aynı düğme. Bir ara "Alt kategori aç" pencerenin içinde
            "Buraya ekle"nin yanındaydı ve iki farklı iş (kayıt eklemek /
            yapı kurmak) yan yana durup birbirine karışıyordu. */}
        {focusObj == null
          ? onCreateCategory && (
              <CreatePill
                icon={Plus}
                label={t("entry.createCategory")}
                color={centerColor}
                onClick={onCreateCategory}
              />
            )
          : (
              <CreatePill
                icon={FolderPlus}
                label={t("tree.createSubcategory")}
                color={centerColor}
                onClick={openAddSub}
              />
            )}

        <button
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/12"
          aria-label={t("action.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Yol izi — nerede olduğun ve geri dönüş.
          Her basamak bir çip: ataları düz metin bırakmak satırı yarım
          bırakıyordu, çip olunca dokunulabilir oldukları da görünüyor.
          Bulunulan yer kaleminin renginde ve önünde bir nokta var.
          Yol derinleşince satır SONA kayıyor (HScroll followEnd) — son
          basamak ekrandan çıkınca kullanıcı nerede olduğunu göremiyordu.
          PENCERENİN ÜSTÜNDE ve hep aynı yerde: bir ara kökte gizliydi, bir
          kategoriye girince ortaya çıkıyor ve altındaki her şeyi aşağı
          itiyordu. Kökte de "Kategoriler" basamağı yazılıyor: başlıkla aynı
          adı söylüyor ama iş bölümü ayrı — başlık sayfanın kimliği, çip
          yolun ilk durağı. Satır boş kalınca gezinme çubuğu sanki yokmuş
          gibi duruyordu. O basamak her zaman renkli — yolun kökü o.

          Satırın başında pusula duruyor: çiplerin kendisi "geri dönülebilir"
          olduğunu söylüyor ama satırın NE olduğunu söylemiyordu. Bir ara
          kendi satırındaydı, orada yalnız kalıp fazladan bir kademe
          açıyordu; yolun başında dururken hem işaret hem başlangıç noktası.
          Bulunulan yerin renginde: yolun hangi ağaçta olduğu belli oluyor.

          Yol KENDİ PENCERESİNDE ve ortalanmış: çıplak bir satır olarak
          başlığın altında dururken göz onu ayrı bir şey saymıyordu, oysa
          burada bir yolculuk oluyor. Kapsül biçimli zemin o yolculuğun rayı;
          bulunulan yerin renginde hafifçe boyanıyor ki hangi ağaçta
          olduğun pencerenin kendisinden de okunsun.

          Yol SOLA yaslı ve pusula aşağıdaki "HIZLI EKLE" şimşeğiyle aynı
          dikey çizgide (yüzeyin solundan 28px): bir ara ortalanmıştı ama
          o zaman yolun nereden başladığı her kademede kayıyordu, oysa
          başlangıç sabit bir yer olmalı — göz o çizgiyi bir kez öğreniyor.
          Rakam elle değil hizadan geliyor: pencere kenarı 12 + pencere
          dolgusu 12 + başlık dolgusu 4. */}
      <div
        className="mx-3 mb-2.5 shrink-0 rounded-full py-1 pl-4 pr-2"
        style={{
          background: `${centerColor}0f`,
          boxShadow: `inset 0 0 0 1px ${centerColor}2b`,
        }}
      >
        <HScroll
          className="items-center"
          wrapperClassName="min-w-0"
          followEnd={focusName}
        >
          <div className="flex shrink-0 items-center gap-1">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `${centerColor}2b`,
                boxShadow: `inset 0 0 0 1px ${centerColor}66`,
              }}
            >
              <Compass
                className="h-3 w-3"
                strokeWidth={2.25}
                style={{ color: centerColor }}
              />
            </span>
            {trail.map((tr, i) => {
              const last = i === trail.length - 1;
              const isRoot = i === 0;
              return (
                <span key={i} className="flex shrink-0 items-center gap-1">
                  {i > 0 && (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: `${centerColor}80` }}
                    />
                  )}
                  <button
                    onClick={() => {
                      setQuery("");
                      setFocus(tr.focus);
                    }}
                    aria-current={last ? "page" : undefined}
                    className={cn(
                      "flex max-w-[150px] shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                      last && "font-semibold text-foreground",
                      !last &&
                        isRoot &&
                        "bg-primary/15 text-primary hover:bg-primary/25",
                      !last &&
                        !isRoot &&
                        "bg-white/[0.07] text-muted-foreground hover:bg-white/[0.11] hover:text-foreground"
                    )}
                    style={
                      last
                        ? {
                            background: `${centerColor}33`,
                            boxShadow: `inset 0 0 0 1px ${centerColor}73`,
                          }
                        : undefined
                    }
                  >
                    {last && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: centerColor }}
                      />
                    )}
                    <span className="truncate leading-5">{tr.label}</span>
                  </button>
                </span>
              );
            })}
          </div>
        </HScroll>
      </div>

      {/* Gövdenin penceresi. Yol izi dışarıda kaldığı için burada kuruluyor:
          böylece izin konumu kademeye göre kaymıyor. `flex-1` ile yüzeyin
          kalanını dolduruyor — 2 alt kategorili bir kalemde pencere büzülüp
          7'li kaleminkinden farklı bir kutuya dönüşüyordu. */}
      <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-primary/[0.04] pt-2.5 ring-1 ring-inset ring-primary/15">

        {/* Sabit üst bölüm: asli eylem, kısayollar ve arama listeyle birlikte
            kaymamalı — uzun listede aşağı inince arama kutusu kayboluyordu ve
            kullanıcı onu geri getirmek için başa dönüyordu. */}
        <div className="flex shrink-0 flex-col gap-3 px-3 pb-3">
          {/* Çocuğu olmayan kalemde yapılacak tek şey kayıt eklemek: orada
              asli eylem koca bir bant olarak duruyor. Çocuğu VARSA aynı bant
              "buraya mı ekleyeyim, aşağıdan mı seçeyim" ikilemini büyütüyordu
              — orada küçük bir düğmeye iniyor, sayfanın işi listeyi seçtirmek
              oluyor. */}

          {/* Hızlı ekle en üstte ve sabit: en kısa yol o, listeyle birlikte
              kaymamalı. Kökte var — bir dalın içine girmiş kullanıcı zaten
              daraltmış oluyor. */}
          {focusObj == null && (
            <QuickRail
              items={quick}
              onPick={onPick}
              onAdd={() => setPinOpen(true)}
            />
          )}

          {/* Eylemler — yalnız bir dalın içinde. Pencerenin içindeki işler
              KAYIT işleri: "Buraya ekle" kalemin renginde, yanında yapı
              sayfasına giden simge. "Alt kategori aç" buradan başlığın
              hizasına çıktı — yapı kurmakla kayıt eklemek yan yana durunca
              hangisinin ne olduğu karışıyordu. */}
          {focusObj != null && (
            <div className="flex shrink-0 items-center gap-2">
              {hasKids && (
                <QuietButton icon={Plus} color={centerColor} onClick={pickHere}>
                  {t("entry.addHere")}
                </QuietButton>
              )}
              <QuietButton
                icon={Layers}
                href={structureHref}
                onClick={onClose}
                label={t("tree.structurePage")}
              />
            </div>
          )}

          {rows.length >= SEARCH_FROM && (
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("action.search")}
                className="h-10 w-full rounded-xl border border-primary/20 bg-primary/[0.05] pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Kayan bölüm: sık girilen kategoriler + gezinme listesi.
            Pencerenin kalanını kaplıyor ki kısa listede de parmak
            pencerenin her yerinden kaydırabilsin. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-6">
          {/* Sık kullanılan kategoriler — ALTINDAKİ listenin aynı yapısında.
              Bir ara çipe çevrilmişti (tekrar gibi okunmasın diye); ama bu
              iki blok aynı şeyi seçtiriyor ve aynı görünmeleri doğru. Ayrımı
              başlık yapıyor, biçim değil. */}
          {hotCats.length > 0 && (
            <Section label={t("entry.frequentCategories")} color={centerColor}>
              {hotCats.map((r) => (
                <PickRow key={`hot${r.id}`} row={r} onOpen={drill} />
              ))}
            </Section>
          )}

          {filtered.length === 0 ? (
            // Arama boş dönerse söylenecek bir şey var; alt kategorisi
            // olmayan bir kalemde ise söylenecek bir şey YOK — orada
            // "Eşleşen bir şey yok" demek uydurma bir eksiklik yaratıyordu.
            q ? (
              <p className="px-1 py-8 text-center text-sm text-muted-foreground">
                {t("entry.noMatch")}
              </p>
            ) : null
          ) : (
            // Listenin başlığı KİMİN listesi olduğunu söylüyor: kökte "Tüm
            // kategoriler" (üstündeki sık kullanılanlardan ayrılsın diye),
            // bir dalın içinde "Spor alt kategorileri". Başlıksızken
            // satırların neyin altı olduğu belli değildi.
            <div className="flex shrink-0 flex-col gap-3">
              {listLabel && sections.length > 1 && (
                // A–Z'ye bölünmüş listede başlık bir kez, harflerin üstünde
                <div
                  className="px-1 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: centerColor }}
                >
                  {listLabel}
                </div>
              )}
              {sections.map((sec) => (
                <Section
                  key={sec.key}
                  label={sec.key || (sections.length === 1 ? listLabel : "")}
                  color={centerColor}
                >
                  {sec.items.map((r) => (
                    <PickRow key={r.id} row={r} onOpen={drill} />
                  ))}
                </Section>
              ))}
            </div>
          )}

          {focusObj == null && rows.length === 0 && (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              {t("tree.noCategoriesYet")}
            </p>
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
          <div className="animate-in absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-2xl border-t border-white/10 bg-background">
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/6 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-6">
              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
                {pinCandidates.map((c) => {
                  const on = pins.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => togglePin(c.id)}
                      aria-pressed={on}
                      className="flex min-h-[56px] w-full items-center gap-3 border-t border-white/[0.06] px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-white/[0.05] active:bg-white/[0.08]"
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
                          on ? "text-white" : "bg-white/[0.06] text-muted-foreground/50"
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

/** Bölüm — başlık dışarıda, satırlar tek bir yüzeyde */
function Section({
  label,
  icon: Icon,
  color,
  children,
}: {
  label: string;
  icon?: typeof Sparkles;
  /** Bulunulan yerin rengi — başlık onu taşıyor */
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0">
      {label && (
        // Başlık bulunulan yerin renginde: kökte uygulamanın vurgusu, bir
        // dalın içinde o dalın rengi. Gri başlıklar listeyle aynı tondaydı
        // ve bölümlerin nerede başladığı seçilmiyordu.
        <div
          className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: color ?? "var(--primary)" }}
        >
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
        {children}
      </div>
    </div>
  );
}

/**
 * Liste satırı. Kullanım sıklığı SATIRDA anlatılmıyor — bir ara sönük
 * kalemleri soluklaştırıyorduk ve liste bütün olarak cansız görünüyordu.
 * Sıklığın yeri "Hızlı ekle" şeridi; gezinme listesi net ve eşit duruyor.
 */
function PickRow({ row: r, onOpen }: { row: Row; onOpen: (node: Node) => void }) {
  return (
    <button
      onClick={() => onOpen(r.node)}
      // Tek satır: alt kalem sayısı ("6 alt kategori") kalktı. Kayıt
      // ekleyecek kişi kaç dal olduğunu bilmek istemiyor, adı arıyor — sayı
      // her satırda ikinci bir yazı olarak listeyi ağırlaştırıyordu. Altı
      // olup olmadığını sağdaki işaret zaten söylüyor.
      className="flex min-h-[48px] w-full items-center gap-2.5 border-t border-white/[0.06] px-2.5 py-2 text-left transition-colors first:border-t-0 hover:bg-white/[0.05] active:bg-white/[0.08]"
    >
      <Tile
        color={r.color}
        icon={r.icon}
        fallback={r.kids > 0 ? FolderOpen : Folder}
        size={34}
      />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-foreground">
        {r.name}
      </span>
      {/* İşaret dokununca ne olacağını söylüyor: altı varsa içine girilir
          (ok), yoksa kayıt oraya eklenir (artı). Her satıra ok koymak
          yaprakta yalan oluyordu. */}
      {r.kids > 0 ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      ) : (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${r.color}26`, color: r.color }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

/**
 * Hızlı ekle — en çok kayıt aldığın kalemler, gezinmeden.
 *
 * Bir ara bunlar listenin başına ikinci bir liste olarak konuyordu ve aynı
 * kalem iki kez görünüyordu; hataya benziyordu, sonra da eşiğin arkasına
 * saklandı ve büsbütün kayboldu. Doğru yer burası ve doğru biçim ŞERİT:
 * listeden farklı bir şekli olduğu için tekrar gibi okunmuyor, kendi işini
 * söylüyor. İçindekiler ağacın HER YERİNDEN gelen yapraklar — dokununca
 * doğrudan ekle modülü açılıyor, iki üç dokunuş birden kalkıyor.
 */
function QuickRail({
  items,
  onPick,
  onAdd,
}: {
  items: { id: string; name: string; icon?: string; color: string; parent: string; sub: SubCategory }[];
  onPick: (sub: SubCategory) => void;
  /** Şeride elle kalem eklemek — sıklık her zaman doğru tahmin etmiyor */
  onAdd: () => void;
}) {
  const t = useT();
  return (
    <div className="shrink-0">
      {/* Başlık ve ekleme düğmesi RENKLİ: bu şerit sayfanın en kısa yolu,
          gri bir başlıkla listeye karışıyordu. Düğme başlık satırında —
          şeridin sonuna konunca kartların arkasında kalıyor ve yatay
          kaydırmadan görünmüyordu. */}
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Zap className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          {t("entry.quickAdd")}
        </span>
        <button
          onClick={onAdd}
          className="ml-auto flex items-center gap-1 rounded-full bg-primary/15 py-1 pl-1.5 pr-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/25"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
          {t("action.add")}
        </button>
      </div>

      {/* Kartları kapsayan pencere — sade ama renkli. Şerit çıplakken
          listenin bir parçası gibi duruyordu; kendi zemini olunca "burası
          ayrı bir yol" diyor. */}
      <div className="rounded-2xl bg-primary/[0.09] p-1.5 ring-1 ring-inset ring-primary/25">
        {/* Kart kare: üst kategori adı kalktığı için ikinci satıra gerek
            kalmadı, kalan şey karo ve ad. Renk çıpası karoda — kartı da
            boyamak renkli dikdörtgen yığını demek.

            Ölçüler bir tık kısıldı (66×64 → 60×60, dolgu 8 → 6): şerit
            sayfanın en kısa yolu ama asıl iş aşağıdaki listede, ona yer
            kalması lazım. */}
        <HScroll className="gap-1.5">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it.sub)}
              title={`${it.parent} › ${it.name}`}
              className="flex h-[60px] w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/[0.09] bg-white/[0.05] px-1 text-center transition-colors hover:bg-white/[0.09] active:bg-white/[0.12]"
            >
              <Tile color={it.color} icon={it.icon} size={26} />
              {/* Yazı kutusu SABİT iki satırlık: içeriğe göre büyüyünce kart
                  onu ortalıyor ve iki satırlı adın karosu tek satırlılardan
                  yukarı kayıyordu. Kutu sabit olunca karo her kartta aynı
                  yerde.

                  Yazı kutunun İÇİNDE dikey ortalanıyor: tek satırlık ad
                  kutunun tepesinde durunca altı boş kalıyor ve kart yukarı
                  kaymış gibi görünüyordu — ağırlık merkezi karonun tarafına
                  kayıyor. Ortalanınca kart kendi içinde dengeli duruyor,
                  karoların hizası da bozulmuyor. */}
              <span className="flex h-6 w-full items-center justify-center">
                <span className="line-clamp-2 w-full text-[9.5px] font-semibold leading-[11.5px] text-foreground">
                  {it.name}
                </span>
              </span>
            </button>
          ))}
        </HScroll>
      </div>
    </div>
  );
}

/**
 * Başlık hizasındaki yaratma düğmesi — kökte "Kategori yarat", bir dalın
 * içinde "Alt kategori aç". İkisi de aynı iş (yapıya yeni bir yer açmak),
 * o yüzden aynı biçim: dolu bir kapsül.
 *
 * Rengi BULUNULAN YERİN rengi. Bir ara sabit vurgu rengindeydi (yapı kurmak
 * ile kayıt eklemek ayrılsın diye) ama düğme sayfanın sahibine alt kategori
 * açıyor — hangi kaleme açtığı renkten okunmalı. Kökte zaten vurgu rengiyle
 * aynı yere düşüyor, o yüzden ilk sayfa değişmiş görünmüyor.
 *
 * Yazı rengi parlaklığa göre: sarı/limon bir kategoride beyaz kayboluyor.
 */
function CreatePill({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  color: string;
  onClick: () => void;
}) {
  const ink = inkOn(color);
  return (
    <button
      onClick={onClick}
      className="flex h-7 shrink-0 items-center gap-1 rounded-full pl-2 pr-2.5 text-[10.5px] font-semibold transition-transform active:scale-[0.96]"
      style={{
        backgroundColor: color,
        color: ink,
        boxShadow: `0 4px 12px ${color}40`,
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
      {label}
    </button>
  );
}

/**
 * Küçük eylem düğmesi — bağlantı ya da düğme olarak.
 * `color` verilirse kalemin renginde durur: aynı satırdaki üç düğmeden
 * hangisinin asli olduğu böyle anlaşılıyor. Yazısı yoksa yalnız simge
 * (o zaman `label` erişilebilirlik için şart).
 */
function QuietButton({
  icon: Icon,
  children,
  onClick,
  href,
  color,
  label,
}: {
  icon: typeof Plus;
  children?: React.ReactNode;
  onClick: () => void;
  href?: string;
  /** Asli eylem — kalemin renginde */
  color?: string;
  /** Yalnız simgeli düğmenin adı */
  label?: string;
}) {
  const cls = cn(
    "flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
    color
      ? "border-transparent text-foreground"
      : "border-white/8 text-muted-foreground hover:text-foreground active:bg-white/5",
    !children && "px-2"
  );
  const style = color
    ? { background: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}59` }
    : undefined;
  const body = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      {children && <span className="truncate leading-5">{children}</span>}
    </>
  );
  // prefetch açıkça: sheet içindeki bağlantıda görünürlük tabanlı varsayılan
  // önden çekme tetiklenmiyor ve tıklamada bekleme oluyordu
  return href ? (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      className={cls}
      style={style}
      aria-label={label}
      title={label}
    >
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      style={style}
      aria-label={label}
      title={label}
    >
      {body}
    </button>
  );
}
