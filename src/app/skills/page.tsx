"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SkillCard } from "@/components/skill-card";
import { SkillDetailSheet } from "@/components/skill-detail-sheet";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAutoRefresh } from "@/hooks/use-sse";
import type { SkillEntry } from "@/lib/types";

const SOURCE_OPTIONS = [
  { value: "all", label: "All Sources" },
  { value: "self-built", label: "Self-built" },
  { value: "baoyu", label: "Baoyu" },
  { value: "plugin-official", label: "Official" },
  { value: "plugin-community", label: "Community" },
];

const CLAUDE_STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "routed", label: "Routed" },
  { value: "orphan", label: "Orphan" },
];

export default function SkillsPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Loading skills..." />}>
      <SkillsPageInner />
    </Suspense>
  );
}

function SkillsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [allSkillNames, setAllSkillNames] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from URL
  const q = searchParams.get("q") ?? "";
  const source = searchParams.get("source") ?? "all";
  const claudeStatus = searchParams.get("status") ?? "all";

  // Sheet state
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  useAutoRefresh(fetchSkills);

  function handleCardClick(skill: SkillEntry) {
    setSelectedSkill(skill);
    setSheetOpen(true);
  }

  function handleSheetUpdated() {
    fetchSkills();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading..." : `${total} skill${total !== 1 ? "s" : ""} found`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name or description..."
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
            Retry
          </Button>
        </div>
      )}

      {/* Grid */}
      {!loading && skills.length === 0 && !error && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          No skills match the current filters.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <SkillCard
            key={skill.name}
            skill={skill}
            onClick={() => handleCardClick(skill)}
          />
        ))}
      </div>

      {/* Detail Sheet */}
      <SkillDetailSheet
        skill={selectedSkill}
        allSkillNames={allSkillNames}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={handleSheetUpdated}
      />
    </div>
  );
}
