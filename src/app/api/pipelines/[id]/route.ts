import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry, upsertPipeline, deletePipeline } from "@/lib/registry";
import type { Pipeline } from "@/lib/types";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const body = (await request.json()) as {
      description: string;
      steps: Array<{ skill: string; role: string }>;
    };

    // Verify pipeline exists
    const existing = await readRegistry();
    if (!existing.pipelines[decodedId]) {
      return NextResponse.json(
        { error: `Pipeline not found: "${decodedId}"` },
        { status: 404 },
      );
    }

    if (!body.description || typeof body.description !== "string") {
      return NextResponse.json(
        { error: "description is required and must be a string" },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json(
        { error: "steps must be a non-empty array" },
        { status: 400 },
      );
    }

    const pipeline: Pipeline = {
      description: body.description,
      steps: body.steps,
    };

    const registry = await upsertPipeline(decodedId, pipeline);
    return NextResponse.json({ id: decodedId, ...registry.pipelines[decodedId] });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);

    await deletePipeline(decodedId);
    return NextResponse.json({ success: true, deleted: decodedId });
  } catch (err) {
    const message = String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
