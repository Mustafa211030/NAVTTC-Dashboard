import { institutes } from "@/lib/dataset";
import { InstituteDetail } from "./InstituteDetail";

/** Static export needs every institute route enumerated at build time. */
export function generateStaticParams() {
  return institutes.map((i) => ({ id: String(i.instituteId) }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InstituteDetail id={Number(id)} />;
}
