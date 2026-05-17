"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AddOption {
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface AddTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: AddOption[];
}

export function AddTypeModal({
  open,
  onOpenChange,
  options,
}: AddTypeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6">
        <DialogHeader>
          <DialogTitle>Ne eklemek istiyorsun?</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                onOpenChange(false);
                opt.onClick();
              }}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted active:scale-[0.99]"
            >
              {opt.icon}
              <div>
                <div className="font-semibold">{opt.label}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {opt.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
