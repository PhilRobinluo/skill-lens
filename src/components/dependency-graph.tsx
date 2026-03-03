"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import type { SkillEntry } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Color mapping by source                                            */
/* ------------------------------------------------------------------ */

const SOURCE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "self-built": { bg: "#f1f5f9", border: "#94a3b8", text: "#334155" },
  baoyu: { bg: "#faf5ff", border: "#a855f7", text: "#6b21a8" },
  "plugin-official": { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
  "plugin-community": { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
};

const ORPHAN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "self-built": { bg: "#f8fafc", border: "#cbd5e1", text: "#94a3b8" },
  baoyu: { bg: "#fdf8ff", border: "#d8b4fe", text: "#c084fc" },
  "plugin-official": { bg: "#f7fef9", border: "#86efac", text: "#86efac" },
  "plugin-community": { bg: "#f5f9ff", border: "#93c5fd", text: "#93c5fd" },
};

/* ------------------------------------------------------------------ */
/*  Dagre auto-layout                                                  */
/* ------------------------------------------------------------------ */

function layoutElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 100 });

  nodes.forEach((node) => g.setNode(node.id, { width: 180, height: 44 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  Dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - 90, y: pos.y - 22 },
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GraphView = "dependencies" | "claudemd";

interface DependencyGraphProps {
  skills: SkillEntry[];
  view: GraphView;
  onNodeClick?: (skillName: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DependencyGraph({
  skills,
  view,
  onNodeClick,
}: DependencyGraphProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Build a lookup map
  const skillMap = useMemo(
    () => new Map(skills.map((s) => [s.name, s])),
    [skills],
  );

  // Build the set of all skills that have pipeline tags
  const pipelineSkills = useMemo(
    () => new Set(skills.filter((s) => s.tags.pipeline).map((s) => s.name)),
    [skills],
  );

  // Build edges based on the current view
  const rawEdges: Edge[] = useMemo(() => {
    if (view === "dependencies") {
      const edges: Edge[] = [];
      for (const skill of skills) {
        for (const dep of skill.dependencies) {
          edges.push({
            id: `${dep}->${skill.name}`,
            source: dep,
            target: skill.name,
            animated: pipelineSkills.has(dep) && pipelineSkills.has(skill.name),
            style: { stroke: "#94a3b8", strokeWidth: 1.5 },
          });
        }
      }
      return edges;
    }

    // claudemd view: group by table name
    const edges: Edge[] = [];
    const tableNodes = new Map<string, string>(); // table name -> node id

    for (const skill of skills) {
      for (const ref of skill.claudeMdRefs) {
        const tableId = `table::${ref.table}`;
        tableNodes.set(ref.table, tableId);
        edges.push({
          id: `${tableId}->${skill.name}`,
          source: tableId,
          target: skill.name,
          style: { stroke: "#a855f7", strokeWidth: 1.5 },
        });
      }
    }
    return edges;
  }, [skills, view, pipelineSkills]);

  // Determine connected nodes for orphan detection
  const connectedNodes = useMemo(() => {
    const set = new Set<string>();
    for (const edge of rawEdges) {
      set.add(edge.source);
      set.add(edge.target);
    }
    return set;
  }, [rawEdges]);

  // Build nodes
  const rawNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [];

    if (view === "dependencies") {
      for (const skill of skills) {
        const isOrphan =
          !connectedNodes.has(skill.name) && skill.claudeMdRefs.length === 0;
        const colors = isOrphan
          ? ORPHAN_COLORS[skill.source] ?? ORPHAN_COLORS["self-built"]
          : SOURCE_COLORS[skill.source] ?? SOURCE_COLORS["self-built"];

        // Node size based on connection count
        const connectionCount =
          skill.dependencies.length +
          skills.filter((s) => s.dependencies.includes(skill.name)).length;
        const baseWidth = 180;
        const width = baseWidth + Math.min(connectionCount * 10, 60);

        nodes.push({
          id: skill.name,
          position: { x: 0, y: 0 },
          data: {
            label: skill.name,
            source: skill.source,
            isOrphan,
          },
          style: {
            background: colors.bg,
            border: `2px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 500,
            color: colors.text,
            width: `${width}px`,
            cursor: "pointer",
          },
        });
      }

      // Add dependency nodes that aren't in the skill list (external refs)
      for (const skill of skills) {
        for (const dep of skill.dependencies) {
          if (!skillMap.has(dep)) {
            nodes.push({
              id: dep,
              position: { x: 0, y: 0 },
              data: { label: `${dep} (missing)`, source: "unknown", isOrphan: false },
              style: {
                background: "#fef2f2",
                border: "2px dashed #ef4444",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#991b1b",
                width: "180px",
              },
            });
          }
        }
      }
    } else {
      // claudemd view: create table group nodes + skill nodes
      const tables = new Map<string, string[]>();
      for (const skill of skills) {
        for (const ref of skill.claudeMdRefs) {
          if (!tables.has(ref.table)) tables.set(ref.table, []);
          tables.get(ref.table)!.push(skill.name);
        }
      }

      // Table nodes
      for (const [table] of tables) {
        nodes.push({
          id: `table::${table}`,
          position: { x: 0, y: 0 },
          data: { label: table },
          style: {
            background: "#faf5ff",
            border: "2px solid #a855f7",
            borderRadius: "12px",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: 700,
            color: "#6b21a8",
            width: "220px",
            textAlign: "center" as const,
          },
        });
      }

      // Skill nodes
      for (const skill of skills) {
        const isOrphan = skill.claudeMdRefs.length === 0;
        const colors = isOrphan
          ? ORPHAN_COLORS[skill.source] ?? ORPHAN_COLORS["self-built"]
          : SOURCE_COLORS[skill.source] ?? SOURCE_COLORS["self-built"];

        nodes.push({
          id: skill.name,
          position: { x: 0, y: 0 },
          data: { label: skill.name, source: skill.source, isOrphan },
          style: {
            background: colors.bg,
            border: `2px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 500,
            color: colors.text,
            width: "180px",
            cursor: "pointer",
          },
        });
      }
    }

    return nodes;
  }, [skills, skillMap, view, connectedNodes]);

  // Apply layout
  const layoutedNodes = useMemo(
    () => layoutElements(rawNodes, rawEdges, "TB"),
    [rawNodes, rawEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  // Re-layout when data changes
  useMemo(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  // Hover highlighting
  const connectedToHovered = useMemo(() => {
    if (!hoveredNodeId) return null;
    const connected = new Set<string>([hoveredNodeId]);
    for (const edge of rawEdges) {
      if (edge.source === hoveredNodeId) connected.add(edge.target);
      if (edge.target === hoveredNodeId) connected.add(edge.source);
    }
    return connected;
  }, [hoveredNodeId, rawEdges]);

  // Apply hover dimming
  const displayNodes = useMemo(() => {
    if (!connectedToHovered) return nodes;
    return nodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        opacity: connectedToHovered.has(node.id) ? 1 : 0.2,
        transition: "opacity 0.2s ease",
      },
    }));
  }, [nodes, connectedToHovered]);

  const displayEdges = useMemo(() => {
    if (!connectedToHovered) return edges;
    return edges.map((edge) => ({
      ...edge,
      style: {
        ...edge.style,
        opacity:
          connectedToHovered.has(edge.source) &&
          connectedToHovered.has(edge.target)
            ? 1
            : 0.1,
        transition: "opacity 0.2s ease",
      },
    }));
  }, [edges, connectedToHovered]);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      // Don't navigate for table nodes
      if (node.id.startsWith("table::")) return;
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  // Stats
  const stats = useMemo(() => {
    const orphanCount = skills.filter(
      (s) =>
        !connectedNodes.has(s.name) &&
        s.claudeMdRefs.length === 0 &&
        s.dependencies.length === 0,
    ).length;
    return {
      nodes: rawNodes.length,
      edges: rawEdges.length,
      orphans: orphanCount,
    };
  }, [skills, rawNodes, rawEdges, connectedNodes]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            const source = node.data?.source as string;
            if (source === "baoyu") return "#a855f7";
            if (source === "plugin-official") return "#22c55e";
            if (source === "plugin-community") return "#3b82f6";
            if (node.id.startsWith("table::")) return "#a855f7";
            return "#94a3b8";
          }}
          maskColor="rgba(0,0,0,0.08)"
          style={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      </ReactFlow>

      {/* Stats bar */}
      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border bg-background/90 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
        <span className="font-medium text-foreground">{stats.nodes}</span> nodes
        <span className="mx-2 text-border">|</span>
        <span className="font-medium text-foreground">{stats.edges}</span> edges
        <span className="mx-2 text-border">|</span>
        <span className="font-medium text-foreground">{stats.orphans}</span> orphans
      </div>

      {/* Legend */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 rounded-lg border bg-background/90 px-3 py-2 text-xs backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: "#94a3b8", background: "#f1f5f9" }} />
          self-built
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: "#a855f7", background: "#faf5ff" }} />
          baoyu
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: "#22c55e", background: "#f0fdf4" }} />
          official
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: "#3b82f6", background: "#eff6ff" }} />
          community
        </div>
        {view === "dependencies" && (
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm border-2 border-dashed" style={{ borderColor: "#ef4444", background: "#fef2f2" }} />
            missing
          </div>
        )}
      </div>
    </div>
  );
}
