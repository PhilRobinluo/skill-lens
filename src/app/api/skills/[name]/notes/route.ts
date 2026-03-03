import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { updateSkillNotes } from "@/lib/registry";

interface NotesBody {
  notes: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const body = (await request.json()) as NotesBody;

    if (typeof body.notes !== "string") {
      return NextResponse.json(
        { error: "notes must be a string" },
        { status: 400 },
      );
    }

    const registry = await updateSkillNotes(decodedName, body.notes);
    return NextResponse.json(registry.skills[decodedName]);
  } catch (err) {
    const message = String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
