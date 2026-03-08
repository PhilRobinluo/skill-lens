import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import type { SkillGitHistory } from "@/lib/types";

const EMPTY_HISTORY: SkillGitHistory = {
  totalCommits: 0, createdAt: "", lastCommitAt: "",
  hasUncommittedChanges: false, contributors: [], timeline: [],
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  try {
    const registry = await readRegistry();
    const skill = registry.skills[decodedName];
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    return NextResponse.json(skill.gitHistory ?? EMPTY_HISTORY);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
