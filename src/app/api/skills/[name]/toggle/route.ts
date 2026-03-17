import fsp from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry, writeRegistry } from "@/lib/registry";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const body = (await request.json()) as { enabled: boolean };

    const registry = await readRegistry();
    const skill = registry.skills[decodedName];

    if (!skill) {
      return NextResponse.json(
        { error: `Skill not found: "${decodedName}"` },
        { status: 404 },
      );
    }

    const skillMdPath = path.join(skill.path, "SKILL.md");
    const skillMdDisabledPath = path.join(skill.path, "SKILL.md.disabled");

    if (body.enabled) {
      await fsp.rename(skillMdDisabledPath, skillMdPath);
    } else {
      await fsp.rename(skillMdPath, skillMdDisabledPath);
    }

    registry.skills[decodedName].enabled = body.enabled;
    await writeRegistry(registry);

    return NextResponse.json({ success: true, enabled: body.enabled });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
