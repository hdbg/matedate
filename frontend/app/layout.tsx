import type { Metadata } from "next";
import { Bricolage_Grotesque, Space_Mono } from "next/font/google";
import Script from "next/script";
import { AppProviders } from "./providers/AppProviders";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "MateDate — flirting, graded like a chess engine",
  description:
    "Every text gets a verdict, from !! Brilliant to ?? Blunder. Play solo, ranked, or review real chats.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
        {/* Rybbit analytics, proxied first-party through /analytics/* (see next.config.ts
            rewrites) so the tracker rides our origin. The script reads the analytics host from
            its own same-origin src, then beacons to /analytics/track etc. */}
        <Script
          src="/analytics/script.js"
          data-site-id="0af5f41c85fd"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
