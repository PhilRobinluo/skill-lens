"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type GroupingState,
  type ExpandedState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getColumns, type ColumnCallbacks } from "./columns";
import { TableToolbar } from "./table-toolbar";
import { filterSkills } from "./table-filter-builder";
import { useSkillMutations } from "@/hooks/use-skill-mutations";
import type { SkillEntry, FilterState } from "@/lib/types";
import type { SkillCallStats } from "@/lib/frequency-scanner";

// localStorage keys
const LS_COLUMN_VIS = "skills-table-column-visibility";
const LS_SORTING = "skills-table-sorting";

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface SkillsTableProps {
  skills: SkillEntry[];
  onNameClick: (skill: SkillEntry) => void;
  onUpdated: () => void;
  callStatsMap?: Record<string, SkillCallStats>;
}

export function SkillsTable({ skills, onNameClick, onUpdated, callStatsMap }: SkillsTableProps) {
  // Mutation target
  const [mutTarget, setMutTarget] = useState<string | null>(null);
  const { patchTags } = useSkillMutations({ skillName: mutTarget, onUpdated });

  // Table state
  const [sorting, setSorting] = useState<SortingState>(() => loadJson(LS_SORTING, []));
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    loadJson(LS_COLUMN_VIS, {}),
  );
  const [globalFilter, setGlobalFilter] = useState("");
  const [groupingKey, setGroupingKey] = useState("none");
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);

  // Notion-style filter
  const [filterState, setFilterState] = useState<FilterState>({
    conditions: [],
    logic: "and",
  });

  // Persist prefs
  useEffect(() => {
    localStorage.setItem(LS_COLUMN_VIS, JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  useEffect(() => {
    localStorage.setItem(LS_SORTING, JSON.stringify(sorting));
  }, [sorting]);

  // Pre-filter with Notion conditions
  const filteredSkills = useMemo(
    () => filterSkills(skills, filterState),
    [skills, filterState],
  );

  // Column callbacks
  const callbacks: ColumnCallbacks = useMemo(
    () => ({
      onNameClick,
      onDomainChange: (skill, domains) => {
        setMutTarget(skill.name);
        setTimeout(() => patchTags({ domain: domains }), 0);
      },
    }),
    [onNameClick, patchTags],
  );

  const columns = useMemo(() => getColumns(callbacks, callStatsMap), [callbacks, callStatsMap]);

  // Grouping sync
  useEffect(() => {
    if (groupingKey === "none") {
      setGrouping([]);
    } else {
      setGrouping([groupingKey]);
    }
    setExpanded(true);
  }, [groupingKey]);

  const table = useReactTable({
    data: filteredSkills,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      grouping,
      expanded,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    globalFilterFn: "includesString",
    enableGrouping: true,
  });

  const handleGroupingChange = useCallback((value: string) => {
    setGroupingKey(value);
  }, []);

  return (
    <div className="space-y-3">
      <TableToolbar
        table={table}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        grouping={groupingKey}
        onGroupingChange={handleGroupingChange}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan} className="h-9 text-xs">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                // Grouping header row
                if (row.getIsGrouped()) {
                  return (
                    <TableRow
                      key={row.id}
                      className="bg-muted/40 hover:bg-muted/60 cursor-pointer"
                      onClick={() => row.toggleExpanded()}
                    >
                      <TableCell colSpan={columns.length} className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {row.getIsExpanded() ? "▼" : "▶"}
                          </span>
                          <span className="text-sm font-medium">
                            {String(row.groupingValue) || "未设置"}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {row.subRows.length}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={row.id} className="hover:bg-accent/30">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-1.5">
                        {cell.getIsAggregated()
                          ? null
                          : cell.getIsPlaceholder()
                            ? null
                            : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  没有匹配的技能
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        共 {filteredSkills.length} 个技能
        {filterState.conditions.length > 0 && ` (筛选自 ${skills.length} 个)`}
      </div>
    </div>
  );
}
