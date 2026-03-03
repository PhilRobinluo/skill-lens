"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { TableColumnHeader } from "./table-column-header";
import { CellDomain } from "./cells/cell-domain";
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
      cell: ({ row }) => {
        const skill = row.original;
        const isRouted = skill.claudeMdRefs.length > 0;
        return (
          <button
            type="button"
            className="flex items-center gap-1.5 text-left font-mono text-sm hover:underline"
            onClick={() => callbacks.onNameClick(skill)}
          >
            <span
              className={isRouted ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}
              title={isRouted ? "已路由" : "孤立"}
            >
              {isRouted ? "✓" : "✗"}
            </span>
            <span className="max-w-[200px] truncate">{skill.name}</span>
          </button>
        );
      },
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
    // 4. Domain (editable)
    {
      id: "domain",
      accessorFn: (row) => row.tags.domain.join(", "),
      header: ({ column }) => <TableColumnHeader column={column} title="领域" />,
      cell: ({ row }) => (
        <CellDomain
          skill={row.original}
          onChange={(domains) => callbacks.onDomainChange(row.original, domains)}
        />
      ),
    },
    // 5. Description
    {
      accessorKey: "description",
      header: "描述",
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-[300px] text-xs text-muted-foreground">
          {row.original.description || "无描述"}
        </span>
      ),
      enableSorting: false,
    },
    // 7. Line count
    {
      accessorKey: "lineCount",
      header: ({ column }) => <TableColumnHeader column={column} title="行数" />,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.lineCount}</span>
      ),
    },
    // 7. Call stats
    {
      id: "callStats",
      accessorFn: (row) => callStatsMap?.[row.name]?.total ?? 0,
      header: ({ column }) => <TableColumnHeader column={column} title="调用统计" />,
      cell: ({ row }) => {
        const stats = callStatsMap?.[row.original.name];
        if (!stats || stats.total === 0) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <span className="text-xs tabular-nums" title={stats.lastUsed ? `最后使用: ${new Date(stats.lastUsed).toLocaleDateString("zh-CN")}` : undefined}>
            {stats.total} <span className="text-muted-foreground">({stats.last30d})</span>
          </span>
        );
      },
    },
    // 8. Last modified
    {
      accessorKey: "lastModified",
      header: ({ column }) => <TableColumnHeader column={column} title="更新时间" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.lastModified).toLocaleDateString("zh-CN")}
        </span>
      ),
    },
    // 8. Notes
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
