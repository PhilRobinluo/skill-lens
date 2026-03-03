"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DependencyGraph,
  type GraphView,
} from "@/components/dependency-graph";
import { useAutoRefresh } from "@/hooks/use-sse";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorMessage } from "@/components/error-message";
import type { SkillEntry } from "@/lib/types";

export default function GraphPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<GraphView>("dependencies");

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSkills(data.skills);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useAutoRefresh(fetchSkills);

  function handleNodeClick(skillName: string) {
    router.push(`/skills?q=${encodeURIComponent(skillName)}`);
  }

  if (loading) {
    return <LoadingSpinner text="Loading graph..." />;
  }

  if (error) {
    return (
      <ErrorMessage
        message={`Failed to load graph: ${error}`}
        onRetry={fetchSkills}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Top bar with view tabs */}
      <div className="flex items-center gap-4 border-b px-6 py-2">
        <Tabs
          value={view}
          onValueChange={(val) => setView(val as GraphView)}
        >
          <TabsList>
            <TabsTrigger value="dependencies">依赖图</TabsTrigger>
            <TabsTrigger value="claudemd">CLAUDE.md 关联</TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="text-xs text-muted-foreground">
          {view === "dependencies"
            ? "Skill 之间的依赖关系"
            : "Skill 在 CLAUDE.md 路由表中的引用"}
        </span>
      </div>

      {/* Graph canvas (fills remaining height) */}
      <div className="relative flex-1">
        <DependencyGraph
          skills={skills}
          view={view}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  );
}
