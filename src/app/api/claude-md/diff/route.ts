import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

const execFile = promisify(execFileCb);

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const sha = url.searchParams.get("sha");

  if (!sha || !/^[0-9a-f]{4,40}$/i.test(sha)) {
    return NextResponse.json({ error: "Invalid or missing ?sha= parameter" }, { status: 400 });
  }

  const claudeDir = path.join(os.homedir(), ".claude");

  try {
    // Get the commit details + diff for CLAUDE.md
    const { stdout: showOutput } = await execFile(
      "git",
      ["show", sha, "--format=%H%n%ai%n%an%n%B", "--stat", "--", "CLAUDE.md"],
      { cwd: claudeDir, maxBuffer: 2 * 1024 * 1024 },
    );

    // Get the actual diff
    const { stdout: diffOutput } = await execFile(
      "git",
      ["show", sha, "--format=", "--no-stat", "-p", "--", "CLAUDE.md"],
      { cwd: claudeDir, maxBuffer: 2 * 1024 * 1024 },
    );

    // Parse the show output
    const showLines = showOutput.split("\n");
    const fullSha = showLines[0] || sha;
    const date = showLines[1] || "";
    const author = showLines[2] || "";
    // Message is everything from line 3 until we hit diff stats
    const messageLines: string[] = [];
    for (let i = 3; i < showLines.length; i++) {
      const line = showLines[i];
      // Stop at stat line (e.g. " CLAUDE.md | 42 ++--")
      if (line.match(/^\s+\S.*\|/) || line.match(/^\d+ files? changed/)) break;
      messageLines.push(line);
    }
    const message = messageLines.join("\n").trim();

    // Parse diff into added/removed line counts
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
