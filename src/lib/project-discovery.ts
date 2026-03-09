import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PROJECT_SCAN_ROOTS, PROJECTS_DIR } from "./config";
import type { ProjectInfo } from "./types";

// Cache: refresh every 60 seconds
let cachedProjects: ProjectInfo[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

/**
 * Extract real project paths from ~/.claude/projects/ session directories.
 * Each subdirectory contains JSONL session files with a `cwd` field
 * that holds the actual filesystem path of the project.
 */
async function discoverPathsFromSessions(): Promise<string[]> {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  let dirs: fs.Dirent[];
  try {
    dirs = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths = new Set<string>();
  const home = os.homedir();

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;

    const dirPath = path.join(PROJECTS_DIR, dir.name);
    let files: string[];
    try {
      files = await fsp.readdir(dirPath);
    } catch {
      continue;
    }

    // Find the most recent JSONL file
    const jsonlFiles = files
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();
    if (jsonlFiles.length === 0) continue;

    // Read first 4KB to find a cwd field
    const filePath = path.join(dirPath, jsonlFiles[0]);
    let cwd: string | null = null;
    try {
      const fd = await fsp.open(filePath, "r");
      const buf = Buffer.alloc(4096);
      await fd.read(buf, 0, 4096, 0);
      await fd.close();

      const lines = buf.toString("utf-8").split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.cwd && typeof entry.cwd === "string") {
            cwd = entry.cwd;
            break;
          }
        } catch {
          // partial JSON at buffer boundary
        }
      }
    } catch {
      continue;
    }

    if (!cwd) continue;
    // Skip home directory itself and paths inside ~/.claude/
    if (cwd === home) continue;
    if (cwd === "/") continue;
    if (cwd.startsWith(path.join(home, ".claude"))) continue;
    // Skip temp/system directories
    if (cwd.includes("/tmp/") || cwd.includes("/temp/")) continue;
    if (cwd.startsWith(path.join(home, "Library"))) continue;

    paths.add(cwd);
  }

  return Array.from(paths);
}

/**
 * Check a single directory for CLAUDE.md and .claude/skills/,
 * add to projects list if it qualifies.
 */
async function tryAddProject(
  projectPath: string,
  seen: Set<string>,
  projects: ProjectInfo[]
): Promise<void> {
  if (seen.has(projectPath)) return;
  if (!fs.existsSync(projectPath)) return;

  const claudeMdPath = path.join(projectPath, "CLAUDE.md");
  const skillsDir = path.join(projectPath, ".claude", "skills");

  const hasClaudeMd = fs.existsSync(claudeMdPath);
  const hasSkills = fs.existsSync(skillsDir);

  if (!hasClaudeMd) return;
  seen.add(projectPath);

  let skillCount = 0;
  if (hasSkills) {
    try {
      const skillEntries = await fsp.readdir(skillsDir, {
        withFileTypes: true,
      });
      skillCount = skillEntries.filter(
        (e) => e.isDirectory() && !e.name.startsWith(".")
      ).length;
    } catch {
      // ignore
    }
  }

  projects.push({
    name: path.basename(projectPath),
    path: projectPath,
    skillCount,
    hasClaudeMd,
    hasSkills,
  });
}

/**
 * Recursively scan a directory for projects with CLAUDE.md.
 * @param maxDepth — how many levels deep to look (1 = direct children only)
 */
async function scanRoot(
  root: string,
  seen: Set<string>,
  projects: ProjectInfo[],
  maxDepth = 1,
  _currentDepth = 0
): Promise<void> {
  if (_currentDepth >= maxDepth) return;
  if (!fs.existsSync(root)) return;

  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const childPath = path.join(root, entry.name);
    // Try this directory as a project
    await tryAddProject(childPath, seen, projects);
    // If not a project, recurse deeper to find nested projects
    if (!seen.has(childPath) && _currentDepth + 1 < maxDepth) {
      await scanRoot(childPath, seen, projects, maxDepth, _currentDepth + 1);
    }
  }
}

/**
 * Discover projects that have CLAUDE.md or .claude/skills/ directories.
 *
 * Sources (in order):
 * 1. Direct matches from ~/.claude/projects/ session history (zero-config)
 * 2. Auto-inferred parent directories from session paths (sibling discovery)
 * 3. PROJECT_SCAN_ROOTS env var — scans at depth 1 (opt-in)
 */
export async function discoverProjects(): Promise<ProjectInfo[]> {
  const now = Date.now();
  if (cachedProjects && now - cacheTime < CACHE_TTL) {
    return cachedProjects;
  }

  const projects: ProjectInfo[] = [];
  const seen = new Set<string>();
  const home = os.homedir();

  // --- Source 1: Direct matches from Claude Code session history ---
  const sessionPaths = await discoverPathsFromSessions();
  for (const p of sessionPaths) {
    await tryAddProject(p, seen, projects);
  }

  // --- Source 2: Auto-infer scan roots from session paths ---
  // Walk up from each session path to find a "project root" directory
  // (a direct child of $HOME), then scan it recursively (depth 3).
  // e.g. ~/open_source/01_x/商业/project → infer ~/open_source/
  const inferredRoots = new Set<string>();
  const skipDirs = new Set(["Desktop", "Downloads", "Documents", "Library",
    "Pictures", "Music", "Movies", "Public", "Applications"]);
  for (const p of sessionPaths) {
    let dir = path.dirname(p);
    while (dir && dir !== home && dir !== "/" && path.dirname(dir) !== home) {
      dir = path.dirname(dir);
    }
    if (dir && dir !== home && dir !== "/" && !skipDirs.has(path.basename(dir))) {
      inferredRoots.add(dir);
    }
  }
  for (const root of inferredRoots) {
    await scanRoot(root, seen, projects, 3);
  }

  // --- Source 3: PROJECT_SCAN_ROOTS env var (depth-3 scan) ---
  for (const root of PROJECT_SCAN_ROOTS) {
    await scanRoot(root, seen, projects, 3);
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
