import { type NextRequest, NextResponse } from "next/server";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import fsp from "node:fs/promises";
import { resolveRuleFilePaths } from "@/lib/claude-md-paths";

const execFile = promisify(execFileCb);

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { sha: string; runtime?: string; project?: string | null };
    if (!body.sha) {
      return NextResponse.json({ error: "SHA is required" }, { status: 400 });
    }

    const { gitCwd, relativePath, absolutePath } = resolveRuleFilePaths(
      body.project ?? null,
      body.runtime,
    );

    const { stdout: content } = await execFile(
      "git",
      ["show", `${body.sha}:${relativePath}`],
      { cwd: gitCwd, encoding: "utf-8" },
    );

    await fsp.writeFile(absolutePath, content, "utf-8");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
