"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  back?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  back,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mx-4 mb-6 border-b border-border bg-background/85 px-4 pb-4 pt-safe backdrop-blur-xl",
        className
      )}
    >
      <div className="flex items-center gap-3 pt-4">
        {back ? (
          <Link
            href={back}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Geri"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : null}
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="truncate text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
