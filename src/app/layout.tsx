import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { ScopeProvider } from "@/contexts/scope-context";
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
  title: "技能透镜 Skill Lens",
  description: "Claude Code Skills 可视化仪表盘",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ScopeProvider>
          <Nav />
          <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
        </ScopeProvider>
      </body>
    </html>
  );
}
