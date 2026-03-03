"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { TagSuggestion } from "@/lib/types";
import { skillDisplayName } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  untaggedCount: number;
  hasApiKey: boolean;
  onApplied: () => void;
}

type Stage = "confirm" | "loading" | "preview";

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function AITagDialog({ open, onOpenChange, untaggedCount, hasApiKey, onApplied }: Props) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  function handleOpenChange(v: boolean) {
    if (!v) {
      // Reset state on close
      setStage("confirm");
      setSuggestions([]);
      setSelected(new Set());
      setError(null);
    }
    onOpenChange(v);
  }

  async function analyze() {
    setStage("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai/auto-tag", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const sugs: TagSuggestion[] = data.suggestions || [];
      setSuggestions(sugs);
      setSelected(new Set(sugs.map((s) => s.skillName)));
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
      setStage("confirm");
    }
  }

  async function applySelected() {
    setApplying(true);
    try {
      for (const sug of suggestions) {
        if (!selected.has(sug.skillName)) continue;
        await fetch(`/api/skills/${encodeURIComponent(sug.skillName)}/tags`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: sug.suggestedDomains }),
        });
      }
      onApplied();
      handleOpenChange(false);
    } finally {
      setApplying(false);
    }
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(suggestions.map((s) => s.skillName)));
    } else {
      setSelected(new Set());
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI 智能打标签
          </DialogTitle>
        </DialogHeader>

        {stage === "confirm" && (
          <div className="py-4 space-y-3">
            <p className="text-sm">
              发现 <strong>{untaggedCount}</strong> 个未标记技能。AI 将分析并推荐标签分类。
            </p>
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {!hasApiKey && (
              <p className="text-xs text-amber-600">请先在设置中配置 OpenRouter API Key</p>
            )}
          </div>
        )}

        {stage === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">AI 正在分析技能...</p>
          </div>
        )}

        {stage === "preview" && (
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Checkbox
                checked={selected.size === suggestions.length && suggestions.length > 0}
                onCheckedChange={(checked) => toggleAll(!!checked)}
              />
              <span className="text-xs text-muted-foreground">
                全选 ({selected.size}/{suggestions.length})
              </span>
            </div>
            {suggestions.map((sug) => (
              <label
                key={sug.skillName}
                className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-accent/30 cursor-pointer"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(sug.skillName)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked) next.add(sug.skillName);
                    else next.delete(sug.skillName);
                    setSelected(next);
                  }}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono font-medium">{skillDisplayName(sug.skillName)}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${CONFIDENCE_STYLES[sug.confidence] ?? ""}`}
                    >
                      {sug.confidence}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {sug.suggestedDomains.map((d) => (
                      <Badge key={d} variant="secondary" className="text-[10px]">
                        {d}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{sug.reason}</p>
                </div>
              </label>
            ))}
            {suggestions.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                所有技能已有标签
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === "confirm" && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button onClick={analyze} disabled={!hasApiKey || untaggedCount === 0}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                开始分析
              </Button>
            </>
          )}
          {stage === "preview" && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button
                onClick={applySelected}
                disabled={selected.size === 0 || applying}
              >
                {applying ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    应用中...
                  </>
                ) : (
                  `应用选中 (${selected.size})`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
