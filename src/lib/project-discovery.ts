import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PROJECT_SCAN_ROOTS } from "./config";
import type { ProjectInfo } from "./types";

// Cache: refresh every 60 seconds
let cachedProjects: ProjectInfo[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

/**
 * Discover projects that have CLAUDE.md or .claude/skills/ directories.
 * Scans PROJECT_SCAN_ROOTS at depth 1 (direct children only).
 */
export async function discoverProjects(): Promise<ProjectInfo[]> {
  const now = Date.now();
  if (cachedProjects && now - cacheTime < CACHE_TTL) {
    return cachedProjects;
  }

  const projects: ProjectInfo[] = [];
  const seen = new Set<string>();

  for (const root of PROJECT_SCAN_ROOTS) {
    if (!fs.existsSync(root)) continue;

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const projectPath = path.join(root, entry.name);
      if (seen.has(projectPath)) continue;
      seen.add(projectPath);

      const claudeMdPath = path.join(projectPath, "CLAUDE.md");
      const skillsDir = path.join(projectPath, ".claude", "skills");

      const hasClaudeMd = fs.existsSync(claudeMdPath);
      const hasSkills = fs.existsSync(skillsDir);

      // Skip if no CLAUDE.md and no skills
      if (!hasClaudeMd && !hasSkills) continue;

      let skillCount = 0;
      if (hasSkills) {
        try {
          const skillEntries = await fsp.readdir(skillsDir, { withFileTypes: true });
          skillCount = skillEntries.filter(e => e.isDirectory() && !e.name.startsWith(".")).length;
        } catch {
          // ignore
        }
      }

      projects.push({
        name: entry.name,
        path: projectPath,
        skillCount,
        hasClaudeMd,
        hasSkills,
      });
    }
  }

  // Sort: projects with skills first, then by name
  projects.sort((a, b) => {
    if (a.skillCount !== b.skillCount) return b.skillCount - a.skillCount;
    return a.name.localeCompare(b.name);
  });

  cachedProjects = projects;
  cacheTime = now;
  return projects;
}
