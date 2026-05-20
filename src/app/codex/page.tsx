"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  FolderSearch,
  GitBranch,
  Package,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorMessage } from "@/components/error-message";
import type { CodexFinding, CodexScanReport, CodexSkillEntry } from "@/lib/codex-scanner";

const SOURCE_STYLES: Record<string, string> = {
  user: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  system: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  plugin: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  "agent-shared": "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300",
  project: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
};

const FINDING_STYLES: Record<CodexFinding["severity"], { className: string; icon: React.ReactNode }> = {
  info: {
    className: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-950 dark:bg-blue-950/30 dark:text-blue-200",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  warning: {
    className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-200",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  risk: {
    className: "border-red-200 bg-red-50 text-red-900 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200",
    icon: <Shield className="h-4 w-4" />,
  },
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(skill: CodexSkillEntry): string {
  if (skill.source === "user") return "自建";
  if (skill.source === "system") return "系统";
  if (skill.source === "plugin") return skill.pluginName ? `插件 ${skill.pluginName}` : "插件";
  if (skill.source === "agent-shared") return "共享";
  return "项目";
}

interface CodexLensProps {
  title?: string;
  subtitle?: string;
  variant?: "dashboard" | "rules";
}

export function CodexLens({
  title = "Codex",
  subtitle = "单独盘点 Codex skill 事实源、插件缓存、系统 skill 和治理风险",
  variant = "dashboard",
}: CodexLensProps) {
  const [report, setReport] = useState<CodexScanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchReport = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/codex", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as CodexScanReport;
      setReport(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const filteredSkills = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    if (!q) return report.skills.slice(0, 60);
    return report.skills
      .filter((skill) =>
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.path.toLowerCase().includes(q) ||
        skill.sourceLabel.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [query, report]);

  if (loading && !report) {
    return <LoadingSpinner text="正在扫描 Codex skills..." />;
  }

  if (error && !report) {
    return <ErrorMessage message={`Codex 扫描失败：${error}`} onRetry={fetchReport} />;
  }

  if (!report) return null;

  if (variant === "rules") {
    return (
      <div className="w-full space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Button onClick={fetchReport} disabled={refreshing} variant="outline">
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            重新扫描
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-h-[calc(100vh-220px)]">
            <CardHeader>
              <CardTitle className="text-base">AGENTS.md 原文</CardTitle>
              <CardDescription>{report.agentsPath}</CardDescription>
            </CardHeader>
            <CardContent>
              {report.agentsContent.trim() ? (
                <div className="prose prose-sm max-h-[calc(100vh-330px)] max-w-none overflow-y-auto dark:prose-invert">
                  <ReactMarkdown>{report.agentsContent}</ReactMarkdown>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  没有读取到全局 AGENTS.md 内容。
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <VersionManagementCard report={report} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <Button onClick={fetchReport} disabled={refreshing} variant="outline">
          <RefreshCw className={refreshing ? "animate-spin" : ""} />
          重新扫描
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<Sparkles />} label="Codex skills" value={report.totals.skills} detail={`${report.totals.enabled} 启用 · ${report.totals.disabled} 禁用`} />
        <MetricCard icon={<Package />} label="插件 skills" value={report.totals.plugins} detail="来自 ~/.codex/plugins/cache" />
        <MetricCard icon={<AlertTriangle />} label="待治理" value={report.totals.weakDescriptions + report.totals.longSkills} detail={`${report.totals.weakDescriptions} 触发弱 · ${report.totals.longSkills} 过长`} />
        <MetricCard icon={<FolderSearch />} label="同名冲突" value={report.totals.duplicateNames} detail="跨来源同名 skill" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">事实源</CardTitle>
            <CardDescription>这页直接读取 Codex 真实目录，不依赖旧 Claude 注册表</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.sources.map((source) => (
                <div key={source.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[160px_1fr_80px] sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${source.exists ? "bg-emerald-500" : "bg-muted"}`} />
                    <span className="text-sm font-medium">{source.label}</span>
                  </div>
                  <code className="truncate text-xs text-muted-foreground">{source.path}</code>
                  <div className="text-sm font-semibold sm:text-right">{source.count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Codex 入口</CardTitle>
            <CardDescription>全局规则和配置文件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <PathRow label="Codex Home" value={report.codexHome} />
            <PathRow label="AGENTS.md" value={report.agentsPath} />
            <PathRow label="config.toml" value={report.configPath} />
            <p className="pt-2 text-xs text-muted-foreground">
              最近扫描：{formatTime(report.scannedAt)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">治理提示</CardTitle>
          <CardDescription>先暴露问题，后续再接自动修复、迁移和批量操作</CardDescription>
        </CardHeader>
        <CardContent>
          <FindingList findings={report.findings} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Codex skill 列表</CardTitle>
                <CardDescription>默认显示最近修改的 60 个，可搜索名称、路径、描述和来源</CardDescription>
              </div>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Codex skill"
                className="sm:w-72"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">名称</th>
                    <th className="hidden px-3 py-2 text-left font-medium md:table-cell">来源</th>
                    <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">描述</th>
                    <th className="px-3 py-2 text-right font-medium">行数</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">修改</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSkills.map((skill) => (
                    <tr key={`${skill.source}:${skill.path}`} className="border-t">
                      <td className="max-w-[220px] px-3 py-2">
                        <div className="truncate font-medium">{skill.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{skill.path}</div>
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        <Badge className={SOURCE_STYLES[skill.source]}>{sourceLabel(skill)}</Badge>
                      </td>
                      <td className="hidden max-w-[360px] px-3 py-2 lg:table-cell">
                        <div className="line-clamp-2 text-xs text-muted-foreground">{skill.description || "无描述"}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{skill.lineCount}</td>
                      <td className="hidden px-3 py-2 text-right text-xs text-muted-foreground sm:table-cell">
                        {formatTime(skill.lastModified)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近变化</CardTitle>
            <CardDescription>按 SKILL.md 修改时间排序</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.recent.map((skill) => (
                <div key={`${skill.source}:${skill.path}`} className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{skill.name}</div>
                    <div className="flex items-center gap-2 pt-1">
                      <Badge className={SOURCE_STYLES[skill.source]}>{sourceLabel(skill)}</Badge>
                      <span className="text-xs text-muted-foreground">{formatTime(skill.lastModified)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CodexPage() {
  return <CodexLens />;
}

function VersionManagementCard({ report }: { report: CodexScanReport }) {
  const [copied, setCopied] = useState(false);
  const version = report.agentsVersion;
  const lineCount = report.agentsContent ? report.agentsContent.split("\n").length : 0;
  const safeInitCommand = `cd "$HOME/.codex"
git init
cat > .gitignore <<'EOF'
*
!.gitignore
!AGENTS.md
EOF
git add .gitignore AGENTS.md
git commit -m "track codex AGENTS.md"`;

  async function copySetupCommand() {
    await navigator.clipboard.writeText(safeInitCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">版本管理</CardTitle>
            <CardDescription>AGENTS.md 的历史、变更和回滚入口</CardDescription>
          </div>
          <Badge variant={version.gitManaged ? "default" : "secondary"} className="shrink-0">
            {version.gitManaged ? "Git 已启用" : "未启用 Git"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <PathRow label="规则文件" value={report.agentsPath} />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">当前行数</div>
            <div className="pt-1 text-lg font-semibold tabular-nums">{lineCount}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">历史版本</div>
            <div className="pt-1 text-lg font-semibold tabular-nums">{version.totalCommits}</div>
          </div>
        </div>

        {!version.gitManaged ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                检测到：还不能做版本管理
              </div>
              <p className="mt-2 text-xs leading-5">
                当前 Codex Home 不是 git 仓库，所以现在不能显示历史版本、diff 或回滚。
              </p>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">推荐开启方式</div>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                <li>只跟踪 <code className="rounded bg-muted px-1">AGENTS.md</code> 和 <code className="rounded bg-muted px-1">.gitignore</code>。</li>
                <li>忽略 <code className="rounded bg-muted px-1">auth.json</code>、SQLite、日志、缓存、插件目录等敏感或大文件。</li>
                <li>初始化后，这里会自动显示历史版本、未提交变更和最近提交。</li>
              </ol>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">安全初始化命令</span>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5" onClick={copySetupCommand}>
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "已复制" : "复制"}
                </Button>
              </div>
              <pre className="max-h-52 overflow-auto rounded bg-background p-3 text-[11px] leading-5">
                <code>{safeInitCommand}</code>
              </pre>
            </div>
          </div>
        ) : (
          <>
            {version.hasUncommittedChanges && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
                当前有未提交变更{version.diffPreview ? `：${version.diffPreview}` : ""}
              </div>
            )}
            <div className="space-y-2">
              {version.commits.length === 0 ? (
                <p className="text-xs text-muted-foreground">AGENTS.md 暂无提交历史。</p>
              ) : (
                version.commits.map((commit) => (
                  <div key={commit.sha} className="rounded-md border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                      <code className="text-xs">{commit.sha}</code>
                      <span className="truncate text-xs text-muted-foreground">{commit.message}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {commit.author} · {formatTime(commit.date)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FindingList({
  findings,
  compact = false,
}: {
  findings: CodexFinding[];
  compact?: boolean;
}) {
  if (findings.length === 0) {
    return <p className="text-sm text-muted-foreground">暂时没有明显问题。</p>;
  }

  return (
    <div className={compact ? "space-y-3" : "grid grid-cols-1 gap-3 md:grid-cols-2"}>
      {findings.map((finding) => {
        const style = FINDING_STYLES[finding.severity];
        return (
          <div key={finding.title} className={`rounded-md border p-3 ${style.className}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {style.icon}
              <span>{finding.title}</span>
              {finding.count != null && <Badge variant="outline">{finding.count}</Badge>}
            </div>
            <p className="mt-2 text-xs leading-5">{finding.detail}</p>
            {finding.examples && finding.examples.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {finding.examples.slice(0, compact ? 4 : 6).map((example) => (
                  <div key={`${finding.title}:${example.name}:${example.path}`} className="rounded border border-current/15 bg-background/60 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{example.name}</span>
                      {example.detail && (
                        <span className="shrink-0 text-[10px] opacity-70">{example.detail}</span>
                      )}
                    </div>
                    <code className="mt-1 block truncate text-[10px] opacity-70">{example.path}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block truncate rounded bg-muted px-2 py-1 text-xs">{value}</code>
    </div>
  );
}
