import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { FilterProvider } from "@/components/providers/FilterProvider";
import { ThemeProvider, PREFS_SCRIPT } from "@/components/providers/ThemeProvider";
import { FilterBar } from "@/components/filters/FilterBar";
import { InstituteSpotlight } from "@/components/filters/InstituteSpotlight";

export const metadata: Metadata = {
  title: "NAVTTC Programme Analytics",
  description: "Training Provider Institute monitoring analytics across NAVTTC programmes — PMYSDP Batches I–III and the cluster-based programmes — combined and per programme.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#090d16" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies stored theme/accent/density before first paint — no flash. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="preload" href="/data/portfolio.json" as="fetch" crossOrigin="anonymous" />
      </head>
      <body>
        <ThemeProvider>
          <Suspense fallback={null}>
            <FilterProvider>
              <AppShell>
                <FilterBar />
                <InstituteSpotlight />
                {children}
              </AppShell>
            </FilterProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
