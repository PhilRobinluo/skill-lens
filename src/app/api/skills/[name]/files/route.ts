import path from "node:path";
import fsp from "node:fs/promises";
import { NextResponse } from "next/server";
import { decodeSkillName, resolveSkillFromRequest } from "@/lib/skill-resolver";
import type { FileNode } from "@/lib/types";

async function buildFileTree(dirPath: string, basePath: string, depth = 0): Promise<FileNode[]> {
  if (depth > 5) return [];
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries.sort((a, b) => {
    // directories first, then alphabetical
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  })) {
    // Skip hidden files and node_modules
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath, basePath, depth + 1);
      nodes.push({
        name: entry.name,
        relativePath,
        type: "directory",
        children,
      });
    } else {
      const stat = await fsp.stat(fullPath);
      nodes.push({
        name: entry.name,
        relativePath,
        type: "file",
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
      });
    }
  }

  return nodes;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    const decodedName = decodeSkillName(name);
    const skill = await resolveSkillFromRequest(request, name);

    if (!skill) {
      return NextResponse.json(
        { error: `Skill not found: "${decodedName}"` },
        { status: 404 },
      );
    }

    const files = await buildFileTree(skill.path, skill.path);

    return NextResponse.json({
      name: skill.name,
      path: skill.path,
      files,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
