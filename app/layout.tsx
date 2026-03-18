import type { Metadata } from "next";
import "@fontsource/inter";
import "@fontsource/jetbrains-mono";
import "@/lib/config/env";
import "./globals.css";
import { Providers } from "./providers";

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
      <body className="antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
