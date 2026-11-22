import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter_Tight } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/*
 * Display face, for headings and the big money figures only. Geist carries the
 * UI; Inter Tight is narrower with smaller apertures, so it holds together at
 * 48px+ where Geist starts to look loose and generic. Having a second face at
 * all is the point: a product where every size is one font reads as a
 * dashboard, not a brand.
 */
const display = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "EDGEWISE — Follow the Smart Money", template: "%s · EDGEWISE" },
  description: "Track Polymarket's most profitable traders, see where their positions overlap, and research the markets they agree on. Educational and analytical; EDGEWISE never places wagers.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: { title: "EDGEWISE", description: "Follow the Smart Money.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0f1117", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
