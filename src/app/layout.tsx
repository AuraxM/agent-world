import type { Metadata } from "next";
import { Silkscreen, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-body",
  weight: ["400", "500", "700"],
  display: "swap",
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
      className={`${silkscreen.variable} ${notoSansSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem("agent-world.theme") || "light";
                document.documentElement.setAttribute("data-theme", t);
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="h-full flex flex-col overflow-hidden">
        {children}
      </body>
    </html>
  );
}
