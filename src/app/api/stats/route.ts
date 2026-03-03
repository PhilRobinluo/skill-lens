import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import type { DashboardStats } from "@/lib/types";

export async function GET(): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const registry = await readRegistry();
    const skills = Object.values(registry.skills);

    // Count routed skills (those with at least one CLAUDE.md ref)
    const routedSkills = skills.filter(
      (s) => s.claudeMdRefs.length > 0,
    ).length;

    // Domain distribution
    const domainDistribution: Record<string, number> = {};
    for (const skill of skills) {
      for (const domain of skill.tags.domain) {
        domainDistribution[domain] = (domainDistribution[domain] || 0) + 1;
      }
      // Count skills with no domain tags
      if (skill.tags.domain.length === 0) {
        domainDistribution["untagged"] =
          (domainDistribution["untagged"] || 0) + 1;
      }
    }

    // Source distribution
    const sourceDistribution: Record<string, number> = {};
    for (const skill of skills) {
      sourceDistribution[skill.source] =
        (sourceDistribution[skill.source] || 0) + 1;
    }

    // Recent changes: top 10 by lastModified
    const recentChanges = [...skills]
      .sort(
        (a, b) =>
          new Date(b.lastModified).getTime() -
          new Date(a.lastModified).getTime(),
      )
      .slice(0, 10)
      .map((s) => ({ name: s.name, lastModified: s.lastModified }));

    const stats: DashboardStats = {
      totalSkills: skills.length,
      routedSkills,
      orphanSkills: skills.length - routedSkills,
      totalPipelines: Object.keys(registry.pipelines).length,
      domainDistribution,
      sourceDistribution,
      recentChanges,
    };

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
