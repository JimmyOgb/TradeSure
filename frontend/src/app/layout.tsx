import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TradeSure | Commerce Trust & Intelligent Dispute Resolution",
  description: "Independent dispute resolution on GenLayer StudioNet with cryptographic evidence and consensus-backed arbiter evaluations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen flex flex-col antialiased`}>
        <Suspense fallback={<div className="h-16 border-b border-slate-200 bg-white" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1">
          <Suspense fallback={<div className="py-20 text-center text-slate-400">Loading...</div>}>
            {children}
          </Suspense>
        </main>
        <footer className="border-t border-slate-200 bg-white py-8 text-center text-sm text-slate-500">
          <div className="max-w-7xl mx-auto px-4">
            TradeSure Commerce Platform &copy; 2026. Powered by GenLayer Intelligent Contracts on StudioNet (Chain ID: 61999).
          </div>
        </footer>
      </body>
    </html>
  );
}
