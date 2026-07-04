import {
  Moon,
  Dumbbell,
  Utensils,
  Wallet,
  Smile,
  Heart,
  Users,
  Briefcase,
  GraduationCap,
  Tv,
  Plane,
  Star,
  Sparkles,
  Book,
  Coffee,
  Music,
  Gamepad2,
  Bike,
  Camera,
  Palette,
  Pill,
  Droplet,
  Brain,
  Sun,
  Flame,
  Leaf,
  Gift,
  ShoppingCart,
  Home,
  Car,
  Phone,
  Laptop,
  PenLine,
  Clock,
  Target,
  Trophy,
  Zap,
  Dog,
  Cat,
  Baby,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

export const CATEGORY_ICON_MAP: Record<string, React.FC<LucideProps>> = {
  Moon,
  Dumbbell,
  Utensils,
  Wallet,
  Smile,
  Heart,
  Users,
  Briefcase,
  GraduationCap,
  Tv,
  Plane,
  Star,
  Sparkles,
  Book,
  Coffee,
  Music,
  Gamepad2,
  Bike,
  Camera,
  Palette,
  Pill,
  Droplet,
  Brain,
  Sun,
  Flame,
  Leaf,
  Gift,
  ShoppingCart,
  Home,
  Car,
  Phone,
  Laptop,
  PenLine,
  Clock,
  Target,
  Trophy,
  Zap,
  Dog,
  Cat,
  Baby,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICON_MAP);

export function CategoryIcon({
  name,
  className,
  style,
}: {
  name?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!name) return null;
  const Icon = CATEGORY_ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className={className} style={style} />;
}
