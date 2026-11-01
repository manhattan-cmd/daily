import { Boxes, MoonStar, NotebookPen, Package, PenLine, Smile, Target, Zap, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";
import type { BuiltInCategoryKey } from "@/types";

export type AddTab = "quick" | "entry" | "mood" | "sleep" | "note" | "thing" | "goal" | "activity";

export type TabDef = {
  key: AddTab;
  label: MessageKey;
  icon: LucideIcon;
  /** Brütalde şeridin rengi — türün kendi tonu */
  color: string;
  /** Yerleşik akış: kategorisi silinmişse sekme çıkmaz */
  builtIn?: BuiltInCategoryKey;
};

/**
 * Ekle ekranının sekmeleri (bkz. AddScreen). Sıra: önce Hızlı (en sık
 * eklenenler, bkz. QuickPicker), sonra en sık yapılan tür; aktivite en
 * sonda (ileride girdinin çoklu seçimine katılacak).
 */
export const ADD_TABS: TabDef[] = [
  { key: "quick", label: "add.quick", icon: Zap, color: "#d4f06b" },
  { key: "entry", label: "add.entry", icon: PenLine, color: "#7ae582" },
  { key: "mood", label: "add.mood", icon: Smile, color: "#ff8fab", builtIn: "mood" },
  { key: "sleep", label: "add.sleep", icon: MoonStar, color: "#c9b8ff", builtIn: "sleep" },
  { key: "note", label: "add.note", icon: NotebookPen, color: "#ffb38a" },
  { key: "thing", label: "add.thing", icon: Package, color: "#8fe0d4", builtIn: "objects" },
  { key: "goal", label: "add.goal", icon: Target, color: "#ffd23f" },
  { key: "activity", label: "add.activity", icon: Boxes, color: "#8ec5ff" },
];

export const tabDef = (k: AddTab) => ADD_TABS.find((d) => d.key === k) ?? ADD_TABS[0];
