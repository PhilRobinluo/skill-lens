import fsp from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import { resolveRuleFilePaths } from "@/lib/claude-md-paths";

/**
 * GET /api/claude-md?runtime=codex|claude&project=<path>
 * - No project param → global runtime rule file
 * - project=<path> → project runtime rule file
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const projectPath = url.searchParams.get("project");
    const runtime = url.searchParams.get("runtime");
    const { absolutePath, fileName } = resolveRuleFilePaths(projectPath, runtime);

    const content = await fsp.readFile(absolutePath, "utf-8");

    return NextResponse.json({
      path: absolutePath,
      fileName,
      content,
      lineCount: content.split("\n").length,
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("ENOENT")) {
      return NextResponse.json({ error: "Rule file not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
