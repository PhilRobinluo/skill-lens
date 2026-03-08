import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import { parseClaudeMdRouteRows } from "@/lib/claude-md-parser";
import { discoverProjects } from "@/lib/project-discovery";

interface DraftSkillItem {
  id: string;
  type: "skill";
  name: string;
  description: string;
  source: string;
  domain: string[];
}

interface DraftClaudeItem {
  id: string;
  type: "claude-doc" | "claude-route";
  label: string;
  table?: string;
  trigger?: string;
  skills?: string[];
  sourceLabel: string;
  sourcePath: string;
}

export async function GET(): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const registry = await readRegistry();

    // Deduplicate by name (plugins may have duplicate skill names)
    const seenNames = new Set<string>();
    const skills: DraftSkillItem[] = Object.values(registry.skills)
      .filter((skill) => {
        if (seenNames.has(skill.name)) return false;
        seenNames.add(skill.name);
        return true;
      })
      .map((skill) => ({
        id: `skill:${skill.name}`,
        type: "skill" as const,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        domain: skill.tags.domain,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const claudeDocs = await findClaudeDocs();
    const claudeItems: DraftClaudeItem[] = [];

    for (const doc of claudeDocs) {
      let content = "";
      try {
        content = await fsp.readFile(doc.path, "utf-8");
      } catch {
        continue;
      }

      claudeItems.push({
        id: `claude-doc:${doc.path}`,
        type: "claude-doc",
        label: `${doc.label} CLAUDE.md`,
        sourceLabel: doc.label,
        sourcePath: doc.path,
      });

      const rows = parseClaudeMdRouteRows(content);
      rows.forEach((row, index) => {
        claudeItems.push({
          id: `claude-route:${doc.path}:${index}`,
          type: "claude-route",
          label: `${row.table}`,
          table: row.table,
          trigger: row.trigger,
          skills: row.skills,
          sourceLabel: doc.label,
          sourcePath: doc.path,
        });
      });
    }

    return NextResponse.json({
      skills,
      claudeItems,
      total: {
        skills: skills.length,
        claudeItems: claudeItems.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function findClaudeDocs(): Promise<Array<{ label: string; path: string }>> {
  const docs: Array<{ label: string; path: string }> = [];

  // Global CLAUDE.md
  const globalPath = path.join(os.homedir(), ".claude", "CLAUDE.md");
  if (await exists(globalPath)) {
    docs.push({ label: "全局", path: globalPath });
  }

  // Project-level CLAUDE.md files (via project discovery)
  try {
    const projects = await discoverProjects();
    for (const project of projects) {
      if (project.hasClaudeMd) {
        const claudeMdPath = path.join(project.path, "CLAUDE.md");
        docs.push({ label: project.name, path: claudeMdPath });
      }
    }
  } catch {
    // Fallback: skip project discovery if it fails
  }

  return docs;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
