"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { HealthReportResponse } from "@/lib/types";

interface Props {
  hasApiKey: boolean;
}

export function HealthReportCard({ hasApiKey }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [report, setReport] = useState<HealthReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai/health-report", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: HealthReportResponse = await res.json();
      setReport(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setState("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              AI 健康度报告
            </CardTitle>
            <CardDescription>
              基于 Skill 质量评估标准，AI 分析整体健康度
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant={state === "done" ? "outline" : "default"}
            onClick={generate}
            disabled={!hasApiKey || state === "loading"}
          >
            {state === "loading" ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                分析中...
              </>
            ) : state === "done" ? (
              "重新生成"
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                生成报告
              </>
            )}
          </Button>
        </div>
        {!hasApiKey && (
          <p className="text-xs text-amber-600">请先在设置中配置 OpenRouter API Key</p>
        )}
      </CardHeader>

      {(state === "done" || state === "error") && (
        <CardContent>
          {state === "error" && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {state === "done" && report && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{report.report}</ReactMarkdown>
              <p className="mt-4 text-xs text-muted-foreground">
                生成时间：{new Date(report.generatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
