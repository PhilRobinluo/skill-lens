import { NextResponse } from "next/server";
import { decodeSkillName, resolveSkillFromRequest } from "@/lib/skill-resolver";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    const decodedName = decodeSkillName(name);
    const skill = await resolveSkillFromRequest(request, name);

    if (!skill) {
      return NextResponse.json(
        { error: `Skill not found: "${decodedName}"` },
        { status: 404 },
      );
    }

    return NextResponse.json(skill);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
