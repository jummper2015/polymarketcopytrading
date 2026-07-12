import "./globals.css";

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hermes — Polymarket Copy Trading Bot",
  description:
    "Panel de control del bot de copy trading para Polymarket. Simulación (paper trading) únicamente.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen font-sans bg-surface-950 text-surface-50 antialiased">
        <Navbar />

        <div className="flex pt-14">
          <Sidebar />
          <main className="flex-1 ml-0 md:ml-56 min-h-[calc(100vh-3.5rem)] p-4 md:p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
