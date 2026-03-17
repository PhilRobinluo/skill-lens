import { type NextRequest, NextResponse } from "next/server";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import fsp from "node:fs/promises";
import { CLAUDE_MD_PATH } from "@/lib/config";
import path from "node:path";

const execFile = promisify(execFileCb);

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { sha: string };
    if (!body.sha) {
      return NextResponse.json({ error: "SHA is required" }, { status: 400 });
    }

    // Get the CLAUDE.md content at that commit
    const claudeMdDir = path.dirname(CLAUDE_MD_PATH);
    const relativePath = path.basename(CLAUDE_MD_PATH);

    const { stdout: content } = await execFile(
      "git",
      ["show", `${body.sha}:${relativePath}`],
      { cwd: claudeMdDir, encoding: "utf-8" },
    );

    // Write it to current CLAUDE.md
    await fsp.writeFile(CLAUDE_MD_PATH, content, "utf-8");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
