"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PipelineEditor } from "@/components/pipeline-editor";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAutoRefresh } from "@/hooks/use-sse";
import type { Pipeline, PipelineStep } from "@/lib/types";
import type { PipelineStepData } from "@/components/pipeline-step";

interface PipelineWithId {
  id: string;
  description: string;
  steps: PipelineStepData[];
}

function toPipelineStepData(
  steps: PipelineStep[],
): PipelineStepData[] {
  return steps.map((s, i) => ({
    id: `step-${i}-${s.skill}-${s.role}`,
    skill: s.skill,
    role: s.role,
  }));
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineWithId[]>([]);
  const [allSkillNames, setAllSkillNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [pipeRes, skillRes] = await Promise.all([
        fetch("/api/pipelines"),
        fetch("/api/skills"),
      ]);

      if (!pipeRes.ok) throw new Error(`Pipelines: HTTP ${pipeRes.status}`);
      if (!skillRes.ok) throw new Error(`Skills: HTTP ${skillRes.status}`);

      const pipeData = await pipeRes.json();
      const skillData = await skillRes.json();

      const pipMap = pipeData.pipelines as Record<string, Pipeline>;
      const list: PipelineWithId[] = Object.entries(pipMap).map(
        ([id, p]) => ({
          id,
          description: p.description,
          steps: toPipelineStepData(p.steps),
        }),
      );

      setPipelines(list);
      setAllSkillNames(
        (skillData.skills as Array<{ name: string }>).map((s) => s.name),
      );
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useAutoRefresh(fetchData);

  async function handleCreate() {
    if (!newName.trim() || !newDesc.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newName.trim(),
          description: newDesc.trim(),
          steps: [{ skill: "placeholder", role: "起始" }],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setNewName("");
      setNewDesc("");
      setCreateOpen(false);
      fetchData();
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(
    id: string,
    description: string,
    steps: Array<{ skill: string; role: string }>,
  ) {
    try {
      const res = await fetch(
        `/api/pipelines/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, steps }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        console.error("Save failed:", data.error);
      }
    } catch (err) {
      console.error("Save error:", err);
    }
  }

  // Show full-page spinner on initial load
  if (loading && pipelines.length === 0 && !error) {
    return <LoadingSpinner text="Loading pipelines..." />;
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(
        `/api/pipelines/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      fetchData();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">编排链路</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading..."
              : `${pipelines.length} 条链路`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建链路
        </Button>
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
              fetchData();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && pipelines.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-3 text-muted-foreground">
            &#8693;
          </div>
          <h3 className="text-lg font-medium">还没有编排链路</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            创建你的第一条链路，串联多个 Skill 协同工作
          </p>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新建链路
          </Button>
        </div>
      )}

      {/* Pipeline list */}
      <div className="space-y-4">
        {pipelines.map((p) => (
          <PipelineEditor
            key={p.id}
            id={p.id}
            description={p.description}
            steps={p.steps}
            allSkillNames={allSkillNames}
            onDelete={handleDelete}
            onSave={handleSave}
          />
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建编排链路</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">链路名称</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder='例如: "文章写作流程"'
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">描述</label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="这条链路做什么..."
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || !newDesc.trim() || creating}
              className="w-full sm:w-auto"
            >
              {creating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
