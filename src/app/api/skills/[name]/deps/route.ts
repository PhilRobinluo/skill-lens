import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { updateSkillDeps } from "@/lib/registry";

interface DepsBody {
  dependencies: string[];
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const body = (await request.json()) as DepsBody;

    if (!Array.isArray(body.dependencies)) {
      return NextResponse.json(
        { error: "dependencies must be an array of strings" },
        { status: 400 },
      );
    }

    const registry = await updateSkillDeps(decodedName, body.dependencies);
    return NextResponse.json(registry.skills[decodedName]);
  } catch (err) {
    const message = String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
