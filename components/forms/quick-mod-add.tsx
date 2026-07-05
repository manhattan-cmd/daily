"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { cn } from "@/lib/utils";

interface QuickModAddProps {
  subcategoryId: string;
  subcategoryName: string;
  categoryId: string;
}

export function QuickModAdd({
  subcategoryId,
  subcategoryName,
}: QuickModAddProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-xs transition-all active:scale-95",
          "border-border/60 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
        )}
        aria-label="Mod ekle"
      >
        <SlidersHorizontal className="h-3 w-3" />
        <span>Mod ekle</span>
      </button>

      <ModPickDialog
        open={open}
        onOpenChange={setOpen}
        targetType="subcategory"
        targetId={subcategoryId}
        targetName={subcategoryName}
        onGoToMeasures={() => {
          setOpen(false);
          router.push("/structure/mods/olculer");
        }}
      />
    </>
  );
}
