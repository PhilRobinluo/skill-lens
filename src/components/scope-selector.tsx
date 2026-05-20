"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScope } from "@/contexts/scope-context";
import type { ProjectInfo, ScopeType } from "@/lib/types";

export function ScopeSelector() {
  const { runtime, scope, setScope, scopeLabel } = useScope();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects?runtime=${runtime}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && data?.projects) setProjects(data.projects);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  function selectScope(s: ScopeType) {
    setScope(s);
    setOpen(false);
  }

  // Derive state
  const isGlobal = scope === "global";
  const isProject = scope.startsWith("project:");
  const currentProjectPath = isProject
    ? scope.split(":").slice(1).join(":")
    : null;
  const ruleFileName = runtime === "codex" ? "AGENTS.md" : "CLAUDE.md";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent"
          aria-label="切换视角"
        >
          <span className="max-w-[120px] truncate text-[10px] font-medium text-primary/80">
            {isGlobal ? "全局视图" : scopeLabel}
          </span>
          {/* Subtle chevron */}
          <svg
            className={`h-3 w-3 text-muted-foreground/40 transition-all group-hover:text-muted-foreground ${open ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[260px] border bg-background/90 p-0 shadow-xl backdrop-blur-xl"
      >
        {/* ── Section: Scope ── */}
        <div className="p-2">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            视角
          </p>

          <ScopeOption
            active={isGlobal}
            onClick={() => selectScope("global")}
            icon="G"
            label="全局 Skill"
            description={`只看全局 Skill + 全局 ${ruleFileName}`}
          />
        </div>

        {/* ── Section: 项目 ── */}
        {projects.length > 0 && (
          <>
            <div className="border-t" />
            <div className="p-2">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                项目 Skill
              </p>
              <div className="max-h-[240px] space-y-0.5 overflow-y-auto">
                {projects.map((project) => {
                  const isThisActive = currentProjectPath === project.path;
                  return (
                    <button
                      key={project.path}
                      type="button"
                      onClick={() => selectScope(`project:${project.path}`)}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                        isThisActive
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {project.skillCount > 0 && (
                          <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {project.skillCount}
                          </span>
                        )}
                      {(runtime === "codex" ? project.hasAgentsMd : project.hasClaudeMd) && (
                        <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {runtime === "codex" ? "AG" : "MD"}
                        </span>
                      )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {isProject && (
          <div className="border-t px-4 py-2 text-[10px] leading-4 text-muted-foreground/70">
            项目视图只看当前项目，不自动混入全局 Skill。
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Reusable option row */
function ScopeOption({
  active,
  onClick,
  icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
        active ? "bg-primary/10 text-primary" : "hover:bg-accent"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{label}</span>
        <p className="truncate text-[10px] text-muted-foreground/60">{description}</p>
      </div>
      {active && (
        <svg className="h-4 w-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
