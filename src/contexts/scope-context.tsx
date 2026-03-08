"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ScopeType } from "@/lib/types";

interface ScopeContextValue {
  scope: ScopeType;
  setScope: (scope: ScopeType) => void;
  /** Query string to append to API calls, e.g. "scope=global" */
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

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<ScopeType>(() => {
    if (typeof window === "undefined") return "global";
    return (localStorage.getItem("skill-lens-scope") as ScopeType) || "global";
  });

  const setScope = useCallback((newScope: ScopeType) => {
    setScopeState(newScope);
    if (typeof window !== "undefined") {
      localStorage.setItem("skill-lens-scope", newScope);
    }
  }, []);

  const isProjectScope = scope.startsWith("project:") || scope.startsWith("combined:");
  const isAllScope = scope === "all";
  const projectPath = isProjectScope ? scope.split(":").slice(1).join(":") : null;
  const scopeParam = `scope=${encodeURIComponent(scope)}`;
  /** Human-readable label for current scope */
  const scopeLabel = scope === "global" ? "全局"
    : scope === "all" ? "全部项目"
    : scope.startsWith("combined:") ? `${projectPath?.split("/").pop() ?? ""} + 全局`
    : projectPath?.split("/").pop() ?? "";

  return (
    <ScopeContext.Provider value={{ scope, setScope, scopeParam, isProjectScope, isAllScope, projectPath, scopeLabel }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope must be used within <ScopeProvider>");
  return ctx;
}
