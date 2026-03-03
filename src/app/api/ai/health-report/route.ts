import { NextResponse } from "next/server";
import { readRegistry } from "@/lib/registry";
import { readSettings } from "@/lib/settings";
import { chatCompletion } from "@/lib/ai-client";
import { HEALTH_REPORT_SYSTEM } from "@/lib/ai-prompts";

export async function POST() {
  // 1. Check API key
  const settings = await readSettings();
  if (!settings.openRouterApiKey) {
    return NextResponse.json({ error: "API Key 未配置" }, { status: 400 });
  }

  // 2. Read registry, build skill summary
  const registry = await readRegistry();
  const skills = Object.values(registry.skills);

  const summaries = skills.map((s) => ({
    name: s.name,
    source: s.source,
    description: s.description.slice(0, 80),
    lineCount: s.lineCount,
    isRouted: s.claudeMdRefs.length > 0,
    domains: s.tags.domain,
    hasDescription: !!s.description,
  }));

  // 3. Call AI
  try {
    const report = await chatCompletion(
      HEALTH_REPORT_SYSTEM,
      JSON.stringify(summaries, null, 2),
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
