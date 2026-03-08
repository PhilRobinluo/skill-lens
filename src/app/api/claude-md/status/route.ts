import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

const execFile = promisify(execFileCb);

export async function GET(): Promise<NextResponse> {
  const claudeDir = path.join(os.homedir(), ".claude");

  try {
    // Check if CLAUDE.md has uncommitted changes (staged or unstaged)
    const { stdout: statusOutput } = await execFile(
      "git",
      ["status", "--porcelain", "--", "CLAUDE.md"],
      { cwd: claudeDir },
    );

    const hasChanges = statusOutput.trim().length > 0;
    let diffStat = "";
    let diffPreview = "";
    let diff = "";

    if (hasChanges) {
      // Get short diff stats
      try {
        const { stdout } = await execFile(
          "git",
          ["diff", "--shortstat", "--", "CLAUDE.md"],
          { cwd: claudeDir },
        );
        diffPreview = stdout.trim();
      } catch { /* ignore */ }

      // Get diff stat summary
      try {
        const { stdout } = await execFile(
          "git",
          ["diff", "--stat", "--", "CLAUDE.md"],
          { cwd: claudeDir },
        );
        diffStat = stdout.trim();
      } catch { /* ignore */ }

      // Get actual diff content for viewing
      try {
        const { stdout } = await execFile(
          "git",
          ["diff", "--", "CLAUDE.md"],
          { cwd: claudeDir, maxBuffer: 2 * 1024 * 1024 },
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
