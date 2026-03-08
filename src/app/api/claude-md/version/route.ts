import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { type NextRequest, NextResponse } from "next/server";
import { resolveClaudeMdPaths } from "@/lib/claude-md-paths";

const execFile = promisify(execFileCb);

/**
 * GET /api/claude-md/version?sha=<commit-sha>&project=<path>
 * Returns the CLAUDE.md content at a specific historical version.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const sha = url.searchParams.get("sha");
  const projectPath = url.searchParams.get("project");

  if (!sha || !/^[0-9a-f]{4,40}$/i.test(sha)) {
    return NextResponse.json({ error: "Invalid or missing ?sha= parameter" }, { status: 400 });
  }

  const { gitCwd, relativePath } = resolveClaudeMdPaths(projectPath);

  try {
    const { stdout } = await execFile(
      "git",
      ["show", `${sha}:${relativePath}`],
      { cwd: gitCwd, maxBuffer: 2 * 1024 * 1024 },
    );

    return NextResponse.json({
      sha,
      content: stdout,
      lineCount: stdout.split("\n").length,
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("does not exist") || msg.includes("bad revision")) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
