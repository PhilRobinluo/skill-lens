"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/orchestration/claude-md", label: "CLAUDE.md", description: "软编排 · 路由" },
  { href: "/orchestration/dependencies", label: "调用关系", description: "Skill 依赖" },
  { href: "/orchestration/canvas", label: "草稿画布", description: "手动编排" },
];

export default function OrchestrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div>
      {/* Tab navigation */}
      <div className="border-b bg-muted/30 px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto py-1">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
                <span className="hidden text-[10px] text-muted-foreground/60 sm:inline">
                  {tab.description}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
