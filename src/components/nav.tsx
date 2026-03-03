"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/skills", label: "Skills" },
  { href: "/graph", label: "依赖图" },
  { href: "/pipelines", label: "编排" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-8">
        <span className="text-lg font-bold tracking-tight">Skill Manager</span>
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        </span>
        watching
      </div>
    </nav>
  );
}
