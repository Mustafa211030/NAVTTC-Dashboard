import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { FilterProvider } from "@/components/providers/FilterProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { FilterBar } from "@/components/filters/FilterBar";

export const metadata: Metadata = {
  title: "NAVTTC Analytics — PMYSDP Batch III",
  description: "Training Provider Institute performance assessment dashboard for the Prime Minister's Youth Skill Development Programme, Batch III.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a1526" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>
          <Suspense fallback={null}>
            <FilterProvider>
              <AppShell>
                <FilterBar />
                {children}
              </AppShell>
            </FilterProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
