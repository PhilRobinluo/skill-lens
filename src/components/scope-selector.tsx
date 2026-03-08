"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScope } from "@/contexts/scope-context";
import type { ProjectInfo, ScopeType } from "@/lib/types";

export function ScopeSelector() {
  const { scope, setScope, scopeLabel } = useScope();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.projects) setProjects(data.projects); })
      .catch(() => {});
  }, []);

  function selectScope(s: ScopeType) {
    setScope(s);
    setOpen(false);
  }

  // Derive state
  const isGlobal = scope === "global";
  const isAll = scope === "all";
  const isProject = scope.startsWith("project:");
  const isCombined = scope.startsWith("combined:");
  const currentProjectPath = (isProject || isCombined)
    ? scope.split(":").slice(1).join(":")
    : null;

  // "包含全局" checkbox logic: toggle between project:<path> and combined:<path>
  function toggleIncludeGlobal() {
    if (!currentProjectPath) return;
    if (isCombined) {
      setScope(`project:${currentProjectPath}`);
    } else {
      setScope(`combined:${currentProjectPath}`);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent"
          aria-label="切换视角"
        >
          {/* Show scope label when not global */}
          {!isGlobal && (
            <span className="max-w-[120px] truncate text-[10px] font-medium text-primary/80">
              {scopeLabel}
            </span>
          )}
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
        {/* ── Section: 视角 ── */}
        <div className="p-2">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            视角
          </p>

          {/* 全局 */}
          <ScopeOption
            active={isGlobal}
            onClick={() => selectScope("global")}
            icon="G"
            label="全局"
            description="全局 Skill + 全局 CLAUDE.md"
          />

          {/* 全部项目 */}
          <ScopeOption
            active={isAll}
            onClick={() => selectScope("all")}
            icon="*"
            label="全部项目"
            description="所有项目 + 全局，全景鸟瞰"
          />
        </div>

        {/* ── Section: 项目 ── */}
        {projects.length > 0 && (
          <>
            <div className="border-t" />
            <div className="p-2">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                项目
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
                        {project.hasClaudeMd && (
                          <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            MD
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

        {/* ── Checkbox: 包含全局 (only when a specific project is selected) ── */}
        {(isProject || isCombined) && (
          <>
            <div className="border-t" />
            <div className="p-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  checked={isCombined}
                  onChange={toggleIncludeGlobal}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-muted-foreground/30 accent-primary"
                />
                <span className="text-muted-foreground">包含全局 Skill</span>
              </label>
            </div>
          </>
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
