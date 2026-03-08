import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

const execFile = promisify(execFileCb);

/**
 * GET /api/claude-md/version?sha=<commit-sha>
 * Returns the CLAUDE.md content at a specific historical version.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const sha = url.searchParams.get("sha");

  if (!sha || !/^[0-9a-f]{4,40}$/i.test(sha)) {
    return NextResponse.json({ error: "Invalid or missing ?sha= parameter" }, { status: 400 });
  }

  const claudeDir = path.join(os.homedir(), ".claude");

  try {
    const { stdout } = await execFile(
      "git",
      ["show", `${sha}:CLAUDE.md`],
      { cwd: claudeDir, maxBuffer: 2 * 1024 * 1024 },
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
