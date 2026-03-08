import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  try {
    const claudeMdPath = path.join(os.homedir(), ".claude", "CLAUDE.md");
    const content = await fsp.readFile(claudeMdPath, "utf-8");

    return NextResponse.json({
      path: claudeMdPath,
      content,
      lineCount: content.split("\n").length,
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("ENOENT")) {
      return NextResponse.json({ error: "CLAUDE.md not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
