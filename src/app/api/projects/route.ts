import { NextResponse } from "next/server";

import { discoverCodexProjects } from "@/lib/codex-scanner";
import { discoverProjects } from "@/lib/project-discovery";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const runtime = new URL(request.url).searchParams.get("runtime");
    const projects = runtime === "codex"
      ? await discoverCodexProjects()
      : await discoverProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
