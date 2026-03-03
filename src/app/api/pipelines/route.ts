import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry, upsertPipeline } from "@/lib/registry";
import type { Pipeline } from "@/lib/types";

export async function GET(): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const registry = await readRegistry();
    return NextResponse.json({
      pipelines: registry.pipelines,
      total: Object.keys(registry.pipelines).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}

interface CreatePipelineBody {
  id: string;
  description: string;
  steps: Array<{ skill: string; role: string }>;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const body = (await request.json()) as CreatePipelineBody;

    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json(
        { error: "id is required and must be a string" },
        { status: 400 },
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

    const registry = await upsertPipeline(body.id, pipeline);
    return NextResponse.json(
      { id: body.id, ...registry.pipelines[body.id] },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
