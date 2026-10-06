import { ProgramGuard } from "@/components/layout/ProgramGuard";

export default function ProgramLayout({ children }: { children: React.ReactNode }) {
  return <ProgramGuard>{children}</ProgramGuard>;
}
