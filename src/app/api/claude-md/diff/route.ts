import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { type NextRequest, NextResponse } from "next/server";
import { resolveClaudeMdPaths } from "@/lib/claude-md-paths";

const execFile = promisify(execFileCb);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const sha = url.searchParams.get("sha");
  const projectPath = url.searchParams.get("project");

  if (!sha || !/^[0-9a-f]{4,40}$/i.test(sha)) {
    return NextResponse.json({ error: "Invalid or missing ?sha= parameter" }, { status: 400 });
  }

  const { gitCwd, relativePath } = resolveClaudeMdPaths(projectPath);

  try {
    const { stdout: showOutput } = await execFile(
      "git",
      ["show", sha, "--format=%H%n%ai%n%an%n%B", "--stat", "--", relativePath],
      { cwd: gitCwd, maxBuffer: 2 * 1024 * 1024 },
    );

    const { stdout: diffOutput } = await execFile(
      "git",
      ["show", sha, "--format=", "-p", "--", relativePath],
      { cwd: gitCwd, maxBuffer: 2 * 1024 * 1024 },
    );

    const showLines = showOutput.split("\n");
    const fullSha = showLines[0] || sha;
    const date = showLines[1] || "";
    const author = showLines[2] || "";
    const messageLines: string[] = [];
    for (let i = 3; i < showLines.length; i++) {
      const line = showLines[i];
      if (line.match(/^\s+\S.*\|/) || line.match(/^\d+ files? changed/)) break;
      messageLines.push(line);
    }
    const message = messageLines.join("\n").trim();

    let additions = 0;
    let deletions = 0;
    for (const line of diffOutput.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    return NextResponse.json({
      sha: fullSha.slice(0, 7),
      fullSha,
      date,
      author,
      message,
      additions,
      deletions,
      diff: diffOutput,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
