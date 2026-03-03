"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { TableColumnHeader } from "./table-column-header";
import { CellDomain } from "./cells/cell-domain";
import { cleanDescriptionSummary, skillDisplayName } from "@/lib/utils";
import type { SkillEntry } from "@/lib/types";
import type { SkillCallStats } from "@/lib/frequency-scanner";

const SOURCE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
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
};

export interface ColumnCallbacks {
  onNameClick: (skill: SkillEntry) => void;
  onDomainChange: (skill: SkillEntry, domains: string[]) => void;
  allDomains?: string[];
}

/** Table meta — pass dynamic data through table.options.meta instead of closures */
export interface SkillTableMeta {
  callStatsMap?: Record<string, SkillCallStats>;
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
          className="max-w-[200px] truncate text-left font-mono text-sm hover:underline"
          onClick={() => callbacks.onNameClick(row.original)}
        >
          {skillDisplayName(row.original.name)}
        </button>
      ),
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
      accessorFn: (row) => (row.claudeMdRefs.length > 0 ? "routed" : "orphan"),
      header: ({ column }) => <TableColumnHeader column={column} title="路由" />,
      cell: ({ getValue }) => {
        const val = getValue() as string;
        return (
          <Badge
            variant={val === "routed" ? "default" : "secondary"}
            className="text-[10px]"
          >
            {val === "routed" ? "已路由" : "孤立"}
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
