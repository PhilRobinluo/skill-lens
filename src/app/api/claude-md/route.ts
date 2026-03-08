import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/claude-md?project=<path>
 * - No project param → global ~/.claude/CLAUDE.md
 * - project=<path> → <path>/CLAUDE.md
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const projectPath = url.searchParams.get("project");

    const claudeMdPath = projectPath
      ? path.join(projectPath, "CLAUDE.md")
      : path.join(os.homedir(), ".claude", "CLAUDE.md");

    const content = await fsp.readFile(claudeMdPath, "utf-8");

    return NextResponse.json({
      path: claudeMdPath,
      content,
      lineCount: content.split("\n").length,
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("ENOENT")) {
      return NextResponse.json({ error: "CLAUDE.md not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
