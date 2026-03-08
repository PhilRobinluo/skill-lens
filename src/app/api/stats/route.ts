import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import { filterByScope } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  "self-built": "自建",
  baoyu: "宝玉系列",
  "plugin-official": "官方插件",
  "plugin-community": "社区插件",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const registry = await readRegistry();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const skills = filterByScope(Object.values(registry.skills), scope);

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
        domainDistribution["未分类"] =
          (domainDistribution["未分类"] || 0) + 1;
      }
    }

    // Source distribution (with Chinese labels)
    const sourceDistribution: Record<string, number> = {};
    for (const skill of skills) {
      const label = SOURCE_LABELS[skill.source] ?? skill.source;
      sourceDistribution[label] =
        (sourceDistribution[label] || 0) + 1;
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

    // Fork stats
    const skillsWithUpstream = skills.filter((s) => s.upstream);
    const modifiedForks = skillsWithUpstream.filter(
      (s) => s.upstream?.status === "modified",
    );
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const needsReconciliation = skillsWithUpstream.filter((s) => {
      if (!s.upstream?.lastReconciled) return true;
      return new Date(s.upstream.lastReconciled).getTime() < thirtyDaysAgo;
    });

    // Evolution stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const activeThisMonth = skills.filter(
      (s) => s.gitHistory && new Date(s.gitHistory.lastCommitAt) >= monthStart,
    );
    const newThisMonth = skills.filter(
      (s) => s.gitHistory && new Date(s.gitHistory.createdAt) >= monthStart,
    );
    const mostActive = skills
      .filter((s) => s.gitHistory && s.gitHistory.totalCommits > 1)
      .sort((a, b) => (b.gitHistory?.totalCommits ?? 0) - (a.gitHistory?.totalCommits ?? 0))
      .slice(0, 5)
      .map((s) => ({ name: s.name, commits: s.gitHistory!.totalCommits }));

    const stats: DashboardStats = {
      totalSkills: skills.length,
      routedSkills,
      orphanSkills: skills.length - routedSkills,
      domainDistribution,
      sourceDistribution,
      recentChanges,
      forkStats: {
        totalWithUpstream: skillsWithUpstream.length,
        modified: modifiedForks.length,
        needsReconciliation: needsReconciliation.length,
      },
      evolutionStats: {
        activeThisMonth: activeThisMonth.length,
        newThisMonth: newThisMonth.length,
        mostActive,
      },
    };

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
