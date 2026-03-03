import path from "node:path";
import fsp from "node:fs/promises";
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const registry = await readRegistry();

    const skill =
      registry.skills[decodedName] ??
      Object.values(registry.skills).find((entry) => entry.name === decodedName);

    if (!skill) {
      return NextResponse.json(
        { error: `Skill not found: "${decodedName}"` },
        { status: 404 },
      );
    }

    const skillMdPath = path.join(skill.path, "SKILL.md");
    const content = await fsp.readFile(skillMdPath, "utf-8");

    return NextResponse.json({
      name: skill.name,
      path: skillMdPath,
      content,
      lineCount: content.split("\n").length,
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("ENOENT")) {
      return NextResponse.json(
        { error: "SKILL.md file not found for this skill" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
