import { NextResponse } from "next/server";
import { readRegistry } from "@/lib/registry";
import { readSettings } from "@/lib/settings";
import { chatCompletion, parseAIJson } from "@/lib/ai-client";
import { GENERATE_FLOW_SYSTEM } from "@/lib/ai-prompts";
import type { FlowGenerationResponse } from "@/lib/types";

export async function POST(request: Request) {
  const settings = await readSettings();
  if (!settings.openRouterApiKey) {
    return NextResponse.json({ error: "API Key 未配置" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const scenario: string = body.scenario;
  if (!scenario) {
    return NextResponse.json({ error: "请输入场景描述" }, { status: 400 });
  }

  const registry = await readRegistry();
  const allSkills = Object.values(registry.skills);

  const userMessage = JSON.stringify({
    scenario,
    availableSkills: allSkills.map((s) => ({
      name: s.name,
      description: s.description.slice(0, 100),
      domain: s.tags.domain,
    })),
  }, null, 2);

  try {
    const raw = await chatCompletion(GENERATE_FLOW_SYSTEM, userMessage);
    const parsed = parseAIJson<FlowGenerationResponse>(raw);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI 调用失败" },
      { status: 500 },
    );
  }
}
