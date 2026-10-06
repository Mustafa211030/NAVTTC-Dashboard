"use client";
import Link from "next/link";
import { useDash } from "../providers/FilterProvider";
import { Card } from "../ui";

/** Renders a programme route only when the slug in the URL is a registered programme. */
export function ProgramGuard({ children }: { children: React.ReactNode }) {
  const { scope, data } = useDash();
  if (scope.program) return <>{children}</>;
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
      <h1 className="text-lg font-bold">Programme not found</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">This dashboard covers {data.programs.length} programmes:</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {data.programs.map((p) => (
          <Link key={p.slug} href={`/p/${p.slug}`} className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: p.color }}>{p.short}</Link>
        ))}
      </div>
      <Link href="/" className="mt-4 inline-block text-xs font-semibold text-brand-600 hover:underline">Back to All Programmes</Link>
    </Card>
  );
}
