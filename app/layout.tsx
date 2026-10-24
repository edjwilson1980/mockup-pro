import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const barlowCondensed = Barlow_Condensed({ variable: "--font-barlow-condensed", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Mockup Pro", template: "%s · Mockup Pro" },
  description: "Mockups, proofs and approvals for South Side Printing.",
};

export const viewport: Viewport = { themeColor: "#14181F" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="py-5 px-4 text-center text-[13px] text-muted border-t border-line">
          Powered by <span className="font-semibold text-ink-2">South Side Automation</span>
        </footer>
      </body>
    </html>
  );
}
