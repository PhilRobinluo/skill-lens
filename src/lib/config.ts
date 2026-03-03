import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Centralized configuration — all paths configurable via environment variables
// ---------------------------------------------------------------------------

const home = os.homedir();

/** Directories to scan for user skills (comma-separated) */
export const SKILL_DIRS: string[] = process.env.SKILL_DIRS
  ? process.env.SKILL_DIRS.split(",").map((d) => d.trim())
  : [path.join(home, ".claude", "skills")];

/** Directory to scan for plugin skills */
export const PLUGINS_CACHE_DIR: string =
  process.env.PLUGINS_CACHE_DIR ??
  path.join(home, ".claude", "plugins", "cache");

/** Path to CLAUDE.md for routing table parsing */
export const CLAUDE_MD_PATH: string =
  process.env.CLAUDE_MD_PATH ??
  path.join(home, ".claude", "CLAUDE.md");

/** Directory containing .jsonl transcript files for frequency scanning */
export const PROJECTS_DIR: string =
  process.env.PROJECTS_DIR ??
  path.join(home, ".claude", "projects");

/** Whether to run in demo mode (skip real scanning, use sample data) */
export const DEMO_MODE: boolean = process.env.DEMO === "1";

/** Data directory for registry and cache files */
export const DATA_DIR: string = path.join(process.cwd(), "data");
