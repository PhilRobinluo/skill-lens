import path from "node:path";
import os from "node:os";
import type { SkillRuntime } from "./types";

export interface RuleFilePaths {
  /** Git working directory */
  gitCwd: string;
  /** Relative path to the rule file within gitCwd */
  relativePath: string;
  /** Absolute path to the rule file */
  absolutePath: string;
  /** Runtime-specific rule file name */
  fileName: "AGENTS.md" | "CLAUDE.md";
}

function normalizeRuntime(runtime: string | null | undefined): SkillRuntime {
  return runtime === "codex" ? "codex" : "claude";
}

/**
 * Resolve runtime-specific rule file git paths.
 *
 * Codex global: ~/.codex/AGENTS.md
 * Claude global: ~/.claude/CLAUDE.md
 * Project rules: <project>/AGENTS.md or <project>/CLAUDE.md
 */
export function resolveRuleFilePaths(
  projectPath: string | null,
  runtime?: string | null,
): RuleFilePaths {
  const activeRuntime = normalizeRuntime(runtime);
  const fileName = activeRuntime === "codex" ? "AGENTS.md" : "CLAUDE.md";

  if (projectPath) {
    return {
      gitCwd: projectPath,
      relativePath: fileName,
      absolutePath: path.join(projectPath, fileName),
      fileName,
    };
  }

  const homeDir = path.join(os.homedir(), activeRuntime === "codex" ? ".codex" : ".claude");
  return {
    gitCwd: homeDir,
    relativePath: fileName,
    absolutePath: path.join(homeDir, fileName),
    fileName,
  };
}

/**
 * Resolve CLAUDE.md git paths based on project parameter.
 *
 * Global CLAUDE.md: lives at ~/.claude/CLAUDE.md, git cwd = ~/.claude
 * Project CLAUDE.md: lives at <project>/CLAUDE.md, git cwd = <project>
 */
export function resolveClaudeMdPaths(
  projectPath: string | null,
  runtime?: string | null,
): RuleFilePaths {
  return resolveRuleFilePaths(projectPath, runtime);
}
