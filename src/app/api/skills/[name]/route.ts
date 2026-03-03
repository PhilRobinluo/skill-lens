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
    const skill = registry.skills[decodedName];

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
