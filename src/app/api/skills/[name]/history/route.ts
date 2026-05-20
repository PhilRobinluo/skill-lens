import { NextResponse } from "next/server";
import {
  EMPTY_SKILL_HISTORY,
  decodeSkillName,
  getHistoryForSkillPath,
  resolveSkillFromRequest,
} from "@/lib/skill-resolver";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params;
  const decodedName = decodeSkillName(name);
  try {
    const skill = await resolveSkillFromRequest(request, name);
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    const history = skill.gitHistory ?? await getHistoryForSkillPath(skill.path);
    return NextResponse.json(history ?? EMPTY_SKILL_HISTORY);
  } catch (err) {
    return NextResponse.json(
      { error: String(err), name: decodedName },
      { status: 500 },
    );
  }
}
