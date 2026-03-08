import path from "node:path";
import fsp from "node:fs/promises";
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";

export async function GET(
  request: Request,
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

    // Parse ?file= query parameter, default to SKILL.md
    const url = new URL(request.url);
    const fileParam = url.searchParams.get("file") || "SKILL.md";

    // Resolve and validate path — prevent directory traversal
    const filePath = path.resolve(skill.path, fileParam);
    const skillDir = skill.path.endsWith(path.sep) ? skill.path : skill.path + path.sep;
    if (!filePath.startsWith(skillDir) && filePath !== skill.path) {
      return NextResponse.json(
        { error: "Access denied: path outside skill directory" },
        { status: 403 },
      );
    }

    const TEXT_EXTENSIONS = new Set([
      '.md', '.txt', '.json', '.yaml', '.yml', '.ts', '.js', '.tsx', '.jsx',
      '.css', '.html', '.xml', '.csv', '.toml', '.ini', '.cfg', '.conf',
      '.sh', '.bash', '.zsh', '.py', '.rb', '.go', '.rs', '.java',
    ]);

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && ext !== '') {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}` },
        { status: 415 },
      );
    }

    // Check file size (max 512KB)
    const stat = await fsp.stat(filePath);
    if (stat.size > 512 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 512KB)" },
        { status: 413 },
      );
    }

    const content = await fsp.readFile(filePath, "utf-8");

    return NextResponse.json({
      name: skill.name,
      path: filePath,
      content,
      lineCount: content.split("\n").length,
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("ENOENT")) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
