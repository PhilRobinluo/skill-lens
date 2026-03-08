import path from "node:path";
import fsp from "node:fs/promises";
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";

interface FileNode {
  name: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  lastModified?: string;
  children?: FileNode[];
}

async function buildFileTree(dirPath: string, basePath: string): Promise<FileNode[]> {
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
      const children = await buildFileTree(fullPath, basePath);
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
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const registry = await readRegistry();

    const skill =
      registry.skills[decodedName] ??
      Object.values(registry.skills).find((entry) => entry.name === decodedName);

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
