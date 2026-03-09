import type { Metadata } from "next";
import "@/lib/config/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "RebuilD",
  description: "AI-Driven Project Management, Rebuilt.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
