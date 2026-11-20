import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Customer Support Copilot",
  description:
    "Multi-tenant SaaS copilot that drafts support replies grounded in company docs, past tickets, and a per-org style guide — with a draft approval queue, tone presets, and audit logging.",
  keywords: [
    "customer support",
    "copilot",
    "RAG",
    "draft approval queue",
    "multi-tenant SaaS",
    "Next.js",
    "tone presets",
  ],
  authors: [{ name: "Customer Support Copilot" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
