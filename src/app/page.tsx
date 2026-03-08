"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { useAutoRefresh } from "@/hooks/use-sse";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorMessage } from "@/components/error-message";
import { HealthReportCard } from "@/components/health-report-card";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/hooks/use-settings";
import { useScope } from "@/contexts/scope-context";
import type { DashboardStats, ProjectInfo } from "@/lib/types";
import { skillDisplayName } from "@/lib/utils";

const PIE_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
];

const BAR_COLOR = "#6366f1";

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatesAvailable, setUpdatesAvailable] = useState<number>(0);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const { status: settingsStatus } = useSettings();
  const { scope } = useScope();

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DashboardStats = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetch("/api/projects")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.projects) setProjects(data.projects); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/upstream/check")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.summary?.updatesAvailable != null) {
          setUpdatesAvailable(data.summary.updatesAvailable);
        }
      })
      .catch(() => {});
  }, []);

  useAutoRefresh(fetchStats);

  if (error && !stats) {
    return (
      <ErrorMessage
        message={`Failed to load stats: ${error}`}
        onRetry={fetchStats}
      />
    );
  }

  if (!stats) {
    return <LoadingSpinner text="Loading dashboard..." />;
  }

  const domainData = Object.entries(stats.domainDistribution).map(
    ([name, value]) => ({ name, value })
  );

  const sourceData = Object.entries(stats.sourceDistribution).map(
    ([name, value]) => ({ name, value })
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          总览
          {scope !== "global" && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              · {scope.startsWith("combined:") ? "复合视角" : "项目视角"}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {scope === "global"
            ? `技能生态全局视图 — ${projects.length} 个项目 · 数量、分布、健康度一目了然`
            : "当前视角下的技能概览"
          }
        </p>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="技能总数"
          value={stats.totalSkills}
          description="已扫描的全部技能"
        />
        <StatCard
          title="路由表引用"
          value={stats.routedSkills}
          description="在 CLAUDE.md 中被引用"
          icon={
            <svg
              className="h-4 w-4 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          title="孤立技能"
          value={stats.orphanSkills}
          description="未被任何路由表引用"
          warning={stats.orphanSkills > stats.totalSkills * 0.5}
        />
        <StatCard
          title="领域分类"
          value={Object.keys(stats.domainDistribution).length}
          description="已标注的功能域数量"
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Domain Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">功能域分布</CardTitle>
            <CardDescription>按功能域统计技能数量</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={domainData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent, x, y, textAnchor }) => {
                      const p = (percent ?? 0) * 100;
                      if (p < 5) return null;
                      return (
                        <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" className="fill-foreground text-[11px]">
                          {`${name} ${p.toFixed(0)}%`}
                        </text>
                      );
                    }}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {domainData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Source Distribution Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">来源分布</CardTitle>
            <CardDescription>按来源统计技能数量</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData} layout="vertical">
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 13 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill={BAR_COLOR}
                    radius={[0, 4, 4, 0]}
                    name="Count"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2.3: Fork Health + Evolution */}
      {stats.forkStats && stats.evolutionStats && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fork 健康度</CardTitle>
              <CardDescription>上游追踪与对账状态</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{stats.forkStats.totalWithUpstream}</p>
                  <p className="text-xs text-muted-foreground">有上游</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-amber-500">{stats.forkStats.modified}</p>
                  <p className="text-xs text-muted-foreground">已修改</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${stats.forkStats.needsReconciliation > 0 ? "text-red-500" : ""}`}>
                    {stats.forkStats.needsReconciliation}
                  </p>
                  <p className="text-xs text-muted-foreground">需对账</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${updatesAvailable > 0 ? "text-blue-500" : ""}`}>
                    {updatesAvailable}
                  </p>
                  <p className="text-xs text-muted-foreground">可更新</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">技能演化</CardTitle>
              <CardDescription>本月活跃度概览</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">本月活跃</span>
                <span className="font-bold tabular-nums">{stats.evolutionStats.activeThisMonth} 个</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">本月新建</span>
                <span className="font-bold tabular-nums">{stats.evolutionStats.newThisMonth} 个</span>
              </div>
              {stats.evolutionStats.mostActive.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">最活跃 Top 5</p>
                    {stats.evolutionStats.mostActive.map((s) => (
                      <div key={s.name} className="flex items-center justify-between text-sm">
                        <span className="max-w-[180px] truncate font-mono text-xs">{skillDisplayName(s.name)}</span>
                        <span className="tabular-nums text-xs text-muted-foreground">{s.commits} commits</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Row 2.5: Project Ecosystem */}
      {scope === "global" && projects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">项目生态</CardTitle>
            <CardDescription>
              {projects.length} 个项目 · {projects.filter(p => p.hasSkills).length} 个有项目级 Skill · {projects.filter(p => p.hasClaudeMd).length} 个有 CLAUDE.md
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.path}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {project.hasClaudeMd && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          CLAUDE.md
                        </span>
                      )}
                      {project.skillCount > 0 && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {project.skillCount} Skill
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 2.6: AI Health Report */}
      <HealthReportCard hasApiKey={settingsStatus?.hasApiKey ?? false} />

      {/* Row 3: Recent Changes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近变动</CardTitle>
          <CardDescription>
            最近修改的 10 个技能
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">技能名称</th>
                  <th className="pb-2 text-right font-medium">最后修改</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentChanges.map((change) => (
                  <tr
                    key={change.name}
                    className="border-b last:border-0"
                  >
                    <td className="py-2.5 font-mono text-sm">
                      {skillDisplayName(change.name)}
                    </td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {formatRelativeTime(change.lastModified)}
                    </td>
                  </tr>
                ))}
                {stats.recentChanges.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="py-4 text-center text-muted-foreground"
                    >
                      暂无技能
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon,
  warning,
}: {
  title: string;
  value: number;
  description: string;
  icon?: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {icon}
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`text-3xl font-bold tabular-nums ${
            warning ? "text-amber-500" : ""
          }`}
        >
          {value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
