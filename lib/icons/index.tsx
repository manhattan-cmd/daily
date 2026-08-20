import { CATEGORY_ICON_MAP, CategoryIcon } from "@/lib/category-icons";
import { activeSet } from "./sets";
import { isIconName, type IconName } from "./vocabulary";

export { ICON_GROUPS, ICON_NAMES, isIconName } from "./vocabulary";
export type { IconGroupKey, IconName } from "./vocabulary";
export { ICON_SETS, ACTIVE_SET_ID, activeSet } from "./sets";

/** Sözlükteki tek sembol — etkin setin çiziminden. Renk currentColor'dan gelir. */
export function LifeIcon({
  name,
  className,
  style,
}: {
  name: IconName;
  className?: string;
  style?: React.CSSProperties;
}) {
  const glyph = activeSet().glyphs[name];
  if (!glyph) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

/**
 * Kategori/alt kategori sembolü — tek çözüm noktası.
 *
 * `icon` alanı düz bir string ve üç şeyden biri olabilir:
 *   1. Sözlükteki ad ("moon", "run")        → etkin setin çizimi
 *   2. Eski lucide adı ("Moon", "Dumbbell") → CategoryIcon
 *   3. Ham emoji ("🏃")                      → metin
 *
 * (2) ve (3) yalnız geriye dönük: kullanıcının önceden seçtiği semboller
 * bozulmasın diye duruyorlar, seçicide artık sunulmuyorlar. Bu ayrım eskiden
 * beş ayrı dosyada `icon in CATEGORY_ICON_MAP ? ... : ...` diye tekrar ediyordu.
 *
 * Boyut `size` ile piksel olarak verilir — emoji dalı yazı olduğu için
 * en/boy sınıfıyla ölçeklenmiyor, punto gerekiyor.
 */
export function SymbolIcon({
  name,
  size = 20,
  className,
  style,
}: {
  name?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!name) return null;

  if (isIconName(name)) {
    return (
      <LifeIcon
        name={name}
        className={className}
        style={{ width: size, height: size, ...style }}
      />
    );
  }

  if (name in CATEGORY_ICON_MAP) {
    return (
      <CategoryIcon
        name={name}
        className={className}
        style={{ width: size, height: size, ...style }}
      />
    );
  }

  // Emoji: kendi rengini taşır, currentColor'a uymaz — punto ile ölçeklenir.
  // Kutusu diğer iki dal gibi tam `size` kadar ve emoji ortasına oturuyor;
  // yazı olarak bırakılınca satır boşluğu yüzünden hücrede aşağı kayıyordu.
  //
  // GRID DEĞİL FLEX. Emojinin ilerleme kutusu punto başına 0.95–1.37 em
  // (Segoe UI Emoji): 0.86 punto çarpanıyla en geniş emoji `size` kutusunu
  // ~%20 taşıyor. inline-grid taşan içeriği tek yana bırakıyor ve çizim
  // sağa kayıyordu — 26px karoda 2.4px, gözle görülür. Flex aynı puntoda
  // taşmayı iki yana eşit dağıtıyor: kaçık 2.38px → 0.25px.
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        fontSize: size * 0.86,
        lineHeight: 1,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

/** Sembol kendi rengini mi dayatıyor (emoji), yoksa boyanabilir mi */
export function isTintable(name?: string): boolean {
  return !!name && (isIconName(name) || name in CATEGORY_ICON_MAP);
}
