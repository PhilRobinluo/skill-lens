import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { updateSkillTags } from "@/lib/registry";
import type { Frequency } from "@/lib/types";

interface TagsBody {
  domain?: string[];
  frequency?: Frequency;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const body = (await request.json()) as TagsBody;

    const tags: Record<string, unknown> = {};
    if (body.domain !== undefined) tags.domain = body.domain;
    if (body.frequency !== undefined) tags.frequency = body.frequency;

    const registry = await updateSkillTags(decodedName, tags);
    return NextResponse.json(registry.skills[decodedName]);
  } catch (err) {
    const message = String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
