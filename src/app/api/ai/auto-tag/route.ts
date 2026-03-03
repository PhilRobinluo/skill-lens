import { NextResponse } from "next/server";
import { readRegistry } from "@/lib/registry";
import { readSettings } from "@/lib/settings";
import { chatCompletion, parseAIJson } from "@/lib/ai-client";
import { AUTO_TAG_SYSTEM } from "@/lib/ai-prompts";
import type { AutoTagResponse } from "@/lib/types";

export async function POST(request: Request) {
  const settings = await readSettings();
  if (!settings.openRouterApiKey) {
    return NextResponse.json({ error: "API Key 未配置" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedNames: string[] | undefined = body.skillNames;

  const registry = await readRegistry();
  const allSkills = Object.values(registry.skills);

  // Collect existing tag pool
  const tagPool = new Set<string>();
  for (const s of allSkills) {
    for (const d of s.tags.domain) {
      if (d && d !== "未分类") tagPool.add(d);
    }
  }

  // Filter to untagged skills (or requested skills)
  let targetSkills = allSkills.filter((s) => {
    const d = s.tags.domain;
    return d.length === 0 || (d.length === 1 && d[0] === "未分类");
  });

  if (requestedNames && requestedNames.length > 0) {
    targetSkills = allSkills.filter((s) => requestedNames.includes(s.name));
  }

  if (targetSkills.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const userMessage = JSON.stringify({
    existingTags: Array.from(tagPool),
    skills: targetSkills.map((s) => ({
      name: s.name,
      source: s.source,
      description: s.description.slice(0, 150),
    })),
  }, null, 2);

  try {
    const raw = await chatCompletion(AUTO_TAG_SYSTEM, userMessage);
    const parsed = parseAIJson<AutoTagResponse>(raw);
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI 调用失败" },
      { status: 500 },
    );
  }
}
