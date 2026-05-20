import fsp from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import { codexReportToSkillEntries, scanCodexSkills } from "@/lib/codex-scanner";
import { getSkillGitHistory } from "@/lib/git-history";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import type { SkillEntry, SkillGitHistory, SkillRuntime } from "@/lib/types";

const execFile = promisify(execFileCb);

export const EMPTY_SKILL_HISTORY: SkillGitHistory = {
  totalCommits: 0,
  createdAt: "",
  lastCommitAt: "",
  hasUncommittedChanges: false,
  contributors: [],
  timeline: [],
};

export interface SkillGitLocation {
  gitRoot: string;
  relativePath: string;
}

export function decodeSkillName(rawName: string): string {
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

export function runtimeFromRequest(request: Request): SkillRuntime | null {
  const runtime = new URL(request.url).searchParams.get("runtime");
  return runtime === "codex" || runtime === "claude" ? runtime : null;
}

function isCodexSkillName(name: string): boolean {
  return name.startsWith("codex-");
}

export async function resolveSkillByName(
  rawName: string,
  runtime?: SkillRuntime | null,
): Promise<SkillEntry | null> {
  const name = decodeSkillName(rawName);

  if (runtime === "codex" || isCodexSkillName(name)) {
    const report = await scanCodexSkills();
    const skills = codexReportToSkillEntries(report);
    return skills.find((entry) => entry.name === name) ?? null;
  }

  await ensureInitialized();
  const registry = await readRegistry();
  return (
    registry.skills[name] ??
    Object.values(registry.skills).find((entry) => entry.name === name) ??
    null
  );
}

export async function resolveSkillFromRequest(
  request: Request,
  rawName: string,
): Promise<SkillEntry | null> {
  return resolveSkillByName(rawName, runtimeFromRequest(request));
}

export async function getSkillGitLocation(skillPath: string): Promise<SkillGitLocation | null> {
  let cwd = skillPath;
  try {
    const stat = await fsp.stat(skillPath);
    if (!stat.isDirectory()) cwd = path.dirname(skillPath);
  } catch {
    cwd = path.dirname(skillPath);
  }

  try {
    const { stdout } = await execFile("git", ["rev-parse", "--show-toplevel"], { cwd });
    const gitRoot = stdout.trim();
    return {
      gitRoot,
      relativePath: path.relative(gitRoot, skillPath) || ".",
    };
  } catch {
    return null;
  }
}

export async function getHistoryForSkillPath(skillPath: string): Promise<SkillGitHistory> {
  const gitLocation = await getSkillGitLocation(skillPath);
  if (!gitLocation) return EMPTY_SKILL_HISTORY;
  return getSkillGitHistory(gitLocation.gitRoot, gitLocation.relativePath);
}
