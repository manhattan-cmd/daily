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
};

export function CategoryIcon({
  name,
  className,
}: {
  name?: string;
  className?: string;
}) {
  if (!name) return null;
  const Icon = CATEGORY_ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}
