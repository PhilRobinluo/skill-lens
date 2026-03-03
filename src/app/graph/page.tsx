"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorMessage } from "@/components/error-message";
import { useAutoRefresh } from "@/hooks/use-sse";
import type { SkillEntry } from "@/lib/types";

const SkillGraph3D = dynamic(
  () => import("@/components/skill-graph-3d").then((mod) => mod.SkillGraph3D),
  {
    ssr: false,
    loading: () => <LoadingSpinner text="Loading 3D graph..." />,
  },
);

export default function GraphPage() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [allSkillNames, setAllSkillNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSkills(data.skills);
      setAllSkillNames((data.skills as SkillEntry[]).map((s) => s.name));
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

  if (loading) return <LoadingSpinner text="Loading skills..." />;
  if (error && skills.length === 0) return <ErrorMessage message={error} onRetry={fetchSkills} />;

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <SkillGraph3D
        skills={skills}
        allSkillNames={allSkillNames}
        onUpdated={fetchSkills}
      />
    </div>
  );
}
