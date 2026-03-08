import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { type NextRequest, NextResponse } from "next/server";
import { resolveClaudeMdPaths } from "@/lib/claude-md-paths";

const execFile = promisify(execFileCb);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const projectPath = url.searchParams.get("project");
  const { gitCwd, relativePath } = resolveClaudeMdPaths(projectPath);

  try {
    const { stdout: statusOutput } = await execFile(
      "git",
      ["status", "--porcelain", "--", relativePath],
      { cwd: gitCwd },
    );

    const hasChanges = statusOutput.trim().length > 0;
    let diffStat = "";
    let diffPreview = "";
    let diff = "";

    if (hasChanges) {
      try {
        const { stdout } = await execFile(
          "git",
          ["diff", "--shortstat", "--", relativePath],
          { cwd: gitCwd },
        );
        diffPreview = stdout.trim();
      } catch { /* ignore */ }

      try {
        const { stdout } = await execFile(
          "git",
          ["diff", "--stat", "--", relativePath],
          { cwd: gitCwd },
        );
        diffStat = stdout.trim();
      } catch { /* ignore */ }

      try {
        const { stdout } = await execFile(
          "git",
          ["diff", "--", relativePath],
          { cwd: gitCwd, maxBuffer: 2 * 1024 * 1024 },
        );
        diff = stdout;
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      hasUncommittedChanges: hasChanges,
      diffStat,
      diffPreview,
      diff,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
