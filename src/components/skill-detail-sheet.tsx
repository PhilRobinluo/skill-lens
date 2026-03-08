"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import Markdown from "react-markdown";
import { useSkillMutations } from "@/hooks/use-skill-mutations";
import { cleanDescriptionFull, skillDisplayName } from "@/lib/utils";
import type { SkillEntry, SkillGitHistory, ModificationType, FileNode } from "@/lib/types";

interface SkillDetailSheetProps {
  skill: SkillEntry | null;
  allSkillNames: string[];
  allDomains?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export const SOURCE_LABELS: Record<string, string> = {
  "self-built": "自建",
  baoyu: "宝玉系列",
  "plugin-official": "官方插件",
  "plugin-community": "社区插件",
};

export function SkillDetailSheet({
  skill,
  allSkillNames,
  allDomains,
  open,
  onOpenChange,
  onUpdated,
}: SkillDetailSheetProps) {
  // Local editable state
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [notes, setNotes] = useState("");
  const [domainSuggestions, setDomainSuggestions] = useState<string[]>([]);
  const [showDomainSuggestions, setShowDomainSuggestions] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [fileContentError, setFileContentError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [gitHistory, setGitHistory] = useState<SkillGitHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Sync from prop
  useEffect(() => {
    if (skill) {
      setDomains(skill.tags.domain.filter((d) => d !== "未分类"));
      setNotes(skill.notes);
      setDomainInput("");
      setFileTree(null);
      setFileTreeLoading(false);
      setSelectedFile(null);
      setFileContent(null);
      setFileContentLoading(false);
      setFileTreeError(null);
      setFileContentError(null);
      setActiveTab("overview");
      setGitHistory(null);
      setHistoryLoading(false);
      setHistoryError(null);
    }
  }, [skill]);

  const { patchTags, debouncedPatchNotes } =
    useSkillMutations({ skillName: skill?.name ?? null, onUpdated });

  // Handlers
  function addDomain(d: string) {
    const trimmed = d.trim();
    if (!trimmed || domains.includes(trimmed)) return;
    const next = [...domains, trimmed];
    setDomains(next);
    setDomainInput("");
    setShowDomainSuggestions(false);
    patchTags({ domain: next });
  }

  function removeDomain(d: string) {
    const next = domains.filter((x) => x !== d);
    setDomains(next);
    patchTags({ domain: next });
  }

  // All existing domains from the registry as suggestions
  const domainPool = useMemo(() => {
    return allDomains ? [...allDomains].sort() : [];
  }, [allDomains]);

  function handleDomainInputChange(val: string) {
    setDomainInput(val);
    const filtered = domainPool.filter(
      (s) => (!val.trim() || s.includes(val)) && !domains.includes(s),
    );
    setDomainSuggestions(filtered);
    setShowDomainSuggestions(filtered.length > 0);
  }

  function handleDomainKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDomain(domainInput);
    }
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    debouncedPatchNotes(value);
  }

  async function loadGitHistory() {
    if (!skill || historyLoading || gitHistory) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGitHistory(await res.json());
    } catch (err) {
      setHistoryError(String(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleTabChange(v: string) {
    setActiveTab(v);
    if (v === "timeline" && !gitHistory && !historyError) loadGitHistory();
  }

  async function loadFileContent(relativePath: string) {
    if (!skill) return;
    setSelectedFile(relativePath);
    setFileContentLoading(true);
    setFileContent(null);
    setFileContentError(null);
    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skill.name)}/content?file=${encodeURIComponent(relativePath)}`
      );
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
      } else {
        const data = await res.json().catch(() => ({}));
        setFileContentError(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setFileContentError(String(err));
    } finally {
      setFileContentLoading(false);
    }
  }

  function openFileInEditor(relativePath?: string) {
    if (!skill) return;
    fetch(`/api/skills/${encodeURIComponent(skill.name)}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relativePath ? { file: relativePath } : {}),
    });
  }

  // Auto-load file tree when panel opens
  useEffect(() => {
    if (!skill || !open) return;

    let cancelled = false;
    async function fetchTree() {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(skill!.name)}/files`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setFileTree(data.files);
        } else if (!cancelled) {
          const data = await res.json().catch(() => ({}));
          setFileTreeError(data.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        if (!cancelled) setFileTreeError(String(err));
      } finally {
        if (!cancelled) setFileTreeLoading(false);
      }
    }

    setFileTreeLoading(true);
    setFileTreeError(null);
    fetchTree();

    return () => { cancelled = true; };
  }, [skill, open]);

  if (!skill) return null;

  const isRouted = skill.claudeMdRefs.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-lg">
            {skillDisplayName(skill.name)}
            {isRouted ? (
              <span className="text-green-600 dark:text-green-400" title="Routed">
                &#10003;
              </span>
            ) : (
              <span className="text-red-500 dark:text-red-400" title="Orphan">
                &#10007;
              </span>
            )}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
              <Markdown>{cleanDescriptionFull(skill.description) || "无描述"}</Markdown>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">概览</TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1">时间线</TabsTrigger>
              <TabsTrigger value="upstream" className="flex-1">上游</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 pt-4">
          {/* Read-only info */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Info</h3>
            <div className="grid grid-cols-2 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Source</span>
              <span>{SOURCE_LABELS[skill.source] ?? skill.source}</span>
              <span className="text-muted-foreground">Lines</span>
              <span>{skill.lineCount}</span>
              <span className="text-muted-foreground">Created</span>
              <span>{skill.createdAt ? new Date(skill.createdAt).toLocaleDateString() : "—"}</span>
              <span className="text-muted-foreground">Modified</span>
              <span>{new Date(skill.lastModified).toLocaleDateString()}</span>
              <span className="text-muted-foreground">Path</span>
              <span className="flex items-center gap-1.5 break-all font-mono text-xs">
                <span className="flex-1">{skill.path}</span>
                <button
                  type="button"
                  onClick={() => {
                    fetch(`/api/skills/${encodeURIComponent(skill.name)}/open`, {
                      method: "POST",
                    });
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                  title="在 Finder 中打开"
                >
                  打开
                </button>
              </span>
            </div>
          </section>

          {/* CLAUDE.md References — always visible */}
          <Separator />
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              CLAUDE.md 路由
            </h3>
            {skill.claudeMdRefs.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-1.5 text-left font-medium">路由表</th>
                      <th className="px-3 py-1.5 text-left font-medium">触发词</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skill.claudeMdRefs.map((ref, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{ref.table}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {ref.trigger}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">
                未被 CLAUDE.md 路由表引用
              </p>
            )}
          </section>

          <Separator />

          {/* Editable: Domain Tags */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Domain Tags
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {domains.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 pr-1">
                  {d}
                  <button
                    onClick={() => removeDomain(d)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove ${d}`}
                  >
                    <span className="text-xs">&times;</span>
                  </button>
                </Badge>
              ))}
            </div>
            <div className="relative">
              <Input
                placeholder="Add domain tag..."
                value={domainInput}
                onChange={(e) => handleDomainInputChange(e.target.value)}
                onKeyDown={handleDomainKeyDown}
                onBlur={() =>
                  setTimeout(() => setShowDomainSuggestions(false), 150)
                }
                onFocus={() => {
                  const filtered = domainPool.filter(
                    (s) => (!domainInput.trim() || s.includes(domainInput)) && !domains.includes(s),
                  );
                  setDomainSuggestions(filtered);
                  setShowDomainSuggestions(filtered.length > 0);
                }}
                className="h-8 text-sm"
              />
              {showDomainSuggestions && domainSuggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                  {domainSuggestions.map((s) => (
                    <button
                      key={s}
                      className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addDomain(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Editable: Notes */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Notes
            </h3>
            <Textarea
              placeholder="Add notes about this skill..."
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </section>

          <Separator />

          {/* File Browser */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">文件结构</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openFileInEditor()}
                title="在 Finder 中打开目录"
              >
                打开目录
              </Button>
            </div>

            {fileTreeLoading && (
              <p className="text-sm text-muted-foreground">加载中...</p>
            )}

            {fileTreeError && (
              <p className="text-xs text-red-500">{fileTreeError}</p>
            )}

            {fileTree && fileTree.length > 0 && (
              <div className="rounded-md border bg-muted/20 p-2">
                <FileTreeView
                  nodes={fileTree}
                  selectedFile={selectedFile}
                  onSelectFile={loadFileContent}
                  onOpenFile={openFileInEditor}
                />
              </div>
            )}

            {fileTree && fileTree.length === 0 && (
              <p className="text-sm text-muted-foreground/60 italic">目录为空</p>
            )}

            {/* File content viewer */}
            {selectedFile && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-muted-foreground truncate">
                    {selectedFile}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 shrink-0 text-xs"
                    onClick={() => openFileInEditor(selectedFile)}
                  >
                    编辑
                  </Button>
                </div>
                {fileContentLoading ? (
                  <p className="text-sm text-muted-foreground">加载中...</p>
                ) : fileContentError ? (
                  <p className="text-xs text-red-500">{fileContentError}</p>
                ) : fileContent ? (
                  <pre className="max-h-[400px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5">
                    <code>{fileContent}</code>
                  </pre>
                ) : null}
              </div>
            )}
          </section>
            </TabsContent>

            <TabsContent value="timeline" className="pt-4">
              <TimelineTab history={gitHistory} loading={historyLoading} error={historyError} />
            </TabsContent>

            <TabsContent value="upstream" className="pt-4">
              <UpstreamTab skill={skill} onUpdated={onUpdated} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FileTreeView({
  nodes,
  selectedFile,
  onSelectFile,
  onOpenFile,
  depth = 0,
}: {
  nodes: FileNode[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onOpenFile: (path: string) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        if (node.type === "directory") {
          return (
            <div key={node.relativePath}>
              <div
                className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground"
                style={{ paddingLeft: `${depth * 16}px` }}
              >
                <span className="text-[10px]">📂</span>
                <span className="font-medium">{node.name}/</span>
              </div>
              {node.children && (
                <FileTreeView
                  nodes={node.children}
                  selectedFile={selectedFile}
                  onSelectFile={onSelectFile}
                  onOpenFile={onOpenFile}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        const isSelected = selectedFile === node.relativePath;
        const sizeStr = node.size != null
          ? node.size < 1024
            ? `${node.size}B`
            : `${(node.size / 1024).toFixed(1)}K`
          : "";

        return (
          <div
            key={node.relativePath}
            className={`group flex items-center gap-1.5 rounded-sm py-0.5 pr-1 text-xs cursor-pointer hover:bg-accent ${
              isSelected ? "bg-accent" : ""
            }`}
            style={{ paddingLeft: `${depth * 16}px` }}
            onClick={() => onSelectFile(node.relativePath)}
          >
            <span className="text-[10px]">📄</span>
            <span className={`flex-1 truncate ${isSelected ? "font-medium" : ""}`}>
              {node.name}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
              {sizeStr}
            </span>
            <button
              type="button"
              className="shrink-0 rounded px-1 py-0.5 text-[10px] text-blue-600 opacity-0 hover:bg-blue-50 group-hover:opacity-100 dark:text-blue-400 dark:hover:bg-blue-950"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile(node.relativePath);
              }}
              title="在编辑器中打开"
            >
              打开
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TimelineTab({ history, loading, error }: { history: SkillGitHistory | null; loading: boolean; error: string | null }) {
  if (loading) return <p className="text-sm text-muted-foreground">加载中...</p>;
  if (error) return <p className="text-xs text-red-500">{error}</p>;
  if (!history || history.totalCommits === 0) {
    return <p className="text-sm text-muted-foreground/60 italic">无 Git 历史记录</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{history.totalCommits} commits</span>
        <span>{history.contributors.join(", ")}</span>
        {history.hasUncommittedChanges && (
          <Badge variant="outline" className="text-[10px] text-amber-600">未提交改动</Badge>
        )}
      </div>
      <div className="relative border-l-2 border-muted pl-4 space-y-4">
        {history.timeline.map((commit, i) => (
          <div key={commit.sha} className="relative">
            <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background ${
              i === history.timeline.length - 1 ? "bg-green-500" : "bg-primary"
            }`} />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{commit.message}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <code className="font-mono">{commit.sha.slice(0, 7)}</code>
                <span>{commit.author}</span>
                <span>{new Date(commit.date).toLocaleDateString("zh-CN")}</span>
                {(commit.additions > 0 || commit.deletions > 0) && (
                  <span>
                    <span className="text-green-600">+{commit.additions}</span>
                    {" "}
                    <span className="text-red-500">-{commit.deletions}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MOD_LABELS: Record<ModificationType, { label: string; className: string }> = {
  bugfix: { label: "临时补丁", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  capability: { label: "核心能力", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  config: { label: "环境适配", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300" },
};

function UpstreamTab({ skill, onUpdated }: { skill: SkillEntry; onUpdated: () => void }) {
  const upstream = skill.upstream;
  const [updateInfo, setUpdateInfo] = useState<{ commitsAvailable: number; changelog: Array<{ sha: string; date: string; author: string; message: string }> } | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  // Check for updates when tab opens
  useEffect(() => {
    if (!upstream) return;
    let cancelled = false;

    async function checkUpdates() {
      setUpdateLoading(true);
      try {
        const res = await fetch("/api/upstream/check");
        if (res.ok && !cancelled) {
          const data = await res.json();
          // Find update info matching this skill's origin
          const match = data.updates?.find((u: any) =>
            upstream!.origin.includes(u.marketplace) ||
            upstream!.origin.includes(u.pluginName)
          );
          if (match) {
            setUpdateInfo({
              commitsAvailable: match.commitsAvailable,
              changelog: match.changelog,
            });
          }
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setUpdateLoading(false);
      }
    }

    checkUpdates();
    return () => { cancelled = true; };
  }, [upstream]);

  if (!upstream) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground/60 italic">原创技能，无上游来源</p>
        <p className="text-xs text-muted-foreground">
          如果此技能基于外部项目，可在详情中手动设置上游信息。
        </p>
      </div>
    );
  }

  const safeUrl = upstream.originUrl && (upstream.originUrl.startsWith("https://") || upstream.originUrl.startsWith("http://"))
    ? upstream.originUrl
    : null;

  async function markReconciled() {
    await fetch(`/api/skills/${encodeURIComponent(skill.name)}/upstream`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastReconciled: new Date().toISOString() }),
    });
    onUpdated();
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">上游来源</h3>
        <div className="grid grid-cols-2 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">来源</span>
          <span className="font-mono text-xs">{upstream.origin}</span>
          {safeUrl && (
            <>
              <span className="text-muted-foreground">URL</span>
              <a href={safeUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                {safeUrl}
              </a>
            </>
          )}
          <span className="text-muted-foreground">状态</span>
          <span>
            {upstream.status === "modified" ? "🔀 已修改" :
             upstream.status === "following" ? "📌 跟随上游" : "— 原创"}
          </span>
          <span className="text-muted-foreground">上次对账</span>
          <span className="flex items-center gap-2">
            {upstream.lastReconciled
              ? new Date(upstream.lastReconciled).toLocaleDateString("zh-CN")
              : "从未对账"}
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={markReconciled}>
              标记已对账
            </Button>
          </span>
        </div>
      </section>

      {/* Update status */}
      {updateLoading && (
        <p className="text-xs text-muted-foreground">检查更新中...</p>
      )}

      {updateInfo && updateInfo.commitsAvailable > 0 && (
        <section className="space-y-2">
          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">可用更新</h3>
            <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400">
              {updateInfo.commitsAvailable} 个新提交
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full justify-start text-xs"
            onClick={() => setShowChangelog(!showChangelog)}
          >
            {showChangelog ? "▼ 收起变更日志" : "▶ 查看变更日志"}
          </Button>
          {showChangelog && (
            <div className="max-h-[200px] overflow-auto rounded-md border bg-muted/20 p-2 space-y-1.5">
              {updateInfo.changelog.map((c) => (
                <div key={c.sha} className="text-xs">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-muted-foreground">{c.sha.slice(0, 7)}</code>
                    <span className="flex-1 truncate">{c.message}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground/60">
                    <span>{c.author}</span>
                    <span>{new Date(c.date).toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {updateInfo && updateInfo.commitsAvailable === 0 && (
        <p className="text-xs text-green-600 dark:text-green-400">✓ 已是最新版本</p>
      )}

      {upstream.modifications.length > 0 && (
        <section className="space-y-2">
          <Separator />
          <h3 className="text-sm font-semibold text-muted-foreground">本地修改</h3>
          <div className="space-y-2">
            {upstream.modifications.map((mod, i) => (
              <div key={`${mod.file}-${mod.type}-${i}`} className="flex items-start gap-2 text-sm">
                <Badge variant="outline" className={`shrink-0 text-[10px] ${MOD_LABELS[mod.type].className}`}>
                  {MOD_LABELS[mod.type].label}
                </Badge>
                <div>
                  <p>{mod.summary}</p>
                  <p className="font-mono text-xs text-muted-foreground">{mod.file}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
