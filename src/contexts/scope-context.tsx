"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ScopeType, SkillRuntime } from "@/lib/types";

interface ScopeContextValue {
  runtime: SkillRuntime;
  setRuntime: (runtime: SkillRuntime) => void;
  scope: ScopeType;
  setScope: (scope: ScopeType) => void;
  /** Query string to append to API calls, e.g. "scope=global&runtime=claude" */
  scopeParam: string;
  /** Whether the current scope involves a specific project */
  isProjectScope: boolean;
  /** Whether scope is "all" (all projects + global) */
  isAllScope: boolean;
  /** Extract project path from scope (if project or combined) */
  projectPath: string | null;
  /** Human-readable label */
  scopeLabel: string;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

function normalizeScope(raw: string | null): ScopeType {
  if (!raw || raw === "all" || raw.startsWith("combined:")) return "global";
  if (raw === "global" || raw.startsWith("project:")) return raw as ScopeType;
  return "global";
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntimeState] = useState<SkillRuntime>("codex");
  const [scope, setScopeState] = useState<ScopeType>("global");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem("skill-lens-runtime") as SkillRuntime | null;
      const defaultRuntime = localStorage.getItem("skill-lens-default-runtime") as SkillRuntime | null;
      const nextRuntime = saved || defaultRuntime || "codex";
      setRuntimeState(nextRuntime);
      setScopeState(normalizeScope(localStorage.getItem("skill-lens-scope")));
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const setRuntime = useCallback((newRuntime: SkillRuntime) => {
    setRuntimeState(newRuntime);
    setScopeState((currentScope) => {
      const nextScope = normalizeScope(currentScope);
      if (typeof window !== "undefined") {
        localStorage.setItem("skill-lens-scope", nextScope);
      }
      return nextScope;
    });
    if (typeof window !== "undefined") {
      localStorage.setItem("skill-lens-runtime", newRuntime);
    }
  }, []);

  const setScope = useCallback((newScope: ScopeType) => {
    const normalizedScope = normalizeScope(newScope);
    setScopeState(normalizedScope);
    if (typeof window !== "undefined") {
      localStorage.setItem("skill-lens-scope", normalizedScope);
    }
  }, []);

  const isProjectScope = scope.startsWith("project:") || scope.startsWith("combined:");
  const isAllScope = scope === "all";
  const projectPath = isProjectScope ? scope.split(":").slice(1).join(":") : null;
  const scopeParam = `scope=${encodeURIComponent(scope)}&runtime=${encodeURIComponent(runtime)}`;
  /** Human-readable label for current scope */
  const scopeLabel = scope === "global" ? "全局"
    : scope === "all" ? "全局"
    : scope.startsWith("combined:") ? `${projectPath?.split("/").pop() ?? ""} + 全局`
    : projectPath?.split("/").pop() ?? "";

  return (
    <ScopeContext.Provider value={{ runtime, setRuntime, scope, setScope, scopeParam, isProjectScope, isAllScope, projectPath, scopeLabel }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope must be used within <ScopeProvider>");
  return ctx;
}
