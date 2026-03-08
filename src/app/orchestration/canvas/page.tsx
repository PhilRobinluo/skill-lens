"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  addEdge,
  Handle,
  Position,
  NodeResizer,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type OnConnect,
  BackgroundVariant,
  Panel,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Search, Save, FolderOpen, Trash2, Plus, FilePlus, List, LayoutList, Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorMessage } from "@/components/error-message";
import { SkillDetailSheet } from "@/components/skill-detail-sheet";
import { useAutoRefresh } from "@/hooks/use-sse";
import { AIFlowDialog } from "@/components/ai-flow-dialog";
import { useSettings } from "@/hooks/use-settings";
import type { SkillEntry, FlowGenerationResponse } from "@/lib/types";
import { skillDisplayName } from "@/lib/utils";

// ── Types ──

interface SkillItem {
  id: string;
  name: string;
  description: string;
  source: string;
  domain: string[];
}

type SidebarViewMode = "compact" | "list" | "grouped";
const LS_SIDEBAR_VIEW = "draft-sidebar-view";

const SOURCE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  "self-built": { label: "自建", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  baoyu: { label: "宝玉", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  "plugin-official": { label: "官方", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  "plugin-community": { label: "社区", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
};

interface DraftSave {
  name: string;
  nodes: Node[];
  edges: Edge[];
  savedAt: string;
}

const LS_CURRENT_KEY = "skill-manager-draft-current";

// ── Custom Node ──

function SkillNode({ data }: { data: { label: string; source: string; description: string } }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-sm min-w-[180px] max-w-[240px]">
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-muted-foreground/40 !border-background" />
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium truncate">{data.label}</span>
        <Badge variant="outline" className="text-[9px] shrink-0">{data.source}</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2">{data.description}</p>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-muted-foreground/40 !border-background" />
    </div>
  );
}

function GroupNode({ id, data, selected }: { id: string; data: { label: string }; selected?: boolean }) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(data.label);
  }, [data.label]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== data.label) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n,
        ),
      );
    } else {
      setDraft(data.label);
    }
  }

  return (
    <div className="w-full h-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 pt-2 pb-4">
      <NodeResizer
        minWidth={250}
        minHeight={150}
        isVisible={!!selected}
        lineClassName="!border-primary/40"
        handleClassName="!w-2 !h-2 !bg-primary/60 !border-background"
      />
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-primary/30 !border-background" />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(data.label); setEditing(false); }
          }}
          className="text-xs font-semibold text-primary/70 bg-transparent border-b border-primary/40 outline-none w-[200px]"
        />
      ) : (
        <span
          className="text-xs font-semibold text-primary/70 cursor-text"
          onDoubleClick={() => setEditing(true)}
        >
          {data.label}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-primary/30 !border-background" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  skill: SkillNode,
  group: GroupNode,
};

// ── Sidebar Group ──

function SidebarGroup({
  label,
  count,
  items,
  onDragStart,
  onAdd,
}: {
  label: string;
  count: number;
  items: SkillItem[];
  onDragStart: (e: React.DragEvent, item: SkillItem) => void;
  onAdd: (item: SkillItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-muted-foreground">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="text-xs font-semibold">{label}</span>
        <Badge variant="secondary" className="text-[9px] ml-auto px-1">{count}</Badge>
      </button>
      {expanded && (
        <div className="border-t divide-y">
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              className="flex items-center gap-2 px-2 py-1 cursor-grab active:cursor-grabbing hover:bg-accent/30 transition-colors"
            >
              <span className="text-xs truncate flex-1">{skillDisplayName(item.name)}</span>
              <button
                type="button"
                onClick={() => onAdd(item)}
                className="shrink-0 rounded p-0.5 hover:bg-primary/10 text-muted-foreground hover:text-primary"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page (wrapped in ReactFlowProvider) ──

export default function DraftPage() {
  return (
    <ReactFlowProvider>
      <DraftPageInner />
    </ReactFlowProvider>
  );
}

function DraftPageInner() {
  const [skillItems, setSkillItems] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sidebarView, setSidebarView] = useState<SidebarViewMode>(() => {
    if (typeof window === "undefined") return "compact";
    return (localStorage.getItem(LS_SIDEBAR_VIEW) as SidebarViewMode) || "compact";
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [saves, setSaves] = useState<DraftSave[]>([]);
  const [currentName, setCurrentName] = useState("未命名草稿");

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReturnType<typeof Object> | null>(null);

  // Skill detail sheet
  const [detailSkill, setDetailSkill] = useState<SkillEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // AI flow dialog
  const [aiFlowOpen, setAiFlowOpen] = useState(false);
  const { status: settingsStatus } = useSettings();

  const openSkillDetail = useCallback(async (skillName: string) => {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`);
      if (!res.ok) return;
      const data = await res.json();
      // API returns skill object directly (not wrapped)
      setDetailSkill(data as SkillEntry);
      setDetailOpen(true);
    } catch { /* ignore */ }
  }, []);

  // ── Fetch skills ──

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/draft-sources");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSkillItems(
        (data.skills as Array<{ id: string; name: string; description: string; source: string; domain: string[] }>)
          .map((s) => ({ id: s.id, name: s.name, description: s.description, source: s.source, domain: s.domain ?? [] }))
      );
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);
  useAutoRefresh(fetchSources);

  // ── Load saves from server (with localStorage migration) ──

  useEffect(() => {
    async function loadDrafts() {
      try {
        const res = await fetch("/api/drafts");
        if (res.ok) {
          const data = await res.json();
          const serverDrafts = data.drafts as DraftSave[];

          // Migrate from localStorage if server has no drafts
          if (serverDrafts.length === 0) {
            const lsRaw = localStorage.getItem("skill-manager-drafts");
            if (lsRaw) {
              const lsDrafts = JSON.parse(lsRaw) as DraftSave[];
              for (const d of lsDrafts) {
                await fetch("/api/drafts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(d),
                });
              }
              localStorage.removeItem("skill-manager-drafts");
              // Re-fetch after migration
              const res2 = await fetch("/api/drafts");
              if (res2.ok) {
                const data2 = await res2.json();
                setSaves(data2.drafts as DraftSave[]);
              }
            }
          } else {
            setSaves(serverDrafts);
          }
        }
      } catch { /* ignore, fall through to localStorage recovery */ }

      // Crash recovery: restore current editing state from localStorage
      try {
        const current = localStorage.getItem(LS_CURRENT_KEY);
        if (current) {
          const parsed = JSON.parse(current) as DraftSave;
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
          setCurrentName(parsed.name);
        }
      } catch { /* ignore */ }
    }

    loadDrafts();
  }, [setNodes, setEdges]);

  // ── Auto-save current state (localStorage for crash recovery + server debounced) ──

  useEffect(() => {
    const timer = setTimeout(() => {
      if (nodes.length === 0 && edges.length === 0) return;
      const save: DraftSave = { name: currentName, nodes, edges, savedAt: new Date().toISOString() };
      // Fast local cache for crash recovery
      localStorage.setItem(LS_CURRENT_KEY, JSON.stringify(save));
      // Debounced server persist
      fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(save),
      }).then((res) => {
        if (res.ok) return res.json();
      }).then((data) => {
        if (data?.drafts) setSaves(data.drafts);
      }).catch(() => { /* silent — localStorage is the safety net */ });
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, edges, currentName]);

  // ── Filtered sidebar ──

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skillItems;
    return skillItems.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [skillItems, query]);

  // ── Grouped by source ──

  const groupedBySource = useMemo(() => {
    const groups = new Map<string, SkillItem[]>();
    for (const item of filtered) {
      const src = item.source;
      if (!groups.has(src)) groups.set(src, []);
      groups.get(src)!.push(item);
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  // ── Connect edges ──

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  // ── Add skill node to canvas ──

  function addSkillToCanvas(item: SkillItem) {
    const existingCount = nodes.length;
    const col = existingCount % 4;
    const row = Math.floor(existingCount / 4);

    const newNode: Node = {
      id: `skill-${item.name}-${Date.now()}`,
      type: "skill",
      position: { x: 80 + col * 280, y: 80 + row * 140 },
      data: { label: skillDisplayName(item.name), source: item.source, description: item.description },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  // ── Add group node ──

  function addGroup() {
    const newNode: Node = {
      id: `group-${Date.now()}`,
      type: "group",
      position: { x: 60, y: 60 },
      data: { label: "新分组" },
      style: { width: 400, height: 300, zIndex: -1 },
      zIndex: -1,
    };
    setNodes((nds) => [newNode, ...nds]);
  }

  // ── Drag from sidebar ──

  function onDragStart(event: React.DragEvent, item: SkillItem) {
    event.dataTransfer.setData("application/skill-json", JSON.stringify(item));
    event.dataTransfer.effectAllowed = "move";
  }

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/skill-json");
      if (!raw) return;

      const item: SkillItem = JSON.parse(raw);
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds || !reactFlowInstance) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const position = (reactFlowInstance as any).screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `skill-${item.name}-${Date.now()}`,
        type: "skill",
        position,
        data: { label: skillDisplayName(item.name), source: item.source, description: item.description },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes],
  );

  // ── Save / Load / Clear ──

  function saveDraft() {
    const save: DraftSave = { name: currentName, nodes, edges, savedAt: new Date().toISOString() };
    // Optimistic local update
    const updated = [save, ...saves.filter((s) => s.name !== currentName)].slice(0, 20);
    setSaves(updated);
    localStorage.setItem(LS_CURRENT_KEY, JSON.stringify(save));
    // Persist to server
    fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(save),
    }).then((res) => {
      if (res.ok) return res.json();
    }).then((data) => {
      if (data?.drafts) setSaves(data.drafts);
    }).catch(() => {});
  }

  function loadDraft(save: DraftSave) {
    setNodes(save.nodes);
    setEdges(save.edges);
    setCurrentName(save.name);
    localStorage.setItem(LS_CURRENT_KEY, JSON.stringify(save));
  }

  function removeDraft(name: string) {
    // Optimistic local update
    setSaves((prev) => prev.filter((s) => s.name !== name));
    // Persist to server
    fetch(`/api/drafts?name=${encodeURIComponent(name)}`, { method: "DELETE" })
      .then((res) => {
        if (res.ok) return res.json();
      })
      .then((data) => {
        if (data?.drafts) setSaves(data.drafts);
      })
      .catch(() => {});
  }

  function clearCanvas() {
    setNodes([]);
    setEdges([]);
    localStorage.removeItem(LS_CURRENT_KEY);
  }

  function handleAiFlowGenerated(response: FlowGenerationResponse) {
    const newNodes: Node[] = response.nodes.map((n) => ({
      id: `skill-${n.skillName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "skill",
      position: { x: n.x, y: n.y },
      data: {
        label: skillDisplayName(n.skillName),
        source: skillItems.find((s) => s.name === n.skillName)?.source ?? "self-built",
        description: n.label,
      },
    }));

    // Build a map from skillName to node id for edge connections
    const nameToId = new Map<string, string>();
    for (let i = 0; i < response.nodes.length; i++) {
      nameToId.set(response.nodes[i].skillName, newNodes[i].id);
    }

    const newEdges: Edge[] = response.edges
      .filter((e) => nameToId.has(e.source) && nameToId.has(e.target))
      .map((e) => ({
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: nameToId.get(e.source)!,
        target: nameToId.get(e.target)!,
        type: "smoothstep",
        animated: true,
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed },
      }));

    setNodes(newNodes);
    setEdges(newEdges);
    setCurrentName(response.summary || "AI 生成的流程");
  }

  const newDraftCounter = useRef(1);

  function newDraft() {
    setNodes([]);
    setEdges([]);
    const name = `未命名草稿 ${newDraftCounter.current++}`;
    setCurrentName(name);
    localStorage.removeItem(LS_CURRENT_KEY);
  }

  // ── Render ──

  if (loading) return <LoadingSpinner text="Loading skills..." />;
  if (error && skillItems.length === 0) return <ErrorMessage message={error} onRetry={fetchSources} />;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Page description */}
      <div className="border-b px-4 py-2">
        <h1 className="text-lg font-bold tracking-tight">编排</h1>
        <p className="text-xs text-muted-foreground">拖拽技能到画布，连线组合工作流，保存为草稿方案</p>
      </div>

      <div className="flex flex-1 min-h-0">
      {/* ── Sidebar ── */}
      <aside className="w-[280px] shrink-0 border-r bg-background/70 flex flex-col">
        <div className="p-3 space-y-2 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">技能列表</h2>
            <div className="flex items-center rounded-md border">
              {([
                { mode: "compact" as const, icon: List, title: "紧凑" },
                { mode: "list" as const, icon: LayoutList, title: "列表" },
                { mode: "grouped" as const, icon: Layers, title: "分组" },
              ]).map(({ mode, icon: Icon, title }) => (
                <button
                  key={mode}
                  type="button"
                  title={title}
                  className={`p-1 ${sidebarView === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                  onClick={() => {
                    setSidebarView(mode);
                    localStorage.setItem(LS_SIDEBAR_VIEW, mode);
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 Skill..."
              className="h-8 pl-7 text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            点击 + 添加，或拖拽到画布 · 共 {filtered.length} 个
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Compact view */}
          {sidebarView === "compact" && filtered.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              className="flex items-start gap-2 rounded-md border bg-card px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0" onClick={() => openSkillDetail(item.name)} role="button" tabIndex={0} onKeyDown={() => {}}>
                <p className="text-xs font-medium truncate cursor-pointer hover:underline">{skillDisplayName(item.name)}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{item.description || "无描述"}</p>
              </div>
              <button
                type="button"
                onClick={() => addSkillToCanvas(item)}
                className="shrink-0 rounded p-0.5 hover:bg-primary/10 text-muted-foreground hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* List view */}
          {sidebarView === "list" && filtered.map((item) => {
            const srcStyle = SOURCE_BADGE_STYLES[item.source];
            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className="flex flex-col gap-1 rounded-md border bg-card px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium truncate flex-1 cursor-pointer hover:underline" onClick={() => openSkillDetail(item.name)}>{skillDisplayName(item.name)}</p>
                  <button
                    type="button"
                    onClick={() => addSkillToCanvas(item)}
                    className="shrink-0 rounded p-0.5 hover:bg-primary/10 text-muted-foreground hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {srcStyle && (
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${srcStyle.className}`}>
                      {srcStyle.label}
                    </Badge>
                  )}
                  {item.domain.slice(0, 2).map((d) => (
                    <Badge key={d} variant="secondary" className="text-[9px] px-1 py-0">
                      {d}
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{item.description || "无描述"}</p>
              </div>
            );
          })}

          {/* Grouped view */}
          {sidebarView === "grouped" && groupedBySource.map(([source, items]) => {
            const srcStyle = SOURCE_BADGE_STYLES[source];
            return (
              <SidebarGroup
                key={source}
                label={srcStyle?.label ?? source}
                count={items.length}
                items={items}
                onDragStart={onDragStart}
                onAdd={addSkillToCanvas}
              />
            );
          })}
        </div>
      </aside>

      {/* ── Canvas ── */}
      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance as (instance: unknown) => void}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeClick={(_event, node) => {
            if (node.type === "skill" && node.data?.label) {
              openSkillDetail(node.data.label as string);
            }
          }}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[20, 20]}
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls position="bottom-right" />
          <MiniMap
            position="bottom-left"
            className="!bg-muted/50 !border rounded-lg"
            nodeStrokeWidth={3}
          />

          {/* Top toolbar */}
          <Panel position="top-left" className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={newDraft}>
              <FilePlus className="h-3.5 w-3.5" />
              新建
            </Button>
            <Input
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              className="h-8 w-[160px] text-sm font-medium bg-background"
            />
            <Button size="sm" variant="default" className="h-8 gap-1" onClick={saveDraft}>
              <Save className="h-3.5 w-3.5" />
              保存
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1">
                  <FolderOpen className="h-3.5 w-3.5" />
                  草稿
                  {saves.length > 0 && (
                    <Badge variant="secondary" className="text-[9px] ml-0.5 px-1">{saves.length}</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel className="text-xs">已保存的草稿</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-1.5 text-xs" onClick={newDraft}>
                  <FilePlus className="h-3.5 w-3.5" />
                  新建草稿
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {saves.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    暂无保存的草稿
                  </div>
                ) : (
                  saves.map((s) => (
                    <DropdownMenuItem
                      key={s.name}
                      className={`flex items-center justify-between gap-2 ${s.name === currentName ? "bg-accent" : ""}`}
                      onClick={() => loadDraft(s)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.nodes.length} 节点 · {new Date(s.savedAt).toLocaleString("zh-CN")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); removeDraft(s.name); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </Panel>

          <Panel position="top-right" className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => setAiFlowOpen(true)}
              disabled={!settingsStatus?.hasApiKey}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI 生成
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addGroup}>
              <Plus className="h-3.5 w-3.5" />
              分组
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-muted-foreground hover:text-destructive"
              onClick={clearCanvas}
              disabled={nodes.length === 0 && edges.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </Button>
            <div className="text-[10px] text-muted-foreground bg-background/80 px-2 py-1 rounded border">
              {nodes.length} 节点 · {edges.length} 连线
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Skill Detail Sheet */}
      <SkillDetailSheet
        skill={detailSkill}
        allSkillNames={skillItems.map((s) => s.name)}
        allDomains={Array.from(new Set(skillItems.flatMap((s) => s.domain))).sort()}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={fetchSources}
      />

      {/* AI Flow Dialog */}
      <AIFlowDialog
        open={aiFlowOpen}
        onOpenChange={setAiFlowOpen}
        hasApiKey={settingsStatus?.hasApiKey ?? false}
        onGenerated={handleAiFlowGenerated}
      />
      </div>
    </div>
  );
}
