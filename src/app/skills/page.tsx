"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkillCard } from "@/components/skill-card";
import { SkillDetailSheet } from "@/components/skill-detail-sheet";
import { SkillsTable } from "@/components/skills-table/skills-table";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAutoRefresh } from "@/hooks/use-sse";
import type { SkillEntry } from "@/lib/types";
import type { SkillCallStats } from "@/lib/frequency-scanner";

type ViewMode = "table" | "list" | "grouped";

const LS_VIEW_MODE = "skills-view-mode";

const SOURCE_OPTIONS = [
  { value: "all", label: "全部来源" },
  { value: "self-built", label: "自建" },
  { value: "baoyu", label: "宝玉系列" },
  { value: "plugin-official", label: "官方插件" },
  { value: "plugin-community", label: "社区插件" },
];

const CLAUDE_STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "routed", label: "已路由" },
  { value: "orphan", label: "孤立" },
];

export default function SkillsPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Loading skills..." />}>
      <SkillsPageInner />
    </Suspense>
  );
}

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

interface SkillGroup {
  domain: string;
  skills: SkillEntry[];
}

function groupSkillsByDomain(skills: SkillEntry[]): SkillGroup[] {
  const groupMap = new Map<string, SkillEntry[]>();

  for (const skill of skills) {
    const domain = skill.tags.domain[0] ?? "未分类";
    if (!groupMap.has(domain)) {
      groupMap.set(domain, []);
    }
    groupMap.get(domain)!.push(skill);
  }

  // Sort by count (largest first), "未分类" always at bottom
  const groups = Array.from(groupMap.entries()).map(([domain, items]) => ({
    domain,
    skills: items,
  }));

  groups.sort((a, b) => {
    if (a.domain === "未分类") return 1;
    if (b.domain === "未分类") return -1;
    return b.skills.length - a.skills.length;
  });

  return groups;
}

function SkillsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [allSkillNames, setAllSkillNames] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callStatsMap, setCallStatsMap] = useState<Record<string, SkillCallStats>>({});
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table";
    return (localStorage.getItem(LS_VIEW_MODE) as ViewMode) || "table";
  });

  // Filters from URL
  const q = searchParams.get("q") ?? "";
  const source = searchParams.get("source") ?? "all";
  const claudeStatus = searchParams.get("status") ?? "all";

  // Sheet state
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // All existing domain tags for suggestions
  const allDomains = useMemo(() => {
    const set = new Set<string>();
    for (const s of skills) for (const d of s.tags.domain) set.add(d);
    return Array.from(set).sort();
  }, [skills]);

  // Update URL params
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`/skills?${params.toString()}`);
  }

  // Fetch skills
  const fetchSkills = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (source !== "all") params.set("source", source);

      const res = await fetch(`/api/skills?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      let filtered: SkillEntry[] = data.skills;

      // Client-side CLAUDE.md status filter
      if (claudeStatus === "routed") {
        filtered = filtered.filter((s: SkillEntry) => s.claudeMdRefs.length > 0);
      } else if (claudeStatus === "orphan") {
        filtered = filtered.filter((s: SkillEntry) => s.claudeMdRefs.length === 0);
      }

      setSkills(filtered);
      setTotal(filtered.length);
      setAllSkillNames(
        (data.skills as SkillEntry[]).map((s: SkillEntry) => s.name),
      );
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [q, source, claudeStatus]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    fetch("/api/skills/frequency")
      .then((res) => res.ok ? res.json() : {})
      .then((data: Record<string, SkillCallStats>) => setCallStatsMap(data))
      .catch(() => {});
  }, []);

  useAutoRefresh(fetchSkills);

  function handleCardClick(skill: SkillEntry) {
    setSelectedSkill(skill);
    setSheetOpen(true);
  }

  function handleSheetUpdated() {
    fetchSkills();
  }

  const groups = useMemo(() => groupSkillsByDomain(skills), [skills]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">技能库</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "加载中..." : `共 ${total} 个技能`}
          </p>
        </div>
      </div>

      {/* View Toggle + Legacy Filters (for list/grouped) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Legacy filters only for list/grouped views */}
        {viewMode !== "table" && (
          <>
            <Input
              placeholder="搜索技能..."
              value={q}
              onChange={(e) => updateParam("q", e.target.value)}
              className="h-9 sm:max-w-xs"
            />

            <Select
              value={source}
              onValueChange={(val) => updateParam("source", val)}
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={claudeStatus}
              onValueChange={(val) => updateParam("status", val)}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {/* View mode toggle — 3 options */}
        <div className={`flex items-center rounded-md border ${viewMode === "table" ? "" : "ml-auto"}`}>
          {(["table", "list", "grouped"] as const).map((mode, i) => {
            const labels = { table: "表格", list: "列表", grouped: "分组" };
            const isFirst = i === 0;
            const isLast = i === 2;
            return (
              <button
                key={mode}
                type="button"
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                } ${isFirst ? "rounded-l-md" : ""} ${isLast ? "rounded-r-md" : ""}`}
                onClick={() => {
                  setViewMode(mode);
                  localStorage.setItem(LS_VIEW_MODE, mode);
                }}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchSkills();
            }}
          >
            重试
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && skills.length === 0 && !error && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          没有匹配当前筛选条件的技能
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <SkillsTable
          skills={skills}
          onNameClick={handleCardClick}
          onUpdated={handleSheetUpdated}
          callStatsMap={callStatsMap}
        />
      )}

      {/* List View (card grid) */}
      {viewMode === "list" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill, index) => (
            <SkillCard
              key={`${skill.name}-${skill.source}-${index}`}
              skill={skill}
              onClick={() => handleCardClick(skill)}
            />
          ))}
        </div>
      )}

      {/* Grouped View */}
      {viewMode === "grouped" && (
        <div className="space-y-2">
          {groups.map((group) => (
            <GroupSection
              key={group.domain}
              group={group}
              onSkillClick={handleCardClick}
            />
          ))}
        </div>
      )}

      {/* Detail Sheet */}
      <SkillDetailSheet
        skill={selectedSkill}
        allSkillNames={allSkillNames}
        allDomains={allDomains}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={handleSheetUpdated}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupSection — collapsible domain group for grouped view
// ---------------------------------------------------------------------------
function GroupSection({
  group,
  onSkillClick,
}: {
  group: SkillGroup;
  onSkillClick: (skill: SkillEntry) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm text-muted-foreground">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="font-semibold text-sm">{group.domain}</span>
        <Badge variant="secondary" className="text-[10px] ml-1">
          {group.skills.length}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t divide-y">
          {group.skills.map((skill, index) => {
            const sourceStyle = SOURCE_BADGE_STYLES[skill.source] ?? {
              label: skill.source,
              className: "",
            };
            return (
              <button
                key={`${skill.name}-${index}`}
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent/30 transition-colors"
                onClick={() => onSkillClick(skill)}
              >
                <span className="shrink-0 w-[240px] truncate font-mono text-sm">
                  {skill.name}
                </span>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] ${sourceStyle.className}`}
                >
                  {sourceStyle.label}
                </Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {skill.description || "无描述"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
