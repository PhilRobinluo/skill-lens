import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";

function tryOpenInEditor(filePath: string): void {
  // Try cursor first, then VS Code, then default open
  execFile("cursor", [filePath], (err) => {
    if (err) {
      execFile("code", [filePath], (err2) => {
        if (err2) {
          execFile("open", [filePath]);
        }
      });
    }
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const registry = await readRegistry();

  const skill =
    registry.skills[decodedName] ??
    Object.values(registry.skills).find((entry) => entry.name === decodedName);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // Parse optional file from request body
  let fileParam: string | null = null;
  try {
    const body = await request.json();
    fileParam = body.file ?? null;
  } catch {
    // No body or invalid JSON — that's fine, use default behavior
  }

  if (fileParam) {
    // Open specific file in editor
    const filePath = path.resolve(skill.path, fileParam);

    // Security: prevent path traversal
    const skillDir = skill.path.endsWith(path.sep) ? skill.path : skill.path + path.sep;
    if (!filePath.startsWith(skillDir) && filePath !== skill.path) {
      return NextResponse.json(
        { error: "Access denied: path outside skill directory" },
        { status: 403 },
      );
    }

    tryOpenInEditor(filePath);
    return NextResponse.json({ ok: true, method: "editor" });
  }

  // Default: open directory in Finder
  execFile("open", ["-R", skill.path]);
  return NextResponse.json({ ok: true, method: "finder" });
}
