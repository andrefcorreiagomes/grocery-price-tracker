import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Poupa Fácil - preços de supermercado comparados",
  description:
    "Preços de supermercado recolhidos diariamente no Continente, no Pingo Doce e no Auchan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        {/* On every page: how the prices are collected and compared (4 November 2026). */}
        <footer className="site-footer">
          <Link href="/como-comparamos">Como comparamos</Link>
        </footer>
      </body>
    </html>
  );
}
