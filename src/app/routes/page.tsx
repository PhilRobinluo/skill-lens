"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface BlameLine {
  lineNumber: number;
  sha: string;
  author: string;
  date: string;
  content: string;
}

interface HistoryCommit {
  sha: string;
  date: string;
  author: string;
  message: string;
}

// Parse routing tables from CLAUDE.md content
interface ParsedRoute {
  tableName: string;
  entries: Array<{ intent: string; skill: string; triggers: string }>;
}

function parseRouteTables(content: string): ParsedRoute[] {
  const lines = content.split("\n");
  const tables: ParsedRoute[] = [];
  let currentTable: ParsedRoute | null = null;
  let inTable = false;
  let headerPassed = false;

  for (const line of lines) {
    // Detect routing table headers (## with 路由 or Skill in title)
    if (line.startsWith("## ") && (line.includes("路由") || line.includes("Skill"))) {
      // Clean up table name
      const name = line.slice(3)
        .replace(/[（(][^）)]*[）)]/g, "")
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
        .trim();
      currentTable = { tableName: name, entries: [] };
      tables.push(currentTable);
      inTable = false;
      headerPassed = false;
      continue;
    }

    if (!currentTable) continue;

    // Detect markdown table rows
    if (line.startsWith("|")) {
      if (line.includes("---")) {
        // Separator row — next rows are data
        headerPassed = true;
        inTable = true;
        continue;
      }
      if (line.includes("用户意图") || line.includes("触发词")) {
        // Header row
        continue;
      }
      if (inTable && headerPassed) {
        const cells = line.split("|").map(c => c.trim()).filter(Boolean);
        if (cells.length >= 3) {
          currentTable.entries.push({
            intent: cells[0].replace(/\*\*/g, ""),
            skill: cells[1].replace(/`/g, ""),
            triggers: cells[2],
          });
        }
      }
    } else if (line.startsWith("## ") || line.startsWith("# ")) {
      // New section — stop current table
      currentTable = null;
      inTable = false;
      headerPassed = false;
    }
  }

  return tables;
}

export default function RoutesPage() {
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [history, setHistory] = useState<HistoryCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredSha, setHoveredSha] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [blameRes, historyRes] = await Promise.all([
          fetch("/api/claude-md/blame"),
          fetch("/api/claude-md/history"),
        ]);

        if (!cancelled) {
          if (blameRes.ok) {
            const data = await blameRes.json();
            setBlameLines(data.lines);
          }
          if (historyRes.ok) {
            const data = await historyRes.json();
            setHistory(data.commits);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Generate consistent colors for different SHAs
  const shaColors = useMemo(() => {
    const uniqueShas = [...new Set(blameLines.map(l => l.sha))];
    const palette = [
      "bg-blue-50 dark:bg-blue-950/30",
      "bg-green-50 dark:bg-green-950/30",
      "bg-amber-50 dark:bg-amber-950/30",
      "bg-purple-50 dark:bg-purple-950/30",
      "bg-pink-50 dark:bg-pink-950/30",
      "bg-cyan-50 dark:bg-cyan-950/30",
      "bg-orange-50 dark:bg-orange-950/30",
      "bg-teal-50 dark:bg-teal-950/30",
    ];
    const map: Record<string, string> = {};
    uniqueShas.forEach((sha, i) => {
      map[sha] = palette[i % palette.length];
    });
    return map;
  }, [blameLines]);

  // Parse route tables from blame content
  const routeTables = useMemo(() => {
    const content = blameLines.map(l => l.content).join("\n");
    return parseRouteTables(content);
  }, [blameLines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">加载 CLAUDE.md 数据...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">CLAUDE.md 路由总控</h1>
        <p className="text-sm text-muted-foreground">
          共 {blameLines.length} 行 · {history.length} 次提交
          {history[0] && (
            <> · 最后修改: {new Date(history[0].date).toLocaleDateString("zh-CN")}</>
          )}
        </p>
      </div>

      {/* Main content: blame + route structure */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Blame view */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Blame 视图</CardTitle>
            <CardDescription>每行显示修改者和提交信息，悬停查看详情</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto font-mono text-xs">
              {blameLines.map((line) => (
                <div
                  key={line.lineNumber}
                  className={`flex border-b border-muted/30 hover:brightness-95 dark:hover:brightness-110 ${
                    hoveredSha === line.sha ? "ring-1 ring-primary/30" : ""
                  } ${shaColors[line.sha] ?? ""}`}
                  onMouseEnter={() => setHoveredSha(line.sha)}
                  onMouseLeave={() => setHoveredSha(null)}
                  title={`${line.sha} · ${line.author} · ${new Date(line.date).toLocaleDateString("zh-CN")}`}
                >
                  {/* Line number */}
                  <span className="w-10 shrink-0 select-none px-1.5 py-0.5 text-right text-muted-foreground/40">
                    {line.lineNumber}
                  </span>
                  {/* SHA gutter */}
                  <span className="w-16 shrink-0 truncate px-1 py-0.5 text-muted-foreground/60">
                    {line.sha}
                  </span>
                  {/* Content */}
                  <span className="flex-1 whitespace-pre-wrap break-all px-1.5 py-0.5">
                    {line.content || "\u00A0"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right: Structured route tables */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">路由结构</CardTitle>
              <CardDescription>
                解析出 {routeTables.length} 个路由表，共 {routeTables.reduce((sum, t) => sum + t.entries.length, 0)} 条路由规则
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {routeTables.map((table, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="text-sm font-semibold">{table.tableName}</h4>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-2 py-1 text-left font-medium">意图</th>
                          <th className="px-2 py-1 text-left font-medium">Skill</th>
                          <th className="px-2 py-1 text-left font-medium">触发词</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.entries.map((entry, j) => (
                          <tr key={j} className="border-b last:border-0">
                            <td className="px-2 py-1">{entry.intent}</td>
                            <td className="px-2 py-1">
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                                {entry.skill}
                              </code>
                            </td>
                            <td className="max-w-[200px] truncate px-2 py-1 text-muted-foreground">
                              {entry.triggers}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom: Change history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">变更历史</CardTitle>
          <CardDescription>CLAUDE.md 的最近修改记录</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {history.slice(0, 20).map((commit) => (
              <div key={commit.sha} className="flex items-center gap-3 text-sm">
                <code className="shrink-0 font-mono text-xs text-muted-foreground">
                  {commit.sha}
                </code>
                <span className="flex-1 truncate">{commit.message}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {commit.author}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(commit.date).toLocaleDateString("zh-CN")}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground/60 italic">无变更历史</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
