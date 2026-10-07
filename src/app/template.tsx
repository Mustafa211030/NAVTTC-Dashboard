/**
 * Re-mounts on every route change (never on a filter/query change), so the
 * content column fades up once per navigation. Pure CSS — no JS animation.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
