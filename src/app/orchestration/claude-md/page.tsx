"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import {
  ReactFlow,
  Controls,
  Background,
  Handle,
  Position,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useScope } from "@/contexts/scope-context";
import type { ProjectInfo } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface TocItem {
  level: number;
  text: string;
  lineNumber: number;
}

interface ParsedRoute {
  tableName: string;
  entries: Array<{ intent: string; skill: string; triggers: string }>;
}

interface AiFlowNode {
  skillName: string;
  label: string;
  x: number;
  y: number;
  group: string;
}

interface AiFlowEdge {
  source: string;
  target: string;
  label: string;
}

interface AiFlowData {
  nodes: AiFlowNode[];
  edges: AiFlowEdge[];
  workflows: Array<{ name: string; skills: string[] }>;
  summary: string;
}

interface FlowSnapshotMeta {
  id: string;
  gitSha: string;
  gitMessage: string;
  timestamp: string;
  summary: string;
  nodeCount: number;
  edgeCount: number;
}

// ---------------------------------------------------------------------------
// React Flow Custom Nodes (must be outside component)
// ---------------------------------------------------------------------------

function RootFlowNode({ data }: { data: { label: string; count: number } }) {
  return (
    <div className="rounded-xl bg-primary px-6 py-3 text-center shadow-lg">
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-primary !border-primary-foreground" />
      <div className="text-sm font-bold text-primary-foreground">{data.label}</div>
      <div className="text-xs text-primary-foreground/70">{data.count} 个路由表</div>
    </div>
  );
}

function CategoryFlowNode({ data }: { data: { label: string; count: number } }) {
  return (
    <div className="min-w-[130px] rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-2 text-center shadow dark:border-blue-700 dark:bg-blue-950/50">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-blue-500 !border-blue-200" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-blue-500 !border-blue-200" />
      <div className="text-xs font-semibold text-blue-900 dark:text-blue-200">{data.label}</div>
      <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70">{data.count} 条路由</div>
    </div>
  );
}

function SkillFlowNode({ data }: { data: { label: string; intent: string } }) {
  return (
    <div className="max-w-[220px] rounded-md border bg-card px-3 py-1.5 shadow-sm">
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-emerald-500 !border-emerald-200" />
      <code className="block truncate text-[11px] font-medium">{data.label}</code>
      {data.intent && (
        <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{data.intent}</div>
      )}
    </div>
  );
}

function AiSkillFlowNode({ data }: { data: { label: string; group: string } }) {
  return (
    <div className="max-w-[200px] rounded-lg border-2 border-purple-300 bg-purple-50 px-3 py-2 shadow-sm dark:border-purple-700 dark:bg-purple-950/50">
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-purple-500 !border-purple-200" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-purple-500 !border-purple-200" />
      <code className="block truncate text-[11px] font-semibold text-purple-900 dark:text-purple-200">{data.label}</code>
      <div className="mt-0.5 truncate text-[9px] text-purple-600/70 dark:text-purple-400/70">{data.group}</div>
    </div>
  );
}

function AiGroupLabelNode({ data }: { data: { label: string; count: number } }) {
  return (
    <div className="rounded-xl bg-purple-600 px-5 py-2 text-center shadow-lg dark:bg-purple-800">
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-purple-400 !border-purple-200" />
      <div className="text-xs font-bold text-white">{data.label}</div>
      <div className="text-[10px] text-purple-200">{data.count} 个 Skill</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flowNodeTypes: NodeTypes = {
  rootNode: RootFlowNode,
  categoryNode: CategoryFlowNode,
  skillNode: SkillFlowNode,
  aiSkillNode: AiSkillFlowNode,
  aiGroupNode: AiGroupLabelNode,
} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRouteTables(content: string): ParsedRoute[] {
  const lines = content.split("\n");
  const tables: ParsedRoute[] = [];
  let currentTable: ParsedRoute | null = null;
  let inTable = false;
  let headerPassed = false;

  for (const line of lines) {
    if (line.startsWith("## ") && (line.includes("路由") || line.includes("Skill"))) {
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

    if (line.startsWith("|")) {
      if (line.includes("---")) {
        headerPassed = true;
        inTable = true;
        continue;
      }
      if (line.includes("用户意图") || line.includes("触发词")) continue;
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
      currentTable = null;
      inTable = false;
      headerPassed = false;
    }
  }

  return tables;
}

function cleanHeadingText(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .trim();
}

function tocSlug(text: string): string {
  return cleanHeadingText(text).replace(/\s+/g, "-");
}

/** Extract text from React node tree (handles nested elements) */
function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node == null) return "";
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  // React element with props.children
  const el = node as unknown as Record<string, unknown>;
  if (typeof el === "object" && el !== null && el.props) {
    return getNodeText((el.props as Record<string, unknown>).children as React.ReactNode);
  }
  return "";
}

function buildTocFromContent(content: string): TocItem[] {
  const items: TocItem[] = [];
  content.split("\n").forEach((line, idx) => {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      const text = cleanHeadingText(match[2]);
      if (text) items.push({ level: match[1].length, text, lineNumber: idx + 1 });
    }
  });
  return items;
}

function buildFlowElements(routeTables: ParsedRoute[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const CATEGORY_X = 400;
  const SKILL_X = 880;
  const ENTRY_HEIGHT = 50;
  const CATEGORY_GAP = 40;

  let currentY = 0;

  routeTables.forEach((table, catIdx) => {
    const catId = `cat-${catIdx}`;
    const entryStartY = currentY;

    table.entries.forEach((entry, entryIdx) => {
      const skillId = `skill-${catIdx}-${entryIdx}`;
      nodes.push({
        id: skillId,
        type: "skillNode",
        data: { label: entry.skill, intent: entry.intent },
        position: { x: SKILL_X, y: currentY },
      });
      edges.push({
        id: `e-${catId}-${skillId}`,
        source: catId,
        target: skillId,
        type: "smoothstep",
        style: { stroke: "#94a3b8", strokeWidth: 1 },
      });
      currentY += ENTRY_HEIGHT;
    });

    if (table.entries.length === 0) currentY += ENTRY_HEIGHT;

    const catCenterY = table.entries.length > 0
      ? entryStartY + ((table.entries.length - 1) * ENTRY_HEIGHT) / 2
      : entryStartY;

    nodes.push({
      id: catId,
      type: "categoryNode",
      data: { label: table.tableName, count: table.entries.length },
      position: { x: CATEGORY_X, y: catCenterY },
    });

    edges.push({
      id: `e-root-${catId}`,
      source: "root",
      target: catId,
      type: "smoothstep",
      style: { stroke: "#3b82f6", strokeWidth: 2 },
    });

    currentY += CATEGORY_GAP;
  });

  const totalHeight = currentY > 0 ? currentY - CATEGORY_GAP : 0;

  nodes.push({
    id: "root",
    type: "rootNode",
    data: { label: "CLAUDE.md", count: routeTables.length },
    position: { x: 0, y: totalHeight / 2 },
  });

  return { nodes, edges };
}

function buildAiFlowElements(data: AiFlowData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Group nodes by workflow
  const groups = new Map<string, AiFlowNode[]>();
  for (const n of data.nodes) {
    const g = n.group || "未分组";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(n);
  }

  // Add group label nodes on the left
  let groupIdx = 0;
  for (const [groupName, groupNodes] of groups) {
    const minY = Math.min(...groupNodes.map((n) => n.y));
    const maxY = Math.max(...groupNodes.map((n) => n.y));
    const centerY = (minY + maxY) / 2;

    const groupId = `group-${groupIdx}`;
    nodes.push({
      id: groupId,
      type: "aiGroupNode",
      data: { label: groupName, count: groupNodes.length },
      position: { x: groupNodes[0].x - 280, y: centerY },
    });

    // Connect group → first skill in that group
    edges.push({
      id: `e-${groupId}-${groupNodes[0].skillName}`,
      source: groupId,
      target: groupNodes[0].skillName,
      type: "smoothstep",
      style: { stroke: "#a855f7", strokeWidth: 2 },
    });

    groupIdx++;
  }

  // Add skill nodes
  for (const n of data.nodes) {
    nodes.push({
      id: n.skillName,
      type: "aiSkillNode",
      data: { label: n.label, group: n.group },
      position: { x: n.x, y: n.y },
    });
  }

  // Add edges
  for (const e of data.edges) {
    edges.push({
      id: `e-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      label: e.label,
      style: { stroke: "#8b5cf6", strokeWidth: 1.5 },
      labelStyle: { fontSize: 10, fill: "#7c3aed" },
    });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ClaudeMdPage() {
  const { scope, projectPath: scopeProjectPath } = useScope();

  // File list for multi-file mode
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  // null = global CLAUDE.md, string = project path
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Data states
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [history, setHistory] = useState<HistoryCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredSha, setHoveredSha] = useState<string | null>(null);

  // Diff
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, string>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Record<string, boolean>>({});

  // Uncommitted changes
  const [hasUncommitted, setHasUncommitted] = useState(false);
  const [diffPreview, setDiffPreview] = useState("");
  const [uncommittedDiff, setUncommittedDiff] = useState("");
  const [showUncommittedDiff, setShowUncommittedDiff] = useState(false);
  const [copied, setCopied] = useState(false);

  // Tab + view mode
  type MainTab = "doc" | "routes" | "flow";
  const [activeTab, setActiveTab] = useState<MainTab>("doc");
  const [docViewMode, setDocViewMode] = useState<"rendered" | "source">("rendered");

  // AI analysis
  const [routeAiReport, setRouteAiReport] = useState<string | null>(null);
  const [routeAiLoading, setRouteAiLoading] = useState(false);
  const [aiFlowData, setAiFlowData] = useState<AiFlowData | null>(null);
  const [aiFlowError, setAiFlowError] = useState<string | null>(null);
  const [flowAiLoading, setFlowAiLoading] = useState(false);
  type FlowSource = "parsed" | "ai" | "snapshot";
  const [flowSource, setFlowSource] = useState<FlowSource>("parsed");
  const [snapshots, setSnapshots] = useState<FlowSnapshotMeta[]>([]);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // Version notes
  const [versionNotes, setVersionNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  // Version tags (stable / experiment)
  const [versionTags, setVersionTags] = useState<Record<string, string>>({});

  // Version browsing
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [selectedVersionContent, setSelectedVersionContent] = useState("");
  const [loadingVersion, setLoadingVersion] = useState(false);

  // Sidebar
  const [showHistory, setShowHistory] = useState(true);

  // TOC & scroll
  const [activeTocLine, setActiveTocLine] = useState<number | null>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const renderedDocRef = useRef<HTMLDivElement>(null);

  // Fetch projects list
  useEffect(() => {
    fetch("/api/projects")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.projects) setProjects(data.projects); })
      .catch(() => {});
  }, []);

  // Sync activeFile with scope changes
  useEffect(() => {
    if (scope === "global") {
      setActiveFile(null);
    } else if (scope.startsWith("project:") || scope.startsWith("combined:")) {
      // Project scope: default to project-level CLAUDE.md (not global)
      setActiveFile(scopeProjectPath);
    } else if (scope === "all") {
      // All scope: default to global CLAUDE.md
      setActiveFile(null);
    }
  }, [scope, scopeProjectPath]);

  // Build the project param for API calls
  const projectParam = activeFile ? `project=${encodeURIComponent(activeFile)}` : "";

  // --- Data fetching ---
  const fetchAll = useCallback(async () => {
    const pp = activeFile ? `?project=${encodeURIComponent(activeFile)}` : "";
    try {
      const [blameRes, historyRes, statusRes, notesRes] = await Promise.all([
        fetch(`/api/claude-md/blame${pp}`),
        fetch(`/api/claude-md/history${pp}`),
        fetch(`/api/claude-md/status${pp}`),
        fetch("/api/claude-md/notes"),
      ]);

      if (blameRes.ok) {
        const data = await blameRes.json();
        setBlameLines(data.lines);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.commits);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        setHasUncommitted(data.hasUncommittedChanges);
        setDiffPreview(data.diffPreview);
        setUncommittedDiff(data.diff ?? "");
      }
      if (notesRes.ok) {
        const data = await notesRes.json();
        setVersionNotes(data.notes);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [activeFile]);

  useEffect(() => {
    setLoading(true);
    setSelectedVersion(null);
    setExpandedDiffs({});
    fetchAll();
  }, [fetchAll]);

  // --- Version tags ---
  useEffect(() => {
    fetch("/api/claude-md/version-tag")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.tags) setVersionTags(data.tags); })
      .catch(() => {});
  }, []);

  // --- Version loading ---
  async function loadVersion(sha: string) {
    if (selectedVersion === sha) {
      setSelectedVersion(null);
      return;
    }
    setLoadingVersion(true);
    try {
      const res = await fetch(`/api/claude-md/version?sha=${sha}${projectParam ? `&${projectParam}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedVersionContent(data.content);
        setSelectedVersion(sha);
        setDocViewMode("rendered"); // 历史版本仅支持渲染模式
        renderedDocRef.current?.scrollTo(0, 0);
      }
    } catch { /* ignore */ } finally {
      setLoadingVersion(false);
    }
  }

  // --- Derived data ---
  const shaMessages = useMemo(() => {
    const map: Record<string, string> = {};
    history.forEach((c) => { map[c.sha] = c.message; });
    return map;
  }, [history]);

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

  const currentContent = useMemo(
    () => blameLines.map((l) => l.content).join("\n"),
    [blameLines],
  );

  const activeContent = selectedVersion ? selectedVersionContent : currentContent;
  const toc = useMemo(() => buildTocFromContent(activeContent), [activeContent]);
  const routeTables = useMemo(() => parseRouteTables(activeContent), [activeContent]);
  const { nodes: parsedFlowNodes, edges: parsedFlowEdges } = useMemo(
    () => buildFlowElements(routeTables),
    [routeTables],
  );
  const { nodes: aiFlowNodes, edges: aiFlowEdges } = useMemo(
    () => (aiFlowData ? buildAiFlowElements(aiFlowData) : { nodes: [], edges: [] }),
    [aiFlowData],
  );

  // Active flow nodes/edges based on source
  const flowNodes = flowSource === "parsed" ? parsedFlowNodes : aiFlowNodes;
  const flowEdges = flowSource === "parsed" ? parsedFlowEdges : aiFlowEdges;

  // Load snapshots list
  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/flow-snapshots");
      if (res.ok) setSnapshots(await res.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  // --- Actions ---
  async function loadDiff(sha: string) {
    if (expandedDiffs[sha] !== undefined) {
      setExpandedDiffs((prev) => {
        const next = { ...prev };
        delete next[sha];
        return next;
      });
      return;
    }
    setLoadingDiffs((prev) => ({ ...prev, [sha]: true }));
    try {
      const res = await fetch(`/api/claude-md/diff?sha=${sha}${projectParam ? `&${projectParam}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedDiffs((prev) => ({ ...prev, [sha]: data.diff }));
      }
    } catch { /* ignore */ } finally {
      setLoadingDiffs((prev) => ({ ...prev, [sha]: false }));
    }
  }

  function copyCommitCommand() {
    const cmd = `cd ~/.claude && git add CLAUDE.md && git commit -m "update: CLAUDE.md"`;
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function saveNote(sha: string) {
    try {
      await fetch("/api/claude-md/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha, note: noteInput.trim() }),
      });
      if (noteInput.trim()) {
        setVersionNotes((prev) => ({ ...prev, [sha]: noteInput.trim() }));
      } else {
        setVersionNotes((prev) => {
          const next = { ...prev };
          delete next[sha];
          return next;
        });
      }
    } catch { /* ignore */ }
    setEditingNote(null);
    setNoteInput("");
  }

  async function toggleVersionTag(sha: string, currentTag: string | undefined) {
    // Cycle: none → stable → experiment → none
    let nextTag: string | null;
    if (!currentTag) nextTag = "stable";
    else if (currentTag === "stable") nextTag = "experiment";
    else nextTag = null;

    const res = await fetch("/api/claude-md/version-tag", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha, tag: nextTag }),
    });
    if (res.ok) {
      const data = await res.json();
      setVersionTags(data.tags);
    }
  }

  async function restoreVersion(sha: string) {
    if (!confirm("确定要将 CLAUDE.md 恢复到这个版本吗？当前内容会被覆盖。")) return;
    const res = await fetch("/api/claude-md/restore", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha }),
    });
    if (res.ok) {
      await fetchAll();
    }
  }

  function scrollToTocItem(item: TocItem) {
    if (activeTab !== "doc") setActiveTab("doc");
    setActiveTocLine(item.lineNumber);

    if (docViewMode === "source" && !selectedVersion) {
      // 溯源模式：使用行号 ref 定位
      const el = lineRefs.current[item.lineNumber];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
      }
    } else {
      // 渲染模式：使用 heading ID 定位
      const slug = tocSlug(item.text);
      const el = document.getElementById(slug);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary", "rounded");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "rounded"), 1500);
      }
    }
  }

  // Custom heading components for ReactMarkdown (adds IDs for TOC scrolling)
  const markdownHeadingComponents = useMemo(() => ({
    h1: ({ node, children, ...props }: any) => (
      <h1 id={tocSlug(getNodeText(children))} {...props}>{children}</h1>
    ),
    h2: ({ node, children, ...props }: any) => (
      <h2 id={tocSlug(getNodeText(children))} {...props}>{children}</h2>
    ),
    h3: ({ node, children, ...props }: any) => (
      <h3 id={tocSlug(getNodeText(children))} {...props}>{children}</h3>
    ),
  }), []);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">加载 CLAUDE.md 数据...</p>
      </div>
    );
  }

  const selectedCommit = selectedVersion
    ? history.find(c => c.sha === selectedVersion)
    : null;

  return (
    <div className="flex gap-6 px-4 py-6 sm:px-6">
      {/* ========== Left Sidebar: 文件 + 历史版本 + 目录 ========== */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-20 flex max-h-[calc(100vh-100px)] flex-col gap-4">

          {/* ---- 文件列表 (multi-file mode) ---- */}
          {(() => {
            // Determine which files to show based on scope
            const files: Array<{ label: string; projectPath: string | null; hasMd: boolean }> = [];

            if (scope === "all") {
              // All scope: show global + all projects
              files.push({ label: "全局 CLAUDE.md", projectPath: null, hasMd: true });
              for (const p of projects.filter(pr => pr.hasClaudeMd)) {
                files.push({ label: `${p.name}/CLAUDE.md`, projectPath: p.path, hasMd: true });
              }
            } else if (scope.startsWith("project:") || scope.startsWith("combined:")) {
              // Project scope: show project CLAUDE.md + global for easy switching
              const proj = projects.find(p => p.path === scopeProjectPath);
              if (proj?.hasClaudeMd) {
                files.push({ label: `${proj.name}/CLAUDE.md`, projectPath: proj.path, hasMd: true });
              }
              files.push({ label: "全局 CLAUDE.md", projectPath: null, hasMd: true });
            }

            if (files.length < 2) return null;
            return (
              <div className="shrink-0">
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">文件</p>
                <div className="max-h-[160px] overflow-y-auto rounded-md border">
                  {files.map((f) => {
                    const isActive = activeFile === f.projectPath;
                    return (
                      <button
                        key={f.projectPath ?? "__global__"}
                        type="button"
                        onClick={() => setActiveFile(f.projectPath)}
                        className={`flex w-full items-center gap-1.5 border-b px-2 py-1.5 text-left text-xs transition-colors last:border-0 ${
                          isActive ? "bg-primary/10 font-medium text-primary" : "hover:bg-accent/50"
                        }`}
                      >
                        {isActive && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                        <span className="truncate">{f.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ---- 历史版本 ---- */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent"
            >
              <span>历史版本 ({history.length})</span>
              <svg className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showHistory && (
              <div className="mt-1 max-h-[320px] overflow-y-auto rounded-md border">
                {/* 当前版本 */}
                <button
                  type="button"
                  onClick={() => setSelectedVersion(null)}
                  className={`flex w-full items-center gap-2 border-b px-2 py-2 text-left text-xs transition-colors ${
                    !selectedVersion
                      ? "bg-primary/10 font-medium text-primary"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  <span>当前版本</span>
                  {hasUncommitted && (
                    <span className="text-[10px] text-amber-500">· 有变更</span>
                  )}
                </button>

                {/* 历史版本列表 */}
                {history.slice(0, 30).map((commit) => {
                  const isActive = selectedVersion === commit.sha;
                  return (
                    <div key={commit.sha} className="border-b last:border-0">
                      <button
                        type="button"
                        onClick={() => loadVersion(commit.sha)}
                        className={`w-full px-2 py-1.5 text-left transition-colors ${
                          isActive ? "bg-accent" : "hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <code className="text-[10px] text-muted-foreground">{commit.sha}</code>
                          <span className="text-[10px] text-muted-foreground/60">
                            {new Date(commit.date).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px]">{commit.message}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {versionTags[commit.sha] === "stable" && (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                              正式版
                            </span>
                          )}
                          {versionTags[commit.sha] === "experiment" && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              实验版
                            </span>
                          )}
                          {versionNotes[commit.sha] && (
                            <Badge variant="secondary" className="text-[9px]">
                              {versionNotes[commit.sha]}
                            </Badge>
                          )}
                        </div>
                      </button>

                      {/* 选中版本的操作区 */}
                      {isActive && (
                        <div className="space-y-1.5 border-t bg-accent/30 px-2 py-2">
                          {loadingVersion && (
                            <p className="text-[10px] text-muted-foreground">加载中...</p>
                          )}
                          {/* 备注编辑 */}
                          {editingNote === commit.sha ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="版本备注..."
                                value={noteInput}
                                onChange={(e) => setNoteInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveNote(commit.sha);
                                  if (e.key === "Escape") { setEditingNote(null); setNoteInput(""); }
                                }}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => saveNote(commit.sha)}
                                className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground"
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingNote(commit.sha); setNoteInput(versionNotes[commit.sha] ?? ""); }}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              {versionNotes[commit.sha] ? "编辑备注" : "+ 添加备注"}
                            </button>
                          )}
                          {/* 版本标记 + 恢复 */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleVersionTag(commit.sha, versionTags[commit.sha]); }}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              {!versionTags[commit.sha] && "标记为正式版"}
                              {versionTags[commit.sha] === "stable" && "切换为实验版"}
                              {versionTags[commit.sha] === "experiment" && "移除标记"}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); restoreVersion(commit.sha); }}
                              className="rounded border px-1.5 py-0.5 text-[10px] text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30"
                            >
                              恢复
                            </button>
                          </div>
                          {/* 查看变更 */}
                          <button
                            type="button"
                            onClick={() => loadDiff(commit.sha)}
                            className="text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            {loadingDiffs[commit.sha] ? "加载..." : expandedDiffs[commit.sha] !== undefined ? "收起变更" : "查看变更"}
                          </button>
                          {expandedDiffs[commit.sha] !== undefined && (
                            <DiffViewer diff={expandedDiffs[commit.sha]} compact />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- 目录 ---- */}
          <div className="min-h-0 flex-1">
            <h3 className="mb-2 px-2 text-sm font-semibold text-muted-foreground">
              目录
              {selectedVersion && (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">
                  (版本 {selectedVersion?.slice(0, 7)})
                </span>
              )}
            </h3>
            <nav className="max-h-[calc(100vh-500px)] space-y-0.5 overflow-y-auto pr-1">
              {toc.map((item) => (
                <button
                  key={`${item.lineNumber}-${item.text}`}
                  type="button"
                  onClick={() => scrollToTocItem(item)}
                  className={`block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent ${
                    activeTocLine === item.lineNumber
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground"
                  }`}
                  style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                  title={item.text}
                >
                  {item.text}
                </button>
              ))}
              {toc.length === 0 && (
                <p className="px-2 text-[11px] italic text-muted-foreground/40">无标题</p>
              )}
            </nav>
          </div>
        </div>
      </aside>

      {/* ========== Main Content ========== */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              CLAUDE.md
              {selectedCommit && (
                <span className="ml-3 text-sm font-normal text-muted-foreground">
                  版本 {selectedCommit.sha} · {new Date(selectedCommit.date).toLocaleDateString("zh-CN")}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedVersion
                ? `历史版本 · ${selectedCommit?.message ?? ""}`
                : (
                  <>
                    共 {blameLines.length} 行 · {history.length} 次提交
                    {history[0] && (
                      <> · 最后修改: {new Date(history[0].date).toLocaleDateString("zh-CN")}</>
                    )}
                  </>
                )
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedVersion && (
              <button
                type="button"
                onClick={() => setSelectedVersion(null)}
                className="cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                返回当前版本
              </button>
            )}
          </div>
        </div>

        {/* Uncommitted changes banner */}
        {!selectedVersion && hasUncommitted && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white dark:bg-amber-600">!</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">有未提交的变更</p>
                {diffPreview && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{diffPreview}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setShowUncommittedDiff(!showUncommittedDiff)}
                  className="cursor-pointer rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                >
                  {showUncommittedDiff ? "收起 diff" : "查看 diff"}
                </button>
                <button
                  type="button"
                  onClick={copyCommitCommand}
                  className="cursor-pointer rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  {copied ? "已复制!" : "复制提交命令"}
                </button>
              </div>
            </div>
            {showUncommittedDiff && uncommittedDiff && (
              <DiffViewer diff={uncommittedDiff} />
            )}
          </div>
        )}

        {/* ===== Tab Bar ===== */}
        <div className="flex items-center gap-1 border-b">
          {([
            { key: "doc" as MainTab, label: "原文档" },
            { key: "routes" as MainTab, label: "路由结构分析" },
            { key: "flow" as MainTab, label: "软编排分析" },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== Tab: 原文档 ===== */}
        {activeTab === "doc" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">
                  {docViewMode === "rendered" ? "渲染视图" : "溯源视图"}
                </CardTitle>
                <CardDescription>
                  {docViewMode === "rendered"
                    ? "Markdown 渲染效果，点击左侧目录可跳转"
                    : "逐行显示修改者和提交来源，悬停查看详情"}
                </CardDescription>
              </div>
              {/* 渲染 / 溯源 切换（仅当前版本可切换） */}
              {!selectedVersion && (
                <div className="flex rounded-md border text-xs">
                  <button
                    type="button"
                    onClick={() => setDocViewMode("rendered")}
                    className={`cursor-pointer px-3 py-1.5 transition-colors ${
                      docViewMode === "rendered" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    渲染
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocViewMode("source")}
                    className={`cursor-pointer border-l px-3 py-1.5 transition-colors ${
                      docViewMode === "source" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    溯源
                  </button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {docViewMode === "rendered" || selectedVersion ? (
                /* 渲染视图 */
                <div ref={renderedDocRef} className="max-h-[calc(100vh-340px)] overflow-y-auto px-6 py-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-code:text-[11px] prose-code:before:content-none prose-code:after:content-none">
                    <ReactMarkdown components={markdownHeadingComponents}>
                      {activeContent}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                /* 溯源视图 */
                <TooltipProvider delayDuration={200}>
                  <div className="max-h-[calc(100vh-340px)] overflow-auto font-mono text-xs">
                    {blameLines.map((line) => (
                      <Tooltip key={line.lineNumber}>
                        <TooltipTrigger asChild>
                          <div
                            ref={(el) => { lineRefs.current[line.lineNumber] = el; }}
                            className={`flex border-b border-muted/30 transition-all hover:brightness-95 dark:hover:brightness-110 ${
                              hoveredSha === line.sha ? "ring-1 ring-primary/30" : ""
                            } ${shaColors[line.sha] ?? ""}`}
                            onMouseEnter={() => setHoveredSha(line.sha)}
                            onMouseLeave={() => setHoveredSha(null)}
                          >
                            <span className="w-10 shrink-0 select-none px-1.5 py-0.5 text-right text-muted-foreground/40">
                              {line.lineNumber}
                            </span>
                            <span className="w-16 shrink-0 truncate px-1 py-0.5 text-muted-foreground/60">
                              {line.sha}
                            </span>
                            <span className="flex-1 whitespace-pre-wrap break-all px-1.5 py-0.5">
                              {line.content || "\u00A0"}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-md">
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-primary">{line.sha}</code>
                              <span className="text-muted-foreground">{line.author}</span>
                              <span className="text-muted-foreground">{new Date(line.date).toLocaleDateString("zh-CN")}</span>
                            </div>
                            {shaMessages[line.sha] && (
                              <p className="font-sans font-medium">{shaMessages[line.sha]}</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== Tab: 路由结构分析 ===== */}
        {activeTab === "routes" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">路由结构分析</CardTitle>
                <CardDescription>
                  解析出 {routeTables.length} 个路由表，共 {routeTables.reduce((sum, t) => sum + t.entries.length, 0)} 条路由规则
                  {selectedVersion && <> · 版本 {selectedVersion}</>}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={routeAiLoading}
                onClick={async () => {
                  setRouteAiLoading(true);
                  setRouteAiReport(null);
                  try {
                    const res = await fetch("/api/ai/route-analysis", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ routeTables }),
                    });
                    const data = await res.json();
                    if (data.error) setRouteAiReport(`**错误：** ${data.error}`);
                    else setRouteAiReport(data.report);
                  } catch {
                    setRouteAiReport("**错误：** 请求失败");
                  } finally {
                    setRouteAiLoading(false);
                  }
                }}
              >
                {routeAiLoading ? "分析中..." : "AI 分析路由质量"}
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-340px)] space-y-4 overflow-y-auto">
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
                          <tr key={j} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-2 py-1.5">{entry.intent}</td>
                            <td className="px-2 py-1.5">
                              <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                {entry.skill}
                              </code>
                            </td>
                            <td className="max-w-[300px] px-2 py-1.5 text-muted-foreground">
                              {entry.triggers}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {routeTables.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground/60 italic">
                  未检测到路由表结构
                </p>
              )}

              {/* AI 分析报告 */}
              {routeAiReport && (
                <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                  <h4 className="mb-3 text-sm font-semibold text-blue-900 dark:text-blue-200">AI 路由质量分析</h4>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown>{routeAiReport}</ReactMarkdown>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== Tab: 软编排分析 ===== */}
        {activeTab === "flow" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">软编排分析</CardTitle>
                  <CardDescription>
                    {flowSource === "parsed" && "代码解析 CLAUDE.md 路由结构"}
                    {flowSource === "ai" && "AI 生成的编排分析"}
                    {flowSource === "snapshot" && "快照回放"}
                    {selectedVersion && <> · 版本 {selectedVersion}</>}
                    {aiFlowData && flowSource === "ai" && (
                      <> · {aiFlowData.summary}</>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Source toggle */}
                  <div className="flex rounded-md border text-xs">
                    <button
                      className={`px-2.5 py-1 rounded-l-md transition-colors ${flowSource === "parsed" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      onClick={() => setFlowSource("parsed")}
                    >
                      代码解析
                    </button>
                    <button
                      className={`px-2.5 py-1 border-l transition-colors ${flowSource === "ai" ? "bg-purple-600 text-white" : "hover:bg-muted"}`}
                      onClick={() => { if (aiFlowData) setFlowSource("ai"); }}
                      disabled={!aiFlowData}
                      title={aiFlowData ? "查看 AI 分析结果" : "先运行 AI 分析"}
                    >
                      AI 分析
                    </button>
                    <button
                      className={`px-2.5 py-1 rounded-r-md border-l transition-colors ${flowSource === "snapshot" ? "bg-orange-600 text-white" : "hover:bg-muted"}`}
                      onClick={() => { if (snapshots.length > 0) setFlowSource("snapshot"); }}
                      disabled={snapshots.length === 0}
                      title={snapshots.length > 0 ? "查看历史快照" : "暂无快照"}
                    >
                      快照{snapshots.length > 0 && ` (${snapshots.length})`}
                    </button>
                  </div>

                  {/* AI analyze button */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={flowAiLoading}
                    onClick={async () => {
                      setFlowAiLoading(true);
                      setAiFlowData(null);
                      setAiFlowError(null);
                      try {
                        const res = await fetch("/api/ai/orchestration-analysis", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ routeTables }),
                        });
                        const data = await res.json();
                        if (data.error) {
                          setAiFlowError(data.error);
                        } else {
                          setAiFlowData(data.flowData);
                          setFlowSource("ai");
                        }
                      } catch {
                        setAiFlowError("请求失败");
                      } finally {
                        setFlowAiLoading(false);
                      }
                    }}
                  >
                    {flowAiLoading ? "分析中..." : "AI 编排分析"}
                  </Button>

                  {/* Save snapshot button (only when AI data is available) */}
                  {aiFlowData && flowSource === "ai" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={savingSnapshot}
                      onClick={async () => {
                        setSavingSnapshot(true);
                        try {
                          await fetch("/api/ai/flow-snapshots", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(aiFlowData),
                          });
                          await fetchSnapshots();
                        } catch { /* ignore */ }
                        finally { setSavingSnapshot(false); }
                      }}
                    >
                      {savingSnapshot ? "保存中..." : "保存快照"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Snapshot list (when in snapshot mode) */}
              {flowSource === "snapshot" && snapshots.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {snapshots.map((s) => (
                    <button
                      key={s.id}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted transition-colors"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/ai/flow-snapshots/${s.id}`);
                          if (res.ok) {
                            const snap = await res.json();
                            setAiFlowData({ nodes: snap.nodes, edges: snap.edges, workflows: snap.workflows, summary: snap.summary });
                          }
                        } catch { /* ignore */ }
                      }}
                    >
                      <span className="font-mono text-muted-foreground">{s.gitSha}</span>
                      <span className="ml-1">{s.summary.slice(0, 30)}</span>
                      <span className="ml-1 text-muted-foreground">{new Date(s.timestamp).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Error display */}
              {aiFlowError && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                  {aiFlowError}
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {flowNodes.length > 0 ? (
                <div className="h-[calc(100vh-340px)] w-full">
                  <ReactFlow
                    key={`${flowSource}-${selectedVersion || "current"}`}
                    nodes={flowNodes}
                    edges={flowEdges}
                    nodeTypes={flowNodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.15 }}
                    minZoom={0.1}
                    maxZoom={2}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
              ) : (
                <div className="flex h-[300px] flex-col items-center justify-center gap-3">
                  <p className="text-sm text-muted-foreground/60 italic">
                    {flowSource === "parsed" ? "未检测到路由结构" : "暂无数据"}
                  </p>
                  {flowSource === "parsed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={flowAiLoading}
                      onClick={async () => {
                        setFlowAiLoading(true);
                        setAiFlowData(null);
                        setAiFlowError(null);
                        try {
                          const res = await fetch("/api/ai/orchestration-analysis", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ routeTables }),
                          });
                          const data = await res.json();
                          if (data.error) {
                            setAiFlowError(data.error);
                          } else {
                            setAiFlowData(data.flowData);
                            setFlowSource("ai");
                          }
                        } catch {
                          setAiFlowError("请求失败");
                        } finally {
                          setFlowAiLoading(false);
                        }
                      }}
                    >
                      {flowAiLoading ? "分析中..." : "用 AI 生成编排分析"}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffViewer
// ---------------------------------------------------------------------------

function DiffViewer({ diff, compact }: { diff: string; compact?: boolean }) {
  if (!diff.trim()) {
    return <p className="py-2 text-xs italic text-muted-foreground/60">无文件变更</p>;
  }

  const lines = diff.split("\n");
  const maxH = compact ? "max-h-[200px]" : "max-h-[300px]";

  return (
    <div className={`my-1 overflow-auto rounded-md border bg-muted/10 font-mono text-xs ${maxH}`}>
      {lines.map((line, i) => {
        let className = "px-2 py-px whitespace-pre-wrap break-all";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          className += " bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          className += " bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300";
        } else if (line.startsWith("@@")) {
          className += " bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300";
        } else {
          className += " text-muted-foreground";
        }
        return (
          <div key={i} className={className}>
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}
