import type { ReactNode } from "react";
import type { IconName } from "../vocabulary";
import { SET_1 } from "./set-1";

/**
 * Sembol setleri.
 *
 * Bir set, sözlüğün TAMAMINI karşılamak zorunda (Record<IconName, ...>):
 * eksik bir set derlenmiyor. Böylece etkin seti değiştirmek hiçbir kategoriyi
 * sembolsüz bırakamaz — kayıtlı `icon` değerleri ("run", "moon") değişmediği
 * için de veri göçü gerekmiyor, yalnız çizim değişiyor.
 */
export type IconSet = {
  id: string;
  /** Ayarlarda görünecek ad */
  label: string;
  glyphs: Record<IconName, ReactNode>;
};

export const ICON_SETS: Record<string, IconSet> = {
  "set-1": { id: "set-1", label: "Set 1", glyphs: SET_1 },
};

/** Şu an çizilen set. İkinci bir set yazıldığında burası (ya da bir kullanıcı
 *  ayarı) değişir; başka hiçbir yere dokunmak gerekmez. */
export const ACTIVE_SET_ID = "set-1";

export const activeSet = (): IconSet => ICON_SETS[ACTIVE_SET_ID];
