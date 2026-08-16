import { CATEGORY_COLORS } from "@/types";

/**
 * Özelliğin rengi.
 *
 * Kendi rengi varsa o; yoksa ADINDAN türetiliyor. Renksiz bırakmak yerine
 * türetmenin sebebi şu: girdi formunda özellikler yan yana duruyor ve hepsi
 * aynı renkteyken hangi satırın hangisi olduğu ancak okuyarak anlaşılıyordu.
 * Türetilen renk sabit — aynı özellik her yerde aynı renkte çıkıyor, kullanıcı
 * bir şey yapmasa bile.
 */
export function modColor(mod: { name?: string; color?: string }): string {
  if (mod.color) return mod.color;
  const name = (mod.name ?? "").trim();
  if (!name) return CATEGORY_COLORS[0];
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CATEGORY_COLORS[(h >>> 0) % CATEGORY_COLORS.length];
}
