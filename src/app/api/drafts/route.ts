import { NextResponse } from "next/server";
import { readDrafts, upsertDraft, deleteDraft, type DraftSave } from "@/lib/drafts";

// GET /api/drafts — list all drafts
export async function GET() {
  const drafts = await readDrafts();
  return NextResponse.json({ drafts });
}

// POST /api/drafts — save/update a draft (upsert by name)
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DraftSave;

    if (!body.name || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return NextResponse.json({ error: "Invalid draft: name, nodes, edges required" }, { status: 400 });
    }

    const draft: DraftSave = {
      name: body.name,
      nodes: body.nodes,
      edges: body.edges,
      savedAt: body.savedAt || new Date().toISOString(),
    };

    const drafts = await upsertDraft(draft);
    return NextResponse.json({ drafts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/drafts — delete a draft by name (passed as query param or body)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let name = searchParams.get("name");

    if (!name) {
      const body = (await request.json().catch(() => ({}))) as { name?: string };
      name = body.name ?? null;
    }

    if (!name) {
      return NextResponse.json({ error: "Missing draft name" }, { status: 400 });
    }

    const drafts = await deleteDraft(name);
    return NextResponse.json({ drafts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
