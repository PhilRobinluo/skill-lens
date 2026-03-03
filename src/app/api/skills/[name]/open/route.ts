import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  const { name } = await params;
  const registry = await readRegistry();
  const skill = registry.skills[name];

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // Open the skill directory in Finder (macOS) — using execFile to avoid shell injection
  execFile("open", ["-R", skill.path]);

  return NextResponse.json({ ok: true });
}
