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

/** Extra parent directories to scan for projects (comma-separated, optional) */
export const PROJECT_SCAN_ROOTS: string[] = process.env.PROJECT_SCAN_ROOTS
  ? process.env.PROJECT_SCAN_ROOTS.split(",").map((d) => d.trim())
  : [];

/** Whether to run in demo mode (skip real scanning, use sample data) */
export const DEMO_MODE: boolean = process.env.DEMO === "1";

/** Bundled read-only data shipped with the app, such as demo fixtures. */
export const BUNDLED_DATA_DIR: string = path.join(process.cwd(), "data");

function defaultRuntimeDataDir(): string {
  if (process.env.NODE_ENV === "test") {
    return BUNDLED_DATA_DIR;
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Skill Lens", "data");
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "Skill Lens",
      "data",
    );
  }

  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"),
    "skill-lens",
    "data",
  );
}

/**
 * Runtime data directory for user-specific state.
 *
 * User-specific settings and scanned registries should not live inside the
 * repository, even when ignored by git. Keeping the default under the OS app
 * data directory prevents accidental commits, screenshots, or packaged leaks.
 */
export const DATA_DIR: string =
  process.env.SKILL_LENS_DATA_DIR ?? defaultRuntimeDataDir();
