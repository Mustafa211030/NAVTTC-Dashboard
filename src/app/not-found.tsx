import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-[var(--text-muted)]">That module does not exist in this dashboard.</p>
      <Link href="/" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white">Back to Overview</Link>
    </div>
  );
}
