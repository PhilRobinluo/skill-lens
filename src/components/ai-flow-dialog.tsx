"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { FlowGenerationResponse } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasApiKey: boolean;
  onGenerated: (response: FlowGenerationResponse) => void;
}

const EXAMPLE_SCENARIOS = [
  "用户发来一个 X 链接，需要深度剪藏并沉淀到 Obsidian",
  "写一篇公众号文章的完整流程",
  "分析一个新的 AI 工具并记录到知识库",
];

export function AIFlowDialog({ open, onOpenChange, hasApiKey, onGenerated }: Props) {
  const [scenario, setScenario] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(v: boolean) {
    if (!v) {
      setScenario("");
      setError(null);
    }
    onOpenChange(v);
  }

  async function generate() {
    if (!scenario.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenario.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: FlowGenerationResponse = await res.json();
      onGenerated(data);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI 生成工作流
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">描述一个使用场景</label>
            <Textarea
              placeholder="例如：用户发来一条 X 链接，需要深度剪藏并存到 Obsidian..."
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">示例场景：</p>
            <div className="flex flex-wrap gap-1">
              {EXAMPLE_SCENARIOS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setScenario(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {!hasApiKey && (
            <p className="text-xs text-amber-600">请先在设置中配置 OpenRouter API Key</p>
          )}

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={generate}
            disabled={!hasApiKey || !scenario.trim() || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                生成流程
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
