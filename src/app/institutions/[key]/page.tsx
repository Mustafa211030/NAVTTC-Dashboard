import { GlobalInstituteModule } from "@/modules/GlobalInstitute";

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <GlobalInstituteModule globalKey={decodeURIComponent(key)} />;
}
