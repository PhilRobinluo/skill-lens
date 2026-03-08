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
    const { stdout } = await execFile(
      "git",
      ["log", "--format=%h|||%ai|||%an|||%s", "--no-merges", "-50", "--", relativePath],
      { cwd: gitCwd },
    );

    const commits = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, date, author, message] = line.split("|||");
        return { sha, date, author, message };
      });

    return NextResponse.json({
      totalCommits: commits.length,
      commits,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
