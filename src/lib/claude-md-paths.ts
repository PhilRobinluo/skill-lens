import path from "node:path";
import os from "node:os";

/**
 * Resolve CLAUDE.md git paths based on project parameter.
 *
 * Global CLAUDE.md: lives at ~/.claude/CLAUDE.md, git cwd = ~/.claude
 * Project CLAUDE.md: lives at <project>/CLAUDE.md, git cwd = <project>
 */
export function resolveClaudeMdPaths(projectPath: string | null): {
  /** Git working directory */
  gitCwd: string;
  /** Relative path to CLAUDE.md within gitCwd */
  relativePath: string;
  /** Absolute path to CLAUDE.md file */
  absolutePath: string;
} {
  if (projectPath) {
    return {
      gitCwd: projectPath,
      relativePath: "CLAUDE.md",
      absolutePath: path.join(projectPath, "CLAUDE.md"),
    };
  }

  const claudeDir = path.join(os.homedir(), ".claude");
  return {
    gitCwd: claudeDir,
    relativePath: "CLAUDE.md",
    absolutePath: path.join(claudeDir, "CLAUDE.md"),
  };
}
