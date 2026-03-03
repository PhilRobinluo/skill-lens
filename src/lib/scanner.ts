import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import type { SkillEntry, SkillSource, SkillsRegistry } from "./types";
import { parseClaudeMd } from "./claude-md-parser";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
const PLUGINS_CACHE_DIR = path.join(os.homedir(), ".claude", "plugins", "cache");
const CLAUDE_MD_PATH = path.join(os.homedir(), ".claude", "CLAUDE.md");

// ---------------------------------------------------------------------------
// parseSkillMd — extract description from SKILL.md content
// ---------------------------------------------------------------------------
export function parseSkillMd(content: string): string {
  if (!content.trim()) return "";

  // Try to extract from YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const frontmatter = fmMatch[1];
    const desc = extractFrontmatterDescription(frontmatter);
    if (desc) return desc;
  }

  // Fallback: first 3 non-empty lines (after frontmatter if present)
  let body = content;
  if (fmMatch) {
    body = content.slice(fmMatch[0].length);
  }

  const nonEmptyLines = body
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  return nonEmptyLines.slice(0, 3).join("\n");
}

/**
 * Extract the `description:` value from raw YAML frontmatter text.
 * Handles both inline (`description: value`) and block scalar
 * (`description: |` / `description: >`) forms.
 */
function extractFrontmatterDescription(fm: string): string | null {
  const lines = fm.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^description:\s*(.*)/);
    if (!match) continue;

    const inline = match[1].trim();

    // Inline value (not a block scalar indicator)
    if (inline && inline !== "|" && inline !== ">") {
      return inline;
    }

    // Block scalar: collect indented continuation lines
    const collected: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      // A non-indented, non-empty line means we left the block
      if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
        break;
      }
      // Skip truly empty lines within the block but preserve content
      if (line.trim().length === 0) {
        // Empty line inside block — stop collecting (YAML behaviour)
        break;
      }
      collected.push(line.replace(/^ {1,2}/, ""));
    }

    return collected.join("\n").trim() || null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// detectSource — auto-detect skill source from name & path
// ---------------------------------------------------------------------------
export function detectSource(name: string, filePath: string): SkillSource {
  if (name.startsWith("baoyu-")) return "baoyu";
  if (filePath.includes("claude-plugins-official")) return "plugin-official";
  if (filePath.includes("superpowers-marketplace")) return "plugin-community";
  return "self-built";
}

// ---------------------------------------------------------------------------
// scanSkillsDirectory — scan ~/.claude/skills/ and ~/.claude/plugins/cache/
// ---------------------------------------------------------------------------
export async function scanSkillsDirectory(): Promise<Record<string, SkillEntry>> {
  const skills: Record<string, SkillEntry> = {};

  // 1. Scan ~/.claude/skills/
  await scanUserSkills(skills);

  // 2. Scan ~/.claude/plugins/cache/ (recursive)
  await scanPluginsCache(skills);

  return skills;
}

async function scanUserSkills(
  skills: Record<string, SkillEntry>,
): Promise<void> {
  if (!fs.existsSync(SKILLS_DIR)) return;

  const entries = await fsp.readdir(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    // Skip _archived and dotfiles
    if (!entry.isDirectory()) continue;
    if (entry.name === "_archived" || entry.name.startsWith(".")) continue;

    const skillDir = path.join(SKILLS_DIR, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (!fs.existsSync(skillMdPath)) continue;

    const skillEntry = await buildSkillEntry(entry.name, skillDir, skillMdPath);
    skills[skillEntry.name] = skillEntry;
  }
}

async function scanPluginsCache(
  skills: Record<string, SkillEntry>,
): Promise<void> {
  if (!fs.existsSync(PLUGINS_CACHE_DIR)) return;

  // Recursively find all SKILL.md files under plugins/cache/
  const skillMdPaths = await findSkillMdFiles(PLUGINS_CACHE_DIR);

  for (const skillMdPath of skillMdPaths) {
    const skillDir = path.dirname(skillMdPath);
    const name = path.basename(skillDir);

    const skillEntry = await buildSkillEntry(name, skillDir, skillMdPath);
    // Use a composite key for plugin skills to avoid name collisions
    const key = skillEntry.source === "self-built" ? name : `${skillEntry.source}/${name}`;
    skills[key] = skillEntry;
  }
}

async function findSkillMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      // Permission denied or similar — skip
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

async function buildSkillEntry(
  name: string,
  skillDir: string,
  skillMdPath: string,
): Promise<SkillEntry> {
  const content = await fsp.readFile(skillMdPath, "utf-8");
  const stat = await fsp.stat(skillMdPath);

  return {
    name,
    path: skillDir,
    source: detectSource(name, skillDir),
    description: parseSkillMd(content),
    lineCount: content.split("\n").length,
    lastModified: stat.mtime.toISOString(),
    claudeMdRefs: [],
    tags: {
      domain: [],
      frequency: null,
      pipeline: null,
    },
    dependencies: [],
    notes: "",
  };
}

// ---------------------------------------------------------------------------
// scanAll — full scan with merge from existing registry
// ---------------------------------------------------------------------------
export async function scanAll(
  existingRegistry?: SkillsRegistry,
): Promise<SkillsRegistry> {
  const skills = await scanSkillsDirectory();

  // Parse CLAUDE.md for routing-table references
  let claudeMdRefs: Record<string, Array<{ table: string; trigger: string }>> =
    {};
  try {
    if (fs.existsSync(CLAUDE_MD_PATH)) {
      const claudeMdContent = await fsp.readFile(CLAUDE_MD_PATH, "utf-8");
      claudeMdRefs = parseClaudeMd(claudeMdContent);
    }
  } catch {
    // CLAUDE.md not found or unreadable — skip
  }

  // Attach CLAUDE.md refs to skills
  for (const [skillName, refs] of Object.entries(claudeMdRefs)) {
    if (skills[skillName]) {
      skills[skillName].claudeMdRefs = refs;
    }
  }

  // Merge with existing registry: preserve manual fields (tags, deps, notes)
  if (existingRegistry) {
    for (const [key, existingEntry] of Object.entries(
      existingRegistry.skills,
    )) {
      if (skills[key]) {
        // Keep manual data from existing, update auto-scanned fields
        skills[key].tags = existingEntry.tags;
        skills[key].dependencies = existingEntry.dependencies;
        skills[key].notes = existingEntry.notes;
      }
    }
  }

  const registry: SkillsRegistry = {
    skills,
    pipelines: existingRegistry?.pipelines ?? {},
    meta: {
      lastScan: new Date().toISOString(),
      totalSkills: Object.keys(skills).length,
      version: (existingRegistry?.meta.version ?? 0) + 1,
    },
  };

  return registry;
}
