import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import "./globals.css";

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "agent-world · 月ノ谷",
  description: "LLM-as-NPC 模拟世界 · 北海道の村",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${silkscreen.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col overflow-hidden bg-(--color-pixel-bg) text-(--color-pixel-fg)">
        {children}
      </body>
    </html>
  );
}
