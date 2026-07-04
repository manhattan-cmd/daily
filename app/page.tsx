"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { listRecentEntries } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/dashboard/entry-card";

export default function HomePage() {
  const recent = useLiveQuery(() => listRecentEntries(20), []);
  const stats = useLiveQuery(async () => {
    const start = startOfDay(Date.now());
    const todayCount = await db.entries
      .where("occurredAt")
      .aboveOrEqual(start)
      .count();
    const totalCount = await db.entries.count();
    const catCount = await db.categories.count();
    return { todayCount, totalCount, catCount };
  }, []);

  const greeting = getGreeting();

  return (
    <>
      <header className="-mx-4 mb-6 px-4 pb-4 pt-12">
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Routine</h1>
      </header>

      {stats ? (
        <div className="mb-6 grid grid-cols-3 gap-2">
          <StatCard label="Bugün" value={stats.todayCount} />
          <StatCard label="Toplam" value={stats.totalCount} />
          <StatCard label="Kategori" value={stats.catCount} />
        </div>
      ) : null}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Son girdiler
        </h2>
      </div>

      {recent === undefined ? null : recent.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Henüz girdi yok"
          description={
            stats?.catCount
              ? "İlk girdini yapmaya hazır mısın?"
              : "Önce yapını oluştur, sonra girdi yap."
          }
          action={
            <Button asChild>
              <Link href={stats?.catCount ? "/calendar" : "/structure"}>
                <Plus className="h-4 w-4" />
                {stats?.catCount ? "Takvime git" : "Yapı oluştur"}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi öğlenler";
  return "İyi akşamlar";
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
