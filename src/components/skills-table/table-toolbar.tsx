"use client";

import type { Table } from "@tanstack/react-table";
import { Settings2, Group } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableFilterBuilder } from "./table-filter-builder";
import type { FilterState, SkillEntry } from "@/lib/types";

const COLUMN_LABELS: Record<string, string> = {
  name: "名称",
  source: "来源",
  status: "路由",
  domain: "领域",
  description: "描述",
  lineCount: "行数",
  callStats: "调用统计",
  lastModified: "更新时间",
  notes: "备注",
};

const GROUPING_OPTIONS = [
  { value: "none", label: "不分组" },
  { value: "source", label: "按来源" },
  { value: "status", label: "按路由状态" },
];

interface TableToolbarProps {
  table: Table<SkillEntry>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  filterState: FilterState;
  onFilterStateChange: (state: FilterState) => void;
  grouping: string;
  onGroupingChange: (value: string) => void;
}

export function TableToolbar({
  table,
  globalFilter,
  onGlobalFilterChange,
  filterState,
  onFilterStateChange,
  grouping,
  onGroupingChange,
}: TableToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Search */}
      <Input
        placeholder="搜索技能..."
        value={globalFilter}
        onChange={(e) => onGlobalFilterChange(e.target.value)}
        className="h-8 w-[200px] text-sm"
      />

      {/* Notion-style filter */}
      <TableFilterBuilder
        filterState={filterState}
        onChange={onFilterStateChange}
      />

      {/* Grouping */}
      <div className="flex items-center gap-1">
        <Group className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={grouping} onValueChange={onGroupingChange}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Column visibility */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            列
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuLabel className="text-xs">显示列</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllColumns()
            .filter((column) => column.getCanHide())
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="text-xs capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {COLUMN_LABELS[column.id] ?? column.id}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
