"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TableColumnHeader } from "./table-column-header";
import { CellDomain } from "./cells/cell-domain";
import { cleanDescriptionSummary, skillDisplayName } from "@/lib/utils";
import type { SkillEntry } from "@/lib/types";
import type { SkillCallStats } from "@/lib/frequency-scanner";

export const SOURCE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  "self-built": {
    label: "自建",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  baoyu: {
    label: "宝玉系列",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  },
  "plugin-official": {
    label: "官方插件",
    className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  "plugin-community": {
    label: "社区插件",
    className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  },
  "codex-user": { label: "Codex 自建", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  "codex-system": { label: "Codex 系统", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  "codex-plugin": { label: "Codex 插件", className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  "codex-agent-shared": { label: "Agents 共享", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  "codex-project": { label: "Codex 项目", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
};

export interface ColumnCallbacks {
  onNameClick: (skill: SkillEntry) => void;
  onDomainChange: (skill: SkillEntry, domains: string[]) => void;
  onToggle: (skill: SkillEntry, enabled: boolean) => void;
  allDomains?: string[];
  readOnly?: boolean;
}

/** Table meta — pass dynamic data through table.options.meta instead of closures */
export interface SkillTableMeta {
  callStatsMap?: Record<string, SkillCallStats>;
  hasCallStatsSource?: boolean;
}

/** Format ISO timestamp to relative time string */
function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}月前`;
  return `${Math.floor(diffDays / 365)}年前`;
}

/** Heat dot color based on call count */
function heatColor(total: number): string {
  if (total >= 20) return "bg-blue-500";
  if (total >= 5) return "bg-emerald-500";
  return "bg-gray-300 dark:bg-gray-600";
}

function isCodexSkill(skill: SkillEntry): boolean {
  return skill.source.startsWith("codex-");
}

function routeState(skill: SkillEntry): "routed" | "orphan" {
  if (isCodexSkill(skill)) {
    return skill.enabled && skill.description.trim().length > 0 ? "routed" : "orphan";
  }
  return skill.claudeMdRefs.length > 0 ? "routed" : "orphan";
}

function activityLevel(skill: SkillEntry): number {
  const lastActiveAt = skill.gitHistory?.lastCommitAt ?? skill.lastModified;
  if (!lastActiveAt) return 0;
  const days = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 86400000);
  if (days <= 7) return 3;
  if (days <= 30) return 2;
  if (days <= 90) return 1;
  return 0;
}

function activityLabel(skill: SkillEntry): { label: string; title: string } {
  const lastActiveAt = skill.gitHistory?.lastCommitAt ?? skill.lastModified;
  if (!lastActiveAt) return { label: "—", title: "没有活跃度数据" };
  const days = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 86400000);
  const basis = skill.gitHistory?.lastCommitAt ? "最近提交" : "最近修改";
  if (days <= 7) return { label: "高", title: `${basis}：${days}天前` };
  if (days <= 30) return { label: "中", title: `${basis}：${days}天前` };
  if (days <= 90) return { label: "低", title: `${basis}：${days}天前` };
  return { label: "冷", title: `${basis}：${days}天前` };
}

export function getColumns(
  callbacks: ColumnCallbacks,
  callStatsMap?: Record<string, SkillCallStats>,
): ColumnDef<SkillEntry>[] {
  return [
    // 1. Name
    {
      accessorKey: "name",
      header: ({ column }) => <TableColumnHeader column={column} title="名称" />,
      cell: ({ row }) => (
        <button
          type="button"
          className={`min-w-[260px] max-w-[460px] whitespace-normal break-words text-left font-mono text-sm leading-5 hover:underline ${
            !row.original.enabled ? "line-through opacity-50" : ""
          }`}
          onClick={() => callbacks.onNameClick(row.original)}
        >
          {skillDisplayName(row.original.name)}
        </button>
      ),
      size: 320,
      minSize: 260,
      maxSize: 460,
      enableGrouping: false,
    },
    // 1.5 Enabled toggle
    {
      id: "enabled",
      accessorFn: (row) => row.enabled,
      header: ({ column }) => <TableColumnHeader column={column} title="启用" />,
      cell: ({ row }) => {
        const skill = row.original;
        if (callbacks.readOnly) {
          return (
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                skill.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
              }`}
              title={skill.enabled ? "已启用" : "已禁用"}
            />
          );
        }
        return (
          <Switch
            size="sm"
            checked={skill.enabled}
            disabled={callbacks.readOnly}
            onCheckedChange={(checked) => callbacks.onToggle(skill, !!checked)}
          />
        );
      },
      enableSorting: false,
      enableGrouping: false,
    },
    // 2. Source
    {
      accessorKey: "source",
      header: ({ column }) => <TableColumnHeader column={column} title="来源" />,
      cell: ({ row }) => {
        const source = row.original.source;
        const style = SOURCE_BADGE_STYLES[source] ?? { label: source, className: "" };
        return (
          <Badge variant="outline" className={`text-[10px] ${style.className}`}>
            {style.label}
          </Badge>
        );
      },
      filterFn: "equals",
    },
    // 3. Status (routed/orphan)
    {
      id: "status",
      accessorFn: routeState,
      header: ({ column }) => <TableColumnHeader column={column} title="路由" />,
      cell: ({ getValue, row }) => {
        const val = getValue() as string;
        const codex = isCodexSkill(row.original);
        return (
          <Badge
            variant={val === "routed" ? "default" : "secondary"}
            className="text-[10px]"
          >
            {val === "routed" ? (codex ? "规则可见" : "已路由") : (codex ? "待规则" : "孤立")}
          </Badge>
        );
      },
      filterFn: "equals",
    },
    // 4. Domain (editable + groupable by first domain)
    {
      id: "domain",
      accessorFn: (row) => row.tags.domain[0] ?? "未分类",
      header: ({ column }) => <TableColumnHeader column={column} title="领域" />,
      cell: ({ row }) => (
        <CellDomain
          skill={row.original}
          allDomains={callbacks.allDomains}
          readOnly={callbacks.readOnly}
          onChange={(domains) => callbacks.onDomainChange(row.original, domains)}
        />
      ),
      getGroupingValue: (row) => row.tags.domain[0] ?? "未分类",
    },
    // 5. Description
    {
      accessorKey: "description",
      header: "描述",
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-[300px] text-xs text-muted-foreground">
          {cleanDescriptionSummary(row.original.description)}
        </span>
      ),
      enableSorting: false,
    },
    // 6. Line count
    {
      accessorKey: "lineCount",
      header: ({ column }) => <TableColumnHeader column={column} title="行数" />,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.lineCount}</span>
      ),
    },
    // 7. Call stats — heat dot + count + relative time
    {
      id: "callStats",
      accessorFn: (row) => callStatsMap?.[row.name]?.total ?? 0,
      header: ({ column }) => <TableColumnHeader column={column} title="调用统计" />,
      cell: ({ row, table }) => {
        const meta = table.options.meta as SkillTableMeta | undefined;
        const stats = meta?.callStatsMap?.[row.original.name];
        if (!meta?.hasCallStatsSource) {
          return (
            <span className="text-xs text-muted-foreground/50" title="当前没有可解析的 Skill 调用日志。旧实现只扫描 ~/.claude/projects JSONL 里的 Skill 工具调用。">
              无调用日志
            </span>
          );
        }
        if (!stats || stats.total === 0) {
          return <span className="text-xs text-muted-foreground/50">未使用</span>;
        }
        return (
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${heatColor(stats.total)}`} />
            <span className={`text-xs tabular-nums ${stats.total >= 20 ? "font-medium" : ""}`}>
              {stats.total}次
            </span>
            {stats.lastUsed && (
              <span className="text-[10px] text-muted-foreground">
                · {formatRelativeTime(stats.lastUsed)}
              </span>
            )}
          </div>
        );
      },
    },
    // 7.5 Upstream status
    {
      id: "upstream",
      accessorFn: (row) => row.upstream?.status ?? "original",
      header: ({ column }) => <TableColumnHeader column={column} title="上游" />,
      cell: ({ row }) => {
        const upstream = row.original.upstream;
        if (!upstream) {
          return <span className="text-xs text-muted-foreground/50">—</span>;
        }
        if (upstream.status === "modified") {
          return (
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              🔀 已修改
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="text-[10px] bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
            📌 跟随
          </Badge>
        );
      },
      filterFn: "equals",
    },
    // 7.6 Commits count
    {
      id: "commits",
      accessorFn: (row) => row.gitHistory?.totalCommits ?? 0,
      header: ({ column }) => <TableColumnHeader column={column} title="Commits" />,
      cell: ({ row }) => {
        const count = row.original.gitHistory?.totalCommits ?? 0;
        if (count === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
        return <span className="text-sm tabular-nums">{count}</span>;
      },
    },
    // 7.7 Activity level
    {
      id: "activity",
      accessorFn: activityLevel,
      header: ({ column }) => <TableColumnHeader column={column} title="活跃度" />,
      cell: ({ row }) => {
        const activity = activityLabel(row.original);
        if (activity.label === "—") {
          return <span className="text-xs text-muted-foreground/50">—</span>;
        }
        return (
          <Badge variant="outline" className="text-[10px]" title={activity.title}>
            {activity.label}
          </Badge>
        );
      },
    },
    // 8. Created at
    {
      accessorKey: "createdAt",
      header: ({ column }) => <TableColumnHeader column={column} title="创建时间" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdAt
            ? new Date(row.original.createdAt).toLocaleDateString("zh-CN")
            : "—"}
        </span>
      ),
    },
    // 9. Last modified
    {
      accessorKey: "lastModified",
      header: ({ column }) => <TableColumnHeader column={column} title="更新时间" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.lastModified).toLocaleDateString("zh-CN")}
        </span>
      ),
    },
    // 10. Notes
    {
      accessorKey: "notes",
      header: "备注",
      enableHiding: true,
      cell: ({ row }) => {
        const notes = row.original.notes;
        if (!notes) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <button
            type="button"
            className="line-clamp-1 max-w-[200px] text-left text-xs text-muted-foreground hover:underline"
            onClick={() => callbacks.onNameClick(row.original)}
          >
            {notes}
          </button>
        );
      },
      enableSorting: false,
    },
  ];
}
