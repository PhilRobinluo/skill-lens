import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import type { SkillEntry, SkillSource, SkillsRegistry } from "./types";
import { parseClaudeMd } from "./claude-md-parser";
import {
  SKILL_DIRS,
  PLUGINS_CACHE_DIR,
  CLAUDE_MD_PATH,
} from "./config";

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

  // 1. Scan user skill directories (configurable via SKILL_DIRS)
  for (const dir of SKILL_DIRS) {
    await scanUserSkills(skills, dir);
  }

  // 2. Scan plugins cache (recursive)
  await scanPluginsCache(skills);

  return skills;
}

async function scanUserSkills(
  skills: Record<string, SkillEntry>,
  skillsDir: string,
): Promise<void> {
  if (!fs.existsSync(skillsDir)) return;

  const entries = await fsp.readdir(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip _archived and dotfiles
    if (!entry.isDirectory()) continue;
    if (entry.name === "_archived" || entry.name.startsWith(".")) continue;

    const skillDir = path.join(skillsDir, entry.name);
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
    createdAt: stat.birthtime.toISOString(),
    lastModified: stat.mtime.toISOString(),
    claudeMdRefs: [],
    tags: {
      domain: [],
      autoTagged: false,
      frequency: null,
    },
    dependencies: [],
    notes: "",
  };
}

// ---------------------------------------------------------------------------
// autoInferTags — infer domain tags for skills without manual tags
// ---------------------------------------------------------------------------

/** Mapping from CLAUDE.md routing table names to domain tags. */
const ROUTING_TABLE_DOMAIN_MAP: Record<string, string> = {
  "Obsidian Skill 路由表": "笔记",
  "写作工作流 Skill 路由": "写作",
  "任务系统 Skill 路由": "任务",
  "Notion 协作路由": "Notion",
  "安全防护 Skill 路由": "安全",
  "设备与网络 Skill 路由": "设备/网络",
  "信息消费 Skill 路由": "信息消费",
  "自动进化规则": "系统",
  "思维增强 Skill 路由": "思维",
  "投资系统路由": "投资",
};

/** baoyu-* sub-categories: image/generation vs publishing */
const BAOYU_IMAGE_SKILLS = new Set([
  "baoyu-image-gen",
  "baoyu-cover-image",
  "baoyu-xhs-images",
  "baoyu-infographic",
  "baoyu-slide-deck",
  "baoyu-comic",
  "baoyu-article-illustrator",
  "baoyu-compress-image",
]);

const BAOYU_PUBLISH_SKILLS = new Set([
  "baoyu-post-to-wechat",
  "baoyu-post-to-x",
  "baoyu-danger-x-to-markdown",
  "baoyu-danger-gemini-web",
  "baoyu-url-to-markdown",
]);

/**
 * Auto-infer domain tags for a skill based on 4-level priority:
 * 1. CLAUDE.md routing table name
 * 2. Name prefix patterns
 * 3. Description keyword matching (first 100 chars)
 * 4. Fallback to "未分类"
 */
export function autoInferTags(skill: SkillEntry): string[] {
  // Priority 1: CLAUDE.md routing table name → domain tag
  if (skill.claudeMdRefs.length > 0) {
    const inferred = new Set<string>();
    for (const ref of skill.claudeMdRefs) {
      const domain = ROUTING_TABLE_DOMAIN_MAP[ref.table];
      if (domain) inferred.add(domain);
    }
    if (inferred.size > 0) return Array.from(inferred);
  }

  // Priority 2: Name prefix → domain tag
  const name = skill.name;

  if (name.startsWith("baoyu-")) {
    if (BAOYU_IMAGE_SKILLS.has(name)) return ["图像/生成"];
    if (BAOYU_PUBLISH_SKILLS.has(name)) return ["发布"];
    // Default baoyu fallback — check description
  }
  if (name.startsWith("obsidian-")) return ["笔记"];
  if (name.startsWith("article-")) return ["写作"];
  if (name.startsWith("video-")) return ["视频"];
  if (name.startsWith("slack-") || name.startsWith("slack:")) return ["协作"];
  if (name.startsWith("Notion") || name.startsWith("notion:") || name.startsWith("Notion:")) return ["Notion"];
  if (name.startsWith("vercel") || name.startsWith("vercel:")) return ["部署"];
  if (name.startsWith("superpowers:")) return ["开发流程"];
  if (name.startsWith("planning-with-files")) return ["规划"];
  if (name.startsWith("code-review")) return ["代码审查"];
  if (name.startsWith("ralph-loop")) return ["开发流程"];

  // Priority 3: Description keyword matching (first 100 chars)
  const desc = skill.description.slice(0, 100);
  if (/写作|文章|写|发布/.test(desc)) return ["写作"];
  if (/图|image|生成/.test(desc)) return ["图像/生成"];
  if (/安全|security|审计/.test(desc)) return ["安全"];
  if (/视频|video|抖音/.test(desc)) return ["视频"];
  if (/笔记|Obsidian|仓库/.test(desc)) return ["笔记"];
  if (/任务|task|待办/.test(desc)) return ["任务"];

  // Priority 4: Fallback
  return ["未分类"];
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

  // Auto-infer domain tags for skills that have no manual tags
  for (const skill of Object.values(skills)) {
    if (skill.tags.domain.length === 0) {
      skill.tags.domain = autoInferTags(skill);
      skill.tags.autoTagged = true;
    }
  }

  const registry: SkillsRegistry = {
    skills,
    meta: {
      lastScan: new Date().toISOString(),
      totalSkills: Object.keys(skills).length,
      version: (existingRegistry?.meta.version ?? 0) + 1,
    },
  };

  return registry;
}
