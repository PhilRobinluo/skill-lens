import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { readRegistry } from "@/lib/registry";
import { chatCompletion } from "@/lib/ai-client";
import { ROUTE_ANALYSIS_SYSTEM } from "@/lib/ai-prompts";
import { CLAUDE_MD_PATH } from "@/lib/config";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export async function POST(request: Request) {
  const settings = await readSettings();
  if (!settings.openRouterApiKey) {
    return NextResponse.json({ error: "API Key 未配置" }, { status: 400 });
  }

  const { routeTables } = await request.json();

  // Enrich with skill info from registry
  const registry = await readRegistry();
  const skills = Object.values(registry.skills);
  const skillSummaries = skills.map((s) => ({
    name: s.name,
    source: s.source,
    description: s.description.slice(0, 120),
    domains: s.tags.domain,
    isRouted: s.claudeMdRefs.length > 0,
  }));

  // When routeTables is empty, include raw CLAUDE.md for AI to analyze directly
  let claudeMdRaw: string | undefined;
  if ((!routeTables || routeTables.length === 0) && existsSync(CLAUDE_MD_PATH)) {
    const raw = await readFile(CLAUDE_MD_PATH, "utf-8");
    // Truncate to avoid token overflow — keep first 8000 chars
    claudeMdRaw = raw.slice(0, 8000);
  }

  try {
    const report = await chatCompletion(
      ROUTE_ANALYSIS_SYSTEM,
      JSON.stringify({ routeTables, skills: skillSummaries, ...(claudeMdRaw ? { claudeMdRaw } : {}) }, null, 2),
    );
    return NextResponse.json({
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI 调用失败" },
      { status: 500 },
    );
  }
}
