"use client";

import { useEffect } from "react";
import { ensureBuiltInDimensions } from "@/lib/db/queries";
import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureBuiltInDimensions().catch((err) =>
      console.error("Failed to seed dimensions", err)
    );
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <main className="flex-1 px-4 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
