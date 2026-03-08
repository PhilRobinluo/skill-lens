import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

const execFile = promisify(execFileCb);

export async function GET(): Promise<NextResponse> {
  const claudeDir = path.join(os.homedir(), ".claude");

  try {
    const { stdout } = await execFile(
      "git",
      ["log", "--format=%h|||%ai|||%an|||%s", "--no-merges", "-50", "--", "CLAUDE.md"],
      { cwd: claudeDir },
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
